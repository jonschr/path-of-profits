#!/usr/bin/env node
const fs = require('fs/promises');
const path = require('path');
const NinjaTypes = require('../modules/ninja-types.js');

const NINJA_BASE = 'https://poe.ninja/poe1/api/economy/stash/current';
const NINJA_EXCHANGE_BASE = 'https://poe.ninja/poe1/api/economy/exchange/current';
const NINJA_ORIGIN = 'https://poe.ninja';
const OFFICIAL_LEAGUES_URL = 'https://api.pathofexile.com/leagues';
const REQUEST_TIMEOUT_MS = 30000;
const REQUEST_DELAY_MS = 120;
const ASSUMED_LEAGUE_END_OVERRIDES = new Map([
  ['phrecia 2.0', '2026-04-23T21:00:00Z'],
  ['hardcore phrecia 2.0', '2026-04-23T21:00:00Z']
]);
const ETERNAL_LEAGUE_KEYS = new Set(['standard', 'hardcore']);

const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data', 'poe-ninja');
const LEAGUES_PATH = path.join(DATA_DIR, 'leagues.json');
const PRICES_DIR = path.join(DATA_DIR, 'prices');

const CURRENCY_TYPES = NinjaTypes.currencyOverviewTypes;
const ITEM_TYPES = NinjaTypes.itemOverviewTypes;
const LOW_CONFIDENCE_LISTING_THRESHOLD = Number.isFinite(Number(NinjaTypes.lowConfidenceListingThreshold))
  ? Number(NinjaTypes.lowConfidenceListingThreshold)
  : 5;

