/**
 * Weighted random selection algorithm.
 * Picks one item from `items` based on each item's weight.
 *
 * @param {Array<{item: any, weight: number}>} weighted
 * @returns {any}
 */
function weightedRandom(weighted) {
  const total = weighted.reduce((sum, w) => sum + w.weight, 0);
  if (total === 0) return null;

  let rand = Math.random() * total;
  for (const w of weighted) {
    rand -= w.weight;
    if (rand <= 0) return w.item;
  }
  return weighted[weighted.length - 1].item;
}

module.exports = { weightedRandom };
