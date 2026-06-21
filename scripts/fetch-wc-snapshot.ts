// Capture a real 48-team snapshot directly from the live ESPN fifa.world API (the upstream
// kickpool wraps) and write it in kickpool's snapshot shape. Use when a running kickpool
// isn't available; the production live path is KickpoolApiProvider.
//   tsx scripts/fetch-wc-snapshot.ts
import { writeFileSync } from "node:fs";
import { fetchEspnSnapshot } from "../src/io/espn-provider";

async function main(): Promise<void> {
  const snapshot = await fetchEspnSnapshot();
  writeFileSync("fixtures/wc2026-snapshot.json", JSON.stringify(snapshot, null, 2));
  const played = snapshot.fixtures.matches.filter((m) => m.status === "STATUS_FINAL").length;
  const n = snapshot.fixtures.matches.length;
  console.log(
    `wrote fixtures/wc2026-snapshot.json — ${snapshot.standings.groups.length} groups, ` +
      `${n} matches (${played} played, ${n - played} remaining)`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