const FALLBACK_LEAGUES = [
  'Standard',
  'Hardcore',
  'Mirage',
  'Hardcore Mirage'
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

function parseLeagueDate(value) {
  const parsed = parseTimestamp(value);
  if (!parsed) return null;
  if (parsed.getUTCFullYear() <= 1900) return null;
  return parsed;
}

function getAssumedLeagueEndDate(leagueName) {
  const key = String(leagueName || '').trim().toLowerCase();
  if (!key) return null;
  const assumed = ASSUMED_LEAGUE_END_OVERRIDES.get(key);
  return parseLeagueDate(assumed);
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

function normalizeText(text) {
  return String(text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9]+/g, '');
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
  let endDate = parseLeagueDate(entry.end_date || entry.endDate || entry.end);
  const assumedEndDate = getAssumedLeagueEndDate(watch);
  if (assumedEndDate && (!endDate || assumedEndDate.getTime() > endDate.getTime())) {
    endDate = assumedEndDate;
  }
  const now = Date.now();
  let active = entry.active ?? entry.isActive ?? entry.enabled ?? entry.current ?? entry?.category?.current;
  if (active == null && endDate) {
    active = endDate.getTime() >= now;
  }
  const normalizedName = watch.toLowerCase();
  const inferredHardcore = normalizedName.includes('hardcore') || normalizedName.startsWith('hc ');
  return {
    id: watch,
    text: String(display || watch),
    watch,
    active,
    upcoming: entry.upcoming ?? entry.isUpcoming,
    event: entry.event ?? entry.isEvent,
    hardcore: entry.hardcore ?? entry.isHardcore ?? inferredHardcore,
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
  const filtered = uniqueActive.filter((league) => {
    const normalized = league.watch.toLowerCase();
    if (normalized.includes('ruthless')) return false;
    if (normalized.includes('solo self-found') || /\bssf\b/.test(normalized)) return false;
    return true;
  });
  const eternal = filtered.filter((league) => ETERNAL_LEAGUE_KEYS.has(league.watch.toLowerCase()));
  const challengeCandidates = filtered.filter((league) => !ETERNAL_LEAGUE_KEYS.has(league.watch.toLowerCase()));
  let current = [];
  if (challengeCandidates.length) {
    const currentFlagged = challengeCandidates.filter((league) => league.active === true);
    const source = currentFlagged.length ? currentFlagged : challengeCandidates;
    const latestStart = source.reduce((best, league) => {
      const start = league.startDate ? league.startDate.getTime() : 0;
      return Math.max(best, start);
    }, 0);
    current = source.filter((league) => {
      const start = league.startDate ? league.startDate.getTime() : 0;
      return start === latestStart;
    });
  }
  return [...eternal, ...current];
}

async function loadExistingNinjaLeagues() {
  try {
    const raw = await fs.readFile(LEAGUES_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    const leagues = extractLeagueList(parsed);
    return Array.isArray(leagues) ? leagues : [];
  } catch (_err) {
    return [];
  }
}

async function resolveLeagues() {
  try {
    const officialResp = await fetchJson(OFFICIAL_LEAGUES_URL);
    const rawLeagues = extractLeagueList(officialResp.data);
    if (rawLeagues.length) {
      return { rawLeagues, source: `official pathofexile API (${OFFICIAL_LEAGUES_URL})` };
    }
    console.warn(`No leagues returned from ${OFFICIAL_LEAGUES_URL}`);
  } catch (err) {
    console.warn(`League fetch failed at ${OFFICIAL_LEAGUES_URL}: ${err?.message || 'unknown'}`);
  }

  const existingLeagues = await loadExistingNinjaLeagues();
  if (existingLeagues.length) {
    return { rawLeagues: existingLeagues, source: `existing poe.ninja file (${LEAGUES_PATH})` };
  }

  return {
    rawLeagues: FALLBACK_LEAGUES.map((name) => ({ name, active: true })),
    source: 'built-in fallback list'
  };
}

function slimItem(item) {
  return {
    id: item.id,
    detailsId: item.detailsId,
    name: item.name,
    category: item.category,
    sourceType: item.sourceType,
    icon: item.icon,
    tradeTag: item.tradeTag,
    baseType: item.baseType,
    variant: item.variant,
    itemClass: item.itemClass,
    mapTier: item.mapTier,
    levelRequired: item.levelRequired,
    gemLevel: item.gemLevel,
    gemQuality: item.gemQuality,
    corrupted: item.corrupted,
    gemType: item.gemType,
    gemTags: item.gemTags,
    isTransfigured: item.isTransfigured,
    isAwakened: item.isAwakened,
    isVaal: item.isVaal,
    confidenceCount: item.confidenceCount,
    lowConfidence: item.lowConfidence,
    tradeTypeDiscriminator: item.tradeTypeDiscriminator,
    tradeTypeOption: item.tradeTypeOption,
    links: item.links,
    listingCount: item.listingCount,
    min: item.min,
    mean: item.mean,
    max: item.max
  };
}

function normalizeIcon(icon) {
  if (!icon) return icon;
  const text = String(icon);
  if (/^https?:\/\/poe\.ninja\/gen\/image\//i.test(text)) {
    return text.replace(/^https?:\/\/poe\.ninja/i, 'https://web.poecdn.com');
  }
  if (text.startsWith('/gen/image/')) return `https://web.poecdn.com${text}`;
  if (/^https?:\/\//i.test(text)) return text;
  if (text.startsWith('/')) return `${NINJA_ORIGIN}${text}`;
  return text;
}

function deriveGemMetadata({ sourceType, name, tradeTypeDiscriminator }) {
  if (sourceType !== 'SkillGem') return {};
  const text = String(name || '').trim();
  const isVaal = text.startsWith('Vaal ');
  const isAwakened = text.startsWith('Awakened ');
  const isTransfigured = Boolean(tradeTypeDiscriminator);
  const gemTags = isVaal
    ? ['Vaal', 'Non-transfigured']
    : isAwakened
      ? ['Awakened', 'Non-transfigured']
      : isTransfigured
        ? ['Transfigured']
        : ['Normal', 'Non-transfigured'];
  return {
    gemType: gemTags[0] || null,
    gemTags,
    tradeTypeDiscriminator: tradeTypeDiscriminator || null,
    isTransfigured,
    isAwakened,
    isVaal
  };
}

function toItem({
  name,
  value,
  category,
  icon,
  id,
  detailsId,
  tradeTag,
  sourceType,
  baseType,
  variant,
  itemClass,
  mapTier,
  levelRequired,
  gemLevel,
  gemQuality,
    corrupted,
    confidenceCount,
    tradeTypeDiscriminator,
    tradeTypeOption,
    links,
    listingCount
}) {
  if (!name || !Number.isFinite(value)) return null;
  const rounded = Math.round(value * 10000) / 10000;
  const normalizedListingCount = Number.isFinite(Number(listingCount)) ? Number(listingCount) : null;
  const normalizedConfidenceCount = Number.isFinite(Number(confidenceCount)) ? Number(confidenceCount) : null;
  const normalizedLinks = Number.isFinite(Number(links)) ? Number(links) : null;
  const gemMeta = deriveGemMetadata({ sourceType, name, tradeTypeDiscriminator });
  return slimItem({
    id: id || name,
    detailsId: detailsId || id || name,
    name,
    category,
    sourceType,
    icon: normalizeIcon(icon),
    tradeTag: tradeTag || null,
    baseType,
    variant,
    itemClass,
    mapTier,
    levelRequired: Number.isFinite(Number(levelRequired)) ? Number(levelRequired) : null,
    gemLevel: Number.isFinite(Number(gemLevel)) ? Number(gemLevel) : null,
    gemQuality: Number.isFinite(Number(gemQuality)) ? Number(gemQuality) : null,
    corrupted: typeof corrupted === 'boolean' ? corrupted : null,
    confidenceCount: normalizedConfidenceCount,
    lowConfidence: normalizedConfidenceCount == null ? null : normalizedConfidenceCount < LOW_CONFIDENCE_LISTING_THRESHOLD,
    tradeTypeDiscriminator: tradeTypeDiscriminator || null,
    tradeTypeOption: tradeTypeOption || null,
    links: normalizedLinks,
    listingCount: normalizedListingCount,
    ...gemMeta,
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
    const detailsId = line.detailsId || name;
    const id = detailsId || name;
    const item = toItem({
      name,
      value,
      category,
      icon,
      id,
      detailsId,
      sourceType: type,
      confidenceCount: line.count,
      listingCount: line.listingCount ?? line.count
    });
    if (item) items.push(item);
  });
  return { items, updatedAt: parseTimestamp(data?.updated), url, sourceType: type, sourceCategory: category };
}

async function fetchCurrencyExchangeOverview(league, { type, category }) {
  const url = `${NINJA_EXCHANGE_BASE}/overview?league=${encodeURIComponent(league)}&type=${encodeURIComponent(type)}`;
  const { data, headers } = await fetchJson(url);
  const lines = Array.isArray(data?.lines) ? data.lines : [];
  const lookup = new Map();
  const register = (item) => {
    const key = item?.id;
    if (key == null) return;
    lookup.set(String(key), item);
  };
  (Array.isArray(data?.items) ? data.items : []).forEach(register);
  (Array.isArray(data?.core?.items) ? data.core.items : []).forEach(register);

  const items = [];
  lines.forEach((line) => {
    const lineId = line?.id != null ? String(line.id) : '';
    const meta = lineId ? lookup.get(lineId) : null;
    const value = Number(line?.primaryValue ?? line?.chaosValue ?? line?.value);
    const name = meta?.name || line?.name || line?.currencyTypeName;
    const detailsId = meta?.detailsId || line?.detailsId || lineId || name;
    const item = toItem({
      name,
      value,
      category: category || meta?.category || line?.category,
      icon: meta?.image || meta?.icon || line?.icon,
      id: detailsId || lineId || name,
      detailsId,
      tradeTag: meta?.tradeTag,
      sourceType: type,
      itemClass: meta?.itemClass,
      confidenceCount: line?.count,
      listingCount: line?.listingCount ?? line?.count
    });
    if (item) items.push(item);
  });

  const updatedAt = parseTimestamp(data?.updated)
    || parseTimestamp(data?.updatedAt)
    || parseTimestamp(data?.generatedAt)
    || parseTimestamp(headers?.get('last-modified'));
  return { items, updatedAt, url, sourceType: type, sourceCategory: category };
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
    const item = toItem({
      name,
      value,
      category,
      icon,
      id,
      sourceType: type,
      baseType: line.baseType,
      variant: line.variant,
      itemClass: line.itemClass,
      mapTier: line.mapTier,
      levelRequired: line.levelRequired,
      gemLevel: line.gemLevel,
      gemQuality: line.gemQuality,
      corrupted: line.corrupted,
      confidenceCount: line.count,
      links: line.links,
      tradeTypeDiscriminator: line?.tradeFilter?.query?.type?.discriminator,
      tradeTypeOption: line?.tradeFilter?.query?.type?.option,
      listingCount: line.listingCount ?? line.count
    });
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

function itemIdentityKeys(item) {
  const keys = [];
  const id = String(item?.id || '').trim().toLowerCase();
  const detailsId = String(item?.detailsId || '').trim().toLowerCase();
  const name = normalizeText(item?.name);
  if (id) keys.push(`id:${id}`);
  if (detailsId) keys.push(`details:${detailsId}`);
  if (name) keys.push(`name:${name}`);
  return keys;
}

function mergeItemRecords(base, supplemental) {
  if (!base) return supplemental;
  if (!supplemental) return base;
  const baseLinkCount = Number(base?.listingCount);
  const supplementalLinkCount = Number(supplemental?.listingCount);
  return {
    ...supplemental,
    ...base,
    id: base.id || supplemental.id,
    detailsId: base.detailsId || supplemental.detailsId || base.id || supplemental.id,
    name: base.name || supplemental.name,
    category: base.category || supplemental.category,
    sourceType: base.sourceType || supplemental.sourceType || null,
    icon: base.icon || supplemental.icon,
    tradeTag: base.tradeTag || supplemental.tradeTag || null,
    baseType: base.baseType || supplemental.baseType,
    variant: base.variant || supplemental.variant,
    itemClass: base.itemClass || supplemental.itemClass,
    mapTier: Number.isFinite(Number(base?.mapTier)) ? Number(base.mapTier) : supplemental.mapTier,
    levelRequired: Number.isFinite(Number(base?.levelRequired)) ? Number(base.levelRequired) : supplemental.levelRequired,
    gemLevel: Number.isFinite(Number(base?.gemLevel)) ? Number(base.gemLevel) : supplemental.gemLevel,
    gemQuality: Number.isFinite(Number(base?.gemQuality)) ? Number(base.gemQuality) : supplemental.gemQuality,
    corrupted: typeof base?.corrupted === 'boolean' ? base.corrupted : supplemental.corrupted,
    gemType: base.gemType || supplemental.gemType || null,
    gemTags: Array.isArray(base?.gemTags) && base.gemTags.length ? base.gemTags : (supplemental.gemTags || null),
    isTransfigured: typeof base?.isTransfigured === 'boolean' ? base.isTransfigured : supplemental.isTransfigured,
    isAwakened: typeof base?.isAwakened === 'boolean' ? base.isAwakened : supplemental.isAwakened,
    isVaal: typeof base?.isVaal === 'boolean' ? base.isVaal : supplemental.isVaal,
    confidenceCount: Number.isFinite(Number(base?.confidenceCount))
      ? Number(base.confidenceCount)
      : (Number.isFinite(Number(supplemental?.confidenceCount)) ? Number(supplemental.confidenceCount) : null),
    lowConfidence: typeof base?.lowConfidence === 'boolean'
      ? base.lowConfidence
      : (typeof supplemental?.lowConfidence === 'boolean' ? supplemental.lowConfidence : null),
    tradeTypeDiscriminator: base.tradeTypeDiscriminator || supplemental.tradeTypeDiscriminator || null,
    tradeTypeOption: base.tradeTypeOption || supplemental.tradeTypeOption || null,
    listingCount: Number.isFinite(baseLinkCount)
      ? baseLinkCount
      : (Number.isFinite(supplementalLinkCount) ? supplementalLinkCount : null),
    min: Number.isFinite(base?.min) ? base.min : supplemental.min,
    mean: Number.isFinite(base?.mean) ? base.mean : supplemental.mean,
    max: Number.isFinite(base?.max) ? base.max : supplemental.max
  };
}

function mergeItemsByIdentity(primaryItems, supplementalItems) {
  const merged = [];
  const lookup = new Map();
  const register = (item, index) => {
    itemIdentityKeys(item).forEach((key) => lookup.set(key, index));
  };

  (primaryItems || []).forEach((item) => {
    const index = merged.push(item) - 1;
    register(item, index);
  });

  (supplementalItems || []).forEach((item) => {
    const matchedKey = itemIdentityKeys(item).find((key) => lookup.has(key));
    if (matchedKey == null) {
      const index = merged.push(item) - 1;
      register(item, index);
      return;
    }
    const index = lookup.get(matchedKey);
    const combined = mergeItemRecords(merged[index], item);
    merged[index] = combined;
    register(combined, index);
  });

  return merged;
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
    targetMap.set(key, mergeItemRecords(existing, item));
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
        const overviewResult = await fetchCurrencyOverview(league.watch, entry);
        let mergedEntryItems = overviewResult.items;
        let entryUpdatedAt = overviewResult.updatedAt;
        const bucket = upsertCategoryBucket(categoryBuckets, entry.category);

        try {
          const exchangeResult = await fetchCurrencyExchangeOverview(league.watch, entry);
          mergedEntryItems = mergeItemsByIdentity(exchangeResult.items, overviewResult.items);
          entryUpdatedAt = pickLatestTimestamp(exchangeResult.updatedAt, overviewResult.updatedAt);
          if (bucket) bucket.sourceTypes.add(`exchange:${entry.type}`);
        } catch (err) {
          const message = err?.message || 'unknown';
          errors.push({ source: 'exchange', type: entry.type, error: message });
          console.warn(`Exchange ${entry.type} failed for ${league.watch}: ${message}`);
        }
        mergeItems(compactMap, mergedEntryItems);
        if (bucket) {
          mergeItems(bucket.items, mergedEntryItems);
          bucket.updatedAt = pickLatestTimestamp(bucket.updatedAt, entryUpdatedAt);
          bucket.sourceTypes.add(entry.type);
        }
        updatedAt = pickLatestTimestamp(updatedAt, entryUpdatedAt);
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
