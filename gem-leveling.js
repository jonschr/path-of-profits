(function initGemLevelingPage() {
  'use strict';

  const STORAGE_KEYS = {
    league: 'poeGemLeague',
    displayCurrency: 'poeGemDisplayCurrency',
    search: 'poeGemSearch',
    filter: 'poeGemFilter'
  };
  const FALLBACK_LEAGUES = ['Standard', 'Hardcore', 'Mirage', 'Hardcore Mirage'];
  const ETERNAL_LEAGUES = new Set(['standard', 'hardcore']);
  const FILTER_DEFS = [
    { key: 'normal', label: 'Normal' },
    { key: 'transfigured', label: 'Transfigured' },
    { key: 'exceptional', label: 'Exceptional' },
    { key: 'vaal', label: 'Vaal' }
  ];
  const EXCEPTIONAL_COLUMNS = [
    { key: '1', label: '1' },
    { key: '1c', label: '1c' },
    { key: '1/20', label: '1/20' },
    { key: '2', label: '2' },
    { key: '3', label: '3' },
    { key: '4c', label: '4c' }
  ];
  const STANDARD_COLUMNS = [
    { key: '1', label: '1' },
    { key: '1/20', label: '1/20' },
    { key: '20c', label: '20c' },
    { key: '21c', label: '21c' },
    { key: '21/20c', label: '21/20c' },
    { key: '21/23c', label: '21/23c' }
  ];
  const NINJA_ECONOMY_BASE = 'https://poe.ninja/poe1/economy';

  const leagueSelect = document.getElementById('gemLeagueSelect');
  const displayCurrencySelect = document.getElementById('gemDisplayCurrency');
  const searchInput = document.getElementById('gemSearchInput');
  const filterBar = document.getElementById('gemFilterBar');
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
  const openChangelog = document.getElementById('openChangelog');
  const closeChangelog = document.getElementById('closeChangelog');
  const openDebug = document.getElementById('openDebug');
  const closeDebug = document.getElementById('closeDebug');

  const state = {
    leagueId: localStorage.getItem(STORAGE_KEYS.league) || '',
    displayCurrency: localStorage.getItem(STORAGE_KEYS.displayCurrency) === 'divine' ? 'divine' : 'chaos',
    search: localStorage.getItem(STORAGE_KEYS.search) || '',
    filter: localStorage.getItem(STORAGE_KEYS.filter) || 'normal',
    leagues: [],
    rows: [],
    visibleRows: [],
    divineRate: null,
    updatedAt: null,
    sourceUrls: []
  };

  displayCurrencySelect.value = state.displayCurrency;
  searchInput.value = state.search;
  if (!FILTER_DEFS.some((filter) => filter.key === state.filter)) {
    state.filter = 'normal';
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
    if (level === 3 && quality == null && !corrupted) return '3';
    if (level === 4 && quality == null && corrupted) return '4c';
    if (level === 20 && quality == null && corrupted) return '20c';
    if (level === 21 && quality == null && corrupted) return '21c';
    if (level === 21 && quality === 20 && corrupted) return '21/20c';
    if (level === 21 && quality === 23 && corrupted) return '21/23c';
    return null;
  }

  function isExceptionalGem(name) {
    return /^(Awakened )?(Enlighten|Empower|Enhance) Support$/i.test(String(name || ''));
  }

  function buildGemTags(records, name) {
    const first = records[0] || {};
    const tags = [];
    if (first.gemType === 'Normal') tags.push('Normal');
    if (first.isTransfigured) tags.push('Transfigured');
    if (first.isVaal) tags.push('Vaal');
    if (isExceptionalGem(name)) tags.push('Exceptional');
    return tags;
  }

  function getActiveColumns() {
    return state.filter === 'exceptional' ? EXCEPTIONAL_COLUMNS : STANDARD_COLUMNS;
  }

  function ninjaDetailUrl(leagueId, detailsId) {
    const leagueSlug = slugifyLeague(leagueId);
    if (!leagueSlug || !detailsId) return null;
    return `${NINJA_ECONOMY_BASE}/${encodeURIComponent(leagueSlug)}/skill-gems/${encodeURIComponent(detailsId)}`;
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
        let hiddenStates = 0;
        for (const record of sortedRecords) {
          const key = gemStateKey(record);
          if (key) {
            if (!states[key] || record.min < states[key].min) states[key] = record;
          } else {
            hiddenStates += 1;
          }
        }
        return {
          name,
          tags,
          icon: representative.icon || '',
          detailsId: representative.detailsId || '',
          detailUrl: ninjaDetailUrl(leagueId, representative.detailsId),
          searchText: `${name} ${tags.join(' ')}`.toLowerCase(),
          states,
          hiddenStates
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  function filterRows(rows) {
    const query = state.search.trim().toLowerCase();
    return rows.filter((row) => {
      if (query && !row.searchText.includes(query)) return false;
      return row.tags.some((tag) => tag.toLowerCase() === state.filter);
    });
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
        localStorage.setItem(STORAGE_KEYS.filter, state.filter);
        render();
      });
      filterBar.appendChild(button);
    }
  }

  function renderSummary() {
    const total = state.rows.length;
    const visible = state.visibleRows.length;
    const leagueText = state.leagueId || 'Unknown league';
    const updated = formatUpdatedAt(state.updatedAt);
    summaryEl.textContent = `Showing ${visible.toLocaleString()} of ${total.toLocaleString()} gems in ${leagueText}. Updated ${updated}.`;
  }

  function renderTableHeader() {
    const columns = getActiveColumns();
    tableColgroup.innerHTML = '';
    tableHeadRow.innerHTML = '';

    const gemCol = document.createElement('col');
    gemCol.className = 'col-gem';
    tableColgroup.appendChild(gemCol);

    const tagsCol = document.createElement('col');
    tagsCol.className = 'col-tags';
    tableColgroup.appendChild(tagsCol);

    for (let i = 0; i < columns.length; i += 1) {
      const stateCol = document.createElement('col');
      stateCol.className = 'col-state';
      tableColgroup.appendChild(stateCol);
    }

    for (const label of ['Gem', 'Tags', ...columns.map((column) => column.label)]) {
      const cell = document.createElement('th');
      cell.textContent = label;
      tableHeadRow.appendChild(cell);
    }

    if (tableEl) {
      tableEl.style.minWidth = `${440 + columns.length * 92}px`;
    }
  }

  function renderTable() {
    const columns = getActiveColumns();
    tableBody.innerHTML = '';
    if (!state.visibleRows.length) {
      const row = document.createElement('tr');
      const cell = document.createElement('td');
      cell.colSpan = columns.length + 2;
      cell.className = 'gem-empty';
      cell.textContent = 'No gems match the current search and filters.';
      row.appendChild(cell);
      tableBody.appendChild(row);
      return;
    }
    for (const rowData of state.visibleRows) {
      const row = document.createElement('tr');

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
        meta.className = 'item-meta';
        meta.textContent = `+${rowData.hiddenStates} additional state${rowData.hiddenStates === 1 ? '' : 's'}`;
        label.appendChild(meta);
      }
      nameWrap.appendChild(label);
      nameCell.appendChild(nameWrap);
      row.appendChild(nameCell);

      const tagsCell = document.createElement('td');
      const tagsWrap = document.createElement('div');
      tagsWrap.className = 'gem-tags';
      for (const tag of rowData.tags) {
        const tagEl = document.createElement('span');
        tagEl.className = 'gem-tag';
        tagEl.textContent = tag;
        tagsWrap.appendChild(tagEl);
      }
      tagsCell.appendChild(tagsWrap);
      row.appendChild(tagsCell);

      for (const column of columns) {
        const cell = document.createElement('td');
        cell.className = 'gem-state-cell';
        const record = rowData.states[column.key];
        if (!record) {
          cell.innerHTML = '<span class="gem-missing">—</span>';
        } else {
          const price = document.createElement('span');
          price.className = `gem-price${record.lowConfidence ? ' is-low-confidence' : ''}`;
          price.textContent = formatPrice(record.min);
          if (record.lowConfidence) {
            const listings = Number.isFinite(record.listingCount) ? record.listingCount : record.confidenceCount;
            price.title = `Low confidence: ${listings || 0} listing${listings === 1 ? '' : 's'}`;
          }
          cell.appendChild(price);
        }
        row.appendChild(cell);
      }

      tableBody.appendChild(row);
    }
  }

  function updateDebugOutput() {
    const debug = {
      league: state.leagueId,
      leagueSlug: slugifyLeague(state.leagueId),
      displayCurrency: state.displayCurrency,
      divineRateChaos: state.divineRate,
      rows: state.rows.length,
      visibleRows: state.visibleRows.length,
      filter: state.filter,
      search: state.search,
      updatedAt: state.updatedAt,
      sourceUrls: state.sourceUrls
    };
    debugContent.textContent = JSON.stringify(debug, null, 2);
  }

  function render() {
    state.visibleRows = filterRows(state.rows);
    renderFilterBar();
    renderSummary();
    renderTableHeader();
    renderTable();
    updateDisplayCurrencyLabels();
    updateDebugOutput();
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
      state.leagueId = state.leagues[0]?.id || '';
      localStorage.setItem(STORAGE_KEYS.league, state.leagueId);
    }
    leagueSelect.value = state.leagueId;
  }

  async function loadGemData() {
    const leagueSlug = slugifyLeague(state.leagueId);
    const gemsUrl = `data/poe-ninja/prices/${leagueSlug}/category/gems.json`;
    const currencyUrl = `data/poe-ninja/prices/${leagueSlug}/category/currency.json`;
    state.sourceUrls = [gemsUrl, currencyUrl];
    const [gemsResponse, currencyResponse] = await Promise.all([
      fetch(gemsUrl, { cache: 'no-store' }),
      fetch(currencyUrl, { cache: 'no-store' })
    ]);
    if (!gemsResponse.ok) throw new Error(`Failed to load gem prices (${gemsResponse.status})`);
    if (!currencyResponse.ok) throw new Error(`Failed to load currency prices (${currencyResponse.status})`);
    const gemsPayload = await gemsResponse.json();
    const currencyPayload = await currencyResponse.json();
    const items = Array.isArray(gemsPayload.items) ? gemsPayload.items : [];
    const divineOrb = (currencyPayload.items || []).find((item) => item.name === 'Divine Orb');
    state.rows = buildRows(items, state.leagueId);
    state.divineRate = Number.isFinite(divineOrb?.min) ? divineOrb.min : null;
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
      statusEl.textContent = `Loaded ${state.rows.length.toLocaleString()} gem rows.`;
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
    localStorage.setItem(STORAGE_KEYS.league, state.leagueId);
    await refreshPageData();
  });

  displayCurrencySelect.addEventListener('change', () => {
    state.displayCurrency = displayCurrencySelect.value === 'divine' ? 'divine' : 'chaos';
    localStorage.setItem(STORAGE_KEYS.displayCurrency, state.displayCurrency);
    render();
  });

  searchInput.addEventListener('input', () => {
    state.search = searchInput.value;
    localStorage.setItem(STORAGE_KEYS.search, state.search);
    render();
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
