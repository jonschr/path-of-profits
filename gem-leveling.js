(function initGemLevelingPage() {
  'use strict';

  const APP_BUILD_VERSION = (document.getElementById('openChangelog')?.textContent || '').trim() || 'release-unknown';
  const BUILD_VERSION_KEY = 'poeUiBuildVersion';
  const DEPLOY_CACHE_KEYS = ['poeBossLeagueCacheV1', 'poeBossLeagueCacheV2', 'poeBossPriceCacheV1'];
  const SHARED_BOSS_LEAGUE_KEY = 'poeBossLeague';
  const STORAGE_KEYS = {
    league: 'poeGemLeague',
    displayCurrency: 'poeGemDisplayCurrency',
    gemcutterCost: 'poeGemGemcutterCost',
    ignoreLowConfidence: 'poeGemIgnoreLowConfidence',
    startValueLimitChaos: 'poeGemStartValueLimitChaos',
    rawOverrides: 'poeGemRawOverrides',
    visibleCalcColumns: 'poeGemVisibleCalcColumns',
    search: 'poeGemSearch',
    filter: 'poeGemFilter',
    sortKey: 'poeGemSortKey',
    sortDir: 'poeGemSortDir'
  };
  const FALLBACK_LEAGUES = ['Standard', 'Hardcore', 'Mirage', 'Hardcore Mirage'];
  const DEFAULT_LEAGUE = 'Mirage';
  const ETERNAL_LEAGUES = new Set(['standard', 'hardcore']);
  const FILTER_DEFS = [
    { key: 'all', label: 'All' },
    { key: 'normal', label: 'Normal' },
    { key: 'transfigured', label: 'Transfigured' },
    { key: 'support', label: 'Support' }
  ];
  const NINJA_ECONOMY_BASE = 'https://poe.ninja/poe1/economy';
  const TRADE_SITE_BASE = 'https://www.pathofexile.com';
  const STANDARD_GEM_XP_BASELINE = 342051651;
  const DEFAULT_SORT_BY_FILTER = {
    all: 'normalizedValuePair',
    normal: 'normalizedValuePair',
    transfigured: 'normalizedValuePair',
    support: 'normalizedValuePair',
    exceptional: 'routeTotal'
  };
  const BASE_VISIBLE_COLUMN_KEYS = {
    all: [
      'raw:start',
      'normalizedValuePair',
      'raw:end',
      'raw:corrupt21'
    ],
    normal: [
      'raw:start',
      'normalizedValuePair',
      'raw:end',
      'raw:corrupt21'
    ],
    transfigured: [
      'raw:start',
      'normalizedValuePair',
      'raw:end',
      'raw:corrupt21'
    ],
    support: [
      'raw:start',
      'normalizedValuePair',
      'raw:end',
      'raw:corrupt21'
    ],
    exceptional: [
      'raw:1',
      'raw:3',
      'raw:3c',
      'raw:3/20c',
      'raw:4c'
    ]
  };
  const DEFAULT_VISIBLE_CALC_COLUMNS = {
    all: [],
    normal: [],
    transfigured: [],
    support: [],
    exceptional: ['routeTotal', 'xpPerMillion']
  };
  const COLUMN_ORDER = {
    all: [
      'raw:start',
      'normalizedValuePair',
      'raw:end',
      'raw:corrupt21'
    ],
    normal: [
      'raw:start',
      'normalizedValuePair',
      'raw:end',
      'raw:corrupt21'
    ],
    transfigured: [
      'raw:start',
      'normalizedValuePair',
      'raw:end',
      'raw:corrupt21'
    ],
    support: [
      'raw:start',
      'normalizedValuePair',
      'raw:end',
      'raw:corrupt21'
    ],
    exceptional: [
      'raw:1',
      'routeTotal',
      'xpPerMillion',
      'qualityAdd',
      'raw:1/20',
      'stepTwo',
      'raw:2',
      'stepThree',
      'raw:3',
      'raw:3/20',
      'raw:1c',
      'raw:2c',
      'raw:3c',
      'raw:3/20c',
      'raw:3/23c',
      'raw:4c',
      'raw:5',
      'raw:4/20c'
    ]
  };

  function clearCachesForCurrentBuild() {
    try {
      const previousVersion = localStorage.getItem(BUILD_VERSION_KEY);
      if (previousVersion === APP_BUILD_VERSION) return;
      DEPLOY_CACHE_KEYS.forEach((key) => {
        localStorage.removeItem(key);
      });
      localStorage.setItem(BUILD_VERSION_KEY, APP_BUILD_VERSION);
    } catch (_error) {
      // Ignore storage failures.
    }
  }

  function hydrateLeagueSelection() {
    const sharedValue = localStorage.getItem(SHARED_BOSS_LEAGUE_KEY) || '';
    if (sharedValue) return sharedValue;
    return localStorage.getItem(STORAGE_KEYS.league) || '';
  }

  function persistLeagueSelection(leagueId) {
    if (!leagueId) return;
    try {
      localStorage.setItem(STORAGE_KEYS.league, leagueId);
    } catch (_error) {
      // Ignore storage failures.
    }
    try {
      localStorage.setItem(SHARED_BOSS_LEAGUE_KEY, leagueId);
    } catch (_error) {
      // Ignore storage failures.
    }
  }

  clearCachesForCurrentBuild();

  const leagueSelect = document.getElementById('gemLeagueSelect');
  const displayCurrencySelect = document.getElementById('gemDisplayCurrency');
  const gemcutterCostInput = document.getElementById('gemcutterCostInput');
  const gemcutterCostIcon = document.getElementById('gemcutterCostIcon');
  const ignoreLowConfidenceInput = document.getElementById('ignoreLowConfidenceInput');
  const startValueLimitInput = document.getElementById('startValueLimitInput');
  const startValueLimitUnit = document.getElementById('startValueLimitUnit');
  const resetGemSettingsButton = document.getElementById('resetGemSettings');
  const searchInput = document.getElementById('gemSearchInput');
  const filterBar = document.getElementById('gemFilterBar');
  const columnToggleBar = document.getElementById('gemColumnToggleBar');
  const summaryEl = document.getElementById('gemSummary');
  const statusEl = document.getElementById('gemStatus');
  const tableEl = document.getElementById('gemTable');
  const tableColgroup = document.getElementById('gemTableColgroup');
  const tableHeadRow = document.getElementById('gemTableHeadRow');
  const tableBody = document.getElementById('gemTableBody');
  const changelogContent = document.getElementById('changelogContent');
  const debugContent = document.getElementById('debugContent');
  const changelogDialog = document.getElementById('changelogDialog');
  const debugDialog = document.getElementById('debugDialog');
  const refreshButton = document.getElementById('refresh');
  const openChangelog = document.getElementById('openChangelog');
  const closeChangelog = document.getElementById('closeChangelog');
  const openDebug = document.getElementById('openDebug');
  const closeDebug = document.getElementById('closeDebug');

  function loadVisibleCalcColumns() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEYS.visibleCalcColumns) || '{}');
      return {
        all: Array.isArray(parsed.all) ? parsed.all : DEFAULT_VISIBLE_CALC_COLUMNS.all.slice(),
        normal: Array.isArray(parsed.normal) ? parsed.normal : DEFAULT_VISIBLE_CALC_COLUMNS.normal.slice(),
        transfigured: Array.isArray(parsed.transfigured) ? parsed.transfigured : DEFAULT_VISIBLE_CALC_COLUMNS.transfigured.slice(),
        support: Array.isArray(parsed.support) ? parsed.support : DEFAULT_VISIBLE_CALC_COLUMNS.support.slice(),
        exceptional: Array.isArray(parsed.exceptional) ? parsed.exceptional : DEFAULT_VISIBLE_CALC_COLUMNS.exceptional.slice()
      };
    } catch (_error) {
      return {
        all: DEFAULT_VISIBLE_CALC_COLUMNS.all.slice(),
        normal: DEFAULT_VISIBLE_CALC_COLUMNS.normal.slice(),
        transfigured: DEFAULT_VISIBLE_CALC_COLUMNS.transfigured.slice(),
        support: DEFAULT_VISIBLE_CALC_COLUMNS.support.slice(),
        exceptional: DEFAULT_VISIBLE_CALC_COLUMNS.exceptional.slice()
      };
    }
  }

  const state = {
    leagueId: hydrateLeagueSelection() || DEFAULT_LEAGUE,
    displayCurrency: localStorage.getItem(STORAGE_KEYS.displayCurrency) === 'divine' ? 'divine' : 'chaos',
    gemcutterCost: null,
    ignoreLowConfidence: localStorage.getItem(STORAGE_KEYS.ignoreLowConfidence) !== 'false',
    startValueLimitChaos: parseStoredStartValueLimit(localStorage.getItem(STORAGE_KEYS.startValueLimitChaos)),
    search: localStorage.getItem(STORAGE_KEYS.search) || '',
    filter: localStorage.getItem(STORAGE_KEYS.filter) || 'all',
    sortKey: localStorage.getItem(STORAGE_KEYS.sortKey) || DEFAULT_SORT_BY_FILTER.all,
    sortDir: localStorage.getItem(STORAGE_KEYS.sortDir) === 'asc' ? 'asc' : 'desc',
    rawOverrides: JSON.parse(localStorage.getItem(STORAGE_KEYS.rawOverrides) || '{}'),
    visibleCalcColumns: loadVisibleCalcColumns(),
    leagues: [],
    rows: [],
    visibleRows: [],
    rowByName: new Map(),
    sortFrozen: false,
    pendingTableLinkActivationUntil: 0,
    divineRate: null,
    apiGemcutterCost: null,
    gemcutterIcon: '',
    updatedAt: null,
    sourceUrls: [],
    gemXp: {},
    searchRenderTimer: null,
    gemcutterRenderTimer: null
  };

  const storedGemcutterCost = Number(localStorage.getItem(STORAGE_KEYS.gemcutterCost));
  if (Number.isFinite(storedGemcutterCost) && storedGemcutterCost >= 0) {
    state.gemcutterCost = storedGemcutterCost;
  }

  displayCurrencySelect.value = state.displayCurrency;
  gemcutterCostInput.value = state.gemcutterCost == null ? '' : String(state.gemcutterCost);
  ignoreLowConfidenceInput.checked = state.ignoreLowConfidence;
  searchInput.value = state.search;
  if (!FILTER_DEFS.some((filter) => filter.key === state.filter)) {
    state.filter = 'all';
  }
  if (!state.sortKey) {
    state.sortKey = DEFAULT_SORT_BY_FILTER[state.filter] || 'name';
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
    const name = entry.name || entry.league || entry.id || '';
    if (!name) return null;
    const normalized = name.toLowerCase();
    const rules = Array.isArray(entry.rules) ? entry.rules : [];
    return {
      id: name,
      text: name,
      startDate: entry.startAt ? new Date(entry.startAt) : null,
      endDate: entry.endAt ? new Date(entry.endAt) : null,
      active: entry.active ?? entry.category?.current ?? (entry.endAt ? (new Date(entry.endAt)).getTime() >= Date.now() : null),
      hardcore: normalized.includes('hardcore') || rules.some((rule) => String(rule?.id || '').toLowerCase() === 'hardcore')
    };
  }

  function isSoloSelfFoundLeague(option) {
    return option.text.toLowerCase().includes('solo self-found') || /\bssf\b/.test(option.text.toLowerCase());
  }

  function isRuthlessLeague(option) {
    return option.text.toLowerCase().includes('ruthless');
  }

  function isEternalLeague(option) {
    return ETERNAL_LEAGUES.has(option.id.toLowerCase());
  }

  function compareLeaguePriority(a, b) {
    const aEternal = isEternalLeague(a);
    const bEternal = isEternalLeague(b);
    if (aEternal !== bEternal) return aEternal ? -1 : 1;
    if (aEternal && bEternal) {
      if (a.id === 'Standard' && b.id !== 'Standard') return -1;
      if (b.id === 'Standard' && a.id !== 'Standard') return 1;
    }
    if (a.hardcore !== b.hardcore) return a.hardcore ? 1 : -1;
    const aStart = a.startDate ? a.startDate.getTime() : 0;
    const bStart = b.startDate ? b.startDate.getTime() : 0;
    if (aStart !== bStart) return bStart - aStart;
    return a.text.localeCompare(b.text);
  }

  function pickVisibleLeagues(entries) {
    const options = entries
      .map(normalizeLeagueEntry)
      .filter(Boolean)
      .filter((option) => !isSoloSelfFoundLeague(option) && !isRuthlessLeague(option));
    const eternal = options.filter(isEternalLeague);
    const challenge = options.filter((option) => !isEternalLeague(option));
    const currentFlagged = challenge.filter((option) => option.active === true);
    const source = currentFlagged.length ? currentFlagged : challenge;
    const latestStart = source.reduce((best, option) => {
      const start = option.startDate ? option.startDate.getTime() : 0;
      return Math.max(best, start);
    }, 0);
    const current = source.filter((option) => {
      const start = option.startDate ? option.startDate.getTime() : 0;
      return start === latestStart;
    });
    const selected = [...eternal, ...current].sort(compareLeaguePriority);
    if (selected.length) return selected;
    return FALLBACK_LEAGUES.map((name) => ({ id: name, text: name, hardcore: name.includes('Hardcore'), startDate: null })).sort(compareLeaguePriority);
  }

  function formatUpdatedAt(value) {
    if (!value) return 'unknown';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleString([], {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    });
  }

  function formatChaosValue(value) {
    if (!Number.isFinite(value)) return '—';
    if (value >= 1000) return `${Math.round(value).toLocaleString()}c`;
    if (value >= 100) return `${Math.round(value)}c`;
    if (value >= 10) return `${value.toFixed(1).replace(/\.0$/, '')}c`;
    if (value >= 1) return `${value.toFixed(1).replace(/\.0$/, '')}c`;
    return `${value.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')}c`;
  }

  function formatDivineValue(value, divineRate) {
    if (!Number.isFinite(value) || !Number.isFinite(divineRate) || divineRate <= 0) return '—';
    const divineValue = value / divineRate;
    if (divineValue >= 100) return `${Math.round(divineValue)} div`;
    if (divineValue >= 10) return `${divineValue.toFixed(1).replace(/\.0$/, '')} div`;
    if (divineValue >= 1) return `${divineValue.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')} div`;
    return `${divineValue.toFixed(3).replace(/0+$/, '').replace(/\.$/, '')} div`;
  }

  function formatPrice(value) {
    if (!Number.isFinite(value)) return '—';
    return state.displayCurrency === 'divine'
      ? formatDivineValue(value, state.divineRate)
      : formatChaosValue(value);
  }

  function formatDelta(value) {
    if (!Number.isFinite(value)) return '—';
    if (value === 0) return formatPrice(0);
    const sign = value > 0 ? '+' : '-';
    return `${sign}${formatPrice(Math.abs(value))}`;
  }

  function formatRate(value) {
    if (!Number.isFinite(value)) return '—';
    const sign = value > 0 ? '+' : value < 0 ? '-' : '';
    const magnitude = formatPrice(Math.abs(value));
    return `${sign}${magnitude}/M`;
  }

  function roundCurrencyInput(value) {
    if (!Number.isFinite(value) || value < 0) return 0;
    return Math.round(value * 100) / 100;
  }

  function displayValueFromChaos(value) {
    if (!Number.isFinite(value)) return '';
    if (state.displayCurrency === 'divine' && Number.isFinite(state.divineRate) && state.divineRate > 0) {
      return String(roundCurrencyInput(value / state.divineRate));
    }
    return String(roundCurrencyInput(value));
  }

  function chaosValueFromDisplay(inputValue) {
    if (inputValue == null || inputValue === '') return null;
    const value = Number(inputValue);
    if (!Number.isFinite(value) || value < 0) return null;
    if (state.displayCurrency === 'divine' && Number.isFinite(state.divineRate) && state.divineRate > 0) {
      return roundCurrencyInput(value * state.divineRate);
    }
    return roundCurrencyInput(value);
  }

  function updateDisplayCurrencyLabels() {
    const chaosOption = displayCurrencySelect.querySelector('option[value="chaos"]');
    const divineOption = displayCurrencySelect.querySelector('option[value="divine"]');
    if (!chaosOption || !divineOption) return;
    if (!Number.isFinite(state.divineRate) || state.divineRate <= 0) {
      chaosOption.textContent = 'Chaos';
      divineOption.textContent = 'Divine';
      return;
    }
    const rateLabel = formatChaosValue(state.divineRate).replace(/\.0c$/, 'c');
    const perDivLabel = rateLabel.replace(/c$/, '/div');
    chaosOption.textContent = `Chaos (${perDivLabel})`;
    divineOption.textContent = `Divine (${rateLabel})`;
  }

  function gemStateKey(item) {
    const quality = Number.isFinite(item.gemQuality) ? item.gemQuality : null;
    const level = Number.isFinite(item.gemLevel) ? item.gemLevel : null;
    const corrupted = item.corrupted === true;
    if (level === 1 && quality == null && !corrupted) return '1';
    if (level === 1 && quality == null && corrupted) return '1c';
    if (level === 1 && quality === 20 && !corrupted) return '1/20';
    if (level === 2 && quality == null && !corrupted) return '2';
    if (level === 2 && quality == null && corrupted) return '2c';
    if (level === 3 && quality == null && !corrupted) return '3';
    if (level === 3 && quality == null && corrupted) return '3c';
    if (level === 20 && quality == null && !corrupted) return '20';
    if (level === 20 && quality === 20 && !corrupted) return '20/20';
    if (level === 4 && quality == null && corrupted) return '4c';
    if (level === 5 && quality == null && !corrupted) return '5';
    if (level === 20 && quality == null && corrupted) return '20c';
    if (level === 20 && quality === 20 && corrupted) return '20/20c';
    if (level === 20 && quality === 23 && corrupted) return '20/23c';
    if (level === 21 && quality == null && corrupted) return '21c';
    if (level === 21 && quality === 20 && corrupted) return '21/20c';
    if (level === 21 && quality === 23 && corrupted) return '21/23c';
    if (level === 1 && quality === 23 && corrupted) return '1/23c';
    return null;
  }

  function isClassicExceptionalGem(name) {
    return /^(Awakened )?(Enlighten|Empower|Enhance) Support$/i.test(String(name || ''));
  }

  function isGreaterExceptionalGem(records, name) {
    if (!/Support$/i.test(String(name || ''))) return false;
    const maxLevel = records.reduce((best, record) => (
      Number.isFinite(record?.gemLevel) ? Math.max(best, record.gemLevel) : best
    ), 0);
    return maxLevel > 0 && maxLevel <= 4;
  }

  function buildGemTags(records, name) {
    const first = records[0] || {};
    const tags = [];
    if (first.gemType === 'Normal') tags.push('Normal');
    if (first.gemType === 'Support' || /Support$/i.test(String(name || ''))) tags.push('Support');
    if (first.isTransfigured) tags.push('Transfigured');
    if (first.isVaal) tags.push('Vaal');
    if (isClassicExceptionalGem(name) || isGreaterExceptionalGem(records, name)) tags.push('Exceptional');
    return tags;
  }

  function isExceptionalRow(row) {
    return row?.tags?.includes('Exceptional');
  }

  function isVaalRow(row) {
    return row?.tags?.includes('Vaal');
  }

  function isSupportRow(row) {
    return row?.tags?.includes('Support');
  }

  function isClassicExceptionalRow(row) {
    return row?.exceptionalKind === 'classic';
  }

  function isGreaterExceptionalRow(row) {
    return row?.exceptionalKind === 'greater';
  }

  function getRecord(row, key) {
    if (!row || !key) return null;
    const baseRecord = row.states?.[key] || null;
    const overrideKey = `${slugifyLeague(state.leagueId)}::${row.name}::${key}`;
    const manualValue = Number(state.rawOverrides?.[overrideKey]);
    if (!Number.isFinite(manualValue)) return baseRecord;
    if (!baseRecord) {
      return {
        name: row.name,
        variant: key,
        detailsId: key,
        min: manualValue,
        mean: manualValue,
        max: manualValue,
        lowConfidence: false,
        manualOverride: true
      };
    }
    return {
      ...baseRecord,
      min: manualValue,
      mean: manualValue,
      max: manualValue,
      lowConfidence: false,
      manualOverride: true
    };
  }

  function describeAdditionalState(record) {
    if (!record) return 'Unknown state';
    const parts = [];
    if (record.variant) {
      parts.push(record.variant);
    } else {
      if (Number.isFinite(record.gemLevel)) parts.push(`lvl ${record.gemLevel}`);
      if (Number.isFinite(record.gemQuality)) parts.push(`q${record.gemQuality}`);
      if (record.corrupted === true) parts.push('corrupted');
    }
    const label = parts.join(' ');
    return label || record.detailsId || record.name || 'Unknown state';
  }

  function getListingCount(record) {
    if (!record) return 0;
    if (Number.isFinite(record.listingCount)) return record.listingCount;
    if (Number.isFinite(record.confidenceCount)) return record.confidenceCount;
    return 0;
  }

  function buildMetric({ value = null, records = [], note = '', label = '', format = 'delta' } = {}) {
    const validRecords = records.filter(Boolean);
    return {
      value: Number.isFinite(value) ? value : null,
      records: validRecords,
      lowConfidence: validRecords.some((record) => record.lowConfidence),
      note,
      label,
      format
    };
  }

  function metricForDisplay(metric) {
    if (!metric || !state.ignoreLowConfidence || !metric.lowConfidence) return metric;
    return buildMetric({ records: metric.records, note: metric.note, label: metric.label, format: metric.format });
  }

  function priceMetric(record, note) {
    if (!record) return buildMetric({ note });
    return buildMetric({ value: record.min, records: [record], note });
  }

  function deltaMetric(target, base, note) {
    if (!target || !base) return buildMetric({ note });
    return buildMetric({
      value: target.min - base.min,
      records: [base, target],
      note
    });
  }

  function ratioMetric(metric, denominator, note) {
    if (!metric || !Number.isFinite(metric.value) || !Number.isFinite(denominator) || denominator <= 0) {
      return buildMetric({ records: metric?.records || [], note, label: metric?.label || '' });
    }
    return buildMetric({
      value: (metric.value * 1000000) / denominator,
      records: metric.records,
      note,
      label: metric.label,
      format: 'rate'
    });
  }

  function normalizeMetricToBaselineXp(metric, denominator, baseline, note) {
    if (!metric || !Number.isFinite(metric.value) || !Number.isFinite(denominator) || denominator <= 0 || !Number.isFinite(baseline) || baseline <= 0) {
      return buildMetric({ records: metric?.records || [], note, label: metric?.label || '' });
    }
    return buildMetric({
      value: (metric.value * baseline) / denominator,
      records: metric.records,
      note,
      label: metric.label
    });
  }

  function formatGemStateLabel(stateKey) {
    switch (stateKey) {
      case '1':
        return 'Level 1';
      case '20':
        return 'Level 20';
      case '20c':
        return 'Level 20 Corrupted';
      case '20/20c':
        return '20/20 Corrupted';
      case '21c':
        return 'Level 21 Corrupted';
      case '21/20c':
        return '21/20 Corrupted';
      default:
        return stateKey;
    }
  }

  function pickHighestRecord(row, keys) {
    return keys
      .map((key) => getRecord(row, key))
      .filter(Boolean)
      .sort((a, b) => b.min - a.min)[0] || null;
  }

  function getGemcutterBatchCost() {
    return (Number.isFinite(state.gemcutterCost) ? state.gemcutterCost : 0) * 20;
  }

  function getXpEntry(row) {
    return row ? state.gemXp?.[row.name] || null : null;
  }

  function getRouteXpTotal(row) {
    const xpEntry = getXpEntry(row);
    if (!xpEntry) return null;
    return state.filter === 'exceptional'
      ? xpEntry.xpTo3
      : xpEntry.xpTo20;
  }

  function buildGemTradeUrl(row, stateKey) {
    const record = getRecord(row, stateKey);
    if (!record || !state.leagueId) return null;

    const typeValue = record.tradeTypeOption
      ? {
          option: record.tradeTypeOption,
          ...(record.tradeTypeDiscriminator ? { discriminator: record.tradeTypeDiscriminator } : {})
        }
      : (record.baseType || row.name);

    const miscFilters = {};
    if (Number.isFinite(record.gemLevel)) {
      miscFilters.gem_level = { min: record.gemLevel, max: record.gemLevel };
    }
    if (Number.isFinite(record.gemQuality)) {
      miscFilters.quality = { min: record.gemQuality, max: record.gemQuality };
    }
    if (record.corrupted === true) {
      miscFilters.corrupted = { option: 'true' };
    } else if (record.corrupted === false || record.corrupted == null) {
      miscFilters.corrupted = { option: 'false' };
    }

    const query = {
      query: {
        status: { option: 'securable' },
        type: typeValue,
        stats: [{ type: 'and', filters: [] }],
        filters: {
          misc_filters: { filters: miscFilters }
        }
      },
      sort: { price: 'asc' }
    };

    return `${TRADE_SITE_BASE}/trade/search/${encodeURIComponent(state.leagueId)}?q=${encodeURIComponent(JSON.stringify(query))}`;
  }

  function buildRawColumn(stateKey, label, tooltip) {
    return {
      key: `raw:${stateKey}`,
      labelLines: Array.isArray(label) ? label : [label],
      tooltip,
      isRaw: true,
      rawStateKey: stateKey,
      metric: (row) => priceMetric(getRecord(row, stateKey), `Raw ${stateKey}`)
    };
  }

  function buildMergedRawColumn(key, label, tooltip, stateKeys, sortMode = 'average') {
    return {
      key: `raw:${key}`,
      labelLines: Array.isArray(label) ? label : [label],
      tooltip,
      isRaw: true,
      isRawGroup: true,
      rawStateKeys: stateKeys.slice(),
      metric: (row) => {
        const records = stateKeys.map((stateKey) => getRecord(row, stateKey)).filter(Boolean);
        const values = records.map((record) => record.min).filter(Number.isFinite);
        if (!values.length) return buildMetric({ records, note: `Raw ${key}` });
        const value = sortMode === 'first'
          ? values[0]
          : values.reduce((sum, entry) => sum + entry, 0) / values.length;
        return buildMetric({ value, records, note: `Raw ${key}` });
      }
    };
  }

  function buildMergedMetricColumn(key, label, tooltip, metricDefs, infoTooltip = '', sortMode = 'average') {
    return {
      key,
      labelLines: Array.isArray(label) ? label : [label],
      tooltip,
      infoTooltip,
      isMetricGroup: true,
      metricDefs: metricDefs.slice(),
      metric: (row) => {
        const metrics = metricDefs.map((entry) => entry.metric(row)).filter(Boolean);
        const values = metrics
          .map((entry) => metricForDisplay(entry)?.value)
          .filter(Number.isFinite);
        if (!values.length) {
          return buildMetric({
            note: key,
            records: metrics.flatMap((entry) => entry?.records || [])
          });
        }
        const value = sortMode === 'first'
          ? values[0]
          : values.reduce((sum, entry) => sum + entry, 0) / values.length;
        return buildMetric({
          value,
          note: key,
          records: metrics.flatMap((entry) => entry?.records || [])
        });
      }
    };
  }

  function getRawColumnsForExceptional() {
    return [
      buildRawColumn('1', ['Level', '1'], 'Market price for the starting exceptional-gem state'),
      buildRawColumn('1/20', '1/20', 'Raw market price for Level One / 20 Quality'),
      buildRawColumn('2', ['Level', '2'], 'Raw market price for Level Two'),
      buildRawColumn('3', ['Level', '3'], 'Raw market price for Level Three'),
      buildRawColumn('1c', ['Level 1', 'Corrupted'], 'Raw market price for Level One Corrupted'),
      buildRawColumn('2c', ['Level 2', 'Corrupted'], 'Raw market price for Level Two Corrupted'),
      buildRawColumn('3c', ['Level 3', 'Corrupted'], 'Raw market price for Level Three Corrupted'),
      buildRawColumn('3/20', '3/20', 'Raw market price for Level Three / 20 Quality'),
      buildRawColumn('3/20c', ['3/20', 'Corrupted'], 'Raw market price for Level Three / 20 Quality Corrupted'),
      buildRawColumn('3/23c', ['3/23', 'Corrupted'], 'Raw market price for Level Three / 23 Quality Corrupted'),
      buildRawColumn('4c', ['Level 4', 'Corrupted'], 'Raw market price for Level Four Corrupted'),
      buildRawColumn('5', ['Level', '5'], 'Raw market price for Level Five'),
      buildRawColumn('4/20c', ['4/20', 'Corrupted'], 'Raw market price for Level Four / 20 Quality Corrupted')
    ];
  }

  function getRawColumnsForMain() {
    return [
      buildMergedRawColumn('start', ['Level 1 gem'], 'Market prices for Level One and Level One / 20 Quality', ['1', '1/20']),
      buildMergedRawColumn('end', ['Level 20 uncorrupted'], 'Market prices for Level Twenty and Level Twenty / 20 Quality', ['20', '20/20']),
      buildMergedRawColumn('corrupt21', ['Level 21 corrupted'], 'Market prices for Level Twenty-One Corrupted and Level Twenty-One / 20 Quality Corrupted', ['21c', '21/20c'])
    ];
  }

  function getCalculatedColumnsForExceptional() {
    return [
      {
        key: 'qualityAdd',
        labelLines: ['1 -> 1/20'],
        tooltip: 'Level One to Level One / 20 Quality, net of twenty Gemcutter’s Prisms',
        metric: (row) => {
          const base = getRecord(row, '1');
          const target = getRecord(row, '1/20');
          if (!base || !target) return buildMetric({ note: 'Exceptional quality uplift' });
          return buildMetric({
            value: target.min - base.min - getGemcutterBatchCost(),
            records: [base, target],
            note: 'Exceptional quality uplift'
          });
        }
      },
      {
        key: 'stepTwo',
        labelLines: ['Base -> Upgrade 1'],
        tooltip: 'Classic exceptional gems use Level One to Level Two. Greater support gems use Level One to Level One / 20 Quality, net of Gemcutter’s Prisms.',
        metric: (row) => {
          if (isGreaterExceptionalRow(row)) {
            const base = getRecord(row, '1');
            const target = getRecord(row, '1/20');
            if (!base || !target) return buildMetric({ note: 'Greater support first upgrade' });
            return buildMetric({
              value: target.min - base.min - getGemcutterBatchCost(),
              records: [base, target],
              note: 'Greater support first upgrade'
            });
          }
          return deltaMetric(getRecord(row, '2'), getRecord(row, '1'), 'Leveling gain to 2');
        }
      },
      {
        key: 'stepThree',
        labelLines: ['Upgrade 1 -> End'],
        tooltip: 'Classic exceptional gems use Level Two to Level Three. Greater support gems use Level One / 20 Quality to Level Three / 20 Quality.',
        metric: (row) => (
          isGreaterExceptionalRow(row)
            ? deltaMetric(getRecord(row, '3/20'), getRecord(row, '1/20'), 'Greater support end upgrade')
            : deltaMetric(getRecord(row, '3'), getRecord(row, '2'), 'Leveling gain to 3')
        )
      },
      {
        key: 'routeTotal',
        labelLines: ['Base -> End'],
        tooltip: 'Classic exceptional gems use Level One to Level Three. Greater support gems use Level One to Level Three / 20 Quality, net of Gemcutter’s Prisms.',
        metric: (row) => {
          if (isGreaterExceptionalRow(row)) {
            const base = getRecord(row, '1');
            const target = getRecord(row, '3/20');
            if (!base || !target) return buildMetric({ note: 'Greater support full route' });
            return buildMetric({
              value: target.min - base.min - getGemcutterBatchCost(),
              records: [base, target],
              note: 'Greater support full route'
            });
          }
          return deltaMetric(getRecord(row, '3'), getRecord(row, '1'), 'Full leveling gain');
        }
      },
      {
        key: 'xpPerMillion',
        labelLines: ['Value / M XP'],
        tooltip: 'Currency value added per million gem XP for the full exceptional-gem route',
        metric: (row) => ratioMetric(
          isGreaterExceptionalRow(row)
            ? (() => {
                const base = getRecord(row, '1');
                const target = getRecord(row, '3/20');
                if (!base || !target) return buildMetric({ note: 'Greater support full route' });
                return buildMetric({
                  value: target.min - base.min - getGemcutterBatchCost(),
                  records: [base, target],
                  note: 'Greater support full route'
                });
              })()
            : deltaMetric(getRecord(row, '3'), getRecord(row, '1'), 'Full leveling gain'),
          getRouteXpTotal(row),
          'Exceptional value per million XP'
        )
      },
    ];
  }

  function getCalculatedColumnsForMain() {
    const buildRouteTo20Metric = (row) => {
      const base = getRecord(row, '1');
      const target = getRecord(row, '20');
      if (!base || !target) return buildMetric({ note: 'Leveling gain to 20' });
      return buildMetric({
        value: target.min - base.min,
        records: [base, target],
        note: 'Leveling gain to 20'
      });
    };

    const buildRouteTotalMetric = (row) => {
      const base = getRecord(row, '1');
      const target = getRecord(row, '20/20');
      if (!base || !target) return buildMetric({ note: 'Full leveling gain' });
      return buildMetric({
        value: target.min - base.min - getGemcutterBatchCost(),
        records: [base, target],
        note: 'Full leveling gain'
      });
    };

    const buildNormalizedNoQualityMetric = (row) => normalizeMetricToBaselineXp(
      buildRouteTo20Metric(row),
      getRouteXpTotal(row),
      STANDARD_GEM_XP_BASELINE,
      'Normalized value without quality'
    );

    const buildNormalizedQualityMetric = (row) => normalizeMetricToBaselineXp((() => {
      const base = getRecord(row, '1/20');
      const target = getRecord(row, '20/20');
      if (!base || !target) return buildMetric({ note: 'Leveling gain from 1/20 to 20/20' });
      return buildMetric({
        value: target.min - base.min,
        records: [base, target],
        note: 'Leveling gain from 1/20 to 20/20'
      });
    })(), getRouteXpTotal(row), STANDARD_GEM_XP_BASELINE, 'Normalized value with quality');

    return [
      {
        ...buildMergedMetricColumn(
          'normalizedValuePair',
          ['Normalized value'],
          'Stacked values normalized to 342,051,651 XP, which is approximately a standard gem\'s full leveling cost',
          [
            { label: 'Level 1 to 20', metric: buildNormalizedNoQualityMetric },
            { label: '1/20 to 20/20', metric: buildNormalizedQualityMetric }
          ],
          'Normalized to a standard gem XP budget.\n\nBaseline XP: 342,051,651\nThis is the typical total XP needed for a gem to reach level 20.\n\nFormula:\nroute value × 342,051,651 ÷ that gem\'s actual XP to 20\n\nLines shown:\nLevel 1 to 20 = uncorrupted route\n1/20 to 20/20 = 20-quality route\n\nResult:\nGems with unusual XP curves are scaled back to a standard leveling budget so they compare more fairly.'
        )
      },
    ];
  }

  function getCalculatedColumns() {
    return state.filter === 'exceptional'
      ? getCalculatedColumnsForExceptional()
      : getCalculatedColumnsForMain();
  }

  function getOptionalColumns() {
    if (state.filter === 'exceptional') {
      const rawByKey = new Map(getRawColumnsForExceptional().map((column) => [column.key, column]));
      return [
        rawByKey.get('raw:1/20'),
        rawByKey.get('raw:2'),
        rawByKey.get('raw:3/20'),
        rawByKey.get('raw:1c'),
        rawByKey.get('raw:2c'),
        rawByKey.get('raw:3/23c'),
        rawByKey.get('raw:4/20c'),
        rawByKey.get('raw:5'),
        ...getCalculatedColumnsForExceptional()
      ].filter(Boolean);
    }
    return [];
  }

  function getVisibleCalculatedColumnKeys() {
    const allowedKeys = new Set(getOptionalColumns().map((column) => column.key));
    const stored = Array.isArray(state.visibleCalcColumns[state.filter]) ? state.visibleCalcColumns[state.filter] : [];
    const next = stored.filter((key) => allowedKeys.has(key));
    if (next.length) return next;
    return (DEFAULT_VISIBLE_CALC_COLUMNS[state.filter] || []).filter((key) => allowedKeys.has(key));
  }

  function persistVisibleCalculatedColumnKeys(keys) {
    state.visibleCalcColumns[state.filter] = keys.slice();
    localStorage.setItem(STORAGE_KEYS.visibleCalcColumns, JSON.stringify(state.visibleCalcColumns));
  }

  function orderColumns(columns, filterKey) {
    const order = COLUMN_ORDER[filterKey] || [];
    const orderMap = new Map(order.map((key, index) => [key, index]));
    return columns.slice().sort((a, b) => {
      const aIndex = orderMap.has(a.key) ? orderMap.get(a.key) : Number.MAX_SAFE_INTEGER;
      const bIndex = orderMap.has(b.key) ? orderMap.get(b.key) : Number.MAX_SAFE_INTEGER;
      if (aIndex !== bIndex) return aIndex - bIndex;
      return a.key.localeCompare(b.key);
    });
  }

  function getAllColumnDefs() {
    if (state.filter === 'exceptional') {
      return orderColumns(getRawColumnsForExceptional().concat(getCalculatedColumnsForExceptional()), 'exceptional');
    }

    return orderColumns(getRawColumnsForMain().concat(getCalculatedColumnsForMain()), state.filter);
  }

  function getColumnDefs() {
    const visibleOptional = new Set(getVisibleCalculatedColumnKeys());
    const baseVisible = new Set(BASE_VISIBLE_COLUMN_KEYS[state.filter] || []);
    return getAllColumnDefs().filter((column) => baseVisible.has(column.key) || visibleOptional.has(column.key));
  }

  function renderColumnToggleBar() {
    if (!columnToggleBar) return;
    const menu = columnToggleBar.closest('.gem-column-menu');
    columnToggleBar.innerHTML = '';
    const optionalColumns = getOptionalColumns();
    if (menu) {
      menu.hidden = optionalColumns.length === 0;
      if (optionalColumns.length === 0) menu.open = false;
    }
    if (!optionalColumns.length) return;
    const visibleKeys = new Set(getVisibleCalculatedColumnKeys());
    for (const column of optionalColumns) {
      const label = document.createElement('label');
      label.className = 'column-toggle-chip';
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = visibleKeys.has(column.key);
      input.addEventListener('change', () => {
        const nextVisible = getVisibleCalculatedColumnKeys().filter((key) => key !== column.key);
        if (input.checked) nextVisible.push(column.key);
        persistVisibleCalculatedColumnKeys(Array.from(new Set(nextVisible)));
        render();
      });
      const text = document.createElement('span');
      text.textContent = column.labelLines.join(' ');
      if (column.tooltip) label.title = column.tooltip;
      label.append(input, text);
      columnToggleBar.appendChild(label);
    }
  }

  function ninjaDetailUrl(leagueId, detailsId) {
    const leagueSlug = slugifyLeague(leagueId);
    if (!leagueSlug || !detailsId) return null;
    return `${NINJA_ECONOMY_BASE}/${encodeURIComponent(leagueSlug)}/skill-gems/${encodeURIComponent(detailsId)}`;
  }

  function gemWikiUrl(name) {
    if (!name) return null;
    return `https://www.poewiki.net/wiki/${encodeURIComponent(String(name).replace(/ /g, '_'))}`;
  }

  function buildRows(items, leagueId) {
    const grouped = new Map();
    for (const item of items) {
      if (!grouped.has(item.name)) grouped.set(item.name, []);
      grouped.get(item.name).push(item);
    }
    return Array.from(grouped.entries())
      .map(([name, records]) => {
        const sortedRecords = records
          .slice()
          .sort((a, b) => {
            const aLevel = Number.isFinite(a.gemLevel) ? a.gemLevel : 999;
            const bLevel = Number.isFinite(b.gemLevel) ? b.gemLevel : 999;
            if (aLevel !== bLevel) return aLevel - bLevel;
            const aQuality = Number.isFinite(a.gemQuality) ? a.gemQuality : -1;
            const bQuality = Number.isFinite(b.gemQuality) ? b.gemQuality : -1;
            if (aQuality !== bQuality) return aQuality - bQuality;
            if (Boolean(a.corrupted) !== Boolean(b.corrupted)) return a.corrupted ? 1 : -1;
            return (a.min || 0) - (b.min || 0);
          });
        const representative = sortedRecords[0] || {};
        const tags = buildGemTags(sortedRecords, name);
        const states = {};
        const additionalStates = [];
        for (const record of sortedRecords) {
          const key = gemStateKey(record);
          if (key) {
            if (!states[key] || record.min < states[key].min) states[key] = record;
          } else {
            additionalStates.push(describeAdditionalState(record));
          }
        }
        return {
          name,
          tags,
          exceptionalKind: isClassicExceptionalGem(name) ? 'classic' : (isGreaterExceptionalGem(sortedRecords, name) ? 'greater' : null),
          icon: representative.icon || '',
          detailsId: representative.detailsId || '',
          detailUrl: ninjaDetailUrl(leagueId, representative.detailsId),
          wikiUrl: gemWikiUrl(name),
          levelRequired: Number.isFinite(representative.levelRequired) ? representative.levelRequired : null,
          gemType: representative.gemType || null,
          searchText: String(name || '').toLowerCase(),
          states,
          hiddenStates: additionalStates.length,
          additionalStates
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  function getActiveSortKey() {
    const defaultKey = DEFAULT_SORT_BY_FILTER[state.filter] || 'name';
    const availableKeys = new Set(getAllColumnDefs().map((column) => column.key));
    if (state.sortKey === 'name') return 'name';
    if (availableKeys.has(state.sortKey)) return state.sortKey;
    if (availableKeys.has(defaultKey)) return defaultKey;
    return 'name';
  }

  function matchesSelectedFilterBucket(row) {
    if (isExceptionalRow(row) || isVaalRow(row)) return false;
    if (state.filter === 'all') return true;
    if (state.filter === 'normal') return !row?.tags?.includes('Transfigured') && !isSupportRow(row);
    if (state.filter === 'transfigured') return row?.tags?.includes('Transfigured') && !isSupportRow(row);
    if (state.filter === 'support') return isSupportRow(row);
    return false;
  }

  function filterRows(rows) {
    const query = state.search.trim().toLowerCase();
    return rows.filter((row) => {
      if (query && !row.searchText.includes(query)) return false;
      if (Number.isFinite(state.startValueLimitChaos)) {
        const base = getRecord(row, '1');
        if (Number.isFinite(base?.min) && base.min > state.startValueLimitChaos) return false;
      }
      return matchesSelectedFilterBucket(row);
    });
  }

  function sortRows(rows) {
    const sortKey = getActiveSortKey();
    const direction = state.sortDir === 'asc' ? 1 : -1;
    const columnMap = new Map(getAllColumnDefs().map((column) => [column.key, column]));
    return rows.slice().sort((a, b) => {
      if (sortKey === 'name') {
        return a.name.localeCompare(b.name) * direction;
      }
      const column = columnMap.get(sortKey);
      if (!column) return a.name.localeCompare(b.name);
      const aValue = metricForDisplay(column.metric(a))?.value;
      const bValue = metricForDisplay(column.metric(b))?.value;
      const aMissing = !Number.isFinite(aValue);
      const bMissing = !Number.isFinite(bValue);
      if (aMissing !== bMissing) return aMissing ? 1 : -1;
      if (!aMissing && aValue !== bValue) return (aValue - bValue) * direction;
      return a.name.localeCompare(b.name);
    });
  }

  function preserveVisibleRowOrder(rows) {
    const orderMap = new Map((state.visibleRows || []).map((row, index) => [row.name, index]));
    return rows.slice().sort((a, b) => {
      const aIndex = orderMap.has(a.name) ? orderMap.get(a.name) : Number.MAX_SAFE_INTEGER;
      const bIndex = orderMap.has(b.name) ? orderMap.get(b.name) : Number.MAX_SAFE_INTEGER;
      if (aIndex !== bIndex) return aIndex - bIndex;
      return a.name.localeCompare(b.name);
    });
  }

  function isTableLinkActivationPending() {
    return state.pendingTableLinkActivationUntil > Date.now();
  }

  function renderFilterBar() {
    filterBar.innerHTML = '';
    for (const filter of FILTER_DEFS) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `filter-chip${state.filter === filter.key ? ' is-active' : ''}`;
      button.textContent = filter.label;
      button.setAttribute('aria-pressed', state.filter === filter.key ? 'true' : 'false');
      button.addEventListener('click', () => {
        state.filter = filter.key;
        state.sortFrozen = false;
        localStorage.setItem(STORAGE_KEYS.filter, state.filter);
        state.sortKey = DEFAULT_SORT_BY_FILTER[state.filter] || 'name';
        state.sortDir = 'desc';
        localStorage.setItem(STORAGE_KEYS.sortKey, state.sortKey);
        localStorage.setItem(STORAGE_KEYS.sortDir, state.sortDir);
        render();
      });
      filterBar.appendChild(button);
    }
  }

  function renderSummary() {
    const total = state.rows.filter(matchesSelectedFilterBucket).length;
    const visible = state.visibleRows.length;
    const leagueText = state.leagueId || 'Unknown league';
    const updated = formatUpdatedAt(state.updatedAt);
    summaryEl.textContent = `Showing ${visible.toLocaleString()} of ${total.toLocaleString()} gems in ${leagueText}. Updated ${updated}.`;
  }

  function syncBudgetControls() {
    startValueLimitInput.value = displayValueFromChaos(state.startValueLimitChaos);
    startValueLimitUnit.textContent = state.displayCurrency === 'divine' ? 'div' : 'c';
  }

  function renderTableHeader() {
    const columns = getColumnDefs();
    tableColgroup.innerHTML = '';
    tableHeadRow.innerHTML = '';

    const gemCol = document.createElement('col');
    gemCol.className = 'col-gem';
    tableColgroup.appendChild(gemCol);

    for (let i = 0; i < columns.length; i += 1) {
      const stateCol = document.createElement('col');
      const baseClass = columns[i].isRaw
        ? (columns[i].isRawGroup ? 'col-raw-group' : 'col-raw')
        : 'col-state';
      const keyClass = `col-key-${String(columns[i].key || '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')}`;
      stateCol.className = `${baseClass} ${keyClass}`.trim();
      tableColgroup.appendChild(stateCol);
    }

    const gemHeader = document.createElement('th');
    gemHeader.appendChild(buildHeaderButton({
      key: 'name',
      lines: ['Gem']
    }));
    tableHeadRow.appendChild(gemHeader);

    for (const column of columns) {
      const cell = document.createElement('th');
      if (column.key === 'normalizedValuePair') cell.classList.add('gem-column-primary');
      const headerWrap = document.createElement('div');
      headerWrap.className = 'gem-header-cell';
      headerWrap.appendChild(buildHeaderButton({
        key: column.key,
        lines: column.labelLines,
        tooltip: column.tooltip
      }));
      if (column.infoTooltip) {
        const info = document.createElement('span');
        info.className = 'info-dot has-tooltip tooltip-below';
        info.textContent = '?';
        info.dataset.tooltip = column.infoTooltip;
        info.setAttribute('tabindex', '0');
        info.setAttribute('aria-label', column.infoTooltip);
        headerWrap.appendChild(info);
      }
      cell.appendChild(headerWrap);
      tableHeadRow.appendChild(cell);
    }

  }

  function buildHeaderButton({ key, lines, tooltip }) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `gem-header-button${getActiveSortKey() === key ? ' is-active' : ''}`;
    button.dataset.sortKey = key;
    const labelText = tooltip || lines.join(' ');
    button.setAttribute('aria-label', `Sort by ${labelText}`);
    button.setAttribute('aria-pressed', getActiveSortKey() === key ? 'true' : 'false');
    if (tooltip) button.title = tooltip;
    const label = document.createElement('span');
    label.className = 'gem-header-label';
    for (const line of lines) {
      const span = document.createElement('span');
      span.className = 'gem-header-line';
      span.textContent = line;
      label.appendChild(span);
    }
    button.appendChild(label);
    if (getActiveSortKey() === key) {
      const indicator = document.createElement('span');
      indicator.className = 'gem-sort-indicator';
      indicator.textContent = state.sortDir === 'asc' ? '↑' : '↓';
      button.appendChild(indicator);
    }
    button.addEventListener('click', () => {
      state.sortFrozen = false;
      if (state.sortKey === key) {
        state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
      } else {
        state.sortKey = key;
        state.sortDir = key === 'name' ? 'asc' : 'desc';
      }
      localStorage.setItem(STORAGE_KEYS.sortKey, state.sortKey);
      localStorage.setItem(STORAGE_KEYS.sortDir, state.sortDir);
      render();
    });
    return button;
  }

  function renderMetricCell(cell, metric, { delta = false } = {}) {
    const displayMetric = metricForDisplay(metric);
    if (!Number.isFinite(displayMetric?.value)) {
      cell.innerHTML = '<span class="gem-missing">—</span>';
      return;
    }
    const value = document.createElement('div');
    value.className = `gem-metric${displayMetric.lowConfidence ? ' is-low-confidence' : ''}${delta && displayMetric.value < 0 ? ' is-negative' : ''}${delta && displayMetric.value > 0 ? ' is-positive' : ''}`;
    value.textContent = displayMetric.format === 'rate'
      ? formatRate(displayMetric.value)
      : (delta ? formatDelta(displayMetric.value) : formatPrice(displayMetric.value));
    cell.appendChild(value);
    if (displayMetric.label) {
      const note = document.createElement('div');
      note.className = 'gem-cell-note';
      note.textContent = displayMetric.label;
      cell.appendChild(note);
    }
    if (displayMetric.lowConfidence) {
      const parts = displayMetric.records
        .filter((record) => record.lowConfidence)
        .map((record) => `${record.variant || record.name} (${getListingCount(record)} listings)`);
      if (parts.length) {
        value.classList.add('has-tooltip');
        value.dataset.tooltip = `Sparse market data: ${parts.join(', ')}`;
        value.setAttribute('tabindex', '0');
        value.setAttribute('aria-label', `Sparse market data: ${parts.join(', ')}`);
      }
    }
  }

  function renderMetricGroupCell(cell, rowData, column, { delta = false } = {}) {
    if (column.key === 'normalizedValuePair') cell.classList.add('gem-column-primary');
    const stack = document.createElement('div');
    stack.className = `gem-metric-stack${column.key === 'normalizedValuePair' ? ' is-primary' : ''}`;

    for (const entry of column.metricDefs || []) {
      const line = document.createElement('div');
      line.className = 'gem-metric-stack-line';

      const valueWrap = document.createElement('div');
      valueWrap.className = 'gem-metric-stack-value';
      renderMetricCell(valueWrap, entry.metric(rowData), { delta });
      line.appendChild(valueWrap);

      const label = document.createElement('span');
      label.className = 'gem-metric-stack-label';
      label.textContent = entry.label;
      line.appendChild(label);

      stack.appendChild(line);
    }

    cell.appendChild(stack);
  }

  function buildRawStateInput(rowData, stateKey) {
    const record = getRecord(rowData, stateKey);
    const wrapper = document.createElement('div');
    wrapper.className = 'gem-raw-entry';

    const input = document.createElement('input');
    input.type = 'number';
    input.step = '0.01';
    input.min = '0';
    input.className = `gem-raw-input${record?.manualOverride ? ' is-manual' : ''}${record?.lowConfidence ? ' is-low-confidence' : ''}`;
    input.value = displayValueFromChaos(record?.min);
    input.placeholder = '';
    if (record?.lowConfidence && !record?.manualOverride) {
      const count = getListingCount(record);
      input.title = count ? `Sparse market data (${count} listings)` : 'Sparse market data';
    }
    input.addEventListener('change', () => {
      const overrideKey = `${slugifyLeague(state.leagueId)}::${rowData.name}::${stateKey}`;
      const nextValue = chaosValueFromDisplay(input.value);
      if (nextValue == null) {
        delete state.rawOverrides[overrideKey];
      } else {
        state.rawOverrides[overrideKey] = nextValue;
      }
      state.sortFrozen = true;
      localStorage.setItem(STORAGE_KEYS.rawOverrides, JSON.stringify(state.rawOverrides));
      const affectsVisibility = Number.isFinite(state.startValueLimitChaos) && stateKey === '1';
      const delayMs = isTableLinkActivationPending() ? 180 : 0;
      window.setTimeout(() => {
        if (affectsVisibility || !rerenderRowInPlace(rowData)) {
          render();
          return;
        }
        renderSummary();
        updateDebugOutput();
      }, delayMs);
    });
    wrapper.appendChild(input);

    return wrapper;
  }

  function renderRawStateCell(cell, rowData, column) {
    if (column.isRawGroup && Array.isArray(column.rawStateKeys)) {
      const stack = document.createElement('div');
      stack.className = 'gem-raw-stack';
      column.rawStateKeys.forEach((stateKey) => {
        const line = document.createElement('div');
        line.className = 'gem-raw-stack-line';
        line.append(buildRawStateInput(rowData, stateKey));
        const tradeUrl = buildGemTradeUrl(rowData, stateKey);
        const label = tradeUrl ? document.createElement('a') : document.createElement('span');
        label.className = 'gem-raw-stack-label';
        label.textContent = formatGemStateLabel(stateKey);
        if (tradeUrl) {
          label.href = tradeUrl;
          label.target = '_blank';
          label.rel = 'noreferrer';
        }
        line.appendChild(label);
        stack.appendChild(line);
      });
      cell.appendChild(stack);
      return;
    }

    cell.appendChild(buildRawStateInput(rowData, column.rawStateKey));
  }

  function buildTableRow(rowData, columns) {
    const row = document.createElement('tr');
    row.dataset.rowName = rowData.name;

    const nameCell = document.createElement('td');
    const nameWrap = document.createElement('div');
    nameWrap.className = 'item-cell';
    if (rowData.icon) {
      const icon = document.createElement('img');
      icon.className = 'item-icon';
      icon.src = rowData.icon;
      icon.alt = '';
      icon.loading = 'lazy';
      nameWrap.appendChild(icon);
    }
    const label = document.createElement('div');
    label.className = 'item-label';
    const primary = rowData.detailUrl ? document.createElement('a') : document.createElement('span');
    primary.className = rowData.detailUrl ? 'item-primary item-link' : 'item-primary';
    primary.textContent = rowData.name;
    if (rowData.detailUrl) {
      primary.href = rowData.detailUrl;
      primary.target = '_blank';
      primary.rel = 'noreferrer';
    }
    label.appendChild(primary);
    if (rowData.hiddenStates) {
      const meta = document.createElement('span');
      meta.className = 'item-meta gem-name-meta';
      meta.textContent = `+${rowData.hiddenStates} additional state${rowData.hiddenStates === 1 ? '' : 's'}`;
      if (Array.isArray(rowData.additionalStates) && rowData.additionalStates.length) {
        meta.classList.add('has-tooltip');
        meta.dataset.tooltip = rowData.additionalStates.join(', ');
        meta.setAttribute('tabindex', '0');
        meta.setAttribute('aria-label', `Additional states: ${rowData.additionalStates.join(', ')}`);
      }
      label.appendChild(meta);
    }
    nameWrap.appendChild(label);
    nameCell.appendChild(nameWrap);
    row.appendChild(nameCell);

    for (const column of columns) {
      const cell = document.createElement('td');
      cell.className = 'gem-state-cell';
      if (column.isRaw) {
        renderRawStateCell(cell, rowData, column);
      } else if (column.isMetricGroup) {
        renderMetricGroupCell(cell, rowData, column, { delta: true });
      } else {
        renderMetricCell(cell, column.metric(rowData), { delta: true });
      }
      row.appendChild(cell);
    }

    return row;
  }

  function renderTable() {
    const columns = getColumnDefs();
    tableBody.innerHTML = '';
    if (!state.visibleRows.length) {
      const row = document.createElement('tr');
      const cell = document.createElement('td');
      cell.colSpan = columns.length + 1;
      cell.className = 'gem-empty';
      cell.textContent = 'No gems match the current search and filters.';
      row.appendChild(cell);
      tableBody.appendChild(row);
      return;
    }
    const fragment = document.createDocumentFragment();
    for (const rowData of state.visibleRows) {
      fragment.appendChild(buildTableRow(rowData, columns));
    }
    tableBody.replaceChildren(fragment);
  }

  function rerenderRowInPlace(rowData) {
    const existing = tableBody.querySelector(`tr[data-row-name=\"${CSS.escape(rowData.name)}\"]`);
    if (!existing) return false;
    const replacement = buildTableRow(rowData, getColumnDefs());
    existing.replaceWith(replacement);
    return true;
  }

  function updateDebugOutput() {
    const debug = {
      league: state.leagueId,
      leagueSlug: slugifyLeague(state.leagueId),
      displayCurrency: state.displayCurrency,
      divineRateChaos: state.divineRate,
      gemcutterCostChaos: state.gemcutterCost,
      startValueLimitChaos: state.startValueLimitChaos,
      rawOverrideCount: Object.keys(state.rawOverrides || {}).length,
      visibleCalcColumns: state.visibleCalcColumns,
      gemXpEntries: Object.keys(state.gemXp || {}).length,
      rows: state.rows.length,
      visibleRows: state.visibleRows.length,
      filter: state.filter,
      sortKey: state.sortKey,
      sortDir: state.sortDir,
      search: state.search,
      updatedAt: state.updatedAt,
      sourceUrls: state.sourceUrls
    };
    debugContent.textContent = JSON.stringify(debug, null, 2);
  }

  function render() {
    const filteredRows = filterRows(state.rows);
    state.visibleRows = state.sortFrozen
      ? preserveVisibleRowOrder(filteredRows)
      : sortRows(filteredRows);
    renderFilterBar();
    renderColumnToggleBar();
    renderSummary();
    syncBudgetControls();
    renderTableHeader();
    renderTable();
    updateDisplayCurrencyLabels();
    updateDebugOutput();
  }

  function scheduleSearchRender() {
    window.clearTimeout(state.searchRenderTimer);
    state.searchRenderTimer = window.setTimeout(() => {
      state.searchRenderTimer = null;
      render();
    }, 90);
  }

  function scheduleGemcutterRender() {
    window.clearTimeout(state.gemcutterRenderTimer);
    state.gemcutterRenderTimer = window.setTimeout(() => {
      state.gemcutterRenderTimer = null;
      render();
    }, 90);
  }

  function hasEmptyViewFallbackState() {
    return Boolean(
      (state.search && state.search.trim())
      || Number.isFinite(state.startValueLimitChaos)
      || state.filter !== 'all'
    );
  }

  function clearEmptyViewFallbackState() {
    localStorage.removeItem(STORAGE_KEYS.startValueLimitChaos);
    localStorage.removeItem(STORAGE_KEYS.search);
    localStorage.removeItem(STORAGE_KEYS.filter);
    localStorage.removeItem(STORAGE_KEYS.sortKey);
    localStorage.removeItem(STORAGE_KEYS.sortDir);

    state.startValueLimitChaos = null;
    state.search = '';
    state.filter = 'all';
    state.sortFrozen = false;
    state.sortKey = DEFAULT_SORT_BY_FILTER.all;
    state.sortDir = 'desc';

    searchInput.value = '';
  }

  async function loadLeagueOptions() {
    const response = await fetch('data/poe-ninja/leagues.json', { cache: 'no-store' });
    if (!response.ok) throw new Error(`Failed to load leagues (${response.status})`);
    const payload = await response.json();
    state.leagues = pickVisibleLeagues(payload.leagues || []);
    leagueSelect.innerHTML = '';
    for (const league of state.leagues) {
      const option = document.createElement('option');
      option.value = league.id;
      option.textContent = league.text;
      leagueSelect.appendChild(option);
    }
    if (!state.leagueId || !state.leagues.some((league) => league.id === state.leagueId)) {
      state.leagueId = state.leagues.find((league) => league.id === DEFAULT_LEAGUE)?.id || state.leagues[0]?.id || '';
      persistLeagueSelection(state.leagueId);
    }
    leagueSelect.value = state.leagueId;
  }

  async function loadGemData() {
    const leagueSlug = slugifyLeague(state.leagueId);
    const gemsUrl = `data/poe-ninja/prices/${leagueSlug}/category/gems.json`;
    const currencyUrl = `data/poe-ninja/prices/${leagueSlug}/category/currency.json`;
    const gemXpUrl = 'data/gem-xp.json';
    state.sourceUrls = [gemsUrl, currencyUrl, gemXpUrl];
    const [gemsResponse, currencyResponse, gemXpResponse] = await Promise.all([
      fetch(gemsUrl, { cache: 'no-store' }),
      fetch(currencyUrl, { cache: 'no-store' }),
      fetch(gemXpUrl, { cache: 'no-store' })
    ]);
    if (!gemsResponse.ok) throw new Error(`Failed to load gem prices (${gemsResponse.status})`);
    if (!currencyResponse.ok) throw new Error(`Failed to load currency prices (${currencyResponse.status})`);
    const gemsPayload = await gemsResponse.json();
    const currencyPayload = await currencyResponse.json();
    const gemXpPayload = gemXpResponse.ok ? await gemXpResponse.json() : { entries: {} };
    const items = Array.isArray(gemsPayload.items) ? gemsPayload.items : [];
    const currencyItems = Array.isArray(currencyPayload.items) ? currencyPayload.items : [];
    const divineOrb = (currencyPayload.items || []).find((item) => item.name === 'Divine Orb');
    const gemcutterPrism = currencyItems.find((item) => item.name === 'Gemcutter\'s Prism');
    state.rows = buildRows(items, state.leagueId);
    state.rowByName = new Map(state.rows.map((row) => [row.name, row]));
    state.gemXp = gemXpPayload?.entries && typeof gemXpPayload.entries === 'object' ? gemXpPayload.entries : {};
    state.divineRate = Number.isFinite(divineOrb?.min) ? divineOrb.min : null;
    state.apiGemcutterCost = Number.isFinite(gemcutterPrism?.min) ? roundCurrencyInput(gemcutterPrism.min) : null;
    if (Number.isFinite(gemcutterPrism?.min) && state.gemcutterCost == null) {
      state.gemcutterCost = roundCurrencyInput(gemcutterPrism.min);
      localStorage.setItem(STORAGE_KEYS.gemcutterCost, String(state.gemcutterCost));
    }
    state.gemcutterIcon = gemcutterPrism?.icon || '';
    gemcutterCostInput.value = state.gemcutterCost == null ? '' : String(state.gemcutterCost);
    gemcutterCostIcon.src = state.gemcutterIcon;
    gemcutterCostIcon.hidden = !state.gemcutterIcon;
    state.updatedAt = gemsPayload.updatedAt || currencyPayload.updatedAt || gemsPayload.generatedAt || null;
  }

  function renderChangelogEntries(entries) {
    changelogContent.innerHTML = '';
    if (!Array.isArray(entries) || !entries.length) {
      changelogContent.innerHTML = '<div class="muted">No changelog entries available.</div>';
      return;
    }
    for (const entry of entries) {
      const article = document.createElement('article');
      article.className = 'changelog-entry';
      const meta = document.createElement('div');
      meta.className = 'changelog-meta';
      meta.innerHTML = `<span class="changelog-version">v${entry.version}</span><span>${entry.date}</span>`;
      const list = document.createElement('ul');
      list.className = 'changelog-list';
      for (const change of entry.changes || []) {
        const item = document.createElement('li');
        item.textContent = change;
        list.appendChild(item);
      }
      article.append(meta, list);
      changelogContent.appendChild(article);
    }
  }

  async function loadChangelog() {
    try {
      const response = await fetch('changelog.json', { cache: 'no-store' });
      if (!response.ok) throw new Error(String(response.status));
      const payload = await response.json();
      renderChangelogEntries(payload.entries || []);
    } catch (error) {
      changelogContent.innerHTML = `<div class="status error">Failed to load changelog: ${error.message}</div>`;
    }
  }

  function openDialog(dialog) {
    if (!dialog) return;
    if (typeof dialog.showModal === 'function') {
      dialog.showModal();
    } else {
      dialog.setAttribute('open', 'open');
    }
  }

  function closeDialog(dialog) {
    if (!dialog) return;
    if (typeof dialog.close === 'function') {
      dialog.close();
    } else {
      dialog.removeAttribute('open');
    }
  }

  function bindDialog(dialog, openButton, closeButton) {
    openButton?.addEventListener('click', (event) => {
      event.preventDefault();
      openDialog(dialog);
    });
    closeButton?.addEventListener('click', () => closeDialog(dialog));
    dialog?.addEventListener('click', (event) => {
      if (event.target === dialog) closeDialog(dialog);
    });
  }

  async function refreshPageData() {
    statusEl.classList.remove('error');
    statusEl.textContent = 'Loading gem price matrix...';
    try {
      await loadGemData();
      render();
      if (state.rows.length && !state.visibleRows.length && hasEmptyViewFallbackState()) {
        clearEmptyViewFallbackState();
        render();
      }
      statusEl.textContent = '';
    } catch (error) {
      state.rows = [];
      state.visibleRows = [];
      render();
      statusEl.classList.add('error');
      statusEl.textContent = error.message;
    }
  }

  leagueSelect.addEventListener('change', async () => {
    state.leagueId = leagueSelect.value;
    persistLeagueSelection(state.leagueId);
    await refreshPageData();
  });

  displayCurrencySelect.addEventListener('change', () => {
    state.displayCurrency = displayCurrencySelect.value === 'divine' ? 'divine' : 'chaos';
    localStorage.setItem(STORAGE_KEYS.displayCurrency, state.displayCurrency);
    render();
  });

  gemcutterCostInput.addEventListener('input', () => {
    const rawValue = gemcutterCostInput.value.trim();
    const value = rawValue === '' ? null : roundCurrencyInput(Number(rawValue));
    state.gemcutterCost = value;
    if (value == null) {
      localStorage.removeItem(STORAGE_KEYS.gemcutterCost);
    } else {
      localStorage.setItem(STORAGE_KEYS.gemcutterCost, String(value));
    }
    scheduleGemcutterRender();
  });

  ignoreLowConfidenceInput.addEventListener('change', () => {
    state.ignoreLowConfidence = ignoreLowConfidenceInput.checked;
    localStorage.setItem(STORAGE_KEYS.ignoreLowConfidence, state.ignoreLowConfidence ? 'true' : 'false');
    render();
  });

  startValueLimitInput.addEventListener('change', () => {
    const nextValue = chaosValueFromDisplay(startValueLimitInput.value);
    state.startValueLimitChaos = nextValue;
    if (nextValue == null) {
      localStorage.removeItem(STORAGE_KEYS.startValueLimitChaos);
    } else {
      localStorage.setItem(STORAGE_KEYS.startValueLimitChaos, String(state.startValueLimitChaos));
    }
    render();
  });

  searchInput.addEventListener('input', () => {
    state.search = searchInput.value;
    localStorage.setItem(STORAGE_KEYS.search, state.search);
    scheduleSearchRender();
  });

  tableBody.addEventListener('pointerdown', (event) => {
    if (!(event.target instanceof Element)) return;
    const link = event.target.closest('a');
    if (!link) return;
    state.pendingTableLinkActivationUntil = Date.now() + 250;
  }, true);

  resetGemSettingsButton?.addEventListener('click', (event) => {
    event.preventDefault();
    localStorage.removeItem(STORAGE_KEYS.displayCurrency);
    localStorage.removeItem(STORAGE_KEYS.gemcutterCost);
    localStorage.removeItem(STORAGE_KEYS.ignoreLowConfidence);
    localStorage.removeItem(STORAGE_KEYS.startValueLimitChaos);
    localStorage.removeItem(STORAGE_KEYS.rawOverrides);
    localStorage.removeItem(STORAGE_KEYS.visibleCalcColumns);
    localStorage.removeItem(STORAGE_KEYS.search);
    localStorage.removeItem(STORAGE_KEYS.filter);
    localStorage.removeItem(STORAGE_KEYS.sortKey);
    localStorage.removeItem(STORAGE_KEYS.sortDir);

    state.displayCurrency = 'chaos';
    state.gemcutterCost = state.apiGemcutterCost;
    state.ignoreLowConfidence = true;
    state.startValueLimitChaos = null;
    state.rawOverrides = {};
    state.visibleCalcColumns = {
      all: DEFAULT_VISIBLE_CALC_COLUMNS.all.slice(),
      normal: DEFAULT_VISIBLE_CALC_COLUMNS.normal.slice(),
      transfigured: DEFAULT_VISIBLE_CALC_COLUMNS.transfigured.slice(),
      support: DEFAULT_VISIBLE_CALC_COLUMNS.support.slice(),
      exceptional: DEFAULT_VISIBLE_CALC_COLUMNS.exceptional.slice()
    };
    state.search = '';
    state.filter = 'all';
    state.sortFrozen = false;
    state.sortKey = DEFAULT_SORT_BY_FILTER.all;
    state.sortDir = 'desc';

    displayCurrencySelect.value = state.displayCurrency;
    gemcutterCostInput.value = state.gemcutterCost == null ? '' : String(state.gemcutterCost);
    searchInput.value = state.search;
    statusEl.classList.remove('error');
    statusEl.textContent = 'Gem settings reset (league preserved).';
    render();
  });

  refreshButton?.addEventListener('click', async () => {
    statusEl.classList.remove('error');
    statusEl.textContent = 'Refreshing gem prices...';
    try {
      await loadLeagueOptions();
      await refreshPageData();
    } catch (error) {
      statusEl.classList.add('error');
      statusEl.textContent = error.message;
    }
  });

  bindDialog(changelogDialog, openChangelog, closeChangelog);
  bindDialog(debugDialog, openDebug, closeDebug);

  (async () => {
    try {
      await loadLeagueOptions();
      await Promise.all([refreshPageData(), loadChangelog()]);
    } catch (error) {
      statusEl.classList.add('error');
      statusEl.textContent = error.message;
    }
  })();
})();
  function parseStoredStartValueLimit(value) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0) return null;
    return parsed;
  }
