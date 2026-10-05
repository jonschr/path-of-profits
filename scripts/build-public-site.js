const fs = require('node:fs');
const path = require('node:path');

function removeLocalLinks(html, pages) {
  return html.replace(/<a\b([^>]*)>[\s\S]*?<\/a\s*>/gi, (anchor, attributes) => {
    const href = attributes.match(/\bhref\s*=\s*(["'])(.*?)\1/i)?.[2];
    if (!href || href.startsWith('#')) return anchor;
    const url = new URL(href.replace(/&amp;/g, '&'), 'https://pathofprofits.com/');
    if (url.origin !== 'https://pathofprofits.com') return anchor;
    const page = url.pathname === '/' ? 'index.html' : url.pathname.endsWith('.html') ? decodeURIComponent(url.pathname.slice(1)) : null;
    return page && pages[page]?.published !== true ? '' : anchor;
  });
}

function buildPublicSite({ root = path.resolve(__dirname, '..'), output = path.join(root, '.public-site') } = {}) {
  root = path.resolve(root);
  output = path.resolve(output);
  if (output === root || root.startsWith(`${output}${path.sep}`)) throw new Error('Build output must be separate from the source directory.');
  const pages = JSON.parse(fs.readFileSync(path.join(root, 'site-pages.json'), 'utf8'));
  for (const [name, page] of Object.entries(pages)) {
    if (!/^[a-z0-9-]+\.html$/.test(name) || typeof page.published !== 'boolean') throw new Error(`Invalid page flag: ${name}`);
    if (page.published && !fs.existsSync(path.join(root, name))) throw new Error(`Published page is missing: ${name}`);
  }
  if (!pages['index.html']?.published) throw new Error('The homepage must be published.');
  fs.rmSync(output, { recursive: true, force: true });
  fs.mkdirSync(output, { recursive: true });
  const published = Object.fromEntries(Object.entries(pages).filter(([, page]) => page.published));
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const name = entry.name;
    const ext = path.extname(name);
    if (ext === '.html') {
      if (!published[name]) continue;
      const html = removeLocalLinks(fs.readFileSync(path.join(root, name), 'utf8'), pages)
        .replace(/<body\b/, '<body data-page-visibility="published"');
      fs.writeFileSync(path.join(output, name), html);
    } else if (name === 'site-pages.json') {
      fs.writeFileSync(path.join(output, name), `${JSON.stringify(published, null, 2)}\n`);
    } else if ((['.js', '.css', '.json'].includes(ext) && name !== 'server.js') || name === 'CNAME') {
      fs.copyFileSync(path.join(root, name), path.join(output, name));
    }
  }
  for (const directory of ['modules', 'data', 'assets']) {
    const source = path.join(root, directory);
    if (fs.existsSync(source)) fs.cpSync(source, path.join(output, directory), { recursive: true, filter: (name) => !path.basename(name).startsWith('.') });
  }
  fs.writeFileSync(path.join(output, '.nojekyll'), '');
  return { output, published: Object.keys(published), localOnly: fs.readdirSync(root).filter((name) => name.endsWith('.html') && !published[name]) };
}

if (require.main === module) {
  const result = buildPublicSite();
  console.log(`Public site built in ${result.output}: ${result.published.length} published pages; ${result.localOnly.length} local-only pages excluded.`);
}

module.exports = { buildPublicSite, removeLocalLinks };
