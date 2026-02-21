function xmur3(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^= h >>> 16) >>> 0;
  };
}

function mulberry32(a) {
  return () => {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class RNG {
  constructor(seed) {
    const seedFn = xmur3(seed);
    this.rand = mulberry32(seedFn());
  }
  next() { return this.rand(); }
  range(min, max) { return min + (max - min) * this.next(); }
  int(minInclusive, maxInclusive) { return Math.floor(this.range(minInclusive, maxInclusive + 1)); }
  pick(arr) { return arr[this.int(0, arr.length - 1)]; }
}
