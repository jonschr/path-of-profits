(function initExchange(global) {
  'use strict';

  const PREFIX = 'Metadata/Items/Currency/';
  // Gold is charged per item received. Defaults are editable on the page.
  // Source: https://www.poewiki.net/wiki/Currency_exchange_market#Gold_costs
  const definitions = {
    CurrencyRerollRare: ['Chaos Orb', 'Chaos', 15],
    CurrencyModValues: ['Divine Orb', 'Divine', 250],
    CurrencyAddModToRare: ['Exalted Orb', 'Exalt', 20],
    CurrencyUpgradeToRare: ['Orb of Alchemy', 'Alchemy', 15],
    CurrencyRerollMagic: ['Orb of Alteration', 'Alteration', 10],
    CurrencyAddModToMagic: ['Orb of Augmentation', 'Augmentation', 5],
    CurrencyUpgradeToMagic: ['Orb of Transmutation', 'Transmutation', 3],
    CurrencyUpgradeMagicToRare: ['Regal Orb', 'Regal', 50],
    CurrencyUpgradeRandomly: ['Orb of Chance', 'Chance', 10],
    CurrencyConvertToNormal: ['Orb of Scouring', 'Scouring', 15],
    CurrencyRerollSocketLinks: ['Orb of Fusing', 'Fusing', 15],
    CurrencyRerollSocketNumbers: ["Jeweller's Orb", 'Jeweller', 10],
    CurrencyRerollSocketColours: ['Chromatic Orb', 'Chromatic', 10],
    CurrencyCorrupt: ['Vaal Orb', 'Vaal', 20],
    CurrencyRerollImplicit: ['Blessed Orb', 'Blessed', 35],
    CurrencyRemoveMod: ['Orb of Annulment', 'Annulment', 250],
    CurrencyRerollUnique: ['Ancient Orb', 'Ancient', 250],
    CurrencyPassiveRefund: ['Orb of Regret', 'Regret', 20],
    CurrencyAtlasPassiveRefund: ['Orb of Unmaking', 'Unmaking', 20],
    CurrencyGemQuality: ["Gemcutter's Prism", 'Gemcutter', 50],
    CurrencyFlaskQuality: ["Glassblower's Bauble", 'Glassblower', 50],
    CurrencyArmourQuality: ["Armourer's Scrap", 'Armourer', 25],
    CurrencyWeaponQuality: ["Blacksmith's Whetstone", 'Whetstone', 30],
    CurrencyIdentification: ['Scroll of Wisdom', 'Wisdom', 1],
    CurrencyPortal: ['Portal Scroll', 'Portal', 1],
    CurrencyDuplicate: ['Mirror of Kalandra', 'Mirror', 25000],
    CurrencyDuplicateShard: ['Mirror Shard', 'Mirror Shard', 1250],
    CurrencyFractureRare: ['Fracturing Orb', 'Fracturing', 500],
    CurrencyHinekorasLock: ["Hinekora's Lock", 'Hinekora', 6250],
    CurrencyInstillingOrb: ['Instilling Orb', 'Instilling', 20],
    CurrencyEnkindlingOrb: ['Enkindling Orb', 'Enkindling', 35],
    CurrencyUpgradeToRareAndSetSockets: ['Orb of Binding', 'Binding', 20]
  };
  const currencies = Object.fromEntries(Object.entries(definitions).map(([id, [name, short, gold]]) => (
    [PREFIX + id, { name, short, gold }]
  )));
  // PoE2 has different fees, even where the metadata ID matches PoE1.
  // Sources: https://www.poe2wiki.net/wiki/Currency_exchange
  // https://poe2db.tw/us/Chaos_Orb, /Divine_Orb, /Exalted_Orb, /Regal_Orb
  const poe2GoldFees = Object.fromEntries(Object.entries({
    CurrencyIdentification: 1, CurrencyUpgradeToMagic: 50, CurrencyUpgradeMagicToRare: 120,
    CurrencyAddModToRare: 120, CurrencyRerollRare: 160, CurrencyCorrupt: 160,
    CurrencyAddModToMagic: 200, CurrencyUpgradeToRare: 200, CurrencyModValues: 800,
    CurrencyUpgradeRandomly: 1000, CurrencyRemoveMod: 1000, CurrencyAddEquipmentSocket: 1000
  }).map(([id, gold]) => [PREFIX + id, gold]));
  const goldForItem = (id, game = 'poe1') => game === 'poe2' ? poe2GoldFees[id] ?? null : currencies[id]?.gold ?? null;
  const CHAOS = PREFIX + 'CurrencyRerollRare';
  const DIVINE = PREFIX + 'CurrencyModValues';
  const EXALT = PREFIX + 'CurrencyAddModToRare';
  const HOUR = 3600;
  const rateKey = (from, to) => `${from}|${to}`;
  const isItemId = (id) => typeof id === 'string' && id.startsWith('Metadata/Items/');
  const categories = {
    currency: 'Currency', essence: 'Essences', fragment: 'Fragments', scarab: 'Scarabs', card: 'Divination cards',
    oil: 'Oils', fossil: 'Fossils', resonator: 'Resonators', catalyst: 'Catalysts', 'delirium-orb': 'Delirium orbs',
    tattoos: 'Tattoos', omens: 'Omens', incubator: 'Incubators', runegraft: 'Runegrafts', astrolabe: 'Astrolabes', memory: 'Memories',
    rune: 'Runes', 'soul-core': 'Soul cores', idol: 'Idols', talisman: 'Talismans', emotion: 'Liquid emotions',
    'uncut-gem': 'Uncut gems', 'lineage-gem': 'Lineage supports', bones: 'Desecration bones', expedition: 'Expedition', incursion: 'Incursion'
  };
  function categoryForItem(id, game = 'poe1', base = {}) {
    if (game === 'poe2') {
      if (['MapFragment', 'PinnacleKeyStackable', 'VaultKey', 'Breachstone'].includes(base.item_class)) return 'fragment';
      if (base.item_class === 'IncubatorStackable') return 'incubator';
      const rules = [
        [/Currency(?:Lesser|Greater|Perfect|Corrupted)?Essence/, 'essence'],
        [/\/Omen/, 'omens'], [/DistilledEmotion/, 'emotion'], [/Currency(?:Jewellery|Jewel)Quality/, 'catalyst'],
        [/\/SoulCores\/(?:Rune|AugmentAnoint)/, 'rune'], [/\/SoulCores\/Idol/, 'idol'],
        [/\/SoulCores\/Talisman/, 'talisman'], [/\/SoulCores\//, 'soul-core'],
        [/(?:Skill|Support|Reservation)GemUncut/, 'uncut-gem'], [/\/Gems?\/SupportGem/, 'lineage-gem'],
        [/AbyssalBenchTicket/, 'bones'], [/\/Pinnacle\/|\/Ultimatum\/TrialmasterKey|Currency(?:Breach|Affliction)Shard|PinnacleKeyShard/, 'fragment'],
        [/CurrencyVerisium|\/Expedition\//, 'expedition'], [/CurrencyIncursion/, 'incursion']
      ];
      const type = rules.find(([pattern]) => pattern.test(id))?.[1];
      if (type) return type;
    }
    const rules = [
      [/\/Scarabs\//, 'scarab'], [/\/DivinationCards\/DivinationCard(?!Deck)/, 'card'], [/\/MapFragments\//, 'fragment'],
      [/CurrencyEssence/, 'essence'], [/CurrencyDelveCrafting/, 'fossil'], [/\/Delve\/DelveStackableSocketableCurrency/, 'resonator'],
      [/Mushrune/, 'oil'], [/CurrencyJewelleryQuality/, 'catalyst'], [/CurrencyAfflictionOrb/, 'delirium-orb'],
      [/AncestralTattoo/, 'tattoos'], [/AncestralOmen/, 'omens'], [/LegionCocoon/, 'incubator'],
      [/Runegraft/, 'runegraft'], [/Astrolabe/, 'astrolabe'], [/MemoryThread/, 'memory']
    ];
    return rules.find(([pattern]) => pattern.test(id))?.[1] || 'currency';
  }
  function item(id, items = {}) {
    const metadata = items[id] || {};
    const known = currencies[id];
    const name = typeof metadata.name === 'string' ? metadata.name : known?.name || id.split('/').pop();
    const gold = Object.hasOwn(metadata, 'gold') ? metadata.gold : known?.gold;
    return {
      name, short: typeof metadata.short === 'string' ? metadata.short : known?.name === name ? known.short : name,
      gold: Number.isFinite(gold) && gold >= 0 ? gold : null,
      icon: typeof metadata.icon === 'string' && metadata.icon.startsWith('https://') ? metadata.icon : '',
      category: categories[metadata.category] ? metadata.category : categoryForItem(id)
    };
  }
  function routeCategories(route, items = {}) {
    const types = [...new Set(route.path.map((id) => item(id, items).category))].filter((type) => type !== 'currency');
    return types.length ? types : ['currency'];
  }

  async function fetchLatestSnapshot(base, fetchImpl = global.fetch.bind(global), now = Date.now()) {
    const latestHour = Math.floor(now / 1000 / HOUR) * HOUR - HOUR;
    let lastError;
    for (let offset = 0; offset < 3; offset += 1) {
      const hour = latestHour - offset * HOUR;
      try {
        const response = await fetchImpl(`${base}/${hour}`, { signal: AbortSignal.timeout(20000) });
        if (!response.ok) throw new Error(`Exchange feed returned ${response.status}`);
        const data = await response.json();
        if (!Array.isArray(data.markets)) throw new Error('Invalid exchange data');
        if (!data.markets.length || Number(data.next_change_id) <= hour) continue;
        return { ...data, hour, fetchedAt: new Date(now).toISOString() };
      } catch (error) { lastError = error; }
    }
    throw lastError || new Error('No completed exchange hour is available yet');
  }

  function buildGraph(markets, league) {
    const graph = new Map();
    for (const market of markets) {
      if (market.league !== league || !Array.isArray(market.market_pair) || market.market_pair.length !== 2) continue;
      const [a, b] = market.market_pair;
      const va = Number(market.volume_traded?.[a]);
      const vb = Number(market.volume_traded?.[b]);
      if (a === b || !isItemId(a) || !isItemId(b) || !Number.isFinite(va) || !Number.isFinite(vb) || va <= 0 || vb <= 0) continue;
      for (const [from, to, volume, received] of [[a, b, va, vb], [b, a, vb, va]]) {
        if (!graph.has(from)) graph.set(from, new Map());
        graph.get(from).set(to, { from, to, rate: received / volume, volume, market });
      }
    }
    return graph;
  }

  function supportsVolume(step) {
    return step.pay > 0 && step.receive > 0
      && step.pay * 10 <= step.volume
      && step.receive * 10 <= Number(step.market.volume_traded[step.to]);
  }

  function simulate(graph, path, amount, fees = {}, overrides = {}, items = {}) {
    const start = path[0];
    const divineRate = start === DIVINE ? 1 : graph.get(start)?.get(DIVINE)?.rate;
    let current = amount;
    let gold = 0;
    let prefixRate = 1;
    let hourlyVolume = Infinity;
    const steps = [];
    for (let i = 0; i < 3; i += 1) {
      const edge = graph.get(path[i])?.get(path[i + 1]);
      const rate = overrides[rateKey(path[i], path[i + 1])] ?? edge?.rate;
      if (!edge || !Number.isFinite(rate) || rate <= 0) return null;
      const fee = fees[path[i + 1]] ?? item(path[i + 1], items).gold;
      if (fee !== null && (!Number.isFinite(fee) || fee < 0)) return null;
      hourlyVolume = Math.min(hourlyVolume, edge.volume / prefixRate);
      const received = Math.floor(current * rate + 1e-9);
      if (!Number.isSafeInteger(received)) return null;
      const cost = received === 0 ? 0 : fee === null ? null : Math.ceil(received * fee);
      steps.push({ ...edge, rate, pay: current, receive: received, gold: cost, fee });
      current = received;
      gold = gold === null || cost === null ? null : gold + cost;
      prefixRate *= rate;
    }
    const profit = current - amount;
    const profitDivine = Number.isFinite(divineRate) ? profit * divineRate : null;
    return {
      key: path.join('|'), path, steps, amount, end: current, profit,
      returnPct: profit / amount * 100, profitDivine, gold, hourlyVolume,
      volumeSupported: steps.every(supportsVolume),
      perGold: gold > 0 && profitDivine !== null ? profitDivine / gold : null,
      theoreticalReturn: (prefixRate - 1) * 100
    };
  }

  function findRoutes(graph, start, amount, fees = {}, overrides = {}, items = {}) {
    if (!Number.isSafeInteger(amount) || amount <= 0) return [];
    const routes = [];
    for (const b of graph.get(start)?.keys() || []) {
      for (const c of graph.get(b)?.keys() || []) {
        if (c === start || c === b || !graph.get(c)?.has(start)) continue;
        const route = simulate(graph, [start, b, c, start], amount, fees, overrides, items);
        if (route) routes.push(route);
      }
    }
    return routes;
  }

  function quantityEdit(route, index, side, value) {
    if (!Number.isInteger(index) || index < 0 || index > 2 || !['pay', 'receive'].includes(side)
      || (value !== null && (!Number.isSafeInteger(value) || value <= 0))) return null;
    if (side === 'pay' && index === 0) return { amount: value };
    // Incoming balances belong to the preceding trade, keeping all three orders connected.
    const step = route.steps[side === 'pay' ? index - 1 : index];
    if (!step || (value !== null && step.pay <= 0)) return null;
    return { key: rateKey(step.from, step.to), rate: value === null ? null : value / step.pay };
  }

  const api = { currencies, item, goldForItem, isItemId, categories, categoryForItem, routeCategories, CHAOS, DIVINE, EXALT, HOUR, rateKey, fetchLatestSnapshot, buildGraph, findRoutes, quantityEdit, supportsVolume };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else global.PoeExchange = api;
})(typeof window !== 'undefined' ? window : globalThis);
