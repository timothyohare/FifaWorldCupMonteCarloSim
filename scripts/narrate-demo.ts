// Live narrator demo: compares pre-tournament title odds ("before") with current-standings
// odds ("after") for the real 2026 snapshot, then asks Claude to explain the movers.
//   tsx scripts/narrate-demo.ts     (requires ANTHROPIC_API_KEY; loads .env)
import { readFileSync } from "node:fs";
import { runTournament } from "../src/engine/tournament";
import { fromKickpoolSnapshot, type KickpoolSnapshot } from "../src/io/snapshot";
import { EloPoissonModel } from "../src/model/elo-poisson";
import { AnthropicNarratorClient } from "../src/narrate/anthropic-client";
import { generateNarrative, type ResultRow } from "../src/narrate/narrator";
import type { TournamentInput } from "../src/engine/simulate";

// Minimal .env loader (Node 18 has no --env-file).
function loadEnv(): void {
  try {
    for (const line of readFileSync(".env", "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch {
    /* no .env — rely on the ambient environment */
  }
}

/** Move every played match back to "remaining" → a pre-tournament view of the same teams. */
function preTournament(input: TournamentInput): TournamentInput {
  return {
    ...input,
    groups: input.groups.map((g) => ({
      ...g,
      played: [],
      remaining: [...g.played.map((m) => ({ home: m.home, away: m.away })), ...g.remaining],
    })),
  };
}

const toRows = (rs: { teams: { team: string; champion: number }[] }): ResultRow[] =>
  rs.teams.map((t) => ({ team: t.team, champion: t.champion }));

async function main(): Promise<void> {
  loadEnv();
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY not set (.env)");

  const snapshot = JSON.parse(readFileSync("fixtures/wc2026-snapshot.json", "utf8")) as KickpoolSnapshot;
  const ratings = JSON.parse(readFileSync("fixtures/wc2026-ratings.json", "utf8")) as Record<string, number>;
  const input = fromKickpoolSnapshot(snapshot, { bestThirds: 8 });
  const model = new EloPoissonModel(new Map(Object.entries(ratings)), { homeAdvantage: 0 });

  const sims = 20000;
  const after = runTournament(input, model, { sims, seed: 1 });
  const before = runTournament(preTournament(input), model, { sims, seed: 1 });

  const res = await generateNarrative(toRows(before), toRows(after), new AnthropicNarratorClient(), 4);

  console.log("\nTop movers (pre-tournament → current standings):");
  for (const m of res.movers) {
    console.log(`  ${m.team}: ${(m.before * 100).toFixed(1)}% → ${(m.after * 100).toFixed(1)}% (${m.delta >= 0 ? "+" : ""}${(m.delta * 100).toFixed(1)}pp)`);
  }
  console.log("\nNarrative:\n  " + res.narrative.replace(/\n/g, "\n  "));
  console.log(`\nGuardrail: ${res.violations.length === 0 ? "no unsanctioned numbers ✓" : "VIOLATIONS: " + res.violations.join(", ")}\n`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
