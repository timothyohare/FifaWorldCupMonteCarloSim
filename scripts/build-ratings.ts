// Compute current Elo ratings for the 48 qualified teams by walking the historical dataset,
// then key them by the ESPN abbreviations used in the snapshot. Writes a ratings file the
// CLI/model consume.   tsx scripts/build-ratings.ts
import { readFileSync, writeFileSync } from "node:fs";
import { EloTable } from "../src/eval/elo-ratings";

// ESPN displayName → martj42 dataset name (only where they differ).
const ALIAS: Record<string, string> = {
  Czechia: "Czech Republic",
  "Türkiye": "Turkey",
  "Congo DR": "DR Congo",
  "Bosnia-Herzegovina": "Bosnia and Herzegovina",
};

function splitCsvLine(line: string): string[] {
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

function buildEloByName(path: string): EloTable {
  const elo = new EloTable({ k: 20, homeAdvantage: 65 });
  const lines = readFileSync(path, "utf8").trim().split("\n");
  const rows: { date: string; home: string; away: string; hg: number; ag: number; neutral: boolean }[] = [];
  for (let i = 1; i < lines.length; i++) {
    const [date, home, away, hs, as, , , , neutral] = splitCsvLine(lines[i]);
    if (hs === "NA" || as === "NA" || hs === "" || as === "") continue;
    const hg = Number(hs);
    const ag = Number(as);
    if (!Number.isFinite(hg) || !Number.isFinite(ag)) continue;
    rows.push({ date, home, away, hg, ag, neutral: neutral?.toUpperCase() === "TRUE" });
  }
  rows.sort((a, b) => (a.date < b.date ? -1 : 1));
  for (const r of rows) elo.update(r.home, r.away, r.hg, r.ag, { neutral: r.neutral });
  return elo;
}

function main(): void {
  const elo = buildEloByName("data/results.csv");
  const snap = JSON.parse(readFileSync("fixtures/wc2026-snapshot.json", "utf8"));
  const teams: { abbr: string; name: string }[] = snap.standings.groups.flatMap((g: any) =>
    g.table.map((r: any) => ({ abbr: r.team.abbr, name: r.team.name })),
  );

  const ratings: Record<string, number> = {};
  const unmatched: string[] = [];
  for (const t of teams) {
    const datasetName = ALIAS[t.name] ?? t.name;
    const r = elo.snapshot().get(datasetName);
    if (r === undefined) unmatched.push(`${t.abbr} (${t.name})`);
    else ratings[t.abbr] = Math.round(r);
  }

  writeFileSync("fixtures/wc2026-ratings.json", JSON.stringify(ratings, null, 2) + "\n");
  const top = Object.entries(ratings).sort((a, b) => b[1] - a[1]).slice(0, 8);
  console.log(`wrote fixtures/wc2026-ratings.json — ${Object.keys(ratings).length}/${teams.length} teams rated`);
  console.log("top 8 by Elo:", top.map(([a, r]) => `${a} ${r}`).join(", "));
  if (unmatched.length) console.log("unmatched (will default in CLI):", unmatched.join(", "));
}

main();
