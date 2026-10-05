const assert = require('node:assert/strict');
const G = require('../modules/gambling');
const C = require('../modules/conversions');
const D = require('../modules/reroll-data');
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`);

// Excluding the input must renormalize the eligible pool, but never remove
// unpriced output probability. A lower bound is not a complete profit estimate.
const pool = [{ id: 'a', weight: 5, price: 1 }, { id: 'b', weight: 2, price: 12 }, { id: 'c', weight: 1, price: null }];
const partial = G.oneRoll(pool, ['a'], 3);
near(partial.coverage, 2 / 3);
near(partial.lowerRevenue, 8);
near(partial.lowerProfit, 5);
near(partial.winChance, 2 / 3);
assert.equal(partial.profit, null);
assert.equal(G.scarabPolicy(pool), null);
assert.deepEqual(G.distribution(pool, ['a', 'b']).map((x) => x.id), ['c']);
assert.equal(G.oneRoll(pool, ['a', 'b', 'c'], 3).profit, null);

// Two-outcome pool: vendoring three cheap items always gives the valuable one.
// Its continuation value per HELD input is one third of that output's value.
const two = G.scarabPolicy([{ id: 'cheap', weight: 1, price: 1 }, { id: 'valuable', weight: 1, price: 10 }]);
near(two.get('cheap').value, 10 / 3);
assert.equal(two.get('cheap').keep, false);
assert.equal(two.get('valuable').keep, true);
near(two.get('valuable').continuation, 10 / 9);

// Recycling has opportunity costs and consumes three outputs each time.
// For two cheap types and one 12-div keeper, Vcheap=(Vcheap+12)/6=2.4.
const three = [{ id: 'a', weight: 1, price: 1 }, { id: 'b', weight: 1, price: 2 }, { id: 'c', weight: 1, price: 12 }];
const policy = G.scarabPolicy(three);
near(policy.get('a').value, 2.4);
near(policy.get('b').value, 2.4);
assert.equal(policy.get('c').keep, true);
for (const x of three) {
  const next = G.distribution(three, [x.id]).reduce((s, y) => s + y.probability * policy.get(y.id).value, 0) / 3;
  near(policy.get(x.id).value, Math.max(x.price, next));
}
assert.ok(G.oneRoll(three, ['a'], 3).revenue < G.distribution(three, ['a']).reduce((s, x) => s + x.probability * policy.get(x.id).value, 0));

const snapshot = require('../data/currency-exchange.json');
const catalog = G.catalog(snapshot, 'harvest');
assert.equal(catalog.find((x) => x.key === 'delirium').outcomes.length, 15);
assert.equal(catalog.find((x) => x.key === 'deafening').outcomes.length, 20);
assert.equal(catalog.find((x) => x.key === 'shrieking').outcomes.length, 20);
assert.equal(catalog.find((x) => x.key === 'corrupted').outcomes.length, 4);
for (const x of catalog.find((x) => x.key === 'oil').outcomes) assert.ok(!/Tainted|Reflective|Prismatic/.test(snapshot.items[x.id].name));
for (const x of catalog.find((x) => x.key === 'delirium').outcomes) assert.ok(!/Foreboding|Obscured|^Delirium Orb$/.test(snapshot.items[x.id].name));
const ctx = G.context(snapshot, 'Allflame', {});
const deli = G.evaluate(ctx, catalog.find((x) => x.key === 'delirium'));
assert.ok(deli.some((x) => x.coverage < 1));
assert.ok(deli.every((x) => x.profit === null));
for (const row of deli) {
  near(row.probabilities.reduce((s, x) => s + x.probability, 0), 1);
  assert.ok(!row.probabilities.some((x) => x.id === row.input.id));
  if (row.buy) near(row.cost, row.buy.normalized + 30 * row.juice.normalized);
}
const filledPrices = Object.fromEntries(catalog.find((x) => x.key === 'delirium').outcomes.map((x) => [`sell|${x.id}|divine`, 1]));
const filled = G.evaluate(G.context(snapshot, 'Allflame', { prices: filledPrices }), catalog.find((x) => x.key === 'delirium'));
assert.ok(filled.every((x) => x.coverage > .999999));
assert.ok(filled.filter((x) => x.buy).every((x) => x.profit !== null));

const scarabs = G.catalog(snapshot, 'scarab')[0];
const rows = G.evaluate(ctx, scarabs);
assert.equal(rows.length, 115);
assert.ok(rows.every((x) => x.owned));
const bulk = G.bulkInputs(rows);
assert.equal(bulk.length, 3);
assert.ok(bulk.every((x) => Math.min(x.buy.volume, x.buy.currencyVolume / x.buy.price) >= 1000));
assert.ok(bulk.every((x, i) => i === 0 || bulk[i - 1].cost <= x.cost));
assert.equal(G.bulkInputs([{ cost: 1, buy: { volume: 2000, currencyVolume: 10, price: 1 } }]).length, 0);
for (const row of rows) {
  near(row.cost, 3 * row.buy.normalized);
  near(row.profit, row.revenue - row.cost);
  near(row.returnPct, row.profit / row.cost * 100);
  const sum = G.bands(row, ctx.fx.chaos).reduce((s, x) => s + x.probability, 0);
  near(sum, row.coverage);
}
const supplementId = scarabs.outcomes.find((x) => snapshot.items[x.id].name === D.supplements[0].name).id;
assert.ok(ctx.choose(supplementId, 'sell').supplement);
assert.equal(G.context(snapshot, 'Standard', {}).choose(supplementId, 'sell'), null);
const manual = G.context(snapshot, 'Allflame', { prices: { [`sell|${supplementId}|divine`]: 2 }, choices: { [`sell|${supplementId}`]: 'divine' } });
assert.equal(manual.choose(supplementId, 'sell', 'divine').price, 2);
assert.ok(G.evaluate(manual, scarabs).find((x) => x.input.id === supplementId).owned.keep);
// Supplementary quotes require a valid FX edge just like exchange quotes.
const noFx = G.context({ ...snapshot, markets: [] }, 'Allflame', {});
assert.equal(noFx.choose(supplementId, 'sell', 'chaos'), null);
for (const model of catalog) assert.ok(model.source.startsWith('https://'));
assert.equal(C.recipes(snapshot, 'harvest').length, 4);
console.log('Gambling math, missing-price mass, outcome pools, overrides, and currency normalization passed.');
