(() => {
  'use strict';
  const C = window.PoeConversions;
  const $ = (id) => document.getElementById(id);
  const escape = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const mode = document.body.dataset.mode;
  const assembly = ['unique', 'legacy'].includes(mode), A = window.PoeAssembly;
  let tradePrices = {};
  const categories = { essence: 'Essences', oil: 'Oils', rune: 'Runes', emotion: 'Liquid emotions', cards: 'Card sets', harvest: 'Fragment swaps' };
  const params = new URLSearchParams(location.search);
  const game = document.body.dataset.game === 'poe2' ? 'poe2' : 'poe1';
  let snapshot, context, catalog = [], rows = [], category = 'all', sort = 'profit', direction = -1, loading = false;
  let overrides = {};
  try { const stored = JSON.parse(localStorage.getItem('conversionToolOverrides') || '{}'); if (stored && typeof stored === 'object' && !Array.isArray(stored)) overrides = stored; } catch (_) {}
  const key = () => `${game}|${$('league').value}`;
  const edits = () => overrides[key()] || {};
  const save = () => { try { localStorage.setItem('conversionToolOverrides', JSON.stringify(overrides)); } catch (_) {} };
  const name = (id) => snapshot.items[id]?.name || id.split('/').pop();
  const number = (value, digits = 2) => Number.isFinite(value) ? value.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits }) : '—';
  const div = (value) => Number.isFinite(value) && value !== 0 && Math.abs(value) < 0.005 ? `${value < 0 ? '−' : ''}<0.01` : number(value);
  const time = () => new Date(snapshot.hour * 1000).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });
  const icon = (id) => snapshot.items[id]?.icon?.startsWith('https://') ? `<img src="${escape(snapshot.items[id].icon)}" alt="" loading="lazy" width="23" height="23">` : '';
  const itemLabel = (id, quantity) => `<span class="conversion-item">${icon(id)}<span>${quantity.toLocaleString()} × ${escape(name(id))}</span></span>`;
  const changeUrl = () => { const url = new URL(location.href); url.searchParams.delete('game'); url.searchParams.set('league', $('league').value); history.replaceState(null, '', url); };

  async function load() {
    loading = true;
    $('refresh').disabled = true;
    $('league').disabled = true;
    $('status').textContent = 'Loading exchange prices…';
    $('status').classList.remove('error');
    try {
      const response = await fetch(`data/currency-exchange${game === 'poe2' ? '-poe2' : ''}.json`, { cache: 'no-store', signal: AbortSignal.timeout(20000) });
      if (!response.ok) throw new Error(`Prices unavailable (${response.status}).`);
      const data = await response.json();
      if (data.game !== game || !Array.isArray(data.markets) || !data.items || !Number.isInteger(data.hour)) throw new Error('Invalid exchange snapshot.');
      snapshot = data;
      const counts = new Map();
      for (const market of snapshot.markets) if (!market.league.includes('(PL')) counts.set(market.league, (counts.get(market.league) || 0) + 1);
      const leagues = [...counts.keys()].sort((a, b) => counts.get(b) - counts.get(a));
      if (!leagues.length) throw new Error('No public leagues in this snapshot.');
      const previous = $('league').value;
      $('league').innerHTML = leagues.map((league) => `<option value="${escape(league)}">${escape(league)} league</option>`).join('');
      const requested = params.get('league');
      $('league').value = leagues.includes(previous) ? previous : leagues.includes(requested) ? requested : leagues[0];
      if (assembly) {
        try {
          const response = await fetch('data/flip-prices.json', { cache: 'no-store', signal: AbortSignal.timeout(20000) });
          if (!response.ok) throw new Error('Unavailable trade quotes');
          tradePrices = (await response.json()).games?.[game]?.leagues || {};
        } catch (_) { tradePrices = {}; }
        if (!leagues.includes(previous) && !leagues.includes(requested)) {
          $('league').value = leagues.find((league) => Object.values(tradePrices[league]?.items || {}).some((item) => Object.values(item).some((q) => Number.isFinite(q.price)))) || leagues[0];
        }
      }
      catalog = assembly ? A.catalog(snapshot, mode) : C.recipes(snapshot, mode);
      if (assembly) for (const info of Object.values(snapshot.items)) {
        const image = Object.values(tradePrices[$('league').value]?.items?.[info.name] || {}).find((q) => q.icon)?.icon;
        if (image) info.icon = image;
        else if (info.kind === 'augment') info.icon = 'https://cdn.poe2db.tw/image/Art/2DItems/Currency/Expedition2/GameWarpRuneUniqueFragment.webp';
      }
      const types = ['all', ...new Set(catalog.map((r) => r.category))];
      if (!types.includes(category)) category = 'all';
      $('conversionCategories').innerHTML = assembly || mode === 'harvest' ? '' : types.map((type) => `<button type="button" class="conversion-category${type === category ? ' is-active' : ''}" data-category="${type}" aria-pressed="${type === category}">${type === 'all' ? 'All' : categories[type]}</button>`).join('');
      changeUrl();
      render();
    } catch (error) {
      snapshot = null;
      $('status').textContent = error.message;
      $('status').classList.add('error');
      $('routes').innerHTML = '<tr><td colspan="6" class="conversion-empty">Prices could not be loaded. Use Reload prices to try again.</td></tr>';
      $('summary').textContent = '';
    } finally {
      loading = false;
      $('refresh').disabled = false;
      $('league').disabled = !snapshot;
    }
  }

  function priceField(row, part, side) {
    const q = part.quote;
    const currency = q?.currency.key || edits().choices?.[row.key]?.[side === 'sell' ? 'sell' : part.id] || 'divine';
    const currencyInfo = C.currencies.find((c) => c.key === currency);
    const total = q ? part.quantity * q.price : null;
    const digits = currency === 'divine' ? 2 : currency === 'chaos' ? 1 : 0;
    const displayed = total === null ? '' : total > 0 && Number(total.toFixed(digits)) === 0 ? Number(total.toPrecision(3)) : total.toFixed(digits);
    const info = snapshot.items[part.id];
    const url = assembly && info?.kind ? A.tradeUrl(game, $('league').value, info, currency) : C.tradeUrl(game, $('league').value, name(part.id), currency);
    const link = q?.identity ? '' : `<a class="link" href="${escape(url)}" target="_blank" rel="noreferrer" aria-label="Check ${escape(name(part.id))} instant buyouts in ${currencyInfo.name}">↗</a>`;
    const selected = edits().choices?.[row.key]?.[side === 'sell' ? 'sell' : part.id];
    const unit = assembly ? `<button class="field-unit conversion-currency${selected ? ' is-custom' : ''}" type="button" data-currency-choice="${escape(part.id)}" data-recipe="${escape(row.key)}" data-side="${side}" data-currency="${currency}" aria-label="Change ${side} currency for ${escape(name(part.id))}; currently ${currencyInfo.name}">${icon(currencyInfo.id)}${currencyInfo.unit}</button>` : `<span class="field-unit">${icon(currencyInfo.id)}${currencyInfo.unit}</span>`;
    const quote = context.quotes(part.id, side).find((x) => x.currency.key === currency)?.trade;
    const checked = quote?.fetchedAt ? new Date(quote.fetchedAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : null;
    return `<div class="table-edit-wrap conversion-price"><input class="editable-input${q?.manual ? ' input-custom' : ''}" inputmode="decimal" data-price="${escape(part.id)}" data-recipe="${escape(row.key)}" data-side="${side}" data-currency="${currency}" data-quantity="${part.quantity}" value="${displayed}" placeholder="—" aria-label="${side === 'buy' ? 'Buy' : 'Sell'} ${part.quantity} ${escape(name(part.id))} in ${currencyInfo.name}" title="Price for this whole quantity. Clear to restore the snapshot price."${q?.identity ? ' readonly' : ''}>${unit}${link}</div>${row.inputs.length > 1 && side === 'buy' ? `<small>${part.quantity.toLocaleString()} × ${escape(name(part.id))}</small>` : ''}${assembly && info?.kind ? `<small>${checked || 'Not checked'}${quote?.error ? ' · refresh failed' : quote?.price === null ? ' · no buyouts' : ''}</small>` : ''}`;
  }

  function render() {
    if (!snapshot) return;
    context = assembly ? A.context(snapshot, $('league').value, tradePrices[$('league').value], edits()) : C.context(snapshot, $('league').value, edits());
    rows = catalog.map((recipe) => C.evaluate(context, recipe));
    const filtered = rows.filter((row) => category === 'all' || row.category === category);
    filtered.sort((a, b) => Number(b.complete) - Number(a.complete) || (sort === 'name' ? direction * name(a.output.id).localeCompare(name(b.output.id))
      : direction * ((a[sort] ?? -Infinity) - (b[sort] ?? -Infinity))) || a.key.localeCompare(b.key));
    const positive = filtered.map((r) => r.profit).filter((v) => v > 0);
    const min = Math.min(...positive), max = Math.max(...positive);
    const color = (value) => value < 0 ? '#f87171' : value > 0 ? `hsl(${min === max ? 145 : 48 + 97 * (value - min) / (max - min)} 80% 64%)` : 'var(--muted)';
    $('routes').innerHTML = filtered.length ? filtered.map((row) => `<tr${!row.complete ? ' class="conversion-muted-row"' : ''}>
      <td>${assembly ? row.inputs.map((x) => itemLabel(x.id, x.quantity)).join('<span class="conversion-arrow">+</span>') : itemLabel(row.inputs[0].id, row.inputs[0].quantity)}${!assembly && row.inputs.length > 1 ? '<small>+ 800 Vivid Crystallised Lifeforce</small>' : ''}<div class="conversion-arrow">↓</div>${itemLabel(row.output.id, row.output.quantity)}<small>${number(row.steps, 0)} ${mode === 'harvest' ? 'bench use' : row.steps === 1 ? 'turn-in' : 'turn-ins'} · <a class="link" href="${escape(row.source)}" target="_blank" rel="noreferrer">Recipe ↗</a></small></td>
      <td data-label="Buy inputs">${row.inputs.map((part) => priceField(row, part, 'buy')).join('')}<small>${div(row.cost)} div total${row.manual ? ' · customized' : ''}</small></td>
      <td data-label="Sell output">${priceField(row, row.output, 'sell')}<small>${div(row.revenue)} div equivalent</small></td>
      <td data-label="Profit / craft"><span class="conversion-profit" style="color:${color(row.profit)}">${row.profit > 0 ? '+' : ''}${div(row.profit)} div</span></td>
      <td data-label="Return">${number(row.returnPct, 1)}${row.returnPct !== null ? '%' : ''}</td>
      <td>${assembly ? `${number(row.breakEven, row.inputs[0].quote?.currency.key === 'divine' ? 2 : row.inputs[0].quote?.currency.key === 'chaos' ? 1 : 0)} ${row.inputs[0].quote?.currency.unit || ''}<small>maximum for ${escape(name(row.inputs[0].id))}</small>` : `<span${row.volume !== null && row.volume < 10 ? ' class="conversion-volume-thin"' : ''}>${number(row.volume, row.volume > 0 && row.volume < 10 ? 1 : 0)}</span><small>crafts / snapshot hour${row.volume !== null && row.volume < 10 ? ' · thin market' : ''}</small>`}</td>
    </tr>`).join('') : '<tr><td colspan="6" class="conversion-empty">No conversion recipes available for this league.</td></tr>';
    const complete = rows.filter((r) => r.complete).length;
    $('summary').textContent = `${filtered.length} shown · ${complete} of ${rows.length} conversions priced · ${rows.filter((r) => r.profit > 0).length} positive margins`;
    const age = Date.now() / 1000 - (snapshot.hour + 3600);
    $('status').textContent = `Exchange hour · ${time()}${age > 7200 ? ' · Older snapshot' : ''}`;
    $('checked').textContent = `Trades from the exchange hour starting ${time()}. Reload prices reads the latest saved snapshot; published snapshots update hourly. Prices are completed-trade averages, not live buyout orders.`;
    if (assembly) $('checked').textContent = 'Equipment and Legacy output prices use the cheapest matching instant buyouts in each currency. Exchange inputs and currency rates use the saved hourly snapshot. Refresh reads saved data. Buyouts are asking prices, not completed sales; output rolls and availability matter. Profit excludes gold and time.';
    $('reset').hidden = !Object.keys(edits().prices || {}).length && !Object.keys(edits().choices || {}).length;
    for (const button of document.querySelectorAll('[data-sort]')) {
      button.closest('th').setAttribute('aria-sort', sort === button.dataset.sort ? direction === -1 ? 'descending' : 'ascending' : 'none');
      button.querySelector('span').textContent = sort === button.dataset.sort ? direction === -1 ? '↓' : '↑' : '↕';
    }
    for (const button of $('conversionCategories').querySelectorAll('[data-category]')) { const active = button.dataset.category === category; button.classList.toggle('is-active', active); button.setAttribute('aria-pressed', String(active)); }
  }

  $('routes').addEventListener('change', (event) => {
    const input = event.target;
    const group = overrides[key()] ||= {};
    if (input.matches('[data-price]')) {
      const raw = input.value.trim(), value = Number(raw);
      if (raw && (!(value > 0) || !Number.isFinite(value))) { input.setCustomValidity('Enter a positive price, or clear the field to restore the saved price.'); input.reportValidity(); return; }
      input.setCustomValidity('');
      const id = `${input.dataset.side}|${input.dataset.price}|${input.dataset.currency}`;
      const prices = group.prices ||= {};
      const automatic = context.quotes(input.dataset.price, input.dataset.side).find((q) => q.currency.key === input.dataset.currency)?.automatic;
      const unitPrice = value / Number(input.dataset.quantity);
      if (!raw || (automatic !== null && Math.abs(unitPrice - automatic) < 1e-10)) delete prices[id];
      else prices[id] = unitPrice;
      const choices = (group.choices ||= {})[input.dataset.recipe] ||= {};
      const part = input.dataset.side === 'sell' ? 'sell' : input.dataset.price;
      if (Object.hasOwn(prices, id)) choices[part] = input.dataset.currency;
      else delete choices[part];
      if (!Object.keys(choices).length) delete group.choices[input.dataset.recipe];
    } else return;
    save(); render();
  });
  $('routes').addEventListener('input', (event) => { if (event.target.matches('[data-price]')) { event.target.setCustomValidity(''); event.target.classList.add('input-custom'); } });
  $('routes').addEventListener('click', (event) => {
    const button = event.target.closest('[data-currency-choice]'); if (!button) return;
    const index = C.currencies.findIndex((x) => x.key === button.dataset.currency);
    const next = C.currencies[(index + 1) % C.currencies.length].key;
    const choices = ((overrides[key()] ||= {}).choices ||= {})[button.dataset.recipe] ||= {};
    choices[button.dataset.side === 'sell' ? 'sell' : button.dataset.currencyChoice] = next;
    save(); render();
  });
  $('routes').addEventListener('keydown', (event) => { if (event.key === 'Enter' && event.target.matches('[data-price]')) event.target.blur(); });
  $('headers').addEventListener('click', (event) => { const button = event.target.closest('[data-sort]'); if (!button) return; if (sort === button.dataset.sort) direction *= -1; else { sort = button.dataset.sort; direction = sort === 'name' ? 1 : -1; } render(); });
  $('league').addEventListener('change', () => { changeUrl(); render(); });
  $('conversionCategories').addEventListener('click', (event) => { const button = event.target.closest('[data-category]'); if (button) { category = button.dataset.category; render(); } });
  $('reset').addEventListener('click', () => { delete overrides[key()]; save(); render(); });
  $('refresh').addEventListener('click', () => { if (!loading) load(); });
  document.addEventListener('error', (event) => { if (event.target.matches?.('img')) event.target.hidden = true; }, true);
  load();
})();
