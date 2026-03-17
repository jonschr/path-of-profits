(function initPoeRepositoriesModule(global) {
  'use strict';

  const Http = global.PoeHttp || null;
  const Cache = global.PoeCache || null;

  function buildFallbackHttp(fetchImpl = global.fetch.bind(global)) {
    return {
      async getJson(url, options = {}) {
        const response = await fetchImpl(url, options);
        if (!response.ok) {
          const error = new Error(String(response.status));
          error.status = response.status;
          error.url = url;
          error.response = response;
          throw error;
        }
        const data = await response.json();
        return { data, response };
      }
    };
  }

  function isFresh(timestamp, maxAgeMs) {
    if (!Number.isFinite(timestamp) || timestamp <= 0) return false;
    if (!Number.isFinite(maxAgeMs) || maxAgeMs <= 0) return true;
    return Date.now() - timestamp <= maxAgeMs;
  }

  function createLeaguesRepository({
    httpClient = Http ? Http.createHttpClient() : buildFallbackHttp(),
    cacheStore = Cache ? Cache.createStorageCache({ storageKey: 'poeBossLeagueCacheV2' }) : null
  } = {}) {
    async function fetchStaticLeagues(url, { forceRefresh = false } = {}) {
      return httpClient.getJson(url, { cache: forceRefresh ? 'no-store' : 'default' });
    }

    async function fetchApiLeagues(url, { forceRefresh = false } = {}) {
      const options = forceRefresh ? { cache: 'no-store' } : {};
      return httpClient.getJson(url, options);
    }

    function loadCachedApiLeagues(maxAgeMs) {
      if (!cacheStore) return null;
      const entry = cacheStore.get('api');
      if (!entry || !isFresh(Number(entry.fetchedAt), maxAgeMs)) return null;
      return entry;
    }

    function saveCachedApiLeagues(data) {
      if (!cacheStore) return;
      cacheStore.set('api', { fetchedAt: Date.now(), data });
    }

    return Object.freeze({
      fetchStaticLeagues,
      fetchApiLeagues,
      loadCachedApiLeagues,
      saveCachedApiLeagues
    });
  }

  function createPricingRepository({
    httpClient = Http ? Http.createHttpClient() : buildFallbackHttp(),
    cacheStore = Cache ? Cache.createStorageCache({ storageKey: 'poeBossPriceCacheV1' }) : null
  } = {}) {
    async function fetchJson(url, { forceRefresh = false, cacheMode } = {}) {
      const options = {};
      if (cacheMode) {
        options.cache = cacheMode;
      } else if (forceRefresh) {
        options.cache = 'no-store';
      }
      return httpClient.getJson(url, options);
    }

    function loadFreshPriceCache(leagueCandidates, maxAgeMs) {
      if (!cacheStore || !Array.isArray(leagueCandidates) || !leagueCandidates.length) return null;
      const all = cacheStore.readAll();
      for (const leagueValue of leagueCandidates) {
        const entry = all[leagueValue];
        if (!entry || !Array.isArray(entry.items) || !isFresh(Number(entry.fetchedAt), maxAgeMs)) continue;
        return { leagueValue, entry };
      }
      return null;
    }

    function savePriceCacheEntry(leagueValue, items, updatedAt) {
      if (!cacheStore || !leagueValue || !Array.isArray(items)) return;
      const entry = {
        fetchedAt: Date.now(),
        updatedAt: updatedAt ? updatedAt.toISOString() : null,
        items
      };
      cacheStore.writeAll({ [leagueValue]: entry });
    }

    return Object.freeze({
      fetchJson,
      loadFreshPriceCache,
      savePriceCacheEntry
    });
  }

  global.PoeRepositories = Object.freeze({
    createLeaguesRepository,
    createPricingRepository
  });
})(window);
