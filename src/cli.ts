// CLI: load a kickpool snapshot, run the group-stage Monte Carlo, print an odds table.
// Usage:
//   tsx src/cli.ts --snapshot fixtures/sample-snapshot.json [--ratings f.json]
//                  [--sims 100000] [--seed 1] [--best-thirds 8] [--home-adv 0]
import { readFileSync } from "node:fs";
import { EloPoissonModel } from "./model/elo-poisson";
import { runGroupStage } from "./engine/simulate";
import { fromKickpoolSnapshot, type KickpoolSnapshot } from "./io/snapshot";
import type { TeamId } from "./domain/types";

interface Args {
  snapshot?: string;
  ratings?: string;
  sims: number;
  seed: number;
  bestThirds: number;
  homeAdv: number;
}

function parseArgs(argv: string[]): Args {
  const a: Args = { sims: 100_000, seed: 1, bestThirds: 8, homeAdv: 0 };
  for (let i = 0; i < argv.length; i++) {
    const next = () => argv[++i];
    switch (argv[i]) {
      case "--snapshot": a.snapshot = next(); break;
      case "--ratings": a.ratings = next(); break;
      case "--sims": a.sims = Number(next()); break;
      case "--seed": a.seed = Number(next()); break;
      case "--best-thirds": a.bestThirds = Number(next()); break;
      case "--home-adv": a.homeAdv = Number(next()); break;
      default: throw new Error(`unknown argument: ${argv[i]}`);
    }
  }
  if (!a.snapshot) throw new Error("missing required --snapshot <path>");
  return a;
}

function loadRatings(path: string | undefined, teams: TeamId[]): ReadonlyMap<TeamId, number> {
  const DEFAULT = 1800;
  const provided: Record<string, number> = path ? JSON.parse(readFileSync(path, "utf8")) : {};
  const map = new Map<TeamId, number>();
  const defaulted: TeamId[] = [];
  for (const t of teams) {
    if (typeof provided[t] === "number") map.set(t, provided[t]);
    else {
      map.set(t, DEFAULT);
      defaulted.push(t);
    }
  }
  if (defaulted.length) {
    process.stderr.write(`warning: no rating for ${defaulted.join(", ")} — defaulted to ${DEFAULT}\n`);
  }
  return map;
}

const pct = (p: number) => `${(p * 100).toFixed(1)}%`;

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const snapshot = JSON.parse(readFileSync(args.snapshot!, "utf8")) as KickpoolSnapshot;
  const input = fromKickpoolSnapshot(snapshot, { bestThirds: args.bestThirds });
  const teamIds = input.groups.flatMap((g) => g.teams.map((t) => t.id));
  const model = new EloPoissonModel(loadRatings(args.ratings, teamIds), { homeAdvantage: args.homeAdv });

  const started = performance.now();
  const rs = runGroupStage(input, model, { sims: args.sims, seed: args.seed });
  const ms = performance.now() - started;

  console.log(`\nWorld Cup — group-stage odds  (${args.sims.toLocaleString()} sims, seed ${args.seed})\n`);
  console.log("  #  Team   Grp   Win group   Escape group");
  console.log("  ─────────────────────────────────────────────────");
  rs.teams.forEach((t, i) => {
    const rank = String(i + 1).padStart(3);
    const team = t.team.padEnd(5);
    const win = pct(t.winGroup).padStart(7);
    const esc = `${pct(t.escapeGroup)} ± ${pct(t.escapeMoE)}`.padStart(14);
    console.log(`  ${rank}  ${team}   ${t.group}   ${win}      ${esc}`);
  });
  console.log(`\n  ${rs.teams.length} teams · best-${rs.metadata.bestThirds} thirds advance · ${ms.toFixed(0)}ms\n`);
}

main();
