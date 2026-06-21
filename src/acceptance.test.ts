// End-to-end acceptance: exercise the whole pipeline on the committed real snapshot, and run
// the actual CLI binary. Catches "it typechecks but the real run is broken" — the boot-and-
// verify role, adapted for a CLI (gate-verify proper needs a bootable HTTP server). Runs as
// part of `npm test`, so the gate-ci Stop hook enforces it.
import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { fromKickpoolSnapshot, type KickpoolSnapshot } from "./io/snapshot";
import { EloPoissonModel } from "./model/elo-poisson";
import { runTournament } from "./engine/tournament";

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (p: string) => JSON.parse(readFileSync(new URL(`../${p}`, import.meta.url), "utf8"));
const SNAPSHOT = "fixtures/wc2026-snapshot.json";
const RATINGS = "fixtures/wc2026-ratings.json";
const STRONG = ["ARG", "ESP", "FRA", "BRA"];

describe("acceptance — full 2026 pipeline on the committed snapshot", () => {
  const input = fromKickpoolSnapshot(read(SNAPSHOT) as KickpoolSnapshot, { bestThirds: 8 });
  const ratings = new Map(Object.entries(read(RATINGS) as Record<string, number>));
  const model = new EloPoissonModel(ratings, { homeAdvantage: 0 });

  it("adapts to the real 48-team / 12-group tournament", () => {
    expect(input.groups).toHaveLength(12);
    expect(input.groups.reduce((s, g) => s + g.teams.length, 0)).toBe(48);
  });

  it("runs end-to-end and produces a coherent set of probabilities", () => {
    const rs = runTournament(input, model, { sims: 5000, seed: 1 });
    expect(rs.metadata.bracket).toBe("fifa-2026");
    expect(rs.teams).toHaveLength(48);

    // Exactly one champion and one runner-up per simulation.
    expect(rs.teams.reduce((s, t) => s + t.champion, 0)).toBeCloseTo(1, 6);
    expect(rs.teams.reduce((s, t) => s + t.runnerUp, 0)).toBeCloseTo(1, 6);

    // Stage probabilities nest correctly for every team.
    for (const t of rs.teams) {
      expect(t.champion).toBeLessThanOrEqual(t.reachFinal + 1e-9);
      expect(t.reachFinal).toBeLessThanOrEqual(t.reachSemi + 1e-9);
      expect(t.reachSemi).toBeLessThanOrEqual(t.escapeGroup + 1e-9);
      expect(t.champion).toBeGreaterThanOrEqual(0);
    }

    // The favourite is a genuinely strong side, not noise.
    expect(STRONG).toContain(rs.teams[0].team);
  });

  it("the CLI binary runs and prints a well-formed title-odds table", () => {
    const out = execFileSync(
      "npx",
      ["tsx", "src/cli.ts", "--snapshot", SNAPSHOT, "--ratings", RATINGS, "--sims", "2000", "--seed", "1"],
      { cwd: root, encoding: "utf8", timeout: 60_000 },
    );
    expect(out).toMatch(/title odds/i);
    expect(out).toMatch(/fifa-2026 bracket/);
    expect(out).toMatch(/Champion.*Runner-up/);
    expect(out).toMatch(/48 teams/);
    // 48 ranked data rows (lines beginning with a rank number).
    expect((out.match(/^\s+\d+\s+[A-Z]{3}\s+[A-L]\s/gm) ?? []).length).toBe(48);
  });
});
