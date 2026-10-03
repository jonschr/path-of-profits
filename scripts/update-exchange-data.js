#!/usr/bin/env node
const fs = require('fs/promises');
const path = require('path');
const { fetchLatestSnapshot, categoryForItem, categories, goldForItem } = require('../modules/exchange.js');

async function updateGame(game) {
  const poe2 = game === 'poe2';
  const endpoint = `https://web.poecdn.com/api/currency-exchange${poe2 ? '/poe2' : ''}`;
  const data = await fetchLatestSnapshot(endpoint, (url, options) => (
    fetch(url, { ...options, headers: { 'User-Agent': 'PathOfProfits/0.5.3 (contact: https://pathofprofits.com)' } })
  ));
  const target = path.join(__dirname, '..', 'data', poe2 ? 'currency-exchange-poe2.json' : 'currency-exchange.json');
  const itemSource = `https://repoe-fork.github.io/${poe2 ? 'poe2/' : ''}base_items.min.json`;
  let previousItems = {};
  try { previousItems = JSON.parse(await fs.readFile(target, 'utf8')).items || {}; } catch (_) {}
  let bases = {};
  try {
    const response = await fetch(itemSource, { signal: AbortSignal.timeout(20000) });
    if (!response.ok) throw new Error(`Item names returned ${response.status}`);
    bases = await response.json();
  } catch (error) {
    if (!Object.keys(previousItems).length) throw new Error(`${game}: ${error.message}; no saved item names available.`);
    console.warn(`${game} item names: ${error.message}; keeping previously saved names.`);
  }
  const items = {};
  for (const id of new Set(data.markets.flatMap((market) => market.market_pair))) {
    const base = bases[id];
    const previous = previousItems[id];
    const art = base?.visual_identity?.dds_file;
    items[id] = {
      name: base?.name || previous?.name || id.split('/').pop(),
      category: base ? categoryForItem(id, game, base) : previous?.category || categoryForItem(id, game),
      icon: art ? `${poe2 ? 'https://repoe-fork.github.io/poe2/' : 'https://web.poecdn.com/image/'}${art.replace(/\.dds$/i, '.png')}` : previous?.icon || '',
      gold: goldForItem(id, game)
    };
  }
  if (!poe2) {
    const pricesDir = path.join(__dirname, '..', 'data', 'poe-ninja', 'prices');
    const iconsByName = new Map();
    const categoriesByName = new Map();
    for (const league of await fs.readdir(pricesDir).catch(() => [])) {
      try {
        const prices = JSON.parse(await fs.readFile(path.join(pricesDir, league, 'compact.json'), 'utf8'));
        for (const item of prices.items || []) {
          if (item.name && item.icon) iconsByName.set(item.name, item.icon);
          if (item.name && categories[item.category]) categoriesByName.set(item.name, item.category);
        }
      } catch (_) {}
    }
    for (const item of Object.values(items)) {
      item.icon = iconsByName.get(item.name) || item.icon;
      if (item.category === 'currency') item.category = categoriesByName.get(item.name) || 'currency';
    }
  }
  data.game = game;
  data.realm = poe2 ? 'poe2' : 'pc';
  data.items = items;
  data.itemSource = itemSource;
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(`${target}.tmp`, JSON.stringify(data));
  await fs.rename(`${target}.tmp`, target);
  console.log(`${game} exchange: ${new Date(data.hour * 1000).toISOString()} (${data.markets.length} markets, ${Object.keys(items).length} items)`);
}

async function main() {
  const requested = process.argv.find((arg) => arg.startsWith('--game='))?.split('=')[1];
  if (requested && !['poe1', 'poe2'].includes(requested)) throw new Error('Use --game=poe1 or --game=poe2.');
  await Promise.all((requested ? [requested] : ['poe1', 'poe2']).map(updateGame));
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
