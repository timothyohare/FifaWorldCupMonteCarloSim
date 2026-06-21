// Compute current Elo ratings for the 48 snapshot teams from the historical dataset and key
// them by ESPN abbreviation.   tsx scripts/build-ratings.ts
import { readFileSync, writeFileSync } from "node:fs";
import { eloRatingsByName, ratingsForTeams } from "../src/eval/team-ratings";

function main(): void {
  const csv = readFileSync("data/results.csv", "utf8");
  const snap = JSON.parse(readFileSync("fixtures/wc2026-snapshot.json", "utf8"));
  const teams: { abbr: string; name: string }[] = snap.standings.groups.flatMap((g: any) =>
    g.table.map((r: any) => ({ abbr: r.team.abbr, name: r.team.name })),
  );

  const { ratings, unmatched } = ratingsForTeams(eloRatingsByName(csv), teams);
  writeFileSync("fixtures/wc2026-ratings.json", JSON.stringify(ratings, null, 2) + "\n");

  const top = Object.entries(ratings).sort((a, b) => b[1] - a[1]).slice(0, 8);
  console.log(`wrote fixtures/wc2026-ratings.json — ${Object.keys(ratings).length}/${teams.length} teams rated`);
  console.log("top 8 by Elo:", top.map(([a, r]) => `${a} ${r}`).join(", "));
  if (unmatched.length) console.log("unmatched (will default in CLI):", unmatched.join(", "));
}

main();
