const assert = require('node:assert/strict');
const A = require('../modules/assembly');
const C = require('../modules/conversions');
const E = require('../modules/exchange');
const G = require('../modules/gambling');
const R = require('../modules/recycling-data');
const Risk = require('../modules/gambling-risk');
const { fetchQuote, fetchScan } = require('./update-flip-prices');
const near = (actual, expected, tolerance = 1e-9) => assert.ok(Math.abs(actual - expected) < tolerance, `${actual} != ${expected}`);

async function main() {
  // Every quote and linked search must select actual instant buyouts in its currency.
  for (const game of ['poe1', 'poe2']) for (const currency of C.currencies) {
    const info = { name: 'Kingmaker', kind: 'unique', game };
    const q = A.tradeQuery(info, currency.key);
    assert.equal(q.query.status.option, 'securable');
    assert.equal(q.query.name, 'Kingmaker');
    assert.equal(q.query.filters.trade_filters.filters.price.option, currency.key);
    assert.equal(q.query.filters.misc_filters.filters.corrupted.option, 'false');
    if (game === 'poe1') assert.equal(q.query.filters.misc_filters.filters.foulborn_item.option, 'false');
    assert.deepEqual(JSON.parse(new URL(A.tradeUrl(game, 'Test League', info, currency.key)).searchParams.get('q')), q);
  }
  assert.equal(A.tradeQuery({ name: 'Legacy of Lifesprig', kind: 'augment' }, 'chaos').query.type, 'Legacy of Lifesprig');
  assert.equal(A.tradeQuery({ name: "Berek's Grip", kind: 'unique', allowCorrupted: true }, 'chaos').query.filters.misc_filters.filters.corrupted, undefined);
  const info = { name: 'Kingmaker', kind: 'unique' };
  const listing = (amount, currency = 'divine', extra = {}) => ({ item: { name: 'Kingmaker', identified: true, ...extra }, listing: { price: { amount, currency } } });
  assert.equal(A.summarizeListings([listing(10), listing(8), listing(1, 'chaos'), listing(1, 'divine', { corrupted: true }), listing(1, 'divine', { foulborn: true }), listing(1, 'divine', { name: 'Other' })], info, 'divine').price, 8);
  assert.equal(A.summarizeListings([listing(0), listing(Infinity), null], info, 'divine').price, null);
  assert.ok(A.matches(listing(1, 'chaos', { name: "Berek's Grip", corrupted: true, foulborn: true }), { name: "Berek's Grip", kind: 'unique', allowCorrupted: true }, 'chaos'));

  const snapshot = { game: 'poe2', items: {
    'Metadata/Items/Currency/Aldur': { name: "Aldur's Legacy" },
    'Metadata/Items/Currency/Extraction': { name: 'Orb of Extraction' },
    'Metadata/Items/Currency/ExampleRune': { name: 'Example Rune' }
  }, markets: [] }, league = 'Test';
  const pair = (a, b, va, vb) => snapshot.markets.push({ league, market_pair: [a, b], volume_traded: { [a]: va, [b]: vb } });
  pair(E.CHAOS, E.DIVINE, 100, 1);
  pair(E.EXALT, E.DIVINE, 1000, 1);
  const legacy = A.catalog(snapshot, 'legacy');
  assert.equal(legacy.length, 63);
  assert.equal(new Set(legacy.map((r) => r.key)).size, 63);
  assert.ok(legacy.every((r) => r.inputs.length === 2 && snapshot.items[r.inputs[1].id].name === "Aldur's Legacy"));
  const uniques = A.catalog(snapshot, 'unique');
  assert.equal(uniques.length, 5);
  assert.equal(uniques.find((r) => snapshot.items[r.output.id].name === 'The Taming').inputs.length, 3);
  assert.equal(uniques.find((r) => snapshot.items[r.output.id].name === 'The Vinktar Square').inputs.length, 4);
  const recipe = legacy.find((r) => snapshot.items[r.output.id].name === 'Legacy of Lifesprig');
  const quotes = { items: { Lifesprig: { divine: { source: 'instant-buyout', price: 2 }, chaos: { source: 'instant-buyout', price: 100 } }, 'Legacy of Lifesprig': { divine: { source: 'instant-buyout', price: 5 } } } };
  const reagent = recipe.inputs[1].id;
  pair(reagent, E.CHAOS, 100, 2000); // 0.2 div reagent
  const ctx = A.context(snapshot, league, quotes, {}), row = C.evaluate(ctx, recipe);
  near(row.cost, 1.2);
  near(row.profit, 3.8);
  near(row.returnPct, 3.8 / 1.2 * 100);
  near(row.breakEven, 480);
  assert.equal(row.inputs[0].quote.currency.key, 'chaos');
  assert.equal(A.context(snapshot, league, { items: { Lifesprig: { divine: { source: 'unverified', price: 1 } } } }, {}).choose(recipe.inputs[0].id, 'buy'), null);
  const changed = A.context(snapshot, league, quotes, { prices: { [`buy|${reagent}|divine`]: 1 }, choices: { [recipe.key]: { [reagent]: 'divine' } } });
  near(C.evaluate(changed, recipe).profit, 3);
  assert.ok(changed.choose(reagent, 'buy', 'divine').manual);

  // Extraction returns currency augments only, and never socket-bound ones or gems.
  const orb = A.item(snapshot, 'Orb of Extraction', 'currency');
  const augment = A.item(snapshot, 'Example Rune', 'augment');
  pair(orb, E.CHAOS, 100, 1000); // 0.1 div
  pair(augment, E.CHAOS, 100, 3000); // 0.3 div
  const equipment = { socketedItems: [
    { baseType: 'Example Rune', frameType: 5, stackSize: 2 },
    { baseType: 'Bound Rune', frameType: 5, runeMods: ['[SocketBound|Socket-bound]'] },
    { baseType: 'Skill Gem', frameType: 4 },
    { baseType: 'Another Bound Rune', frameType: 5, properties: [{ name: 'Socket-bound' }] }
  ] };
  assert.deepEqual(A.recoverable(equipment).map((x) => x.name), ['Example Rune']);
  const gear = { id: 'gear', item: equipment, price: { amount: 10, currency: 'chaos' } };
  const extracted = A.extractionRows(A.context(snapshot, league, {}, {}), { listings: [gear, gear] }, orb);
  assert.equal(extracted.length, 1);
  near(extracted[0].cost, .2); // one orb for the whole item
  near(extracted[0].revenue, .6);
  near(extracted[0].profit, .4);
  near(extracted[0].maxBuy, 50);
  const unknown = { ...gear, item: { socketedItems: [{ frameType: 5, baseType: 'No price' }] } };
  assert.equal(A.extractionRows(ctx, { listings: [unknown] }, orb)[0].profit, null);
  const scan = A.scannerQuery('armour', 'chaos');
  assert.equal(scan.query.status.option, 'securable');
  assert.equal(scan.query.filters.equipment_filters.filters.total_augment_sockets.min, 1);

  // The updater preserves missing prices instead of inventing quotes, and strips account details.
  const calls = [];
  const request = async (url, query) => { calls.push({ url, query }); return query ? { id: 'query', result: ['gear'], total: 1 } : { result: [{ id: 'gear', ...listing(5), item: { name: 'Kingmaker', identified: true, ...equipment }, listing: { account: { name: 'Private' }, price: { amount: 5, currency: 'chaos' } } }] }; };
  const quote = await fetchQuote(request, 'poe1', league, info, 'chaos');
  assert.equal(quote.price, 5);
  assert.equal(quote.source, 'instant-buyout');
  const scanned = await fetchScan(request, league, 'armour', 'chaos');
  assert.equal(scanned.listings.length, 1);
  assert.equal(JSON.stringify(scanned).includes('Private'), false);
  assert.equal(calls[0].query.query.status.option, 'securable');
  const empty = await fetchQuote(async () => ({ id: 'empty', result: [], total: 0 }), 'poe2', league, info, 'divine');
  assert.equal(empty.price, null);
  await assert.rejects(fetchQuote(async () => { throw new Error('HTTP 429'); }, 'poe2', league, info, 'divine'), /429/);

  // Runegrafts and tattoos can return the input; scarab exclusion stays separate.
  assert.equal(R.length, 11);
  assert.equal(Object.values(R[0].weights).reduce((a, b) => a + b, 0), 10111);
  assert.equal(Object.keys(R[0].weights).length, 31);
  assert.ok(R.every((m) => m.allowSame));
  assert.ok(R.slice(1).every((m) => Object.keys(m.weights).length === 5));
  const outcomes = [{ id: 'cheap', weight: 1, price: 1 }, { id: 'valuable', weight: 1, price: 10 }];
  const policy = G.scarabPolicy(outcomes, true);
  near(policy.get('cheap').value, 2); // V = (V + 10) / 6
  assert.equal(policy.get('cheap').keep, false);
  assert.equal(policy.get('valuable').keep, true);
  assert.equal(G.distribution(outcomes, []).length, 2);

  // Rare-jackpot simulation agrees with the exact no-hit loss probability.
  const rare = [{ price: 0, probability: .999 }, { price: 10000, probability: .001 }];
  const risk = Risk.simulate(rare, 1);
  near(risk.batches[0].lossChance, .999 ** 100, .025);
  near(risk.batches[1].lossChance, .999 ** 1000, .025);
  near(risk.share, 1);
  near(risk.without, -1);
  assert.deepEqual(risk, Risk.simulate(rare, 1));
  assert.ok(Risk.simulate([{ price: 2, probability: 1 }], 1, [100, 1000], 10).batches.every((b) => b.lossChance === 0 && b.low === b.rolls && b.high === b.rolls));
  assert.ok(Risk.simulate([{ price: 0, probability: 1 }], 1, [100], 10).batches.every((b) => b.lossChance === 1));
  assert.equal(Risk.simulate([{ price: null, probability: 1 }], 1), null);
  assert.equal(Risk.simulate([{ price: 1, probability: .5 }], 1), null);
  assert.equal(Risk.simulate([{ price: 1, probability: -1 }, { price: 2, probability: 2 }], 1), null);
  console.log('New flip recipes, instant-buyout queries, extraction rules, recycling policies and jackpot risk passed.');
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
