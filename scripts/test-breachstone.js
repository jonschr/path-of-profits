#!/usr/bin/env node
const assert = require('node:assert/strict');
const B = require('../modules/breachstone.js');
const { fetchQuote } = require('./update-breachstone-data.js');

async function main() {
  // Six independent queries: exact ilvl, instant buyout only, exact asking currency.
  for (const level of [65, 80]) for (const { key } of B.currencies) {
    const q = B.tradeQuery(level, key);
    assert.equal(q.query.status.option, 'securable');
    assert.deepEqual(q.query.filters.type_filters.filters.ilvl, { min: level, max: level });
    assert.equal(q.query.filters.trade_filters.filters.price.option, key);
    const calls = [];
    const quote = await fetchQuote(async (url, body) => {
      calls.push({ url, body });
      return body ? { id: 'query-id', total: 3, result: ['a', 'b', 'c'] } : { result: [
        { item: { ilvl: level, typeLine: 'Revelatory Wombgift' }, listing: { price: { amount: 5, currency: key } } },
        { item: { ilvl: level, typeLine: 'Revelatory Wombgift' }, listing: { price: { amount: 2, currency: key } } },
        { item: { ilvl: level === 65 ? 80 : 65, typeLine: 'Revelatory Wombgift' }, listing: { price: { amount: 0.1, currency: key } } }
      ] };
    }, 'Forbidden Rites', level, key);
    assert.deepEqual(calls[0].body, q);
    assert.match(calls[0].url, /search\/poe2\/Forbidden%20Rites$/);
    assert.match(calls[1].url, /fetch\/a,b,c\?query=query-id$/);
    assert.equal(quote.price, 2);
    assert.equal(quote.sampleCount, 2);
    assert.equal(quote.source, 'instant-buyout');
  }
  assert.deepEqual(B.summarizeListings([
    { item: { ilvl: 65, typeLine: 'Revelatory Wombgift' }, listing: { price: { amount: 1, currency: 'exalted' } } },
    { item: { ilvl: 65, typeLine: 'Lavish Wombgift' }, listing: { price: { amount: 1, currency: 'chaos' } } }
  ], 65, 'chaos'), { price: null, sampleCount: 0, cheapestCount: 0 });
  const empty = await fetchQuote(async () => ({ id: 'empty', total: 0, result: [] }), 'Standard', 65, 'chaos');
  assert.equal(empty.price, null);
  assert.equal(empty.total, 0);

  const league = 'Test';
  const C = Object.fromEntries(B.currencies.map((c) => [c.key, c.id]));
  const markets = [];
  const pair = (a, b, va, vb, l = league) => markets.push({ league: l, market_pair: [a, b], volume_traded: { [a]: va, [b]: vb } });
  pair(C.chaos, C.divine, 10, 1); // 0.1 div per chaos.
  pair(C.exalted, C.divine, 100, 1); // 0.01 div per exalt.
  pair(B.STONE, C.chaos, 10, 25); // 0.25 div per stone.
  pair(B.STONE, C.exalted, 10, 30); // 0.03 div per stone.
  pair(B.STONE, C.divine, 10, 30); // 3 div per stone: best sell currency.
  pair(B.SPLINTER, C.chaos, 3000, 100); // 1 div per 300.
  pair(B.SPLINTER, C.exalted, 3000, 200); // 0.2 div per 300: best buy currency.
  pair(B.SPLINTER, C.divine, 3000, 20); // 2 div per 300.
  pair(B.STONE, C.divine, 10, 1000, 'Other league');
  const snapshot = { markets };
  const quotes = { gifts: {
    65: { chaos: { price: 10 }, exalted: { price: 50 }, divine: { price: 2 } },
    80: { chaos: { price: 1 }, exalted: { price: 30 }, divine: { price: 1 } }
  } };
  for (const level of [65, 80]) for (const { key } of B.currencies) quotes.gifts[level][key].source = 'instant-buyout';
  const result = B.calculate(snapshot, league, quotes, 10000);
  const [gift65, gift80, splinters] = result.routes;
  assert.equal(gift65.best.buy, 'exalted');
  assert.equal(gift65.best.sell, 'divine');
  assert.equal(gift65.best.profit, 2.5);
  assert.equal(gift65.best.perBlood, 2.5 / 400);
  assert.equal(gift80.best.profit, 2.9);
  assert.equal(gift80.best.perBlood, 2.9 / 3400);
  assert.equal(splinters.best.buyPrice, 20);
  assert.equal(splinters.best.profit, 2.8);
  assert.equal(splinters.blood, 400);
  assert.equal(gift80.crafts, 2);
  assert.equal(gift80.bloodLeft, 3200);
  assert.equal(splinters.batchProfit, 70);
  assert.equal(result.winner.key, 'splinters'); // Smaller profit per craft can beat ilvl80 per blood.
  assert.equal(gift65.combinations.length, 9);
  const custom = { inputs: { gift65: { divine: 0.1 }, splinters: { exalted: 1000 } }, sales: { chaos: 40, divine: 0.5 } };
  const edited = B.calculate(snapshot, league, quotes, 0, custom);
  assert.equal(edited.routes[0].best.buy, 'divine');
  assert.equal(edited.routes[0].best.sell, 'chaos');
  assert.equal(edited.routes[0].best.profit, 3.9);
  assert.equal(edited.routes[0].best.per1000Blood, 3.9 / 400 * 1000);
  assert.equal(edited.routes[0].best.costPerBlood, 0.1 / 400);
  assert.equal(edited.routes[2].best.buy, 'chaos');
  assert(edited.routes.every((r) => r.combinations.filter((p) => p.sell === 'chaos').every((p) => p.sellPrice === 40)));
  assert.equal(edited.inputs.gift65.divine.automaticPrice, 2);
  assert.equal(edited.inputs.gift65.divine.manual, true);
  assert.equal(quotes.gifts[65].divine.price, 2); // Editing never changes the fetched quote.
  assert.equal(B.calculate(snapshot, league, quotes).routes[0].best.profit, 2.5); // Reset restores the source.
  const fillMissing = B.calculate(snapshot, league, null, 0, { inputs: { gift65: { divine: 1 } } });
  assert.equal(fillMissing.routes[0].best.profit, 2);
  const free = B.calculate(snapshot, league, quotes, 0, { inputs: { gift65: { divine: 0 } } });
  assert.equal(free.routes[0].best.profit, 3);
  assert.equal(free.routes[0].best.returnPct, null);
  const invalid = B.calculate(snapshot, league, quotes, 0, { sales: { divine: -1 }, inputs: { gift65: { exalted: Infinity } } });
  assert.equal(invalid.routes[0].best.profit, 2.5);
  const inPerson = JSON.parse(JSON.stringify(quotes));
  for (const level of [65, 80]) for (const { key } of B.currencies) inPerson.gifts[level][key].source = 'in-person';
  assert.equal(B.calculate(snapshot, league, inPerson).routes[0].best, null);
  assert.equal(B.calculate(snapshot, league, inPerson).routes[1].best, null);
  const missing = B.calculate(snapshot, league, null, 399);
  assert.equal(missing.routes[0].best, null);
  assert.equal(missing.batchWinner, null);
  assert.equal(missing.routes[2].crafts, 0);
  const zero = B.calculate(snapshot, league, quotes, 0);
  assert.equal(zero.routes[0].batchProfit, 0);
  const wrongLeague = B.calculate(snapshot, 'Absent', quotes);
  assert.equal(wrongLeague.winner, null);
  const noDivinePair = { markets: markets.filter((m) => !m.market_pair.includes(C.exalted) || !m.market_pair.includes(C.divine)) };
  assert(B.calculate(noDivinePair, league, quotes).routes.every((r) => r.combinations.every((p) => p.buy !== 'exalted' && p.sell !== 'exalted')));
  const loss = { markets: markets.map((m) => m.market_pair.includes(B.STONE)
    ? { ...m, volume_traded: Object.fromEntries(m.market_pair.map((id) => [id, id === B.STONE ? 100000 : 1])) } : m) };
  assert.equal(B.calculate(loss, league, quotes).winner, null);
  assert.equal(B.calculate(loss, league, quotes).batchWinner, null);
  console.log('Breachstone tests passed: instant-only queries, exact currency and ilvl, independent markets, three routes, missing data, losses, and blood efficiency.');
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
