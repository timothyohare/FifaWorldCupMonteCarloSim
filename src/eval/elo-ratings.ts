// World-Football-Elo-style ratings, evolved match-by-match over historical results.
// Used to derive pre-match team strengths for the calibration backtest (S3/S8). See
// docs/12-rules-sources.md (Q7) and https://en.wikipedia.org/wiki/World_Football_Elo_Ratings.
import type { TeamId } from "../domain/types";

export interface EloOptions {
  /** Base K-factor (match-importance weight). */
  k?: number;
  /** Home-advantage bonus in Elo points (skipped for neutral venues). */
  homeAdvantage?: number;
  /** Starting rating for an unseen team. */
  initial?: number;
}

/** Goal-difference multiplier (World Football Elo). */
function marginMultiplier(goalDiff: number): number {
  const d = Math.abs(goalDiff);
  if (d <= 1) return 1;
  if (d === 2) return 1.5;
  return (11 + d) / 8;
}

export class EloTable {
  private readonly ratings = new Map<TeamId, number>();
  private readonly k: number;
  private readonly homeAdvantage: number;
  private readonly initial: number;

  constructor(opts: EloOptions = {}) {
    this.k = opts.k ?? 20;
    this.homeAdvantage = opts.homeAdvantage ?? 65;
    this.initial = opts.initial ?? 1500;
  }

  get(team: TeamId): number {
    return this.ratings.get(team) ?? this.initial;
  }

  set(team: TeamId, rating: number): void {
    this.ratings.set(team, rating);
  }

  /** Expected home score (0..1) including home advantage unless neutral. */
  expected(home: TeamId, away: TeamId, neutral: boolean): number {
    const adv = neutral ? 0 : this.homeAdvantage;
    const diff = this.get(home) + adv - this.get(away);
    return 1 / (1 + 10 ** (-diff / 400));
  }

  /** Apply one result, updating both teams (zero-sum). */
  update(
    home: TeamId,
    away: TeamId,
    homeGoals: number,
    awayGoals: number,
    opts: { neutral?: boolean } = {},
  ): void {
    const neutral = opts.neutral ?? false;
    const we = this.expected(home, away, neutral);
    const w = homeGoals > awayGoals ? 1 : homeGoals === awayGoals ? 0.5 : 0;
    const delta = this.k * marginMultiplier(homeGoals - awayGoals) * (w - we);
    this.set(home, this.get(home) + delta);
    this.set(away, this.get(away) - delta);
  }

  snapshot(): Map<TeamId, number> {
    return new Map(this.ratings);
  }
}
