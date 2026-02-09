#!/usr/bin/env node
/* eslint-disable no-console */

const args = process.argv.slice(2);
const getArg = (name, fallback) => {
  const idx = args.indexOf(name);
  if (idx === -1) return fallback;
  const value = args[idx + 1];
  if (!value || value.startsWith('--')) return fallback;
  return value;
};

const leagueArg = getArg('--league', 'phrecia2.0');
const leagueTextArg = getArg('--league-text', 'Phrecia 2.0');
const baseArg = getArg('--base', 'http://localhost:5173/api/poewatch');
const watchSeconds = Number(getArg('--watch', '0'));
const fileArg = getArg('--file', `${process.cwd()}/boss-profit.html`);
const jsonArg = getArg('--json', `${process.cwd()}/boss-data.json`);
const showMissing = args.includes('--missing');
const missingLimit = Number(getArg('--limit', '50'));
const findArg = getArg('--find', '');
const findList = findArg ? findArg.split(',').map((s) => s.trim()).filter(Boolean) : [];

const baseCandidates = Array.from(new Set([
  baseArg,
  'https://api.poe.watch'
]));

const leagueCandidates = Array.from(new Set([leagueTextArg, leagueArg].filter(Boolean)));

const WATCH_CATEGORY_MAP = {
  Currency: ['currency'],
  Fragment: ['fragment'],
  Invitations: ['maps'],
  UniqueArmour: ['armour'],
  UniqueWeapon: ['weapon'],
  UniqueAccessory: ['accessory'],
  UniqueJewel: ['jewels'],
  UniqueFlask: ['flask'],
  DivinationCard: ['card']
};

function normalizeText(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/^the\s+/, '')
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9]/g, '');
}

function categoriesForTypes(types) {
  const categories = new Set();
  (types || []).forEach((type) => {
    (WATCH_CATEGORY_MAP[type] || []).forEach((category) => categories.add(category));
  });
  return Array.from(categories);
}

function indexWatchData(items) {
  const byName = new Map();
  const byLower = new Map();
  const counts = {};
  items.forEach((item) => {
    const name = item?.name;
    if (!name) return;
    const lower = String(name).toLowerCase();
    const normalized = normalizeText(name);
    if (lower) {
      if (!byLower.has(lower)) byLower.set(lower, []);
      byLower.get(lower).push(item);
    }
    if (normalized) {
      if (!byName.has(normalized)) byName.set(normalized, []);
      byName.get(normalized).push(item);
    }
    const category = item.category || 'unknown';
    counts[category] = (counts[category] || 0) + 1;
  });
  return { items, byName, byLower, counts };
}

function findWatchMatches(item, index, useTypeFilter = true) {
  const rawName = item.alias || item.name;
  if (!rawName) return [];
  const lower = rawName.toLowerCase();
  const normalized = normalizeText(rawName);
  const exactMatches = index.byLower.get(lower) || [];
  const normalizedMatches = index.byName.get(normalized) || [];
  let matches = exactMatches.length ? exactMatches.slice() : normalizedMatches.slice();

  if (useTypeFilter) {
    const categories = categoriesForTypes(item.types);
    if (categories.length) {
      matches = matches.filter((match) => categories.includes(match.category));
    }
  }

  return matches;
}

function suggestCandidates(item, index) {
  const normalized = normalizeText(item.alias || item.name);
  if (!normalized) return [];
  const candidates = index.items
    .map((entry) => ({
      name: entry.name || '',
      norm: normalizeText(entry.name || '')
    }))
    .filter((entry) => entry.norm && (entry.norm.includes(normalized) || normalized.includes(entry.norm)))
    .map((entry) => entry.name);
  return Array.from(new Set(candidates)).slice(0, 3);
}

async function fetchCompact(base, league) {
  const url = `${base.replace(/\/$/, '')}/compact?league=${encodeURIComponent(league)}`;
  const res = await fetch(url);
  if (!res.ok) {
    return { ok: false, status: res.status, url };
  }
  const data = await res.json();
  const items = Array.isArray(data?.items) ? data.items : (Array.isArray(data) ? data : []);
  if (!items.length) return { ok: false, status: 'empty', url };
  return { ok: true, status: res.status, url, items };
}

function summarize(result) {
  if (!result.ok) return `error (${result.status})`;
  const counts = result.index?.counts || {};
  const categoryOrder = ['currency', 'fragment', 'maps', 'armour', 'weapon', 'accessory', 'jewels', 'flask', 'card'];
  const summary = categoryOrder
    .filter((key) => counts[key])
    .map((key) => `${key}:${counts[key]}`)
    .join(' | ');
  return `ok (${result.items.length}) ${summary}`;
}

