    const BASE_LEAGUE = '';
    const BASE_PRICE_MODE = 'avg';
    const BASE_DISPLAY_CURRENCY = 'divine';
    const BASE_MIN_VALUE_ENABLED = true;
    const BASE_MIN_VALUE_DIVINE = 0.5;
    const BASE_MIN_VALUE_CHAOS = 10;
    const BASE_MIN_PROBABILITY_ENABLED = true;
    const BASE_MIN_PROBABILITY = 0.1;
    const BASE_PRICE_SOURCE = 'poe-watch';
    const BASE_SORT_KEY = 'expectedProfit';
    const BASE_SORT_DIR = 'desc';
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

    const manualPriceKey = 'poeBossManualPrices';
    const manualCostKey = 'poeBossManualCosts';
    const manualCurrencyKey = 'poeBossManualCurrency';
    const ignoreDropsKey = 'poeBossIgnoreDrops';
    const displayCurrencyKey = 'poeBossDisplayCurrency';
    const priceSourceKey = 'poeBossPriceSource';
    const priceModeKey = 'poeBossPriceMode';
    const leagueKey = 'poeBossLeague';
    const debugKey = 'poeBossDebug';
    const sortKeyStorage = 'poeBossSortKey';
    const sortDirStorage = 'poeBossSortDir';
    const searchKeyStorage = 'poeBossSearch';
    const settingsStorageKey = 'poeAppSettingsV1';
    const priceCacheKey = 'poeBossPriceCacheV1';
    const priceCacheTtlMs = 60 * 60 * 1000;
    const leagueCacheKey = 'poeBossLeagueCacheV2';
    const leagueCacheTtlMs = 6 * 60 * 60 * 1000;

    let LEAGUES = [];

    const MANUAL_PRICES = JSON.parse(localStorage.getItem(manualPriceKey) || '{}');
    const MANUAL_COSTS = JSON.parse(localStorage.getItem(manualCostKey) || '{}');
    if (!localStorage.getItem(manualCurrencyKey)) {
      localStorage.setItem(manualCurrencyKey, 'chaos');
    }
    const IGNORED_DROPS = JSON.parse(localStorage.getItem(ignoreDropsKey) || '{}');

    const IS_FILE_ORIGIN = window.location.protocol === 'file:';
    const IS_LOCAL_HOST = ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname);
    const STATIC_DATA_BASE = 'data';
    const WATCH_API_BASE = 'https://api.poe.watch';
    const WATCH_DETAILS_BASE = 'https://poe.watch/detailed';
    const WATCH_GAME = 'poe1';
    const NINJA_API_BASE = IS_LOCAL_HOST
      ? '/api/poeninja/poe1/api/economy/stash/current'
      : 'https://poe.ninja/poe1/api/economy/stash/current';
    const TRADE_SITE_BASE = 'https://www.pathofexile.com';
    const Trade = window.PoeTrade || null;
    const Settings = window.PoeSettings || null;
    const Http = window.PoeHttp || null;
    const Cache = window.PoeCache || null;
    const Repositories = window.PoeRepositories || null;
    const Leagues = window.PoeLeagues || null;
    const Pricing = window.PoePricing || null;
    const TRADE_LINK_SEEDS = Trade ? Trade.buildTradeLinkSeeds() : {};
    const NON_UNIQUE_TRADE_TYPES = Trade
      ? Trade.NON_UNIQUE_TRADE_TYPES
      : new Set(['Currency', 'Fragment', 'Invitations', 'DivinationCard']);
    let UNIQUE_DROP_NAME_KEYS = new Set();

    const WATCH_CATEGORY_MAP = {
      Currency: ['currency'],
      Fragment: ['fragment'],
      Invitations: ['maps'],
      UniqueArmour: ['armour'],
      UniqueWeapon: ['weapon'],
      UniqueAccessory: ['accessory'],
      UniqueJewel: ['jewels'],
      UniqueFlask: ['flask'],
      DivinationCard: ['card', 'divinationcard', 'divination', 'divination-card']
    };

    const NINJA_CURRENCY_TYPES = [
      { type: 'Currency', category: 'currency' },
      { type: 'Fragment', category: 'fragment' },
      { type: 'Invitation', category: 'maps' }
    ];

    const NINJA_ITEM_TYPES = [
      { type: 'UniqueArmour', category: 'armour' },
      { type: 'UniqueWeapon', category: 'weapon' },
      { type: 'UniqueAccessory', category: 'accessory' },
      { type: 'UniqueJewel', category: 'jewels' },
      { type: 'UniqueFlask', category: 'flask' },
      { type: 'DivinationCard', category: 'card' }
    ];

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

    function buildWatchExchangeEndpoint(base, league) {
      const root = normalizeWatchBase(base);
      if (!root || !league) return '';
      const gameParam = WATCH_GAME ? `&game=${encodeURIComponent(WATCH_GAME)}` : '';
      return `${root}/exchange/ratios?league=${encodeURIComponent(league)}${gameParam}`;
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

    function rebuildUniqueDropNameKeys() {
      if (!Trade) {
        UNIQUE_DROP_NAME_KEYS = new Set();
        return;
      }
      UNIQUE_DROP_NAME_KEYS = Trade.buildUniqueDropNameKeys(
        BOSS_DATA,
        normalizeText,
        NON_UNIQUE_TRADE_TYPES
      );
    }

    const settingsStore = Settings
      ? Settings.createSettingsStore({
          storageKey: settingsStorageKey,
          defaults: {
            displayCurrency: BASE_DISPLAY_CURRENCY,
            priceSource: BASE_PRICE_SOURCE,
            priceMode: BASE_PRICE_MODE,
            debug: BASE_DEBUG
          },
          legacyReaders: {
            displayCurrency: () => localStorage.getItem(displayCurrencyKey),
            priceSource: () => localStorage.getItem(priceSourceKey),
            priceMode: () => localStorage.getItem(priceModeKey),
            debug: () => (localStorage.getItem(debugKey) === 'on')
          }
        })
      : null;
    const initialSettings = settingsStore ? settingsStore.getState() : {};
    const storedLeagueLegacy = normalizeLeagueKey(localStorage.getItem(leagueKey) || '');
    const DEFAULT_LEAGUE = storedLeagueLegacy || BASE_LEAGUE;
    const DEFAULT_PRICE_MODE = String(initialSettings.priceMode || BASE_PRICE_MODE);
    const DEFAULT_PRICE_SOURCE = normalizePriceSource(initialSettings.priceSource || BASE_PRICE_SOURCE);
    const DEFAULT_SEARCH_QUERY = localStorage.getItem(searchKeyStorage) || '';
    const DEFAULT_DISPLAY_CURRENCY = initialSettings.displayCurrency === 'chaos' ? 'chaos' : 'divine';
    const DEFAULT_DEBUG = Boolean(initialSettings.debug ?? BASE_DEBUG);

    const httpClient = Http ? Http.createHttpClient() : undefined;
    const leagueCacheStore = Cache ? Cache.createStorageCache({ storageKey: leagueCacheKey }) : undefined;
    const priceCacheStore = Cache ? Cache.createStorageCache({ storageKey: priceCacheKey }) : undefined;
    const leaguesRepository = Repositories
      ? Repositories.createLeaguesRepository({ httpClient, cacheStore: leagueCacheStore })
      : null;
    const pricingRepository = Repositories
      ? Repositories.createPricingRepository({ httpClient, cacheStore: priceCacheStore })
      : null;

    function writeLegacySharedSetting(key, value) {
      const isQuotaExceeded = (err) => err?.name === 'QuotaExceededError' || err?.code === 22 || err?.code === 1014;
      const safeSetItem = (storageKey, storageValue) => {
        try {
          localStorage.setItem(storageKey, storageValue);
          return;
        } catch (err) {
          if (!isQuotaExceeded(err)) return;
        }
        try {
          localStorage.removeItem(priceCacheKey);
        } catch (_removeErr) {
          // Ignore follow-up storage failures.
        }
        try {
          localStorage.setItem(storageKey, storageValue);
        } catch (_retryErr) {
          // Ignore if storage is still unavailable.
        }
      };
      if (key === 'leagueId') {
        safeSetItem(leagueKey, String(value || ''));
        return;
      }
      if (key === 'displayCurrency') {
        safeSetItem(displayCurrencyKey, String(value || BASE_DISPLAY_CURRENCY));
        return;
      }
      if (key === 'priceSource') {
        safeSetItem(priceSourceKey, normalizePriceSource(value));
        return;
      }
      if (key === 'priceMode') {
        safeSetItem(priceModeKey, String(value || BASE_PRICE_MODE));
        return;
      }
      if (key === 'debug') {
        safeSetItem(debugKey, value ? 'on' : 'off');
      }
    }

    function saveSharedSetting(key, value) {
      if (key === 'leagueId') {
        // Keep league persistence simple and explicit: this key is owned by poeBossLeague.
        writeLegacySharedSetting(key, value);
        return;
      }
      if (settingsStore) {
        try {
          settingsStore.set(key, value);
        } catch (err) {
          if (err?.name === 'QuotaExceededError' || err?.code === 22 || err?.code === 1014) {
            try {
              localStorage.removeItem(priceCacheKey);
            } catch (_removeErr) {
              // Ignore follow-up storage failures.
            }
            try {
              settingsStore.set(key, value);
            } catch (_retryErr) {
              // Ignore if settings persistence remains unavailable.
            }
          }
        }
      }
      writeLegacySharedSetting(key, value);
    }

    const state = {
      leagueId: DEFAULT_LEAGUE,
      leagueText: DEFAULT_LEAGUE,
      leagueWatchId: DEFAULT_LEAGUE,
      leagueSource: 'fallback',
      leagueUpdatedAt: null,
      priceMode: DEFAULT_PRICE_MODE,
      priceSource: DEFAULT_PRICE_SOURCE,
      displayCurrency: DEFAULT_DISPLAY_CURRENCY,
      priceData: null,
      watchBase: null,
      pricingLeague: null,
      fetchResults: [],
      priceUpdatedAt: null,
      divineChaos: null,
      minValueFilter: false,
      minValueThresholdChaos: 10,
      minValueWasDefault: false,
      minProbabilityFilter: false,
      minProbabilityThreshold: 0.01,
      sortKey: BASE_SORT_KEY,
      sortDir: BASE_SORT_DIR,
      searchQuery: DEFAULT_SEARCH_QUERY
    };

    const leagueSelect = document.getElementById('leagueSelect');
    const priceModeInput = document.getElementById('priceMode');
    const currencyInput = document.getElementById('displayCurrency');
    const priceSourceInput = document.getElementById('priceSource');
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
    const minValueUnit = document.getElementById('minValueUnit');
    const minProbToggle = document.getElementById('minProbToggle');
    const minProbInput = document.getElementById('minProbInput');
    const searchInput = document.getElementById('searchInput');
    const sortButtons = document.querySelectorAll('.sort-button');
    const leaguesService = Leagues
      ? Leagues.createLeagueService({
          state,
          leagueSelectEl: leagueSelect,
          defaultLeague: DEFAULT_LEAGUE,
          leagueStorageKey: leagueKey,
          usingStaticData,
          getStaticLeaguesUrl,
          watchApiBase: WATCH_API_BASE,
          normalizeLeagueKey,
          withCacheBust,
          parseTimestamp,
          parseLeagueDate,
          repository: leaguesRepository,
          leagueCacheTtlMs
        })
      : null;
    const pricingService = Pricing
      ? Pricing.createPricingService({
          state,
          getLeagues: () => (leaguesService ? leaguesService.getLeagues() : LEAGUES),
          usingStaticData,
          getStaticPricesBase,
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
          watchApiBase: WATCH_API_BASE,
          ninjaApiBase: NINJA_API_BASE,
          ninjaCurrencyTypes: NINJA_CURRENCY_TYPES,
          ninjaItemTypes: NINJA_ITEM_TYPES,
          repository: pricingRepository,
          priceCacheTtlMs
        })
      : null;

    function normalizeLeagueKey(value) {
      const raw = String(value || '').trim();
      if (!raw) return '';
      const lower = raw.toLowerCase();
      return LEGACY_LEAGUE_ALIASES[lower] || raw;
    }

    function normalizeLeagueCompare(value) {
      if (leaguesService) return leaguesService.normalizeLeagueCompare(value);
      return String(normalizeLeagueKey(value) || '').trim().toLowerCase();
    }

    function normalizePriceSource(value) {
      const raw = String(value || '').trim().toLowerCase();
      if (raw === 'poe-ninja' || raw === 'poe.ninja') return 'poe-ninja';
      return 'poe-watch';
    }

    function usingStaticData() {
      return !IS_LOCAL_HOST;
    }

    function getStaticDataRoot() {
      return `${STATIC_DATA_BASE}/${state.priceSource}`;
    }

    function getStaticLeaguesUrl() {
      return `${STATIC_DATA_BASE}/poe-watch/leagues.json`;
    }

    function getStaticPricesBase() {
      return `${getStaticDataRoot()}/prices`;
    }

    function flattenLeagues(groups = leaguesService ? leaguesService.getLeagues() : LEAGUES) {
      if (leaguesService) return leaguesService.flattenLeagues(groups);
      return (groups || []).flatMap((group) => (Array.isArray(group.options) ? group.options : []));
    }

    function findLeagueByKey(key) {
      if (leaguesService) return leaguesService.findLeagueByKey(key);
      const normalized = normalizeLeagueCompare(key);
      if (!normalized) return null;
      return flattenLeagues().find((option) => {
        return [option.id, option.watch, option.text].some(
          (value) => normalizeLeagueCompare(value) === normalized
        );
      }) || null;
    }



    function applyLeagueSelection(preferred, { persist = false, allowFallback = true } = {}) {
      if (leaguesService) {
        return leaguesService.applyLeagueSelection(preferred, { persist, allowFallback });
      }
      const match = findLeagueByKey(preferred);
      const fallbackValue = allowFallback ? (leagueSelect?.options?.[0]?.value || '') : '';
      const nextId = match?.id || fallbackValue || '';
      const changed = nextId !== state.leagueId;
      state.leagueId = nextId;
      if (leagueSelect && nextId) leagueSelect.value = nextId;
      state.leagueText = nextId ? leagueTextFor(state.leagueId) : '';
      state.leagueWatchId = nextId ? leagueWatchFor(state.leagueId) : '';
      if (persist) saveSharedSetting('leagueId', state.leagueId);
      return changed;
    }

    function buildLeagueSelect() {
      if (leaguesService) return leaguesService.buildLeagueSelect();
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
      if (leaguesService) return leaguesService.leagueTextFor(id);
      const match = findLeagueByKey(id);
      return match ? match.text : id;
    }

    function leagueWatchFor(id) {
      if (leaguesService) return leaguesService.leagueWatchFor(id);
      const match = findLeagueByKey(id);
      return match ? match.watch || match.id || match.text : id;
    }

    async function loadLeagues(forceRefresh = false) {
      if (leaguesService) {
        const loaded = await leaguesService.loadLeagues(forceRefresh);
        LEAGUES = leaguesService.getLeagues();
        return loaded;
      }
      return false;
    }

    function selectMostRecentLeague() {
      if (leaguesService) {
        return leaguesService.selectMostRecentLeague();
      }
      return false;
    }

    buildLeagueSelect();

    priceModeInput.value = state.priceMode;
    currencyInput.value = state.displayCurrency;
    if (priceSourceInput) priceSourceInput.value = state.priceSource;
    if (DEFAULT_LEAGUE && leagueSelect?.options?.length) {
      applyLeagueSelection(DEFAULT_LEAGUE, { allowFallback: false });
    }

    const minPref = localStorage.getItem('poeBossMinValueEnabled') || (BASE_MIN_VALUE_ENABLED ? 'on' : 'off');
    const minThresholdRaw = localStorage.getItem('poeBossMinValueChaos');
    const minThresholdPref = Number(minThresholdRaw);
    state.minValueFilter = minPref === 'on';
    state.minValueWasDefault = !Number.isFinite(minThresholdPref);
    state.minValueThresholdChaos = Number.isFinite(minThresholdPref)
      ? minThresholdPref
      : defaultMinValueThreshold();
    minValueToggle.checked = state.minValueFilter;

    const minProbPref = localStorage.getItem('poeBossMinProbEnabled') || (BASE_MIN_PROBABILITY_ENABLED ? 'on' : 'off');
    const minProbThresholdPref = Number(localStorage.getItem('poeBossMinProb') || String(BASE_MIN_PROBABILITY));
    state.minProbabilityFilter = minProbPref === 'on';
    state.minProbabilityThreshold = Number.isFinite(minProbThresholdPref)
      ? minProbThresholdPref
      : BASE_MIN_PROBABILITY;
    minProbToggle.checked = state.minProbabilityFilter;

    const storedSortKey = localStorage.getItem(sortKeyStorage) || BASE_SORT_KEY;
    const storedSortDir = localStorage.getItem(sortDirStorage) || BASE_SORT_DIR;
    state.sortKey = storedSortKey || BASE_SORT_KEY;
    state.sortDir = storedSortDir === 'asc' ? 'asc' : 'desc';

    if (searchInput) {
      searchInput.value = state.searchQuery;
      searchInput.addEventListener('input', (event) => {
        state.searchQuery = event.target.value || '';
        if (state.searchQuery) {
          localStorage.setItem(searchKeyStorage, state.searchQuery);
        } else {
          localStorage.removeItem(searchKeyStorage);
        }
        safeRender();
      });
      searchInput.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
          searchInput.value = '';
          state.searchQuery = '';
          localStorage.removeItem(searchKeyStorage);
          safeRender();
        }
      });
    }

    document.addEventListener('keydown', (event) => {
      if (!searchInput) return;
      const isFind = (event.key || '').toLowerCase() === 'f' && (event.metaKey || event.ctrlKey);
      if (!isFind) return;
      event.preventDefault();
      searchInput.focus();
      searchInput.select();
    });

    function getChaosPerDivine() {
      const stored = Number(localStorage.getItem('poeBossDivineChaos') || '');
      return state.divineChaos || (Number.isFinite(stored) && stored > 0 ? stored : null);
    }

    function defaultMinValueThreshold() {
      const rate = getChaosPerDivine();
      return rate ? BASE_MIN_VALUE_DIVINE * rate : BASE_MIN_VALUE_CHAOS;
    }

    function ensureDefaultMinValueThreshold() {
      if (!state.minValueWasDefault) return;
      const rate = getChaosPerDivine();
      if (!rate) return;
      state.minValueThresholdChaos = BASE_MIN_VALUE_DIVINE * rate;
      localStorage.setItem('poeBossMinValueChaos', state.minValueThresholdChaos.toString());
      state.minValueWasDefault = false;
    }

    function formatManualNumber(value) {
      if (!Number.isFinite(value)) return '';
      const rounded = Math.round(value * 10000) / 10000;
      return String(rounded);
    }

    function manualToChaos(value) {
      if (!Number.isFinite(value)) return null;
      if (state.displayCurrency === 'divine') {
        const rate = getChaosPerDivine();
        return rate ? value * rate : value;
      }
      return value;
    }

    function manualFromChaos(value) {
      if (!Number.isFinite(value)) return '';
      if (state.displayCurrency === 'divine') {
        const rate = getChaosPerDivine();
        return formatManualNumber(rate ? value / rate : value);
      }
      return formatManualNumber(value);
    }

    function updateMinValueInput() {
      ensureDefaultMinValueThreshold();
      const threshold = state.minValueThresholdChaos || 0;
      const rate = getChaosPerDivine();
      if (state.displayCurrency === 'divine') {
        const displayValue = rate ? threshold / rate : (state.minValueWasDefault ? BASE_MIN_VALUE_DIVINE : threshold);
        minValueInput.value = formatInputNumber(displayValue, 2);
        minValueInput.step = '0.01';
        if (minValueUnit) minValueUnit.textContent = 'div';
      } else {
        minValueInput.value = formatInputNumber(threshold, 1);
        minValueInput.step = '0.1';
        if (minValueUnit) minValueUnit.textContent = 'c';
      }
    }

    function updateMinProbabilityInput() {
      const thresholdPct = (state.minProbabilityThreshold || 0) * 100;
      minProbInput.value = formatInputNumber(thresholdPct, 2);
      minProbInput.step = '0.01';
    }

    function defaultSortDirFor(key) {
      if (key === 'entryCost') return 'asc';
      return 'desc';
    }

    function updateSortButtons() {
      if (!sortButtons?.length) return;
      sortButtons.forEach((button) => {
        const key = button.dataset.sortKey;
        const label = button.dataset.sortLabel || button.textContent.trim();
        if (!button.dataset.sortLabel) button.dataset.sortLabel = label;
        if (key === state.sortKey) {
          button.classList.add('active');
          button.setAttribute('aria-pressed', 'true');
          button.textContent = label;
          button.dataset.sortDir = state.sortDir;
        } else {
          button.classList.remove('active');
          button.setAttribute('aria-pressed', 'false');
          button.textContent = label;
          delete button.dataset.sortDir;
        }
      });
    }

    updateMinValueInput();
    updateMinProbabilityInput();
    updateSortButtons();

    minValueToggle.addEventListener('change', () => {
      state.minValueFilter = minValueToggle.checked;
      localStorage.setItem('poeBossMinValueEnabled', state.minValueFilter ? 'on' : 'off');
      safeRender();
    });

    minValueInput.addEventListener('change', () => {
      const raw = Number(minValueInput.value);
      if (!Number.isFinite(raw)) return;
      const rate = getChaosPerDivine();
      if (state.displayCurrency === 'divine' && rate) {
        state.minValueThresholdChaos = raw * rate;
      } else {
        state.minValueThresholdChaos = raw;
      }
      localStorage.setItem('poeBossMinValueChaos', state.minValueThresholdChaos.toString());
      state.minValueWasDefault = false;
      safeRender();
    });

    minProbToggle.addEventListener('change', () => {
      state.minProbabilityFilter = minProbToggle.checked;
      localStorage.setItem('poeBossMinProbEnabled', state.minProbabilityFilter ? 'on' : 'off');
      safeRender();
    });

    minProbInput.addEventListener('change', () => {
      const raw = Number(minProbInput.value);
      if (!Number.isFinite(raw)) return;
      const clamped = Math.min(Math.max(raw, 0), 100);
      state.minProbabilityThreshold = clamped / 100;
      minProbInput.value = formatInputNumber(clamped, 2);
      localStorage.setItem('poeBossMinProb', state.minProbabilityThreshold.toString());
      safeRender();
    });

    if (sortButtons?.length) {
      sortButtons.forEach((button) => {
        button.addEventListener('click', () => {
          const key = button.dataset.sortKey;
          if (!key) return;
          if (state.sortKey === key) {
            state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
          } else {
            state.sortKey = key;
            state.sortDir = defaultSortDirFor(key);
          }
          localStorage.setItem(sortKeyStorage, state.sortKey);
          localStorage.setItem(sortDirStorage, state.sortDir);
          updateSortButtons();
          safeRender();
        });
      });
    }

    leagueSelect.addEventListener('change', () => {
      state.leagueId = leagueSelect.value;
      state.leagueText = leagueTextFor(state.leagueId);
      state.leagueWatchId = leagueWatchFor(state.leagueId);
      saveSharedSetting('leagueId', state.leagueId);
      fetchPrices();
    });

    currencyInput.addEventListener('change', () => {
      state.displayCurrency = currencyInput.value;
      saveSharedSetting('displayCurrency', state.displayCurrency);
      updateMinValueInput();
      safeRender();
    });

    if (priceSourceInput) {
      priceSourceInput.addEventListener('change', async () => {
        state.priceSource = normalizePriceSource(priceSourceInput.value);
        saveSharedSetting('priceSource', state.priceSource);
        if (priceSourceInput.value !== state.priceSource) {
          priceSourceInput.value = state.priceSource;
        }
        const leaguesLoaded = await loadLeagues(true);
        if (!leaguesLoaded) {
          setStatus('Failed to load leagues for selected price source.', true);
          return;
        }
        fetchPrices(true);
      });
    }

    priceModeInput.addEventListener('change', () => {
      state.priceMode = priceModeInput.value;
      saveSharedSetting('priceMode', state.priceMode);
      safeRender();
    });

    if (refreshButton) {
      refreshButton.addEventListener('click', () => {
        state.leagueId = leagueSelect.value;
        state.leagueText = leagueTextFor(state.leagueId);
        state.leagueWatchId = leagueWatchFor(state.leagueId);
        saveSharedSetting('leagueId', state.leagueId);
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
        localStorage.removeItem('poeBossMinValueEnabled');
        localStorage.removeItem('poeBossMinValueChaos');
        localStorage.removeItem('poeBossMinProbEnabled');
        localStorage.removeItem('poeBossMinProb');
        localStorage.removeItem(sortKeyStorage);
        localStorage.removeItem(sortDirStorage);
        localStorage.removeItem(searchKeyStorage);

        applyLeagueSelection(previousLeague, { persist: true });
        state.priceMode = BASE_PRICE_MODE;
        state.displayCurrency = BASE_DISPLAY_CURRENCY;
        state.minValueFilter = BASE_MIN_VALUE_ENABLED;
        state.minValueWasDefault = true;
        state.minValueThresholdChaos = defaultMinValueThreshold();
        state.minProbabilityFilter = BASE_MIN_PROBABILITY_ENABLED;
        state.minProbabilityThreshold = BASE_MIN_PROBABILITY;
        state.sortKey = BASE_SORT_KEY;
        state.sortDir = BASE_SORT_DIR;
        state.searchQuery = '';
        state.debug = BASE_DEBUG;
        saveSharedSetting('priceMode', state.priceMode);
        saveSharedSetting('displayCurrency', state.displayCurrency);
        saveSharedSetting('debug', state.debug);
        saveSharedSetting('priceSource', state.priceSource);

        priceModeInput.value = state.priceMode;
        currencyInput.value = state.displayCurrency;
        minValueToggle.checked = state.minValueFilter;
        minProbToggle.checked = state.minProbabilityFilter;
        debugToggle.checked = state.debug;
        if (searchInput) searchInput.value = '';
        updateMinValueInput();
        updateMinProbabilityInput();
        updateSortButtons();

        safeRender();
        setStatus('Custom values reset (league preserved).');
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

      if (item.watchId != null) {
        const targetId = String(item.watchId);
        const filtered = matches.filter((match) => String(match?.id) === targetId);
        if (filtered.length) matches = filtered;
      }

      if (useTypeFilter) {
        const categories = categoriesForTypes(item.types);
        if (categories.length) {
          matches = matches.filter((match) => categories.includes(match.category));
        }
      }

      const unlinked = matches.filter((match) => {
        const links = Number(match?.linkCount);
        return !Number.isFinite(links) || links === 0;
      });
      if (unlinked.length) matches = unlinked;

      return matches;
    }

    function findWatchLine(item, useTypeFilter = true) {
      const matches = findWatchMatches(item, useTypeFilter);
      return matches.length ? matches[0] : null;
    }

    function itemPageUrl(item) {
      if (state.priceSource !== 'poe-watch') return null;
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

    function wikiUrlForItem(item) {
      const name = String(item?.name || '').trim();
      if (!name) return null;
      const slug = name.replace(/\s+/g, '_');
      return `https://www.poewiki.net/wiki/${encodeURIComponent(slug)}`;
    }

    function tradeLeagueName() {
      return state.leagueText || leagueTextFor(state.leagueId) || state.pricingLeague || '';
    }

    function tradeSeedForItemName(name) {
      if (!Trade) return null;
      return Trade.tradeSeedForItemName(name, normalizeText, TRADE_LINK_SEEDS);
    }

    function tradeSeedForItem(item) {
      if (!Trade) return null;
      return Trade.tradeSeedForItem({
        item,
        normalizeText,
        tradeLinkSeeds: TRADE_LINK_SEEDS,
        uniqueDropNameKeys: UNIQUE_DROP_NAME_KEYS,
        nonUniqueTradeTypes: NON_UNIQUE_TRADE_TYPES
      });
    }

    function tradeUrlFromSeed(seed, league) {
      if (!Trade) return null;
      return Trade.tradeUrlFromSeed(seed, league, TRADE_SITE_BASE);
    }

    function tradeQueryForItem(item, _bossId) {
      const seed = tradeSeedForItem(item);
      if (!seed) return null;
      return { seed };
    }

    function tradeUrlForItem(item, bossId) {
      const payload = tradeQueryForItem(item, bossId);
      if (!payload) return null;
      return tradeUrlFromSeed(payload.seed, tradeLeagueName());
    }

    function itemLabelMarkup(item, bossId) {
      const url = itemPageUrl(item);
      const wikiUrl = wikiUrlForItem(item);
      const tradeQuery = tradeQueryForItem(item, bossId);
      const tradeUrl = tradeUrlForItem(item, bossId);
      const base = url
        ? `<a class="item-link" href="${url}" target="_blank" rel="noreferrer">${item.name}</a>`
        : `<span>${item.name}</span>`;
      const wiki = wikiUrl ? `<a class="item-link wiki-link" href="${wikiUrl}" target="_blank" rel="noreferrer">wiki</a>` : '';
      const trade = tradeQuery
        ? (tradeUrl
            ? `<a class="item-link trade-link is-ready" href="${tradeUrl}" target="_blank" rel="noreferrer">trade</a>`
            : `<span class="item-link trade-link" aria-disabled="true">trade</span>`)
        : '';
      const links = [base, wiki, trade].filter(Boolean).join(' <span class="item-sep">·</span> ');
      const variant = item.variant ? ` <span class="muted">(${item.variant})</span>` : '';
      const note = item.note ? ` <span class="item-sep">·</span> <span class="muted">${item.note}</span>` : '';
      return `${links}${variant}${note}`;
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

    function formatInputNumber(value, maxDecimals) {
      if (!Number.isFinite(value)) return '';
      const factor = 10 ** maxDecimals;
      const rounded = Math.round(value * factor) / factor;
      return rounded.toFixed(maxDecimals).replace(/\.?0+$/, '');
    }

    function formatMultiplier(value) {
      if (value == null || Number.isNaN(value)) return '—';
      const abs = Math.abs(value);
      let text = '';
      if (abs > 10) {
        text = String(Math.round(value));
      } else if (abs >= 1) {
        text = (Math.round(value * 10) / 10).toFixed(1);
      } else {
        text = (Math.round(value * 100) / 100).toFixed(2);
      }
      return `${text}x`;
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

    function ratioColor(value) {
      const yellow = { r: 251, g: 191, b: 36 };
      const green = { r: 34, g: 197, b: 94 };
      const red = { r: 239, g: 68, b: 68 };
      if (!Number.isFinite(value)) return yellow;
      if (value >= 1) {
        const t = clamp((value - 1) / 2, 0, 1);
        return mixColor(yellow, green, t);
      }
      const t = clamp(value / 1, 0, 1);
      return mixColor(red, yellow, t);
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

    function ratioOf(numerator, denominator) {
      if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) return null;
      return numerator / denominator;
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
        const price = getPrice(item);
        const p = item.p;

        if (excluded) {
          pricedItems.push({ ...item, price, value: 0, ignored: true });
          return;
        }

        if (p == null) {
          unpricedItems.push({ ...item, price, reason: 'prob' });
          return;
        }
        if (price == null) {
          unpricedItems.push({ ...item, price, reason: item.noPrice ? 'manual' : 'price' });
          return;
        }
        if (state.minProbabilityFilter && p < state.minProbabilityThreshold) {
          pricedItems.push({ ...item, price, value: 0, ignored: true });
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
        pricedItems.push({ ...item, price, value, ignored: false });
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

    function dropVsCostTooltip() {
      return 'Average return shows how many times the run cost is covered by the average drops. 1x means breakeven on drops alone.';
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

    function sortValueFor(row) {
      const computed = row.computed;
      switch (state.sortKey) {
        case 'entryCost':
          return computed.entryCost;
        case 'expectedDrops':
          return computed.expectedDrops;
        case 'dropVsCost':
          return ratioOf(computed.expectedDrops, computed.entryCost);
        case 'expectedProfit':
        default:
          return computed.expectedProfit;
      }
    }

    function render() {
      const openIds = new Set();
      bossList.querySelectorAll('details[open]').forEach((detail) => {
        if (detail.dataset.bossId) openIds.add(detail.dataset.bossId);
      });
      bossList.innerHTML = '';
      const chaosPerDivine = state.divineChaos;
      const manualLocked = state.displayCurrency === 'divine' && !getChaosPerDivine();
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
        const avRaw = sortValueFor(a);
        const bvRaw = sortValueFor(b);
        const av = Number.isFinite(avRaw) ? avRaw : (state.sortDir === 'asc' ? Infinity : -Infinity);
        const bv = Number.isFinite(bvRaw) ? bvRaw : (state.sortDir === 'asc' ? Infinity : -Infinity);
        return state.sortDir === 'asc' ? av - bv : bv - av;
      });

      bossRows.forEach(({ boss, computed }) => {
        const missingCount = computed.groupResults.reduce((sum, group) => {
          const priceMissing = group.result.unpricedItems.filter((item) => item.reason === 'price').length;
          return sum + priceMissing;
        }, 0);
        const entryMissing = computed.entryMissing.length;
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
        const dropVsCost = ratioOf(computed.expectedDrops, computed.entryCost);
        const ratioAccent = rgbString(ratioColor(dropVsCost));
        const gradientStrength = profitMagnitude(computed.expectedProfit, maxProfit, minProfit);
        const gradientColor = rgbaString(accentColor, 0.08 + 0.32 * gradientStrength);
        details.style.setProperty('--summary-accent', accentRgb);
        details.style.setProperty('--profit-accent', accentRgb);
        details.style.setProperty('--ratio-accent', ratioAccent);
        details.innerHTML = `
          <summary>
            <div class="boss-summary" style="--summary-gradient: linear-gradient(90deg, ${gradientColor} 0%, rgba(15, 23, 42, 0.0) 60%);">
              <div class="boss-top">
                <div class="boss-name">${boss.name}</div>
                ${missingCount + entryMissing > 0 ? `<div class="missing-note">Missing prices: ${missingCount + entryMissing}</div>` : ''}
              </div>
              <div class="boss-metrics">
                <div class="metric"><span class="metric-label">Run Cost <span class="info-dot has-tooltip" data-tooltip="${runCostTooltip()}">?</span></span><strong>${formatValue(computed.entryCost, chaosPerDivine)}</strong></div>
                <div class="metric"><span class="metric-label">Drop EV <span class="info-dot has-tooltip" data-tooltip="${dropEvTooltip()}">?</span></span><strong>${formatValue(computed.expectedDrops, chaosPerDivine)}</strong></div>
                <div class="metric metric-ratio"><span class="metric-label">Average return <span class="info-dot has-tooltip" data-tooltip="${dropVsCostTooltip()}">?</span></span><strong>${formatMultiplier(dropVsCost)}</strong></div>
              </div>
              <div class="expected-return">
                <span>Expected Return <span class="info-dot has-tooltip" data-tooltip="${expectedTooltip()}">?</span></span>
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
              <div class="table-wrap">
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
                          ${itemLabelMarkup(item, boss.id)}
                        </div>
                      </td>
                      <td>${item.qty}</td>
                      <td>${item.price == null ? '—' : formatValue(item.price, chaosPerDivine)}</td>
                      <td>${item.costOverride != null ? formatValue(item.costOverride, chaosPerDivine) : (item.value == null ? '—' : formatValue(item.value, chaosPerDivine))}</td>
                      <td class="include-note">—</td>
                      <td><input class="price-input" data-cost-key="${costKey(item)}" name="cost:${costKey(item)}" value="${manualFromChaos(MANUAL_COSTS[costKey(item)])}" placeholder="${manualLocked ? 'Waiting for prices' : 'override'}" ${manualLocked ? 'disabled title="Waiting for divine/chaos rate"' : ''} /></td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
              </div>
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
                  <div class="table-wrap">
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
                        const excluded = isExcluded(item);
                        const price = getPrice(item);
                        const icon = findIcon(item);
                        const p = item.p;
                        const value = !excluded && price != null && p != null ? price * p * (item.qty || 1) : null;
                        const approx = item.approx ? '~' : '';
                        const probLabel = p == null ? '—' : `${approx}${(p * 100).toFixed(2)}%`;
                        const key = itemKey(item);
                        return `
                      <tr class="${price == null ? 'row-missing' : ((excluded || (state.minProbabilityFilter && p != null && p < state.minProbabilityThreshold) || (state.minValueFilter && price != null && price < state.minValueThresholdChaos)) ? 'row-ignored' : '')}">
                        <td>
                          <div class="item-cell">
                            ${icon ? `<img class="item-icon" src="${icon}" alt="" />` : ''}
                            ${itemLabelMarkup(item, boss.id)}
                          </div>
                        </td>
                        <td>${probLabel}</td>
                        <td>${price == null ? '—' : formatValue(price, chaosPerDivine)}</td>
                        <td>${value == null ? '—' : formatValue(value, chaosPerDivine)}</td>
                        <td>
                          <input class="include-toggle" type="checkbox" data-include-key="${key}" name="include:${key}" ${isExcluded(item) ? '' : 'checked'} />
                        </td>
                        <td><input class="price-input" data-price-key="${key}" name="price:${key}" value="${manualFromChaos(MANUAL_PRICES[key])}" placeholder="${manualLocked ? 'Waiting for prices' : 'override'}" ${manualLocked ? 'disabled title="Waiting for divine/chaos rate"' : ''} /></td>
                      </tr>
                    `;
                      }).join('')}
                    </tbody>
                  </table>
                  </div>
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
          `Price source: ${state.priceSource}`,
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
        const numeric = value === '' ? null : Number(value);
        const storedValue = numeric == null || Number.isNaN(numeric) ? null : manualToChaos(numeric);
        if (priceKey) {
          if (value === '') {
            delete MANUAL_PRICES[priceKey];
          } else if (storedValue != null) {
            MANUAL_PRICES[priceKey] = storedValue;
          }
          localStorage.setItem(manualPriceKey, JSON.stringify(MANUAL_PRICES));
          localStorage.setItem(manualCurrencyKey, 'chaos');
        }
        if (costKeyValue) {
          if (value === '') {
            delete MANUAL_COSTS[costKeyValue];
          } else if (storedValue != null) {
            MANUAL_COSTS[costKeyValue] = storedValue;
          }
          localStorage.setItem(manualCostKey, JSON.stringify(MANUAL_COSTS));
          localStorage.setItem(manualCurrencyKey, 'chaos');
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
      if (!pricingService) {
        setStatus('Pricing module failed to load.', true);
        safeRender();
        return;
      }
      return pricingService.fetchPrices(forceRefresh);
    }

    debugToggle.checked = DEFAULT_DEBUG;
    state.debug = debugToggle.checked;
    debugToggle.addEventListener('change', () => {
      state.debug = debugToggle.checked;
      saveSharedSetting('debug', state.debug);
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
      rebuildUniqueDropNameKeys();
      if (!BOSS_DATA.length) {
        setStatus('Failed to load boss data. Check boss-data.json.', true);
      }
      const leaguesLoaded = await loadLeagues();
      if (leaguesLoaded) {
        if (!state.leagueId) {
          selectMostRecentLeague();
        }
      } else {
        setStatus('Unable to load league data.', true);
      }
      safeRender();
      fetchPrices();
    }

    init();
  
