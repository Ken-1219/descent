# Phase 9: Screens and feed presence (design)

Source: PLAN.md §7 (Screens), §11 Phase 9, §15, and the owner's Phase 9 brief. Starting point: c1472da.

## Screens
- **Intro** (replaces the yesterday line): before your first move on the day's floor. It shows:
  - the floor and its curse (with the effect)
  - a 3×3 compass: yesterday's deaths per zone, plus today's danger per zone counted from the stored floor itself, so a displaced effect shows where the hazards actually went
  - the top killer, the number of traps, and your own trap's news
  - what's new today: the showcase family's sprite and one line

  One primary action: Descend. Splash Descend is the first tap and intro Descend the second, so the first move is open after two taps.
  - States: Floor 1 (no yesterday); fewer than 3 deaths ("too few fell to move anything"); no curse ("no curse today").
- **Already played** (the result plate, made full):
  - result, streak and the live ghost count (polled every 20 s while visible, asking only for counts)
  - a countdown to the next floor
  - a mini-map with your wisp
  - your choices; buttons to Carvings, Board and Chronicle
- **Board**, loaded on demand:
  - today's scores, deepest floor cleared, souls, honour
  - the Top Trapsetter and Most Notorious Liar plates
- **Chronicle:** one row per floor, newest first (ledger style).
- **Splash:**
  - a mini-render of today's floor with live wisp dots
  - a 3-second loop: a delver falls, a wisp rises, a trap appears
  - "N fell today", the curse, Descend, the played state

  No Phaser, no sim; the mini-render draws `rows` with a 2D canvas.
- **Lab tab "Screens":** every state framed at phone size, from local fixtures.

## Stored data (written only when a run or vote is accepted; never in the rollover)
- `f:{d}:scores` (existing) is today's board. Bots are no longer added.
- **Lifetime sorted sets:**
  - `deepest`: deepest floor cleared
  - `souls` and `honour` (existing)
  - `deaths`: lifetime deaths
  - `liars`: Liar votes received
  - `trapsouls`: souls earned from traps, for the Top Trapsetter
- **Hashes:**
  - `names`: user → name (board rows)
  - `streak`: user → `{ last, n }`
- **Run record:** gains `undo { deepest, streak }`, the values before this run, so the reset tool can restore them.
- **Floor JSON** (from this rollover on):
  - `yesterday` gains `deaths[9]` and `killer`
  - a new `showcase` field (the family introduced or raised today)

## Decisions (continuing A1–A32)
- A33. **Tie rule (every board):** higher value first; equal values go to the higher Reddit user id, which is Redis's own descending order. It is deterministic, and the caller's rank is exact: `card − zRank`.
- A34. **Streak, counted in floors:**
  - Your streak is the number of consecutive floor depths you have a run on.
  - A run on depth d continues the streak if your previous run was on d − 1; otherwise it starts again at 1.
  - Dates never enter it, so a manual rollover can't inflate a streak; one run per floor caps it.
  - A floor nobody can play (an extra test floor) would break it. That only happens with dev tools, which are off in production.
- A35. **Board response:** each board returns its top 10 rows plus the caller's row and rank (even outside the top) and the total. Two reads plus one name lookup per board. Loaded only when the Board opens.
- A36. **Lifetime record on the ghost card:**
  - Deaths, Trusted, Liar: lifetime totals minus today's votes on today's carving, so nothing on the card says whether today's carving is true.
  - Loaded with the avatar when the card opens (`GET /api/card`, replacing `/api/avatar`).
  - Bots have no record.
- A37. **Countdown:** to the next cron run (15:00 UTC), sent by the server as `nextAt`. Polling: `GET /api/pulse?depth=` returns `{ fell, carved }` every 20 s while the tab is visible and the plate is open.

## Built and measured (Nov 16)
- **Floor 6 rollover:** not yet due at the time of this phase (cron 15:00 UTC; last run Nov 15 posted Floor 4 → 5 by "Roll over now", 413 ms, flair 1 set). Nothing failed. Floor 6 will be the first floor stored with `deaths[9]`, `killer` and `showcase`.
- **Board, 10,000 players (test harness):** 2,220 bytes, 24.5 ms warm (130 ms on the first, cold read of the in-memory mock). Reddit: `/api/board` 13–17 ms, 320 bytes with one player.
- **Splash JS:** 7.0 KB gzip (default 1.2 + content 1.8 + net 4.1).
- **Reddit (playtest v0.0.1.150), Floor 5:**
  - The intro read "40 fell on Floor 4, most in the west; 3 cleared it. Today's danger gathered in the north-west. Survivors set 1 trap here. Your spikes wait here…". Its danger per zone (4,0,0,0,2,2,3,1,0) equals a count made independently from the stored rows. Floor 5 predates Phase 9, so the compass showed danger only (no ☠ row, no killer, no showcase).
  - Death: `POST /api/run d5 saved dead 59`, then `board: today 1, you #1`. Reset: `RESET run of Clean_Position8332 on floor 5 (had a run)`. Win: `POST /api/run d5 saved won 1233`; Today 1233, Deepest 5. Chronicle: 1 row (Floor 4).
- **Deviations:**
  - The intro is the end panel in an "intro" style (not a separate screen element), so Descend sits where every other primary action does.
  - The killer line uses family names where a cause maps to one; "the dark" and "player traps" otherwise.
  - Long panels scroll inside themselves, with their action row pinned to the bottom (320×320 plate).

## Follow-up before Phase 10 (Nov 16)
- **A38. Today's ties:** equal scores rank the earlier accepted run first. `f:{d}:scores` stores `score × BOARD.order + (BOARD.order − 1 − n)`, where n is the run's acceptance number on that floor (`f:{d}:seq`, incremented once per player after the run-once guard). The board decodes `⌊value / order⌋`; the caller's rank stays `card − zRank`. Lifetime boards keep A33.
- **A39. Difficulty data:**
  - Each new floor stores `predicted { win, plain, target }`: the bot's skill-60 win % on the stored floor, the plain floor's, and §8's target.
  - Real players are counted on acceptance in `f:{d}:real` (`cleared`, `fell`; bots never, the reset tool takes a run back out).
  - At rollover the Chronicle record gets `predicted` (the floor's bot win %) and `players { cleared, fell }`. The ROLLOVER line ends `floor N predicted X%, players C cleared / F fell (P%)`.
  - Floors stored before this change log `predicted n/a`.
- **Past depth 28** the target stays flat at 35% (band [20, 50]); `targetPct` clamps the depth at `PLAIN_BAND.endDepth`.
