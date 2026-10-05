#!/usr/bin/env node
const fs = require('node:fs/promises');
const path = require('node:path');
const A = require('../modules/assembly');
const C = require('../modules/conversions');
const { makeRequester } = require('./update-breachstone-data');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const run = promisify(execFile);
const ROOT = path.resolve(__dirname, '..');
const TARGET = path.join(ROOT, 'data', 'flip-prices.json');
const api = (game) => `https://www.pathofexile.com/api/${game === 'poe2' ? 'trade2' : 'trade'}`;
const searchPath = (game, league) => `${game === 'poe2' ? 'poe2/' : ''}${encodeURIComponent(league)}`;
const searchUrl = (game, league, id) => `https://www.pathofexile.com/${game === 'poe2' ? 'trade2' : 'trade'}/search/${searchPath(game, league)}/${encodeURIComponent(id)}`;

// Use the system's network transport; no browser cookies or credentials are copied.
async function curlFetch(url, options) {
  const args = ['--silent', '--show-error', '--include', '--max-time', '20'];
  for (const [key, value] of Object.entries(options.headers || {})) args.push('--header', `${key}: ${value}`);
  if (options.body) args.push('--request', 'POST', '--data', options.body);
  args.push(url);
  let { stdout } = await run('curl', args, { maxBuffer: 10 * 1024 * 1024 });
  let status, headers;
  do {
    const end = stdout.indexOf('\r\n\r\n');
    if (end < 0) throw new Error('Invalid trade HTTP response.');
    const lines = stdout.slice(0, end).split('\r\n');
    status = Number(lines.shift().split(' ')[1]);
    headers = Object.fromEntries(lines.filter((x) => x.includes(':')).map((line) => { const i = line.indexOf(':'); return [line.slice(0, i).toLowerCase(), line.slice(i + 1).trim()]; }));
    stdout = stdout.slice(end + 4);
  } while (stdout.startsWith('HTTP/'));
  return new Response(stdout, { status, headers });
}

async function fetchQuote(request, game, league, info, currency) {
  const search = await request(`${api(game)}/search/${searchPath(game, league)}`, A.tradeQuery({ ...info, game }, currency));
  if (!search.id || !Array.isArray(search.result) || !Number.isFinite(search.total)) throw new Error('Invalid trade search response.');
  let summary = { price: null, sampleCount: 0, icon: null };
  if (search.result.length) {
    const listings = await request(`${api(game)}/fetch/${search.result.slice(0, 10).join(',')}?query=${encodeURIComponent(search.id)}`);
    if (!Array.isArray(listings.result)) throw new Error('Invalid fetched listings.');
    summary = A.summarizeListings(listings.result, info, currency);
    if (!summary.sampleCount) throw new Error('Listings disappeared or did not match the recipe.');
  }
  return { ...summary, total: search.total, fetchedAt: new Date().toISOString(), source: 'instant-buyout', searchUrl: searchUrl(game, league, search.id) };
}

async function fetchScan(request, league, category, currency) {
  const query = A.scannerQuery(category, currency);
  const search = await request(`${api('poe2')}/search/poe2/${encodeURIComponent(league)}`, query);
  if (!search.id || !Array.isArray(search.result) || !Number.isFinite(search.total)) throw new Error('Invalid equipment search.');
  const listings = [], ids = search.result.slice(0, 100);
  for (let i = 0; i < ids.length; i += 10) {
    const response = await request(`${api('poe2')}/fetch/${ids.slice(i, i + 10).join(',')}?query=${encodeURIComponent(search.id)}`);
    if (!Array.isArray(response.result)) throw new Error('Invalid equipment listings.');
    for (const row of response.result) {
      if (!row?.item || !C.currencies.some((c) => c.key === row.listing?.price?.currency) || row.listing.price.currency !== currency
        || !(row.listing.price.amount > 0) || !A.recoverable(row.item).length) continue;
      const fields = ['name', 'typeLine', 'baseType', 'icon', 'socketedItems'];
      listings.push({ id: row.id, item: Object.fromEntries(fields.filter((f) => row.item[f] !== undefined).map((f) => [f, row.item[f]])),
        price: { amount: row.listing.price.amount, currency }, source: 'instant-buyout',
        searchUrl: searchUrl('poe2', league, search.id), fetchedAt: new Date().toISOString() });
    }
  }
  return { category, currency, total: search.total, checked: ids.length, listings, fetchedAt: new Date().toISOString(), searchUrl: searchUrl('poe2', league, search.id) };
}

