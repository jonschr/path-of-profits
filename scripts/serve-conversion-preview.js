// Read-only mobile preview of the app and its public data. Local write APIs stay private.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const files = new Set([
  'index.html', 'gem-leveling.html', 'currency-exchange.html', 'currency-exchange-poe2.html', 'breachstone-flip.html',
  'unique-assembly.html', 'legacy-crafting.html', 'socket-extraction.html', 'recycling-flips.html', 'socket-extraction.js',
  'conversions.html', 'conversions-poe2.html', 'harvest-flips.html', 'scarab-flips.html', 'links.html',
  'styles.css', 'conversion-tools.css', 'app.js', 'gem-leveling.js', 'currency-exchange.js',
  'breachstone-flip.js', 'conversion-tools.js', 'gambling-tools.js', 'links.js', 'boss-data.json', 'changelog.json',
  ...fs.readdirSync(path.join(root, 'modules')).filter((name) => name.endsWith('.js')).map((name) => `modules/${name}`)
]);
const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg' };
http.createServer((req, res) => {
  const name = new URL(req.url, 'http://localhost').pathname.slice(1) || 'index.html';
  const publicData = name.startsWith('data/') && name.endsWith('.json')
    && !name.split('/').some((part) => part.startsWith('.') || part.includes('%'));
  const publicPreview = /^assets\/link-previews\/[a-z0-9-]+\.(webp|png|jpg)$/.test(name);
  if (!['GET', 'HEAD'].includes(req.method) || (!files.has(name) && !publicData && !publicPreview)) {
    res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('Not found'); return;
  }
  fs.readFile(path.join(root, name), (error, content) => {
    if (error) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': `${types[path.extname(name)]}; charset=utf-8`, 'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' });
    res.end(req.method === 'HEAD' ? undefined : content);
  });
}).listen(5174, '127.0.0.1', () => console.log('Mobile preview ready at http://127.0.0.1:5174'));
