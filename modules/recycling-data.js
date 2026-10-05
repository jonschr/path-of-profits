(function (g) {
  const data = [
  {
    "key": "runegraft",
    "name": "Runegrafts",
    "allowSame": true,
    "cost": 0,
    "date": "3.28 · 10,111 outputs",
    "source": "https://www.reddit.com/r/pathofexile/comments/1rz0vxq/runegrafts_weight_from_30333_runes_328_updated/",
    "note": "Observed counts from 10,111 outputs in 3.28, reused as estimated weights. The input type can be returned. Angler had zero observations: the model assigns it no revenue, without proving its chance is zero. Current-league weights unverified.",
    "weights": {
      "Runegraft of Stability": 18,
      "Runegraft of Fury": 28,
      "Runegraft of Gemcraft": 39,
      "Runegraft of Rotblood": 44,
      "Runegraft of the Witchmark": 51,
      "Runegraft of the Soulwick": 56,
      "Runegraft of the Warp": 165,
      "Runegraft of the Spellbound": 175,
      "Runegraft of Loyalty": 183,
      "Runegraft of Time": 186,
      "Runegraft of the Fortress": 338,
      "Runegraft of Resurgence": 338,
      "Runegraft of Refraction": 342,
      "Runegraft of Suffering": 351,
      "Runegraft of the Novamark": 358,
      "Runegraft of Consecration": 364,
      "Runegraft of Treachery": 370,
      "Runegraft of Rallying": 375,
      "Runegraft of the Agile": 459,
      "Runegraft of the Bound": 487,
      "Runegraft of the Combatant": 522,
      "Runegraft of Bellows": 526,
      "Runegraft of Quaffing": 526,
      "Runegraft of Blasphemy": 532,
      "Runegraft of Restitching": 536,
      "Runegraft of the River": 537,
      "Runegraft of the Imbued": 538,
      "Runegraft of the Sinistral": 540,
      "Runegraft of the Jeweller": 560,
      "Runegraft of Connection": 567,
      "Runegraft of the Angler": 0
    }
  },
  {
    "key": "tattoo-kitava",
    "name": "Kitava",
    "allowSame": true,
    "cost": 0,
    "date": "Legacy model",
    "source": "https://www.reddit.com/r/pathofexile/comments/1mg8ozd/results_from_vendoring_60000_tattoos/",
    "note": "Equal-weight scenario: published Kitava counts contain inconsistent totals, so they are not used as measured odds. The input type can be returned. Makanga, Loyalty, Journey and Honoured tattoos are outside this ordinary pool.",
    "weights": {
      "Tattoo of the Kitava Blood Drinker": 1,
      "Tattoo of the Kitava Heart Eater": 1,
      "Tattoo of the Kitava Rebel": 1,
      "Tattoo of the Kitava Shaman": 1,
      "Tattoo of the Kitava Warrior": 1
    }
  },
  {
    "key": "tattoo-hinekora",
    "name": "Hinekora",
    "allowSame": true,
    "cost": 0,
    "date": "Legacy model",
    "source": "https://www.reddit.com/r/pathofexile/comments/1mg8ozd/results_from_vendoring_60000_tattoos/",
    "note": "Approximate 3:3:3:1:1 relative-weight model based on legacy tattoo research; not measured for this league. The input type can be returned. Makanga, Loyalty, Journey and Honoured tattoos are outside this ordinary pool.",
    "weights": {
      "Tattoo of the Hinekora Deathwarden": 3,
      "Tattoo of the Hinekora Shaman": 3,
      "Tattoo of the Hinekora Storyteller": 1,
      "Tattoo of the Hinekora Warmonger": 1,
      "Tattoo of the Hinekora Warrior": 3
    }
  },
  {
    "key": "tattoo-valako",
    "name": "Valako",
    "allowSame": true,
    "cost": 0,
    "date": "Legacy model",
    "source": "https://www.reddit.com/r/pathofexile/comments/1mg8ozd/results_from_vendoring_60000_tattoos/",
    "note": "Approximate 3:3:3:1:1 relative-weight model based on legacy tattoo research; not measured for this league. The input type can be returned. Makanga, Loyalty, Journey and Honoured tattoos are outside this ordinary pool.",
    "weights": {
      "Tattoo of the Valako Scout": 3,
      "Tattoo of the Valako Shaman": 1,
      "Tattoo of the Valako Shieldbearer": 1,
      "Tattoo of the Valako Stormrider": 3,
      "Tattoo of the Valako Warrior": 3
    }
  },
  {
    "key": "tattoo-ngamahu",
    "name": "Ngamahu",
    "allowSame": true,
    "cost": 0,
    "date": "Legacy model",
    "source": "https://www.reddit.com/r/pathofexile/comments/1mg8ozd/results_from_vendoring_60000_tattoos/",
    "note": "Approximate 3:3:3:1:1 relative-weight model based on legacy tattoo research; not measured for this league. The input type can be returned. Makanga, Loyalty, Journey and Honoured tattoos are outside this ordinary pool.",
    "weights": {
      "Tattoo of the Ngamahu Firewalker": 3,
      "Tattoo of the Ngamahu Shaman": 3,
      "Tattoo of the Ngamahu Warmonger": 1,
      "Tattoo of the Ngamahu Warrior": 3,
      "Tattoo of the Ngamahu Woodcarver": 1
    }
  },
  {
    "key": "tattoo-tukohama",
    "name": "Tukohama",
    "allowSame": true,
    "cost": 0,
    "date": "Legacy model",
    "source": "https://www.reddit.com/r/pathofexile/comments/1mg8ozd/results_from_vendoring_60000_tattoos/",
    "note": "Approximate 3:3:3:1:1 relative-weight model based on legacy tattoo research; not measured for this league. The input type can be returned. Makanga, Loyalty, Journey and Honoured tattoos are outside this ordinary pool.",
    "weights": {
      "Tattoo of the Tukohama Brawler": 3,
      "Tattoo of the Tukohama Shaman": 3,
      "Tattoo of the Tukohama Warcaller": 1,
      "Tattoo of the Tukohama Warmonger": 1,
      "Tattoo of the Tukohama Warrior": 3
    }
  },
  {
    "key": "tattoo-ramako",
    "name": "Ramako",
    "allowSame": true,
    "cost": 0,
    "date": "Legacy model",
    "source": "https://www.reddit.com/r/pathofexile/comments/1mg8ozd/results_from_vendoring_60000_tattoos/",
    "note": "Approximate 3:3:3:1:1 relative-weight model based on legacy tattoo research; not measured for this league. The input type can be returned. Makanga, Loyalty, Journey and Honoured tattoos are outside this ordinary pool.",
    "weights": {
      "Tattoo of the Ramako Archer": 3,
      "Tattoo of the Ramako Fleetfoot": 1,
      "Tattoo of the Ramako Scout": 3,
      "Tattoo of the Ramako Shaman": 1,
      "Tattoo of the Ramako Sniper": 3
    }
  },
  {
    "key": "tattoo-arohongui",
    "name": "Arohongui",
    "allowSame": true,
    "cost": 0,
    "date": "Legacy model",
    "source": "https://www.reddit.com/r/pathofexile/comments/1mg8ozd/results_from_vendoring_60000_tattoos/",
    "note": "Approximate 3:3:3:1:1 relative-weight model based on legacy tattoo research; not measured for this league. The input type can be returned. Makanga, Loyalty, Journey and Honoured tattoos are outside this ordinary pool.",
    "weights": {
      "Tattoo of the Arohongui Moonwarden": 3,
      "Tattoo of the Arohongui Scout": 3,
      "Tattoo of the Arohongui Shaman": 1,
      "Tattoo of the Arohongui Warmonger": 1,
      "Tattoo of the Arohongui Warrior": 3
    }
  },
  {
    "key": "tattoo-rongokurai",
    "name": "Rongokurai",
    "allowSame": true,
    "cost": 0,
    "date": "Legacy model",
    "source": "https://www.reddit.com/r/pathofexile/comments/1mg8ozd/results_from_vendoring_60000_tattoos/",
    "note": "Approximate 3:3:3:1:1 relative-weight model based on legacy tattoo research; not measured for this league. The input type can be returned. Makanga, Loyalty, Journey and Honoured tattoos are outside this ordinary pool.",
    "weights": {
      "Tattoo of the Rongokurai Brute": 3,
      "Tattoo of the Rongokurai Goliath": 3,
      "Tattoo of the Rongokurai Guard": 1,
      "Tattoo of the Rongokurai Turtle": 1,
      "Tattoo of the Rongokurai Warrior": 3
    }
  },
  {
    "key": "tattoo-tawhoa",
    "name": "Tawhoa",
    "allowSame": true,
    "cost": 0,
    "date": "Legacy model",
    "source": "https://www.reddit.com/r/pathofexile/comments/1mg8ozd/results_from_vendoring_60000_tattoos/",
    "note": "Approximate 3:3:3:1:1 relative-weight model based on legacy tattoo research; not measured for this league. The input type can be returned. Makanga, Loyalty, Journey and Honoured tattoos are outside this ordinary pool.",
    "weights": {
      "Tattoo of the Tawhoa Herbalist": 1,
      "Tattoo of the Tawhoa Naturalist": 3,
      "Tattoo of the Tawhoa Scout": 3,
      "Tattoo of the Tawhoa Shaman": 1,
      "Tattoo of the Tawhoa Warrior": 3
    }
  },
  {
    "key": "tattoo-tasalio",
    "name": "Tasalio",
    "allowSame": true,
    "cost": 0,
    "date": "Legacy model",
    "source": "https://www.reddit.com/r/pathofexile/comments/1mg8ozd/results_from_vendoring_60000_tattoos/",
    "note": "Approximate 3:3:3:1:1 relative-weight model based on legacy tattoo research; not measured for this league. The input type can be returned. Makanga, Loyalty, Journey and Honoured tattoos are outside this ordinary pool.",
    "weights": {
      "Tattoo of the Tasalio Bladedancer": 3,
      "Tattoo of the Tasalio Scout": 1,
      "Tattoo of the Tasalio Shaman": 3,
      "Tattoo of the Tasalio Tideshifter": 3,
      "Tattoo of the Tasalio Warrior": 1
    }
  }
];
  if (typeof module !== "undefined" && module.exports) module.exports = data;
  else g.PoeRecyclingData = data;
})(typeof window !== "undefined" ? window : globalThis);
