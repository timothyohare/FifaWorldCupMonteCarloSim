// Runnable calibration: grid-search the Elo→Poisson constants against historical results and
// report the best fit + its margin over the coin-flip baseline (the C3 gate, spike S8).
//   tsx src/eval/calibrate.ts [data/results.csv]
import { readFileSync } from "node:fs";
import { backtest, type HistMatch } from "./backtest";
import type { EloPoissonParams } from "../model/elo-poisson";

/** Minimal quote-aware CSV line splitter (handles the ~77 quoted rows in the dataset). */
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

function loadMatches(path: string): HistMatch[] {
  const lines = readFileSync(path, "utf8").trim().split("\n");
  const matches: HistMatch[] = [];
  for (let i = 1; i < lines.length; i++) {
    const f = splitCsvLine(lines[i]);
    // date,home_team,away_team,home_score,away_score,tournament,city,country,neutral
    const [date, home, away, hs, as, tournament, , , neutral] = f;
    if (hs === "NA" || as === "NA" || hs === "" || as === "") continue;
    const hg = Number(hs);
    const ag = Number(as);
    if (!Number.isFinite(hg) || !Number.isFinite(ag)) continue;
    matches.push({ date, home, away, hg, ag, neutral: neutral?.toUpperCase() === "TRUE", tournament });
  }
  return matches;
}

function main(): void {
  const path = process.argv[2] ?? "data/results.csv";
  const matches = loadMatches(path);
  const evalFrom = "2010-01-01";
  console.log(`loaded ${matches.length.toLocaleString()} completed matches from ${path}`);
  console.log(`evaluating on matches since ${evalFrom}\n`);

  const grid = {
    base: [1.35, 1.55, 1.75],
    homeAdvantage: [65, 95, 125],
    spread: [0.6, 0.8, 1.0, 1.2],
  };

  let best: { params: EloPoissonParams; ll: number; baseline: number; improvement: number } | null = null;
  console.log("  base  homeAdv  spread |  logLoss  baseline   improv");
  console.log("  ───────────────────────────────────────────────────");
  for (const base of grid.base) {
    for (const homeAdvantage of grid.homeAdvantage) {
      for (const spread of grid.spread) {
        const params = { base, homeAdvantage, spread };
        const r = backtest(matches, params, { evalFrom });
        const flag = !best || r.logLoss < best.ll ? " *" : "";
        console.log(
          `  ${base.toFixed(2)}    ${String(homeAdvantage).padStart(3)}     ${spread.toFixed(2)} | ` +
            `${r.logLoss.toFixed(4)}  ${r.baseline.toFixed(4)}   ${(r.improvement * 100).toFixed(1)}%${flag}`,
        );
        if (!best || r.logLoss < best.ll) best = { params, ll: r.logLoss, baseline: r.baseline, improvement: r.improvement };
      }
    }
  }

  if (!best) throw new Error("no results");
  console.log(`\nBEST: base=${best.params.base} homeAdvantage=${best.params.homeAdvantage} spread=${best.params.spread}`);
  console.log(`  log loss ${best.ll.toFixed(4)} vs baseline ${best.baseline.toFixed(4)} → ${(best.improvement * 100).toFixed(1)}% better`);
  console.log(`  beats coin-flip baseline: ${best.ll < best.baseline ? "YES ✓ (C3 gate passes)" : "NO ✗"}`);

  const wc = backtest(matches, best.params, { evalFrom: "2010-01-01", evalTournament: "FIFA World Cup" });
  console.log(`\n  World-Cup-only eval (n=${wc.n}): logLoss ${wc.logLoss.toFixed(4)} vs ${wc.baseline.toFixed(4)} → ${(wc.improvement * 100).toFixed(1)}% better`);
}

main();
