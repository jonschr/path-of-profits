(function (global) {
  'use strict';
  function jackpotShare(probabilities, cost, tail = .05) {
    if (!probabilities.length || !Number.isFinite(cost) || cost < 0 || !(tail > 0 && tail < 1)
      || probabilities.some((x) => !Number.isFinite(x.price) || x.price < 0 || !Number.isFinite(x.probability) || x.probability < 0)) return null;
    const total = probabilities.reduce((s, x) => s + x.probability, 0);
    if (Math.abs(total - 1) > 1e-8) return null;
    const mean = probabilities.reduce((s, x) => s + x.probability * x.price, 0);
    let remaining = tail, contribution = 0;
    for (const outcome of [...probabilities].sort((a, b) => b.price - a.price)) {
      const amount = Math.min(outcome.probability, remaining);
      contribution += amount * outcome.price; remaining -= amount;
      if (remaining <= 1e-12) break;
    }
    return { share: mean > 0 ? contribution / mean : 0, without: (mean - contribution) / (1 - tail) - cost };
  }
  function simulate(probabilities, cost, batches = [100, 1000], trials = 5000, seed = 20261004) {
    if (!Number.isFinite(cost) || cost < 0 || !Number.isSafeInteger(trials) || trials < 1
      || !batches.every((x) => Number.isSafeInteger(x) && x > 0)) return null;
    const dependency = jackpotShare(probabilities, cost);
    if (!dependency) return null;
    let state = seed >>> 0;
    const random = () => { state = (Math.imul(1664525, state) + 1013904223) >>> 0; return state / 4294967296; };
    let cumulative = 0;
    const outcomes = probabilities.filter((x) => x.probability > 0).map((x) => ({ price: x.price, limit: cumulative += x.probability }));
    const draw = () => {
      const target = random(); let lo = 0, hi = outcomes.length - 1;
      while (lo < hi) { const mid = (lo + hi) >>> 1; if (target < outcomes[mid].limit) hi = mid; else lo = mid + 1; }
      return outcomes[lo].price;
    };
    const mean = probabilities.reduce((s, x) => s + x.price * x.probability, 0);
    return { ...dependency, trials, batches: batches.map((rolls) => {
      const profits = [];
      for (let trial = 0; trial < trials; trial++) {
        let revenue = 0; for (let i = 0; i < rolls; i++) revenue += draw();
        profits.push(revenue - cost * rolls);
      }
      const lossChance = profits.filter((x) => x < -1e-9).length / trials;
      profits.sort((a, b) => a - b);
      return { rolls, lossChance, low: profits[Math.floor(trials * .1)], high: profits[Math.min(trials - 1, Math.floor(trials * .9))], expected: (mean - cost) * rolls };
    }) };
  }
  const api = { jackpotShare, simulate };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else global.PoeGamblingRisk = api;
})(typeof window !== 'undefined' ? window : globalThis);
