    const BASE_LEAGUE = '';
    const BASE_PRICE_MODE = 'min';
    const BASE_DISPLAY_CURRENCY = 'chaos';
    const BASE_MIN_VALUE_ENABLED = false;
    const BASE_MIN_VALUE_CHAOS = 10;
    const BASE_DEBUG = false;

    const LEGACY_LEAGUE_ALIASES = {
      standard: 'Standard',
      hardcore: 'Hardcore',
      keepers: 'Keepers',
      keepershc: 'Hardcore+Keepers',
      hckeepers: 'Hardcore+Keepers',
      'hardcore keepers': 'Hardcore+Keepers',
      'phrecia 2.0': 'Phrecia 2.0',
      'phrecia2.0': 'Phrecia 2.0'
    };

    const DEFAULT_LEAGUE_RAW = localStorage.getItem('poeBossLeague') || BASE_LEAGUE;
    const DEFAULT_LEAGUE = normalizeLeagueKey(DEFAULT_LEAGUE_RAW) || BASE_LEAGUE;
    const DEFAULT_PRICE_MODE = localStorage.getItem('poeBossPriceMode') || BASE_PRICE_MODE;
    const manualPriceKey = 'poeBossManualPrices';
    const manualCostKey = 'poeBossManualCosts';
    const ignoreDropsKey = 'poeBossIgnoreDrops';
    const displayCurrencyKey = 'poeBossDisplayCurrency';
    const priceCacheKey = 'poeBossPriceCacheV1';
    const priceCacheTtlMs = 60 * 60 * 1000;
    const leagueCacheKey = 'poeBossLeagueCacheV2';
    const leagueCacheTtlMs = 6 * 60 * 60 * 1000;

    let LEAGUES = [];

    const MANUAL_PRICES = JSON.parse(localStorage.getItem(manualPriceKey) || '{}');
    const MANUAL_COSTS = JSON.parse(localStorage.getItem(manualCostKey) || '{}');
    const IGNORED_DROPS = JSON.parse(localStorage.getItem(ignoreDropsKey) || '{}');

    const IS_FILE_ORIGIN = window.location.protocol === 'file:';
    const IS_LOCAL_HOST = ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname);
    const STATIC_DATA_BASE = 'data';
    const STATIC_LEAGUES_URL = `${STATIC_DATA_BASE}/leagues.json`;
    const STATIC_PRICES_BASE = `${STATIC_DATA_BASE}/prices`;
    const USE_STATIC_DATA = !IS_LOCAL_HOST;
    const WATCH_API_BASE = USE_STATIC_DATA ? '' : 'https://api.poe.watch';
    const WATCH_DETAILS_BASE = 'https://poe.watch/detailed';
    const WATCH_GAME = 'poe1';

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

    function normalizeWatchBase(base) {
      return String(base || '').replace(/\/$/, '');
    }

    function buildWatchCategoriesEndpoint(base) {
      const root = normalizeWatchBase(base);
      if (!root) return '';
      const suffix = WATCH_GAME ? `?game=${encodeURIComponent(WATCH_GAME)}` : '';
      return `${root}/categories${suffix}`;
    }

    function buildWatchGetEndpoint(base) {
      const root = normalizeWatchBase(base);
      if (!root) return '';
      const suffix = WATCH_GAME ? `&game=${encodeURIComponent(WATCH_GAME)}` : '';
      return `${root}/get?league={LEAGUE}&category={CATEGORY}${suffix}`;
    }

    let BOSS_DATA = [];

    async function loadBossData() {
      try {
        const resp = await fetch('boss-data.json');
        if (!resp.ok) throw new Error(String(resp.status));
        const data = await resp.json();
        if (!Array.isArray(data)) throw new Error('invalid data');
        return data;
      } catch (err) {
        console.error('Failed to load boss-data.json', err);
        return [];
      }
    }

    const storedCurrency = localStorage.getItem(displayCurrencyKey) || 'chaos';
    const state = {
      leagueId: DEFAULT_LEAGUE,
      leagueText: DEFAULT_LEAGUE,
      leagueWatchId: DEFAULT_LEAGUE,
      leagueSource: 'fallback',
      leagueUpdatedAt: null,
      priceMode: DEFAULT_PRICE_MODE,
      displayCurrency: storedCurrency === 'divine' ? 'divine' : 'chaos',
      priceData: null,
      watchBase: null,
      pricingLeague: null,
      fetchResults: [],
      priceUpdatedAt: null,
      divineChaos: null,
      minValueFilter: false,
      minValueThresholdChaos: 10,
      searchQuery: ''
    };

    const leagueSelect = document.getElementById('leagueSelect');
    const priceModeInput = document.getElementById('priceMode');
    const currencyInput = document.getElementById('displayCurrency');
    const refreshButton = document.getElementById('refresh');
    const resetButton = document.getElementById('resetAll');
    const statusEl = document.getElementById('status');
    const debugToggle = document.getElementById('debugToggle');
    const debugEl = document.getElementById('debug');
    const debugContent = document.getElementById('debugContent');
    const copyDebug = document.getElementById('copyDebug');
    const bossList = document.getElementById('bossList');
    const minValueToggle = document.getElementById('minValueToggle');
    const minValueInput = document.getElementById('minValueInput');
    const searchInput = document.getElementById('searchInput');

    function normalizeLeagueKey(value) {
      const raw = String(value || '').trim();
      if (!raw) return '';
      const lower = raw.toLowerCase();
      return LEGACY_LEAGUE_ALIASES[lower] || raw;
    }

    function normalizeLeagueCompare(value) {
      return String(value || '').trim().toLowerCase();
    }

    function flattenLeagues(groups = LEAGUES) {
      return (groups || []).flatMap((group) => (Array.isArray(group.options) ? group.options : []));
    }

    function findLeagueByKey(key) {
      const normalized = normalizeLeagueCompare(normalizeLeagueKey(key));
      if (!normalized) return null;
      return (
        flattenLeagues().find((option) => {
          return [option.id, option.watch, option.text].some(
            (value) => normalizeLeagueCompare(value) === normalized
          );
        }) || null
      );
    }



    function applyLeagueSelection(preferred, { persist = false, allowFallback = true } = {}) {
      const match = findLeagueByKey(preferred);
      const fallbackValue = allowFallback ? (leagueSelect?.options?.[0]?.value || '') : '';
      const nextId = match?.id || fallbackValue || '';
      const changed = nextId !== state.leagueId;
      state.leagueId = nextId;
      if (leagueSelect && nextId) leagueSelect.value = nextId;
      state.leagueText = nextId ? leagueTextFor(state.leagueId) : '';
      state.leagueWatchId = nextId ? leagueWatchFor(state.leagueId) : '';
      if (persist) localStorage.setItem('poeBossLeague', state.leagueId);
      return changed;
    }

    function buildLeagueSelect() {
      leagueSelect.innerHTML = '';
      LEAGUES.forEach((groupDef) => {
        const group = document.createElement('optgroup');
        group.label = groupDef.label;
        groupDef.options.forEach((league) => {
          const option = document.createElement('option');
          option.value = league.id;
          option.textContent = league.text;
          option.dataset.watch = league.watch || league.id;
          group.appendChild(option);
        });
        leagueSelect.appendChild(group);
      });
    }

    function leagueTextFor(id) {
      const match = findLeagueByKey(id);
      return match ? match.text : id;
    }

    function leagueWatchFor(id) {
      const match = findLeagueByKey(id);
      return match ? match.watch || match.id || match.text : id;
    }

    function loadLeagueCache() {
      return null;
    }

    function saveLeagueCache(groups) {
      // Caching disabled for testing.
    }

    function leagueCacheIsFresh(entry) {
      if (!entry || entry.source !== 'api' || !entry.fetchedAt || !Array.isArray(entry.groups)) return false;
      return Date.now() - entry.fetchedAt < leagueCacheTtlMs;
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

    function normalizeLeagueGroups(data) {
      const raw = Array.isArray(data)
        ? data
        : (Array.isArray(data?.leagues)
            ? data.leagues
            : (Array.isArray(data?.items)
                ? data.items
                : (Array.isArray(data?.result)
                    ? data.result
                    : (Array.isArray(data?.data) ? data.data : null))));
      if (!raw || !raw.length) return null;
      const seen = new Set();
      const options = raw.map(normalizeLeagueEntry).filter((option) => {
        if (!option) return false;
        const key = normalizeLeagueCompare(option.watch || option.id || option.text);
        if (!key || seen.has(key)) return false;
        seen.add(key);
        if (option.active === false) return false;
        return true;
      });
      if (!options.length) return null;
      options.sort((a, b) => {
        const aStart = a.startDate ? a.startDate.getTime() : 0;
        const bStart = b.startDate ? b.startDate.getTime() : 0;
        if (aStart !== bStart) return bStart - aStart;
        return String(a.text || a.id).localeCompare(String(b.text || b.id));
      });
      return [{ label: 'Leagues', options }];
    }

    function buildWatchLeagueEndpoints(base) {
      const root = String(base || '').replace(/\/$/, '');
      if (!root) return [];
      return [`${root}/leagues`];
    }

    async function loadLeagues(forceRefresh = false) {
      if (USE_STATIC_DATA) {
        try {
          const url = withCacheBust(STATIC_LEAGUES_URL, forceRefresh);
          const resp = await fetch(url, { cache: forceRefresh ? 'no-store' : 'default' });
          if (!resp.ok) throw new Error(String(resp.status));
          const data = await resp.json();
          const raw = data?.leagues ?? data?.items ?? data?.data ?? data;
          const groups = normalizeLeagueGroups(raw);
          if (!groups) throw new Error('empty');
          LEAGUES = groups;
          state.leagueSource = 'static';
          state.leagueUpdatedAt = parseTimestamp(data?.generatedAt || data?.updatedAt || data?.fetchedAt);
          buildLeagueSelect();
          applyLeagueSelection(state.leagueId || DEFAULT_LEAGUE, { persist: true, allowFallback: false });
          return true;
        } catch (err) {
          state.leagueSource = 'static';
          state.leagueUpdatedAt = null;
          return false;
        }
      }

      if (IS_FILE_ORIGIN) return false;
      const cached = loadLeagueCache();
      if (leagueCacheIsFresh(cached)) {
        LEAGUES = cached.groups;
        state.leagueSource = 'cache';
        state.leagueUpdatedAt = cached.fetchedAt ? new Date(cached.fetchedAt) : null;
        buildLeagueSelect();
        applyLeagueSelection(state.leagueId || DEFAULT_LEAGUE, { persist: true, allowFallback: false });
        return true;
      }

      const endpoints = buildWatchLeagueEndpoints(WATCH_API_BASE);
      for (const url of endpoints) {
        try {
          const resp = await fetch(url);
          if (!resp.ok) throw new Error(String(resp.status));
          const data = await resp.json();
          const groups = normalizeLeagueGroups(data);
          if (!groups) throw new Error('empty');
          LEAGUES = groups;
          saveLeagueCache(groups);
          state.leagueSource = 'api';
          state.leagueUpdatedAt = new Date();
          buildLeagueSelect();
          applyLeagueSelection(state.leagueId || DEFAULT_LEAGUE, { persist: true, allowFallback: false });
          return true;
        } catch (err) {
          // Try next endpoint.
        }
      }
      state.leagueSource = 'fallback';
      state.leagueUpdatedAt = null;
      return false;
    }

    function selectMostRecentLeague() {
      const options = flattenLeagues();
      if (!options.length) return false;
      const maxStart = options.reduce((best, option) => {
        const start = option.startDate ? option.startDate.getTime() : 0;
        return Math.max(best, start);
      }, 0);
      const candidates = options.filter((option) => {
        const start = option.startDate ? option.startDate.getTime() : 0;
        return start === maxStart;
      });
      const preferred = candidates.find((option) => !isDisfavoredLeague(option));
      const pick = preferred || candidates[0] || options[0];
      return applyLeagueSelection(pick.id, { persist: true });
    }

    function isDisfavoredLeague(option) {
      const raw = String(option?.text || option?.id || option?.watch || '');
      const normalized = raw.toLowerCase();
      return normalized.includes('hardcore') || /solo self[- ]found/.test(normalized);
    }

    buildLeagueSelect();

    priceModeInput.value = state.priceMode;
    currencyInput.value = state.displayCurrency;
    applyLeagueSelection(DEFAULT_LEAGUE, { allowFallback: false });

    const minPref = localStorage.getItem('poeBossMinValueEnabled') || 'off';
    const minThresholdPref = Number(localStorage.getItem('poeBossMinValueChaos') || '10');
    state.minValueFilter = minPref === 'on';
    state.minValueThresholdChaos = Number.isFinite(minThresholdPref) ? minThresholdPref : 10;
    minValueToggle.checked = state.minValueFilter;

    if (searchInput) {
      searchInput.value = state.searchQuery;
      searchInput.addEventListener('input', (event) => {
        state.searchQuery = event.target.value || '';
        safeRender();
      });
      searchInput.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
          searchInput.value = '';
          state.searchQuery = '';
          safeRender();
        }
      });
    }


    function updateMinValueInput() {
      const threshold = state.minValueThresholdChaos || 0;
      if (state.displayCurrency === 'divine' && state.divineChaos) {
        minValueInput.value = (threshold / state.divineChaos).toFixed(2);
        minValueInput.step = '0.01';
      } else {
        minValueInput.value = threshold.toFixed(1);
        minValueInput.step = '0.1';
      }
    }

    updateMinValueInput();

    minValueToggle.addEventListener('change', () => {
      state.minValueFilter = minValueToggle.checked;
      localStorage.setItem('poeBossMinValueEnabled', state.minValueFilter ? 'on' : 'off');
      safeRender();
    });

    minValueInput.addEventListener('change', () => {
      const raw = Number(minValueInput.value);
      if (!Number.isFinite(raw)) return;
      if (state.displayCurrency === 'divine' && state.divineChaos) {
        state.minValueThresholdChaos = raw * state.divineChaos;
      } else {
        state.minValueThresholdChaos = raw;
      }
      localStorage.setItem('poeBossMinValueChaos', state.minValueThresholdChaos.toString());
      safeRender();
    });

    leagueSelect.addEventListener('change', () => {
      state.leagueId = leagueSelect.value;
      state.leagueText = leagueTextFor(state.leagueId);
      state.leagueWatchId = leagueWatchFor(state.leagueId);
      localStorage.setItem('poeBossLeague', state.leagueId);
      fetchPrices();
    });

    currencyInput.addEventListener('change', () => {
      state.displayCurrency = currencyInput.value;
      localStorage.setItem(displayCurrencyKey, state.displayCurrency);
      updateMinValueInput();
      safeRender();
    });

    priceModeInput.addEventListener('change', () => {
      state.priceMode = priceModeInput.value;
      localStorage.setItem('poeBossPriceMode', state.priceMode);
      safeRender();
    });

    if (refreshButton) {
      refreshButton.addEventListener('click', () => {
        state.leagueId = leagueSelect.value;
        state.leagueText = leagueTextFor(state.leagueId);
        state.leagueWatchId = leagueWatchFor(state.leagueId);
        localStorage.setItem('poeBossLeague', state.leagueId);
        fetchPrices(true);
      });
    }

    function clearObject(obj) {
      Object.keys(obj).forEach((key) => delete obj[key]);
    }

    if (resetButton) {
      resetButton.addEventListener('click', () => {
        const previousLeague = state.leagueId;

        clearObject(MANUAL_PRICES);
        clearObject(MANUAL_COSTS);
        clearObject(IGNORED_DROPS);

        localStorage.removeItem(manualPriceKey);
        localStorage.removeItem(manualCostKey);
        localStorage.removeItem(ignoreDropsKey);
        localStorage.removeItem('poeBossLeague');
        localStorage.removeItem('poeBossPriceMode');
        localStorage.removeItem(displayCurrencyKey);
        localStorage.removeItem('poeBossMinValueEnabled');
        localStorage.removeItem('poeBossMinValueChaos');
        localStorage.removeItem('poeBossDebug');

        applyLeagueSelection(BASE_LEAGUE);
        state.priceMode = BASE_PRICE_MODE;
        state.displayCurrency = BASE_DISPLAY_CURRENCY;
        state.minValueFilter = BASE_MIN_VALUE_ENABLED;
        state.minValueThresholdChaos = BASE_MIN_VALUE_CHAOS;
        state.debug = BASE_DEBUG;

        priceModeInput.value = state.priceMode;
        currencyInput.value = state.displayCurrency;
        minValueToggle.checked = state.minValueFilter;
        debugToggle.checked = state.debug;
        updateMinValueInput();

        if (previousLeague !== state.leagueId) {
          fetchPrices();
        } else {
          safeRender();
          setStatus('Custom values and selections reset.');
        }
      });
    }


    function setStatus(text, isError) {
      statusEl.textContent = text;
      statusEl.classList.toggle('error', Boolean(isError));
    }

    function setDebug(text) {
      if (!state.debug) {
        debugEl.style.display = 'none';
        return;
      }
      debugEl.style.display = 'block';
      debugContent.textContent = text;
    }

    function slugify(text) {
      return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    }

    function itemKey(item) {
      const variant = item.variant ? `::${item.variant}` : '';
      return `${item.name}${variant}`;
    }

    function costKey(item) {
      const variant = item.variant ? `::${item.variant}` : '';
      return `cost::${item.name}${variant}`;
    }

    function isExcluded(item) {
      return Boolean(IGNORED_DROPS[itemKey(item)]);
    }

    function normalizeText(text) {
      return String(text || '')
        .toLowerCase()
        .replace(/^the\\s+/, '')
        .replace(/[’']/g, '')
        .replace(/[^a-z0-9]/g, '');
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

    function bossMatchesQuery(boss, queryLower, queryNormalized) {
      if (!queryLower) return true;
      const parts = [
        boss?.name,
        boss?.id,
        boss?.tier,
        boss?.note
      ];
      (boss?.entry || []).forEach((item) => {
        parts.push(item?.name, item?.note, item?.variant);
        (item?.types || []).forEach((type) => parts.push(type));
      });
      (boss?.groups || []).forEach((group) => {
        parts.push(group?.label, group?.type);
        (group?.items || []).forEach((item) => {
          parts.push(item?.name, item?.note, item?.variant);
          (item?.types || []).forEach((type) => parts.push(type));
        });
      });
      const raw = parts.filter(Boolean).join(' ').toLowerCase();
      if (raw.includes(queryLower)) return true;
      if (!queryNormalized) return false;
      const normalized = normalizeText(raw);
      return normalized.includes(queryNormalized);
    }

    function withCacheBust(url, enabled) {
      if (!enabled) return url;
      const separator = url.includes('?') ? '&' : '?';
      return `${url}${separator}t=${Date.now()}`;
    }

    function parseTimestamp(value) {
      if (value == null) return null;
      if (value instanceof Date && !Number.isNaN(value.valueOf())) return value;
      if (typeof value === 'number' && Number.isFinite(value)) {
        const ms = value < 1e12 ? value * 1000 : value;
        const date = new Date(ms);
        return Number.isNaN(date.valueOf()) ? null : date;
      }
      if (typeof value === 'string') {
        const trimmed = value.trim();
        if (!trimmed) return null;
        const asNumber = Number(trimmed);
        if (Number.isFinite(asNumber)) return parseTimestamp(asNumber);
        const date = new Date(trimmed);
        return Number.isNaN(date.valueOf()) ? null : date;
      }
      return null;
    }

    function parseLeagueDate(value) {
      const parsed = parseTimestamp(value);
      if (!parsed) return null;
      if (parsed.getUTCFullYear() <= 1900) return null;
      return parsed;
    }

    function findUpdatedAt(data, resp) {
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
      const headerCandidates = [
        resp?.headers?.get('last-modified')
      ];
      for (const candidate of headerCandidates) {
        const parsed = parseTimestamp(candidate);
        if (parsed) return parsed;
      }
      return null;
    }

    function formatUpdatedAt(date) {
      if (!date) return '';
      return date.toLocaleString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit'
      });
    }

    function loadPriceCache() {
      return {};
    }

    function savePriceCache(cache) {
      // Caching disabled for testing.
    }

    function cacheEntryIsFresh(entry) {
      if (!entry || !entry.fetchedAt || !Array.isArray(entry.items)) return false;
      return Date.now() - entry.fetchedAt < priceCacheTtlMs;
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

    function slugifyItem(text) {
      return String(text || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[’']/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
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

    function pickLatestTimestamp(current, next) {
      if (!next) return current;
      if (!current) return next;
      return next.getTime() > current.getTime() ? next : current;
    }

    function commitWatchData(items, leagueValue, base, updatedAt) {
      const slimItems = slimWatchItems(items);
      state.priceData = indexWatchData(slimItems);
      state.pricingLeague = leagueValue;
      state.watchBase = base;
      state.priceUpdatedAt = updatedAt;
      const cache = {
        [leagueValue]: {
          fetchedAt: Date.now(),
          updatedAt: updatedAt ? updatedAt.toISOString() : null,
          items: slimItems
        }
      };
      savePriceCache(cache);
    }

    function categoriesForTypes(types) {
      const categories = new Set();
      (types || []).forEach((type) => {
        const mapped = WATCH_CATEGORY_MAP[type] || [];
        mapped.forEach((category) => categories.add(category));
      });
      return Array.from(categories);
    }

    function findWatchMatches(item, useTypeFilter = true) {
      if (!state.priceData || !state.priceData.byName) return [];
      const rawName = item.alias || item.name;
      const lower = rawName.toLowerCase();
      const normalized = normalizeText(rawName);
      const exactMatches = state.priceData.byLower.get(lower) || [];
      const normalizedMatches = state.priceData.byName.get(normalized) || [];
      let matches = exactMatches.length ? exactMatches.slice() : normalizedMatches.slice();

      if (useTypeFilter) {
        const categories = categoriesForTypes(item.types);
        if (categories.length) {
          matches = matches.filter((match) => categories.includes(match.category));
        }
      }

      return matches;
    }

    function findWatchLine(item, useTypeFilter = true) {
      const matches = findWatchMatches(item, useTypeFilter);
      return matches.length ? matches[0] : null;
    }

    function itemPageUrl(item) {
      const match = findWatchLine(item, true) || findWatchLine(item, false);
      if (!match) return null;
      const league = state.pricingLeague || state.leagueText || leagueTextFor(state.leagueId);
      const leagueParam = league ? `?league=${encodeURIComponent(league)}` : '';
      if (match.id != null) {
        return `${WATCH_DETAILS_BASE}/${encodeURIComponent(match.id)}${leagueParam}`;
      }
      const slug = slugifyItem(item.alias || item.name);
      if (!slug) return null;
      return `${WATCH_DETAILS_BASE}/${slug}${leagueParam}`;
    }

    function itemLabelMarkup(item) {
      const url = itemPageUrl(item);
      const base = url
        ? `<a class="item-link" href="${url}" target="_blank" rel="noreferrer">${item.name}</a>`
        : `<span>${item.name}</span>`;
      const variant = item.variant ? ` <span class="muted">(${item.variant})</span>` : '';
      const note = item.note ? ` <span class="muted">${item.note}</span>` : '';
      return `${base}${variant}${note}`;
    }

    function formatValue(value, chaosPerDivine) {
      if (value == null || Number.isNaN(value)) return '—';
      if (state.displayCurrency === 'divine' && chaosPerDivine) {
        return `${(value / chaosPerDivine).toFixed(2)} div`;
      }
      return `${value.toFixed(1)} c`;
    }

    function formatPercent(value) {
      if (value == null || Number.isNaN(value)) return '—';
      return `${value.toFixed(1)}%`;
    }

    function clamp(value, min, max) {
      return Math.min(Math.max(value, min), max);
    }

    function mixColor(from, to, t) {
      return {
        r: Math.round(from.r + (to.r - from.r) * t),
        g: Math.round(from.g + (to.g - from.g) * t),
        b: Math.round(from.b + (to.b - from.b) * t)
      };
    }

    function rgbString(color) {
      return `rgb(${color.r}, ${color.g}, ${color.b})`;
    }

    function rgbaString(color, alpha) {
      return `rgba(${color.r}, ${color.g}, ${color.b}, ${alpha})`;
    }

    function profitColor(value, maxProfit, minProfit) {
      const yellow = { r: 251, g: 191, b: 36 };
      const green = { r: 34, g: 197, b: 94 };
      const red = { r: 239, g: 68, b: 68 };
      if (!Number.isFinite(value)) return yellow;
      if (value >= 0) {
        const denom = maxProfit > 0 ? maxProfit : 1;
        const t = clamp(value / denom, 0, 1);
        return mixColor(yellow, green, t);
      }
      const denom = minProfit < 0 ? Math.abs(minProfit) : 1;
      const t = clamp(Math.abs(value) / denom, 0, 1);
      return mixColor(yellow, red, t);
    }

    function profitMagnitude(value, maxProfit, minProfit) {
      if (!Number.isFinite(value)) return 0;
      if (value >= 0) {
        return maxProfit > 0 ? clamp(value / maxProfit, 0, 1) : 0;
      }
      return minProfit < 0 ? clamp(Math.abs(value) / Math.abs(minProfit), 0, 1) : 0;
    }

    function percentOf(numerator, denominator) {
      if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) return null;
      return (numerator / Math.abs(denominator)) * 100;
    }

    function safeNumber(value) {
      if (value == null || Number.isNaN(value)) return null;
      return Number(value);
    }

    function priceStrategy(item) {
      return item.strategy || state.priceMode || 'min';
    }

    function priceFieldForStrategy(strategy) {
      if (strategy === 'max') return 'max';
      if (strategy === 'avg') return 'mean';
      return 'min';
    }

    function pickWatchPrice(matches, item) {
      if (!matches.length) return null;
      const field = priceFieldForStrategy(priceStrategy(item));
      const values = matches
        .map((match) => safeNumber(match[field] ?? match.mean ?? match.min ?? match.max))
        .filter((v) => v != null);
      if (!values.length) return null;
      if (field === 'max') return Math.max(...values);
      if (field === 'mean') return values.reduce((a, b) => a + b, 0) / values.length;
      return Math.min(...values);
    }

    function suggestCandidates(item) {
      if (!state.priceData?.items) return [];
      const normalized = normalizeText(item.alias || item.name);
      if (!normalized) return [];
      const candidates = state.priceData.items
        .map((entry) => ({
          name: entry.name || '',
          norm: normalizeText(entry.name || '')
        }))
        .filter((entry) => entry.norm && (entry.norm.includes(normalized) || normalized.includes(entry.norm)))
        .map((entry) => entry.name);
      return Array.from(new Set(candidates)).slice(0, 3);
    }

    function getPrice(item) {
      const key = itemKey(item);
      const manual = MANUAL_PRICES[key];
      if (manual != null && manual !== '') return Number(manual);

      if (item.noPrice) return null;

      if (isExcluded(item)) return 0;

      const matches = findWatchMatches(item, true);
      const price = pickWatchPrice(matches, item);
      if (price != null) return price;

      const fallback = searchAllTypes(item);
      if (fallback != null) {
        recordFallback(item, fallback.type, fallback.price, fallback.icon);
        return fallback.price;
      }

      return null;
    }

    function getCostOverride(item) {
      const manual = MANUAL_COSTS[costKey(item)];
      if (manual != null && manual !== '') return Number(manual);
      return null;
    }

    function searchAllTypes(item) {
      const matches = findWatchMatches(item, false);
      if (!matches.length) return null;
      const price = pickWatchPrice(matches, item);
      if (price == null) return null;
      return { type: matches[0].category || 'unknown', price, icon: matches[0].icon };
    }

    function recordFallback(item, type, price, icon) {
      if (!state.fallbackHits) state.fallbackHits = new Map();
      const key = itemKey(item);
      if (!state.fallbackHits.has(key)) {
        state.fallbackHits.set(key, { name: item.name, type, price, icon });
      }
    }

    function findIcon(item) {
      const manual = MANUAL_PRICES[itemKey(item)];
      const match = findWatchLine(item, true) || findWatchLine(item, false);
      if (match?.icon) return match.icon;
      if (manual && state.debug && state.fallbackHits?.has(itemKey(item))) {
        const fallback = state.fallbackHits.get(itemKey(item));
        if (fallback?.icon) return fallback.icon;
      }
      return null;
    }

    function computeGroup(group) {
      const pricedItems = [];
      const unpricedItems = [];

      let expected = 0;
      let variance = 0;

      group.items.forEach((item) => {
        const excluded = isExcluded(item);
        const price = excluded ? 0 : getPrice(item);
        const p = item.p;
        if (p == null) {
          unpricedItems.push({ ...item, price, reason: 'prob' });
          return;
        }
        if (price == null) {
          unpricedItems.push({ ...item, price, reason: item.noPrice ? 'manual' : 'price' });
          return;
        }
        if (state.minValueFilter && price < state.minValueThresholdChaos) {
          pricedItems.push({ ...item, price, value: 0, ignored: true });
          return;
        }
        const value = price * (item.qty || 1);
        if (group.type === 'exclusive') {
          expected += p * value;
          variance += p * value * value;
        } else {
          expected += p * value;
          variance += p * (1 - p) * value * value;
        }
        pricedItems.push({ ...item, price, value, ignored: excluded });
      });

      if (group.type === 'exclusive') {
        variance = variance - expected * expected;
      }

      return {
        expected,
        variance: Math.max(variance, 0),
        pricedItems,
        unpricedItems
      };
    }

    function runCostTooltip() {
      return 'Run Cost is the total cost of the entry items for one run. It uses any manual overrides you set.';
    }

    function dropEvTooltip() {
      return 'Drop EV is the average value of all included drops for one run, after filters and excludes.';
    }

    function volatilityTooltip() {
      return 'Volatility shows how much results swing compared to the average drop value. Higher percent means more variability.';
    }

    function expectedTooltip() {
      return 'Expected Return is the average profit per run: drop value minus run cost.';
    }

    function dropFilterTooltip(chaosPerDivine) {
      const thresholdLabel = formatValue(state.minValueThresholdChaos, chaosPerDivine);
      return `This shows the average value for this group and how much it varies compared to that value. "Include" removes drops from the calculation. The filter sets any drop below ${thresholdLabel} to 0.`;
    }

    function computeBoss(boss) {
      const entryItems = boss.entry.map((item) => ({
        ...item,
        price: getPrice(item),
        value: getPrice(item) != null ? getPrice(item) * (item.qty || 1) : null,
        icon: findIcon(item),
        costOverride: getCostOverride(item)
      }));

      const entryCost = entryItems.reduce((sum, item) => {
        if (item.costOverride != null) return sum + item.costOverride;
        return sum + (item.value || 0);
      }, 0);
      const entryMissing = entryItems.filter((item) => item.value == null);

      let expectedDrops = 0;
      let variance = 0;
      const groupResults = boss.groups.map((group) => {
        const result = computeGroup(group);
        expectedDrops += result.expected;
        variance += result.variance;
        return { ...group, result };
      });

      return {
        entryItems,
        entryCost,
        entryMissing,
        expectedDrops,
        variance,
        stdev: Math.sqrt(variance),
        expectedProfit: expectedDrops - entryCost,
        groupResults
      };
    }

    function render() {
      const openIds = new Set();
      bossList.querySelectorAll('details[open]').forEach((detail) => {
        if (detail.dataset.bossId) openIds.add(detail.dataset.bossId);
      });
      bossList.innerHTML = '';
      const chaosPerDivine = state.divineChaos;
      const missingItems = [];
      state.fallbackHits = new Map();

      const query = state.searchQuery.trim();
      const queryLower = query.toLowerCase();
      const queryNormalized = query ? normalizeText(query) : '';
      const filteredBosses = BOSS_DATA.filter((boss) => bossMatchesQuery(boss, queryLower, queryNormalized));

      const bossRows = filteredBosses.map((boss) => ({
        boss,
        computed: computeBoss(boss)
      }));

      const profitValues = bossRows
        .map((row) => row.computed.expectedProfit)
        .filter((value) => Number.isFinite(value));
      const maxProfit = profitValues.length ? Math.max(...profitValues, 0) : 0;
      const minProfit = profitValues.length ? Math.min(...profitValues, 0) : 0;

      bossRows.sort((a, b) => {
        const av = Number.isFinite(a.computed.expectedProfit) ? a.computed.expectedProfit : -Infinity;
        const bv = Number.isFinite(b.computed.expectedProfit) ? b.computed.expectedProfit : -Infinity;
        return bv - av;
      });

      bossRows.forEach(({ boss, computed }) => {
        const missingCount = computed.groupResults.reduce((sum, group) => {
          const priceMissing = group.result.unpricedItems.filter((item) => item.reason === 'price').length;
          return sum + priceMissing;
        }, 0);
        const entryMissing = computed.entryMissing.length;
        const volatilityPct = percentOf(computed.stdev, computed.expectedDrops);

        computed.entryMissing.forEach((item) => {
          missingItems.push({ boss: boss.name, group: 'Entry', item: item.name, types: item.types || [], reason: 'price' });
        });
        computed.groupResults.forEach((group) => {
          group.result.unpricedItems.forEach((item) => {
            if (item.reason === 'manual') return;
            missingItems.push({
              boss: boss.name,
              group: group.label,
              item: item.name,
              types: item.types || [],
              p: item.p,
              reason: item.reason || 'price'
            });
          });
        });

        const details = document.createElement('details');
        details.dataset.bossId = boss.id;
        if (openIds.has(boss.id)) details.open = true;
        const accentColor = profitColor(computed.expectedProfit, maxProfit, minProfit);
        const accentRgb = rgbString(accentColor);
        const gradientStrength = profitMagnitude(computed.expectedProfit, maxProfit, minProfit);
        const gradientColor = rgbaString(accentColor, 0.08 + 0.32 * gradientStrength);
        details.style.setProperty('--summary-accent', accentRgb);
        details.style.setProperty('--profit-accent', accentRgb);
        details.innerHTML = `
          <summary>
            <div class="boss-summary" style="--summary-gradient: linear-gradient(90deg, ${gradientColor} 0%, rgba(15, 23, 42, 0.0) 60%);">
              <div class="boss-top">
                <div class="boss-name">${boss.name}</div>
                ${missingCount + entryMissing > 0 ? `<div class="missing-note">Missing prices: ${missingCount + entryMissing}</div>` : ''}
              </div>
              <div class="boss-metrics">
                <div class="metric"><span class="metric-label">Run Cost <span class="info-dot has-tooltip" data-tooltip="${runCostTooltip()}">i</span></span><strong>${formatValue(computed.entryCost, chaosPerDivine)}</strong></div>
                <div class="metric"><span class="metric-label">Drop EV <span class="info-dot has-tooltip" data-tooltip="${dropEvTooltip()}">i</span></span><strong>${formatValue(computed.expectedDrops, chaosPerDivine)}</strong></div>
                <div class="metric"><span class="metric-label">Volatility <span class="info-dot has-tooltip" data-tooltip="${volatilityTooltip()}">i</span></span><strong>${formatPercent(volatilityPct)}</strong></div>
              </div>
              <div class="expected-return">
                <span>Expected Return <span class="info-dot has-tooltip" data-tooltip="${expectedTooltip()}">i</span></span>
                <strong>${formatValue(computed.expectedProfit, chaosPerDivine)}</strong>
              </div>
            </div>
          </summary>
          <div class="detail-body">
            <div class="muted">
              Sources: ${boss.sources.map((src) => `<a class="link" href="${src}" target="_blank" rel="noreferrer">PoE Wiki</a>`).join(', ')}
            </div>
            <div>
              <div class="section-title">Entry Cost</div>
              <table class="table entry-table">
                <colgroup>
                  <col class="col-item" />
                  <col class="col-qty" />
                  <col class="col-price" />
                  <col class="col-subtotal" />
                  <col class="col-include" />
                  <col class="col-override" />
                </colgroup>
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>Qty</th>
                    <th>Price</th>
                    <th>Subtotal</th>
                    <th>Include</th>
                    <th>Override</th>
                  </tr>
                </thead>
                <tbody>
                  ${computed.entryItems.map((item) => `
                    <tr class="${item.value == null ? 'row-missing' : ''}">
                      <td>
                        <div class="item-cell">
                          ${item.icon ? `<img class="item-icon" src="${item.icon}" alt="" />` : ''}
                          ${itemLabelMarkup(item)}
                        </div>
                      </td>
                      <td>${item.qty}</td>
                      <td>${item.price == null ? '—' : formatValue(item.price, chaosPerDivine)}</td>
                      <td>${item.costOverride != null ? formatValue(item.costOverride, chaosPerDivine) : (item.value == null ? '—' : formatValue(item.value, chaosPerDivine))}</td>
                      <td class="include-note">—</td>
                      <td><input class="price-input" data-cost-key="${costKey(item)}" name="cost:${costKey(item)}" value="${MANUAL_COSTS[costKey(item)] ?? ''}" placeholder="override" /></td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
            ${boss.note ? `<div class="muted warning">${boss.note}</div>` : ''}
            ${computed.groupResults.map((group) => {
              const groupExpected = group.result.expected;
              const groupStdev = Math.sqrt(group.result.variance);
              const groupVolPct = percentOf(groupStdev, groupExpected);
              const missing = group.result.unpricedItems.length;
              return `
                <div class="group-card">
                  <div class="flex-row">
                    <div>
                      <div class="section-title">${group.label}</div>
                    </div>
                  </div>
                  <table class="table drop-table">
                    <colgroup>
                      <col class="col-item" />
                      <col class="col-prob" />
                      <col class="col-price" />
                      <col class="col-ev" />
                      <col class="col-include" />
                      <col class="col-manual" />
                    </colgroup>
                    <thead>
                      <tr>
                        <th>Item</th>
                        <th>Prob</th>
                        <th>Price</th>
                        <th>EV</th>
                        <th>Include</th>
                        <th>Manual</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${group.items.map((item) => {
                        const price = getPrice(item);
                        const icon = findIcon(item);
                        const p = item.p;
                        const value = price != null && p != null ? price * p * (item.qty || 1) : null;
                        const approx = item.approx ? '~' : '';
                        const probLabel = p == null ? '—' : `${approx}${(p * 100).toFixed(2)}%`;
                        const key = itemKey(item);
                        return `
                      <tr class="${price == null ? 'row-missing' : (state.minValueFilter && price != null && price < state.minValueThresholdChaos ? 'row-ignored' : '')}">
                        <td>
                          <div class="item-cell">
                            ${icon ? `<img class="item-icon" src="${icon}" alt="" />` : ''}
                            ${itemLabelMarkup(item)}
                          </div>
                        </td>
                        <td>${probLabel}</td>
                        <td>${price == null ? '—' : formatValue(price, chaosPerDivine)}</td>
                        <td>${value == null ? '—' : formatValue(value, chaosPerDivine)}</td>
                        <td>
                          <input class="include-toggle" type="checkbox" data-include-key="${key}" name="include:${key}" ${isExcluded(item) ? '' : 'checked'} />
                        </td>
                        <td><input class="price-input" data-price-key="${key}" name="price:${key}" value="${MANUAL_PRICES[key] ?? ''}" placeholder="override" /></td>
                      </tr>
                    `;
                      }).join('')}
                    </tbody>
                  </table>
                </div>
              `;
            }).join('')}
          </div>
        `;

        bossList.appendChild(details);
      });

      if (!bossRows.length) {
        const empty = document.createElement('div');
        empty.className = 'muted';
        empty.textContent = query ? `No results for "${query}".` : 'No results.';
        bossList.appendChild(empty);
      }

      if (state.debug) {
        const counts = state.priceData?.counts || {};
        const categoryOrder = ['currency', 'fragment', 'maps', 'armour', 'weapon', 'accessory', 'jewels', 'flask', 'card'];
        const loadedTypes = categoryOrder
          .filter((key) => counts[key])
          .map((key) => `${key}: ${counts[key]}`);
        const apiSummary = (state.fetchResults || []).map((result) => {
          const label = result.source || (result.status === 'cache' ? 'cache' : 'compact');
          if (result.status === 'ok') return `${label}: ok (${result.items || 0}) ${result.url || ''}`.trim();
          if (result.status === 'cache') return `${label}: (${result.items || 0}) ${result.league || ''}`.trim();
          return `${label}: error (${result.error}) ${result.url || ''}`.trim();
        });
        const missingPriceItems = missingItems.filter((m) => m.reason === 'price');
        const missingProbItems = missingItems.filter((m) => m.reason === 'prob');
        const missingPreview = missingPriceItems.slice(0, 50).map((m) => {
          const prob = m.p == null ? '—' : `${(m.p * 100).toFixed(2)}%`;
          const types = m.types.length ? m.types.join(', ') : 'none';
          let suggestionText = '';
          const suggestions = suggestCandidates({ name: m.item });
          if (suggestions.length) {
            suggestionText = ` | suggestions: ${suggestions.join(', ')}`;
          }
          return `${m.boss} | ${m.group} | ${m.item} | p=${prob} | types=${types}${suggestionText}`;
        });
        const fallbackList = Array.from(state.fallbackHits.values());
        const leagueUpdatedLabel = state.leagueUpdatedAt ? ` (${formatUpdatedAt(state.leagueUpdatedAt)})` : '';
        const debugLines = [
          `League: ${state.leagueText} (id: ${state.leagueId})`,
          `Leagues source: ${state.leagueSource || 'unknown'}${leagueUpdatedLabel}`,
          `Pricing league: ${state.pricingLeague || 'unknown'}`,
          `Pricing base: ${state.watchBase || 'unknown'}`,
          `Price items loaded: ${state.priceData?.items?.length || 0}`,
          `Category counts: ${loadedTypes.join(' | ') || 'none'}`,
          apiSummary.length ? `API results: ${apiSummary.join(' | ')}` : 'API results: none',
          `Missing price count: ${missingPriceItems.length}`,
          `Missing probability count: ${missingProbItems.length}`,
          `Fallback hits: ${fallbackList.length}`,
          missingPreview.length ? 'Missing (first 50):' : 'Missing (first 50): none',
          ...missingPreview
        ];
        if (fallbackList.length) {
          debugLines.push('Fallback (first 25):');
          debugLines.push(...fallbackList.slice(0, 25).map((f) => `${f.name} -> ${f.type} (${f.price.toFixed(1)}c)`));
        }
        setDebug(debugLines.join('\n'));
        console.table?.(missingItems.slice(0, 50));
        if (fallbackList.length) console.table?.(fallbackList.slice(0, 50));
      } else {
        setDebug('');
      }

      const applyManualValue = (target, shouldRender) => {
        const priceKey = target.getAttribute('data-price-key');
        const costKeyValue = target.getAttribute('data-cost-key');
        const value = target.value.trim();
        if (priceKey) {
          if (value === '') {
            delete MANUAL_PRICES[priceKey];
          } else if (!Number.isNaN(Number(value))) {
            MANUAL_PRICES[priceKey] = Number(value);
          }
          localStorage.setItem(manualPriceKey, JSON.stringify(MANUAL_PRICES));
        }
        if (costKeyValue) {
          if (value === '') {
            delete MANUAL_COSTS[costKeyValue];
          } else if (!Number.isNaN(Number(value))) {
            MANUAL_COSTS[costKeyValue] = Number(value);
          }
          localStorage.setItem(manualCostKey, JSON.stringify(MANUAL_COSTS));
        }
        if (shouldRender) safeRender();
      };

      bossList.querySelectorAll('.price-input').forEach((input) => {
        input.addEventListener('input', (event) => {
          applyManualValue(event.target, false);
        });
        input.addEventListener('change', (event) => {
          applyManualValue(event.target, true);
        });
        input.addEventListener('keydown', (event) => {
          if (event.key === 'Enter') event.target.blur();
        });
      });

      bossList.querySelectorAll('.include-toggle').forEach((input) => {
        input.addEventListener('change', (event) => {
          const key = event.target.getAttribute('data-include-key');
          if (!key) return;
          if (event.target.checked) {
            delete IGNORED_DROPS[key];
          } else {
            IGNORED_DROPS[key] = true;
          }
          localStorage.setItem(ignoreDropsKey, JSON.stringify(IGNORED_DROPS));
          safeRender();
        });
      });

      bossList.querySelectorAll('input, select, button, a').forEach((el) => {
        el.addEventListener('click', (event) => event.stopPropagation());
        el.addEventListener('pointerdown', (event) => event.stopPropagation());
      });
    }

    function safeRender() {
      try {
        render();
      } catch (err) {
        console.error(err);
        setStatus(`Render error: ${err.message}`, true);
      }
    }

    async function fetchPrices(forceRefresh = false) {
      setStatus(USE_STATIC_DATA ? 'Loading cached prices…' : 'Fetching poe.watch prices…');
      state.priceData = null;
      state.fallbackHits = new Map();
      state.fetchResults = [];
      state.watchBase = null;
      state.priceUpdatedAt = null;

      const leagueCandidates = Array.from(new Set([state.leagueWatchId, state.leagueText, state.leagueId].filter(Boolean)));
      let pricingLeague = leagueCandidates[0] || state.leagueId;

      if (USE_STATIC_DATA) {
        const candidates = leagueCandidates.length
          ? leagueCandidates
          : (LEAGUES?.[0]?.options?.[0]?.id ? [LEAGUES[0].options[0].id] : []);
        for (const candidate of candidates) {
          const slug = slugifyLeague(candidate);
          if (!slug) continue;
          const url = withCacheBust(`${STATIC_PRICES_BASE}/${slug}/compact.json`, forceRefresh);
          try {
            const resp = await fetch(url, { cache: forceRefresh ? 'no-store' : 'default' });
            if (!resp.ok) throw new Error(`${resp.status}`);
            const data = await resp.json();
            const items = Array.isArray(data?.items) ? data.items : extractWatchItems(data);
            if (!items.length) throw new Error('empty');
            const leagueLabel = data?.league?.watch || data?.league?.id || candidate;
            state.priceData = indexWatchData(items);
            state.pricingLeague = leagueLabel;
            state.watchBase = 'static';
            state.priceUpdatedAt = parseTimestamp(data?.updatedAt) || parseTimestamp(data?.generatedAt);
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
          const cache = loadPriceCache();
          for (const leagueValue of leagueCandidates) {
            const entry = cache[leagueValue];
            if (cacheEntryIsFresh(entry)) {
              state.priceData = indexWatchData(entry.items);
              state.pricingLeague = leagueValue;
              state.watchBase = 'cache';
              state.priceUpdatedAt = parseTimestamp(entry.updatedAt);
              state.fetchResults.push({ status: 'cache', source: 'cache', items: entry.items.length, league: leagueValue });
              const divine = state.priceData.byLower.get('divine orb')?.[0];
              state.divineChaos = divine ? safeNumber(divine.mean ?? divine.min ?? divine.max) : null;
              updateMinValueInput();
              const updatedLabel = state.priceUpdatedAt ? ` Updated ${formatUpdatedAt(state.priceUpdatedAt)}.` : '';
              setStatus(`Prices loaded for ${leagueValue}.${updatedLabel}`);
              safeRender();
              return;
            }
          }
        }
        const base = WATCH_API_BASE;
        const categoriesEndpoint = buildWatchCategoriesEndpoint(base);
        const getEndpoint = buildWatchGetEndpoint(base);
        for (const leagueValue of leagueCandidates) {
          if (categoriesEndpoint && getEndpoint) {
            try {
              const resp = await fetch(categoriesEndpoint);
              if (!resp.ok) throw new Error(`${resp.status}`);
              const data = await resp.json();
              const categories = extractWatchCategories(data)
                .map(normalizeCategorySlug)
                .filter(Boolean);
              if (!categories.length) throw new Error('empty');
              state.fetchResults.push({ status: 'ok', source: 'categories', items: categories.length, url: categoriesEndpoint });
              const items = [];
              let updatedAt = null;
              for (const category of categories) {
                const url = getEndpoint
                  .replace('{LEAGUE}', encodeURIComponent(leagueValue))
                  .replace('{CATEGORY}', encodeURIComponent(category));
                try {
                  const catResp = await fetch(url);
                  if (!catResp.ok) throw new Error(`${catResp.status}`);
                  const catData = await catResp.json();
                  const catItems = extractWatchItems(catData).map((item) => {
                    if (item && item.category == null && category) {
                      return { ...item, category };
                    }
                    return item;
                  });
                  if (catItems.length) items.push(...catItems);
                  updatedAt = pickLatestTimestamp(updatedAt, findUpdatedAt(catData, catResp));
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
              if (!items.length) throw new Error('empty');
              commitWatchData(items, leagueValue, base, updatedAt);
              pricingLeague = leagueValue;
              break;
            } catch (err) {
              state.fetchResults.push({
                status: 'error',
                source: 'categories',
                error: err?.message || 'unknown',
                url: categoriesEndpoint
              });
            }
          }
        }
      }

      if (!state.priceData) {
        const message = USE_STATIC_DATA
          ? 'Failed to load cached prices. Check data/prices/<league>/compact.json.'
          : 'Failed to load poe.watch prices. Check the league name and try again.';
        setStatus(message, true);
        safeRender();
        return;
      }

      const divine = state.priceData.byLower.get('divine orb')?.[0];
      const divineChaos = divine ? safeNumber(divine.mean ?? divine.min ?? divine.max) : null;
      state.divineChaos = divineChaos;
      updateMinValueInput();

      const failures = state.fetchResults.filter((r) => r && r.status === 'error');
      const updatedLabel = state.priceUpdatedAt ? ` Updated ${formatUpdatedAt(state.priceUpdatedAt)}.` : '';
      setStatus(`Prices loaded for ${pricingLeague}.${updatedLabel}`);
      if (failures.length && state.debug) console.table?.(failures);
      safeRender();
    }

    const debugPref = localStorage.getItem('poeBossDebug') || 'off';
    debugToggle.checked = debugPref === 'on';
    state.debug = debugToggle.checked;
    debugToggle.addEventListener('change', () => {
      state.debug = debugToggle.checked;
      localStorage.setItem('poeBossDebug', state.debug ? 'on' : 'off');
      safeRender();
    });

    copyDebug.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(debugContent.textContent || '');
        setStatus('Debug copied to clipboard.');
      } catch (err) {
        setStatus('Unable to copy debug output.', true);
      }
    });

    async function init() {
      if (IS_FILE_ORIGIN) {
        setStatus('Open this page via a local server so the data files can be fetched.', true);
      }
      try {
        localStorage.removeItem('poeBossLeagueCacheV1');
      } catch (err) {
        // Ignore storage failures.
      }
      BOSS_DATA = await loadBossData();
      if (!BOSS_DATA.length) {
        setStatus('Failed to load boss data. Check boss-data.json.', true);
      }
      const leaguesLoaded = await loadLeagues();
      if (leaguesLoaded) {
        selectMostRecentLeague();
      } else {
        setStatus('Unable to load league data.', true);
      }
      safeRender();
      fetchPrices();
    }

    init();
  
