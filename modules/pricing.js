(function initPoePricingModule(global) {
  'use strict';

  const UNSUPPORTED_WATCH_GET_CATEGORIES = new Set(['enchantment']);
  const NINJA_BASE_ORIGIN = 'https://poe.ninja';
  const SPIRIT_BEAST_DROP_NAMES = [
    'Craiceann, First of the Deep',
    'Farrul, First of the Plains',
    'Fenumus, First of the Night',
    'Saqawal, First of the Sky'
  ];

  function normalizeRatioCategory(category) {
    if (!category) return category;
    const normalized = String(category).toLowerCase();
    if (normalized === 'divination' || normalized === 'divinationcard' || normalized === 'divination-card') {
      return 'card';
    }
    if (normalized === 'cards') return 'card';
    if (normalized === 'map' || normalized === 'maps' || normalized === 'invitation' || normalized === 'invitations') {
      return 'maps';
    }
    return normalized;
  }

  function extractRatioItems(data) {
    if (Array.isArray(data)) return data;
    if (!data || typeof data !== 'object') return [];
    if (Array.isArray(data.items)) return data.items;
    return [];
  }

  function parseRatioPrice(item, parseTimestamp) {
    const chaosValue = Number(item && item.chaos ? item.chaos.value ?? item.chaos.chaosValue : (item?.chaosValue ?? item?.value));
    if (!Number.isFinite(chaosValue) || chaosValue <= 0) return null;
    const name = item && item.name;
    if (!name) return null;
    return {
      id: item && item.id != null ? item.id : name,
      name,
      category: normalizeRatioCategory(item && item.category),
      icon: item && item.icon,
      min: chaosValue,
      mean: chaosValue,
      max: chaosValue,
      updatedAt: parseTimestamp(item?.chaos?.timestamp ?? item?.divine?.timestamp ?? item?.timestamp)
    };
  }

  function pickLatestTimestamp(current, next) {
    if (!next) return current;
    if (!current) return next;
    return next.getTime() > current.getTime() ? next : current;
  }

  function indexRatioItems(items, normalizeText, parseTimestamp) {
    const seen = new Set();
    const result = [];
    let updatedAt = null;
    (items || []).forEach((item) => {
      const parsed = parseRatioPrice(item, parseTimestamp);
      if (!parsed) return;
      const key = normalizeText(parsed.name);
      if (!key || seen.has(key)) return;
      seen.add(key);
      updatedAt = pickLatestTimestamp(updatedAt, parsed.updatedAt);
      const { updatedAt: _ignored, ...rest } = parsed;
      result.push(rest);
    });
    return { items: result, updatedAt };
  }

  function mergeRatioItems(ratioItems, fallbackItems, normalizeText) {
    if (!ratioItems || !ratioItems.length) return fallbackItems || [];
    const ratioNames = new Set(
      ratioItems
        .map((item) => normalizeText(item && item.name))
        .filter(Boolean)
    );
    const mergedFallback = (fallbackItems || []).filter((item) => {
      const key = normalizeText(item && item.name);
      return !key || !ratioNames.has(key);
    });
    return [...ratioItems, ...mergedFallback];
  }

  function toNinjaItem({ name, value, category, icon, id }) {
    if (!name || !Number.isFinite(value)) return null;
    const rounded = Math.round(value * 10000) / 10000;
    return {
      id: id || name,
      name,
      category,
      icon,
      min: rounded,
      mean: rounded,
      max: rounded
    };
  }

  function ninjaEndpointPath(isCurrency) {
    return isCurrency ? 'currency/overview' : 'item/overview';
  }

  function normalizeNinjaIcon(icon) {
    if (!icon) return icon;
    const text = String(icon);
    if (/^https?:\/\//i.test(text)) return text;
    if (text.startsWith('/')) return `${NINJA_BASE_ORIGIN}${text}`;
    return text;
  }

  function buildNinjaExchangeBase(ninjaApiBase) {
    const base = String(ninjaApiBase || '').replace(/\/$/, '');
    if (!base) return '';
    return base.replace(/\/stash\/current$/, '/exchange/current');
  }

  function buildNormalizedNameSet(names, normalizeText) {
    const result = new Set();
    (names || []).forEach((name) => {
      const key = normalizeText(name);
      if (key) result.add(key);
    });
    return result;
  }

  function hasAllNamedItems(items, names, normalizeText) {
    const targetKeys = buildNormalizedNameSet(names, normalizeText);
    if (!targetKeys.size) return true;
    const existing = new Set(
      (items || [])
        .map((item) => normalizeText(item?.name))
        .filter(Boolean)
    );
    for (const key of targetKeys) {
      if (!existing.has(key)) return false;
    }
    return true;
  }

  function mergeNamedItems(baseItems, supplementalItems, names, normalizeText) {
    const targetKeys = buildNormalizedNameSet(names, normalizeText);
    if (!targetKeys.size || !Array.isArray(supplementalItems) || !supplementalItems.length) {
      return { items: baseItems || [], added: 0 };
    }
    const existingKeys = new Set(
      (baseItems || [])
        .map((item) => normalizeText(item?.name))
        .filter(Boolean)
    );
    const additions = [];
    supplementalItems.forEach((item) => {
      const key = normalizeText(item?.name);
      if (!key || !targetKeys.has(key) || existingKeys.has(key)) return;
      existingKeys.add(key);
      additions.push(item);
    });
    return {
      items: additions.length ? [...(baseItems || []), ...additions] : (baseItems || []),
      added: additions.length
    };
  }

  async function fetchNinjaOverview({ leagueValue, entry, isCurrency, ninjaApiBase, fetchJson, parseTimestamp }) {
    const endpoint = ninjaEndpointPath(isCurrency);
    const url = `${ninjaApiBase}/${endpoint}?league=${encodeURIComponent(leagueValue)}&type=${encodeURIComponent(entry.type)}`;
    const { data } = await fetchJson(url);
    const lines = Array.isArray(data?.lines) ? data.lines : [];
    const items = [];
    lines.forEach((line) => {
      const value = Number(isCurrency ? line.chaosEquivalent : line.chaosValue);
      const name = isCurrency ? (line.currencyTypeName || line.name) : (line.name || line.baseType);
      const icon = line.icon;
      const id = line.detailsId || name;
      const item = toNinjaItem({ name, value, category: entry.category, icon, id });
      if (item) items.push(item);
    });
    return { items, updatedAt: parseTimestamp(data && data.updated), url };
  }

  async function fetchNinjaExchangeOverview({ leagueValue, entry, ninjaExchangeApiBase, fetchJson, parseTimestamp }) {
    const url = `${ninjaExchangeApiBase}/overview?league=${encodeURIComponent(leagueValue)}&type=${encodeURIComponent(entry.type)}`;
    const { data, response } = await fetchJson(url);
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
      const icon = normalizeNinjaIcon(meta?.image || meta?.icon || line?.icon);
      const category = entry.category || meta?.category || line?.category;
      const id = meta?.detailsId || line?.detailsId || lineId || name;
      const item = toNinjaItem({ name, value, category, icon, id });
      if (item) items.push(item);
    });

    const updatedAt = parseTimestamp(data?.updated)
      || parseTimestamp(data?.updatedAt)
      || parseTimestamp(data?.generatedAt)
      || parseTimestamp(response?.headers?.get('last-modified'));
    return { items, updatedAt, url };
  }

  async function fetchNinjaSpiritBeastPricesForLeague({
    leagueValue,
    ninjaApiBase,
    fetchJson,
    parseTimestamp,
    normalizeText
  }) {
    const targetKeys = buildNormalizedNameSet(SPIRIT_BEAST_DROP_NAMES, normalizeText);
    const seen = new Set();
    const items = [];
    const results = [];
    let updatedAt = null;
    const beastEntry = { type: 'Beast', category: 'monsters' };

    const collectMatches = (list) => {
      (list || []).forEach((item) => {
        const key = normalizeText(item?.name);
        if (!key || !targetKeys.has(key) || seen.has(key)) return;
        seen.add(key);
        items.push(item);
      });
    };

    const ninjaExchangeApiBase = buildNinjaExchangeBase(ninjaApiBase);
    if (ninjaExchangeApiBase) {
      try {
        const exchangeResult = await fetchNinjaExchangeOverview({
          leagueValue,
          entry: beastEntry,
          ninjaExchangeApiBase,
          fetchJson,
          parseTimestamp
        });
        collectMatches(exchangeResult.items);
        updatedAt = pickLatestTimestamp(updatedAt, exchangeResult.updatedAt);
        results.push({
          status: 'ok',
          source: 'exchange:Beast',
          items: exchangeResult.items.length,
          matched: items.length,
          url: exchangeResult.url
        });
      } catch (err) {
        const url = `${ninjaExchangeApiBase}/overview?league=${encodeURIComponent(leagueValue)}&type=Beast`;
        results.push({
          status: 'error',
          source: 'exchange:Beast',
          error: err?.message || 'unknown',
          url
        });
      }
    }

    if (seen.size < targetKeys.size) {
      try {
        const stashResult = await fetchNinjaOverview({
          leagueValue,
          entry: beastEntry,
          isCurrency: false,
          ninjaApiBase,
          fetchJson,
          parseTimestamp
        });
        collectMatches(stashResult.items);
        updatedAt = pickLatestTimestamp(updatedAt, stashResult.updatedAt);
        results.push({
          status: 'ok',
          source: 'item:Beast',
          items: stashResult.items.length,
          matched: items.length,
          url: stashResult.url
        });
      } catch (err) {
        const url = `${ninjaApiBase}/${ninjaEndpointPath(false)}?league=${encodeURIComponent(leagueValue)}&type=Beast`;
        results.push({
          status: 'error',
          source: 'item:Beast',
          error: err?.message || 'unknown',
          url
        });
      }
    }

    return { items, updatedAt, results };
  }

  async function fetchNinjaPricesForLeague({
    leagueValue,
    ninjaCurrencyTypes,
    ninjaItemTypes,
    ninjaApiBase,
    fetchJson,
    parseTimestamp
  }) {
    let items = [];
    let updatedAt = null;
    const results = [];

    for (const entry of ninjaCurrencyTypes) {
      try {
        const result = await fetchNinjaOverview({
          leagueValue,
          entry,
          isCurrency: true,
          ninjaApiBase,
          fetchJson,
          parseTimestamp
        });
        if (result.items.length) items = items.concat(result.items);
        updatedAt = pickLatestTimestamp(updatedAt, result.updatedAt);
        results.push({ status: 'ok', source: `currency:${entry.type}`, items: result.items.length, url: result.url });
      } catch (err) {
        const url = `${ninjaApiBase}/${ninjaEndpointPath(true)}?league=${encodeURIComponent(leagueValue)}&type=${encodeURIComponent(entry.type)}`;
        results.push({ status: 'error', source: `currency:${entry.type}`, error: err?.message || 'unknown', url });
      }
    }

    for (const entry of ninjaItemTypes) {
      try {
        const result = await fetchNinjaOverview({
          leagueValue,
          entry,
          isCurrency: false,
          ninjaApiBase,
          fetchJson,
          parseTimestamp
        });
        if (result.items.length) items = items.concat(result.items);
        updatedAt = pickLatestTimestamp(updatedAt, result.updatedAt);
        results.push({ status: 'ok', source: `item:${entry.type}`, items: result.items.length, url: result.url });
      } catch (err) {
        const url = `${ninjaApiBase}/${ninjaEndpointPath(false)}?league=${encodeURIComponent(leagueValue)}&type=${encodeURIComponent(entry.type)}`;
        results.push({ status: 'error', source: `item:${entry.type}`, error: err?.message || 'unknown', url });
      }
    }

    return { items, updatedAt, results };
  }

  function normalizeCategorySlug(value) {
    if (value == null) return '';
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!trimmed || /^\d+$/.test(trimmed)) return '';
      return trimmed;
    }
    if (typeof value === 'number') return '';
    if (typeof value === 'object') {
      const candidate = value.slug || value.category || value.name || value.label || value.text || value.id;
      return normalizeCategorySlug(candidate);
    }
    return normalizeCategorySlug(String(value));
  }

  function slimWatchItems(items) {
    return items.map((item) => ({
      id: item.id,
      name: item.name,
      category: item.category,
      icon: item.icon,
      linkCount: item.linkCount,
      min: item.min,
      mean: item.mean,
      max: item.max
    }));
  }

  function createPricingService({
    state,
    getLeagues,
    usingStaticData,
    getStaticPricesBase,
    getStaticPricesBaseForSource,
    slugifyLeague,
    withCacheBust,
    parseTimestamp,
    safeNumber,
    formatUpdatedAt,
    setStatus,
    safeRender,
    updateMinValueInput,
    extractWatchItems,
    extractWatchCategories,
    findUpdatedAt,
    indexWatchData,
    buildWatchCategoriesEndpoint,
    buildWatchGetEndpoint,
    buildWatchExchangeEndpoint,
    normalizeText,
    watchApiBase,
    ninjaApiBase,
    ninjaCurrencyTypes,
    ninjaItemTypes,
    repository = null,
    priceCacheTtlMs = 60 * 60 * 1000,
    getLocalStorage = () => global.localStorage,
    fetchImpl = global.fetch.bind(global),
    consoleImpl = global.console
  }) {
      const repo = repository
      || (global.PoeRepositories ? global.PoeRepositories.createPricingRepository() : null);

    async function fetchJson(url, options = {}) {
      if (repo) return repo.fetchJson(url, options);
      const requestInit = {};
      if (options.cacheMode) {
        requestInit.cache = options.cacheMode;
      } else if (options.forceRefresh) {
        requestInit.cache = 'no-store';
      }
      const response = await fetchImpl(url, requestInit);
      if (!response.ok) throw new Error(String(response.status));
      return { data: await response.json(), response };
    }

    function loadFreshPriceCache(leagueCandidates) {
      if (!repo) return null;
      return repo.loadFreshPriceCache(leagueCandidates, priceCacheTtlMs);
    }

    function savePriceCacheEntry(leagueValue, items, updatedAt) {
      if (!repo) return;
      repo.savePriceCacheEntry(leagueValue, items, updatedAt);
    }

    function staticPricesBaseForSource(source) {
      if (typeof getStaticPricesBaseForSource === 'function') {
        return getStaticPricesBaseForSource(source);
      }
      return getStaticPricesBase();
    }

    function isLocalHostRuntime() {
      const host = String(global?.location?.hostname || '').toLowerCase();
      return host === 'localhost' || host === '127.0.0.1' || host === '::1';
    }

    async function fetchStaticCompactForSource(source, leagueValues, forceRefresh = false) {
      const base = staticPricesBaseForSource(source);
      if (!base) return { items: [], updatedAt: null, results: [] };
      const slugs = Array.from(new Set(
        (leagueValues || [])
          .map((value) => slugifyLeague(value))
          .filter(Boolean)
      ));
      if (!slugs.length) return { items: [], updatedAt: null, results: [] };

      const results = [];
      for (const slug of slugs) {
        const url = withCacheBust(`${base}/${slug}/compact.json`, forceRefresh);
        try {
          const { data } = await fetchJson(url, { cacheMode: forceRefresh ? 'no-store' : 'default' });
          const items = Array.isArray(data?.items) ? data.items : extractWatchItems(data);
          if (!items.length) throw new Error('empty');
          results.push({ status: 'ok', source: `static:${source}`, items: items.length, url });
          const updatedAt = parseTimestamp(data?.updatedAt) || parseTimestamp(data?.generatedAt);
          return { items, updatedAt, results };
        } catch (err) {
          results.push({
            status: 'error',
            source: `static:${source}`,
            error: err?.message || 'unknown',
            url
          });
        }
      }
      return { items: [], updatedAt: null, results };
    }

    function commitWatchData(items, leagueValue, base, updatedAt) {
      const slimItems = slimWatchItems(items);
      state.priceData = indexWatchData(items);
      state.pricingLeague = leagueValue;
      state.watchBase = base;
      state.priceUpdatedAt = updatedAt;
      savePriceCacheEntry(leagueValue, slimItems, updatedAt);
    }

    async function fetchPrices(forceRefresh = false) {
      const usingStatic = usingStaticData();
      const sourceLabel = state.priceSource === 'poe-ninja' ? 'poe.ninja' : 'poe.watch';
      setStatus(usingStatic ? `Loading cached ${sourceLabel} prices…` : `Fetching ${sourceLabel} prices…`);
      state.priceData = null;
      state.fallbackHits = new Map();
      state.fetchResults = [];
      const liveBase = state.priceSource === 'poe-ninja' ? ninjaApiBase : watchApiBase;
      state.watchBase = usingStatic ? `${state.priceSource}:static` : liveBase;
      state.priceUpdatedAt = null;

      const leagueCandidates = Array.from(new Set([state.leagueWatchId, state.leagueText, state.leagueId].filter(Boolean)));
      let pricingLeague = leagueCandidates[0] || state.leagueId;

      if (usingStatic) {
        const leagues = getLeagues();
        const candidates = leagueCandidates.length
          ? leagueCandidates
          : (leagues?.[0]?.options?.[0]?.id ? [leagues[0].options[0].id] : []);
        for (const candidate of candidates) {
          const slug = slugifyLeague(candidate);
          if (!slug) continue;
          const url = withCacheBust(`${getStaticPricesBase()}/${slug}/compact.json`, forceRefresh);
          try {
            const { data } = await fetchJson(url, { cacheMode: forceRefresh ? 'no-store' : 'default' });
            let items = Array.isArray(data?.items) ? data.items : extractWatchItems(data);
            if (!items.length) throw new Error('empty');
            const leagueLabel = data?.league?.watch || data?.league?.id || candidate;
            let updatedAt = parseTimestamp(data?.updatedAt) || parseTimestamp(data?.generatedAt);

            if (
              state.priceSource === 'poe-watch'
              && !hasAllNamedItems(items, SPIRIT_BEAST_DROP_NAMES, normalizeText)
            ) {
              const supplemental = await fetchStaticCompactForSource(
                'poe-ninja',
                [leagueLabel, candidate, state.leagueText, state.leagueWatchId, state.leagueId],
                forceRefresh
              );
              state.fetchResults.push(...supplemental.results);
              const merged = mergeNamedItems(items, supplemental.items, SPIRIT_BEAST_DROP_NAMES, normalizeText);
              items = merged.items;
              if (merged.added) {
                updatedAt = pickLatestTimestamp(updatedAt, supplemental.updatedAt);
                state.fetchResults.push({
                  status: 'ok',
                  source: 'supplement:spirit-beasts',
                  items: merged.added,
                  league: leagueLabel
                });
              }

              if (isLocalHostRuntime() && !hasAllNamedItems(items, SPIRIT_BEAST_DROP_NAMES, normalizeText)) {
                const apiSupplemental = await fetchNinjaSpiritBeastPricesForLeague({
                  leagueValue: leagueLabel || candidate,
                  ninjaApiBase,
                  fetchJson,
                  parseTimestamp,
                  normalizeText
                });
                state.fetchResults.push(...apiSupplemental.results);
                const apiMerged = mergeNamedItems(items, apiSupplemental.items, SPIRIT_BEAST_DROP_NAMES, normalizeText);
                items = apiMerged.items;
                if (apiMerged.added) {
                  updatedAt = pickLatestTimestamp(updatedAt, apiSupplemental.updatedAt);
                  state.fetchResults.push({
                    status: 'ok',
                    source: 'supplement:spirit-beasts-api',
                    items: apiMerged.added,
                    league: leagueLabel
                  });
                }
              }
            }

            state.priceData = indexWatchData(items);
            state.pricingLeague = leagueLabel;
            state.watchBase = `${state.priceSource}:static`;
            state.priceUpdatedAt = updatedAt;
            state.fetchResults.push({ status: 'ok', source: 'static', items: items.length, league: leagueLabel, url });
            pricingLeague = leagueLabel;
            break;
          } catch (err) {
            state.fetchResults.push({
              status: 'error',
              source: 'static',
              error: err?.message || 'unknown',
              url
            });
          }
        }
      } else {
        if (!forceRefresh) {
          const cached = loadFreshPriceCache(leagueCandidates);
          if (cached?.entry) {
            const { leagueValue, entry } = cached;
            const cachedItems = Array.isArray(entry.items) ? entry.items : [];
            const cacheHasIcons = cachedItems.some((item) => Boolean(item?.icon));
            const cacheHasSpiritBeasts = hasAllNamedItems(cachedItems, SPIRIT_BEAST_DROP_NAMES, normalizeText);
            if (!cacheHasIcons && state.priceSource === 'poe-watch') {
              state.fetchResults.push({
                status: 'stale',
                source: 'cache',
                items: cachedItems.length,
                league: leagueValue,
                reason: 'icons-missing'
              });
            } else if (!cacheHasSpiritBeasts) {
              state.fetchResults.push({
                status: 'stale',
                source: 'cache',
                items: cachedItems.length,
                league: leagueValue,
                reason: 'spirit-beasts-missing'
              });
            } else {
              state.priceData = indexWatchData(cachedItems);
              state.pricingLeague = leagueValue;
              state.watchBase = 'cache';
              state.priceUpdatedAt = parseTimestamp(entry.updatedAt);
              state.fetchResults.push({ status: 'cache', source: 'cache', items: entry.items.length, league: leagueValue });
              const divine = state.priceData.byLower.get('divine orb')?.[0];
              state.divineChaos = divine ? safeNumber(divine.mean ?? divine.min ?? divine.max) : null;
              if (state.divineChaos) {
                getLocalStorage().setItem('poeBossDivineChaos', String(state.divineChaos));
              }
              updateMinValueInput();
              const updatedLabel = state.priceUpdatedAt ? ` Updated ${formatUpdatedAt(state.priceUpdatedAt)}.` : '';
              setStatus(`Prices loaded for ${leagueValue}.${updatedLabel}`);
              safeRender();
              return;
            }
          }
        }
        if (state.priceSource === 'poe-ninja') {
          const base = ninjaApiBase;
          for (const leagueValue of leagueCandidates) {
            try {
              const result = await fetchNinjaPricesForLeague({
                leagueValue,
                ninjaCurrencyTypes,
                ninjaItemTypes,
                ninjaApiBase,
                fetchJson,
                parseTimestamp
              });
              let mergedItems = result.items;
              let mergedUpdatedAt = result.updatedAt;
              if (!hasAllNamedItems(mergedItems, SPIRIT_BEAST_DROP_NAMES, normalizeText)) {
                const supplemental = await fetchNinjaSpiritBeastPricesForLeague({
                  leagueValue,
                  ninjaApiBase,
                  fetchJson,
                  parseTimestamp,
                  normalizeText
                });
                const merged = mergeNamedItems(mergedItems, supplemental.items, SPIRIT_BEAST_DROP_NAMES, normalizeText);
                mergedItems = merged.items;
                if (merged.added) {
                  mergedUpdatedAt = pickLatestTimestamp(mergedUpdatedAt, supplemental.updatedAt);
                  state.fetchResults.push({
                    status: 'ok',
                    source: 'supplement:spirit-beasts',
                    items: merged.added,
                    league: leagueValue
                  });
                }
                state.fetchResults.push(...supplemental.results);
              }
              state.fetchResults.push(...result.results);
              if (!mergedItems.length) throw new Error('empty');
              commitWatchData(mergedItems, leagueValue, base, mergedUpdatedAt);
              pricingLeague = leagueValue;
              break;
            } catch (err) {
              state.fetchResults.push({
                status: 'error',
                source: 'poe.ninja',
                error: err?.message || 'unknown',
                url: `${base}/getindexstate`
              });
            }
          }
        } else {
          const base = watchApiBase;
          const categoriesEndpoint = buildWatchCategoriesEndpoint(base);
          const getEndpoint = buildWatchGetEndpoint(base);
          for (const leagueValue of leagueCandidates) {
            let ratioItems = [];
            let ratioUpdatedAt = null;
            const ratioUrl = buildWatchExchangeEndpoint(base, leagueValue);
            if (ratioUrl) {
              try {
                const ratioResult = await fetchJson(ratioUrl, { forceRefresh });
                const ratioData = ratioResult.data;
                const ratio = indexRatioItems(extractRatioItems(ratioData), normalizeText, parseTimestamp);
                ratioItems = ratio.items;
                ratioUpdatedAt = ratio.updatedAt;
                state.fetchResults.push({
                  status: 'ok',
                  source: 'ratios',
                  items: ratioItems.length,
                  url: ratioUrl
                });
              } catch (err) {
                state.fetchResults.push({
                  status: 'error',
                  source: 'ratios',
                  error: err?.message || 'unknown',
                  url: ratioUrl
                });
              }
            }

            let items = [];
            let updatedAt = null;
            if (categoriesEndpoint && getEndpoint) {
              try {
                const categoryResult = await fetchJson(categoriesEndpoint, { forceRefresh });
                const data = categoryResult.data;
                const categories = Array.from(new Set(extractWatchCategories(data)
                  .map(normalizeCategorySlug)
                  .filter((category) => {
                    if (!category) return false;
                    const key = String(category).trim().toLowerCase();
                    return !UNSUPPORTED_WATCH_GET_CATEGORIES.has(key);
                  })));
                if (!categories.length) throw new Error('empty');
                state.fetchResults.push({ status: 'ok', source: 'categories', items: categories.length, url: categoriesEndpoint });
                for (const category of categories) {
                  const url = getEndpoint
                    .replace('{LEAGUE}', encodeURIComponent(leagueValue))
                    .replace('{CATEGORY}', encodeURIComponent(category));
                  try {
                    const catResult = await fetchJson(url, { forceRefresh });
                    const catData = catResult.data;
                    const catItems = extractWatchItems(catData).map((item) => {
                      if (item && item.category == null && category) {
                        return { ...item, category };
                      }
                      return item;
                    });
                    if (catItems.length) items.push(...catItems);
                    updatedAt = pickLatestTimestamp(updatedAt, findUpdatedAt(catData, catResult.response));
                    state.fetchResults.push({
                      status: 'ok',
                      source: `get:${category}`,
                      items: catItems.length,
                      url
                    });
                  } catch (err) {
                    state.fetchResults.push({
                      status: 'error',
                      source: `get:${category}`,
                      error: err?.message || 'unknown',
                      url
                    });
                  }
                }
              } catch (err) {
                state.fetchResults.push({
                  status: 'error',
                  source: 'categories',
                  error: err?.message || 'unknown',
                  url: categoriesEndpoint
                });
              }
            }

            const mergedItems = mergeRatioItems(ratioItems, items, normalizeText);
            let mergedUpdatedAt = pickLatestTimestamp(ratioUpdatedAt, updatedAt);
            let mergedWithSupplement = { items: mergedItems, added: 0 };
            if (!hasAllNamedItems(mergedItems, SPIRIT_BEAST_DROP_NAMES, normalizeText)) {
              const supplemental = await fetchNinjaSpiritBeastPricesForLeague({
                leagueValue,
                ninjaApiBase,
                fetchJson,
                parseTimestamp,
                normalizeText
              });
              mergedWithSupplement = mergeNamedItems(mergedItems, supplemental.items, SPIRIT_BEAST_DROP_NAMES, normalizeText);
              state.fetchResults.push(...supplemental.results);
              if (mergedWithSupplement.added) {
                mergedUpdatedAt = pickLatestTimestamp(mergedUpdatedAt, supplemental.updatedAt);
                state.fetchResults.push({
                  status: 'ok',
                  source: 'supplement:spirit-beasts',
                  items: mergedWithSupplement.added,
                  league: leagueValue
                });
              }
            }
            if (mergedWithSupplement.items.length) {
              commitWatchData(mergedWithSupplement.items, leagueValue, base, mergedUpdatedAt);
              pricingLeague = leagueValue;
              break;
            }
          }
        }
      }

      if (!state.priceData) {
        const message = usingStatic
          ? `Failed to load cached ${sourceLabel} prices. Check ${getStaticPricesBase()}/<league>/compact.json.`
          : `Failed to load ${sourceLabel} prices. Check the league name and try again.`;
        setStatus(message, true);
        safeRender();
        return;
      }

      const divine = state.priceData.byLower.get('divine orb')?.[0];
      const divineChaos = divine ? safeNumber(divine.mean ?? divine.min ?? divine.max) : null;
      state.divineChaos = divineChaos;
      if (state.divineChaos) {
        getLocalStorage().setItem('poeBossDivineChaos', String(state.divineChaos));
      }
      updateMinValueInput();

      const failures = state.fetchResults.filter((r) => r && r.status === 'error');
      const updatedLabel = state.priceUpdatedAt ? ` Updated ${formatUpdatedAt(state.priceUpdatedAt)}.` : '';
      setStatus(`Prices loaded for ${pricingLeague}.${updatedLabel}`);
      if (failures.length && state.debug) consoleImpl.table?.(failures);
      safeRender();
    }

    return Object.freeze({
      fetchPrices
    });
  }

  global.PoePricing = Object.freeze({
    createPricingService
  });
})(window);
