const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const PORT = Number(process.env.PORT) || 5173;
const ROOT = process.cwd();
const TARGET_HOST = 'www.pathofexile.com';
const POE_NINJA_HOST = 'poe.ninja';
const BUILD_SCRIPT_SEQUENCE = ['scripts/update-data-ninja.js', 'scripts/update-exchange-data.js', 'scripts/update-breachstone-data.js'];

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml'
};

function serveFile(res, filePath) {
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const type = MIME[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': type });
    res.end(data);
  });
}

function proxyRequest(req, res, host) {
  const MAX_REDIRECTS = 3;

  const forward = (url, redirectsLeft) => {
    const targetUrl = new URL(url);
    const headers = { ...req.headers };
    headers.host = targetUrl.host;
    delete headers.origin;
    delete headers.referer;
    headers['user-agent'] = 'Path of Profits (https://pathofprofits.com)';

    const options = {
      method: req.method,
      headers,
      hostname: targetUrl.hostname,
      path: targetUrl.pathname + targetUrl.search
    };

    const proxy = https.request(options, (proxyRes) => {
      const status = proxyRes.statusCode || 500;
      const location = proxyRes.headers.location;

      if (location && [301, 302, 303, 307, 308].includes(status) && redirectsLeft > 0) {
        const nextUrl = location.startsWith('http') ? location : `https://${targetUrl.host}${location}`;
        proxyRes.resume();
        forward(nextUrl, redirectsLeft - 1);
        return;
      }

      const outHeaders = { ...proxyRes.headers };
      outHeaders['access-control-allow-origin'] = '*';
      res.writeHead(status, outHeaders);
      proxyRes.pipe(res);
    });

    proxy.on('error', (err) => {
      res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(`Proxy error: ${err.message}`);
    });

    req.pipe(proxy);
  };

  const initialUrl = new URL(`https://${host}${req.url}`);
  forward(initialUrl.toString(), MAX_REDIRECTS);
}

function tailLines(text, maxLines = 60) {
  const lines = String(text || '').split(/\r?\n/).filter(Boolean);
  if (lines.length <= maxLines) return lines;
  return lines.slice(lines.length - maxLines);
}

function runNodeScript(scriptPath, args = []) {
  return new Promise((resolve, reject) => {
    const fullPath = path.join(ROOT, scriptPath);
    const child = spawn(process.execPath, [fullPath, ...args], {
      cwd: ROOT,
      env: process.env
    });

    let stdout = '';
    let stderr = '';
    const MAX_CAPTURE = 400000;

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
      if (stdout.length > MAX_CAPTURE) stdout = stdout.slice(-MAX_CAPTURE);
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
      if (stderr.length > MAX_CAPTURE) stderr = stderr.slice(-MAX_CAPTURE);
    });

    child.on('error', (err) => {
      reject(err);
    });

    child.on('close', (code) => {
      const output = [stdout, stderr].filter(Boolean).join('\n');
      if (code === 0) {
        resolve({
          script: scriptPath,
          code,
          lines: tailLines(output)
        });
        return;
      }
      const error = new Error(`Build step failed: ${scriptPath} (exit ${code})`);
      error.script = scriptPath;
      error.code = code;
      error.lines = tailLines(output);
      reject(error);
    });
  });
}

let activeBuild = null;
let activeBreachRefresh = null;

async function runStaticBuild() {
  const startedAt = Date.now();
  const results = [];
  for (const scriptPath of BUILD_SCRIPT_SEQUENCE) {
    const step = await runNodeScript(scriptPath);
    results.push(step);
  }
  return {
    ok: true,
    durationMs: Date.now() - startedAt,
    steps: results
  };
}

const server = http.createServer((req, res) => {
  const reqPath = req.url.split('?')[0];

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'access-control-allow-headers': 'content-type'
    });
    res.end();
    return;
  }

  if (reqPath === '/api/local/breachstone-prices' && req.method === 'POST') {
    const league = new URL(req.url, 'http://localhost').searchParams.get('league');
    const reply = (status, data) => {
      res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify(data));
    };
    if (!league) { reply(400, { error: 'Choose a PoE2 league.' }); return; }
    if (activeBuild || activeBreachRefresh) { reply(409, { error: 'A data refresh is already running. Try again after it finishes.' }); return; }
    activeBreachRefresh = (async () => {
      await runNodeScript('scripts/update-exchange-data.js', ['--game=poe2']);
      await runNodeScript('scripts/update-breachstone-data.js', [`--league=${league}`]);
    })();
    activeBreachRefresh.then(() => {
      reply(200, JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'breachstone-prices-poe2.json'), 'utf8')));
    }).catch((error) => reply(502, { error: error.message })).finally(() => { activeBreachRefresh = null; });
    return;
  }

  if (reqPath === '/api/local/build-static') {
    if (req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({
        ok: true,
        available: true,
        busy: Boolean(activeBuild),
        steps: BUILD_SCRIPT_SEQUENCE
      }));
      return;
    }
    if (req.method !== 'POST') {
      res.writeHead(405, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: false, error: 'Method not allowed. Use GET or POST.' }));
      return;
    }
    if (activeBuild) {
      res.writeHead(409, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: false, error: 'Build already in progress.' }));
      return;
    }
    if (activeBreachRefresh) {
      res.writeHead(409, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Breachstone prices are currently refreshing.' }));
      return;
    }
    activeBuild = runStaticBuild();
    activeBuild
      .then((payload) => {
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify(payload));
      })
      .catch((err) => {
        res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({
          ok: false,
          error: err?.message || 'Build failed',
          script: err?.script || null,
          code: Number.isFinite(err?.code) ? err.code : null,
          lines: Array.isArray(err?.lines) ? err.lines : []
        }));
      })
      .finally(() => {
        activeBuild = null;
      });
    return;
  }

  if (req.url.startsWith('/api/trade/')) {
    proxyRequest(req, res, TARGET_HOST);
    return;
  }

  if (req.url.startsWith('/api/poeninja/')) {
    req.url = req.url.replace('/api/poeninja', '');
    proxyRequest(req, res, POE_NINJA_HOST);
    return;
  }

  if (req.url.startsWith('/poe1/')) {
    proxyRequest(req, res, POE_NINJA_HOST);
    return;
  }

  let filePath = req.url.split('?')[0];
  if (filePath === '/') filePath = '/index.html';
  filePath = path.join(ROOT, decodeURIComponent(filePath));

  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Forbidden');
    return;
  }

  serveFile(res, filePath);
});

server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
