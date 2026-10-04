(function (global) {
  'use strict';
  const currencies = [
    { key: 'chaos', name: 'Chaos', id: 'Metadata/Items/Currency/CurrencyRerollRare' },
    { key: 'exalted', name: 'Exalts', id: 'Metadata/Items/Currency/CurrencyAddModToRare' },
    { key: 'divine', name: 'Divines', id: 'Metadata/Items/Currency/CurrencyModValues' }
  ];
  const SPLINTER = 'Metadata/Items/Currency/CurrencyBreachShard';
  const STONE = 'Metadata/Items/MapFragments/CurrencyBreachFragment';
  const routes = [
    { key: 'gift65', name: 'Level 65 Wombgift', level: 65, blood: 400 },
    { key: 'gift80', name: 'Level 80 Wombgift', level: 80, blood: 3400 },
    { key: 'splinters', name: '300 Breach Splinters', level: 65, blood: 400 }
  ];

  function tradeQuery(level, currency) {
    if (![65, 80].includes(level) || !currencies.some((c) => c.key === currency)) throw new Error('Unsupported gift search.');
    return {
      query: {
        status: { option: 'securable' },
        type: 'Revelatory Wombgift',
        stats: [{ type: 'and', filters: [] }],
        filters: {
          type_filters: { filters: { ilvl: { min: level, max: level } } },
          trade_filters: { filters: { price: { option: currency } } }
        }
      },
      sort: { price: 'asc' }
    };
  }

  function tradeUrl(league, level, currency) {
    return `https://www.pathofexile.com/trade2/search/poe2/${encodeURIComponent(league)}?q=${encodeURIComponent(JSON.stringify(tradeQuery(level, currency)))}`;
  }

  // Only consume results from our instant-buyout search, and verify the exact currency and level.
  function summarizeListings(results, level, currency) {
    const valid = (results || []).filter((row) => row?.item?.ilvl === level
      && row.item.typeLine === 'Revelatory Wombgift'
      && row.listing?.price?.currency === currency
      && Number.isFinite(row.listing.price.amount) && row.listing.price.amount > 0);
    if (!valid.length) return { price: null, sampleCount: 0, cheapestCount: 0 };
    const price = Math.min(...valid.map((row) => row.listing.price.amount));
    return { price, sampleCount: valid.length, cheapestCount: valid.filter((row) => row.listing.price.amount === price).length };
  }

  function marketRate(snapshot, league, from, to) {
    const market = snapshot.markets.find((m) => m.league === league
      && m.market_pair?.includes(from) && m.market_pair?.includes(to));
    const paid = market?.volume_traded?.[from];
    const received = market?.volume_traded?.[to];
    if (!Number.isFinite(paid) || !Number.isFinite(received) || paid <= 0 || received <= 0) return null;
    return { rate: received / paid, paidVolume: paid, receivedVolume: received };
  }

  function calculate(snapshot, league, quotes, bloodBalance = 10000, overrides = {}) {
    const withOverride = (quote, price) => Number.isFinite(price) && price >= 0
      ? { ...quote, price, manual: true, automaticPrice: quote?.price ?? null } : quote;
    const divine = currencies.find((c) => c.key === 'divine').id;
    const fx = Object.fromEntries(currencies.map((c) => [c.key,
      c.id === divine ? 1 : marketRate(snapshot, league, c.id, divine)?.rate ?? null]));
    const sales = Object.fromEntries(currencies.map((c) => {
      const market = marketRate(snapshot, league, STONE, c.id);
      return [c.key, withOverride(market ? { price: market.rate, volume: market.paidVolume } : null, overrides.sales?.[c.key])];
    }));
    const inputs = Object.fromEntries(routes.map((route) => [route.key, Object.fromEntries(currencies.map((c) => {
      if (route.key !== 'splinters') {
        const quote = quotes?.gifts?.[route.level]?.[c.key];
        return [c.key, withOverride(quote?.source === 'instant-buyout' ? quote : null, overrides.inputs?.[route.key]?.[c.key])];
      }
      const market = marketRate(snapshot, league, SPLINTER, c.id);
      return [c.key, withOverride(market ? { price: market.rate * 300, volume: market.paidVolume, source: 'exchange' } : null, overrides.inputs?.[route.key]?.[c.key])];
    }))]));
    const balance = Number.isSafeInteger(bloodBalance) && bloodBalance >= 0 ? bloodBalance : 0;
    const calculated = routes.map((route) => {
      const combinations = [];
      for (const buy of currencies) {
        const input = inputs[route.key][buy.key];
        if (!input || !Number.isFinite(input.price) || input.price < 0 || !Number.isFinite(fx[buy.key])) continue;
        for (const sell of currencies) {
          const output = sales[sell.key];
          if (!output || !Number.isFinite(fx[sell.key])) continue;
          const cost = input.price * fx[buy.key];
          const revenue = output.price * fx[sell.key];
          const profit = revenue - cost;
          combinations.push({ buy: buy.key, sell: sell.key, buyPrice: input.price, sellPrice: output.price,
            cost, revenue, profit, perBlood: profit / route.blood, per1000Blood: profit / route.blood * 1000,
            costPerBlood: cost / route.blood, returnPct: cost > 0 ? profit / cost * 100 : null,
            volume: route.key === 'splinters' ? Math.min(input.volume / 300, output.volume) : output.volume,
            quoteError: input.error || null });
        }
      }
      combinations.sort((a, b) => b.profit - a.profit);
      const best = combinations[0] || null;
      const crafts = Math.floor(balance / route.blood);
      return { ...route, combinations, best, crafts, bloodUsed: crafts * route.blood,
        bloodLeft: balance - crafts * route.blood, batchProfit: best ? best.profit * crafts : null,
        batchCost: best ? best.cost * crafts : null };
    });
    // Negative margins never become a recommendation to craft.
    const winner = calculated.filter((r) => r.best?.profit > 0)
      .sort((a, b) => b.best.perBlood - a.best.perBlood)[0] || null;
    const batchWinner = calculated.filter((r) => r.crafts > 0 && r.batchProfit > 0)
      .sort((a, b) => b.batchProfit - a.batchProfit)[0] || null;
    return { fx, sales, inputs, routes: calculated, winner, batchWinner };
  }

  const api = { currencies, routes, SPLINTER, STONE, tradeQuery, tradeUrl, summarizeListings, marketRate, calculate };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else global.Breachstone = api;
})(typeof window !== 'undefined' ? window : globalThis);
