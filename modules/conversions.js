(function (global) {
  'use strict';
  const E = typeof module !== 'undefined' && module.exports ? require('./exchange.js') : global.PoeExchange;
  const currencies = [
    { id: E.DIVINE, key: 'divine', name: 'Divines', unit: 'div' },
    { id: E.CHAOS, key: 'chaos', name: 'Chaos', unit: 'chaos' },
    { id: E.EXALT, key: 'exalted', name: 'Exalts', unit: 'ex' }
  ];
  const sources = {
    poe1: 'https://poedb.tw/us/Vendor_recipe_system',
    poe2: 'https://poe2db.tw/us/Reforging_Bench',
    harvest: 'https://poedb.tw/us/Horticrafting'
  };
  const essenceTiers = ['Whispering', 'Muttering', 'Weeping', 'Wailing', 'Screaming', 'Shrieking', 'Deafening'];
  const oils = ['Clear', 'Sepia', 'Amber', 'Verdant', 'Teal', 'Azure', 'Indigo', 'Violet', 'Crimson', 'Black', 'Opalescent', 'Silver', 'Golden'];
  const emotions = ['Diluted Liquid Ire', 'Diluted Liquid Guilt', 'Diluted Liquid Greed', 'Liquid Paranoia', 'Liquid Envy', 'Liquid Disgust', 'Liquid Despair', 'Concentrated Liquid Fear', 'Concentrated Liquid Suffering', 'Concentrated Liquid Isolation'];

  function tradeUrl(game, league, itemName, currency) {
    if (!['poe1', 'poe2'].includes(game) || !currencies.some((c) => c.key === currency)) throw new Error('Unsupported trade search.');
    const query = { query: { status: { option: 'securable' }, type: itemName,
      stats: [{ type: 'and', filters: [] }], filters: { trade_filters: { filters: { price: { option: currency } } } } }, sort: { price: 'asc' } };
    const base = game === 'poe2' ? 'trade2/search/poe2' : 'trade/search';
    return `https://www.pathofexile.com/${base}/${encodeURIComponent(league)}?q=${encodeURIComponent(JSON.stringify(query))}`;
  }

  function recipes(snapshot, mode = 'upgrades') {
    const items = snapshot.items || {};
    const byName = new Map(Object.entries(items).map(([id, item]) => [item.name, id]));
    const result = [];
    const add = (category, inputName, quantity, outputName, outputQuantity = 1, steps = 1, extra = []) => {
      const input = byName.get(inputName), output = byName.get(outputName);
      if (!input || !output || extra.some((x) => !byName.has(x.name))) return;
      result.push({ key: `${category}:${input}:${quantity}:${output}`, category,
        inputs: [{ id: input, quantity }, ...extra.map((x) => ({ id: byName.get(x.name), quantity: x.quantity }))],
        output: { id: output, quantity: outputQuantity }, steps,
        source: category === 'harvest' ? sources.harvest : category === 'cards' ? `https://poedb.tw/us/${inputName.replaceAll(' ', '_').replaceAll("'", '')}` : sources[snapshot.game] });
    };
    if (mode === 'harvest') {
      if (snapshot.game !== 'poe1') return result;
      for (const [a, b] of [['Fragment of Shape', 'Fragment of Knowledge'], ['Fragment of Terror', 'Fragment of Emptiness']]) {
        for (const [from, to] of [[a, b], [b, a]]) add('harvest', from, 1, to, 1, 1, [{ name: 'Vivid Crystallised Lifeforce', quantity: 800 }]);
      }
      return result;
    }
    const chains = new Map();
    const chain = (category, family, names) => chains.set(`${category}:${family}`, { category, names });
    for (const item of Object.values(items)) {
      let match;
      if (snapshot.game === 'poe1' && item.category === 'essence' && (match = item.name.match(/^(Whispering|Muttering|Weeping|Wailing|Screaming|Shrieking|Deafening) Essence of (.+)$/))) {
        chain('essence', match[2], essenceTiers.map((tier) => `${tier} Essence of ${match[2]}`));
      }
      if (snapshot.game === 'poe2' && item.category === 'essence' && (match = item.name.match(/^(?:(Lesser|Greater) )?(Essence of .+)$/))) {
        chain('essence', match[2], [`Lesser ${match[2]}`, match[2], `Greater ${match[2]}`]);
      }
      // Only ordinary runes with both verified upgrade endpoints; never Perfect or special runes.
      if (snapshot.game === 'poe2' && item.category === 'rune' && (match = item.name.match(/^Lesser (.+ Rune)$/)) && byName.has(`Greater ${match[1]}`) && byName.has(match[1])) {
        chain('rune', match[1], [`Lesser ${match[1]}`, match[1], `Greater ${match[1]}`]);
      }
    }
    if (snapshot.game === 'poe1') chain('oil', 'oils', oils.map((x) => `${x} Oil`));
    if (snapshot.game === 'poe2') chain('emotion', 'emotions', emotions);
    for (const { category, names } of chains.values()) {
      for (let i = 0; i < names.length - 1; i++) for (let j = i + 1; j < names.length; j++) {
        const quantity = 3 ** (j - i);
        add(category, names[i], quantity, names[j], 1, (quantity - 1) / 2);
      }
    }
    if (snapshot.game === 'poe1') {
      add('cards', 'The Patient', 8, 'The Nurse');
      add('cards', 'The Nurse', 8, 'The Doctor');
      add('cards', 'The Patient', 64, 'The Doctor', 1, 9);
      add('cards', 'The Fortunate', 12, 'Divine Orb', 2);
      add('cards', 'The Sephirot', 11, 'Divine Orb', 10);
      add('cards', "Brother's Gift", 1, 'Divine Orb', 5);
    }
    return result;
  }

  function context(snapshot, league, overrides = {}) {
    const graph = E.buildGraph(snapshot.markets, league);
    const fx = Object.fromEntries(currencies.map((c) => [c.key, c.id === E.DIVINE ? 1 : graph.get(c.id)?.get(E.DIVINE)?.rate ?? null]));
    function quotes(id, side) {
      return currencies.map((currency) => {
        const edge = graph.get(id)?.get(currency.id);
        const automatic = id === currency.id ? 1 : edge?.rate ?? null;
        const edited = overrides.prices?.[`${side}|${id}|${currency.key}`];
        const manual = Number.isFinite(edited) && edited > 0 && id !== currency.id;
        const price = manual ? edited : automatic;
        const normalized = price !== null && fx[currency.key] > 0 ? price * fx[currency.key] : null;
        return { id, side, currency, price, automatic, manual, normalized,
          volume: id === currency.id ? Infinity : edge?.volume ?? null,
          currencyVolume: id === currency.id ? Infinity : edge ? Number(edge.market.volume_traded[currency.id]) : null,
          identity: id === currency.id };
      });
    }
    function choose(id, side, forced) {
      const available = quotes(id, side).filter((q) => Number.isFinite(q.normalized));
      if (forced) return available.find((q) => q.currency.key === forced) || null;
      return available.sort((a, b) => side === 'buy' ? a.normalized - b.normalized : b.normalized - a.normalized)[0] || null;
    }
    return { snapshot, league, graph, fx, quotes, choose, overrides };
  }

  function evaluate(ctx, recipe) {
    const choice = ctx.overrides.choices?.[recipe.key] || {};
    const inputs = recipe.inputs.map((input) => ({ ...input, quote: ctx.choose(input.id, 'buy', choice[input.id]) }));
    const output = { ...recipe.output, quote: ctx.choose(recipe.output.id, 'sell', choice.sell) };
    const complete = inputs.every((x) => x.quote) && !!output.quote;
    const cost = complete ? inputs.reduce((sum, x) => sum + x.quantity * x.quote.normalized, 0) : null;
    const revenue = complete ? output.quantity * output.quote.normalized : null;
    const difference = complete ? revenue - cost : null;
    const profit = difference !== null && Math.abs(difference) < 1e-10 ? 0 : difference;
    const capacities = [...inputs, output].map((x) => {
      if (!x.quote) return null;
      if (x.quote.volume === null || x.quote.currencyVolume === null) return null;
      // A custom asking price cannot claim more capacity than the observed currency turnover supports.
      return Math.min(x.quote.volume / x.quantity, x.quote.currencyVolume / (x.quantity * x.quote.price));
    });
    const volume = complete && capacities.every((v) => v !== null) ? Math.min(...capacities) : null;
    const manual = [...inputs, output].some((x) => x.quote?.manual) || Object.keys(choice).length > 0;
    const otherCost = complete ? cost - inputs[0].quantity * inputs[0].quote.normalized : null;
    const breakEven = complete ? (revenue - otherCost) / (inputs[0].quantity * ctx.fx[inputs[0].quote.currency.key]) : null;
    const receiveFees = [...inputs.map((x) => ({ ...x, id: x.id, quantity: x.quantity, identity: x.quote?.identity })),
      { id: output.quote?.currency.id, quantity: output.quantity * (output.quote?.price ?? 0), identity: output.quote?.identity }];
    const fees = receiveFees.map((x) => x.identity ? 0 : !x.id ? null : E.item(x.id, ctx.snapshot.items).gold ?? E.goldForItem(x.id, ctx.snapshot.game));
    const gold = complete && fees.every((fee) => fee !== null) ? receiveFees.reduce((sum, x, i) => sum + Math.ceil(x.quantity * fees[i]), 0) : null;
    return { ...recipe, inputs, output, complete, cost, revenue, profit, volume, manual, breakEven, gold,
      returnPct: complete && cost > 0 ? profit / cost * 100 : null };
  }

  const api = { currencies, sources, recipes, context, evaluate, tradeUrl };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else global.PoeConversions = api;
})(typeof window !== 'undefined' ? window : globalThis);
