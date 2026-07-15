// Vendored subset of kickpool/types/index.ts — the shapes we consume from its
// /api/standings and /api/fixtures endpoints. Join key is TeamRef.abbr.

export type MatchStatus =
  | "STATUS_SCHEDULED"
  | "STATUS_IN_PROGRESS"
  | "STATUS_HALFTIME"
  | "STATUS_FINAL"
  | "STATUS_POSTPONED";

export interface KpTeamRef {
  abbr: string;
  name: string;
  logo: string;
  friendId: string;
  friendName: string;
  friendColour: string;
}

export interface KpMatch {
  id: string;
  stage: string;
  group?: string;
  utcDate: string;
  status: MatchStatus;
  homeTeam: KpTeamRef;
  awayTeam: KpTeamRef;
  score: {
    home: number | null;
    away: number | null;
    /** Penalty-shootout scores, present only when a knockout tie was decided on penalties. */
    shootoutHome?: number | null;
    shootoutAway?: number | null;
  };
  venue: string;
  city: string;
}

export interface KpStandingsResponse {
  groups: { group: string; table: { team: KpTeamRef }[] }[];
  lastUpdated: string;
}

export interface KpFixturesResponse {
  matches: KpMatch[];
  lastUpdated: string;
}
