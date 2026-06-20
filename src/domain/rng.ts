// Deterministic PRNG + samplers. Single source of randomness for the engine so a run is a
// pure function of its seed (NFR2). Validated for throughput + determinism by spike S5.

export type Rng = () => number;

/** mulberry32 — small, fast, platform-stable. Same seed ⇒ identical stream. */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Sample a Poisson(λ) count using Knuth's algorithm with an injected uniform source. */
export function samplePoisson(lambda: number, rng: Rng): number {
  const L = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k += 1;
    p *= rng();
  } while (p > L);
  return k - 1;
}
