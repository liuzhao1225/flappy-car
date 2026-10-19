// Shared by the browser and score replay. Unsigned 32-bit deterministic PRNG.
globalThis.flappyRandom = function (seed) {
  let value = seed >>> 0;
  return () => {
    value += 0x6D2B79F5;
    let t = Math.imul(value ^ value >>> 15, 1 | value);
    t ^= t + Math.imul(t ^ t >>> 7, 61 | t);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
};
