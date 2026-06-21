import { describe, it, expect } from "vitest";
import { eloRatingsByName, ratingsForTeams } from "./team-ratings";

const csv = [
  "date,home_team,away_team,home_score,away_score,tournament,city,country,neutral",
  "2024-01-01,Brazil,Bolivia,5,0,Friendly,x,x,FALSE",
  "2024-02-01,Bolivia,Brazil,0,3,Friendly,x,x,FALSE",
  "2024-03-01,Czech Republic,Bolivia,2,0,Friendly,x,x,TRUE",
  "2024-04-01,Brazil,Czech Republic,NA,NA,Friendly,x,x,TRUE", // unplayed → ignored
].join("\n");

describe("team-ratings", () => {
  it("rates a dominant team above a weak one", () => {
    const byName = eloRatingsByName(csv);
    expect(byName.get("Brazil")!).toBeGreaterThan(byName.get("Bolivia")!);
  });

  it("ignores rows with NA scores", () => {
    const byName = eloRatingsByName(csv);
    // Brazil played 2 rated games (won both); rating moved up from the 1500 default.
    expect(byName.get("Brazil")!).toBeGreaterThan(1500);
  });

  it("maps ratings onto ESPN abbreviations and resolves aliases", () => {
    const byName = eloRatingsByName(csv);
    const { ratings, unmatched } = ratingsForTeams(byName, [
      { abbr: "BRA", name: "Brazil" },
      { abbr: "CZE", name: "Czechia" }, // alias → "Czech Republic"
      { abbr: "ZZZ", name: "Atlantis" }, // no data
    ]);
    expect(ratings.BRA).toBeGreaterThan(1500);
    expect(ratings.CZE).toBeDefined(); // resolved via alias
    expect(unmatched).toEqual(["ZZZ (Atlantis)"]);
  });
});
