/**
 * Finds the nearest interactable within range using cached positions and
 * squared distances (no sqrt, no allocations). With ~20 markers a linear scan
 * is cheaper than any spatial structure; it is also throttled by the caller.
 */
export class ProximitySystem {
  constructor(range) {
    this.range2 = range * range;
    this.items = [];
  }

  /** @param {{x:number, z:number}[]} items objects with stable x/z */
  setItems(items) {
    this.items = items;
  }

  nearest(x, z, filter) {
    let best = null;
    let bestD2 = this.range2;
    for (let i = 0; i < this.items.length; i++) {
      const it = this.items[i];
      if (filter && !filter(it)) continue;
      const dx = it.x - x;
      const dz = it.z - z;
      const d2 = dx * dx + dz * dz;
      if (d2 <= bestD2) {
        bestD2 = d2;
        best = it;
      }
    }
    return best;
  }
}
