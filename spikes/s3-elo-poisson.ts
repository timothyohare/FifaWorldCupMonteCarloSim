// S3 — Elo → expected goals (λ) → Poisson scoreline distribution.
// Validates the *shape* of the reference strength model (see docs/10-elo-poisson-model.md):
// the mapping is sane, monotone in rating difference, and recovers a calibrated-looking
// win/draw/loss split. Full historical calibration of the constants is S8's job.

/** Elo win expectation for the home side (pre-home-advantage). */
export function eloExpectation(rHome: number, rAway: number): number {
  return 1 / (1 + 10 ** (-(rHome - rAway) / 400));
}

export interface Lambdas {
  home: number;
  away: number;
}

/**
 * Convert a rating difference into expected goals for each side.
 * `base` ≈ avg goals/team; `homeAdv` is added to the home rating (Elo points).
 * `spread` controls how strongly rating diff tilts goals. These constants are the part
 * that MUST be calibrated against history (S8) — here they are reasonable placeholders.
 */
export function eloToLambdas(
  rHome: number,
  rAway: number,
  { base = 1.35, homeAdv = 65, spread = 0.45 }: { base?: number; homeAdv?: number; spread?: number } = {},
): Lambdas {
  const diff = rHome + homeAdv - rAway;
  // Symmetric multiplicative tilt around `base`; capped to keep λ physically sane.
  const tilt = Math.exp((spread * diff) / 400);
  return {
    home: clamp(base * tilt, 0.15, 6),
    away: clamp(base / tilt, 0.15, 6),
  };
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}

function poissonPmf(k: number, lambda: number): number {
  return (lambda ** k * Math.exp(-lambda)) / factorial(k);
}
function factorial(n: number): number {
  let f = 1;
  for (let i = 2; i <= n; i++) f *= i;
  return f;
}

export interface Outcome {
  pHome: number;
  pDraw: number;
  pAway: number;
  expectedScore: { home: number; away: number };
}

/** Independent double-Poisson → win/draw/loss probabilities over a score grid. */
export function matchOutcome(lambdas: Lambdas, maxGoals = 10): Outcome {
  let pHome = 0;
  let pDraw = 0;
  let pAway = 0;
  for (let h = 0; h <= maxGoals; h++) {
    const ph = poissonPmf(h, lambdas.home);
    for (let a = 0; a <= maxGoals; a++) {
      const p = ph * poissonPmf(a, lambdas.away);
      if (h > a) pHome += p;
      else if (h === a) pDraw += p;
      else pAway += p;
    }
  }
  return {
    pHome,
    pDraw,
    pAway,
    expectedScore: { home: lambdas.home, away: lambdas.away },
  };
}

/** End-to-end: ratings → outcome probabilities. */
export function ratingsToOutcome(
  rHome: number,
  rAway: number,
  opts?: Parameters<typeof eloToLambdas>[2],
): Outcome {
  return matchOutcome(eloToLambdas(rHome, rAway, opts));
}
