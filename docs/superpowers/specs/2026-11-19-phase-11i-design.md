# Phase 11i: the rollover keeps what players chose; your mark on today; a sixth playtest; the release (design and results)

Source: the owner's Phase 11i brief (Nov 19), saying yes to both of 11h's questions. Starting point: 7c2b769 (phase-11h).

## Decisions (continuing A1–A120)
- **A121. The ladder gives up the system's choices first, then the base floor, then the players' (a rule change on purpose):**
  - **The absolute band holds the crowd's curse.** `fairSeed` measures each candidate base floor with the winning curse on it. The curse is the crowd's decision and making the day harder is its purpose, so it is never what pushes a floor out of the relative band.
  - **The relative band is measured against that cursed plain floor:** a crowd floor may lose at most `BAND.maxDropPct` points of win rate against the same seed with only the curse.
  - **The steps, in order:**
    1. `full`: every mod.
    2. `no crowd`: drop what the system derives (zone weights from deaths, the top killer), and keep the curse and the traps.
    3. `reroll`: the players' choices on the next base floors that sit inside the absolute band, up to `LADDER_REROLLS` of them.
    4. `moved traps`: every trap on another tile in its zone (`Trap.slot`, a shift in the generator's own pick that leaves its random stream untouched), up to `TRAP_MOVES` shifts.
    5. `fewer traps`: drop the trap whose removal helps most, one at a time, until the floor fits. The fewest needed go.
    6. `plain`: the last step, always a floor.
  - At zero traps the floor *is* the cursed plain floor, so the curse is set aside only if that floor itself can't be generated.
  - **Unchanged:** a floor always posts, with the plain floor last; nothing carries over more than one day; the rollover stays inside its time budget, measured.
- **A122. What was set aside is counted from what landed:** `setAside` compares the tally's traps with the traps placed on the floor, not with the mods asked for.
- **A123. Your mark on today:**
  - The floor response carries `yours`: the player's own facts from the day before, read on the server from data it already keeps:
    - where they fell, and the danger that zone has today;
    - their curse vote, how the vote ended, with counts, and whether it won or was set aside;
    - their trap: where it waits today, or that it was set aside;
    - what their trap on yesterday's floor caught, and its souls;
    - the Trust and Liar votes their carving got.
  - The intro shows at most three of these lines under "Your mark". A player who wasn't there yesterday gets no section.
  - No new storage, so "Delete my data" and the sweep already remove every source.

## Assumptions (recommended options taken, no questions asked)
- **Moving traps:** a trap moves within its zone to the generator's next candidate tile (slot 1, 2, 3). Dart slits move along the walls the same way.
- **Several traps at once:** every trap moves together. A per-trap search costs more rollover time than it buys.
- **Your mark, line order:** the trap waiting or set aside; the vote; where you fell; the trap's catch; your carving's votes. The first three that exist are shown.
- **The release (D) needs the players' subreddit name,** and it isn't recorded anywhere in the repo. So the phase stops at D and asks, as briefed. A–C are committed first; the tag waits for the release.

## Deviations
- **Generator goldens:** re-recorded on purpose and byte-identical. `tests/golden.json` records `generate()` without traps, and the trap slot defaults to 0, so only the ladder changed. The ladder is covered by the rollover tests and the 28-day test.
- **The intro already overflowed at 360×640** (by 24 px on a day with few lines) before this phase. To make it fit with "Your mark", at heights of 740 px and below:
  - the panel's gaps are 4 px;
  - compass letters share a row with the counts;
  - the day's lines are one paragraph, with "New today" in gilt at its end;
  - the legend is shorter.
  - At 680 px and below, the compass heading is hidden, since the legend names its symbols.
  - "Your mark" leads its own paragraph rather than taking a heading.

## Measurements (448 crowd rollovers, 16 per depth over 1–28)
Each tally has 20 bot deaths on the floor before, a winning curse (1–3 votes) and 1–3 survivors' traps of random kinds and zones: 900 traps in all. The same fixtures were run on the 11h ladder for comparison.
| | 11h ladder | 11i ladder | target |
|---|---|---|---|
| a survivor's trap set aside (rollovers) | 158 (35.3%) | 5 (1.1%) | < 5% |
| traps set aside | 330 of 900 | 8 of 900 | – |
| the winning curse set aside | 29 (6.5%) | 0 (0.0%) | < 1% |
| steps | full 290, no traps 71, no crowd 58, plain 29 | full 299, no crowd 79, reroll 56, moved traps 9, fewer traps 5 | – |
| rollover time, mean / max | 399 / 2,443 ms | 485 / 3,080 ms | < 10 s |
| base floor inside the plain band | 386/448 (uncursed) | 383/448 (with the curse) | – |
| crowd win minus base win, mean (sd) | 9.9 (22.6) | 15.3 (24.8) | ≥ −20 |
| posted win against the target line, mean (sd) | +8.7 (24.9) | +11.1 (27.5) | – |
| posted win by cycle (1–7 / 8–14 / 15–21 / 22–28) | 85 / 71 / 57 / 53 | 86 / 71 / 63 / 56 | 80 → 35 |

Keeping the players' choices makes the posted floors slightly easier and slightly wider: +2.4 points of mean, +2.6 of sd. The curse no longer counts against the band, so the ladder stops at a crowd floor more often, and crowd floors run easier than their base floor. Cycles 3 and 4 move most (+6, +3).

## Sixth blind playtest: one fresh tester, the same crowd setup (world juniper, frozen copy on its own port)
- Day 1 (Floor 9, Frail): cleared on turn 17. They voted Light Sleepers, set a Dart slit in the centre, and trusted one carving.
- Day 2 (Floor 10): cleared on turn 37. The intro read "Your mark: Your dart slit waits in the centre. Your vote won: Light Sleepers 1."
- They read carvings, followed a true one (Day 1's ←, which helped), and judged a false ↑ a lie (it cost them nothing). They found the carving votes, and stated the pitch unprompted.

### Answers, word for word
1. What changed between the two days, and why do you think it changed?
"The floor itself changed (Floor 9 "The Sunken Stair" → Floor 10 "The Sunken Crypts", new layout), the curse went from Frail to Light Sleepers (so I started with 3 hearts instead of 2), the torch went from 30 to 43, the danger map moved (Floor 9's danger was in the north-west; Floor 10's was south-west and north-west), "New today" changed from imps to mechanisms, and on Floor 10 I met no enemies at all — just dart lines and pits. Day 2 also skipped the practice floor and went straight to the briefing. Why: the curse changed because the curse vote set it — the briefing said my vote won. The danger map and the "fell yesterday" counts seem to be built from where people died the day before. Why the torch changed I can only guess; nothing on screen explained that."

2. Did any carving help or mislead you? Did you trust them, and why?
"Both. On Day 1 the "Stairs this way ←" carvings matched — the stairs really were to the left — and on the practice floor the "←" note led me straight to the stairs. But on Day 1 the "↓" carvings contradicted the "←" ones, which confused me for a few turns, and on Day 2 the "Stairs this way ↑" carving at the start doorway was plainly false, since I'd just come from up. I treated them as a rough hint and checked them against the map and what I could see, rather than trusting them outright. Once the Board told me the nameless delvers were bots, I trusted them even less. The "Trap ahead" note near the stairs made me hesitate, but I went ahead because the briefing said only one trap had been set and I knew it was mine."

3. What did your own run on day 1 do to day 2?
"Directly: my curse vote (Light Sleepers) became Day 2's curse — the briefing said "Your vote won: Light Sleepers 1". The Dart slit I set in the centre showed up on Day 2 ("Your dart slit waits in the centre"); I even walked across its red line myself and it didn't fire, and the card later said nobody had stepped on it yet. My clear started a streak (1 after Day 1, 2 after Day 2). My trust vote showed up on that carving's count, though as far as I could tell it didn't have any effect on Day 2."

4. In one sentence, what is this game about?
"It's a daily dungeon crawl where you race a shrinking torch to find the stairs, and every player's deaths, notes, votes and traps from one day shape the floor everyone plays the next."

### Fixes from these notes
- The Board says what Souls are: "1 for each delver hurt and 3 for each one taken".
- Your trap's line says your own trap never fires on you.
- **Local harness only:** a crowd world's carvings start with no votes, because bots never vote.
- Results: `bun run check` 168/168 (goldens identical when re-recorded), lint clean; e2e 147/147 including section 28 (your mark, the intro at 360×640), the timed 18-move run (2.5 s) and layouts from 320×320 to 1280×800; input to motion 3.8 ms, animation lock median 99 ms, max 108 ms.
