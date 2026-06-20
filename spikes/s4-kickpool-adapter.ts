// S4 — kickpool → simulator data adapter.
// Confirms we can map kickpool's `/api/standings` + `/api/fixtures` payloads into a frozen,
// hashable `TournamentState` for the simulation core. Types below MIRROR
// kickpool/types/index.ts (vendored subset) — the join key between the two systems is
// `TeamRef.abbr` (ESPN abbreviation).
import { createHash } from "node:crypto";

// ---- vendored kickpool shapes (subset of kickpool/types/index.ts) ----
type MatchStatus =
  | "STATUS_SCHEDULED"
  | "STATUS_IN_PROGRESS"
  | "STATUS_HALFTIME"
  | "STATUS_FINAL"
  | "STATUS_POSTPONED";

interface KpTeamRef {
  abbr: string;
  name: string;
  logo: string;
  friendId: string;
  friendName: string;
  friendColour: string;
}
interface KpMatch {
  id: string;
  stage: string;
  group?: string;
  utcDate: string;
  status: MatchStatus;
  homeTeam: KpTeamRef;
  awayTeam: KpTeamRef;
  score: { home: number | null; away: number | null };
  venue: string;
  city: string;
}
interface KpStandingRow {
  team: KpTeamRef;
}
interface KpGroupStanding {
  group: string;
  table: KpStandingRow[];
}
export interface KpStandingsResponse {
  groups: KpGroupStanding[];
  lastUpdated: string;
}
export interface KpFixturesResponse {
  matches: KpMatch[];
  lastUpdated: string;
}

// ---- simulator domain ----
export interface SimMatch {
  id: string;
  group: string;
  home: string; // abbr
  away: string; // abbr
  played: boolean;
  homeGoals?: number;
  awayGoals?: number;
}
export interface SimGroup {
  group: string;
  teams: string[]; // abbrs
}
export interface TournamentState {
  groups: SimGroup[];
  matches: SimMatch[];
  snapshotHash: string;
}

export class AdapterError extends Error {}

const EXPECTED_GROUP_SIZE = 4;

/** Canonical stable JSON (sorted keys) so the hash is order-independent. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    return `{${Object.keys(obj)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical(obj[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

/**
 * Map kickpool payloads → a frozen TournamentState. Throws AdapterError on malformed input
 * so a bad snapshot fails loudly (FR4) rather than silently producing wrong odds.
 */
export function fromKickpool(
  standings: KpStandingsResponse,
  fixtures: KpFixturesResponse,
  opts: { expectedGroupSize?: number } = {},
): TournamentState {
  const groupSize = opts.expectedGroupSize ?? EXPECTED_GROUP_SIZE;

  const groups: SimGroup[] = standings.groups.map((g) => {
    const teams = g.table.map((r) => r.team.abbr);
    if (new Set(teams).size !== teams.length) {
      throw new AdapterError(`Group ${g.group} has duplicate teams`);
    }
    if (teams.length !== groupSize) {
      throw new AdapterError(
        `Group ${g.group} has ${teams.length} teams, expected ${groupSize}`,
      );
    }
    return { group: g.group, teams };
  });

  const membership = new Map<string, string>(); // abbr -> group
  for (const g of groups) for (const abbr of g.teams) membership.set(abbr, g.group);

  const matches: SimMatch[] = fixtures.matches
    .filter((mt) => mt.stage === "GROUP_STAGE")
    .map((mt) => {
      const { homeTeam, awayTeam, score, status, group, id } = mt;
      for (const t of [homeTeam.abbr, awayTeam.abbr]) {
        if (!membership.has(t)) {
          throw new AdapterError(`Match ${id}: team ${t} is not in any group's standings`);
        }
      }
      if (group && (membership.get(homeTeam.abbr) !== group || membership.get(awayTeam.abbr) !== group)) {
        throw new AdapterError(`Match ${id}: declared group ${group} disagrees with standings`);
      }
      const played = status === "STATUS_FINAL";
      const hasScore = score.home !== null && score.away !== null;
      if (played && !hasScore) {
        throw new AdapterError(`Match ${id} is FINAL but missing a score`);
      }
      if (!played && hasScore && status !== "STATUS_IN_PROGRESS" && status !== "STATUS_HALFTIME") {
        throw new AdapterError(`Match ${id} is ${status} but already has a score`);
      }
      const resolvedGroup = group ?? membership.get(homeTeam.abbr)!;
      return {
        id,
        group: resolvedGroup,
        home: homeTeam.abbr,
        away: awayTeam.abbr,
        played,
        ...(played ? { homeGoals: score.home!, awayGoals: score.away! } : {}),
      };
    });

  const snapshotHash = createHash("sha256")
    .update(canonical({ groups, matches }))
    .digest("hex")
    .slice(0, 16);

  return { groups, matches, snapshotHash };
}

/** Convenience splits the engine will want. */
export function remainingMatches(state: TournamentState): SimMatch[] {
  return state.matches.filter((m) => !m.played);
}
export function playedMatches(state: TournamentState): SimMatch[] {
  return state.matches.filter((m) => m.played);
}
