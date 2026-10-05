(function (global) {
  'use strict';
  const C = typeof module !== 'undefined' && module.exports ? require('./conversions.js') : global.PoeConversions;
  const D = typeof module !== 'undefined' && module.exports ? require('./reroll-data.js') : global.PoeRerollData;
  const R = typeof module !== 'undefined' && module.exports ? require('./recycling-data.js') : global.PoeRecyclingData;
  const source = 'https://poedb.tw/us/Horticrafting';

  function catalog(snapshot, mode) {
    const names = new Map(Object.entries(snapshot.items).map(([id, item]) => [item.name.toLowerCase(), id]));
    function item(name, category) {
      let id = names.get(name.toLowerCase());
      if (!id) {
        id = `reroll:${name}`;
        const supplement = D.supplements.find((x) => x.name === name);
        snapshot.items[id] = { name, category, icon: supplement?.icon || null };
        names.set(name.toLowerCase(), id);
      }
      return id;
    }
    function pool(model) {
      return { ...model, quantity: mode === 'harvest' ? 1 : 3,
        lifeforceId: model.lifeforce ? item(model.lifeforce, 'currency') : null,
        outcomes: Object.entries(model.weights).map(([name, weight]) => ({ id: item(name, model.key), weight })) };
    }
    if (mode === 'scarab') return [pool({ ...D.scarab, key: 'scarab', name: 'Scarabs', cost: 0 })];
    if (mode === 'recycling') return R.map(pool);
    const models = D.harvest.map(pool);
    // Same-tier essence pools are explicit, not inferred from the items traded this hour.
    const families = ['Greed', 'Contempt', 'Hatred', 'Woe', 'Fear', 'Anger', 'Torment', 'Sorrow', 'Rage', 'Suffering', 'Wrath', 'Doubt', 'Loathing', 'Zeal', 'Anguish', 'Spite', 'Scorn', 'Envy', 'Misery', 'Dread'];
    for (const tier of ['Deafening', 'Shrieking']) models.push(pool({ key: tier.toLowerCase(), name: `${tier} essences`, cost: 30,
      lifeforce: 'Primal Crystallised Lifeforce', date: 'Model', source,
      note: 'Equal-weight scenario for the 20 same-tier outcomes; probabilities are an assumption, not a measured current sample.',
      weights: Object.fromEntries(families.map((x) => [`${tier} Essence of ${x}`, 1])) }));
    models.push(pool({ key: 'corrupted', name: 'Special essences', cost: 30, lifeforce: 'Primal Crystallised Lifeforce', date: 'Model', source,
      note: 'Equal-weight scenario for Horror, Hysteria, Insanity and Delirium; kept separate from ordinary essence tiers.',
      weights: Object.fromEntries(['Horror', 'Hysteria', 'Insanity', 'Delirium'].map((x) => [`Essence of ${x}`, 1])) }));
    for (const [key, name, cost, suffix] of [['emblem', 'Timeless emblems', 400, 'Emblem'], ['splinter', 'Timeless splinters', 4, 'Splinter']]) models.push(pool({
      key, name, cost, lifeforce: 'Primal Crystallised Lifeforce', date: '2023-11-01', source: 'https://gains-of-exile.vercel.app/timeless-emblems',
      note: 'Legacy 1,000-roll Timeless sample published by Gains of Exile; current weights unverified. Ordinary emblems use 400 lifeforce (100 splinters × 4); Unrelenting emblems excluded.',
      weights: Object.fromEntries([['Eternal', 27.6], ['Karui', 28.7], ['Vaal', 22], ['Templar', 13.5], ['Maraketh', 8.2]].map(([family, weight]) => [`Timeless ${family === 'Eternal' && suffix === 'Splinter' ? 'Eternal Empire' : family} ${suffix}`, weight]))
    }));
    // Guardian sets have explicit membership; equal weights are disclosed as a scenario.
    for (const [key, name, colour, names] of [
      ['shaper', 'Shaper fragments', 'Wild', ['Fragment of the Hydra', 'Fragment of the Phoenix', 'Fragment of the Minotaur', 'Fragment of the Chimera']],
      ['elder', 'Elder fragments', 'Primal', ['Fragment of Purification', 'Fragment of Constriction', 'Fragment of Enslavement', 'Fragment of Eradication']],
      ['conqueror', 'Conqueror fragments', 'Vivid', ["Al-Hezmin's Crest", "Baran's Crest", "Drox's Crest", "Veritania's Crest"]]
    ]) models.push(pool({ key, name, cost: 500, lifeforce: `${colour} Crystallised Lifeforce`, date: 'Model', source,
      note: 'Equal-weight scenario within this four-fragment set; no measured current outcome sample.', weights: Object.fromEntries(names.map((x) => [x, 1])) }));
    return models;
  }

  function context(snapshot, league, overrides) {
    const ctx = C.context(snapshot, league, overrides);
    const original = ctx.quotes;
    ctx.quotes = (id, side) => original(id, side).map((q) => {
      const extra = D.supplements.find((x) => x.league === league && x.name === snapshot.items[id]?.name && x.currency === q.currency.key);
      if (!extra || q.automatic !== null || q.manual) return q;
      return { ...q, price: extra.price, automatic: extra.price, normalized: ctx.fx[q.currency.key] > 0 ? extra.price * ctx.fx[q.currency.key] : null, supplement: extra };
    });
    ctx.choose = (id, side, forced) => {
      const quotes = ctx.quotes(id, side).filter((q) => Number.isFinite(q.normalized));
      return forced ? quotes.find((q) => q.currency.key === forced) || null : quotes.sort((a, b) => side === 'buy' ? a.normalized - b.normalized : b.normalized - a.normalized)[0] || null;
    };
    return ctx;
  }

  // The sold input type cannot be returned. Retain the original probability mass of
  // unpriced outcomes: dropping it would silently inflate profitable-hit odds.
  function distribution(outcomes, excluded) {
    const blocked = new Set(excluded), eligible = outcomes.filter((x) => !blocked.has(x.id) && x.weight > 0);
    const total = eligible.reduce((sum, x) => sum + x.weight, 0);
    return total > 0 ? eligible.map((x) => ({ ...x, probability: x.weight / total })) : [];
  }

  function oneRoll(outcomes, excluded, cost) {
    const probabilities = distribution(outcomes, excluded);
    const coverage = probabilities.reduce((s, x) => s + (Number.isFinite(x.price) ? x.probability : 0), 0);
    const lowerRevenue = probabilities.reduce((s, x) => s + x.probability * (x.price ?? 0), 0);
    const complete = probabilities.length > 0 && Math.abs(coverage - 1) < 1e-9;
    return { probabilities, coverage, lowerRevenue, revenue: complete ? lowerRevenue : null,
      profit: complete && Number.isFinite(cost) ? lowerRevenue - cost : null,
      lowerProfit: Number.isFinite(cost) ? lowerRevenue - cost : null,
      winChance: Number.isFinite(cost) ? probabilities.reduce((s, x) => s + (Number.isFinite(x.price) && x.price > cost ? x.probability : 0), 0) : null };
  }

  // Bulk limit with three identical scarabs per turn-in. V_i is value per held
  // scarab, including the option to sell. Each reroll consumes THREE items, so
  // its continuation value is E[V_output]/3. Contraction <= 1/3 converges.
  function scarabPolicy(outcomes, allowSame = false) {
    if (outcomes.length < 2 || outcomes.some((x) => !Number.isFinite(x.price) || !(x.weight >= 0))) return null;
    const total = outcomes.reduce((s, x) => s + x.weight, 0);
    if (!(total > 0) || (!allowSame && outcomes.some((x) => x.weight >= total))) return null;
    let values = outcomes.map((x) => x.price);
    for (let step = 0; step < 100; step++) {
      const sum = outcomes.reduce((s, x, i) => s + x.weight * values[i], 0);
      const next = outcomes.map((x, i) => Math.max(x.price, (allowSame ? sum / total : (sum - x.weight * values[i]) / (total - x.weight)) / 3));
      const delta = Math.max(...next.map((x, i) => Math.abs(x - values[i])));
      values = next;
      if (delta < 1e-12) break;
    }
    const sum = outcomes.reduce((s, x, i) => s + x.weight * values[i], 0);
    return new Map(outcomes.map((x, i) => {
      const continuation = (allowSame ? sum / total : (sum - x.weight * values[i]) / (total - x.weight)) / 3;
      return [x.id, { value: values[i], continuation, keep: x.price >= continuation - 1e-12 }];
    }));
  }

  function evaluate(ctx, model) {
    const outcomes = model.outcomes.map((x) => {
      const forced = ctx.overrides.choices?.[`sell|${x.id}`];
      const quote = ctx.choose(x.id, 'sell', forced);
      return { ...x, quote, price: quote?.normalized ?? null };
    });
    const policy = model.quantity === 3 ? scarabPolicy(outcomes, model.allowSame) : null;
    const juice = model.lifeforceId ? ctx.choose(model.lifeforceId, 'buy', ctx.overrides.choices?.[`buy|${model.lifeforceId}`]) : null;
    return outcomes.map((input) => {
      const buy = ctx.choose(input.id, 'buy', ctx.overrides.choices?.[`buy|${input.id}`]);
      const cost = buy && (!model.lifeforceId || juice) ? model.quantity * buy.normalized + (model.cost ? model.cost * juice.normalized : 0) : null;
      const roll = oneRoll(outcomes, model.allowSame ? [] : [input.id], cost);
      const owned = policy?.get(input.id);
      const revenue = policy ? roll.probabilities.reduce((s, x) => s + x.probability * policy.get(x.id).value, 0) : roll.revenue;
      const profit = revenue !== null && cost !== null ? revenue - cost : null;
      const volume = buy?.volume === null || !buy ? null : Math.min(buy.volume / model.quantity, buy.currencyVolume / (model.quantity * buy.price));
      const canCompareHeld = input.price !== null && juice;
      const heldAction = canCompareHeld && roll.lowerRevenue - model.cost * juice.normalized > input.price ? 'Reroll' : canCompareHeld && roll.revenue !== null ? 'Keep' : 'Need prices';
      return { ...roll, input, model, buy, juice, cost, revenue, profit, volume, owned,
        returnPct: profit !== null && cost > 0 ? profit / cost * 100 : null,
        lowerReturnPct: roll.lowerProfit !== null && cost > 0 ? roll.lowerProfit / cost * 100 : null,
        action: owned ? owned.keep ? 'Keep' : '3-to-1' : model.quantity === 3 ? 'Need prices' : heldAction };
    });
  }

  function bands(row, chaosRate) {
    const limits = [...new Set([0, 5, 20, 100, 1 / chaosRate, Infinity])].sort((a, b) => a - b);
    return limits.slice(0, -1).map((lo, i) => ({ lo, hi: limits[i + 1],
      probability: row.probabilities.reduce((sum, x) => sum + (Number.isFinite(x.price) && x.price / chaosRate >= lo && x.price / chaosRate < limits[i + 1] ? x.probability : 0), 0) }));
  }
  function bulkInputs(rows) {
    // Past turnover screens out one-off cheap prints, without claiming live stock.
    return rows.filter((r) => r.buy && Number.isFinite(r.cost) && r.buy.volume !== null && r.buy.currencyVolume !== null
      && Math.min(r.buy.volume, r.buy.currencyVolume / r.buy.price) >= 1000)
      .sort((a, b) => a.cost - b.cost || b.buy.volume - a.buy.volume).slice(0, 3);
  }
  const api = { catalog, context, distribution, oneRoll, scarabPolicy, evaluate, bands, bulkInputs };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else global.PoeGambling = api;
})(typeof window !== 'undefined' ? window : globalThis);
