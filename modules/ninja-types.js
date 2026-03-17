(function initPoeNinjaTypes(root, factory) {
  'use strict';

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
    return;
  }
  root.PoeNinjaTypes = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function buildPoeNinjaTypes() {
  'use strict';

  const lowConfidenceListingThreshold = 5;

  const currencyOverviewTypes = [
    { type: 'Currency', category: 'currency' },
    { type: 'Fragment', category: 'fragment' },
    { type: 'Scarab', category: 'scarab' },
    { type: 'Oil', category: 'oil' },
    { type: 'Incubator', category: 'incubator' },
    { type: 'Fossil', category: 'fossil' },
    { type: 'Resonator', category: 'resonator' },
    { type: 'Essence', category: 'essence' },
    { type: 'DeliriumOrb', category: 'delirium-orb' }
  ];

  const itemOverviewTypes = [
    { type: 'UniqueArmour', category: 'armour' },
    { type: 'UniqueWeapon', category: 'weapon' },
    { type: 'UniqueAccessory', category: 'accessory' },
    { type: 'UniqueJewel', category: 'jewels' },
    { type: 'UniqueFlask', category: 'flask' },
    { type: 'DivinationCard', category: 'card' },
    { type: 'Beast', category: 'monsters' },
    { type: 'Invitation', category: 'invitation' },
    { type: 'Map', category: 'maps' },
    { type: 'UniqueMap', category: 'maps' },
    { type: 'SkillGem', category: 'gems' },
    { type: 'BaseType', category: 'base-types' },
    { type: 'Tattoo', category: 'tattoos' },
    { type: 'Omen', category: 'omens' }
  ];

  const typeToCategories = {
    Currency: ['currency'],
    Fragment: ['fragment', 'invitation'],
    Invitation: ['invitation', 'fragment'],
    Invitations: ['invitation', 'fragment'],
    Scarab: ['scarab'],
    Oil: ['oil'],
    Incubator: ['incubator'],
    Fossil: ['fossil'],
    Resonator: ['resonator'],
    Essence: ['essence'],
    DeliriumOrb: ['delirium-orb'],
    UniqueArmour: ['armour'],
    UniqueWeapon: ['weapon'],
    UniqueAccessory: ['accessory'],
    UniqueJewel: ['jewels'],
    UniqueFlask: ['flask'],
    DivinationCard: ['card', 'divinationcard', 'divination', 'divination-card'],
    Beast: ['monsters'],
    Map: ['maps'],
    UniqueMap: ['maps'],
    SkillGem: ['gems'],
    BaseType: ['base-types'],
    Tattoo: ['tattoos'],
    Omen: ['omens']
  };

  const typeToDetailRoute = {
    Currency: 'currency',
    Fragment: 'fragments',
    Invitation: 'invitations',
    Scarab: 'scarabs',
    Oil: 'oils',
    Incubator: 'incubators',
    Fossil: 'fossils',
    Resonator: 'resonators',
    Essence: 'essences',
    DeliriumOrb: 'delirium-orbs',
    UniqueArmour: 'unique-armours',
    UniqueWeapon: 'unique-weapons',
    UniqueAccessory: 'unique-accessories',
    UniqueJewel: 'unique-jewels',
    UniqueFlask: 'unique-flasks',
    DivinationCard: 'divination-cards',
    Beast: 'beasts',
    Map: 'maps',
    UniqueMap: 'maps',
    SkillGem: 'skill-gems',
    BaseType: 'base-types',
    Tattoo: 'tattoos',
    Omen: 'omens'
  };

  return Object.freeze({
    lowConfidenceListingThreshold,
    currencyOverviewTypes: Object.freeze(currencyOverviewTypes.map((entry) => Object.freeze({ ...entry }))),
    itemOverviewTypes: Object.freeze(itemOverviewTypes.map((entry) => Object.freeze({ ...entry }))),
    typeToCategories: Object.freeze({ ...typeToCategories }),
    typeToDetailRoute: Object.freeze({ ...typeToDetailRoute })
  });
});
