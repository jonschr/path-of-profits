(() => {
  'use strict';
  const A = window.PoeAssembly, C = window.PoeConversions;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = (n, digits = 2) => Number.isFinite(n) ? n.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits }) : '—';
  const div = (n) => Number.isFinite(n) && n !== 0 && Math.abs(n) < .005 ? `${n < 0 ? '−' : ''}<0.01` : fmt(n);
  const date = (n) => n ? new Date(n).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'Not checked';
  const digits = (currency) => currency === 'divine' ? 2 : currency === 'chaos' ? 1 : 0;
  let snapshot, prices = {}, ctx, orbId, rows = [], sort = 'profit', direction = -1, busy = false, overrides = {};
  try { const saved = JSON.parse(localStorage.getItem('extractionOverrides') || '{}'); if (saved && typeof saved === 'object' && !Array.isArray(saved)) overrides = saved; } catch (_) {}
  const edits = () => overrides[$('league').value] || {};
  const save = () => { try { localStorage.setItem('extractionOverrides', JSON.stringify(overrides)); } catch (_) {} };
  const icon = (url) => url?.startsWith('https://') ? `<img src="${esc(url)}" alt="" width="23" height="23" loading="lazy">` : '';
  const label = (name, url) => `<span class="conversion-item">${icon(url)}<span>${esc(name)}</span></span>`;
  const currencyLabel = (key) => { const c = C.currencies.find((x) => x.key === key); return `${icon(snapshot.items[c.id]?.icon)}${c.unit}`; };

  function priceField(id, side, quantity, quote) {
    const currency = quote?.currency.key || edits().choices?.[`${side}|${id}`] || 'divine';
    const info = C.currencies.find((x) => x.key === currency), name = snapshot.items[id].name;
    const total = quote ? quote.price * quantity : null;
    const displayed = total === null ? '' : Number(total.toFixed(digits(currency))) === 0 ? Number(total.toPrecision(3)) : total.toFixed(digits(currency));
    return `<div class="conversion-price"><input class="editable-input${quote?.manual ? ' input-custom' : ''}" inputmode="decimal" value="${displayed}" placeholder="—" data-price="${esc(id)}" data-side="${side}" data-currency="${currency}" data-quantity="${quantity}" aria-label="${side} ${esc(name)} in ${info.name}"><button class="field-unit conversion-currency${edits().choices?.[`${side}|${id}`] ? ' is-custom' : ''}" type="button" data-currency-choice="${esc(id)}" data-side="${side}" data-currency="${currency}" aria-label="Change ${side} currency for ${esc(name)}">${currencyLabel(currency)}</button><a class="link" href="${esc(C.tradeUrl('poe2', $('league').value, name, currency))}" target="_blank" rel="noreferrer" aria-label="Check ${esc(name)} instant buyouts">↗</a></div>`;
  }
  async function load() {
    busy = true; $('refresh').disabled = true; $('league').disabled = true;
    $('status').textContent = 'Loading extraction prices…';
    try {
      const responses = await Promise.all([fetch('data/currency-exchange-poe2.json', { cache: 'no-store' }), fetch('data/flip-prices.json', { cache: 'no-store' })]);
      if (!responses[0].ok) throw new Error('Exchange prices unavailable.');
      snapshot = await responses[0].json();
      if (snapshot.game !== 'poe2' || !snapshot.items || !Array.isArray(snapshot.markets)) throw new Error('Invalid exchange prices.');
      prices = responses[1].ok ? (await responses[1].json()).games?.poe2?.leagues || {} : {};
      const counts = new Map();
      for (const m of snapshot.markets) if (!m.league.includes('(PL')) counts.set(m.league, (counts.get(m.league) || 0) + 1);
      const leagues = [...counts.keys()].sort((a, b) => counts.get(b) - counts.get(a)), previous = $('league').value;
      $('league').innerHTML = leagues.map((x) => `<option value="${esc(x)}">${esc(x)} league</option>`).join('');
      const requested = new URLSearchParams(location.search).get('league');
      $('league').value = leagues.includes(previous) ? previous : leagues.includes(requested) ? requested
        : leagues.find((league) => prices[league]?.scans?.scopes?.some((scope) => scope.fetchedAt)) || leagues[0];
      orbId = A.item(snapshot, 'Orb of Extraction', 'currency');
      render();
    } catch (error) { $('status').textContent = error.message; $('routes').innerHTML = `<tr><td colspan="6" class="conversion-empty">${esc(error.message)}</td></tr>`; }
    finally { busy = false; $('refresh').disabled = false; $('league').disabled = !snapshot; }
  }
  function render() {
    if (!snapshot) return;
    const scans = prices[$('league').value]?.scans;
    ctx = A.context(snapshot, $('league').value, prices[$('league').value], edits());
    const merged = { ...edits(), choices: { ...edits().choices, orb: edits().choices?.[`buy|${orbId}`] } };
    ctx.overrides = merged;
    rows = A.extractionRows(ctx, scans, orbId);
    for (const row of rows) for (const x of row.outputs) if (x.icon) snapshot.items[x.id].icon = x.icon;
    rows.sort((a, b) => {
      if (sort === 'name') return direction * (a.listing.item.name || a.listing.item.typeLine).localeCompare(b.listing.item.name || b.listing.item.typeLine);
      return Number(Number.isFinite(b[sort])) - Number(Number.isFinite(a[sort])) || direction * ((a[sort] ?? 0) - (b[sort] ?? 0));
    });
    const pos = rows.map((x) => x.profit).filter((x) => x > 0), min = Math.min(...pos), max = Math.max(...pos);
    const color = (x) => x < 0 ? '#f87171' : x > 0 ? `hsl(${min === max ? 145 : 48 + 97 * (x - min) / (max - min)} 80% 64%)` : 'var(--muted)';
    const orb = ctx.choose(orbId, 'buy', merged.choices.orb);
    $('extractionCost').innerHTML = `<span class="breach-caption">Extraction cost</span>${label('Orb of Extraction', snapshot.items[orbId]?.icon)}${priceField(orbId, 'buy', 1, orb)}<small class="breach-caption">${div(orb?.normalized)} div per item</small>`;
    $('routes').innerHTML = rows.length ? rows.map((r) => `<tr>
      <td>${label(r.listing.item.name || r.listing.item.typeLine, r.listing.item.icon)}<small>${esc(r.listing.item.typeLine)} · ${date(r.listing.fetchedAt)}</small><small><a class="link" href="${esc(r.listing.searchUrl)}" target="_blank" rel="noreferrer">Equipment search ↗</a></small></td>
      <td><div class="conversion-price"><input class="editable-input${r.manual ? ' input-custom' : ''}" inputmode="decimal" data-equipment="${esc(r.listing.id)}" value="${r.purchase.toFixed(digits(r.listing.price.currency))}" aria-label="Equipment buy price in ${r.listing.price.currency}"><span class="field-unit">${currencyLabel(r.listing.price.currency)}</span></div><small>+ ${div(r.orb?.normalized)} div extraction</small><small>${div(r.cost)} div total</small></td>
      <td>${r.outputs.map((x) => `<div class="extraction-sell">${label(x.name, x.icon)}${priceField(x.id, 'sell', x.quantity, x.quote)}${!x.quote ? '<small>No sale quote</small>' : ''}</div>`).join('')}<small>${div(r.revenue)} div recovered</small></td>
      <td><span class="conversion-profit" style="color:${color(r.profit)}">${r.profit > 0 ? '+' : ''}${div(r.profit)} div</span></td><td>${r.returnPct === null ? '—' : `${fmt(r.returnPct, 1)}%`}</td>
      <td>${fmt(r.maxBuy, digits(r.listing.price.currency))} ${C.currencies.find((x) => x.key === r.listing.price.currency).unit}<small>maximum equipment price</small></td></tr>`).join('') : '<tr><td colspan="6" class="conversion-empty">No equipment with recoverable augments in this saved scan. Use the equipment search links to check current listings.</td></tr>';
    const scopes = scans?.scopes || [], checked = scopes.reduce((s, x) => s + (x.checked || 0), 0);
    $('summary').textContent = `${checked} equipment listings checked · ${rows.length} with recoverable augments · ${rows.filter((x) => x.profit !== null).length} fully priced · ${rows.filter((x) => x.profit > 0).length} positive margins`;
    $('scanNote').innerHTML = 'Limited scan: up to the first 100 cheapest instant-buyout listings per equipment category and currency. This does not search every listing. ' + ['armour', 'weapon'].map((category) => `${category}: ${C.currencies.map((c) => { const query = A.scannerQuery(category, c.key); const url = `https://www.pathofexile.com/trade2/search/poe2/${encodeURIComponent($('league').value)}?q=${encodeURIComponent(JSON.stringify(query))}`; return `<a class="link" href="${esc(url)}" target="_blank" rel="noreferrer">${c.name} ↗</a>`; }).join(' · ')}`).join(' / ');
    $('checked').textContent = `Scan checked ${date(scopes.find((x) => x.fetchedAt)?.fetchedAt)}${scopes.some((x) => x.error) ? ' · Some searches failed; older results retained with their original dates.' : ''}. Exchange hour: ${date(snapshot.hour * 1000)}. Refresh reads saved data. Sale values use exchange history, not live sell orders. Profit excludes gold and time.`;
    $('status').textContent = `Exchange hour · ${date(snapshot.hour * 1000)}`;
    $('reset').hidden = !Object.keys(edits()).length;
    for (const button of $('headers').querySelectorAll('[data-sort]')) { button.closest('th').setAttribute('aria-sort', sort === button.dataset.sort ? direction === -1 ? 'descending' : 'ascending' : 'none'); button.querySelector('span').textContent = sort === button.dataset.sort ? direction === -1 ? '↓' : '↑' : '↕'; }
    const url = new URL(location.href); url.searchParams.set('league', $('league').value); history.replaceState(null, '', url);
  }
  document.querySelector('main').addEventListener('change', (event) => {
    const input = event.target;
    if (!input.matches('[data-price], [data-equipment]')) return;
    const raw = input.value.trim(), value = Number(raw);
    if (raw && (!(value > 0) || !Number.isFinite(value))) { input.setCustomValidity('Enter a positive price, or clear to restore.'); input.reportValidity(); return; }
    const group = overrides[$('league').value] ||= {};
    if (input.dataset.equipment) {
      const gear = group.equipment ||= {}; if (raw) gear[input.dataset.equipment] = value; else delete gear[input.dataset.equipment];
    } else {
      const prices = group.prices ||= {}, choices = group.choices ||= {};
      const id = `${input.dataset.side}|${input.dataset.price}|${input.dataset.currency}`, choice = `${input.dataset.side}|${input.dataset.price}`;
      if (raw) { prices[id] = value / Number(input.dataset.quantity); choices[choice] = input.dataset.currency; }
      else { delete prices[id]; delete choices[choice]; }
    }
    save(); render();
  });
  document.querySelector('main').addEventListener('input', (event) => { if (event.target.matches('[data-price], [data-equipment]')) { event.target.setCustomValidity(''); event.target.classList.add('input-custom'); } });
  document.querySelector('main').addEventListener('keydown', (event) => { if (event.key === 'Enter' && event.target.matches('[data-price], [data-equipment]')) event.target.blur(); });
  document.querySelector('main').addEventListener('click', (event) => {
    const button = event.target.closest('[data-currency-choice]'); if (!button) return;
    const next = C.currencies[(C.currencies.findIndex((x) => x.key === button.dataset.currency) + 1) % C.currencies.length].key;
    ((overrides[$('league').value] ||= {}).choices ||= {})[`${button.dataset.side}|${button.dataset.currencyChoice}`] = next; save(); render();
  });
  $('headers').addEventListener('click', (event) => { const b = event.target.closest('[data-sort]'); if (!b) return; if (sort === b.dataset.sort) direction *= -1; else { sort = b.dataset.sort; direction = sort === 'name' ? 1 : -1; } render(); });
  $('league').addEventListener('change', render);
  $('reset').addEventListener('click', () => { delete overrides[$('league').value]; save(); render(); });
  $('refresh').addEventListener('click', () => { if (!busy) load(); });
  document.addEventListener('error', (event) => { if (event.target.matches?.('img')) event.target.hidden = true; }, true);
  load();
})();
