#!/usr/bin/env node
const assert = require('assert');
const bossData = require('../boss-data.json');

global.window = global;
require('../modules/trade.js');

const normalizeText = (value) => String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
const items = bossData.flatMap((boss) => boss.groups.flatMap((group) => group.items))
  .filter((item) => item.tradeUnidentified);

assert.equal(items.length, 4);
items.forEach((item) => {
  assert.equal(item.noPrice, true);
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
});

console.log('Forbidden Flame/Flesh trade links: OK');
