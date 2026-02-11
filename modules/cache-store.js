(function initPoeCacheModule(global) {
  'use strict';

  function safeParse(json) {
    if (!json) return null;
    try {
      const parsed = JSON.parse(json);
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch (_err) {
      return null;
    }
  }

  function createStorageCache({
    storageKey,
    storage = global.localStorage
  } = {}) {
    if (!storageKey) throw new Error('createStorageCache requires a storageKey');

    function readAll() {
      const raw = storage.getItem(storageKey);
      return safeParse(raw) || {};
    }

    function writeAll(next) {
      const payload = next && typeof next === 'object' ? next : {};
      try {
        storage.setItem(storageKey, JSON.stringify(payload));
      } catch (err) {
        if (err?.name === 'QuotaExceededError') {
          try {
            storage.removeItem(storageKey);
          } catch (_removeErr) {
            // Ignore follow-up storage failures.
          }
        } else {
          throw err;
        }
      }
      return payload;
    }

    function get(key) {
      const all = readAll();
      return all[key];
    }

    function set(key, value) {
      const all = readAll();
      all[key] = value;
      writeAll(all);
      return value;
    }

    function remove(key) {
      const all = readAll();
      delete all[key];
      writeAll(all);
    }

    function clear() {
      writeAll({});
    }

    return Object.freeze({
      readAll,
      writeAll,
      get,
      set,
      remove,
      clear
    });
  }

  global.PoeCache = Object.freeze({
    createStorageCache
  });
})(window);
