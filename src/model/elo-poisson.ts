// Elo → expected goals (λ) → Poisson scoreline. The transparent, offline reference model
// (PRD FR12; explained in docs/10-elo-poisson-model.md; shape validated by spike S3).
//
// NOTE: the constants (base/homeAdvantage/spread) are placeholders pending historical
// calibration via the S8 backtest harness. The structure is final; the numbers are not.
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

export class EloPoissonModel implements StrengthModel {
  private readonly base: number;
  private readonly homeAdvantage: number;
  private readonly spread: number;
  private readonly maxGoals: number;

  constructor(
    private readonly ratings: ReadonlyMap<TeamId, number>,
    opts: EloPoissonOptions = {},
  ) {
    this.base = opts.base ?? 1.35;
    this.homeAdvantage = opts.homeAdvantage ?? 65;
    this.spread = opts.spread ?? 0.45;
    this.maxGoals = opts.maxGoals ?? 10;
  }

  private rating(team: TeamId): number {
    const r = this.ratings.get(team);
    if (r === undefined) throw new Error(`EloPoissonModel: no rating for team "${team}"`);
    return r;
  }

  /** Expected goals for each side from the (home-adjusted) rating difference. */
  lambdas(home: TeamId, away: TeamId): { home: number; away: number } {
    const diff = this.rating(home) + this.homeAdvantage - this.rating(away);
    const tilt = Math.exp((this.spread * diff) / 400);
    return {
      home: clamp(this.base * tilt, 0.15, 6),
      away: clamp(this.base / tilt, 0.15, 6),
    };
  }

  matchOutcome(home: TeamId, away: TeamId): Outcome {
    const lam = this.lambdas(home, away);
    let pHome = 0;
    let pDraw = 0;
    let pAway = 0;
    for (let h = 0; h <= this.maxGoals; h++) {
      const ph = poissonPmf(h, lam.home);
      for (let a = 0; a <= this.maxGoals; a++) {
        const p = ph * poissonPmf(a, lam.away);
        if (h > a) pHome += p;
        else if (h === a) pDraw += p;
        else pAway += p;
      }
    }
    return { pHome, pDraw, pAway };
  }

  sampleScore(home: TeamId, away: TeamId, rng: Rng): Score {
    const lam = this.lambdas(home, away);
    return { home: samplePoisson(lam.home, rng), away: samplePoisson(lam.away, rng) };
  }
}