function findInResults(result, name) {
  if (!result.ok) return [];
  const normalized = normalizeText(name);
  const exact = result.index.byLower.get(name.toLowerCase()) || [];
  const normalizedMatches = result.index.byName.get(normalized) || [];
  const matches = exact.length ? exact : normalizedMatches;
  return matches.map((match) => ({
    category: match.category,
    name: match.name
  }));
}

function extractBossData(html) {
  const match = html.match(/const\s+BOSS_DATA\s*=\s*\[/);
  if (!match || match.index == null) return null;
  const start = match.index + match[0].length - 1;
  let depth = 0;
  let inString = null;
  let escape = false;
  for (let i = start; i < html.length; i += 1) {
    const char = html[i];
    if (inString) {
      if (escape) {
        escape = false;
      } else if (char === '\\') {
        escape = true;
      } else if (char === inString) {
        inString = null;
      }
      continue;
    }
    if (char === '"' || char === "'" || char === '`') {
      inString = char;
      continue;
    }
    if (char === '[') depth += 1;
    if (char === ']') depth -= 1;
    if (depth === 0) {
      const arrayText = html.slice(start, i + 1);
      // eslint-disable-next-line no-new-func
      try {
        return new Function(`return ${arrayText};`)();
      } catch (err) {
        console.log(`Parse error in BOSS_DATA: ${err.message}`);
        return null;
      }
    }
  }
  console.log(`Parse error in BOSS_DATA: unmatched brackets (depth=${depth})`);
  return null;
}

async function runMissingAnalysis(result) {
  if (!result.ok) return;
  const fs = await import('fs');
  let bossData = null;
  if (fs.existsSync(fileArg)) {
    const html = fs.readFileSync(fileArg, 'utf8');
    bossData = extractBossData(html);
    if (!bossData) {
      const match = html.match(/const\s+BOSS_DATA\s*=\s*\[/);
      console.log(`Parse debug: match=${Boolean(match)} index=${match?.index ?? 'n/a'}`);
      console.log(`Unable to parse BOSS_DATA from ${fileArg}`);
    }
  }
  if (!bossData && fs.existsSync(jsonArg)) {
    bossData = JSON.parse(fs.readFileSync(jsonArg, 'utf8'));
    console.log(`Loaded boss data from ${jsonArg}`);
  }
  if (!bossData) return;

  const index = result.index;
  const missing = [];
  bossData.forEach((boss) => {
    boss.entry.forEach((item) => {
      missing.push({ boss: boss.name, group: 'Entry', item, reason: 'price' });
    });
    boss.groups.forEach((group) => {
      group.items.forEach((item) => {
        if (item.p == null) {
          missing.push({ boss: boss.name, group: group.label, item, reason: 'prob' });
        } else if (item.noPrice) {
          // Skip items intentionally marked as variable-priced (manual only)
          return;
        } else {
          missing.push({ boss: boss.name, group: group.label, item, reason: 'price' });
        }
      });
    });
  });

  const unresolved = [];
  missing.forEach((entry) => {
    if (entry.reason === 'prob') return;
    const matches = findWatchMatches(entry.item, index, true);
    if (matches.length) return;
    const fallback = findWatchMatches(entry.item, index, false);
    if (!fallback.length) unresolved.push(entry);
  });

  console.log(`Missing price entries: ${unresolved.length}`);
  unresolved.slice(0, missingLimit).forEach((entry) => {
    const types = entry.item.types?.length ? entry.item.types.join(', ') : 'none';
    const suggestions = suggestCandidates(entry.item, index);
    const suggestionText = suggestions.length ? ` | suggestions: ${suggestions.join(', ')}` : '';
    console.log(`${entry.boss} | ${entry.group} | ${entry.item.name} | types=${types}${suggestionText}`);
  });
}

async function runOnce() {
  for (const base of baseCandidates) {
    for (const league of leagueCandidates) {
      try {
        const result = await fetchCompact(base, league);
        if (result.ok) {
          result.index = indexWatchData(result.items);
        }
        console.log(`Base: ${base}`);
        console.log(`League: ${league}`);
        console.log(`Results: ${summarize(result)}`);
        if (findList.length) {
          findList.forEach((name) => {
            const matches = findInResults(result, name);
            if (!matches.length) {
              console.log(`Find: ${name} -> no matches`);
            } else {
              console.log(`Find: ${name} -> ${matches.map((m) => `${m.category}:${m.name}`).join(', ')}`);
            }
          });
        }
        if (showMissing) await runMissingAnalysis(result);
        console.log('---');
      } catch (err) {
        console.log(`Base: ${base}`);
        console.log(`League: ${league}`);
        console.log(`Results: error (${err.message})`);
        console.log('---');
      }
    }
  }
}

async function main() {
  if (watchSeconds > 0) {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      console.clear();
      console.log(`[${new Date().toISOString()}] poe.watch diagnostics`);
      await runOnce();
      await new Promise((resolve) => setTimeout(resolve, watchSeconds * 1000));
    }
  }
  await runOnce();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
