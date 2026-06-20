// One-off generator: parse Annex C of the FIFA WC26 Regulations (pdftotext output) into a
// validated TypeScript data module. Re-run if data/regs.txt is regenerated.
//   pdftotext -layout data/FWC2026_regulations.pdf data/regs.txt
//   tsx scripts/gen-annex-c.ts
import { readFileSync, writeFileSync } from "node:fs";

// Column order from the Annex C header: "Option 1A 1B 1D 1E 1G 1I 1K 1L".
const WINNER_COLS = ["A", "B", "D", "E", "G", "I", "K", "L"] as const;

// Candidate third-placed groups per winner slot, from Regulations §12.6.
const CANDIDATES: Record<string, string> = {
  A: "CEFHI", // M79
  B: "EFGIJ", // M85
  D: "BEFIJ", // M81
  E: "ABCDF", // M74
  G: "AEHIJ", // M82
  I: "CDFGH", // M77
  K: "DEIJL", // M87
  L: "EHIJK", // M80
};

const text = readFileSync("data/regs.txt", "utf8");
const rowRe = /^\s*\d+(?:\s+3[A-L]){8}\s*$/gm;
const rows = text.match(rowRe) ?? [];
if (rows.length !== 495) throw new Error(`expected 495 Annex C rows, parsed ${rows.length}`);

const table: Record<string, Record<string, string>> = {};
for (const row of rows) {
  const thirds = (row.match(/3([A-L])/g) ?? []).map((t) => t[1]);
  if (thirds.length !== 8) throw new Error(`row has ${thirds.length} thirds: ${row}`);

  const assignment: Record<string, string> = {};
  WINNER_COLS.forEach((winner, i) => {
    const third = thirds[i];
    if (!CANDIDATES[winner].includes(third)) {
      throw new Error(`row "${row.trim()}": 3${third} not a valid opponent for winner ${winner} (allowed ${CANDIDATES[winner]})`);
    }
    assignment[winner] = third;
  });

  const groups = [...thirds];
  if (new Set(groups).size !== 8) throw new Error(`duplicate third in row: ${row}`);
  const key = [...groups].sort().join("");
  if (table[key]) throw new Error(`duplicate combination key ${key}`);
  table[key] = assignment;
}

if (Object.keys(table).length !== 495) {
  throw new Error(`expected 495 unique combinations, got ${Object.keys(table).length}`);
}

const entries = Object.entries(table)
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([key, asn]) => `  ${key}: { ${WINNER_COLS.map((w) => `${w}: "${asn[w]}"`).join(", ")} },`)
  .join("\n");

const out = `// AUTO-GENERATED from FIFA World Cup 26 Regulations, Annex C (do not edit by hand).
// Source PDF: https://digitalhub.fifa.com/m/636f5c9c6f29771f/original/FWC2026_regulations_EN.pdf
// Regenerate: tsx scripts/gen-annex-c.ts  (495 combinations, validated against §12.6)

/** Winner slots that face a best third-placed team (Annex C column order). */
export const THIRD_SLOT_WINNERS = ${JSON.stringify([...WINNER_COLS])} as const;

/** Allowed third-placed groups per winner slot (Regulations §12.6). */
export const THIRD_CANDIDATES: Readonly<Record<string, string>> = ${JSON.stringify(CANDIDATES)};

/**
 * For each combination of the 8 qualifying third-placed groups (key = sorted group letters),
 * which third-placed group each winner faces in the round of 32.
 */
export const ANNEX_C: Readonly<Record<string, Readonly<Record<string, string>>>> = {
${entries}
};
`;

writeFileSync("src/engine/annex-c.ts", out);
console.log(`wrote src/engine/annex-c.ts with ${Object.keys(table).length} combinations (all validated)`);
