// Capture a REAL 48-team 2026 World Cup snapshot from the live ESPN fifa.world API (the same
// upstream kickpool wraps) and write it in kickpool's snapshot shape. Used because kickpool's
// Next 16 server needs Node >=20.9 (this box runs 18.19); the production path is
// KickpoolApiProvider against a running kickpool. Re-run to refresh current standings.
//   tsx scripts/fetch-wc-snapshot.ts
import { writeFileSync } from "node:fs";

const STANDINGS = "https://site.api.espn.com/apis/v2/sports/soccer/fifa.world/standings";
const SCOREBOARD = "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard?dates=20260611-20260627";

const teamRef = (abbr: string, name: string) => ({
  abbr,
  name,
  logo: "",
  friendId: "",
  friendName: "",
  friendColour: "#000000",
});

async function main(): Promise<void> {
  const [standingsRaw, sbRaw] = await Promise.all([
    fetch(STANDINGS).then((r) => r.json()),
    fetch(SCOREBOARD).then((r) => r.json()),
  ]);

  // Groups + membership from standings.
  const membership = new Map<string, string>();
  const groups = (standingsRaw.children ?? []).map((g: any) => {
    const letter = String(g.name).replace("Group ", "");
    const table = g.standings.entries.map((e: any) => {
      membership.set(e.team.abbreviation, letter);
      return { team: teamRef(e.team.abbreviation, e.team.displayName) };
    });
    return { group: letter, table };
  });

  // Matches from the scoreboard (group derived from membership).
  const matches = (sbRaw.events ?? []).map((ev: any) => {
    const c = ev.competitions[0];
    const home = c.competitors.find((x: any) => x.homeAway === "home");
    const away = c.competitors.find((x: any) => x.homeAway === "away");
    const completed = Boolean(ev.status?.type?.completed);
    const num = (v: unknown) => (v === undefined || v === null || v === "" ? null : Number(v));
    return {
      id: ev.id,
      stage: "GROUP_STAGE",
      group: membership.get(home.team.abbreviation),
      utcDate: ev.date,
      status: completed ? "STATUS_FINAL" : "STATUS_SCHEDULED",
      homeTeam: teamRef(home.team.abbreviation, home.team.displayName),
      awayTeam: teamRef(away.team.abbreviation, away.team.displayName),
      score: completed ? { home: num(home.score), away: num(away.score) } : { home: null, away: null },
      venue: ev.competitions[0].venue?.fullName ?? "",
      city: "",
    };
  });

  const snapshot = {
    standings: { groups, lastUpdated: new Date().toISOString() },
    fixtures: { matches, lastUpdated: new Date().toISOString() },
  };

  writeFileSync("fixtures/wc2026-snapshot.json", JSON.stringify(snapshot, null, 2));
  const played = matches.filter((m: any) => m.status === "STATUS_FINAL").length;
  console.log(
    `wrote fixtures/wc2026-snapshot.json — ${groups.length} groups, ${matches.length} matches (${played} played, ${matches.length - played} remaining)`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
