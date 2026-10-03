(function initCurrencyExchangePage() {
  'use strict';
  const X = window.PoeExchange;
  const game = document.body.dataset.game === 'poe2' ? 'poe2' : 'poe1';
  const snapshotUrl = game === 'poe2' ? 'data/currency-exchange-poe2.json' : 'data/currency-exchange.json';
  const feeStorageKey = game === 'poe2' ? 'poe2ExchangeGoldFeesV1' : 'poeExchangeGoldFeesV1';
  const leagueStorageKey = game === 'poe2' ? 'poe2ExchangeLeague' : 'poeExchangeLeague';
  const exclusionStorageKey = game === 'poe2' ? 'poe2ExchangeExcludedItemsV1' : 'poeExchangeExcludedItemsV1';
  const $ = (id) => document.getElementById(id);
  let snapshot = null;
  let graph = new Map();
  let routes = [];
  let selectedKey = '';
  let sortDirection = 'desc';
  let sortKey = 'returnPct';
  let selectedCategory = '';
  let originalAmount = null;
  let amountIsCustom = false;
  let originalAmountWasCustom = false;
  let pointerDown = false;
  let pendingRender = false;
  let overrides = {};
  let fees = {};
  let excludedItems = new Set();
  try {
    const saved = JSON.parse(localStorage.getItem(exclusionStorageKey) || '[]');
    if (Array.isArray(saved)) excludedItems = new Set(saved.filter(X.isItemId));
  } catch (_) {}
  try { fees = JSON.parse(localStorage.getItem(feeStorageKey) || '{}') || {}; } catch (_) {}
  if (typeof fees !== 'object' || Array.isArray(fees)) fees = {};
  fees = Object.fromEntries(Object.entries(fees).filter(([id, value]) => X.isItemId(id) && Number.isFinite(value) && value >= 0));

  const escape = (value) => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  const number = (value, digits = 2) => Number.isFinite(value) ? value.toLocaleString(undefined, { maximumFractionDigits: digits }) : '—';
  const signed = (value, digits = 3) => Number.isFinite(value) ? `${value > 0 ? '+' : ''}${number(value, digits)}` : '—';
  const efficiency = (value) => {
    if (!Number.isFinite(value)) return '—';
    const scaled = value * 100000;
    return scaled !== 0 && Math.abs(scaled) < 0.001 ? `${scaled > 0 ? '+' : ''}${scaled.toExponential(2)}` : signed(scaled, 3);
  };
  const tone = (value) => value > 0 ? 'exchange-positive' : value < 0 ? 'exchange-negative' : '';
  const name = (id) => X.item(id, snapshot?.items).name;
  const short = (id) => X.item(id, snapshot?.items).short;
  const icon = (id) => {
    const src = X.item(id, snapshot?.items).icon;
    return src ? `<img class="item-icon exchange-item-icon" src="${escape(src)}" alt="" loading="lazy" width="27" height="27" />` : '';
  };
  const itemLabel = (id, abbreviated = false) => `<span class="exchange-item-label">${icon(id)}<span>${escape(abbreviated ? short(id) : name(id))}</span></span>`;
  const chain = (path) => path.map((id) => itemLabel(id, true)).join(' <span class="exchange-arrow">→</span> ');
  const routeName = (path) => path.map(short).join(' → ');
  const ratio = (rate) => !Number.isFinite(rate) ? '—' : rate > 0 && rate < 1 ? `1 : ${number(1 / rate, 2)}` : `${number(rate, 2)} : 1`;
  const hourLabel = (hour) => {
    const start = new Date(hour * 1000);
    const end = new Date((hour + X.HOUR) * 1000);
    return `${start.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}, ${start.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}–${end.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' })}`;
  };

  async function loadSnapshot() {
    $('refreshExchange').disabled = true;
    $('exchangeStatus').classList.remove('error');
    $('exchangeStatus').textContent = 'Loading saved exchange data…';
    try {
      const response = await fetch(snapshotUrl, { cache: 'no-store', signal: AbortSignal.timeout(20000) });
      if (!response.ok) throw new Error('Saved exchange data unavailable. Try refreshing in a moment.');
      const data = await response.json();
      if (!Number.isInteger(data.hour) || !Array.isArray(data.markets) || (data.game && data.game !== game)) throw new Error('The exchange snapshot is invalid.');
      if (snapshot?.hour !== data.hour) overrides = {};
      snapshot = data;
      const counts = new Map();
      for (const market of data.markets) {
        if (typeof market.league !== 'string' || market.league.includes('(PL') || !Array.isArray(market.market_pair) || !market.market_pair.every(X.isItemId)) continue;
        counts.set(market.league, (counts.get(market.league) || 0) + 1);
      }
      const leagues = [...counts.keys()].sort((a, b) => counts.get(b) - counts.get(a));
      if (!leagues.length) throw new Error('No supported currency markets are available in this hour.');
      let preferred = $('exchangeLeague').value;
      if (!leagues.includes(preferred)) {
        try { preferred = localStorage.getItem(leagueStorageKey) || (game === 'poe1' ? localStorage.getItem('poeBossLeague') : null); } catch (_) {}
      }
      $('exchangeLeague').innerHTML = leagues.map((league) => `<option value="${escape(league)}">${escape(league)}</option>`).join('');
      $('exchangeLeague').value = leagues.includes(preferred) ? preferred : leagues.find((league) => !/hardcore|ruthless|standard|^HC\b/i.test(league)) || leagues[0];
      $('exchangeLeague').disabled = false;
      const stale = Date.now() / 1000 - (data.hour + X.HOUR) > 2 * X.HOUR;
      $('exchangeStatus').textContent = `Saved snapshot · ${hourLabel(data.hour)}${stale ? ' · Older data; waiting for the next saved update.' : ''}`;
      changeLeague();
    } catch (error) {
      $('exchangeStatus').textContent = `${error.message}${snapshot ? ' Previous data is still shown.' : ''}`;
      $('exchangeStatus').classList.add('error');
      if (!snapshot) $('exchangeRoutes').innerHTML = '<tr><td colspan="6">Market data could not be loaded. Use Refresh data to try again.</td></tr>';
    } finally {
      $('exchangeStatus').title = $('exchangeStatus').textContent;
      $('refreshExchange').disabled = false;
    }
  }

  function changeLeague(event) {
    if (event?.type === 'change') { amountIsCustom = false; originalAmount = null; }
    try { localStorage.setItem(leagueStorageKey, $('exchangeLeague').value); } catch (_) {}
    overrides = {};
    selectedKey = '';
    graph = X.buildGraph(snapshot.markets, $('exchangeLeague').value);
    const availableCategories = new Set([...graph.keys()].map((id) => X.item(id, snapshot.items).category));
    if (!availableCategories.has(selectedCategory)) selectedCategory = '';
    const previousStart = $('exchangeStart').value;
    const priority = game === 'poe2' ? [X.CHAOS, X.DIVINE, X.EXALT] : [X.EXALT, X.DIVINE, X.CHAOS];
    const starts = [...graph.keys()].filter((id) => X.item(id, snapshot.items).category === 'currency').sort((a, b) => {
      const rank = (id) => priority.includes(id) ? priority.indexOf(id) : priority.length;
      return rank(a) - rank(b) || name(a).localeCompare(name(b));
    });
    $('exchangeStart').innerHTML = starts.map((id) => `<option value="${escape(id)}">${escape(name(id))}</option>`).join('');
    $('exchangeStart').value = starts.includes(previousStart) ? previousStart : starts[0] || '';
    $('exchangeStart').disabled = !starts.length;
    if (previousStart && previousStart !== $('exchangeStart').value) { amountIsCustom = false; originalAmount = null; }
    $('exchangeAmount').disabled = false;
    applyDefaultStartingAmount();
    renderExcludedItems();
    recalculate();
  }

  function applyDefaultStartingAmount() {
    if (amountIsCustom) return;
    const amount = X.amountForDivine(graph, $('exchangeStart').value);
    $('exchangeAmount').value = amount ?? '';
    $('exchangeAmount').placeholder = amount === null ? 'No Divine pair' : '';
  }

  function recalculate({ deferRender = false } = {}) {
    const start = $('exchangeStart').value;
    $('exchangeStartIcon').innerHTML = icon(start);
    $('volumeUnit').textContent = `(${short(start)})`;
    routes = $('exchangeAmount').checkValidity() && $('exchangeVolume').checkValidity()
      ? X.findRoutes(graph, start, Number($('exchangeAmount').value), fees, overrides, snapshot.items) : [];
    if (deferRender) {
      // Keep the clicked element and its position intact until its click is handled.
      pendingRender = true;
    } else renderRoutes();
  }

  function renderRoutes() {
    if (!$('exchangeAmount').checkValidity() || !$('exchangeVolume').checkValidity()) {
      $('routeSummary').textContent = 'Enter a positive whole starting amount and a nonnegative volume threshold.';
      $('selectedRoute').hidden = true;
      $('exchangeRoutes').innerHTML = '<tr><td colspan="6">Check the amount and volume settings above.</td></tr>';
      renderCategoryFilters();
      return;
    }
    const search = $('exchangeSearch').value.trim().toLowerCase();
    const sort = sortKey;
    for (const button of $('exchangeRouteHeaders').querySelectorAll('button[data-sort]')) {
      const active = button.dataset.sort === sort;
      button.closest('th').setAttribute('aria-sort', active ? (sortDirection === 'asc' ? 'ascending' : 'descending') : 'none');
      button.querySelector('span').textContent = active ? (sortDirection === 'asc' ? '↑' : '↓') : '↕';
    }
    const visible = routes.filter((route) => (
      (!$('positiveOnly').checked || route.profit > 0)
      && (!$('volumeSupportedOnly').checked || route.volumeSupported)
      && route.hourlyVolume >= Number($('exchangeVolume').value)
      && route.path.some((id) => name(id).toLowerCase().includes(search))
      && !route.path.some((id) => excludedItems.has(id))
      && (!selectedCategory || X.routeCategories(route, snapshot.items).every((type) => type === selectedCategory))
    )).sort((a, b) => {
      const byName = routeName(a.path).localeCompare(routeName(b.path));
      if (sort === 'route') return sortDirection === 'asc' ? byName : -byName;
      if (!Number.isFinite(a[sort])) return Number.isFinite(b[sort]) ? 1 : byName;
      if (!Number.isFinite(b[sort])) return -1;
      return (sortDirection === 'asc' ? a[sort] - b[sort] : b[sort] - a[sort]) || byName;
    });
    let selected = routes.find((route) => route.key === selectedKey);
    if (!selected) { selected = visible[0]; selectedKey = selected?.key || ''; }
    const start = $('exchangeStart').value;
    $('routeSummary').textContent = `${visible.length} shown · ${routes.length} directional triangles · ${number(Number($('exchangeAmount').value))} ${short(start)} starting balance. Select a route to inspect its trades.`;
    $('exchangeRoutes').innerHTML = visible.length ? visible.map((route) => `<tr data-route="${escape(route.key)}"${route.key === selectedKey ? ' class="is-selected"' : ''}>
      <td><button type="button" class="exchange-route-button" data-route="${escape(route.key)}" aria-pressed="${route.key === selectedKey}" aria-label="Inspect ${escape(routeName(route.path))}">${chain(route.path)}</button></td>
      <td class="${tone(route.profit)}">${signed(route.returnPct, 2)}%</td><td class="${tone(route.profit)}">${signed(route.profitDivine)}</td>
      <td>${number(route.gold, 0)}</td><td class="${tone(route.profit)}">${efficiency(route.perGold)}</td>
      <td title="Smallest leg's hourly traded volume, expressed in the starting item. Not currently available stock.">${number(route.hourlyVolume, 0)} ${escape(short(start))}</td>
    </tr>`).join('') : '<tr><td colspan="6">No routes match these filters. Try a smaller starting amount, clear the search, or adjust the item exclusions, category, volume, and profit filters.</td></tr>';
    renderCategoryFilters();
    renderSelected(selected, selected && !visible.includes(selected));
  }

  function updateExclusionCount() {
    $('excludedItemsSummary').textContent = `Exclude items${excludedItems.size ? ` (${excludedItems.size})` : ''}`;
    $('clearExcludedItems').disabled = !excludedItems.size;
  }

  function renderExcludedItems() {
    const search = $('excludedItemsSearch').value.trim().toLowerCase();
    const ids = [...new Set([...graph.keys(), ...excludedItems])]
      .filter((id) => name(id).toLowerCase().includes(search))
      .sort((a, b) => Number(excludedItems.has(b)) - Number(excludedItems.has(a)) || name(a).localeCompare(name(b)));
    $('excludedItemsList').innerHTML = ids.length ? ids.map((id) => (
      `<label class="exchange-excluded-item"><input type="checkbox" data-excluded-item="${escape(id)}"${excludedItems.has(id) ? ' checked' : ''} />${itemLabel(id)}</label>`
    )).join('') : '<p class="muted">No matching items.</p>';
    updateExclusionCount();
  }

  function saveExclusions() {
    try { localStorage.setItem(exclusionStorageKey, JSON.stringify([...excludedItems])); } catch (_) {}
    updateExclusionCount();
    renderRoutes();
  }

  function renderCategoryFilters() {
    const focusedCategory = $('exchangeCategoryFilters').contains(document.activeElement)
      ? document.activeElement.closest('button[data-category]')?.dataset.category : null;
    const representatives = new Map();
    for (const id of graph.keys()) {
      const type = X.item(id, snapshot.items).category;
      if (!representatives.has(type) || id === X.CHAOS) representatives.set(type, id);
    }
    $('exchangeCategoryFilters').innerHTML = `<button type="button" class="exchange-category-button" data-category="all" aria-pressed="${!selectedCategory}">All items</button>`
      + Object.entries(X.categories).filter(([type]) => representatives.has(type)).map(([type, label]) => (
        `<button type="button" class="exchange-category-button" data-category="${type}" aria-pressed="${selectedCategory === type}">${icon(representatives.get(type))}${escape(label)}</button>`
      )).join('');
    if (focusedCategory) $('exchangeCategoryFilters').querySelector(`button[data-category="${focusedCategory}"]`)?.focus({ preventScroll: true });
  }

  function renderSelected(route, outsideFilters = false) {
    $('selectedRoute').hidden = !route;
    if (!route) return;
    const start = route.path[0];
    const custom = route.steps.some((step) => overrides[X.rateKey(step.from, step.to)] !== undefined);
    $('selectedRoute').innerHTML = `
      <div class="exchange-detail-heading"><div><div class="exchange-kicker" title="${outsideFilters ? 'The selected route is outside the current table filters.' : 'Table filters do not change the selected route.'}"><span class="exchange-rate-label">Selected route · ${custom ? 'Your rates' : 'Hourly average rates'}</span><span class="exchange-filter-status">${outsideFilters ? 'Outside filters' : 'In table'}</span></div><h2 id="selectedRouteTitle" tabindex="-1">${chain(route.path)}</h2></div><span class="exchange-return ${tone(route.profit)}">${signed(route.returnPct, 2)}%</span></div>
      <div class="exchange-metrics">
        <div><span>Estimated profit</span><strong class="${tone(route.profit)}">${signed(route.profitDivine)} <small>${icon(X.DIVINE)} div</small></strong><small>${signed(route.profit, 0)} ${itemLabel(start, true)}</small></div>
        <div><span>Divines / 100,000 gold</span><strong class="${tone(route.profit)}">${efficiency(route.perGold)}</strong></div>
        <div><span>Total gold</span><strong>${number(route.gold, 0)}</strong><small>${route.gold === null ? 'Enter missing fees below' : 'Across all three orders'}</small></div>
        <div><span>Ending balance</span><strong>${number(route.end, 0)} <small>${itemLabel(start, true)}</small></strong><small>Starting with ${number(route.amount)} ${itemLabel(start, true)}</small></div>
      </div>
      <form id="routeQuoteForm"><div class="exchange-steps">${route.steps.map((step, i) => {
        const hourlyRate = graph.get(step.from).get(step.to).rate;
        const supported = X.supportsVolume(step);
        return `<div class="exchange-step" aria-label="Trade ${i + 1}"><div class="exchange-step-heading"><span class="exchange-step-number">STEP 0${i + 1}</span><div class="exchange-market-ratio"><span>Hourly market ratio</span><strong>${ratio(hourlyRate)}</strong><small>Want : Have</small></div></div>
          <div class="exchange-order">
            <div class="exchange-order-side exchange-order-want"><h3>I want</h3><div class="exchange-order-item">${itemLabel(step.to)}${quantityInput(route, i, "receive")}</div></div>
            <div class="exchange-order-ratio" title="${number(step.receive, 0)} wanted : ${number(step.pay, 0)} paid"><span>Order ratio</span><strong>${step.pay > 0 ? ratio(step.receive / step.pay) : '—'}</strong></div>
            <div class="exchange-order-side exchange-order-have"><h3>I have</h3><div class="exchange-order-item">${itemLabel(step.from)}${quantityInput(route, i, "pay")}</div></div>
          </div>
          <div class="exchange-step-gold">${step.gold === null ? 'Gold total unknown' : `${number(step.gold, 0)} gold`}
            <label class="exchange-fee-label" for="quoteFee${i}"><input id="quoteFee${i}" class="exchange-inline-input${fees[step.to] !== undefined ? ' is-edited' : ''}" data-fee="${i}" data-initial="${step.fee ?? ''}" type="number" min="0" max="1000000" step="any" value="${step.fee ?? ''}" placeholder="Fee?" aria-label="Step ${i + 1}: gold per ${escape(name(step.to))} received" aria-describedby="exchangeEditHelp" /> per item received</label>
          </div>
          <div class="exchange-step-volume">Hourly traded: ${number(step.volume, 0)} ${itemLabel(step.from, true)} <span class="${supported ? 'muted' : 'exchange-negative'}" title="Hourly traded quantities must cover at least 10 times both the paid and received amounts.">· ${supported ? 'Meets 10× volume' : 'Below 10× volume'}</span></div>
        </div>`;
      }).join('')}</div>
      <div class="exchange-quote-actions"><p id="exchangeEditHelp" class="muted">Edit amounts or fees; press Enter or click away to apply. Clear to restore the estimate. Each trade feeds the next.</p>${custom ? '<button class="button-secondary" id="resetRouteRates" type="button" title="Restore hourly exchange ratios; keep gold fees and starting balance">Reset rates to hourly</button>' : ''}</div></form>`;
  }

  function quantityInput(route, index, side) {
    const step = route.steps[index];
    const id = side === 'pay' ? step.from : step.to;
    const rateStep = route.steps[side === 'pay' ? index - 1 : index];
    const edited = rateStep ? overrides[X.rateKey(rateStep.from, rateStep.to)] !== undefined : originalAmount !== null;
    return `<input id="step${side}${index}" class="exchange-order-amount exchange-inline-input${edited ? ' is-edited' : ''}" data-quantity="${side}" data-step="${index}" data-initial="${step[side]}" type="number" min="1" max="${side === 'pay' && index === 0 ? 1000000000 : Number.MAX_SAFE_INTEGER}" step="1" value="${step[side]}" aria-label="Step ${index + 1}: I ${side === 'pay' ? 'have' : 'want'} ${escape(name(id))}" aria-describedby="exchangeEditHelp" />`;
  }

  function applyInlineEdit(input, nextFocusId, deferRender = false) {
    if (!input.matches('input.exchange-inline-input') || input.value === input.dataset.initial) return;
    if (!input.checkValidity()) { input.reportValidity(); return; }
    const route = routes.find((item) => item.key === selectedKey);
    if (!route) return;
    const value = input.value === '' ? null : Number(input.value);
    if (input.dataset.fee !== undefined) {
      const id = route.steps[Number(input.dataset.fee)].to;
      if (value === null) delete fees[id];
      else fees[id] = value;
      try { localStorage.setItem(feeStorageKey, JSON.stringify(fees)); } catch (_) {}
    } else {
      const edit = X.quantityEdit(route, Number(input.dataset.step), input.dataset.quantity, value);
      if (!edit) return;
      if ('amount' in edit) {
        if (value !== null && originalAmount === null) {
          originalAmount = $('exchangeAmount').value;
          originalAmountWasCustom = amountIsCustom;
        }
        $('exchangeAmount').value = value === null ? originalAmount ?? route.amount : value;
        amountIsCustom = value !== null || originalAmountWasCustom;
        if (value === null) {
          originalAmount = null;
          applyDefaultStartingAmount();
        }
      } else if (edit.rate === null) delete overrides[edit.key];
      else overrides[edit.key] = edit.rate;
    }
    recalculate({ deferRender });
    if (nextFocusId) $(nextFocusId)?.focus({ preventScroll: true });
  }

  document.addEventListener('error', (event) => {
    if (event.target.matches?.('img.exchange-item-icon')) event.target.hidden = true;
  }, true);
  $('exchangeCategoryFilters').addEventListener('click', (event) => {
    const button = event.target.closest('button[data-category]');
    if (!button) return;
    const type = button.dataset.category;
    selectedCategory = type === 'all' || selectedCategory === type ? '' : type;
    renderRoutes();
    $('exchangeCategoryFilters').querySelector(`button[data-category="${type}"]`).focus({ preventScroll: true });
  });
  $('exchangeRoutes').addEventListener('click', (event) => {
    const row = event.target.closest('tr[data-route]');
    if (!row) return;
    selectedKey = row.dataset.route;
    renderRoutes();
    if (event.detail === 0) $('selectedRouteTitle').focus({ preventScroll: true });
    window.scrollTo({
      top: window.scrollY + $('selectedRoute').getBoundingClientRect().top - document.querySelector('.site-header').getBoundingClientRect().height - 16,
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
    });
  });
  $('exchangeRouteHeaders').addEventListener('click', (event) => {
    const button = event.target.closest('button[data-sort]');
    if (!button) return;
    const sort = button.dataset.sort;
    sortDirection = sort === sortKey ? (sortDirection === 'desc' ? 'asc' : 'desc') : (['route', 'gold'].includes(sort) ? 'asc' : 'desc');
    sortKey = sort;
    renderRoutes();
  });
  $('selectedRoute').addEventListener('submit', (event) => { event.preventDefault(); });
  $('selectedRoute').addEventListener('focusout', (event) => {
    // Keep the clicked table/filter control alive until its click handler runs.
    applyInlineEdit(event.target, event.relatedTarget?.id, pointerDown && !$('selectedRoute').contains(event.relatedTarget));
  });
  $('selectedRoute').addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' || !event.target.matches('input.exchange-inline-input')) return;
    event.preventDefault();
    applyInlineEdit(event.target, event.target.id);
  });
  $('selectedRoute').addEventListener('pointerdown', (event) => {
    if (event.target.closest('#resetRouteRates')) event.preventDefault();
  });
  $('selectedRoute').addEventListener('click', (event) => {
    if (!event.target.closest('#resetRouteRates')) return;
    const route = routes.find((item) => item.key === selectedKey);
    if (!route) return;
    route.steps.forEach((step) => { delete overrides[X.rateKey(step.from, step.to)]; });
    recalculate();
  });
  $('exchangeLeague').addEventListener('change', changeLeague);
  $('exchangeStart').addEventListener('change', () => {
    selectedKey = ''; originalAmount = null; amountIsCustom = false;
    applyDefaultStartingAmount();
    recalculate();
  });
  for (const id of ['exchangeVolume', 'positiveOnly', 'volumeSupportedOnly']) {
    $(id).addEventListener('change', () => recalculate({ deferRender: pointerDown }));
  }
  $('exchangeAmount').addEventListener('input', () => { amountIsCustom = true; });
  $('exchangeAmount').addEventListener('change', () => {
    originalAmount = null;
    if ($('exchangeAmount').value === '') amountIsCustom = false;
    applyDefaultStartingAmount();
    recalculate({ deferRender: pointerDown });
  });
  $('exchangeSearch').addEventListener('input', renderRoutes);
  $('excludedItemsSearch').addEventListener('input', renderExcludedItems);
  $('excludedItemsList').addEventListener('change', (event) => {
    const input = event.target.closest('input[data-excluded-item]');
    if (!input) return;
    if (input.checked) excludedItems.add(input.dataset.excludedItem);
    else excludedItems.delete(input.dataset.excludedItem);
    saveExclusions();
  });
  $('clearExcludedItems').addEventListener('click', () => {
    excludedItems.clear();
    renderExcludedItems();
    saveExclusions();
  });
  document.addEventListener('click', (event) => {
    if (!$('excludedItemsDropdown').contains(event.target)) $('excludedItemsDropdown').open = false;
  });
  $('excludedItemsDropdown').addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    $('excludedItemsDropdown').open = false;
    $('excludedItemsSummary').focus();
  });
  document.addEventListener('pointerdown', () => { pointerDown = true; }, true);
  document.addEventListener('pointerup', () => { pointerDown = false; }, true);
  document.addEventListener('pointercancel', () => { pointerDown = false; }, true);
  document.addEventListener('click', () => {
    if (!pendingRender) return;
    pendingRender = false;
    renderRoutes();
  });
  $('refreshExchange').addEventListener('click', loadSnapshot);
  $('openChangelog').addEventListener('click', async () => {
    $('changelogDialog').showModal();
    if ($('changelogContent').dataset.loaded) return;
    try {
      const response = await fetch('changelog.json', { cache: 'no-store' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      $('changelogContent').innerHTML = (data.entries || []).map((entry) => `<article class="changelog-entry"><div class="changelog-meta"><span class="changelog-version">v${escape(entry.version)}</span><span>${escape(entry.date)}</span></div><ul class="changelog-list">${(entry.changes || []).map((change) => `<li>${escape(change)}</li>`).join('')}</ul></article>`).join('');
      $('changelogContent').dataset.loaded = 'true';
    } catch (error) { $('changelogContent').textContent = `Failed to load changelog: ${error.message}`; }
  });
  $('closeChangelog').addEventListener('click', () => $('changelogDialog').close());
  $('changelogDialog').addEventListener('click', (event) => {
    if (event.target === $('changelogDialog')) $('changelogDialog').close();
  });
  setInterval(() => {
    if (!$('refreshExchange').disabled) loadSnapshot();
  }, 15 * 60 * 1000);
  loadSnapshot();
})();
