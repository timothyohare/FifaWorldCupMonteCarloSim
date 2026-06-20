// Maps a frozen kickpool snapshot (standings + fixtures) into the engine's TournamentInput.
// Validates loudly (PRD FR4) so a bad snapshot fails fast rather than skewing odds.
// Promotes the validated spike S4 logic into the production IO edge.
import type { GroupInput } from "../engine/group-engine";
import type { TournamentInput } from "../engine/simulate";
import type { MatchResult } from "../domain/types";
import type { KpFixturesResponse, KpStandingsResponse } from "./kickpool-types";

export interface KickpoolSnapshot {
  standings: KpStandingsResponse;
  fixtures: KpFixturesResponse;
}

export class SnapshotError extends Error {}

const EXPECTED_GROUP_SIZE = 4;

export function fromKickpoolSnapshot(
  snapshot: KickpoolSnapshot,
  opts: { expectedGroupSize?: number; bestThirds?: number } = {},
): TournamentInput {
  const groupSize = opts.expectedGroupSize ?? EXPECTED_GROUP_SIZE;
  const membership = new Map<string, string>(); // abbr -> group

  const groups: GroupInput[] = snapshot.standings.groups.map((g) => {
    const teamIds = g.table.map((r) => r.team.abbr);
    if (new Set(teamIds).size !== teamIds.length) throw new SnapshotError(`Group ${g.group} has duplicate teams`);
    if (teamIds.length !== groupSize) {
      throw new SnapshotError(`Group ${g.group} has ${teamIds.length} teams, expected ${groupSize}`);
    }
    for (const id of teamIds) membership.set(id, g.group);
    return { group: g.group, teams: teamIds.map((id) => ({ id })), played: [], remaining: [] };
  });

  const byLetter = new Map(groups.map((g) => [g.group, g]));

  for (const mt of snapshot.fixtures.matches) {
    if (mt.stage !== "GROUP_STAGE") continue;
    const home = mt.homeTeam.abbr;
    const away = mt.awayTeam.abbr;
    for (const t of [home, away]) {
      if (!membership.has(t)) throw new SnapshotError(`Match ${mt.id}: team ${t} is not in any group`);
    }
    const groupLetter = mt.group ?? membership.get(home)!;
    if (membership.get(home) !== groupLetter || membership.get(away) !== groupLetter) {
      throw new SnapshotError(`Match ${mt.id}: declared group ${mt.group} disagrees with standings`);
    }
    const target = byLetter.get(groupLetter)!;
    const played = mt.status === "STATUS_FINAL";
    const hasScore = mt.score.home !== null && mt.score.away !== null;
    if (played) {
      if (!hasScore) throw new SnapshotError(`Match ${mt.id} is FINAL but missing a score`);
      const result: MatchResult = { home, away, homeGoals: mt.score.home!, awayGoals: mt.score.away! };
      target.played.push(result);
    } else {
      target.remaining.push({ home, away });
    }
  }

  return { groups, bestThirds: opts.bestThirds };
}
