#!/usr/bin/env node
const fs = require('fs/promises');
const path = require('path');

const NINJA_BASE = 'https://poe.ninja/poe1/api/economy/stash/current';
const NINJA_ORIGIN = 'https://poe.ninja';
const REQUEST_TIMEOUT_MS = 30000;
const REQUEST_DELAY_MS = 120;

const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data', 'poe-ninja');
const LEAGUES_PATH = path.join(DATA_DIR, 'leagues.json');
const PRICES_DIR = path.join(DATA_DIR, 'prices');
const WATCH_LEAGUES_PATH = path.join(ROOT, 'data', 'poe-watch', 'leagues.json');

const CURRENCY_TYPES = [
  { type: 'Currency', category: 'currency' },
  { type: 'Fragment', category: 'fragment' },
  { type: 'Invitation', category: 'maps' }
];

const ITEM_TYPES = [
  { type: 'UniqueArmour', category: 'armour' },
  { type: 'UniqueWeapon', category: 'weapon' },
  { type: 'UniqueAccessory', category: 'accessory' },
  { type: 'UniqueJewel', category: 'jewels' },
  { type: 'UniqueFlask', category: 'flask' },
  { type: 'DivinationCard', category: 'card' },
  { type: 'Beast', category: 'monsters' }
];

const FALLBACK_LEAGUES = [
  'Standard',
  'Hardcore',
  'Keepers',
  'Hardcore Keepers',
  'Phrecia 2.0',
  'Hardcore Phrecia 2.0'
];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseTimestamp(value) {
  if (value == null) return null;
  if (value instanceof Date && !Number.isNaN(value.valueOf())) return value;
  if (typeof value === 'number' && Number.isFinite(value)) {
    const ms = value < 1e12 ? value * 1000 : value;
    const date = new Date(ms);
    return Number.isNaN(date.valueOf()) ? null : date;
  }
  const date = new Date(String(value));
  return Number.isNaN(date.valueOf()) ? null : date;
}

