# Data

External datasets used for calibration and backtesting. **Raw CSVs are not committed**
(`data/*.csv` is gitignored) — they are reproducible from the sources below.

## results.csv — international football results (1872–present)

- **Source:** martj42/international_results — <https://github.com/martj42/international_results>
- **Licence:** public domain (CC0).
- **Contents:** ~49.5k men's full internationals; columns:
  `date, home_team, away_team, home_score, away_score, tournament, city, country, neutral`.
  Future/unplayed fixtures appear with `NA` scores. The `tournament` column lets us filter to
  `FIFA World Cup`; `neutral` flags neutral-venue matches.
- **Used by:** S8 backtest harness (historical replay vs the coin-flip baseline) and S3
  Elo/λ calibration. See [`../docs/12-rules-sources.md`](../docs/12-rules-sources.md) Q7.

### Fetch

```bash
mkdir -p data
curl -fsSL https://raw.githubusercontent.com/martj42/international_results/master/results.csv \
  -o data/results.csv
```

Fetched 2026-06-20: 49,478 rows (incl. header), 3.6 MB.

## FIFA 2026 third-place → R32 allocation table (S6) — NOT YET ACQUIRED

The bracket allocation for the 8 best third-placed teams is **495 pre-defined scenarios**
(one per combination of 8 qualifying groups from 12), published in the **FIFA 2026
Regulations PDF**. Confirmed structure: the group winners who face a third-placed team are
**A, C, D, E, G, I, K, L** (winners of B, F, H, J face runners-up). The full 495-row table is
too large to scrape reliably — obtain the official PDF/Annex and commit the transcribed
table as a fixture. Tracked in [`../docs/13-spike-findings.md`](../docs/13-spike-findings.md) (S6).
