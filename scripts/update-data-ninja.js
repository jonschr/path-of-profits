#!/usr/bin/env node
const fs = require('fs/promises');
const path = require('path');

const NINJA_BASE = 'https://poe.ninja/poe1/api/economy/stash/current';
const REQUEST_TIMEOUT_MS = 30000;
const REQUEST_DELAY_MS = 120;

const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data', 'poe-ninja');
const LEAGUES_PATH = path.join(DATA_DIR, 'leagues.json');
const PRICES_DIR = path.join(DATA_DIR, 'prices');

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
  { type: 'DivinationCard', category: 'card' }
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

function toItem({ name, value, category, icon, id }) {
  if (!name || !Number.isFinite(value)) return null;
  const rounded = Math.round(value * 10000) / 10000;
  return slimItem({
    id: id || name,
    name,
    category,
    icon,
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
  return { items, updatedAt: parseTimestamp(data?.updated) };
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
  return { items, updatedAt: parseTimestamp(data?.updated) };
}

function pickLatestTimestamp(current, next) {
  if (!next) return current;
  if (!current) return next;
  return next.getTime() > current.getTime() ? next : current;
}

async function main() {
  const generatedAt = new Date().toISOString();
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.mkdir(PRICES_DIR, { recursive: true });

  const indexResp = await fetchJson(`${NINJA_BASE}/getindexstate`);
  const rawLeagues = extractLeagueList(indexResp.data);
  if (!rawLeagues.length) throw new Error('No league data returned from poe.ninja');

  const normalizedLeagues = rawLeagues.map(normalizeLeagueEntry).filter(Boolean);
  const uniqueActive = [];
  const seen = new Set();
  normalizedLeagues.forEach((league) => {
    const key = league.watch.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    if (league.active === false) return;
    uniqueActive.push(league);
  });

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
    await fs.mkdir(leagueDir, { recursive: true });

    let items = [];
    let updatedAt = null;

    for (const entry of CURRENCY_TYPES) {
      try {
        const result = await fetchCurrencyOverview(league.watch, entry);
        items = items.concat(result.items);
        updatedAt = pickLatestTimestamp(updatedAt, result.updatedAt);
      } catch (err) {
        console.warn(`Currency ${entry.type} failed for ${league.watch}: ${err?.message || 'unknown'}`);
      }
      await sleep(REQUEST_DELAY_MS);
    }

    for (const entry of ITEM_TYPES) {
      try {
        const result = await fetchItemOverview(league.watch, entry);
        items = items.concat(result.items);
        updatedAt = pickLatestTimestamp(updatedAt, result.updatedAt);
      } catch (err) {
        console.warn(`Item ${entry.type} failed for ${league.watch}: ${err?.message || 'unknown'}`);
      }
      await sleep(REQUEST_DELAY_MS);
    }

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
    console.log(`League ${league.watch}: items ${items.length}`);
  }

  const leaguesPayload = {
    generatedAt,
    source: 'poe.ninja',
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
