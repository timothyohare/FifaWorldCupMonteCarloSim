// Elo → expected goals (λ) → Poisson scoreline. The transparent, offline reference model
// (PRD FR12; explained in docs/10-elo-poisson-model.md; shape validated by spike S3).
//
// Constants below were CALIBRATED on 49k historical internationals (1872–2026) via
// src/eval/calibrate.ts: base=1.35, homeAdvantage=95, spread=0.8 minimised walk-forward log
// loss (0.894 vs coin-flip 1.099, i.e. 18.6% better; 11% better on World Cup matches). See
// docs/13-spike-findings.md (S8). homeAdvantage is for matches with a host side; pass
// homeAdvantage:0 for neutral-venue World Cup games.
import { samplePoisson, type Rng } from "../domain/rng";
import type { TeamId } from "../domain/types";
import type { Outcome, Score, StrengthModel } from "./strength-model";

export interface EloPoissonOptions {
  /** Average goals per team — the centre of the scoring distribution. */
  base?: number;
  /** Home-advantage bonus in Elo points (0 for neutral venues). */
  homeAdvantage?: number;
  /** How strongly a rating gap tilts expected goals. */
  spread?: number;
  /** Score-grid truncation for the analytical W/D/L sum. */
  maxGoals?: number;
}

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

function factorial(n: number): number {
  let f = 1;
  for (let i = 2; i <= n; i++) f *= i;
  return f;
}
const poissonPmf = (k: number, lambda: number) => (lambda ** k * Math.exp(-lambda)) / factorial(k);

export interface EloPoissonParams {
  base: number;
  homeAdvantage: number;
  spread: number;
}

/** Pure Elo→λ mapping (home advantage already folded into the rating difference). */
export function eloLambdas(
  rHome: number,
  rAway: number,
  p: EloPoissonParams,
): { home: number; away: number } {
  const diff = rHome + p.homeAdvantage - rAway;
  const tilt = Math.exp((p.spread * diff) / 400);
  return { home: clamp(p.base * tilt, 0.15, 6), away: clamp(p.base / tilt, 0.15, 6) };
}

/** Pure double-Poisson → win/draw/loss over a truncated score grid. */
export function poissonWdl(
  lamHome: number,
  lamAway: number,
  maxGoals = 10,
): { pHome: number; pDraw: number; pAway: number } {
  let pHome = 0;
  let pDraw = 0;
  let pAway = 0;
  for (let h = 0; h <= maxGoals; h++) {
    const ph = poissonPmf(h, lamHome);
    for (let a = 0; a <= maxGoals; a++) {
      const p = ph * poissonPmf(a, lamAway);
      if (h > a) pHome += p;
      else if (h === a) pDraw += p;
      else pAway += p;
    }
  }
  return { pHome, pDraw, pAway };
}

export class EloPoissonModel implements StrengthModel {
  private readonly base: number;
  private readonly homeAdvantage: number;
  private readonly spread: number;
  private readonly maxGoals: number;

  constructor(
    private readonly ratings: ReadonlyMap<TeamId, number>,
    opts: EloPoissonOptions = {},
  ) {
    this.base = opts.base ?? 1.35; // calibrated
    this.homeAdvantage = opts.homeAdvantage ?? 95; // calibrated (host side; 0 for neutral)
    this.spread = opts.spread ?? 0.8; // calibrated
    this.maxGoals = opts.maxGoals ?? 10;
  }

  private rating(team: TeamId): number {
    const r = this.ratings.get(team);
    if (r === undefined) throw new Error(`EloPoissonModel: no rating for team "${team}"`);
    return r;
  }

  private params(): EloPoissonParams {
    return { base: this.base, homeAdvantage: this.homeAdvantage, spread: this.spread };
  }

  /** Expected goals for each side from the (home-adjusted) rating difference. */
  lambdas(home: TeamId, away: TeamId): { home: number; away: number } {
    return eloLambdas(this.rating(home), this.rating(away), this.params());
  }

  matchOutcome(home: TeamId, away: TeamId): Outcome {
    const lam = this.lambdas(home, away);
    return poissonWdl(lam.home, lam.away, this.maxGoals);
  }

  sampleScore(home: TeamId, away: TeamId, rng: Rng): Score {
    const lam = this.lambdas(home, away);
    return { home: samplePoisson(lam.home, rng), away: samplePoisson(lam.away, rng) };
  }

  /** Elo expected score (home-advantage included) — a cheap P(home wins) for shootouts. */
  winProbability(home: TeamId, away: TeamId): number {
    const diff = this.rating(home) + this.homeAdvantage - this.rating(away);
    return 1 / (1 + 10 ** (-diff / 400));
  }
}
