const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { buildPublicSite, removeLocalLinks } = require('./build-public-site');

const source = path.resolve(__dirname, '..');
const flags = JSON.parse(fs.readFileSync(path.join(source, 'site-pages.json'), 'utf8'));
for (const name of fs.readdirSync(source).filter((name) => name.endsWith('.html'))) {
  assert.equal(typeof flags[name]?.published, 'boolean', `${name} needs an explicit page flag`);
  assert.match(fs.readFileSync(path.join(source, name), 'utf8'), /modules\/site-pages\.js/, `${name} needs preview controls`);
}

async function test() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pop-page-flags-'));
  let child;
  try {
    const pages = { 'index.html': { label: 'Home', published: true }, 'draft.html': { label: 'Draft', published: false } };
    fs.writeFileSync(path.join(root, 'site-pages.json'), JSON.stringify(pages));
    const html = '<!doctype html><body><a href="./">Home</a><a href="./draft.html?game=poe2#tools"><span>Draft</span></a><a href="https://pathofprofits.com/draft.html">Absolute draft</a><a href="%64raft.html">Encoded draft</a><a href="new.html">Unflagged</a><a href="#tools">Section</a><a href="https://example.com/draft.html">External</a></body>';
    fs.writeFileSync(path.join(root, 'index.html'), html);
    fs.writeFileSync(path.join(root, 'draft.html'), '<h1>Draft page contents</h1>');
    fs.writeFileSync(path.join(root, 'new.html'), '<h1>Unflagged page</h1>');
    fs.writeFileSync(path.join(root, 'server.js'), '// private development server');
    const result = buildPublicSite({ root });
    assert.deepEqual(result.published, ['index.html']);
    assert(!fs.existsSync(path.join(result.output, 'draft.html')), 'Draft pages must not be deployed');
    assert(!fs.existsSync(path.join(result.output, 'new.html')), 'Unflagged pages default to local-only');
    assert(!fs.existsSync(path.join(result.output, 'server.js')));
    const built = fs.readFileSync(path.join(result.output, 'index.html'), 'utf8');
    for (const label of ['<span>Draft</span>', 'Absolute draft', 'Encoded draft', 'Unflagged']) assert(!built.includes(label), `Remove local link: ${label}`);
    assert(!built.includes('new.html'));
    assert(built.includes('https://example.com/draft.html'), 'External links remain available');
    assert(built.includes('href="#tools"'));
    assert(built.includes('data-page-visibility="published"'));
    assert.deepEqual(Object.keys(JSON.parse(fs.readFileSync(path.join(result.output, 'site-pages.json'), 'utf8'))), ['index.html']);
    assert.equal(removeLocalLinks('<a href="gem-leveling.html?league=Standard">Gems</a>', flags), '<a href="gem-leveling.html?league=Standard">Gems</a>');

    const port = 18000 + Math.floor(Math.random() * 10000);
    child = spawn(process.execPath, [path.join(source, 'server.js')], { cwd: root, env: { ...process.env, PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe'] });
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Local server did not start')), 5000);
      child.once('error', reject);
      child.once('exit', (code) => { clearTimeout(timeout); reject(new Error(`Local server exited: ${code}`)); });
      child.stdout.once('data', () => { clearTimeout(timeout); resolve(); });
    });
    const base = `http://localhost:${port}`;
    const publicHeaders = { Cookie: 'popPageView=public' };
    assert.equal((await fetch(`${base}/draft.html`)).status, 200);
    assert.equal((await fetch(`${base}/draft.html?game=poe2`, { headers: publicHeaders })).status, 404);
    assert.equal((await fetch(`${base}/%64raft.html`, { headers: publicHeaders })).status, 404);
    assert.equal((await fetch(`${base}/new.html`, { headers: publicHeaders })).status, 404);
    assert.equal((await fetch(`${base}/`, { headers: publicHeaders })).status, 200);
    const initial = await (await fetch(`${base}/api/local/pages`)).json();
    assert.equal(initial.pages['new.html'].published, false);
    const save = (body, origin = base) => fetch(`${base}/api/local/pages`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin }, body: JSON.stringify(body)
    });
    assert.equal((await save({ page: 'draft.html', published: true }, 'https://example.com')).status, 403);
    assert.equal((await save({ page: '../escape.html', published: true })).status, 400);
    assert.equal((await save({ page: 'draft.html', published: 'false' })).status, 400);
    assert.equal((await save({ page: 'index.html', published: false })).status, 400);
    assert.equal((await save({ page: 'draft.html', published: true })).status, 200);
    assert.equal(JSON.parse(fs.readFileSync(path.join(root, 'site-pages.json'), 'utf8'))['draft.html'].published, true);
    assert.equal((await fetch(`${base}/draft.html`, { headers: publicHeaders })).status, 200);
    buildPublicSite({ root });
    assert(fs.existsSync(path.join(result.output, 'draft.html')), 'Promoted pages are included on the next build');
    assert(fs.readFileSync(path.join(result.output, 'index.html'), 'utf8').includes('./draft.html?game=poe2#tools'));
    assert.equal((await save({ page: 'draft.html', published: false })).status, 200);
    buildPublicSite({ root });
    assert(!fs.existsSync(path.join(result.output, 'draft.html')), 'Demoted pages are removed from previous builds');
    assert.equal((await fetch(`${base}/draft.html`, { headers: publicHeaders })).status, 404);
    console.log('Page flags, saved changes, direct URL blocking, and public build checks passed.');
  } finally {
    if (child && child.exitCode === null) {
      child.kill();
      await new Promise((resolve) => child.once('exit', resolve));
    }
    fs.rmSync(root, { recursive: true, force: true });
  }
}

test().catch((error) => { console.error(error); process.exitCode = 1; });
