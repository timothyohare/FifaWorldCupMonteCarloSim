import { describe, it, expect } from "vitest";
import { espnToSnapshot, fetchEspnSnapshot } from "./espn-provider";

const standings = {
  children: [
    {
      name: "Group A",
      standings: {
        entries: [
          { team: { abbreviation: "MEX", displayName: "Mexico" } },
          { team: { abbreviation: "KOR", displayName: "South Korea" } },
        ],
      },
    },
  ],
};

const scoreboard = {
  events: [
    {
      id: "1",
      date: "2026-06-11T19:00Z",
      status: { type: { completed: true } },
      competitions: [
        {
          venue: { fullName: "Estadio Azteca" },
          competitors: [
            { homeAway: "home", team: { abbreviation: "MEX" }, score: "2" },
            { homeAway: "away", team: { abbreviation: "KOR" }, score: "0" },
          ],
        },
      ],
    },
    {
      id: "2",
      date: "2026-06-18T19:00Z",
      status: { type: { completed: false } },
      competitions: [
        {
          competitors: [
            { homeAway: "home", team: { abbreviation: "KOR" }, score: null },
            { homeAway: "away", team: { abbreviation: "MEX" }, score: null },
          ],
        },
      ],
    },
  ],
};

describe("espnToSnapshot", () => {
  it("maps groups + teams from standings", () => {
    const snap = espnToSnapshot(standings, scoreboard);
    expect(snap.standings.groups[0].group).toBe("A");
    expect(snap.standings.groups[0].table.map((t) => t.team.abbr)).toEqual(["MEX", "KOR"]);
  });

  it("marks completed matches FINAL with scores and derives the group", () => {
    const snap = espnToSnapshot(standings, scoreboard);
    const m1 = snap.fixtures.matches.find((m) => m.id === "1")!;
    expect(m1).toMatchObject({ status: "STATUS_FINAL", group: "A" });
    expect(m1.score).toEqual({ home: 2, away: 0 });
  });

  it("marks unplayed matches SCHEDULED with null scores", () => {
    const snap = espnToSnapshot(standings, scoreboard);
    const m2 = snap.fixtures.matches.find((m) => m.id === "2")!;
    expect(m2.status).toBe("STATUS_SCHEDULED");
    expect(m2.score).toEqual({ home: null, away: null });
  });

  it("maps penalty-shootout scores when present", () => {
    const shootoutBoard = {
      events: [
        {
          id: "3",
          date: "2026-07-14T19:00Z",
          status: { type: { completed: true } },
          competitions: [
            {
              competitors: [
                { homeAway: "home", team: { abbreviation: "MEX" }, score: "1", shootoutScore: "3" },
                { homeAway: "away", team: { abbreviation: "KOR" }, score: "1", shootoutScore: "4" },
              ],
            },
          ],
        },
      ],
    };
    const snap = espnToSnapshot(standings, shootoutBoard);
    expect(snap.fixtures.matches[0].score).toEqual({ home: 1, away: 1, shootoutHome: 3, shootoutAway: 4 });
  });
});

describe("fetchEspnSnapshot", () => {
  it("requests the scoreboard for the whole tournament window (group stage → final)", async () => {
    const urls: string[] = [];
    const fetchImpl = (async (url: unknown) => {
      urls.push(String(url));
      return { json: async () => (String(url).includes("standings") ? standings : scoreboard) };
    }) as unknown as typeof fetch;
    await fetchEspnSnapshot({ fetchImpl });
    const sb = urls.find((u) => u.includes("scoreboard"))!;
    expect(sb).toContain("dates=20260611-20260719");
    // ESPN caps a scoreboard response at 100 events by default — the 104-match tournament
    // silently loses the semis, third place and final without an explicit higher limit.
    expect(sb).toMatch(/limit=[2-9]\d\d/);
  });
});
