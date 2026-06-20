// Capture a snapshot through the live KickpoolApiProvider (a running kickpool instance) and
// write it to fixtures/. This is the genuine production data path.
//   tsx scripts/fetch-from-kickpool.ts [baseUrl]
import { writeFileSync } from "node:fs";
import { fetchKickpoolSnapshot } from "../src/io/kickpool-provider";

async function main(): Promise<void> {
  const baseUrl = process.argv[2] ?? "http://localhost:3137";
  const snap = await fetchKickpoolSnapshot({ baseUrl });
  writeFileSync("fixtures/wc2026-snapshot.json", JSON.stringify(snap, null, 2));
  const played = snap.fixtures.matches.filter((m) => m.status === "STATUS_FINAL").length;
  console.log(
    `captured via kickpool (${baseUrl}) → fixtures/wc2026-snapshot.json: ` +
      `${snap.standings.groups.length} groups, ${snap.fixtures.matches.length} matches (${played} played)`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
