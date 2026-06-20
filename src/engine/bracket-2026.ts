// The real FIFA World Cup 26 knockout bracket: the fixed R32→Final slot tree (Regulations
// §12.6–12.11) plus the Annex C third-placed allocation. Replaces the placeholder seeding
// for the genuine 12-group / 32-qualifier format.
import type { Rng } from "../domain/rng";
import type { TeamId, TableRow } from "../domain/types";
import type { StrengthModel } from "../model/strength-model";
import type { GroupResult } from "./group-engine";
import { resolveMatch } from "./knockout";

type Slot = { winner: string } | { runner: string } | { third: string };

// Round of 32 (M73–M88), Regulations §12.6. `third: X` = the best-third assigned to face the
// winner of group X (resolved via Annex C).
const R32: { match: number; a: Slot; b: Slot }[] = [
  { match: 73, a: { runner: "A" }, b: { runner: "B" } },
  { match: 74, a: { winner: "E" }, b: { third: "E" } },
  { match: 75, a: { winner: "F" }, b: { runner: "C" } },
  { match: 76, a: { winner: "C" }, b: { runner: "F" } },
  { match: 77, a: { winner: "I" }, b: { third: "I" } },
  { match: 78, a: { runner: "E" }, b: { runner: "I" } },
  { match: 79, a: { winner: "A" }, b: { third: "A" } },
  { match: 80, a: { winner: "L" }, b: { third: "L" } },
  { match: 81, a: { winner: "D" }, b: { third: "D" } },
  { match: 82, a: { winner: "G" }, b: { third: "G" } },
  { match: 83, a: { runner: "K" }, b: { runner: "L" } },
  { match: 84, a: { winner: "H" }, b: { runner: "J" } },
  { match: 85, a: { winner: "B" }, b: { third: "B" } },
  { match: 86, a: { winner: "J" }, b: { runner: "H" } },
  { match: 87, a: { winner: "K" }, b: { third: "K" } },
  { match: 88, a: { runner: "D" }, b: { runner: "G" } },
];

// Later rounds reference earlier match winners (§12.7–12.11). M103 (third-place play-off) is
// omitted — it affects neither the champion nor the finalists.
const TREE: { match: number; a: number; b: number }[] = [
  { match: 89, a: 74, b: 77 }, { match: 90, a: 73, b: 75 }, { match: 91, a: 76, b: 78 }, { match: 92, a: 79, b: 80 },
  { match: 93, a: 83, b: 84 }, { match: 94, a: 81, b: 82 }, { match: 95, a: 86, b: 88 }, { match: 96, a: 85, b: 87 },
  { match: 97, a: 89, b: 90 }, { match: 98, a: 93, b: 94 }, { match: 99, a: 91, b: 92 }, { match: 100, a: 95, b: 96 },
  { match: 101, a: 97, b: 98 }, { match: 102, a: 99, b: 100 },
  { match: 104, a: 101, b: 102 },
];

const SEMI_MATCHES = [97, 98, 99, 100];
const FINAL_MATCHES = [101, 102];

export interface R32Matchup {
  match: number;
  home: TeamId;
  away: TeamId;
}

export interface WorldCupBracket {
  matchups: R32Matchup[];
}

type AnnexTable = Readonly<Record<string, Readonly<Record<string, string>>>>;

/** Rank the 12 third-placed teams (no head-to-head): points → GD → goals → team id. */
function bestThirdGroups(thirds: { group: string; row: TableRow }[]): string[] {
  return [...thirds]
    .sort((a, b) => {
      if (a.row.points !== b.row.points) return b.row.points - a.row.points;
      if (a.row.goalDifference !== b.row.goalDifference) return b.row.goalDifference - a.row.goalDifference;
      if (a.row.goalsFor !== b.row.goalsFor) return b.row.goalsFor - a.row.goalsFor;
      return a.group.localeCompare(b.group);
    })
    .slice(0, 8)
    .map((t) => t.group);
}

/** Resolve the fixed slot tree + Annex C into 16 concrete round-of-32 matchups. */
export function buildWorldCupBracket(results: GroupResult[], annex: AnnexTable): WorldCupBracket {
  const byGroup = new Map(results.map((r) => [r.group, r.table]));
  const rowAt = (g: string, pos: number): TeamId => {
    const t = byGroup.get(g);
    if (!t) throw new Error(`buildWorldCupBracket: missing group ${g} (need the 12 groups A–L)`);
    const row = t.find((x) => x.position === pos);
    if (!row) throw new Error(`group ${g} has no team in position ${pos}`);
    return row.team;
  };

  const thirds = results.map((r) => ({ group: r.group, row: r.table.find((x) => x.position === 3)! }));
  const qualifyingThirds = bestThirdGroups(thirds);
  const key = [...qualifyingThirds].sort().join("");
  const assignment = annex[key];
  if (!assignment) throw new Error(`no Annex C entry for third-placed combination {${key}}`);

  const resolveSlot = (slot: Slot): TeamId => {
    if ("winner" in slot) return rowAt(slot.winner, 1);
    if ("runner" in slot) return rowAt(slot.runner, 2);
    return rowAt(assignment[slot.third], 3); // third-placed team assigned to this winner
  };

  return {
    matchups: R32.map((m) => ({ match: m.match, home: resolveSlot(m.a), away: resolveSlot(m.b) })),
  };
}

export interface WorldCupKnockoutResult {
  champion: TeamId;
  finalists: TeamId[];
  semifinalists: TeamId[];
}

/** Play the full bracket from the R32 matchups through the fixed tree to the final. */
export function playWorldCupKnockout(
  bracket: WorldCupBracket,
  model: StrengthModel,
  rng: Rng,
): WorldCupKnockoutResult {
  const winnerOf = new Map<number, TeamId>();
  for (const m of bracket.matchups) {
    winnerOf.set(m.match, resolveMatch(model, m.home, m.away, rng));
  }
  for (const g of TREE) {
    winnerOf.set(g.match, resolveMatch(model, winnerOf.get(g.a)!, winnerOf.get(g.b)!, rng));
  }
  return {
    champion: winnerOf.get(104)!,
    finalists: FINAL_MATCHES.map((m) => winnerOf.get(m)!),
    semifinalists: SEMI_MATCHES.map((m) => winnerOf.get(m)!),
  };
}
