#!/usr/bin/env node
const fs = require('fs/promises');
const path = require('path');

const WATCH_BASE = 'https://api.poe.watch';
const WATCH_GAME = 'poe1';
const REQUEST_TIMEOUT_MS = 30000;
const REQUEST_DELAY_MS = 120;

const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');
const LEAGUES_PATH = path.join(DATA_DIR, 'leagues.json');
const PRICES_DIR = path.join(DATA_DIR, 'prices');

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

function parseLeagueDate(value) {
  const parsed = parseTimestamp(value);
  if (!parsed) return null;
  if (parsed.getUTCFullYear() <= 1900) return null;
  return parsed;
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
  const startDate = parseLeagueDate(entry.start_date || entry.startDate || entry.start);
  const endDate = parseLeagueDate(entry.end_date || entry.endDate || entry.end);
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
  if (Array.isArray(data.leagues)) return data.leagues;
  if (Array.isArray(data.items)) return data.items;
  if (Array.isArray(data.result)) return data.result;
  if (Array.isArray(data.data)) return data.data;
  return [];
}

function normalizeCategorySlug(value) {
  if (value == null) return '';
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed || /^\d+$/.test(trimmed)) return '';
    return trimmed.toLowerCase();
  }
  if (typeof value === 'number') return '';
  if (typeof value === 'object') {
    const candidate = value.slug || value.category || value.name || value.label || value.text || value.id;
    return normalizeCategorySlug(candidate);
  }
  return normalizeCategorySlug(String(value));
}

function flattenWatchBuckets(buckets) {
  if (!buckets || typeof buckets !== 'object') return [];
  const items = [];
  Object.entries(buckets).forEach(([category, list]) => {
    if (!Array.isArray(list)) return;
    list.forEach((item) => {
      if (item && item.category == null && category) {
        items.push({ ...item, category });
      } else {
        items.push(item);
      }
    });
  });
  return items;
}

function extractWatchItems(data) {
  if (Array.isArray(data)) return data;
  if (!data || typeof data !== 'object') return [];
  const direct = data.items ?? data.data ?? data.result;
  if (Array.isArray(direct)) return direct;
  if (direct && typeof direct === 'object') return flattenWatchBuckets(direct);
  if (Object.values(data).some((value) => Array.isArray(value))) {
    return flattenWatchBuckets(data);
  }
  return [];
}

function extractWatchCategories(data) {
  if (!data) return [];
  if (Array.isArray(data)) return data;
  const direct = data.categories ?? data.data ?? data.result ?? data.items;
  if (Array.isArray(direct)) return direct;
  if (direct && typeof direct === 'object') return Object.values(direct);
  return [];
}

function slimWatchItems(items) {
  return items.map((item) => ({
    id: item.id,
    name: item.name,
    category: item.category,
    icon: item.icon,
    min: item.min,
    mean: item.mean,
    max: item.max
  }));
}

function findUpdatedAt(data, headers) {
  const candidates = [
    data?.updated,
    data?.updatedAt,
    data?.updated_at,
    data?.lastUpdated,
    data?.last_updated,
    data?.timestamp,
    data?.time,
    data?.date,
    data?.meta?.updated,
    data?.meta?.updatedAt,
    data?.meta?.updated_at,
    data?.meta?.lastUpdated,
    data?.meta?.last_updated,
    data?.meta?.timestamp,
    data?.meta?.time,
    data?.meta?.date
  ];
  for (const candidate of candidates) {
    const parsed = parseTimestamp(candidate);
    if (parsed) return parsed;
  }
  const headerCandidate = headers?.get?.('last-modified');
  return parseTimestamp(headerCandidate);
}

function pickLatestTimestamp(current, next) {
  if (!next) return current;
  if (!current) return next;
  return next.getTime() > current.getTime() ? next : current;
}

async function fetchJson(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const resp = await fetch(url, {
      signal: controller.signal,
      headers: { 'user-agent': 'pathofprofits-data-update' }
    });
    if (!resp.ok) {
      throw new Error(`HTTP ${resp.status}`);
    }
    const data = await resp.json();
    return { data, headers: resp.headers };
  } finally {
    clearTimeout(timeout);
  }
}

