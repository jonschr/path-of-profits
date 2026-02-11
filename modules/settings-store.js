(function initPoeSettingsModule(global) {
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

  function createSettingsStore({
    storageKey = 'poeAppSettingsV1',
    defaults = {},
    legacyReaders = {},
    storage = global.localStorage
  } = {}) {
    const listeners = new Set();

    function readPersisted() {
      const raw = storage.getItem(storageKey);
      return safeParse(raw) || {};
    }

    function resolveInitialState() {
      const persisted = readPersisted();
      const base = { ...defaults };
      const keys = new Set([
        ...Object.keys(defaults || {}),
        ...Object.keys(persisted || {}),
        ...Object.keys(legacyReaders || {})
      ]);
      keys.forEach((key) => {
        if (persisted[key] !== undefined) {
          base[key] = persisted[key];
          return;
        }
        const reader = legacyReaders[key];
        if (typeof reader !== 'function') return;
        try {
          const legacyValue = reader();
          if (legacyValue !== undefined && legacyValue !== null && legacyValue !== '') {
            base[key] = legacyValue;
          }
        } catch (_err) {
          // Ignore legacy read errors.
        }
      });
      return base;
    }

    let state = resolveInitialState();

    function persist() {
      storage.setItem(storageKey, JSON.stringify(state));
    }

    function notify() {
      const snapshot = { ...state };
      listeners.forEach((listener) => {
        try {
          listener(snapshot);
        } catch (_err) {
          // Listener failures should not break settings updates.
        }
      });
    }

    function set(input, value) {
      if (typeof input === 'string') {
        state = { ...state, [input]: value };
      } else if (input && typeof input === 'object') {
        state = { ...state, ...input };
      } else {
        return { ...state };
      }
      persist();
      notify();
      return { ...state };
    }

    function replace(nextState) {
      if (!nextState || typeof nextState !== 'object') return { ...state };
      state = { ...nextState };
      persist();
      notify();
      return { ...state };
    }

    function get(key) {
      if (!key) return { ...state };
      return state[key];
    }

    function subscribe(listener) {
      if (typeof listener !== 'function') return () => {};
      listeners.add(listener);
      return () => listeners.delete(listener);
    }

    return Object.freeze({
      get,
      getState: () => ({ ...state }),
      set,
      replace,
      subscribe
    });
  }

  global.PoeSettings = Object.freeze({
    createSettingsStore
  });
})(window);
