#!/usr/bin/env node
const fs = require('fs/promises');
const path = require('path');
const B = require('../modules/breachstone.js');
const ROOT = path.resolve(__dirname, '..');
const TARGET = path.join(ROOT, 'data', 'breachstone-prices-poe2.json');
const API = 'https://www.pathofexile.com/api/trade2';
const USER_AGENT = 'PathOfProfits/0.7.0 (contact: https://pathofprofits.com)';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function publicLeagues(snapshot) {
  return [...new Set(snapshot.markets.filter((m) => !m.league.includes('(PL')
    && m.market_pair?.some((id) => [B.SPLINTER, B.STONE].includes(id))).map((m) => m.league))];
}

function makeRequester(fetchImpl = fetch) {
  let nextRequestAt = 0;
  return async (url, body) => {
    await sleep(Math.max(0, nextRequestAt - Date.now()));
    nextRequestAt = Date.now() + 3000;
    const response = await fetchImpl(url, {
      ...(body ? { method: 'POST', body: JSON.stringify(body) } : {}),
      headers: { 'User-Agent': USER_AGENT, 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(20000)
    });
    // Observe the server's dynamic request limits for both search and fetch requests.
    for (const scope of (response.headers.get('x-rate-limit-rules') || '').split(',')) {
      const rules = (response.headers.get(`x-rate-limit-${scope.trim()}`) || '').split(',');
      const states = (response.headers.get(`x-rate-limit-${scope.trim()}-state`) || '').split(',');
      rules.forEach((rule, index) => {
        const [limit, seconds] = rule.split(':').map(Number);
        const [used, , penalty] = (states[index] || '').split(':').map(Number);
        if (limit > 0 && used >= limit - 1) nextRequestAt = Math.max(nextRequestAt, Date.now() + seconds * 1000 + 1000);
        if (penalty > 0) nextRequestAt = Math.max(nextRequestAt, Date.now() + penalty * 1000 + 1000);
      });
    }
    if (!response.ok) {
      const error = new Error(`Trade search returned HTTP ${response.status}.`);
      error.stopRefresh = [403, 429].includes(response.status);
      throw error;
    }
    return response.json();
  };
}

async function fetchQuote(request, league, level, currency) {
  const search = await request(`${API}/search/poe2/${encodeURIComponent(league)}`, B.tradeQuery(level, currency));
  if (!search.id || !Array.isArray(search.result) || !Number.isFinite(search.total)) throw new Error('Invalid trade search response.');
  const ids = search.result.slice(0, 10);
  let summary = { price: null, sampleCount: 0, cheapestCount: 0 };
  if (ids.length) {
    const listings = await request(`${API}/fetch/${ids.join(',')}?query=${encodeURIComponent(search.id)}`);
    if (!Array.isArray(listings.result)) throw new Error('Invalid trade listings response.');
    summary = B.summarizeListings(listings.result, level, currency);
    if (!summary.sampleCount) throw new Error('Listings disappeared or did not match the requested level and currency.');
  }
  return { ...summary, total: search.total, fetchedAt: new Date().toISOString(),
    searchUrl: `https://www.pathofexile.com/trade2/search/poe2/${encodeURIComponent(league)}/${encodeURIComponent(search.id)}`,
    source: 'instant-buyout' };
}

async function update({ league, request = makeRequester() } = {}) {
  const exchange = JSON.parse(await fs.readFile(path.join(ROOT, 'data', 'currency-exchange-poe2.json'), 'utf8'));
  const leagues = publicLeagues(exchange);
  if (league && !leagues.includes(league)) throw new Error('Choose a supported PoE2 exchange league.');
  let data = { game: 'poe2', leagues: {} };
  try { data = JSON.parse(await fs.readFile(TARGET, 'utf8')); } catch (_) {}
  if (data.game !== 'poe2' || !data.leagues || typeof data.leagues !== 'object') data = { game: 'poe2', leagues: {} };
  let stopError = null;
  for (const name of league ? [league] : leagues) {
    const entry = data.leagues[name] || { gifts: {} };
    for (const level of [65, 80]) {
      entry.gifts[level] ||= {};
      for (const { key } of B.currencies) {
        try {
          if (stopError) throw stopError;
          entry.gifts[level][key] = await fetchQuote(request, name, level, key);
          console.log(`${name} level ${level} ${key}: ${entry.gifts[level][key].price ?? 'no instant buyouts'} (${entry.gifts[level][key].total} listings)`);
        } catch (error) {
          if (error.stopRefresh) stopError = error;
          // Retain an older quote only with its original timestamp and an explicit refresh error.
          entry.gifts[level][key] = { ...entry.gifts[level][key],
            price: entry.gifts[level][key]?.price ?? null, source: 'instant-buyout', error: error.message,
            attemptedAt: new Date().toISOString() };
          console.warn(`${name} level ${level} ${key}: ${error.message}`);
        }
      }
    }
    entry.attemptedAt = new Date().toISOString();
    data.leagues[name] = entry;
  }
  data.fetchedAt = new Date().toISOString();
  await fs.mkdir(path.dirname(TARGET), { recursive: true });
  await fs.writeFile(`${TARGET}.tmp`, JSON.stringify(data));
  await fs.rename(`${TARGET}.tmp`, TARGET);
  return data;
}

if (require.main === module) {
  const league = process.argv.find((arg) => arg.startsWith('--league='))?.slice('--league='.length);
  update({ league }).catch((error) => { console.error(error.message); process.exitCode = 1; });
}
module.exports = { publicLeagues, makeRequester, fetchQuote, update };