async function main() {
  const generatedAt = new Date().toISOString();
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.mkdir(PRICES_DIR, { recursive: true });

  const leaguesResp = await fetchJson(`${WATCH_BASE}/leagues`);
  const rawLeagues = extractLeagueList(leaguesResp.data);
  if (!rawLeagues.length) {
    throw new Error('No league data returned from poe.watch');
  }

  const normalizedLeagues = rawLeagues.map(normalizeLeagueEntry).filter(Boolean);
  const activeLeagues = normalizedLeagues.filter((league) => league.active !== false);
  const uniqueActive = [];
  const seen = new Set();
  activeLeagues.forEach((league) => {
    const key = league.watch.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    uniqueActive.push(league);
  });

  const categoriesResp = await fetchJson(`${WATCH_BASE}/categories?game=${encodeURIComponent(WATCH_GAME)}`);
  const categories = extractWatchCategories(categoriesResp.data)
    .map(normalizeCategorySlug)
    .filter(Boolean);
  if (!categories.length) {
    throw new Error('No categories returned from poe.watch');
  }

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
    await fs.mkdir(categoryDir, { recursive: true });

    const compactUrl = `${WATCH_BASE}/compact?league=${encodeURIComponent(league.watch)}&all=true&game=${encodeURIComponent(WATCH_GAME)}`;
    const compactResp = await fetchJson(compactUrl);
    const compactItems = extractWatchItems(compactResp.data);
    if (!compactItems.length) {
      const errorPayload = {
        generatedAt,
        league: { watch: league.watch, text: league.text, slug },
        errors: [{ step: 'compact', error: 'No compact items returned' }]
      };
      await fs.writeFile(
        path.join(leagueDir, 'errors.json'),
        `${JSON.stringify(errorPayload, null, 2)}\n`
      );
      console.warn(`Skipping league ${league.watch}: no compact items returned`);
      continue;
    }
    const compactUpdatedAt = findUpdatedAt(compactResp.data, compactResp.headers);
    const compactPayload = {
      generatedAt,
      source: 'poe.watch',
      league: {
        watch: league.watch,
        text: league.text,
        slug
      },
      updatedAt: compactUpdatedAt ? compactUpdatedAt.toISOString() : null,
      items: slimWatchItems(compactItems)
    };
    await fs.writeFile(path.join(leagueDir, 'compact.json'), `${JSON.stringify(compactPayload, null, 2)}\n`);

    const categoriesPayload = {
      generatedAt,
      source: 'poe.watch',
      league: {
        watch: league.watch,
        text: league.text,
        slug
      },
      categories
    };
    await fs.writeFile(path.join(leagueDir, 'categories.json'), `${JSON.stringify(categoriesPayload, null, 2)}\n`);

    let categoryUpdatedAt = null;
    const errors = [];
    for (const category of categories) {
      const url = `${WATCH_BASE}/get?league=${encodeURIComponent(league.watch)}&category=${encodeURIComponent(category)}&game=${encodeURIComponent(WATCH_GAME)}`;
      try {
        const { data, headers } = await fetchJson(url);
        const catItems = extractWatchItems(data).map((item) => {
          if (item && item.category == null && category) {
            return { ...item, category };
          }
          return item;
        });
        const catPayload = {
          generatedAt,
          source: 'poe.watch',
          league: {
            watch: league.watch,
            text: league.text,
            slug
          },
          category,
          updatedAt: findUpdatedAt(data, headers)?.toISOString() || null,
          items: slimWatchItems(catItems)
        };
        await fs.writeFile(path.join(categoryDir, `${category}.json`), `${JSON.stringify(catPayload, null, 2)}\n`);
        categoryUpdatedAt = pickLatestTimestamp(categoryUpdatedAt, findUpdatedAt(data, headers));
      } catch (err) {
        errors.push({ category, error: err?.message || 'unknown' });
      }
      await sleep(REQUEST_DELAY_MS);
    }

    if (errors.length) {
      await fs.writeFile(
        path.join(leagueDir, 'errors.json'),
        `${JSON.stringify({ generatedAt, league: { watch: league.watch, text: league.text, slug }, errors }, null, 2)}\n`
      );
    }

    console.log(`League ${league.watch}: compact ${compactItems.length} items, categories ${categories.length}`);
  }

  const leaguesPayload = {
    generatedAt,
    source: 'poe.watch',
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
