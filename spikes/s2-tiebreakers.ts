// S2 — FIFA 2026 group tiebreaker engine (Article 13).
// Headline risk: head-to-head is applied BEFORE overall goal difference (a reversal of
// 2022), and 3+-way ties re-apply the head-to-head criteria among the still-tied subset.
//
// Order (after equal points):
//   1. H2H points  2. H2H GD  3. H2H goals  (computed among the tied subset only)
//   4. overall GD  5. overall goals  6. conduct/fair-play  7. FIFA ranking  (8. lots)
import type { MatchResult, TeamId } from "./domain";

export interface TeamMeta {
  id: TeamId;
  /** Fair-play score: higher is better (FIFA uses negative card points; pass them as-is). */
  conduct?: number;
  /** FIFA world ranking position: lower is better. */
  fifaRank?: number;
}

export interface RankedTeam {
  id: TeamId;
  /** True if this team could only be separated from a neighbour by drawing of lots. */
  byLots?: boolean;
}

const WIN = 3;
const DRAW = 1;

interface Tally {
  points: number;
  gd: number;
  gf: number;
}

function tally(team: TeamId, matches: MatchResult[]): Tally {
  let points = 0;
  let gd = 0;
  let gf = 0;
  for (const m of matches) {
    let scored: number;
    let conceded: number;
    if (m.home === team) {
      scored = m.homeGoals;
      conceded = m.awayGoals;
    } else if (m.away === team) {
      scored = m.awayGoals;
      conceded = m.homeGoals;
    } else {
      continue;
    }
    gf += scored;
    gd += scored - conceded;
    points += scored > conceded ? WIN : scored === conceded ? DRAW : 0;
  }
  return { points, gd, gf };
}

/** Matches where BOTH teams are in `subset` — for head-to-head criteria. */
function subsetMatches(subset: Set<TeamId>, matches: MatchResult[]): MatchResult[] {
  return matches.filter((m) => subset.has(m.home) && subset.has(m.away));
}

// Each criterion maps a team to a numeric score; higher ranks first.
type Criterion = (team: TeamId, ctx: ResolveCtx) => number;

interface ResolveCtx {
  all: MatchResult[];
  meta: Map<TeamId, TeamMeta>;
}

// Criteria 1-3 are head-to-head: recomputed against whatever subset is currently tied.
function h2hCriteria(subset: TeamId[], ctx: ResolveCtx): Criterion[] {
  const within = subsetMatches(new Set(subset), ctx.all);
  const t = (team: TeamId) => tally(team, within);
  return [
    (team) => t(team).points,
    (team) => t(team).gd,
    (team) => t(team).gf,
  ];
}

// Criteria 4-7 use overall stats / external data.
function overallCriteria(ctx: ResolveCtx): Criterion[] {
  return [
    (team) => tally(team, ctx.all).gd,
    (team) => tally(team, ctx.all).gf,
    (team) => ctx.meta.get(team)?.conduct ?? 0,
    // Lower FIFA rank is better → negate so "higher score first" still holds.
    (team) => -(ctx.meta.get(team)?.fifaRank ?? Number.POSITIVE_INFINITY),
  ];
}

function partition(teams: TeamId[], score: Criterion, ctx: ResolveCtx): TeamId[][] {
  const scored = teams.map((id) => ({ id, s: score(id, ctx) }));
  scored.sort((a, b) => b.s - a.s);
  const buckets: TeamId[][] = [];
  for (const { id, s } of scored) {
    const last = buckets[buckets.length - 1];
    if (last && score(last[0], ctx) === s) last.push(id);
    else buckets.push([id]);
  }
  return buckets;
}

// `h2hIndex` lets us re-apply head-to-head from the top when a tie shrinks.
function resolve(subset: TeamId[], ctx: ResolveCtx): RankedTeam[] {
  if (subset.length === 1) return [{ id: subset[0] }];

  // Criteria list is rebuilt per subset so H2H reflects the current tied set.
  const criteria: Criterion[] = [...h2hCriteria(subset, ctx), ...overallCriteria(ctx)];

  for (let i = 0; i < criteria.length; i++) {
    const buckets = partition(subset, criteria[i], ctx);
    if (buckets.length > 1) {
      const out: RankedTeam[] = [];
      for (const bucket of buckets) {
        // A surviving multi-team bucket is re-resolved from scratch: if the split happened
        // on a head-to-head criterion (i < 3), H2H is recomputed among the smaller set.
        out.push(...(bucket.length === 1 ? [{ id: bucket[0] }] : resolve(bucket, ctx)));
      }
      return out;
    }
  }
  // Nothing separated them → drawing of lots. Deterministic by id for reproducibility.
  return [...subset]
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
    .map((id, idx) => ({ id, byLots: idx > 0 }));
}

/** Rank a group: order by overall points, then break ties via Article 13. */
export function rankGroup(teams: TeamMeta[], matches: MatchResult[]): RankedTeam[] {
  const ctx: ResolveCtx = {
    all: matches,
    meta: new Map(teams.map((t) => [t.id, t])),
  };
  const byPoints = partition(
    teams.map((t) => t.id),
    (team) => tally(team, matches).points,
    ctx,
  );
  const out: RankedTeam[] = [];
  for (const bucket of byPoints) {
    out.push(...(bucket.length === 1 ? [{ id: bucket[0] }] : resolve(bucket, ctx)));
  }
  return out;
}

/**
 * Rank third-placed teams ACROSS groups (no head-to-head — they did not all meet):
 * points → goal difference → goals scored → conduct → FIFA ranking.
 */
export function rankThirdPlaced(
  thirds: { team: TeamMeta; tally: Tally }[],
): TeamId[] {
  return [...thirds]
    .sort((a, b) => {
      if (a.tally.points !== b.tally.points) return b.tally.points - a.tally.points;
      if (a.tally.gd !== b.tally.gd) return b.tally.gd - a.tally.gd;
      if (a.tally.gf !== b.tally.gf) return b.tally.gf - a.tally.gf;
      const ac = a.team.conduct ?? 0;
      const bc = b.team.conduct ?? 0;
      if (ac !== bc) return bc - ac;
      const ar = a.team.fifaRank ?? Number.POSITIVE_INFINITY;
      const br = b.team.fifaRank ?? Number.POSITIVE_INFINITY;
      return ar - br;
    })
    .map((x) => x.team.id);
}

export { tally };
export type { Tally };
