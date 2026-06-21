import { describe, it, expect } from "vitest";
import { CSV_HEADER, toCsvRows, upsertCsv } from "./record";
import type { TeamFullProbs } from "../engine/tournament";

const team = (t: string, champ: number): TeamFullProbs => ({
  team: t,
  group: "A",
  champion: champ,
  runnerUp: champ / 2,
  reachFinal: champ * 1.5,
  reachSemi: champ * 2,
  escapeGroup: 0.9,
  championMoE: 0.002,
  runnerUpMoE: 0.002,
});

describe("history/record", () => {
  it("emits one CSV row per team with the date leading", () => {
    const rows = toCsvRows("2026-06-21", [team("ARG", 0.2), team("ESP", 0.14)]);
    expect(rows[0]).toBe("2026-06-21,ARG,A,0.2000,0.1000,0.3000,0.4000,0.9000");
    expect(rows).toHaveLength(2);
  });

  it("creates a CSV with a header from empty", () => {
    const csv = upsertCsv(null, "2026-06-21", toCsvRows("2026-06-21", [team("ARG", 0.2)]));
    expect(csv.split("\n")[0]).toBe(CSV_HEADER);
    expect(csv).toMatch(/2026-06-21,ARG/);
  });

  it("appends a new day without touching prior days", () => {
    let csv = upsertCsv(null, "2026-06-21", toCsvRows("2026-06-21", [team("ARG", 0.2)]));
    csv = upsertCsv(csv, "2026-06-22", toCsvRows("2026-06-22", [team("ARG", 0.25)]));
    expect(csv).toMatch(/2026-06-21,ARG,A,0.2000/);
    expect(csv).toMatch(/2026-06-22,ARG,A,0.2500/);
  });

  it("replaces an existing day instead of duplicating it (idempotent re-run)", () => {
    let csv = upsertCsv(null, "2026-06-21", toCsvRows("2026-06-21", [team("ARG", 0.2)]));
    csv = upsertCsv(csv, "2026-06-21", toCsvRows("2026-06-21", [team("ARG", 0.31)]));
    const argRows = csv.split("\n").filter((l) => l.includes("2026-06-21,ARG"));
    expect(argRows).toHaveLength(1);
    expect(argRows[0]).toMatch(/0.3100/);
  });
});
