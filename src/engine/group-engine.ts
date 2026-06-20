// GroupEngine — completes a group's remaining fixtures by sampling the strength model, ranks
// the final table (FIFA tiebreakers), and selects qualifiers for the 2026 knockout stage.
import type { Rng } from "../domain/rng";
import type { MatchResult, TableRow, TeamId, TeamMeta } from "../domain/types";
import type { StrengthModel } from "../model/strength-model";
import { rankGroup } from "./standings";

export interface RemainingFixture {
  home: TeamId;
  away: TeamId;
}

export interface GroupInput {
  group: string;
  teams: TeamMeta[];
  played: MatchResult[];
  remaining: RemainingFixture[];
}

export interface GroupResult {
  group: string;
  table: TableRow[];
}

/** Sample every remaining fixture, then rank the completed group. */
export function completeGroup(input: GroupInput, model: StrengthModel, rng: Rng): GroupResult {
  const sampled: MatchResult[] = input.remaining.map((fx) => {
    const score = model.sampleScore(fx.home, fx.away, rng);
    return { home: fx.home, away: fx.away, homeGoals: score.home, awayGoals: score.away };
  });
  return {
    group: input.group,
    table: rankGroup(input.teams, [...input.played, ...sampled]),
  };
}

export interface Qualifiers {
  winners: TeamId[];
  runnersUp: TeamId[];
  bestThirds: TeamId[];
}

export interface SelectOptions {
  /** How many third-placed teams advance (8 in the 2026 format). */
  bestThirds?: number;
  /** Optional conduct/ranking metadata for breaking ties among third-placed teams. */
  meta?: ReadonlyMap<TeamId, TeamMeta>;
}

const rowAt = (r: GroupResult, position: number): TableRow => {
  const row = r.table.find((x) => x.position === position);
  if (!row) throw new Error(`group ${r.group} has no team in position ${position}`);
  return row;
};

/**
 * Pick winners (1st), runners-up (2nd), and the N best third-placed teams across groups.
 * Third-placed ranking (no head-to-head — different groups):
 *   points → goal difference → goals scored → conduct → FIFA ranking.
 */
export function selectQualifiers(results: GroupResult[], opts: SelectOptions = {}): Qualifiers {
  const bestThirds = opts.bestThirds ?? 8;
  const meta = opts.meta;

  const thirds = results.map((r) => rowAt(r, 3));
  const ranked = [...thirds].sort((a, b) => {
    if (a.points !== b.points) return b.points - a.points;
    if (a.goalDifference !== b.goalDifference) return b.goalDifference - a.goalDifference;
    if (a.goalsFor !== b.goalsFor) return b.goalsFor - a.goalsFor;
    const ac = meta?.get(a.team)?.conduct ?? 0;
    const bc = meta?.get(b.team)?.conduct ?? 0;
    if (ac !== bc) return bc - ac;
    const ar = meta?.get(a.team)?.fifaRank ?? Number.POSITIVE_INFINITY;
    const br = meta?.get(b.team)?.fifaRank ?? Number.POSITIVE_INFINITY;
    return ar - br;
  });

  return {
    winners: results.map((r) => rowAt(r, 1).team),
    runnersUp: results.map((r) => rowAt(r, 2).team),
    bestThirds: ranked.slice(0, bestThirds).map((r) => r.team),
  };
}
