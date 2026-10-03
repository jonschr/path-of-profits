#!/usr/bin/env node
const assert = require('node:assert/strict');
const X = require('../modules/exchange.js');
const { CHAOS: c, EXALT: e, DIVINE: d } = X;
const market = (a, b, va, vb, league = 'Test') => ({ league, market_pair: [a, b], volume_traded: { [a]: va, [b]: vb } });

async function main() {
  const graph = X.buildGraph([
    market(c, e, 100, 50), market(e, d, 100, 1), market(d, c, 1, 250),
    market(c, e, 0, 20), market(c, 'unknown', 100, 50), market(c, d, 1, 999, 'Other'),
    market(c, e, NaN, 2)
  ], 'Test');
  const routes = X.findRoutes(graph, c, 1000);
  assert.equal(routes.length, 2);
  const forward = routes.find((r) => r.path[1] === e);
  assert.equal(forward.end, 1250);
  assert.equal(forward.profitDivine, 1);
  assert.equal(forward.returnPct, 25);
  assert.equal(forward.gold, 30000); // 500 exalts × 20 + 5 divines × 250 + 1250 chaos × 15.
  assert.ok(Math.abs(forward.perGold - 1 / 30000) < 1e-12);
  assert.equal(forward.hourlyVolume, 100);
  assert.equal(routes.find((r) => r.path[1] === d).end, 800);
  assert.equal(X.findRoutes(graph, c, 101).find((r) => r.path[1] === e).steps[1].receive, 0);
  assert.equal(X.findRoutes(graph, c, 0).length, 0);
  assert.equal(X.findRoutes(graph, c, 1.5).length, 0);
  const overridden = X.findRoutes(graph, c, 1000, { [e]: 1 }, { [X.rateKey(e, d)]: 0.012 }).find((r) => r.path[1] === e);
  assert.equal(overridden.end, 1500);
  assert.equal(overridden.gold, 24500);
  assert.equal(X.findRoutes(graph, c, 1000, {}, { [X.rateKey(e, d)]: 0 }).length, 1);

  const receiveEdit = X.quantityEdit(forward, 0, 'receive', 600);
  assert.deepEqual(receiveEdit, { key: X.rateKey(c, e), rate: 0.6 });
  assert.deepEqual(X.quantityEdit(forward, 1, 'pay', 600), receiveEdit);
  const resized = X.findRoutes(graph, c, 1000, {}, { [receiveEdit.key]: receiveEdit.rate }).find((r) => r.path[1] === e);
  assert.equal(resized.steps[1].pay, 600);
  assert.equal(resized.steps[1].receive, 6);
  assert.equal(resized.end, 1500);
  assert.deepEqual(X.quantityEdit(resized, 1, 'pay', null), { key: X.rateKey(c, e), rate: null });
  assert.deepEqual(X.quantityEdit(forward, 0, 'pay', 2000), { amount: 2000 });
  assert.equal(X.quantityEdit(forward, 0, 'receive', 1.5), null);
  assert.equal(X.quantityEdit(forward, 0, 'receive', -1), null);
  assert.equal(X.quantityEdit(forward, 3, 'pay', 1), null);

  const poe2Items = Object.fromEntries([c, e, d].map((id) => [id, {
    name: X.item(id).name, category: 'currency', gold: X.goldForItem(id, 'poe2')
  }]));
  const poe2Route = X.findRoutes(graph, c, 1000, {}, {}, poe2Items).find((r) => r.path[1] === e);
  assert.equal(poe2Route.gold, 264000); // 500 exalts × 120 + 5 divines × 800 + 1250 chaos × 160.
  assert.equal(poe2Route.profitDivine, forward.profitDivine);
  assert.equal(X.findRoutes(graph, c, 1000).find((r) => r.path[1] === e).gold, 30000);
  assert.equal(X.item(c, { [c]: { gold: null } }).gold, null); // Never inherit PoE1 fees for unknown PoE2 fees.
  assert.equal(X.item(c, { [c]: { name: 'Different game item', gold: 5 } }).name, 'Different game item');
  assert.equal(X.item(c, { [c]: { name: 'Different game item' } }).short, 'Different game item');
  assert.equal(X.goldForItem('Metadata/Items/Currency/CurrencyAddModToRare3', 'poe2'), null);
  const poe2CategoryCases = {
    'Metadata/Items/Currency/CurrencyGreaterEssenceLife': 'essence',
    'Metadata/Items/Currency/CurrencyPerfectEssenceFire': 'essence',
    'Metadata/Items/Currency/CurrencyBreachShard': 'fragment',
    'Metadata/Items/Currency/CurrencyCorruptedEssenceHorror': 'essence',
    'Metadata/Items/Currency/OmenOnChaosPrefix': 'omens',
    'Metadata/Items/Currency/CurrencyJewelQualityFire': 'catalyst',
    'Metadata/Items/Currency/EndgameDistilledEmotionTimeLost3': 'emotion',
    'Metadata/Items/SoulCores/RuneCold': 'rune',
    'Metadata/Items/SoulCores/SoulCoreDexterity': 'soul-core',
    'Metadata/Items/SoulCores/IdolPanther': 'idol',
    'Metadata/Items/SoulCores/TalismanWolf': 'talisman',
    'Metadata/Items/Gems/SkillGemUncut20': 'uncut-gem',
    'Metadata/Items/Gem/SupportGemBreachlordsRift': 'lineage-gem',
    'Metadata/Items/Currency/AbyssalBenchTicketArmour': 'bones',
    'Metadata/Items/Currency/CurrencyVerisiumAlloy12': 'expedition',
    'Metadata/Items/Currency/CurrencyIncursionExtractAllSocketablesCurrency': 'incursion'
  };
  for (const [id, category] of Object.entries(poe2CategoryCases)) assert.equal(X.categoryForItem(id, 'poe2'), category);
  assert.equal(X.categoryForItem('Metadata/Items/Currency/Ritual/RitualPinnacleKey', 'poe2', { item_class: 'PinnacleKeyStackable' }), 'fragment');
  assert.equal(X.categoryForItem('Metadata/Items/Currency/CurrencyVerisiumOreUniqueStolvarheim', 'poe2', { item_class: 'IncubatorStackable' }), 'incubator');

  const scarab = 'Metadata/Items/Scarabs/ScarabBeyond1';
  const items = { [scarab]: { name: 'Beyond Scarab', icon: 'https://example.test/scarab.png' }, [c]: { name: 'Chaos Orb', icon: 'https://example.test/chaos.png' } };
  const itemGraph = X.buildGraph([market(c, scarab, 10000, 5000), market(scarab, d, 5000, 50), market(d, c, 50, 12500)], 'Test');
  const itemRoute = X.findRoutes(itemGraph, c, 1000, {}, {}, items).find((r) => r.path[1] === scarab);
  assert.equal(itemRoute.profitDivine, 1);
  assert.equal(itemRoute.gold, null);
  assert.equal(itemRoute.perGold, null); // Missing fees must not inflate gold efficiency.
  assert.equal(itemRoute.volumeSupported, true); // Exactly 10× coverage qualifies on every leg.
  assert.ok(itemRoute.steps.every(X.supportsVolume));
  const downstreamGraph = X.buildGraph([market(c, scarab, 10000, 5000), market(scarab, d, 5000, 50), market(d, c, 49, 12250)], 'Test');
  const downstreamRoute = X.findRoutes(downstreamGraph, c, 1000, {}, {}, items).find((r) => r.path[1] === scarab);
  assert.deepEqual(downstreamRoute.steps.map(X.supportsVolume), [true, true, false]);
  assert.equal(downstreamRoute.volumeSupported, false); // The last trade also needs 10× coverage.
  const receiptOverride = X.findRoutes(itemGraph, c, 1000, {}, { [X.rateKey(d, c)]: 300 }, items).find((r) => r.path[1] === scarab);
  assert.ok(receiptOverride.steps.every((step) => step.pay * 10 <= step.volume));
  assert.equal(receiptOverride.volumeSupported, false); // Edited receipts must fit the traded volume too.
  assert.equal(X.findRoutes(itemGraph, c, 1000, {}, {}, poe2Items).find((r) => r.path[1] === scarab).volumeSupported, true);
  assert.equal(X.item(scarab, items).name, 'Beyond Scarab');
  assert.equal(X.item(scarab, items).icon, items[scarab].icon);
  assert.equal(X.item(c, items).icon, items[c].icon);
  assert.equal(X.item(scarab, items).category, 'scarab');
  assert.equal(X.categoryForItem('Metadata/Items/Currency/CurrencyEssenceSpite4'), 'essence');
  assert.equal(X.categoryForItem('Metadata/Items/MapFragments/CurrencyUberBossKeyCortex'), 'fragment');
  assert.equal(X.categoryForItem('Metadata/Items/DivinationCards/DivinationCardDeck'), 'currency');
  assert.deepEqual(X.routeCategories(itemRoute, items), ['scarab']); // Currency payment legs do not match every category.
  assert.deepEqual(X.routeCategories(forward), ['currency']);
  assert.equal(X.findRoutes(itemGraph, c, 1000, { [scarab]: 75 }, {}, items).find((r) => r.path[1] === scarab).gold, 57500);
  assert.equal(X.findRoutes(itemGraph, c, 1001, {}, {}, items).find((r) => r.path[1] === scarab).volumeSupported, false);
  assert.equal(X.findRoutes(itemGraph, c, 1, {}, {}, items).find((r) => r.path[1] === scarab).volumeSupported, false);
  assert.equal(X.findRoutes(itemGraph, scarab, 500, { [scarab]: 75 }, {}, items).length, 2);

  const portal = 'Metadata/Items/Currency/CurrencyPortal';
  const thinGraph = X.buildGraph([market(d, c, 3051, 1160809), market(c, portal, 208, 8859), market(portal, d, 6216, 2)], 'Test');
  const thinRoute = X.findRoutes(thinGraph, d, 1).find((r) => r.path[1] === c);
  assert.ok(thinRoute.profit > 0);
  assert.equal(thinRoute.volumeSupported, false); // Divine → Chaos → Portal needs more volume than traded.

  const calls = [];
  const hour = 1791050400;
  const snapshot = await X.fetchLatestSnapshot('https://example.test/exchange', async (url) => {
    calls.push(url);
    return { ok: true, json: async () => calls.length === 1
      ? { markets: [], next_change_id: hour }
      : { markets: [market(c, d, 100, 1)], next_change_id: hour } };
  }, (hour + X.HOUR + 100) * 1000);
  assert.equal(snapshot.hour, hour - X.HOUR);
  assert.deepEqual(calls, [`https://example.test/exchange/${hour}`, `https://example.test/exchange/${hour - X.HOUR}`]);
  await assert.rejects(X.fetchLatestSnapshot('https://example.test/exchange', async () => ({ ok: false, status: 503 })), /503/);
  console.log('Exchange checks passed: all item types, missing fees, 10× volume coverage, independent pairs, rounding, divines per gold, overrides, and hour fallback.');
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
