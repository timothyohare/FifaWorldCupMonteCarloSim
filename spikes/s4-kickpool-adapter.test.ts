import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  fromKickpool,
  remainingMatches,
  playedMatches,
  AdapterError,
  type KpStandingsResponse,
  type KpFixturesResponse,
} from "./s4-kickpool-adapter";

const snap = JSON.parse(
  readFileSync(fileURLToPath(new URL("./s4-fixtures/mini-snapshot.json", import.meta.url)), "utf8"),
) as { standings: KpStandingsResponse; fixtures: KpFixturesResponse };

describe("S4 — kickpool → TournamentState adapter", () => {
  it("maps two groups and splits played vs remaining matches", () => {
    const state = fromKickpool(snap.standings, snap.fixtures);
    expect(state.groups.map((g) => g.group)).toEqual(["A", "B"]);
    expect(state.groups[0].teams).toEqual(["BRA", "SUI", "SRB", "CMR"]);
    expect(state.matches).toHaveLength(12);
    expect(playedMatches(state)).toHaveLength(9);
    expect(remainingMatches(state).map((m) => m.id)).toEqual(["B4", "B5", "B6"]);
  });

  it("carries scores only for played matches", () => {
    const state = fromKickpool(snap.standings, snap.fixtures);
    const a1 = state.matches.find((m) => m.id === "A1")!;
    expect(a1).toMatchObject({ played: true, homeGoals: 2, awayGoals: 0 });
    const b4 = state.matches.find((m) => m.id === "B4")!;
    expect(b4.played).toBe(false);
    expect(b4.homeGoals).toBeUndefined();
  });

  it("produces a stable, deterministic snapshot hash", () => {
    const h1 = fromKickpool(snap.standings, snap.fixtures).snapshotHash;
    const h2 = fromKickpool(snap.standings, snap.fixtures).snapshotHash;
    expect(h1).toBe(h2);
    expect(h1).toMatch(/^[0-9a-f]{16}$/);
  });

  it("fails loudly on a wrong group size", () => {
    const bad = structuredClone(snap.standings);
    bad.groups[0].table.pop();
    expect(() => fromKickpool(bad, snap.fixtures)).toThrow(AdapterError);
  });

  it("fails loudly on a FINAL match with no score", () => {
    const bad = structuredClone(snap.fixtures);
    bad.matches[0].score = { home: null, away: null };
    expect(() => fromKickpool(snap.standings, bad)).toThrow(/FINAL but missing a score/);
  });

  it("fails loudly when a fixture references an unknown team", () => {
    const bad = structuredClone(snap.fixtures);
    bad.matches[0].homeTeam.abbr = "ZZZ";
    expect(() => fromKickpool(snap.standings, bad)).toThrow(/not in any group/);
  });
});
