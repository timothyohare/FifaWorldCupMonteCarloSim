// Core simulator domain types. Stable, framework-free; shared across engine modules.

export type TeamId = string; // ESPN abbreviation, matching kickpool's TeamRef.abbr

export interface TeamMeta {
  id: TeamId;
  /** Fair-play/conduct score: higher is better (FIFA uses negative card points; pass as-is). */
  conduct?: number;
  /** FIFA world ranking position: lower is better. */
  fifaRank?: number;
}

export interface MatchResult {
  home: TeamId;
  away: TeamId;
  homeGoals: number;
  awayGoals: number;
}

/** A fully-ranked group-standings row. `position` is 1-based after tiebreakers. */
export interface TableRow {
  team: TeamId;
  position: number;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
  /** True if this row could only be separated from the one above it by drawing of lots. */
  rankedByLots?: boolean;
}
