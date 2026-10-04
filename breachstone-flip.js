(function () {
  'use strict';
  const B = window.Breachstone;
  const WOMBGIFT = 'Metadata/Items/Brequel/FruitBreachstone';
  const $ = (id) => document.getElementById(id);
  const escape = (value) => String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const number = (v, digits = 3) => Number.isFinite(v) ? v.toLocaleString(undefined, { maximumFractionDigits: digits }) : '—';
  const signed = (v, digits = 3) => Number.isFinite(v) ? `${v > 0 ? '+' : ''}${number(v, digits)}` : '—';
  const currencyDigits = (currency) => currency === 'divine' ? 2 : currency === 'chaos' ? 1 : 0;
  const currencyNumber = (value, currency) => Number.isFinite(value) ? value.toLocaleString(undefined, {
    minimumFractionDigits: currencyDigits(currency), maximumFractionDigits: currencyDigits(currency)
  }) : '—';
  const currencyName = (key) => B.currencies.find((c) => c.key === key).name;
  const time = (v) => v && Number.isFinite(new Date(v).valueOf()) ? new Date(v).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }) : 'unavailable';
  let snapshot = null;
  let prices = { leagues: {} };
  let busy = false;
  let sortKey = 'per1000Blood';
  let sortDirection = 'desc';
  let overrides = {};
  let automaticSale = null;
  try {
    const stored = JSON.parse(localStorage.getItem('poe2BreachPriceOverrides') || '{}');
    if (stored && typeof stored === 'object' && !Array.isArray(stored)) overrides = stored;
  } catch (_) {}
  const saveOverrides = () => { try { localStorage.setItem('poe2BreachPriceOverrides', JSON.stringify(overrides)); } catch (_) {} };
  $('priceSchedule').textContent = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname)
    ? 'Local lookups run when you click Refresh prices. The publishing workflow is configured for hourly updates at :15 UTC.'
    : 'Scheduled price updates run hourly at :15 UTC. Reload or use Refresh prices to load the latest published data.';

  async function readJson(url) {
    const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(20000) });
    if (!response.ok) throw new Error(`Saved prices unavailable (HTTP ${response.status}).`);
    return response.json();
  }

  function status(message, error = false) {
    $('breachStatus').textContent = message;
    $('breachStatus').title = message;
    $('breachStatus').classList.toggle('error', error);
  }

  function quoteLink(quote, league, level, currency) {
    return quote?.searchUrl?.startsWith('https://www.pathofexile.com/trade2/search/poe2/')
      ? quote.searchUrl : B.tradeUrl(league, level, currency);
  }
  function icon(id, size = 18) {
    const src = snapshot?.items?.[id]?.icon || (id === WOMBGIFT ? 'https://repoe-fork.github.io/poe2/Art/2DItems/Currency/Breach/BreachFruit4.png' : null);
    return src ? `<img class="breach-item-icon" src="${escape(src)}" width="${size}" height="${size}" alt="" aria-hidden="true" loading="lazy" />` : '';
  }
  const divineValue = (value, withSign = false) => `<span class="breach-value">${withSign && value > 0 ? '+' : ''}${currencyNumber(value, 'divine')} ${icon(B.currencies.find((c) => c.key === 'divine').id, 16)}<span>div</span></span>`;
  function profitScale(values) {
    const positive = values.filter((v) => Number.isFinite(v) && v > 0);
    const low = Math.min(...positive);
    const high = Math.max(...positive);
    return (value) => {
      if (!(value > 0)) return '';
      const ratio = high === low ? 1 : (value - low) / (high - low);
      const yellow = [250, 204, 21];
      const green = [34, 197, 94];
      return `rgb(${yellow.map((c, i) => Math.round(c + (green[i] - c) * ratio)).join(', ')})`;
    };
  }
  function priceField(quote, kind, route, currency, label, link = '') {
    const automatic = quote?.manual ? quote.automaticPrice : quote?.price;
    const unit = currency === 'divine' ? 'div' : currency === 'exalted' ? 'ex' : 'chaos';
    return `<div class="table-edit-wrap"><input id="breach-price-${kind}-${route ? `${route}-` : ''}${currency}" class="editable-input breach-price-input${quote?.manual ? ' input-custom' : ''}" inputmode="${currency === 'exalted' ? 'numeric' : 'decimal'}" data-kind="${kind}" data-route="${route}" data-currency="${currency}" data-default="${Number.isFinite(automatic) ? automatic.toFixed(currencyDigits(currency)) : ''}" value="${Number.isFinite(quote?.price) ? quote.price.toFixed(currencyDigits(currency)) : ''}" placeholder="—" aria-label="${escape(label)} in ${currencyName(currency)}" title="${quote?.manual ? 'Edited price. Clear to restore the saved price.' : 'Edit price. Press Enter or leave the field to recalculate.'}" /><span class="field-unit">${icon(B.currencies.find((c) => c.key === currency).id)}${unit}</span>${link}</div>`;
  }

  function render() {
    if (!snapshot) return;
    const league = $('breachLeague').value;
    $('breachStoneIcon').innerHTML = icon(B.STONE, 22);
    const quotes = prices.leagues?.[league];
    const manual = overrides[league] || {};
    const result = B.calculate(snapshot, league, quotes, 0, manual);
    const saleOptions = ['divine', 'chaos', 'exalted'].map((key) => {
      const currency = B.currencies.find((c) => c.key === key);
      const quote = result.sales[currency.key];
      const revenue = quote && Number.isFinite(result.fx[currency.key]) ? quote.price * result.fx[currency.key] : null;
      return { ...currency, quote, revenue };
    });
    const highestSale = saleOptions.filter((s) => Number.isFinite(s.revenue)).sort((a, b) => b.revenue - a.revenue)[0];
    automaticSale = highestSale?.key;
    const forcedSale = saleOptions.find((s) => s.key === manual.saleCurrency && Number.isFinite(s.revenue))?.key;
    const selectedSale = forcedSale || automaticSale;
    $('breachSalePrices').innerHTML = saleOptions.map((sale) => {
      const selected = sale.key === selectedSale;
      const available = Number.isFinite(sale.revenue);
      const unavailable = !sale.quote ? 'No trades' : 'No Divine rate';
      const title = !available ? `${unavailable}. Enter a sale price to compare.` : sale.key === automaticSale ? 'Use the best sale currency automatically.' : `Sell all Breachstones for ${sale.name}.`;
      return `<div class="breach-sale-price${selected ? forcedSale ? ' is-manual-sale' : ' is-auto-sale' : ''}" data-sale="${sale.key}">
        <label class="breach-sale-heading" title="${title}"><input class="breach-sale-radio" type="radio" name="breachSaleCurrency" data-sale-select="${sale.key}" value="${sale.key}"${selected ? ' checked' : ''}${available ? '' : ' disabled'} /><span>${sale.name}</span>${selected && !forcedSale ? '<span class="breach-sale-badge">Auto</span>' : ''}</label>
        ${priceField(sale.quote, 'sales', '', sale.key, 'Sell Breachstone')}
        <div class="breach-sale-equivalent">${available ? `${currencyNumber(sale.revenue, 'divine')} div / stone` : unavailable}</div>
      </div>`;
    }).join('');
    $('resetBreachPrices').hidden = !manual.saleCurrency && !B.currencies.some((c) => Number.isFinite(manual.sales?.[c.key])
      || B.routes.some((r) => Number.isFinite(manual.inputs?.[r.key]?.[c.key])));
    const incomplete = result.routes.some((route) => B.currencies.some((c) => !route.combinations.some((p) => p.buy === c.key)));
    const giftQuotes = [65, 80].flatMap((level) => B.currencies.map((c) => quotes?.gifts?.[level]?.[c.key]));
    const failed = giftQuotes.some((q) => q?.error);
    const stale = giftQuotes.some((q) => q && (!q.fetchedAt || Date.now() - new Date(q.fetchedAt).valueOf() > 2 * 3600000))
      || Date.now() / 1000 - (snapshot.hour + 3600) > 2 * 3600;
    const rows = result.routes.flatMap((route) => B.currencies.map((currency) => {
      const path = route.combinations.find((p) => p.buy === currency.key && p.sell === selectedSale);
      return path ? { ...route, ...path, priced: true }
        : { ...route, buy: currency.key, priced: false, profit: null, per1000Blood: null };
    }));
    rows.sort((a, b) => {
      if (!a.priced || !b.priced) return Number(b.priced) - Number(a.priced) || a.name.localeCompare(b.name) || a.buy.localeCompare(b.buy);
      const comparison = sortKey === 'name' ? a.name.localeCompare(b.name)
        : (a[sortKey] ?? -Infinity) - (b[sortKey] ?? -Infinity);
      return (sortDirection === 'asc' ? comparison : -comparison)
        || b.per1000Blood - a.per1000Blood || a.name.localeCompare(b.name);
    });
    const profitColor = profitScale(rows.map((r) => r.profit));
    const efficiencyColor = profitScale(rows.map((r) => r.per1000Blood));
    const profitCell = (value, color) => `<td class="breach-profit-cell${value < 0 ? ' exchange-negative' : ''}"${value > 0 ? ` style="color: ${color(value)}"` : ''}>${divineValue(value, true)}</td>`;
    for (const button of $('breachRouteHeaders').querySelectorAll('[data-sort]')) {
      const active = button.dataset.sort === sortKey;
      button.closest('th').setAttribute('aria-sort', active ? (sortDirection === 'desc' ? 'descending' : 'ascending') : 'none');
      button.querySelector('.breach-sort-arrow, span:last-child').textContent = active ? (sortDirection === 'desc' ? '↓' : '↑') : '↕';
    }
    $('breachRoutes').innerHTML = rows.map((row) => {
      const quote = result.inputs[row.key][row.buy];
      const inputLabel = `<span class="breach-input-label">${icon(row.key === 'splinters' ? B.SPLINTER : WOMBGIFT, 26)}<strong>${escape(row.name)}</strong></span>`;
      const link = row.key === 'splinters' ? '' : `<a class="link" href="${escape(quoteLink(quote, league, row.level, row.buy))}" target="_blank" rel="noreferrer" aria-label="Check ${escape(row.name)} instant buyouts in ${currencyName(row.buy)}">↗</a>`;
      const buy = priceField(quote, 'inputs', row.key, row.buy, `Buy ${row.name}`, link);
      const checkedAt = row.key === 'splinters' ? snapshot.fetchedAt : quote?.fetchedAt;
      const checked = checkedAt ? `<small class="breach-price-checked">${quote?.manual ? 'Saved price checked' : 'Checked'} ${escape(time(checkedAt))}</small>` : '';
      if (!row.priced) {
        const reason = Number.isFinite(quote?.price) ? 'No complete sale or Divine conversion rate' : row.key === 'splinters' ? 'No trades this hour' : quote?.error ? 'Search unavailable' : quote?.total === 0 ? 'No instant buyouts' : 'No saved quote';
        return `<tr data-path="${row.key}-${row.buy}"><td>${inputLabel}<small>${number(row.blood, 0)} blood / stone</small></td><td>${buy}<small>${escape(reason)}</small>${checked}</td><td>—</td><td>—</td><td>—</td><td>—</td></tr>`;
      }
      const id = `${row.key}-${row.buy}-${row.sell}`;
      const sell = `<span class="breach-value">${currencyNumber(row.sellPrice, row.sell)} ${icon(B.currencies.find((c) => c.key === row.sell).id)}<span>${row.sell === 'divine' ? 'div' : row.sell === 'exalted' ? 'ex' : 'chaos'}</span></span>`;
      return `<tr data-path="${id}"><td>${inputLabel}<small>${number(row.blood, 0)} blood / stone</small></td>
        <td>${buy}<small>${currencyNumber(row.cost, 'divine')} div equivalent</small>${checked}</td><td>${sell}<small>${currencyNumber(row.revenue, 'divine')} div equivalent</small></td>
        ${profitCell(row.profit, profitColor)}<td>${Number.isFinite(row.returnPct) ? `${signed(row.returnPct, 1)}%` : '—'}</td>${profitCell(row.per1000Blood, efficiencyColor)}</tr>`;
    }).join('');
    $('pathSummary').textContent = `All 9 purchase paths · ${rows.filter((r) => r.priced).length} priced.${selectedSale ? ` Selling for ${currencyName(selectedSale)}${forcedSale ? '' : ' automatically'}.` : ''} Click a column to sort.`;
    const unavailable = [];
    for (const currency of B.currencies) {
      if (!result.sales[currency.key]) unavailable.push(`Sell Breachstone for ${currency.name}: No trades this hour`);
      if (!Number.isFinite(result.fx[currency.key])) unavailable.push(`${currency.name} to Divines: No exchange rate this hour`);
    }
    $('unavailablePrices').hidden = !unavailable.length;
    $('unavailableSummary').textContent = `Unavailable prices (${unavailable.length})`;
    $('unavailableList').innerHTML = unavailable.map((line) => `<li>${line}</li>`).join('');
    const health = [];
    if (!quotes) health.push('No saved gift prices for this league. Refresh prices on the local server to fetch instant buyouts.');
    else if (failed) health.push('Some gift searches failed. Any retained prices keep their original check time; open their search links to verify.');
    if (stale) health.push('Some prices are over two hours old.');
    if (incomplete) health.push('Unpriced paths remain visible; their profit is unavailable.');
    $('priceHealth').textContent = health.join(' ');
    if (!busy) status(`Exchange · ${time(snapshot.hour * 1000)}${stale ? ' · Older prices' : ''}`);
  }

  document.addEventListener('error', (event) => {
    if (event.target.matches?.('img.breach-item-icon')) event.target.hidden = true;
  }, true);
  async function load() {
    const exchange = await readJson('data/currency-exchange-poe2.json');
    if (exchange.game !== 'poe2' || !Number.isInteger(exchange.hour) || !Array.isArray(exchange.markets)) throw new Error('Invalid PoE2 exchange snapshot.');
    snapshot = exchange;
    try {
      const data = await readJson('data/breachstone-prices-poe2.json');
      if (data.game !== 'poe2' || !data.leagues) throw new Error('Invalid gift price data.');
      prices = data;
    } catch (_) { /* Exchange-only routes remain useful when a gift snapshot is unavailable. */ }
    const counts = new Map();
    for (const market of snapshot.markets) {
      if (!market.league.includes('(PL') && market.market_pair?.some((id) => [B.SPLINTER, B.STONE].includes(id))) counts.set(market.league, (counts.get(market.league) || 0) + 1);
    }
    const leagues = [...counts.keys()].sort((a, b) => counts.get(b) - counts.get(a));
    if (!leagues.length) throw new Error('No Breach markets in the saved exchange hour.');
    let preferred = $('breachLeague').value;
    if (!leagues.includes(preferred)) { try { preferred = localStorage.getItem('poe2ExchangeLeague'); } catch (_) {} }
    $('breachLeague').innerHTML = leagues.map((l) => `<option>${escape(l)}</option>`).join('');
    $('breachLeague').value = leagues.includes(preferred) ? preferred : leagues[0];
    $('breachLeague').disabled = false;
    render();
  }

  function applyEdit(input, commit) {
    const raw = input.value.trim();
    const numeric = Number(raw);
    if (raw !== '' && (!Number.isFinite(numeric) || numeric < 0)) {
      input.setCustomValidity('Enter a nonnegative price, or clear the field to use the saved price.');
      if (commit) input.reportValidity();
      return;
    }
    input.setCustomValidity('');
    const editedPrice = Number(numeric.toFixed(currencyDigits(input.dataset.currency)));
    const defaultPrice = input.dataset.default;
    const custom = raw !== '' && (defaultPrice === '' || Math.abs(editedPrice - Number(defaultPrice)) > 1e-6);
    input.classList.toggle('input-custom', custom);
    if (!commit) return;
    const league = $('breachLeague').value;
    const manual = overrides[league] ||= {};
    const group = manual[input.dataset.kind] ||= {};
    const values = input.dataset.kind === 'inputs' ? (group[input.dataset.route] ||= {}) : group;
    if (custom) values[input.dataset.currency] = editedPrice;
    else delete values[input.dataset.currency];
    saveOverrides();
    render();
  }
  function selectSale(currency) {
    const manual = overrides[$('breachLeague').value] ||= {};
    if (currency === automaticSale) delete manual.saleCurrency;
    else manual.saleCurrency = currency;
    saveOverrides();
    render();
    $('breachSalePrices').querySelector(`[data-sale-select="${currency}"]`)?.focus({ preventScroll: true });
  }
  $('breachSalePrices').addEventListener('pointerdown', (event) => {
    // Keep an unfinished price edit focused until the option's click commits it.
    if (event.target.closest('.breach-sale-price') && !event.target.closest('.breach-price-input')) event.preventDefault();
  });
  $('breachSalePrices').addEventListener('click', (event) => {
    const option = event.target.closest('.breach-sale-price');
    if (!option || event.target.closest('.breach-price-input')) return;
    event.preventDefault();
    const currency = option.dataset.sale;
    const input = document.activeElement;
    if (input.matches?.('.breach-price-input')) {
      applyEdit(input, false);
      if (!input.checkValidity()) { input.reportValidity(); return; }
      applyEdit(input, true);
    }
    if ($('breachSalePrices').querySelector(`[data-sale-select="${currency}"]`).disabled) return;
    selectSale(currency);
  });
  for (const container of [$('breachRoutes'), $('breachSalePrices')]) {
    container.addEventListener('input', (event) => {
      if (event.target.matches('.breach-price-input')) applyEdit(event.target, false);
    });
    container.addEventListener('change', (event) => {
      if (event.target.matches('[data-sale-select]')) {
        selectSale(event.target.value);
      } else if (event.target.matches('.breach-price-input')) applyEdit(event.target, true);
    });
    container.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && event.target.matches('.breach-price-input')) event.target.blur();
    });
  }
  $('resetBreachPrices').addEventListener('click', () => {
    delete overrides[$('breachLeague').value];
    saveOverrides();
    render();
  });
  $('breachRouteHeaders').addEventListener('click', (event) => {
    const button = event.target.closest('button[data-sort]');
    if (!button) return;
    if (sortKey === button.dataset.sort) sortDirection = sortDirection === 'desc' ? 'asc' : 'desc';
    else { sortKey = button.dataset.sort; sortDirection = sortKey === 'name' ? 'asc' : 'desc'; }
    render();
  });
  $('breachLeague').addEventListener('change', () => {
    try { localStorage.setItem('poe2ExchangeLeague', $('breachLeague').value); } catch (_) {}
    render();
  });
  $('refreshBreach').addEventListener('click', async () => {
    busy = true;
    $('refreshBreach').disabled = true;
    $('breachLeague').disabled = true;
    status('Refreshing PoE 2 exchange and instant-buyout prices…');
    try {
      const league = $('breachLeague').value;
      let published = false;
      if (snapshot) {
        const response = await fetch(`/api/local/breachstone-prices?league=${encodeURIComponent(league)}`, { method: 'POST', signal: AbortSignal.timeout(180000) });
        if ([404, 405, 501].includes(response.status)) published = true;
        else {
          const data = await response.json();
          if (!response.ok) throw new Error(data.error || 'Price refresh failed.');
          prices = data;
        }
      }
      await load();
      if (published) status('Loaded published prices · Instant-buyout quotes update hourly.');
      else if ([65, 80].some((l) => B.currencies.some((c) => prices.leagues?.[league]?.gifts?.[l]?.[c.key]?.error))) status('Refresh incomplete · See individual price status below.', true);
      else status('Instant-buyout prices refreshed.');
    } catch (error) { status(error.message, true); }
    finally { busy = false; $('refreshBreach').disabled = false; $('breachLeague').disabled = !snapshot; }
  });
  $('openChangelog').addEventListener('click', async () => {
    $('changelogDialog').showModal();
    try {
      const data = await readJson('changelog.json');
      $('changelogContent').innerHTML = data.entries.map((entry) => `<article class="changelog-entry"><div class="changelog-meta"><span class="changelog-version">v${escape(entry.version)}</span><span>${escape(entry.date)}</span></div><ul class="changelog-list">${entry.changes.map((c) => `<li>${escape(c)}</li>`).join('')}</ul></article>`).join('');
    } catch (error) { $('changelogContent').textContent = error.message; }
  });
  $('closeChangelog').addEventListener('click', () => $('changelogDialog').close());
  $('changelogDialog').addEventListener('click', (event) => { if (event.target === $('changelogDialog')) $('changelogDialog').close(); });
  load().catch((error) => {
    status(error.message, true);
    $('breachRoutes').innerHTML = '<tr><td colspan="6">Exchange data unavailable. Use Refresh prices to try again.</td></tr>';
  });
})();
