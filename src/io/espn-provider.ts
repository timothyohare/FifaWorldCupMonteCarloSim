// ESPN-direct data provider: builds a kickpool-shaped snapshot straight from the public ESPN
// fifa.world API (the same upstream kickpool wraps). Used by the daily job / CI where a
// running kickpool isn't available. The pure `espnToSnapshot` transform is unit-tested.
import type { KickpoolSnapshot } from "./snapshot";

const STANDINGS_URL = "https://site.api.espn.com/apis/v2/sports/soccer/fifa.world/standings";
// Whole tournament window (11 June group-stage kickoff → 19 July final). The snapshot adapter
// classifies each match by group membership — cross-group ties and same-group rematches become
// knockout results — so played knockout rounds condition the simulation instead of being replayed.
// limit=200: ESPN caps the response at 100 events by default, silently dropping the last
// fixtures of the 104-match tournament (semis onwards).
const SCOREBOARD_URL = "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard?dates=20260611-20260719&limit=200";

const teamRef = (abbr: string, name: string) => ({
  abbr,
  name,
  logo: "",
  friendId: "",
  friendName: "",
  friendColour: "#000000",
});

/** Pure transform: ESPN standings + scoreboard JSON → a kickpool snapshot. */
export function espnToSnapshot(standings: any, scoreboard: any): KickpoolSnapshot {
  const membership = new Map<string, string>();
  const groups = (standings.children ?? []).map((g: any) => {
    const letter = String(g.name).replace("Group ", "");
    const table = (g.standings?.entries ?? []).map((e: any) => {
      membership.set(e.team.abbreviation, letter);
      return { team: teamRef(e.team.abbreviation, e.team.displayName) };
    });
    return { group: letter, table };
  });

  const num = (v: unknown) => (v === undefined || v === null || v === "" ? null : Number(v));
  const matches = (scoreboard.events ?? []).map((ev: any) => {
    const c = ev.competitions[0];
    const home = c.competitors.find((x: any) => x.homeAway === "home");
    const away = c.competitors.find((x: any) => x.homeAway === "away");
    const completed = Boolean(ev.status?.type?.completed);
    const score: KickpoolSnapshot["fixtures"]["matches"][number]["score"] = completed
      ? { home: num(home.score), away: num(away.score) }
      : { home: null, away: null };
    if (completed && home.shootoutScore != null && away.shootoutScore != null) {
      // Present only for penalty shootouts; lets the engine pin the tie's real winner.
      score.shootoutHome = Number(home.shootoutScore);
      score.shootoutAway = Number(away.shootoutScore);
    }
    return {
      id: ev.id,
      stage: "GROUP_STAGE",
      group: membership.get(home.team.abbreviation),
      utcDate: ev.date,
      status: completed ? "STATUS_FINAL" : "STATUS_SCHEDULED",
      homeTeam: teamRef(home.team.abbreviation, home.team.displayName),
      awayTeam: teamRef(away.team.abbreviation, away.team.displayName),
      score,
      venue: c.venue?.fullName ?? "",
      city: "",
    };
  });

  const lastUpdated = new Date().toISOString();
  return { standings: { groups, lastUpdated }, fixtures: { matches, lastUpdated } } as KickpoolSnapshot;
}

/** Fetch both ESPN endpoints and build a snapshot. */
export async function fetchEspnSnapshot(opts: { fetchImpl?: typeof fetch } = {}): Promise<KickpoolSnapshot> {
  const f = opts.fetchImpl ?? fetch;
  const [standings, scoreboard] = await Promise.all([
    f(STANDINGS_URL).then((r) => r.json()),
    f(SCOREBOARD_URL).then((r) => r.json()),
  ]);
  return espnToSnapshot(standings, scoreboard);
}
