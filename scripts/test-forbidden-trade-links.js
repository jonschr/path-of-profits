#!/usr/bin/env node
const assert = require('assert');
const bossData = require('../boss-data.json');
const {
  buildForbiddenTradeQuery,
  getForbiddenTradeItems,
  summarizeTradePrices
} = require('./update-data-ninja.js');

global.window = global;
require('../modules/trade.js');

const normalizeText = (value) => String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
const items = bossData.flatMap((boss) => boss.groups.flatMap((group) => group.items))
  .filter((item) => /^Forbidden (Flame|Flesh)$/.test(item.tradeName || ''));

assert.equal(items.length, 4);
items.forEach((item) => {
  const seed = PoeTrade.tradeSeedForItem({
    item,
    normalizeText,
    tradeLinkSeeds: {},
    uniqueDropNameKeys: new Set()
  });
  const query = JSON.parse(seed.q).query;
  assert.equal(query.status.option, 'available');
  assert.equal(query.name, item.tradeName);
  assert.equal(query.type, undefined);
  assert.equal(query.filters.misc_filters.filters.identified.option, 'false');
  assert.deepEqual(query.filters.misc_filters.filters.ilvl, {
    ...(item.tradeIlvlMin == null ? {} : { min: item.tradeIlvlMin }),
    ...(item.tradeIlvlMax == null ? {} : { max: item.tradeIlvlMax })
  });
  const pricingQuery = buildForbiddenTradeQuery(item).query;
  assert.equal(pricingQuery.status.option, 'securable');
  assert.equal(pricingQuery.name, item.tradeName);
  assert.equal(pricingQuery.filters.misc_filters.filters.identified.option, 'false');
  assert.deepEqual(pricingQuery.filters.misc_filters.filters.ilvl, {
    ...(item.tradeIlvlMin == null ? {} : { min: item.tradeIlvlMin }),
    ...(item.tradeIlvlMax == null ? {} : { max: item.tradeIlvlMax })
  });
});

assert.equal(getForbiddenTradeItems(bossData).length, 4);
assert.deepEqual(summarizeTradePrices([
  { listing: { price: { amount: 2000, currency: 'chaos' } } },
  { listing: { price: { amount: 10, currency: 'divine' } } }
], 210), { mean: 2050, count: 2 });

const lightOfMeaning = bossData.flatMap((boss) => boss.groups.flatMap((group) => group.items))
  .find((item) => item.name === 'The Light of Meaning');
const lightQuery = JSON.parse(PoeTrade.tradeSeedForItem({
  item: lightOfMeaning,
  normalizeText,
  tradeLinkSeeds: {},
  uniqueDropNameKeys: new Set()
}).q).query;
assert.equal(lightQuery.name, 'The Light of Meaning');
assert.equal(lightQuery.status.option, 'available');
assert.equal(lightQuery.filters.misc_filters.filters.identified.option, 'false');

console.log('Unidentified jewel trade links/pricing: OK');
