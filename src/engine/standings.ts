// Group standings + FIFA 2026 Article 13 tiebreakers.
//
// Order after equal points:
//   1. H2H points  2. H2H GD  3. H2H goals   (computed among the tied subset only)
//   4. overall GD  5. overall goals  6. conduct/fair-play  7. FIFA ranking   (8. lots)
//
// Head-to-head precedes overall goal difference (the 2026 reversal of 2022), and a tie that
// only partly resolves is re-evaluated from the top among the still-tied subset — so H2H is
// recomputed against the smaller set. Validated by spike S2; this is the production module.
import type { MatchResult, TableRow, TeamId, TeamMeta } from "../domain/types";

const WIN = 3;
const DRAW = 1;

interface Tally {
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
}

function tally(team: TeamId, matches: MatchResult[]): Tally {
  const t: Tally = { played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0 };
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
    t.played += 1;
    t.goalsFor += scored;
    t.goalsAgainst += conceded;
    if (scored > conceded) t.won += 1;
    else if (scored === conceded) t.drawn += 1;
    else t.lost += 1;
  }
  return t;
}

const points = (t: Tally) => t.won * WIN + t.drawn * DRAW;
const goalDiff = (t: Tally) => t.goalsFor - t.goalsAgainst;

interface Ctx {
  all: MatchResult[];
  meta: Map<TeamId, TeamMeta>;
}

type Criterion = (team: TeamId, ctx: Ctx) => number;

/** Head-to-head criteria over `within` (the matches played among the tied subset only). */
function h2hCriteria(within: MatchResult[]): Criterion[] {
  return [
    (team) => points(tally(team, within)),
    (team) => goalDiff(tally(team, within)),
    (team) => tally(team, within).goalsFor,
  ];
}

const overallCriteria: Criterion[] = [
  (team, ctx) => goalDiff(tally(team, ctx.all)),
  (team, ctx) => tally(team, ctx.all).goalsFor,
  (team, ctx) => ctx.meta.get(team)?.conduct ?? 0,
  // Lower FIFA rank is better → negate so "higher score first" holds throughout.
  (team, ctx) => -(ctx.meta.get(team)?.fifaRank ?? Number.POSITIVE_INFINITY),
];

function partition(teams: TeamId[], score: Criterion, ctx: Ctx): TeamId[][] {
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

interface Resolved {
  id: TeamId;
  byLots: boolean;
}

/** Resolve a points-tied subset via criteria, re-applying H2H among any shrunken tie. */
function resolve(subset: TeamId[], ctx: Ctx): Resolved[] {
  if (subset.length === 1) return [{ id: subset[0], byLots: false }];

  // Matches among only the tied teams — computed once, so H2H reflects the current subset.
  const inSet = new Set(subset);
  const within = ctx.all.filter((m) => inSet.has(m.home) && inSet.has(m.away));
  const criteria = [...h2hCriteria(within), ...overallCriteria];
  for (const criterion of criteria) {
    const buckets = partition(subset, criterion, ctx);
    if (buckets.length > 1) {
      return buckets.flatMap((b) => (b.length === 1 ? [{ id: b[0], byLots: false }] : resolve(b, ctx)));
    }
  }
  // Nothing separated them → drawing of lots. Deterministic by id for reproducibility.
  return [...subset]
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
    .map((id, idx) => ({ id, byLots: idx > 0 }));
}

/** Rank a group: order by overall points, break ties via Article 13, emit full rows. */
export function rankGroup(teams: TeamMeta[], matches: MatchResult[]): TableRow[] {
  const ctx: Ctx = { all: matches, meta: new Map(teams.map((t) => [t.id, t])) };
  const ordered = partition(teams.map((t) => t.id), (team, c) => points(tally(team, c.all)), ctx).flatMap(
    (bucket) => (bucket.length === 1 ? [{ id: bucket[0], byLots: false }] : resolve(bucket, ctx)),
  );

  return ordered.map((r, idx) => {
    const t = tally(r.id, matches);
    return {
      team: r.id,
      position: idx + 1,
      played: t.played,
      won: t.won,
      drawn: t.drawn,
      lost: t.lost,
      goalsFor: t.goalsFor,
      goalsAgainst: t.goalsAgainst,
      goalDifference: goalDiff(t),
      points: points(t),
      ...(r.byLots ? { rankedByLots: true } : {}),
    };
  });
}