async function update({ game, league, limit = Infinity, scanOnly = false, request = makeRequester(curlFetch) } = {}) {
  if (game && !['poe1', 'poe2'].includes(game)) throw new Error('Unsupported game.');
  let data = { games: {} };
  try { data = JSON.parse(await fs.readFile(TARGET, 'utf8')); } catch (_) {}
  if (!data.games || typeof data.games !== 'object') throw new Error('Invalid saved flip prices.');
  const write = async () => { data.attemptedAt = new Date().toISOString(); await fs.writeFile(`${TARGET}.tmp`, JSON.stringify(data)); await fs.rename(`${TARGET}.tmp`, TARGET); };
  let stop = null;
  for (const gameName of game ? [game] : ['poe1', 'poe2']) {
    const snapshot = JSON.parse(await fs.readFile(path.join(ROOT, 'data', `currency-exchange${gameName === 'poe2' ? '-poe2' : ''}.json`), 'utf8'));
    const count = new Map();
    for (const market of snapshot.markets) if (!market.league.includes('(PL') && !/ruthless/i.test(market.league)) count.set(market.league, (count.get(market.league) || 0) + 1);
    if (league && !count.has(league)) throw new Error(`Unsupported ${gameName} league.`);
    // Trade searches are expensive: refresh the active market and Standard, not every private/hardcore league.
    const leagues = league ? [league] : [...new Set([[...count].sort((a, b) => b[1] - a[1])[0]?.[0], 'Standard'])].filter((x) => count.has(x));
    const catalog = A.catalog(snapshot, gameName === 'poe1' ? 'unique' : 'legacy');
    const ids = [...new Set(catalog.flatMap((r) => [...r.inputs.map((x) => x.id), r.output.id]))].filter((id) => /^(unique|augment):/.test(id)).slice(0, limit);
    const gameData = data.games[gameName] ||= { leagues: {} };
    for (const name of leagues) {
      const entry = gameData.leagues[name] ||= { items: {}, scans: { scopes: [], listings: [] } };
      if (!scanOnly) for (const id of ids) {
        const info = snapshot.items[id];
        entry.items[info.name] ||= {};
        for (const currency of C.currencies) {
          try {
            if (stop) throw stop;
            entry.items[info.name][currency.key] = await fetchQuote(request, gameName, name, info, currency.key);
          } catch (error) {
            if (error.stopRefresh) stop = error;
            entry.items[info.name][currency.key] = { ...entry.items[info.name][currency.key], price: entry.items[info.name][currency.key]?.price ?? null,
              source: 'instant-buyout', error: error.message, attemptedAt: new Date().toISOString() };
          }
        }
        await write();
        console.log(`${gameName} ${name}: ${info.name} · ${Object.values(entry.items[info.name]).filter((x) => x.price !== null).length}/3 quotes`);
      }
      if (gameName === 'poe2') {
        const scopes = [];
        for (const category of ['armour', 'weapon']) for (const currency of C.currencies) {
          try {
            if (stop) throw stop;
            scopes.push(await fetchScan(request, name, category, currency.key));
          } catch (error) {
            if (error.stopRefresh) stop = error;
            const old = entry.scans?.scopes?.find((s) => s.category === category && s.currency === currency.key);
            scopes.push({ ...old, category, currency: currency.key, listings: old?.listings || [], error: error.message, attemptedAt: new Date().toISOString() });
          }
        }
        entry.scans = { scopes, listings: scopes.flatMap((s) => s.listings), attemptedAt: new Date().toISOString() };
      }
      entry.attemptedAt = new Date().toISOString(); await write();
    }
  }
  return data;
}
if (require.main === module) {
  const option = (key) => process.argv.find((x) => x.startsWith(`--${key}=`))?.slice(key.length + 3);
  update({ game: option('game'), league: option('league'), limit: option('limit') ? Number(option('limit')) : Infinity,
    scanOnly: process.argv.includes('--scan-only') }).catch((error) => { console.error(error.message); process.exitCode = 1; });
}
module.exports = { update, fetchQuote, fetchScan };
