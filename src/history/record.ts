// Persisted daily-odds history: a per-day JSON record plus an append-only CSV time-series
// (long format) for plotting how each team's odds move as the tournament progresses.
import type { FullResultSet, TeamFullProbs } from "../engine/tournament";

export interface DailyRecord {
  date: string; // YYYY-MM-DD (UTC)
  generatedAt: string; // ISO timestamp
  snapshotHash: string;
  bracket: string;
  sims: number;
  seed: number;
  narrative?: string;
  teams: TeamFullProbs[];
}

export function toDailyRecord(
  date: string,
  rs: FullResultSet,
  opts: { snapshotHash: string; narrative?: string },
): DailyRecord {
  return {
    date,
    generatedAt: new Date().toISOString(),
    snapshotHash: opts.snapshotHash,
    bracket: rs.metadata.bracket,
    sims: rs.metadata.sims,
    seed: rs.metadata.seed,
    narrative: opts.narrative,
    teams: rs.teams,
  };
}

export const CSV_HEADER = "date,team,group,champion,runnerUp,reachFinal,reachSemi,escapeGroup";

const f = (n: number) => n.toFixed(4);

export function toCsvRows(date: string, teams: TeamFullProbs[]): string[] {
  return teams.map(
    (t) => `${date},${t.team},${t.group},${f(t.champion)},${f(t.runnerUp)},${f(t.reachFinal)},${f(t.reachSemi)},${f(t.escapeGroup)}`,
  );
}

/**
 * Insert today's rows into the CSV, replacing any existing rows for the same date
 * (idempotent — safe to re-run a day). Rows are kept in date order.
 */
export function upsertCsv(existing: string | null, date: string, rows: string[]): string {
  const kept = (existing ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && l !== CSV_HEADER && !l.startsWith(`${date},`));
  const all = [...kept, ...rows].sort((a, b) => a.localeCompare(b)); // date is the leading field
  return [CSV_HEADER, ...all].join("\n") + "\n";
}
