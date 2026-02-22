(function initPoeLeaguesModule(global) {
  'use strict';

  const ASSUMED_LEAGUE_END_OVERRIDES = new Map([
    ['phrecia 2.0', '2026-04-23T21:00:00Z'],
    ['hardcore phrecia 2.0', '2026-04-23T21:00:00Z']
  ]);

  function createLeagueService({
    state,
    leagueSelectEl,
    defaultLeague = '',
    leagueStorageKey = 'poeBossLeague',
    usingStaticData,
    getStaticLeaguesUrl,
    watchApiBase,
    normalizeLeagueKey,
    withCacheBust,
    parseTimestamp,
    parseLeagueDate,
    repository = null,
    leagueCacheTtlMs = 6 * 60 * 60 * 1000,
    fetchImpl = global.fetch.bind(global),
    getLocalStorage = () => global.localStorage,
    consoleImpl = global.console
  }) {
    let leagues = [];
    const repo = repository
      || (global.PoeRepositories ? global.PoeRepositories.createLeaguesRepository() : null);

    function normalizeLeagueCompare(value) {
      const normalized = typeof normalizeLeagueKey === 'function'
        ? normalizeLeagueKey(value)
        : value;
      return String(normalized || '').trim().toLowerCase();
    }

    function isQuotaExceeded(err) {
      return err?.name === 'QuotaExceededError' || err?.code === 22 || err?.code === 1014;
    }

    function persistLeagueSelection(leagueId) {
      if (!leagueId) return;
      try {
        getLocalStorage().setItem(leagueStorageKey, leagueId);
        return;
      } catch (err) {
        if (!isQuotaExceeded(err)) return;
      }
      try {
        getLocalStorage().removeItem('poeBossPriceCacheV1');
      } catch (_removeErr) {
        // Ignore follow-up storage failures.
      }
      try {
        getLocalStorage().setItem(leagueStorageKey, leagueId);
      } catch (_retryErr) {
        // Ignore if storage is still unavailable.
      }
    }

    function flattenLeagues(groups = leagues) {
      return (groups || []).flatMap((group) => (Array.isArray(group.options) ? group.options : []));
    }

    function findLeagueByKey(key) {
      const normalized = normalizeLeagueCompare(key);
      if (!normalized) return null;
      return (
        flattenLeagues().find((option) => {
          return [option.id, option.watch, option.text].some(
            (value) => normalizeLeagueCompare(value) === normalized
          );
        }) || null
      );
    }

    function applyLeagueSelection(preferred, { persist = false, allowFallback = true } = {}) {
      const match = findLeagueByKey(preferred);
      const fallbackValue = allowFallback ? (leagueSelectEl?.options?.[0]?.value || '') : '';
      const nextId = match?.id || fallbackValue || '';
      const changed = nextId !== state.leagueId;
      state.leagueId = nextId;
      if (leagueSelectEl && nextId) leagueSelectEl.value = nextId;
      state.leagueText = nextId ? leagueTextFor(state.leagueId) : '';
      state.leagueWatchId = nextId ? leagueWatchFor(state.leagueId) : '';
      if (persist) persistLeagueSelection(state.leagueId);
      return changed;
    }

    function buildLeagueSelect() {
      if (!leagueSelectEl) return;
      leagueSelectEl.innerHTML = '';
      leagues.forEach((groupDef) => {
        const group = document.createElement('optgroup');
        group.label = groupDef.label;
        groupDef.options.forEach((league) => {
          const option = document.createElement('option');
          option.value = league.id;
          option.textContent = league.text;
          option.dataset.watch = league.watch || league.id;
          group.appendChild(option);
        });
        leagueSelectEl.appendChild(group);
      });
    }

    function leagueTextFor(id) {
      const match = findLeagueByKey(id);
      return match ? match.text : id;
    }

    function leagueWatchFor(id) {
      const match = findLeagueByKey(id);
      return match ? match.watch || match.id || match.text : id;
    }

    function loadLeagueCache() {
      if (!repo) return null;
      return repo.loadCachedApiLeagues(leagueCacheTtlMs);
    }

    function saveLeagueCache(data) {
      if (!repo) return;
      repo.saveCachedApiLeagues(data);
    }

    function getAssumedLeagueEndDate(leagueName) {
      const key = normalizeLeagueCompare(leagueName);
      if (!key) return null;
      const assumed = ASSUMED_LEAGUE_END_OVERRIDES.get(key);
      return parseLeagueDate(assumed);
    }

    function normalizeLeagueEntry(entry) {
      if (!entry) return null;
      if (typeof entry === 'string') {
        const name = entry.trim();
        return name ? { id: name, text: name, watch: name } : null;
      }
      const name = entry.name || entry.league || entry.id || entry.slug || entry.code || entry.short;
      const display = entry.displayName || entry.display || entry.text || entry.label || entry.name || name;
      const watch = String(name || display || '').trim();
      if (!watch) return null;
      const startDate = parseLeagueDate(entry.start_date || entry.startDate || entry.start);
      let endDate = parseLeagueDate(entry.end_date || entry.endDate || entry.end);
      const assumedEndDate = getAssumedLeagueEndDate(watch);
      if (assumedEndDate && (!endDate || assumedEndDate.getTime() > endDate.getTime())) {
        endDate = assumedEndDate;
      }
      const now = Date.now();
      let active = entry.active ?? entry.isActive ?? entry.enabled ?? entry.current;
      if (active == null && endDate) {
        active = endDate.getTime() >= now;
      }
      return {
        id: watch,
        text: String(display || watch),
        watch,
        active,
        upcoming: entry.upcoming ?? entry.isUpcoming,
        event: entry.event ?? entry.isEvent,
        hardcore: entry.hardcore ?? entry.isHardcore,
        startDate,
        endDate
      };
    }

    function shouldIgnoreLeague(option) {
      const raw = String(option?.text || option?.id || option?.watch || '');
      const normalized = raw.toLowerCase();
      if (normalized.includes('ruthless')) return true;
      if (normalized.includes('hardcore') && normalized.includes('phrecia')) return true;
      if (normalized.includes('solo self-found') || /\bssf\b/.test(normalized)) return true;
      return false;
    }

    function normalizeLeagueGroups(data) {
      const raw = Array.isArray(data)
        ? data
        : (Array.isArray(data?.leagues)
            ? data.leagues
            : (Array.isArray(data?.items)
                ? data.items
                : (Array.isArray(data?.result)
                    ? data.result
                    : (Array.isArray(data?.data) ? data.data : null))));
      if (!raw || !raw.length) return null;
      const seen = new Set();
      const options = raw.map(normalizeLeagueEntry).filter((option) => {
        if (!option) return false;
        const key = normalizeLeagueCompare(option.watch || option.id || option.text);
        if (!key || seen.has(key)) return false;
        seen.add(key);
        if (option.active === false) return false;
        if (shouldIgnoreLeague(option)) return false;
        return true;
      });
      if (!options.length) return null;
      options.sort((a, b) => {
        const aStart = a.startDate ? a.startDate.getTime() : 0;
        const bStart = b.startDate ? b.startDate.getTime() : 0;
        if (aStart !== bStart) return bStart - aStart;
        return String(a.text || a.id).localeCompare(String(b.text || b.id));
      });
      return [{ label: 'Leagues', options }];
    }

    function buildWatchLeagueEndpoints(base) {
      const root = String(base || '').replace(/\/$/, '');
      if (!root) return [];
      return [`${root}/leagues`];
    }

    async function loadLeagues(forceRefresh = false) {
      if (usingStaticData()) {
        try {
          const url = withCacheBust(getStaticLeaguesUrl(), forceRefresh);
          const response = repo
            ? await repo.fetchStaticLeagues(url, { forceRefresh })
            : await (async () => {
              const resp = await fetchImpl(url, { cache: forceRefresh ? 'no-store' : 'default' });
              if (!resp.ok) throw new Error(String(resp.status));
              return { data: await resp.json(), response: resp };
            })();
          const data = response.data;
          const raw = data?.leagues ?? data?.items ?? data?.data ?? data;
          const groups = normalizeLeagueGroups(raw);
          if (!groups) throw new Error('empty');
          leagues = groups;
          state.leagueSource = 'static';
          state.leagueUpdatedAt = parseTimestamp(data?.generatedAt || data?.updatedAt || data?.fetchedAt);
          buildLeagueSelect();
          applyLeagueSelection(state.leagueId || defaultLeague, { persist: true, allowFallback: false });
          return true;
        } catch (err) {
          state.leagueSource = 'static';
          state.leagueUpdatedAt = null;
          if (state.debug) consoleImpl.warn?.('Static league load failed', err);
          return false;
        }
      }

      if (global.location?.protocol === 'file:') return false;
      const cached = loadLeagueCache();
      if (cached?.data) {
        const cachedGroups = normalizeLeagueGroups(cached.data);
        if (cachedGroups?.length) {
          leagues = cachedGroups;
          state.leagueSource = 'cache';
          state.leagueUpdatedAt = cached.fetchedAt ? parseTimestamp(cached.fetchedAt) : null;
          buildLeagueSelect();
          applyLeagueSelection(state.leagueId || defaultLeague, { persist: true, allowFallback: false });
          return true;
        }
      }

      const endpoints = buildWatchLeagueEndpoints(watchApiBase);
      for (const url of endpoints) {
        try {
          const response = repo
            ? await repo.fetchWatchLeagues(url, { forceRefresh })
            : await (async () => {
              const resp = await fetchImpl(url, forceRefresh ? { cache: 'no-store' } : {});
              if (!resp.ok) throw new Error(String(resp.status));
              return { data: await resp.json(), response: resp };
            })();
          const data = response.data;
          const groups = normalizeLeagueGroups(data);
          if (!groups) throw new Error('empty');
          leagues = groups;
          saveLeagueCache(data);
          state.leagueSource = 'api';
          state.leagueUpdatedAt = new Date();
          buildLeagueSelect();
          applyLeagueSelection(state.leagueId || defaultLeague, { persist: true, allowFallback: false });
          return true;
        } catch (err) {
          // Try next endpoint.
        }
      }
      state.leagueSource = 'fallback';
      state.leagueUpdatedAt = null;
      return false;
    }

    function isDisfavoredLeague(option) {
      const raw = String(option?.text || option?.id || option?.watch || '');
      const normalized = raw.toLowerCase();
      return normalized.includes('hardcore') || /solo self[- ]found/.test(normalized);
    }

    function selectMostRecentLeague() {
      const options = flattenLeagues();
      if (!options.length) return false;
      const maxStart = options.reduce((best, option) => {
        const start = option.startDate ? option.startDate.getTime() : 0;
        return Math.max(best, start);
      }, 0);
      const candidates = options.filter((option) => {
        const start = option.startDate ? option.startDate.getTime() : 0;
        return start === maxStart;
      });
      const preferred = candidates.find((option) => !isDisfavoredLeague(option));
      const pick = preferred || candidates[0] || options[0];
      return applyLeagueSelection(pick.id, { persist: true });
    }

    return Object.freeze({
      normalizeLeagueCompare,
      getLeagues: () => leagues,
      flattenLeagues,
      findLeagueByKey,
      applyLeagueSelection,
      buildLeagueSelect,
      leagueTextFor,
      leagueWatchFor,
      loadLeagues,
      selectMostRecentLeague
    });
  }

  global.PoeLeagues = Object.freeze({
    createLeagueService
  });
})(window);
