// Mathematical elimination: which teams can no longer reach the round of 32.
//
// A team is "out" only when it CANNOT finish in the top three of its group under any completion
// of the remaining matches — because 1st/2nd qualify outright and 3rd is at least a best-third
// candidate, so finishing last (4th) is the only certain elimination. The test is intentionally
// *sound* (it never flags a team that still has a path): it reasons on POINTS only, treating any
// points tie as resolvable in the trailing team's favour (the right scoreline can always win the
// goal-difference/head-to-head tiebreaks). It is therefore conservative — a team that can finish
// 3rd but realistically never as a *best* third still shows ~0% in the Monte Carlo, not here.
import type { TeamId } from "../domain/types";
import type { GroupInput } from "./group-engine";
import type { TournamentInput } from "./simulate";

const WIN = 3;
const DRAW = 1;
const QUALIFYING_PLACES = 3; // top three of a group can still reach the last 32

/** Points each team has already banked from the played matches. */
function basePoints(group: GroupInput): Map<TeamId, number> {
  const pts = new Map<TeamId, number>(group.teams.map((t) => [t.id, 0]));
  for (const m of group.played) {
    if (m.homeGoals > m.awayGoals) pts.set(m.home, (pts.get(m.home) ?? 0) + WIN);
    else if (m.homeGoals < m.awayGoals) pts.set(m.away, (pts.get(m.away) ?? 0) + WIN);
    else {
      pts.set(m.home, (pts.get(m.home) ?? 0) + DRAW);
      pts.set(m.away, (pts.get(m.away) ?? 0) + DRAW);
    }
  }
  return pts;
}

/**
 * Teams in a group that are mathematically eliminated from a top-three finish. Enumerates every
 * win/draw/loss combination of the remaining fixtures (3^k, k tiny for a 4-team group) and keeps
 * a team only if *no* combination leaves it with at most two rivals strictly above it on points.
 */
export function eliminatedFromGroup(group: GroupInput): TeamId[] {
  const teams = group.teams.map((t) => t.id);
  const base = basePoints(group);
  const remaining = group.remaining;
  const combos = 3 ** remaining.length;

  const out: TeamId[] = [];
  for (const team of teams) {
    let canReachTopThree = false;
    for (let c = 0; c < combos && !canReachTopThree; c++) {
      const pts = new Map(base);
      let code = c;
      for (const fx of remaining) {
        const outcome = code % 3; // 0 = home win, 1 = draw, 2 = away win
        code = Math.floor(code / 3);
        if (outcome === 0) pts.set(fx.home, pts.get(fx.home)! + WIN);
        else if (outcome === 2) pts.set(fx.away, pts.get(fx.away)! + WIN);
        else {
          pts.set(fx.home, pts.get(fx.home)! + DRAW);
          pts.set(fx.away, pts.get(fx.away)! + DRAW);
        }
      }
      const mine = pts.get(team)!;
      let strictlyAbove = 0;
      for (const other of teams) {
        if (other !== team && pts.get(other)! > mine) strictlyAbove++;
      }
      if (strictlyAbove < QUALIFYING_PLACES) canReachTopThree = true;
    }
    if (!canReachTopThree) out.push(team);
  }
  return out;
}

/** All mathematically eliminated teams across the tournament's groups. */
export function eliminatedTeams(input: TournamentInput): Set<TeamId> {
  const out = new Set<TeamId>();
  for (const group of input.groups) {
    for (const team of eliminatedFromGroup(group)) out.add(team);
  }
  return out;
}
