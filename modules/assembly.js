(function (global) {
  'use strict';
  const C = typeof module !== 'undefined' && module.exports ? require('./conversions.js') : global.PoeConversions;
  const D = typeof module !== 'undefined' && module.exports ? require('./assembly-data.js') : global.PoeAssemblyData;
  const uniqueRecipes = [
    ['Kingmaker', ['Soul Taker', 'Heartbreaker', 'Orb of Fusing']],
    ['The Taming', ["Berek's Respite", "Berek's Pass", "Berek's Grip"]],
    ['Magna Eclipsis', ['Invictus Solaris', 'Vix Lunaris', 'Orb of Fusing']],
    ['The Retch', ['Faminebind', 'Feastbind', 'Orb of Fusing']],
    ['The Vinktar Square', ['Agnerod East', 'Agnerod West', 'Agnerod South', 'Agnerod North']]
  ];
  function item(snapshot, name, kind = 'unique') {
    const found = Object.entries(snapshot.items).find(([, x]) => x.name === name);
    if (found) return found[0];
    const id = `${kind}:${name}`;
    snapshot.items[id] ||= { name, kind, category: kind, allowCorrupted: kind === 'unique' && /^Berek's /.test(name) };
    return id;
  }
  function catalog(snapshot, mode) {
    const entries = mode === 'unique' ? uniqueRecipes.map(([output, inputs]) => ({ output, inputs }))
      : D.legacy.map((x) => ({ output: x.output, inputs: [x.input, "Aldur's Legacy"] }));
    return entries.map(({ output, inputs }) => ({ key: `${mode}:${output}`, category: mode, steps: 1,
      inputs: inputs.map((name) => ({ id: item(snapshot, name), quantity: 1 })),
      output: { id: item(snapshot, output, mode === 'legacy' ? 'augment' : 'unique'), quantity: 1 },
      source: mode === 'unique' ? C.sources.poe1 : D.source }));
  }
  function tradeQuery(info, currency) {
    if (!C.currencies.some((c) => c.key === currency)) throw new Error('Unsupported currency.');
    const unique = info.kind === 'unique';
    return { query: { status: { option: 'securable' }, [unique ? 'name' : 'type']: info.name,
      stats: [{ type: 'and', filters: [] }], filters: {
        ...(unique ? { misc_filters: { filters: { ...(!info.allowCorrupted ? { corrupted: { option: 'false' } } : {}), identified: { option: 'true' }, ...(info.game === 'poe1' && !info.allowCorrupted ? { foulborn_item: { option: 'false' } } : {}) } } } : {}),
        trade_filters: { filters: { price: { option: currency } } }
      } }, sort: { price: 'asc' } };
  }
  function tradeUrl(game, league, info, currency) {
    const base = game === 'poe2' ? 'trade2/search/poe2' : 'trade/search';
    return `https://www.pathofexile.com/${base}/${encodeURIComponent(league)}?q=${encodeURIComponent(JSON.stringify(tradeQuery({ ...info, game }, currency)))}`;
  }
  function matches(row, info, currency) {
    return row?.item && row.listing?.price?.currency === currency && Number.isFinite(row.listing.price.amount)
      && row.listing.price.amount > 0 && (info.kind === 'unique'
        ? row.item.name === info.name && (info.allowCorrupted || (!row.item.corrupted && !row.item.foulborn)) && row.item.identified !== false
        : (row.item.baseType || row.item.typeLine) === info.name);
  }
  function summarizeListings(listings, info, currency) {
    const valid = listings.filter((r) => matches(r, info, currency));
    return { price: valid.length ? Math.min(...valid.map((r) => r.listing.price.amount)) : null,
      sampleCount: valid.length, icon: valid[0]?.item.icon || null };
  }
  function context(snapshot, league, quotes, overrides) {
    const ctx = C.context(snapshot, league, overrides), original = ctx.quotes;
    ctx.quotes = (id, side) => original(id, side).map((q) => {
      const stored = quotes?.items?.[snapshot.items[id]?.name]?.[q.currency.key];
      if (q.manual || !stored || stored.source !== 'instant-buyout') return q;
      return { ...q, price: stored.price, automatic: stored.price,
        normalized: Number.isFinite(stored.price) && ctx.fx[q.currency.key] > 0 ? stored.price * ctx.fx[q.currency.key] : null,
        trade: stored, volume: null, currencyVolume: null };
    });
    ctx.choose = (id, side, forced) => {
      const qs = ctx.quotes(id, side).filter((q) => Number.isFinite(q.normalized));
      return forced ? qs.find((q) => q.currency.key === forced) || null : qs.sort((a, b) => side === 'buy' ? a.normalized - b.normalized : b.normalized - a.normalized)[0] || null;
    };
    return ctx;
  }
  function scannerQuery(category, currency) {
    if (!['weapon', 'armour'].includes(category) || !C.currencies.some((c) => c.key === currency)) throw new Error('Unsupported scan.');
    return { query: { status: { option: 'securable' }, stats: [{ type: 'and', filters: [] }], filters: {
      type_filters: { filters: { category: { option: category } } },
      equipment_filters: { filters: { total_augment_sockets: { min: 1 } } },
      trade_filters: { filters: { price: { option: currency } } }
    } }, sort: { price: 'asc' } };
  }
  function socketBound(augment) {
    return augment.socketBound === true || augment.socket_bound === true || augment.isSocketBound === true
      || [...(augment.properties || []).map((p) => p.name), ...(augment.utilityMods || []), ...(augment.runeMods || []), ...(augment.explicitMods || []), ...(augment.descrText ? [augment.descrText] : [])].some((s) => /socket[ -]?bound/i.test(typeof s === 'string' ? s : s.description || ''));
  }
  function recoverable(equipment) {
    return (equipment.socketedItems || []).filter((x) => (x.frameType === 5 || x.frameTypeId === 'Currency') && !socketBound(x))
      .map((x) => ({ name: x.baseType || x.typeLine || x.name, icon: x.icon, quantity: x.stackSize || 1 }));
  }
  function extractionRows(ctx, scans, orbId) {
    const orb = ctx.choose(orbId, 'buy', ctx.overrides.choices?.orb);
    const seen = new Set();
    return (scans?.listings || []).filter((listing) => {
      if (seen.has(listing.id)) return false;
      seen.add(listing.id); return true;
    }).map((listing) => {
      const outputs = recoverable(listing.item).map((x) => ({ ...x, id: item(ctx.snapshot, x.name, 'augment') }));
      const priced = outputs.map((x) => ({ ...x, quote: ctx.choose(x.id, 'sell', ctx.overrides.choices?.[`sell|${x.id}`]) }));
      const complete = priced.length > 0 && priced.every((x) => x.quote);
      const revenue = complete ? priced.reduce((s, x) => s + x.quantity * x.quote.normalized, 0) : null;
      const manual = ctx.overrides.equipment?.[listing.id];
      const purchase = Number.isFinite(manual) && manual > 0 ? manual : listing.price.amount;
      const gearCost = ctx.fx[listing.price.currency] > 0 ? purchase * ctx.fx[listing.price.currency] : null;
      const cost = gearCost !== null && orb ? gearCost + orb.normalized : null;
      const profit = cost !== null && revenue !== null ? revenue - cost : null;
      return { listing, outputs: priced, orb, purchase, manual: purchase !== listing.price.amount, gearCost, cost, revenue, profit,
        returnPct: profit !== null && cost > 0 ? profit / cost * 100 : null,
        maxBuy: revenue !== null && orb && ctx.fx[listing.price.currency] > 0 ? (revenue - orb.normalized) / ctx.fx[listing.price.currency] : null };
    }).filter((r) => r.outputs.length > 0);
  }
  const api = { catalog, item, tradeQuery, tradeUrl, matches, summarizeListings, context, scannerQuery, socketBound, recoverable, extractionRows };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else global.PoeAssembly = api;
})(typeof window !== 'undefined' ? window : globalThis);