function slugifyLeague(text) {
  return String(text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function normalizeLeagueEntry(entry) {
  if (!entry) return null;
  if (typeof entry === 'string') {
    const name = entry.trim();
    return name ? { id: name, text: name, watch: name } : null;
  }
  const name = entry.name || entry.league || entry.id || entry.slug || entry.code || entry.short;
  const display = entry.displayName || entry.display || entry.text || entry.label || entry.name || name;
  const watch = String(name || display || '').trim();
  if (!watch) return null;
  const startDate = parseTimestamp(entry.start_date || entry.startDate || entry.start);
  const endDate = parseTimestamp(entry.end_date || entry.endDate || entry.end);
  const now = Date.now();
  let active = entry.active ?? entry.isActive ?? entry.enabled ?? entry.current;
  if (active == null && endDate) {
    active = endDate.getTime() >= now;
  }
  return {
    id: watch,
    text: String(display || watch),
    watch,
    active,
    upcoming: entry.upcoming ?? entry.isUpcoming,
    event: entry.event ?? entry.isEvent,
    hardcore: entry.hardcore ?? entry.isHardcore,
    startDate,
    endDate
  };
}

function extractLeagueList(data) {
  if (Array.isArray(data)) return data;
  if (!data || typeof data !== 'object') return [];
  if (Array.isArray(data.economyLeagues)) return data.economyLeagues;
  if (Array.isArray(data.leagues)) return data.leagues;
  if (Array.isArray(data.items)) return data.items;
  if (Array.isArray(data.result)) return data.result;
  if (Array.isArray(data.data)) return data.data;
  return [];
}

async function fetchJson(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const resp = await fetch(url, {
      signal: controller.signal,
      headers: { 'user-agent': 'pathofprofits-data-update' }
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
    return { data, headers: resp.headers };
  } finally {
    clearTimeout(timeout);
  }
}

function uniqueActiveLeagues(rawLeagues) {
  const normalizedLeagues = (rawLeagues || []).map(normalizeLeagueEntry).filter(Boolean);
  const uniqueActive = [];
  const seen = new Set();
  normalizedLeagues.forEach((league) => {
    const key = league.watch.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    if (league.active === false) return;
    uniqueActive.push(league);
  });
  return uniqueActive;
}

async function loadPoeWatchLeagues() {
  try {
    const raw = await fs.readFile(WATCH_LEAGUES_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    const leagues = extractLeagueList(parsed);
    return Array.isArray(leagues) ? leagues : [];
  } catch (_err) {
    return [];
  }
}

async function resolveLeagues() {
  const endpointCandidates = [
    `${NINJA_BASE}/getindexstate`,
    `${NINJA_BASE.replace('/stash/current', '/exchange/current')}/getindexstate`,
    `${NINJA_ORIGIN}/api/data/getindexstate`
  ];

  for (const endpoint of endpointCandidates) {
    try {
      const indexResp = await fetchJson(endpoint);
      const rawLeagues = extractLeagueList(indexResp.data);
      if (rawLeagues.length) {
        return { rawLeagues, source: `poe.ninja (${endpoint})` };
      }
      console.warn(`No leagues returned from ${endpoint}`);
    } catch (err) {
      console.warn(`League index fetch failed at ${endpoint}: ${err?.message || 'unknown'}`);
    }
  }

  const watchLeagues = await loadPoeWatchLeagues();
  if (watchLeagues.length) {
    return { rawLeagues: watchLeagues, source: `poe.watch file (${WATCH_LEAGUES_PATH})` };
  }

  return {
    rawLeagues: FALLBACK_LEAGUES.map((name) => ({ name, active: true })),
    source: 'built-in fallback list'
  };
}

function slimItem(item) {
  return {
    id: item.id,
    name: item.name,
    category: item.category,
    icon: item.icon,
    min: item.min,
    mean: item.mean,
    max: item.max
  };
}

function normalizeIcon(icon) {
  if (!icon) return icon;
  const text = String(icon);
  if (/^https?:\/\//i.test(text)) return text;
  if (text.startsWith('/')) return `${NINJA_ORIGIN}${text}`;
  return text;
}

function toItem({ name, value, category, icon, id }) {
  if (!name || !Number.isFinite(value)) return null;
  const rounded = Math.round(value * 10000) / 10000;
  return slimItem({
    id: id || name,
    name,
    category,
    icon: normalizeIcon(icon),
    min: rounded,
    mean: rounded,
    max: rounded
  });
}

async function fetchCurrencyOverview(league, { type, category }) {
  const url = `${NINJA_BASE}/currency/overview?league=${encodeURIComponent(league)}&type=${encodeURIComponent(type)}`;
  const { data } = await fetchJson(url);
  const lines = Array.isArray(data?.lines) ? data.lines : [];
  const items = [];
  lines.forEach((line) => {
    const value = Number(line.chaosEquivalent);
    const name = line.currencyTypeName || line.name;
    const icon = line.icon;
    const id = line.detailsId || name;
    const item = toItem({ name, value, category, icon, id });
    if (item) items.push(item);
  });
  return { items, updatedAt: parseTimestamp(data?.updated), url, sourceType: type, sourceCategory: category };
}

async function fetchItemOverview(league, { type, category }) {
  const url = `${NINJA_BASE}/item/overview?league=${encodeURIComponent(league)}&type=${encodeURIComponent(type)}`;
  const { data } = await fetchJson(url);
  const lines = Array.isArray(data?.lines) ? data.lines : [];
  const items = [];
  lines.forEach((line) => {
    const value = Number(line.chaosValue);
    const name = line.name || line.baseType;
    const icon = line.icon;
    const id = line.detailsId || name;
    const item = toItem({ name, value, category, icon, id });
    if (item) items.push(item);
  });
  return { items, updatedAt: parseTimestamp(data?.updated), url, sourceType: type, sourceCategory: category };
}

function pickLatestTimestamp(current, next) {
  if (!next) return current;
  if (!current) return next;
  return next.getTime() > current.getTime() ? next : current;
}

function itemKey(item) {
  if (!item) return '';
  if (item.id != null && String(item.id)) return `id:${String(item.id)}`;
  const name = String(item.name || '').toLowerCase();
  return name ? `name:${name}` : '';
}

function mergeItems(targetMap, items) {
  (items || []).forEach((item) => {
    const key = itemKey(item);
    if (!key) return;
    const existing = targetMap.get(key);
    if (!existing) {
      targetMap.set(key, item);
      return;
    }
    if (!existing.category && item.category) {
      targetMap.set(key, { ...existing, category: item.category });
    }
    if (!existing.icon && item.icon) {
      targetMap.set(key, { ...targetMap.get(key), icon: item.icon });
    }
  });
}

function upsertCategoryBucket(bucketMap, category) {
  const key = String(category || '').trim().toLowerCase();
  if (!key) return null;
  if (!bucketMap.has(key)) {
    bucketMap.set(key, {
      category: key,
      items: new Map(),
      updatedAt: null,
      sourceTypes: new Set()
    });
  }
  return bucketMap.get(key);
}

async function main() {
  const generatedAt = new Date().toISOString();
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.mkdir(PRICES_DIR, { recursive: true });

  const leagueResolution = await resolveLeagues();
  const rawLeagues = leagueResolution.rawLeagues;
  const uniqueActive = uniqueActiveLeagues(rawLeagues);
  if (!uniqueActive.length) {
    throw new Error(`No usable leagues for poe.ninja update (source: ${leagueResolution.source})`);
  }
  console.log(`Using leagues source: ${leagueResolution.source} (${uniqueActive.length} active leagues)`);

  const usedSlugs = new Set();
  for (const league of uniqueActive) {
    let slug = slugifyLeague(league.watch);
    if (!slug) continue;
    if (usedSlugs.has(slug)) {
      let suffix = 2;
      while (usedSlugs.has(`${slug}-${suffix}`)) suffix += 1;
      slug = `${slug}-${suffix}`;
    }
    usedSlugs.add(slug);

    const leagueDir = path.join(PRICES_DIR, slug);
    const categoryDir = path.join(leagueDir, 'category');
    await fs.mkdir(leagueDir, { recursive: true });
    await fs.mkdir(categoryDir, { recursive: true });

    const compactMap = new Map();
    const categoryBuckets = new Map();
    const errors = [];
    let updatedAt = null;

    for (const entry of CURRENCY_TYPES) {
      try {
        const result = await fetchCurrencyOverview(league.watch, entry);
        mergeItems(compactMap, result.items);
        const bucket = upsertCategoryBucket(categoryBuckets, entry.category);
        if (bucket) {
          mergeItems(bucket.items, result.items);
          bucket.updatedAt = pickLatestTimestamp(bucket.updatedAt, result.updatedAt);
          bucket.sourceTypes.add(entry.type);
        }
        updatedAt = pickLatestTimestamp(updatedAt, result.updatedAt);
      } catch (err) {
        const message = err?.message || 'unknown';
        errors.push({ source: 'currency', type: entry.type, error: message });
        console.warn(`Currency ${entry.type} failed for ${league.watch}: ${message}`);
      }
      await sleep(REQUEST_DELAY_MS);
    }

    for (const entry of ITEM_TYPES) {
      try {
        const result = await fetchItemOverview(league.watch, entry);
        mergeItems(compactMap, result.items);
        const bucket = upsertCategoryBucket(categoryBuckets, entry.category);
        if (bucket) {
          mergeItems(bucket.items, result.items);
          bucket.updatedAt = pickLatestTimestamp(bucket.updatedAt, result.updatedAt);
          bucket.sourceTypes.add(entry.type);
        }
        updatedAt = pickLatestTimestamp(updatedAt, result.updatedAt);
      } catch (err) {
        const message = err?.message || 'unknown';
        errors.push({ source: 'item', type: entry.type, error: message });
        console.warn(`Item ${entry.type} failed for ${league.watch}: ${message}`);
      }
      await sleep(REQUEST_DELAY_MS);
    }

    const categories = Array.from(categoryBuckets.keys()).sort((a, b) => a.localeCompare(b));
    const categoriesPayload = {
      generatedAt,
      source: 'poe.ninja',
      league: {
        watch: league.watch,
        text: league.text,
        slug
      },
      categories
    };
    await fs.writeFile(path.join(leagueDir, 'categories.json'), `${JSON.stringify(categoriesPayload, null, 2)}\n`);

    for (const category of categories) {
      const bucket = categoryBuckets.get(category);
      const categoryItems = Array.from(bucket.items.values());
      const payload = {
        generatedAt,
        source: 'poe.ninja',
        league: {
          watch: league.watch,
          text: league.text,
          slug
        },
        category,
        sourceTypes: Array.from(bucket.sourceTypes).sort((a, b) => a.localeCompare(b)),
        updatedAt: bucket.updatedAt ? bucket.updatedAt.toISOString() : null,
        items: categoryItems
      };
      await fs.writeFile(path.join(categoryDir, `${category}.json`), `${JSON.stringify(payload, null, 2)}\n`);
    }

    const items = Array.from(compactMap.values());
    const compactPayload = {
      generatedAt,
      source: 'poe.ninja',
      league: {
        watch: league.watch,
        text: league.text,
        slug
      },
      updatedAt: updatedAt ? updatedAt.toISOString() : null,
      items
    };

    await fs.writeFile(path.join(leagueDir, 'compact.json'), `${JSON.stringify(compactPayload, null, 2)}\n`);
    if (errors.length) {
      await fs.writeFile(
        path.join(leagueDir, 'errors.json'),
        `${JSON.stringify({ generatedAt, league: { watch: league.watch, text: league.text, slug }, errors }, null, 2)}\n`
      );
    }
    console.log(`League ${league.watch}: items ${items.length}, categories ${categories.length}`);
  }

  const leaguesPayload = {
    generatedAt,
    source: 'poe.ninja',
    leagueSource: leagueResolution.source,
    leagues: rawLeagues
  };

  await fs.writeFile(LEAGUES_PATH, `${JSON.stringify(leaguesPayload, null, 2)}\n`);
  console.log(`Wrote ${LEAGUES_PATH}`);
  console.log(`Wrote ${PRICES_DIR}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
