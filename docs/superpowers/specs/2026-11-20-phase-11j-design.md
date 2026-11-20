# Phase 11j: posted floors inside the band (design and results)

Source: the owner's Phase 11j brief (Nov 20), after accepting Phase 11i and the 0.0.2 release. Starting point: fd16f13 (phase-11i).

## Decision (continuing A1–A123)
- **A124. The posted floor is held to the plain band too (a rule change on purpose):**
  - After a ladder step accepts a floor, its win rate is measured with `HOLD.runs` (64) bot runs. If it sits outside `plainBand(depth)` narrowed by `HOLD.margin` (6) points on each side, the floor's own random stream is drawn again (`Mods.draw` = 1…`HOLD.draws`, 12), and the closest candidate posts. The first candidate inside the narrowed band stops the search.
  - **What a redraw may change:** only the generator's own stream (rooms, hazards, which tile in a zone). **What it may not:** the curse, the traps (owner, kind, zone, slot), the crowd's zone weights and top killer, since the mods are passed unchanged except for `draw`.
  - **A candidate is refused if:**
    - it needed a generator fallback;
    - it has no safe path;
    - a different set of players' traps landed on it;
    - it falls outside the relative band, measured exactly as the ladder measures it (`BAND.seeds` runs against the cursed base floor).
  - **Unchanged:** a floor always posts; the plain floor is the ladder's last step; no draw at all leaves the generator byte-identical (`draw` undefined).
  - `Rolled.win` is now the 64-run verdict, so the rollover log and the Lab show the posted floor's held win rate.

## Assumptions (recommended options taken)
- **The crowd floor's own draws are its whole stream, not only its hazards.** A first version kept the base floor's rooms and redrew only the hazards. It stalled: 88 of 448 floors stayed outside the band whatever their hazards, and 35.5% were outside overall. A crowd floor is already a fresh draw of the generator (11i's analysis), so redrawing its rooms gives up nothing the players chose.
- **Noise:** 64 runs give an sd of about 6 points near 50%, against 12 at 16 runs. Aiming 6 points inside the band, about one sd, keeps a floor at the edge from passing on a lucky measure. 96 runs bought half a point less too-hard and pushed the maximum to 6.8 s, so 64 it is.
- **12 draws:** 8 left 20.3% outside, 12 gave 15.4% (13.6% in the final code), 16 gave 13.2% but raised the max to 6.5 s.
- **Playtest subreddit:** the Devvit CLI (0.15.3) has no command to create a subreddit, so the owner creates it. `devvit.json` `dev.subreddit` already points at **r/descent_game_test**, so `bun run dev` fails rather than touch r/descent_game_dev until it exists. RELEASE.md and the README say so.
- **The older always-today post (1xyj612):** the app has no remove action, and adding one for a single post is not worth it. The owner removes it.

## Measurements: the same 448 crowd rollovers as 11i (16 per depth over 1–28)
Every posted floor is scored with 96 fresh bot runs (seeds 1001–1096), which the rollover never used.
| | 11i (no hold) | 11j | target |
|---|---|---|---|
| posted floor too hard (below the band) | 53 (11.8%) | 9 (2.0%) | < 5% |
| posted floor too easy (above the band) | 230 (51.3%) | 52 (11.6%) | – |
| posted floor outside the band | 283 (63.2%) | 61 (13.6%) | < 20% |
| posted win against the target line, mean (sd) | +11.3 (27.1) | +0.1 (12.9) | – |
| posted win by cycle (1–7 / 8–14 / 15–21 / 22–28) | 86 / 72 / 63 / 56 | 75 / 64 / 52 / 41 | 80 → 35 |
| a survivor's trap set aside | 5 (1.1%), 8 of 900 traps | 5 (1.1%), 8 of 900 | < 5% |
| the winning curse set aside | 0 | 0 | 0 |
| floors redrawn | – | 316 of 448 | – |
| rollover time, mean / max | 489 / 2,585 ms | 969 / 5,281 ms | < 10 s |

- 11i's report gave 62.5% outside, measured with the rollover's own 16 runs. On fresh runs the same floors measure 63.2%.
- 37 floors are still outside the band by the rollover's own 64-run verdict after 12 draws. They post the closest candidate.
- **Both bands re-measured:**
  - Absolute: as above.
  - Relative: every posted floor holds it by construction, and the 28-day test passes. Stored win / plain win per day: 2:75/94 3:88/88 4:69/69 5:63/81 6:75/88 7:88/81 8:81/81 9:75/75 10:63/63 11:56/44 12:50/50 13:56/56 14:63/25 15:44/44 16:31/31 17:56/50 18:44/44 19:38/38 20:56/56 21:75/13 22:69/63 23:38/25 24:63/44 25:31/31 26:13/0 27:31/31 28:38/44 29:38/31, in 26.4 s.
  - The base floor's own band check (`fairSeed`) is unchanged: 65 of 448 (14.5%) still miss it.
- **Goldens:**
  - Generator goldens re-recorded on purpose: byte-identical, because no draw means the old stream.
  - Simulation goldens: untouched and passing.
- **Results:**
  - `bun run check` 169/169, lint clean.
  - e2e 147/147: input to motion 3.1 ms, animation lock median 99 ms / max 115 ms, the timed 18-move Floor 0 run in 2.5 s.

## Housekeeping
- **The rollover on 0.0.2** (15:00 UTC Nov 19; no other has run yet; the next is 15:00 UTC Nov 20):
  - `ROLLOVER cron 2026-11-19: floor 11 -> 12 (post t3_1y0bgyq), ladder step "full", win 44% vs plain 44% … 953 ms`.
  - `summary comment t1_19svka1ytsu4j on floor 12` reads "Yesterday on Floor 11: 0 delvers fell, and 0 cleared it. No curse today."
  - `flair floor 11: 0 set, 0 removed, 0 failed, 0 skipped, 0 left`: nobody played Floor 11, and the owner's flair still reads "Cleared floor 10".
  - `NAMELESS floor 12: 12 bot ghosts from 14 runs`; in game, "12 fell here today · 7 carved a warning".
  - "Your mark" on Floor 12: "Your spikes yesterday caught nobody."
  - `SWEEP checked 1, purged 0`.
- **Journeys on 0.0.2:** the app-ready receipt at 15:27 UTC Nov 19, after the 0.0.2 install, still read `JOURNEY_RECEIPT_DENIED_PLAYTEST` ("not recorded for playtest app versions"), not the `NOT_ALLOWLISTED` RELEASE.md expected. journeys-request.md now says so and asks.
- **Trap souls:** none in the logs yet.

## The release
- Gate passed, then `bun run deploy` uploaded **0.0.3**, and `devvit install r/descent_game_dev descent-game@0.0.3` installed exactly that ("upgraded from v0.0.2 to v0.0.3"; `devvit list installs` shows v0.0.3).
- Settings carried over: Nameless delvers per day 12, Dev tools **on** (the owner switches them off after the playtest subreddit works).
- Phone-size visit: the always-today post's splash shows Floor 12 "The Hungry Galleries", "12 fell here today · 7 carved a warning" (`docs/superpowers/submission/shots/11j-splash-0.0.3.png`). No move made. Not restarted at Floor 1.
- journeys-request.md names 0.0.3 and reports the playtest receipts on 0.0.2.
