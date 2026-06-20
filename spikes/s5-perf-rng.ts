// S5 — performance budget + seeded-RNG determinism.
// Two promises to de-risk: (1) 100k full-tournament sims fit a ~10s laptop budget, and
// (2) the seeded RNG is bit-stable (reproducibility, NFR2). We measure raw Poisson-sample
// throughput and project it onto a full tournament's sample count.
import { mulberry32, samplePoisson } from "./domain";

// A 48-team tournament: 12 groups × 6 = 72 group matches... but 2026 plays 4 group games
// each? No — 4 teams × 3 rounds = 6/group × 12 = 72; plus 32+16+8+4+2+1 = 63 knockout +
// 1 third-place play-off ≈ 104 matches total. Each match ≈ 2 Poisson draws.
const MATCHES_PER_TOURNAMENT = 104;
const DRAWS_PER_MATCH = 2;

export interface S5Finding {
  measuredDraws: number;
  ms: number;
  drawsPerSec: number;
  projected100kSeconds: number;
  rngDeterministic: boolean;
  rngDiffersAcrossSeed: boolean;
}

function sequence(seed: number, n: number): number[] {
  const rng = mulberry32(seed);
  return Array.from({ length: n }, () => rng());
}

export function runDemo(measuredDraws = 3_000_000): S5Finding {
  // RNG determinism checks.
  const a = sequence(42, 1000);
  const b = sequence(42, 1000);
  const c = sequence(43, 1000);
  const rngDeterministic = a.every((v, i) => v === b[i]);
  const rngDiffersAcrossSeed = a.some((v, i) => v !== c[i]);

  // Throughput: time a representative stream of Poisson draws (λ≈1.35 like real scorelines).
  const rng = mulberry32(7);
  const start = performance.now();
  let acc = 0;
  for (let i = 0; i < measuredDraws; i++) acc += samplePoisson(1.35, rng);
  const ms = performance.now() - start;
  if (acc < 0) throw new Error("unreachable"); // keep `acc` live so the loop isn't elided

  const drawsPerSec = (measuredDraws / ms) * 1000;
  const drawsFor100k = 100_000 * MATCHES_PER_TOURNAMENT * DRAWS_PER_MATCH;
  const projected100kSeconds = drawsFor100k / drawsPerSec;

  return {
    measuredDraws,
    ms,
    drawsPerSec,
    projected100kSeconds,
    rngDeterministic,
    rngDiffersAcrossSeed,
  };
}
