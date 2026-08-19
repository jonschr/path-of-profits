(function initPoeTradeModule(global) {
  'use strict';

  const NON_UNIQUE_TRADE_TYPES = new Set([
    'Currency',
    'Fragment',
    'Invitation',
    'Invitations',
    'DivinationCard',
    'Map',
    'UniqueMap',
    'Beast'
  ]);

  function buildNinjaTradeSeedByName(name) {
    return {
      mode: 'search',
      q: JSON.stringify({
        query: {
          filters: {
            type_filters: { filters: {} },
            misc_filters: {
              filters: {
                foulborn_item: { option: 'false' }
              }
            }
          },
          status: { option: 'available' },
          name: String(name || '')
        }
      })
    };
  }

  function buildDivinationCardTradeSeedByName(name) {
    return {
      mode: 'search',
      q: JSON.stringify({
        query: {
          status: { option: 'online' },
          type: String(name || ''),
          stats: [{ type: 'and', filters: [] }]
        },
        sort: { price: 'asc' }
      })
    };
  }

  function sanitizeTradeName(name) {
    return String(name || '')
      .replace(/\s*\([^)]*\)\s*/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function buildTypedTradeSeedByName(name, item = {}) {
    const sanitized = sanitizeTradeName(name);
    if (!sanitized) return null;
    const miscFilters = {};
    if (item.tradeUnidentified) miscFilters.identified = { option: 'false' };
    const ilvl = {};
    if (item.tradeIlvlMin != null && Number.isFinite(Number(item.tradeIlvlMin))) ilvl.min = Number(item.tradeIlvlMin);
    if (item.tradeIlvlMax != null && Number.isFinite(Number(item.tradeIlvlMax))) ilvl.max = Number(item.tradeIlvlMax);
    if (Object.keys(ilvl).length) miscFilters.ilvl = ilvl;
    const filters = Object.keys(miscFilters).length
      ? { misc_filters: { filters: miscFilters } }
      : undefined;
    return {
      mode: 'search',
      q: JSON.stringify({
        query: {
          status: { option: item.tradeUnidentified ? 'available' : 'online' },
          ...(item.tradeUnidentified ? { name: sanitized } : { type: sanitized }),
          stats: [{ type: 'and', filters: [] }],
          ...(filters ? { filters } : {})
        },
        sort: { price: 'asc' }
      })
    };
  }

  function buildTradeLinkSeeds() {
    return {
      beauty: buildDivinationCardTradeSeedByName('Beauty'),
      mortalgrief: { mode: 'exchange', id: 'JQlp45YIl' },
      mortalrage: { mode: 'exchange', id: 'JQlp45YIl' },
      mortalhope: { mode: 'exchange', id: 'rV2WaZ4TQ' },
      mortalignorance: { mode: 'exchange', id: '9y5kGXKCK' },
      nimis: buildNinjaTradeSeedByName('Nimis'),
      curioofconsumption: buildNinjaTradeSeedByName('Curio of Consumption'),
      ashesofthestars: buildNinjaTradeSeedByName('Ashes of the Stars'),
      whispersofinfinity: buildNinjaTradeSeedByName('Whispers of Infinity'),
      curioofabsorption: buildNinjaTradeSeedByName('Curio of Absorption'),
      atzirispromise: buildNinjaTradeSeedByName("Atziri's Promise"),
      atzirisacuity: buildNinjaTradeSeedByName("Atziri's Acuity"),
      bottledfaith: buildNinjaTradeSeedByName('Bottled Faith'),
      dissolutionoftheflesh: buildNinjaTradeSeedByName('Dissolution of the Flesh'),
      doppelgngerguise: buildNinjaTradeSeedByName('Doppelgänger Guise'),
      dyingsun: buildNinjaTradeSeedByName('Dying Sun'),
      garboftheephemeral: buildNinjaTradeSeedByName('Garb of the Ephemeral'),
      indigon: buildNinjaTradeSeedByName('Indigon'),
      meldingoftheflesh: buildNinjaTradeSeedByName('Melding of the Flesh'),
      oriathsend: buildNinjaTradeSeedByName("Oriath's End"),
      progenesis: buildNinjaTradeSeedByName('Progenesis'),
      rationaldoctrine: buildNinjaTradeSeedByName('Rational Doctrine'),
      servantofdecay: buildNinjaTradeSeedByName('Servant of Decay'),
      sublimevision: buildNinjaTradeSeedByName('Sublime Vision'),
      celestialbrace: buildNinjaTradeSeedByName('The Celestial Brace'),
      unseenhue: buildNinjaTradeSeedByName('The Unseen Hue'),
      venariusastrolabe: buildNinjaTradeSeedByName("Venarius' Astrolabe"),
      watcherseye: buildNinjaTradeSeedByName("Watcher's Eye"),
      wellwaterphylactery: buildNinjaTradeSeedByName('Wellwater Phylactery'),
      wineoftheprophet: buildNinjaTradeSeedByName('Wine of the Prophet')
    };
  }

  function tradeSeedForItemName(name, normalizeText, tradeLinkSeeds) {
    const normalized = normalizeText(name);
    if (!normalized) return null;
    return tradeLinkSeeds[normalized] || null;
  }

  function buildUniqueDropNameKeys(bossData, normalizeText, nonUniqueTradeTypes = NON_UNIQUE_TRADE_TYPES) {
    const keys = new Set();
    (bossData || []).forEach((boss) => {
      (boss && boss.groups ? boss.groups : []).forEach((group) => {
        const label = String((group && group.label) || '');
        const groupLooksUnique = /unique/i.test(label);
        (group && group.items ? group.items : []).forEach((item) => {
          const name = String((item && item.name) || '').trim();
          if (!name) return;
          const types = Array.isArray(item && item.types) ? item.types : [];
          const hasUniqueType = types.some((type) => String(type).startsWith('Unique'));
          const hasNonUniqueType = types.some((type) => nonUniqueTradeTypes.has(String(type)));
          if (hasNonUniqueType) return;
          if (!hasUniqueType && !groupLooksUnique) return;
          const key = normalizeText(name);
          if (key) keys.add(key);
        });
      });
    });
    return keys;
  }

  function shouldAutoTradeDivinationCard(item) {
    const types = Array.isArray(item && item.types) ? item.types : [];
    return types.some((type) => String(type) === 'DivinationCard');
  }

  function shouldAutoTradeUniqueItem(item, normalizeText, uniqueDropNameKeys, nonUniqueTradeTypes = NON_UNIQUE_TRADE_TYPES) {
    const types = Array.isArray(item && item.types) ? item.types : [];
    if (types.some((type) => nonUniqueTradeTypes.has(String(type)))) return false;
    if (types.some((type) => String(type).startsWith('Unique'))) return true;
    const key = normalizeText(item && item.name);
    return key ? uniqueDropNameKeys.has(key) : false;
  }

  function shouldAutoTradeTypedItem(item) {
    const types = new Set((Array.isArray(item?.types) ? item.types : []).map((type) => String(type)));
    if (!types.size) return false;
    return (
      types.has('Currency')
      || types.has('Fragment')
      || types.has('Invitation')
      || types.has('Invitations')
      || types.has('Map')
      || types.has('UniqueMap')
      || types.has('Beast')
    );
  }

  function tradeSeedForItem({
    item,
    normalizeText,
    tradeLinkSeeds,
    uniqueDropNameKeys,
    nonUniqueTradeTypes = NON_UNIQUE_TRADE_TYPES
  }) {
    const name = String((item && item.name) || '').trim();
    if (!name) return null;
    const explicit = tradeSeedForItemName(name, normalizeText, tradeLinkSeeds);
    if (explicit) return explicit;
    if (item.tradeName || item.tradeUnidentified || item.tradeIlvlMin != null || item.tradeIlvlMax != null) {
      return buildTypedTradeSeedByName(item.tradeName || name, item);
    }
    if (shouldAutoTradeDivinationCard(item)) return buildDivinationCardTradeSeedByName(name);
    if (shouldAutoTradeTypedItem(item)) return buildTypedTradeSeedByName(name);
    if (shouldAutoTradeUniqueItem(item, normalizeText, uniqueDropNameKeys, nonUniqueTradeTypes)) {
      return buildNinjaTradeSeedByName(name);
    }
    return buildTypedTradeSeedByName(name);
  }

  function normalizeTradeSeed(seed) {
    if (!seed) return null;
    if (typeof seed === 'object' && seed.mode && seed.id) {
      const mode = String(seed.mode).toLowerCase();
      const id = String(seed.id).trim();
      if ((mode === 'search' || mode === 'exchange') && id) return { mode, id };
      return null;
    }
    if (typeof seed === 'object' && seed.mode && seed.q) {
      const mode = String(seed.mode).toLowerCase();
      const q = String(seed.q).trim();
      if (mode === 'search' && q) return { mode, q };
      return null;
    }
    if (typeof seed !== 'string') return null;
    try {
      const parsed = new URL(seed);
      const parts = parsed.pathname.split('/').filter(Boolean);
      if (parts[0] !== 'trade') return null;
      if (parts.length === 3 && String(parts[1] || '').toLowerCase() === 'search') {
        const q = parsed.searchParams.get('q');
        if (q) return { mode: 'search', q };
      }
      if (parts.length < 4) return null;
      const mode = String(parts[1] || '').toLowerCase();
      const id = parts.slice(3).join('/').trim();
      if ((mode !== 'search' && mode !== 'exchange') || !id) return null;
      return { mode, id };
    } catch (err) {
      return null;
    }
  }

  function tradeUrlFromSeed(seed, league, tradeSiteBase) {
    if (!seed || !league || !tradeSiteBase) return null;
    const normalized = normalizeTradeSeed(seed);
    if (!normalized) return null;
    if (normalized.q) {
      return `${tradeSiteBase}/trade/search/${encodeURIComponent(league)}?q=${encodeURIComponent(normalized.q)}`;
    }
    return `${tradeSiteBase}/trade/${normalized.mode}/${encodeURIComponent(league)}/${normalized.id}`;
  }

  global.PoeTrade = Object.freeze({
    NON_UNIQUE_TRADE_TYPES,
    buildTradeLinkSeeds,
    buildUniqueDropNameKeys,
    tradeSeedForItemName,
    tradeSeedForItem,
    tradeUrlFromSeed
  });
})(window);
