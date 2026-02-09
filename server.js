const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT) || 5173;
const ROOT = process.cwd();
const TARGET_HOST = 'www.pathofexile.com';
const POE_NINJA_HOST = 'poe.ninja';
const POE_WATCH_HOST = 'api.poe.watch';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
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

const server = http.createServer((req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'access-control-allow-headers': 'content-type'
    });
    res.end();
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

  if (req.url.startsWith('/api/poewatch/')) {
    req.url = req.url.replace('/api/poewatch', '');
    proxyRequest(req, res, POE_WATCH_HOST);
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
