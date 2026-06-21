// Daily odds capture: refresh data, run the sim, and append to history/ so we can watch the
// title odds move as the tournament unfolds. Designed for the GitHub Actions cron, but runs
// locally too.  tsx scripts/run-daily.ts [YYYY-MM-DD]
//
// Steps: download historical results → fetch live ESPN snapshot → recompute Elo ratings →
// run the tournament → write history/<date>.json + update history/champion-odds.csv →
// (if ANTHROPIC_API_KEY set and a prior day exists) add a "what changed" note.
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { fetchEspnSnapshot } from "../src/io/espn-provider";
import { fromKickpoolSnapshot } from "../src/io/snapshot";
import { eloRatingsByName, ratingsForTeams } from "../src/eval/team-ratings";
import { EloPoissonModel } from "../src/model/elo-poisson";
import { runTournament } from "../src/engine/tournament";
import { toCsvRows, toDailyRecord, upsertCsv } from "../src/history/record";
import { generateNarrative, type ResultRow } from "../src/narrate/narrator";
import { AnthropicNarratorClient } from "../src/narrate/anthropic-client";
import type { DailyRecord } from "../src/history/record";

const RESULTS_CSV = "https://raw.githubusercontent.com/martj42/international_results/master/results.csv";
const SIMS = 100_000;
const SEED = 1;
const HISTORY = "history";

function loadEnv(): void {
  try {
    for (const line of readFileSync(".env", "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch { /* rely on ambient env (CI secrets) */ }
}

const toRows = (teams: { team: string; champion: number }[]): ResultRow[] =>
  teams.map((t) => ({ team: t.team, champion: t.champion }));

/** Most recent history record strictly before `date`, if any. */
function previousRecord(date: string): DailyRecord | null {
  let files: string[] = [];
  try {
    files = readdirSync(HISTORY).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f) && f.slice(0, 10) < date);
  } catch { return null; }
  if (!files.length) return null;
  files.sort();
  return JSON.parse(readFileSync(`${HISTORY}/${files[files.length - 1]}`, "utf8")) as DailyRecord;
}

async function main(): Promise<void> {
  loadEnv();
  const date = process.argv[2] ?? new Date().toISOString().slice(0, 10);
  mkdirSync(HISTORY, { recursive: true });
  mkdirSync("fixtures", { recursive: true });

  console.log(`[${date}] refreshing historical results…`);
  const csv = await fetch(RESULTS_CSV).then((r) => r.text());
  writeFileSync("data/results.csv", csv);

  console.log(`[${date}] fetching live ESPN snapshot…`);
  const snapshot = await fetchEspnSnapshot();
  writeFileSync("fixtures/wc2026-snapshot.json", JSON.stringify(snapshot, null, 2));

  const teams = snapshot.standings.groups.flatMap((g) => g.table.map((r) => ({ abbr: r.team.abbr, name: r.team.name })));
  const { ratings, unmatched } = ratingsForTeams(eloRatingsByName(csv), teams);
  if (unmatched.length) console.warn(`  unmatched ratings (defaulted): ${unmatched.join(", ")}`);
  writeFileSync("fixtures/wc2026-ratings.json", JSON.stringify(ratings, null, 2) + "\n");

  const input = fromKickpoolSnapshot(snapshot, { bestThirds: 8 });
  const model = new EloPoissonModel(new Map(Object.entries(ratings)), { homeAdvantage: 0 });
  console.log(`[${date}] simulating ${SIMS.toLocaleString()} tournaments…`);
  const rs = runTournament(input, model, { sims: SIMS, seed: SEED });
  const snapshotHash = createHash("sha256").update(JSON.stringify(snapshot.fixtures)).digest("hex").slice(0, 16);

  // Optional "what changed since last run" note.
  let narrative: string | undefined;
  const prev = previousRecord(date);
  if (prev && process.env.ANTHROPIC_API_KEY) {
    try {
      console.log(`[${date}] narrating movers vs ${prev.date}…`);
      const res = await generateNarrative(toRows(prev.teams), toRows(rs.teams), new AnthropicNarratorClient(), 4);
      narrative = res.violations.length ? `${res.narrative}\n\n[guardrail flagged: ${res.violations.join(", ")}]` : res.narrative;
    } catch (e) {
      console.warn(`  narrator skipped: ${(e as Error).message}`);
    }
  }

  const record = toDailyRecord(date, rs, { snapshotHash, narrative });
  writeFileSync(`${HISTORY}/${date}.json`, JSON.stringify(record, null, 2) + "\n");
  writeFileSync(`${HISTORY}/latest.json`, JSON.stringify(record, null, 2) + "\n");

  let existing: string | null = null;
  try { existing = readFileSync(`${HISTORY}/champion-odds.csv`, "utf8"); } catch { /* first run */ }
  writeFileSync(`${HISTORY}/champion-odds.csv`, upsertCsv(existing, date, toCsvRows(date, rs.teams)));

  const top = rs.teams.slice(0, 5).map((t) => `${t.team} ${(t.champion * 100).toFixed(1)}%`).join(", ");
  console.log(`[${date}] done. Top: ${top}`);
  if (narrative) console.log(`\n${narrative}\n`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
