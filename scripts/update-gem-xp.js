#!/usr/bin/env node

const fs = require('fs/promises');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');

const execFileAsync = promisify(execFile);
const ROOT = path.resolve(__dirname, '..');
const PRICE_ROOT = path.join(ROOT, 'data', 'poe-ninja', 'prices');
const OUTPUT_PATH = path.join(ROOT, 'data', 'gem-xp.json');
const WIKI_BASE = 'https://www.poewiki.net/wiki/';
const CONCURRENCY = 8;

function gemWikiUrl(name) {
  return `${WIKI_BASE}${encodeURIComponent(String(name || '').replace(/ /g, '_'))}`;
}

function parseExperienceMap(rawText) {
  const text = String(rawText || '');
  const experienceMap = {};
  const regex = /^\|level(\d+)_experience\s*=\s*([0-9]+)\s*$/gm;
  let match = regex.exec(text);
  while (match) {
    const level = Number.parseInt(match[1], 10);
    const totalExp = Number.parseInt(match[2], 10);
    if (Number.isFinite(level) && Number.isFinite(totalExp)) {
      experienceMap[level] = totalExp;
    }
    match = regex.exec(text);
  }
  return experienceMap;
}

async function listGemNames() {
  const slugs = await fs.readdir(PRICE_ROOT, { withFileTypes: true });
  const names = new Set();
  for (const entry of slugs) {
    if (!entry.isDirectory()) continue;
    const gemPath = path.join(PRICE_ROOT, entry.name, 'category', 'gems.json');
    try {
      const payload = JSON.parse(await fs.readFile(gemPath, 'utf8'));
      for (const item of payload.items || []) {
        if (item && item.name) names.add(item.name);
      }
    } catch (_error) {
      // Ignore missing local league builds; the script only needs what is present.
    }
  }
  return Array.from(names).sort((a, b) => a.localeCompare(b));
}

async function fetchGemXp(name) {
  const url = gemWikiUrl(name);
  const rawUrl = `${url}?action=raw`;
  try {
    const { stdout } = await execFileAsync('curl', ['-sL', rawUrl], {
      cwd: ROOT,
      maxBuffer: 2 * 1024 * 1024
    });
    const xpMap = parseExperienceMap(stdout);
    if (!Object.keys(xpMap).length) {
      return { name, url, error: 'No level experience values found' };
    }
    return {
      name,
      url,
      xpTo20: Number.isFinite(xpMap[20]) ? xpMap[20] : null,
      xpTo3: Number.isFinite(xpMap[3]) ? xpMap[3] : null
    };
  } catch (error) {
    return { name, url, error: error.message };
  }
}

async function runPool(items, worker, concurrency) {
  const results = [];
  let index = 0;
  async function runWorker() {
    while (index < items.length) {
      const currentIndex = index;
      index += 1;
      results[currentIndex] = await worker(items[currentIndex], currentIndex);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, runWorker));
  return results;
}

async function main() {
  const names = await listGemNames();
  if (!names.length) {
    throw new Error(`No local gem names found under ${PRICE_ROOT}`);
  }

  console.log(`Fetching XP data for ${names.length} gems from PoE Wiki...`);
  const results = await runPool(names, async (name, index) => {
    if ((index + 1) % 50 === 0 || index === 0) {
      console.log(`  ${index + 1}/${names.length}`);
    }
    return fetchGemXp(name);
  }, CONCURRENCY);

  const entries = {};
  const missing = [];
  for (const result of results) {
    if (Number.isFinite(result.xpTo20) || Number.isFinite(result.xpTo3)) {
      entries[result.name] = {
        xpTo20: Number.isFinite(result.xpTo20) ? result.xpTo20 : null,
        xpTo3: Number.isFinite(result.xpTo3) ? result.xpTo3 : null,
        url: result.url
      };
    } else {
      missing.push({
        name: result.name,
        url: result.url,
        error: result.error || 'No usable XP values found'
      });
    }
  }

  const payload = {
    generatedAt: new Date().toISOString(),
    source: 'PoE Wiki skill progression tables',
    entryCount: Object.keys(entries).length,
    missingCount: missing.length,
    entries,
    missing
  };

  await fs.writeFile(OUTPUT_PATH, `${JSON.stringify(payload, null, 2)}\n`);
  console.log(`Wrote ${OUTPUT_PATH} with ${payload.entryCount} entries (${payload.missingCount} missing).`);
}

main().catch((error) => {
  console.error(error.stack || error.message || String(error));
  process.exitCode = 1;
});
