const assert = require('node:assert/strict');
const C = require('../modules/conversions.js');
const E = require('../modules/exchange.js');
for (const game of ['poe1', 'poe2']) for (const c of C.currencies) {
  const url = new URL(C.tradeUrl(game, 'A league', 'Essence of Haste', c.key));
  const query = JSON.parse(url.searchParams.get('q'));
  assert.equal(query.query.status.option, 'securable');
  assert.equal(query.query.filters.trade_filters.filters.price.option, c.key);
  assert.equal(query.query.type, 'Essence of Haste');
  assert.equal(query.sort.price, 'asc');
  assert.match(url.pathname, game === 'poe1' ? /^\/trade\/search\// : /^\/trade2\/search\/poe2\//);
}
const league = 'Test';
const A = 'Metadata/Items/Currency/TestLesser', B = 'Metadata/Items/Currency/TestRegular', D = 'Metadata/Items/Currency/TestGreater';
const snapshot = { game: 'poe2', items: {
  [A]: { name: 'Lesser Essence of Haste', category: 'essence', gold: 10 },
  [B]: { name: 'Essence of Haste', category: 'essence', gold: 20 },
  [D]: { name: 'Greater Essence of Haste', category: 'essence', gold: 30 },
  [E.DIVINE]: { name: 'Divine Orb', category: 'currency', gold: 800 }
}, markets: [] };
function pair(a, b, va, vb, targetLeague = league) {
  snapshot.markets.push({ league: targetLeague, market_pair: [a, b], volume_traded: { [a]: va, [b]: vb } });
}
pair(E.CHAOS, E.DIVINE, 100, 1);
pair(E.EXALT, E.DIVINE, 1000, 1);
pair(A, E.CHAOS, 1000, 1000); // 0.01 div each
pair(A, E.EXALT, 1000, 5000); // 0.005 div each: cheapest
pair(B, E.DIVINE, 100, 10);
pair(D, E.CHAOS, 100, 3000); // 0.3 div each
pair(D, E.DIVINE, 100, 40); // 0.4 div each: highest sale
pair(D, E.DIVINE, 100, 900, 'Wrong league');
const recipes = C.recipes(snapshot);
assert.equal(recipes.length, 3);
const chain = recipes.find((r) => r.inputs[0].quantity === 9);
assert.equal(chain.steps, 4);
const row = C.evaluate(C.context(snapshot, league), chain);
assert.equal(row.inputs[0].quote.currency.key, 'exalted');
assert.equal(row.output.quote.currency.key, 'divine');
assert.equal(row.cost, 0.045);
assert.equal(row.revenue, 0.4);
assert.ok(Math.abs(row.profit - 0.355) < 1e-10);
assert.equal(row.volume, 100);
assert.ok(Math.abs(row.breakEven - 0.4 / 9 / 0.001) < 1e-10);
const forced = { choices: { [chain.key]: { [A]: 'chaos', sell: 'chaos' } } };
const selected = C.evaluate(C.context(snapshot, league, forced), chain);
assert.equal(selected.cost, 0.09);
assert.equal(selected.revenue, 0.3);
assert.equal(selected.manual, true);
const edited = C.context(snapshot, league, { prices: { [`buy|${A}|exalted`]: 1 } });
assert.ok(Math.abs(C.evaluate(edited, chain).cost - 0.009) < 1e-10);
assert.equal(C.evaluate(edited, recipes.find((r) => r.inputs[0].id === A && r.output.id === B)).cost, 0.003);
const highAsk = C.evaluate(C.context(snapshot, league, { prices: { [`buy|${A}|exalted`]: 1000 }, choices: { [chain.key]: { [A]: 'exalted' } } }), chain);
assert.ok(Math.abs(highAsk.volume - 5000 / 9000) < 1e-10);
assert.equal(C.evaluate(C.context(snapshot, 'No trades'), chain).profit, null);
assert.equal(C.evaluate(C.context(snapshot, league, { choices: { [chain.key]: { sell: 'exalted' } } }), chain).profit, null);

const p1 = require('../data/currency-exchange.json');
const p2 = require('../data/currency-exchange-poe2.json');
const harvest = C.recipes(p1, 'harvest');
assert.equal(harvest.length, 4);
assert.ok(harvest.every((r) => r.inputs[1].quantity === 800 && p1.items[r.inputs[1].id].name === 'Vivid Crystallised Lifeforce'));
const hc = C.context(p1, 'Allflame');
for (const recipe of harvest) {
  const r = C.evaluate(hc, recipe);
  assert.ok(r.complete);
  assert.equal(r.cost, r.inputs.reduce((sum, x) => sum + x.quantity * x.quote.normalized, 0));
  assert.ok(Math.abs(r.breakEven * hc.fx[r.inputs[0].quote.currency.key] + 800 * r.inputs[1].quote.normalized - r.revenue) < 1e-10);
}
for (const s of [p1, p2]) {
  const r = C.recipes(s);
  assert.equal(new Set(r.map((x) => x.key)).size, r.length);
  assert.ok(r.every((x) => [...x.inputs, x.output].every((part) => Number.isSafeInteger(part.quantity) && part.quantity > 0)));
  assert.ok(r.filter((x) => x.category !== 'cards').every((x) => [...x.inputs, x.output].every((p) => !/Perfect|Tainted|Reflective|Prismatic|Ancient|Potent/.test(s.items[p.id].name))));
}
const cards = C.recipes(p1).filter((r) => r.category === 'cards');
assert.equal(cards.length, 6);
assert.equal(cards.find((r) => p1.items[r.inputs[0].id].name === 'The Fortunate').output.quantity, 2);
console.log('Conversion calculations passed: currency optimization, chains, shared edits, volume, missing quotes, Harvest, and recipe exclusions.');
