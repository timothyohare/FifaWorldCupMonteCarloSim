// Build current Elo ratings for the qualified teams from the historical results CSV, keyed by
// the ESPN abbreviations used in snapshots. Pure + unit-tested so the daily job can rely on it.
import { EloTable } from "./elo-ratings";

/** ESPN displayName → martj42 dataset name (only where they differ). */
export const ESPN_TO_DATASET: Record<string, string> = {
  Czechia: "Czech Republic",
  "Türkiye": "Turkey",
  "Congo DR": "DR Congo",
  "Bosnia-Herzegovina": "Bosnia and Herzegovina",
};

export function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') q = !q;
    else if (ch === "," && !q) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

/** Walk the results CSV chronologically and return final Elo by dataset team name. */
export function eloRatingsByName(csvText: string, opts: { k?: number; homeAdvantage?: number } = {}): Map<string, number> {
  const elo = new EloTable({ k: opts.k ?? 20, homeAdvantage: opts.homeAdvantage ?? 65 });
  const lines = csvText.trim().split("\n");
  const rows: { date: string; home: string; away: string; hg: number; ag: number; neutral: boolean }[] = [];
  for (let i = 1; i < lines.length; i++) {
    const [date, home, away, hs, as, , , , neutral] = splitCsvLine(lines[i]);
    if (hs === "NA" || as === "NA" || hs === "" || as === "" || hs === undefined) continue;
    const hg = Number(hs);
    const ag = Number(as);
    if (!Number.isFinite(hg) || !Number.isFinite(ag)) continue;
    rows.push({ date, home, away, hg, ag, neutral: neutral?.toUpperCase() === "TRUE" });
  }
  rows.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  for (const r of rows) elo.update(r.home, r.away, r.hg, r.ag, { neutral: r.neutral });
  return elo.snapshot();
}

/** Map ratings onto ESPN-abbreviation teams (via the alias table); report any misses. */
export function ratingsForTeams(
  byName: Map<string, number>,
  teams: { abbr: string; name: string }[],
): { ratings: Record<string, number>; unmatched: string[] } {
  const ratings: Record<string, number> = {};
  const unmatched: string[] = [];
  for (const t of teams) {
    const datasetName = ESPN_TO_DATASET[t.name] ?? t.name;
    const r = byName.get(datasetName);
    if (r === undefined) unmatched.push(`${t.abbr} (${t.name})`);
    else ratings[t.abbr] = Math.round(r);
  }
  return { ratings, unmatched };
}
