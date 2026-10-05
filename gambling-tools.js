(() => {
  'use strict';
  const C = window.PoeConversions, G = window.PoeGambling, D = window.PoeRerollData;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const mode = document.body.dataset.mode;
  const fmt = (n, digits = 2) => Number.isFinite(n) ? n.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits }) : '—';
  const div = (n) => Number.isFinite(n) && n !== 0 && Math.abs(n) < .005 ? `${n < 0 ? '−' : ''}<0.01` : fmt(n);
  const date = (n) => new Date(n).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });
  let snapshot, ctx, models = [], rows = [], category = mode === 'scarab' ? 'scarab' : mode === 'recycling' ? 'runegraft' : 'delirium', sort = 'profit', direction = -1, selected = null, riskSelected = null, busy = false;
  let riskCacheKey = '', riskCache = null;
  let overrides = {};
  try { const x = JSON.parse(localStorage.getItem('gamblingToolOverrides') || '{}'); if (x && typeof x === 'object' && !Array.isArray(x)) overrides = x; } catch (_) {}
  const key = () => `poe1|${$('league').value}`;
  const edits = () => overrides[key()] || {};
  const save = () => { try { localStorage.setItem('gamblingToolOverrides', JSON.stringify(overrides)); } catch (_) {} };
  const name = (id) => snapshot.items[id]?.name || id;
  const icon = (id) => snapshot.items[id]?.icon?.startsWith('https://') ? `<img src="${esc(snapshot.items[id].icon)}" alt="" width="23" height="23" loading="lazy">` : '';
  const label = (id, quantity = 1) => `<span class="conversion-item">${icon(id)}<span>${quantity !== 1 ? `${quantity} × ` : ''}${esc(name(id))}</span></span>`;

  function field(id, side, quantity, quote) {
    const currency = quote?.currency.key || edits().choices?.[`${side}|${id}`] || 'chaos';
    const info = C.currencies.find((c) => c.key === currency);
    const total = quote ? quantity * quote.price : null;
    const digits = currency === 'divine' ? 2 : currency === 'chaos' ? 1 : 0;
    const displayed = total === null ? '' : total > 0 && Number(total.toFixed(digits)) === 0 ? Number(total.toPrecision(3)) : total.toFixed(digits);
    return `<div class="table-edit-wrap conversion-price"><input class="editable-input${quote?.manual ? ' input-custom' : ''}" inputmode="decimal" data-price="${esc(id)}" data-side="${side}" data-currency="${currency}" data-quantity="${quantity}" value="${displayed}" placeholder="—" aria-label="${side === 'buy' ? 'Buy' : 'Sell'} ${quantity} ${esc(name(id))} in ${info.name}"><span class="field-unit">${icon(info.id)}${info.unit}</span><a class="link" href="${esc(C.tradeUrl('poe1', $('league').value, name(id), currency))}" target="_blank" rel="noreferrer" aria-label="Check ${esc(name(id))} instant buyouts in ${info.name}">↗</a></div>${quote?.supplement ? `<small><a class="link" href="${esc(quote.supplement.source)}" target="_blank" rel="noreferrer">poe.ninja exchange estimate ↗</a> · ${date(quote.supplement.checkedAt)}</small>` : ''}`;
  }

  async function load() {
    busy = true; $('refresh').disabled = true; $('league').disabled = true;
    $('status').textContent = 'Loading exchange prices…';
    try {
      const response = await fetch('data/currency-exchange.json', { cache: 'no-store', signal: AbortSignal.timeout(20000) });
      if (!response.ok) throw new Error(`Prices unavailable (${response.status}).`);
      const data = await response.json();
      if (data.game !== 'poe1' || !data.items || !Array.isArray(data.markets) || !Number.isInteger(data.hour)) throw new Error('Invalid exchange snapshot.');
      snapshot = data;
      const counts = new Map();
      for (const market of data.markets) if (!market.league.includes('(PL')) counts.set(market.league, (counts.get(market.league) || 0) + 1);
      const leagues = [...counts.keys()].sort((a, b) => counts.get(b) - counts.get(a));
      if (!leagues.length) throw new Error('No public leagues in this snapshot.');
      const previous = $('league').value, requested = new URLSearchParams(location.search).get('league');
      $('league').innerHTML = leagues.map((x) => `<option value="${esc(x)}">${esc(x)} league</option>`).join('');
      $('league').value = leagues.includes(previous) ? previous : leagues.includes(requested) ? requested : leagues[0];
      models = G.catalog(snapshot, mode);
      if (mode === 'harvest') models.push({ key: 'fixed', name: 'Uber Elder swaps' });
      $('conversionCategories').innerHTML = mode === 'scarab' ? '' : models.map((x) => `<button type="button" class="conversion-category" data-category="${x.key}">${esc(x.name)}</button>`).join('');
      render();
    } catch (error) {
      snapshot = null; $('status').textContent = error.message;
      $('routes').innerHTML = '<tr><td colspan="6" class="conversion-empty">Prices could not be loaded. Refresh prices to try again.</td></tr>';
      $('summary').textContent = ''; $('odds').innerHTML = ''; $('cheapInputs').innerHTML = '';
    } finally { busy = false; $('refresh').disabled = false; $('league').disabled = !snapshot; }
  }

  function fixedRows() {
    const conversionCtx = C.context(snapshot, $('league').value, edits());
    return C.recipes(snapshot, 'harvest').map((recipe) => {
      const result = C.evaluate(conversionCtx, recipe);
      const inputs = result.inputs.map((x) => ({ ...x, quote: ctx.choose(x.id, 'buy', edits().choices?.[`buy|${x.id}`]) }));
      const output = { ...result.output, quote: ctx.choose(result.output.id, 'sell', edits().choices?.[`sell|${result.output.id}`]) };
      const complete = inputs.every((x) => x.quote) && output.quote;
      const cost = complete ? inputs.reduce((s, x) => s + x.quantity * x.quote.normalized, 0) : null;
      const revenue = complete ? output.quantity * output.quote.normalized : null;
      const profit = complete ? revenue - cost : null;
      return { input: { id: inputs[0].id, quote: ctx.choose(inputs[0].id, 'sell') }, buy: inputs[0].quote, juice: inputs[1].quote,
        model: { key: 'fixed', quantity: 1, cost: 800, lifeforceId: inputs[1].id }, output,
        cost, revenue, profit, returnPct: cost > 0 ? profit / cost * 100 : null, winChance: complete ? profit > 0 ? 1 : 0 : null,
        coverage: complete ? 1 : 0, action: 'Fixed swap' };
    });
  }

  function render() {
    if (!snapshot) return;
    ctx = G.context(snapshot, $('league').value, edits());
    const model = models.find((x) => x.key === category);
    rows = category === 'fixed' ? fixedRows() : G.evaluate(ctx, model);
    for (const row of rows) row.sale = row.output ? row.revenue : row.input.price;
    const profitValue = (r) => r.profit ?? r.lowerProfit;
    rows.sort((a, b) => {
      if (sort === 'name' || sort === 'action') return direction * (sort === 'name' ? name(a.input.id).localeCompare(name(b.input.id)) : a.action.localeCompare(b.action)) || name(a.input.id).localeCompare(name(b.input.id));
      const av = sort === 'profit' ? profitValue(a) : a[sort], bv = sort === 'profit' ? profitValue(b) : b[sort];
      return Number(Number.isFinite(bv)) - Number(Number.isFinite(av)) || direction * ((av ?? 0) - (bv ?? 0)) || name(a.input.id).localeCompare(name(b.input.id));
    });
    const positive = rows.map(profitValue).filter((x) => x > 0), min = Math.min(...positive), max = Math.max(...positive);
    const color = (x) => x < 0 ? '#f87171' : x > 0 ? `hsl(${min === max ? 145 : 48 + 97 * (x - min) / (max - min)} 80% 64%)` : 'var(--muted)';
    $('routes').innerHTML = rows.map((r) => {
      const profit = profitValue(r), bound = r.profit === null && Number.isFinite(profit);
      return `<tr><td>${r.output ? label(r.input.id, r.model.quantity) : `<button type="button" class="gambling-row-select${riskSelected === r.input.id ? ' is-selected' : ''}" data-risk="${esc(r.input.id)}" aria-label="Show batch risk for ${esc(name(r.input.id))}">${label(r.input.id, r.model.quantity)}</button>`}${r.output ? `<div class="conversion-arrow">↓</div>${label(r.output.id)}` : `<small>${mode === 'scarab' ? '3 identical → 1 different scarab' : mode === 'recycling' ? '3 → 1 random type (same allowed)' : '1 → 1 different type'}</small>`}<small>${date(snapshot.hour * 1000)}</small></td>
        <td>${field(r.input.id, 'buy', r.model.quantity, r.buy)}${r.model.lifeforceId ? `${field(r.model.lifeforceId, 'buy', r.model.cost, r.juice)}<small>+ ${r.model.cost} ${esc(name(r.model.lifeforceId))}</small>` : ''}<small>${div(r.cost)} div total${r.buy?.volume !== null && r.buy ? ` · ${fmt(r.buy.volume, 0)} traded / hour` : ''}</small></td>
        <td>${r.output ? field(r.output.id, 'sell', 1, r.output.quote) : field(r.input.id, 'sell', 1, r.input.quote)}<small>${r.output ? `${div(r.revenue)} div output` : `${div(r.input.price)} div / item`}</small></td>
        <td><span class="conversion-profit" style="color:${color(profit)}">${bound ? '≥ ' : profit > 0 ? '+' : ''}${div(profit)} div</span><small>${bound ? `${fmt(r.coverage * 100, 1)}% of outcomes priced` : `${div(r.revenue)} div expected output`}</small>${r.model.quantity === 3 && r.owned ? `<small>${div(r.lowerProfit)} div after one roll</small>` : ''}</td>
        <td>${r.returnPct === null ? Number.isFinite(r.lowerReturnPct) ? `≥ ${fmt(r.lowerReturnPct, 1)}%` : '—' : `${fmt(r.returnPct, 1)}%`}</td>
        <td>${r.model.quantity === 3 ? `<span class="gambling-action${r.action === '3-to-1' ? ' is-reroll' : ''}">${r.action}</span><small>${r.owned ? `${div(r.owned.continuation)} div reroll value / held item` : 'Fill missing sale prices'}</small>` : `<span>${r.winChance === null ? '—' : `${r.coverage < .999999 ? '≥ ' : ''}${fmt(r.winChance * 100, 1)}%`}</span><small>${r.action === 'Fixed swap' ? 'Fixed output' : r.action === 'Need prices' ? 'Sale prices needed' : `${r.action} held items${r.coverage < .999999 ? ' · incomplete prices' : ''}`}</small>`}</td></tr>`;
    }).join('');
    const priced = rows.filter((x) => x.profit !== null).length;
    const lowerPositive = rows.filter((x) => x.profit === null && x.lowerProfit > 0).length;
    $('summary').textContent = `${rows.length} paths · ${priced} fully priced · ${rows.filter((x) => x.profit > 0).length} positive expected margins${lowerPositive ? ` · ${lowerPositive} positive lower bounds` : ''}`;
    $('status').textContent = `Exchange hour · ${date(snapshot.hour * 1000)}`;
    $('checked').textContent = `Exchange prices: ${date(snapshot.hour * 1000)}. Refresh reads the latest saved hourly snapshot. Odds are saved research data and do not refresh with prices. Past traded volume is not available stock. Profit excludes gold and your time.`;
    $('reset').hidden = !Object.keys(edits().prices || {}).length;
    $('modelNote').innerHTML = mode === 'scarab'
      ? `<a class="link" href="${esc(model.source)}" target="_blank" rel="noreferrer">ScarabEV community sample ↗</a> · ${model.outputs.toLocaleString()} outputs / ${model.sessions} sessions · ${esc(model.league)} · checked ${date(model.checkedAt)}. Sample frequencies are used as relative weights, excluding the input type; these are estimated odds, not GGG probabilities.${$('league').value !== model.league ? ` <strong>Odds borrowed from ${esc(model.league)}; not measured for this league.</strong>` : ''}`
      : category === 'fixed' ? 'Fixed output: 800 Vivid lifeforce per swap.' : `<a class="link" href="${esc(model.source)}" target="_blank" rel="noreferrer">Odds source ↗</a> · ${esc(model.date)}. ${esc(model.note)} ${rows.some((r) => r.coverage < .999999) ? 'Unpriced outcomes stay in the pool. ≥ values are lower bounds with their sale values set to zero; fill the empty Sell now fields for full estimates.' : ''}`;
    for (const button of $('conversionCategories').querySelectorAll('[data-category]')) { const active = button.dataset.category === category; button.classList.toggle('is-active', active); button.setAttribute('aria-pressed', String(active)); }
    for (const button of $('headers').querySelectorAll('[data-sort]')) { button.closest('th').setAttribute('aria-sort', sort === button.dataset.sort ? direction === -1 ? 'descending' : 'ascending' : 'none'); button.querySelector('span').textContent = sort === button.dataset.sort ? direction === -1 ? '↓' : '↑' : '↕'; }
    renderOdds();
    const url = new URL(location.href); url.searchParams.set('league', $('league').value); history.replaceState(null, '', url);
  }

  function renderOdds() {
    const cheapest = mode === 'scarab' ? G.bulkInputs(rows) : rows.filter((r) => r.buy).sort((a, b) => a.cost - b.cost).slice(0, 3);
    let active = rows.find((x) => x.input.id === riskSelected) || rows.find((x) => x.input.id === selected);
    if (!active || !active.buy) { active = cheapest[0]; selected = null; riskSelected = null; }
    $('cheapInputs').innerHTML = mode !== 'scarab' ? '' : cheapest.map((r) => `<button type="button" data-input="${esc(r.input.id)}" class="gambling-cheap${active === r ? selected ? ' is-custom' : ' is-auto' : ''}" aria-pressed="${active === r}">${label(r.input.id)}<span>${fmt(r.buy.price, r.buy.currency.key === 'divine' ? 2 : r.buy.currency.key === 'chaos' ? 1 : 0)} ${r.buy.currency.unit} each · ${div(r.cost)} div / 3</span><small>${div(r.profit)} div expected profit / turn-in</small></button>`).join('');
    $('cheapSection').hidden = mode !== 'scarab';
    $('cheapCaption').textContent = cheapest.length ? 'Cheapest quotes with at least 1,000 scarabs traded in the snapshot hour. This is past turnover, not live bulk stock; use the trade links below to check availability.' : 'No quotes had at least 1,000 scarabs of turnover this hour. All available prices are listed below.';
    $('oddsSection').hidden = category === 'fixed';
    $('riskSection').hidden = category === 'fixed';
    if (!active || category === 'fixed' || !(ctx.fx.chaos > 0)) { $('odds').innerHTML = ''; $('risk').innerHTML = ''; return; }
    const bandRows = G.bands(active, ctx.fx.chaos);
    $('oddsTitle').textContent = `One-roll value odds · ${name(active.input.id)}`;
    $('odds').innerHTML = bandRows.map((b) => `<div class="gambling-band"><span>${b.hi === Infinity ? `${fmt(b.lo, 0)}+ chaos` : `${fmt(b.lo, 0)}–${fmt(b.hi, 0)} chaos`}</span><strong>${fmt(b.probability * 100, 2)}%</strong><div class="gambling-band-bar"><i style="width:${b.probability * 100}%"></i></div></div>`).join('') + (active.coverage < .999999 ? `<div class="gambling-band"><span>Unpriced outcomes</span><strong>${fmt((1 - active.coverage) * 100, 2)}%</strong></div>` : '');
    $('oddsCaption').textContent = `Each band is the sale value of the first output. ${mode !== 'harvest' ? `Chance of a profitable first roll: ${active.coverage < .999999 ? '≥ ' : ''}${fmt(active.winChance * 100, 1)}%. Table profit allows recycling low-value outputs in batches of three when all sale prices are available.` : 'Profit includes the input and lifeforce. Different inputs have different odds because the input type is excluded.'}`;
    $('riskTitle').textContent = `Batch risk · ${name(active.input.id)}`;
    const signature = JSON.stringify([active.cost, active.probabilities.map((x) => [x.probability, x.price])]);
    if (signature !== riskCacheKey) { riskCacheKey = signature; riskCache = window.PoeGamblingRisk.simulate(active.probabilities, active.cost); }
    if (!riskCache) {
      $('risk').innerHTML = '<p class="breach-caption">Fill the missing sale prices for a batch risk estimate. Unpriced outcomes are not treated as worthless.</p>';
      $('riskCaption').textContent = ''; return;
    }
    $('risk').innerHTML = riskCache.batches.map((b) => `<div class="gambling-risk-card"><strong>${b.rolls.toLocaleString()} rolls</strong><span>${fmt(b.lossChance * 100, 1)}% chance of a loss</span><small>Expected profit: ${div(b.expected)} div</small><small>Middle 80%: ${div(b.low)} to ${div(b.high)} div</small></div>`).join('') + `<div class="gambling-risk-card"><strong>Jackpot dependence</strong><span>Top 5% supply ${fmt(riskCache.share * 100, 1)}% of revenue</span><small>Without those hits: ${div(riskCache.without)} div / roll</small></div>`;
    $('riskCaption').textContent = 'Estimated from 5,000 simulated batches at the displayed odds and fixed prices. Each roll sells its first output; no recycling, gold fees or price movement. Top 5% means the most valuable outcomes by probability. Click an input name to inspect its risk.';
  }

  $('routes').addEventListener('change', (event) => {
    const input = event.target;
    if (!input.matches('[data-price]')) return;
    const raw = input.value.trim(), value = Number(raw);
    if (raw && (!(value > 0) || !Number.isFinite(value))) { input.setCustomValidity('Enter a positive price, or clear to restore the saved price.'); input.reportValidity(); return; }
    const group = overrides[key()] ||= {}, prices = group.prices ||= {}, choices = group.choices ||= {};
    const id = `${input.dataset.side}|${input.dataset.price}|${input.dataset.currency}`, choice = `${input.dataset.side}|${input.dataset.price}`;
    if (!raw) { delete prices[id]; delete choices[choice]; }
    else { prices[id] = value / Number(input.dataset.quantity); choices[choice] = input.dataset.currency; }
    save(); render();
  });
  $('routes').addEventListener('input', (event) => { if (event.target.matches('[data-price]')) { event.target.setCustomValidity(''); event.target.classList.add('input-custom'); } });
  $('routes').addEventListener('click', (event) => { const button = event.target.closest('[data-risk]'); if (button) { riskSelected = button.dataset.risk; render(); } });
  $('routes').addEventListener('keydown', (event) => { if (event.key === 'Enter' && event.target.matches('[data-price]')) event.target.blur(); });
  $('headers').addEventListener('click', (event) => { const button = event.target.closest('[data-sort]'); if (!button) return; if (sort === button.dataset.sort) direction *= -1; else { sort = button.dataset.sort; direction = sort === 'name' ? 1 : -1; } render(); });
  $('conversionCategories').addEventListener('click', (event) => { const button = event.target.closest('[data-category]'); if (!button) return; category = button.dataset.category; selected = null; riskSelected = null; render(); });
  $('cheapInputs').addEventListener('click', (event) => { const button = event.target.closest('[data-input]'); if (button) { selected = button.dataset.input; riskSelected = null; renderOdds(); } });
  $('league').addEventListener('change', () => { selected = null; riskSelected = null; render(); });
  $('reset').addEventListener('click', () => { delete overrides[key()]; save(); render(); });
  $('refresh').addEventListener('click', () => { if (!busy) load(); });
  document.addEventListener('error', (event) => { if (event.target.matches?.('img')) event.target.hidden = true; }, true);
  load();
})();
