# Phase 11h: a two-line log, readable dark rooms, truthful nameless delvers, the crowd playtest (design and results)

Source: the owner's Phase 11h brief (Nov 19), built on the fourth blind playtest (Phase 11g). Starting point: 43ec93f (phase-11g). No rule changes: the simulation goldens stay as they are. Bot carvings change on purpose: the sim never reads them.

## Decisions (continuing A1–A110)
- **A111. A two-line log:**
  - The line under the HUD keeps the last two lines it showed: the newest in full, the one before it dimmed above it.
  - A line stays for 3 turns after it last showed (`LOG_TURNS` in content.ts), so a hurt line outlives the move after it.
  - The older line is `aria-hidden`: the live region still announces each new line once.
  - It fits at 320×320: two lines at the small size, over the top of the map, under the HUD.
- **A112. Dark sill:**
  - An opening into an unlit dark room gets a broken threshold line in stone, twice as thick, in place of the solid pale one, so the darkness shows before you step in.
  - Once the room's brazier is lit, the line turns solid pale like any other.
  - An ink line was tried first: it vanished against the unseen room behind it.
- **A113. Art:**
  - **Holes:** the open pit is redrawn as a ragged hole with floor showing at its corners and a lit lower lip, never a straight-edged dark wedge like the stairs.
  - **Lowered spikes:** retracted and half-raised spikes get a mark over the pack frame: four bone tips standing in their ink holes, so they read as a trap that is down, not as cobbles.
  - No new colours.
- **A114. "Torch burned" on the end card:**
  - The result line reads "34 turns, 51 torch burned." or "The dark took you on turn 45, 60 torch burned."
  - M comes from replaying the run's own log: every torch drop is added, and oil isn't counted against it. With no log on the device, the line is left out.
  - A longer note ("dark rooms burn faster") pushed the death picker's panel over the death tile at 320×320, so it was cut; the in-run "Torch low" line already says a room burns 2 a turn.
- **A115. Brazier ember:**
  - An unlit brazier shows a faint ember above the fog when it is in your line of sight within `BRAZIER_EMBER_RANGE` (8) tiles, however dark the room.
  - It is something to walk towards.
  - It goes out of view like any light behind a wall, and disappears once the brazier is lit.
- **A116. Dark rooms, wall against floor:**
  - A lit wall beside a dark room's lit floor is washed pale (40%), and gets a 2 px bone edge on each side that faces that floor. Floor tiles stay as they are.
  - The contrast is measured on a screenshot (mean relative luminance, `dark-4` scene at 390×844) and stated in the results. Target: 3:1 or more for the edge against the floor, the bar for a boundary.
  - Tried and rejected: a 1 px pale edge alone (1.02:1, whole tile), and a pale wash alone (1.41:1 at 40%; still only 1.88:1 at 70%, which reads as fog).
- **A117. Screenshots inside the repo:**
  - The Playwright MCP writes relative to its own working directory, which is the folder the session started in (`~/Documents/Projects`), not the repo.
  - Every screenshot call, and every tester prompt, now gives an absolute path inside the repo's `.playwright-mcp/` (gitignored).
  - The strays already outside are moved in.
  - The root fix is one flag on the user-level MCP config (`--output-dir`). That file is outside the repo and under the never-edit rule, so it is proposed, not made.
- **A118. Nameless delvers that know something:**
  - A bot that dies and carves (every other one, as now) carves from the floor's truth at its death tile (`botCarving` in ghosts.ts):
    - **"Trap ahead"** if a hazard tile or a player's trap is within 2 steps.
    - Else **"Dead end"** if the tile is in a pocket: cut its first step towards the stairs, and neither the stairs nor the entrance can be reached.
    - Else **"Stairs this way"**, pointing along a shortest walk to the stairs.
  - One in `BOT_LIE_IN` (4) lies on purpose: a warning where none is true, or an arrow that is not a shortest step.
  - Every choice is seeded by the bot's id and the day, so it is deterministic.
  - `carvingTrue(floor, at, carving)` judges any of these three; a test checks every true carving true, every lie false, and the share near one in four over many floors.
  - Bots stay labelled and excluded exactly as now. The local fixture crowd carves the same way.
- **A119. The crowd harness (local only):**
  - `?world=<name>` is a fresh crowd world for one tester: its own storage namespace, its own seed.
  - **Day 1** is the server's rollover of a fixture day 0, in shared code (`rolloverFloor`): three fixture players' owned traps and a curse vote.
  - On it, 20 nameless delvers die by real bot runs (`bot()`, judged like any run), and every other one carves by A118. The bots' clears count as runs, as on the server.
  - **Day 2** is made when it is first asked for, by the same `rolloverFloor`, from day 1's tally as the server builds it:
    - deaths per zone (bots and the tester);
    - kills by cause;
    - the tester's curse vote;
    - the tester's trap.
  - Day 2 also gets the yesterday line, the showcase and its own 20 delvers, as the rollover and the nameless job do.
  - The tester moves between days by URL (`&day=10`), with no tool or script.

- **A120. Fifth blind playtest fixes (wording, hints, harness; no rule change):**
  - **What the band set aside:** the rollover records what the crowd chose but the band kept off the floor. This is `setAside(tally, rolled)` in crowd.ts, stored as `yesterday.setAside`. The intro says it: "The vote for Light Sleepers and 1 survivor's trap were set aside: with them, today would have been too deadly." Tester 1's vote and trap had vanished without a word.
  - **A pit lesson** (bit 9, appended): "A round black hole: a pit. Step in and you fall, a heart lost." Tester 2 took a pit for a brazier and died in it.
  - **The Board** says bots never appear on it: "Nameless delvers are bots: their ghosts and carvings are on the floor, never on a board." Both testers asked why 20 fell and only they were listed.
  - **The carvings list** gives each carving's compass zone ("SW · Stairs this way ←"), so a row can be matched to a ghost.
  - **"(+3)" on the line** now reads "(+3 more carvings near)".
  - **The intro legend** names the dashed frame ("dashed: most fell").
  - **The yesterday line** ends in a full stop, not a semicolon: the pixel font draws ";" like ":".
  - **Local harness only:** in a crowd world, the Board, the Chronicle and the streak show what this profile actually did. They used to show fixtures (souls 12, deepest 12, a fixed ledger), and tester 1 read them as proof the other players were fake.

## Assumptions (recommended options taken, no questions asked)
- Only "Stairs this way" carries a bot's arrow, and only "Trap ahead" and "Dead end" its warnings. The other phrases are opinions ("Worth the risk") that a floor can't make true or false.
- A lie keeps the kind a truth would have used where it can: an arrow lies by pointing a wrong way, a warning by warning where nothing is.
- "The real rollover" in the playtest is the shared `rolloverFloor` and the server's tally rules, run on local storage. The Devvit server can't run in a browser harness, and the rollover's floor logic is the same code.
- The crowd days are depth 9 and 10: ordinary floors in cycle 2, not a Warden day.
- At most three testers. They stop once one has fallen on day 1 and one has cleared it.

## Not now
- Free-text carvings, bot votes on carvings, bots setting traps (a bot never sets one, as now).

## Measurements
- **Bot carvings:** 3,647 carvings on 112 generated floors (every third floor tile, depths 1–28, 4 seeds each). 910 are false: 25.0%, against `BOT_LIE_IN` = 4. Every one that isn't a lie is true by `carvingTrue`. By phrase: Stairs this way 2,900, Trap ahead 491, Dead end 256.
- **Dark rooms, wall against floor** (`dark-4`, 390×844, mean relative luminance):
  - wall tile 1.02:1 before;
  - 1.75:1 now, with the pale wash;
  - the bone edge against the floor: 3.57:1 on a top edge, 4.48:1 on a side edge.
  - The 3:1 target is met by the edge, not by the whole tile.
- **What the band sets aside:** 270 rollovers (depths 2–28, 2 seeds, each curse as the only vote, one player's trap, 20 bot deaths).
  - Ladder steps: full 162, no traps 54, no crowd 38, plain 16.
  - A single voted curse is set aside 2–9% of the time, depending on the curse (Deep Dark the most).
  - The player's trap is set aside 40% of the time.

## Fifth blind playtest: the crowd (two fresh agents; touch at 390×844; frozen copies on their own ports)
Each tester had a crowd world:
- **Day 9:** rolled over from a fixture day: Frail, three players' traps, 17 dead and 6 cleared "yesterday". 20 nameless delvers had died on it, every other one carving under A118.
- **Day 10:** rolled over from day 9's tally, including the tester's own run, vote and trap.

The questions came after both days, word for word as briefed. The brief allowed up to three testers, but the stop condition was met at two: one fell on day 1 and one cleared it.

| | Tester 1 (world cedar) | Tester 2 (world ash) |
|---|---|---|
| Day 1 (Floor 9, Frail) | cleared, turn 25 | fell to a pit, turn 33 |
| Day 2 (Floor 10) | cleared, turn 39 | cleared, 36 turns |
| On the card | voted Light Sleepers; set False stairs, SE; trusted a carving; liar-voted "Dead end" on day 2 | trusted "C · Dead end"; carved "Something waits here"; on day 2 voted Short Wick, set Spikes in the centre, one trust and one liar vote |
| Read carvings? | yes, from the first ghost | yes, from the first ghost |
| Did following a true one help? | yes: the practice ← and Floor 9's → corridor | yes: the practice ← and the day 2 ← beside the stairs |
| Did a lie cost them? | yes: ↓ and ← carvings "cost me torch and put me in reach of the skeletons" | yes, and they also ignored a true one: the honest "Dead end" by the false stairs cost a heart. Day 2's ↓, half right, led into a pit field |
| Found the carving votes? | yes (trust and liar) | yes (trust and liar) |
| Stated the pitch unprompted? | yes | yes |
| What their day 1 did to day 2 | "I'm not sure it did anything." The band had set aside their vote and trap (fixed in A120: the intro now says so) | "Visibly, not much directly": they saw their death in "21 fell" and the streak go to 2 |

### Tester 1's answers, word for word
1. What changed between the two days, and why do you think it changed?
"The floor itself (new name — Starless Barrows → Forgotten Warrens, new start corner NW→NE, different layout), the torch (45 → 65), the curse (Frail with 2 hearts → "No curse today"), where the danger sat (north → centre), the top killer (goblins → "dark"), and the new enemy type (imps → "mechanisms", which I took to be the dot-tiles that popped up as spikes). There was also no practice floor on day 2. Why: I think each day is a new hand-made/generated floor, and the briefing is built from what happened to the other players the day before — the ☠ counts are "fell yesterday" and "most in the west" described where people died on Floor 9. The curse is supposed to come from player votes; I couldn't see why it came out as "no curse" since my vote was the only one shown — my guess is a single vote didn't count, or the vote didn't carry over, but that's a guess."

2. Did any carving help or mislead you? Did you trust them, and why?
"Both. "Stairs this way ←" on the practice floor was right and led me to the stairs, and on Floor 9 the → carvings in the corridor pointed truthfully toward the exit. But on Floor 9 several "↓" and "←" carvings pointed at walls or into the dead-end ghost room, which cost me torch and put me in reach of the skeletons, and on Floor 10 a "Dead end" carving sat one step from the real stairs — plainly false. I half-trusted them: early on I followed them because I had nothing else, but I learned quickly they contradict each other, so I treated them as a rough hint to check against the Map's gold edges. The numbers beside them like (+7) made me lean toward the high ones, though nothing told me what those numbers meant. The most useful thing about ghosts wasn't the text, it was the crowd: a room full of ghosts meant that room kills people."

3. What did your own run on day 1 do to day 2?
"As far as I could see from the screen, I'm not sure it did anything. I voted Light Sleepers, set False stairs in the SE, and trusted one carving on day 1. On day 2 the briefing said "No curse today", never mentioned my trap, my Souls count stayed at 12, and the streak stayed at 1 instead of going to 2. So the game clearly wants my day-1 choices (vote, trap "for tomorrow", trust/liar votes on carvings) to shape the next floor for everyone, but I never saw proof that mine landed. It's possible I walked past my own trap somewhere I didn't go, but nothing told me. What did carry over was what I learned: knowing false stairs exist made me check the Map ("orange: stairs") before stepping onto the stairs on day 2."

4. In one sentence, what is this game about?
"It's a daily one-floor dungeon crawl where you race your torch to the stairs through a floor shaped by the players before you — their ghosts leave true-or-false advice, their traps wait for you, and their votes pick your curse — and then you get to do the same to whoever comes next."

### Tester 2's answers, word for word
1. What changed between the two days, and why do you think it changed?
"Day 2 was a new floor (Floor 10, "The Rotting Halls") with a new layout and no practice floor — it went straight to the briefing. The curse from Day 1 (Frail, 2 hearts) was gone, so I had 3 hearts; torch went from 55 to 53; the danger moved from the centre to the east; Day 1 introduced imps, Day 2 introduced "mechanisms"; the top killer changed from goblins to the dark; and the Day 2 briefing summed up Floor 9 ("21 fell, most in the west, 1 cleared"). Why: the screens told me part of it — each floor's briefing is built from what players did the day before (where they died, how many cleared, what traps survivors set), and after my clear on Day 2 I was asked to vote on tomorrow's curse and set a trap, so I believe the next day's curse and traps are chosen by players. Why the torch and layout changed I can't say; I assume each day is simply a new floor. I also played differently on Day 2 because I now knew about pits, frames, bump attacks and false stairs, and checked the map before stepping on stairs."

2. Did any carving help or mislead you? Did you trust them, and why?
"Both. On Day 1 the "Dead end" ghosts next to the thing that looked like stairs were honest — I ignored them because the stairs looked real, and it cost me a heart. That was the most memorable moment. "Stairs this way ←" on the practice floor and on Day 2 was right. But a "Stairs this way ↑" ghost one tile from the real stairs pointed the wrong way, and Day 2's "Stairs this way ↓" at the start sent me into a pit field (the stairs were roughly south-west, so it was half right but cost me a heart). So I started out trusting my eyes over the ghosts, and after the false stairs I treated carvings as hints to check against something else — the map, mainly, since "orange: stairs" only appears for real stairs. I never fully trusted any single one because almost every ghost said "Taken by the dark", the existing trust/liar counts were split, and the game says outright that some are liars."

3. What did your own run on day 1 do to day 2?
"Visibly, not much directly. My carving ("Something waits here") was left on Floor 9, which I never saw again on Floor 10. My Day 1 card said "21 fell here today" and the Day 2 briefing said "21 fell on Floor 9", so my death seems to be counted in that number, and my streak went to 2 (it counts falls and clears). My trust vote on Day 1 went into the Floor 9 carvings, not Floor 10. The Day 2 briefing said Floor 9's deaths were "most in the west" — I can't tell if my death fed that, and "1 cleared it" wasn't me. The biggest effect was on me: I came into Day 2 knowing the rules I'd learned the hard way. What I did on Day 2 (curse vote, trap) is aimed at tomorrow, which I didn't get to see."

4. In one sentence, what is this game about?
"You descend one shared dungeon floor a day, trying to reach the stairs before your torch runs out, using the ghosts and warnings left by players who died before you (some honest, some lying), and leaving your own warning or trap for the next day's players."

### What the testers' notes changed (A120), and what stays
- **Fixed:** the vote and trap that vanished; pits; Board versus fell counts; matching carvings to ghosts; "(+N)"; the dashed frame; the harness fixtures.
- **Not changed:**
  - Imps "jumping": a dive is their rule.
  - The trust count behind the open card updates when the card closes.
  - A carving left on Floor 9 isn't seen on Floor 10: carvings belong to their floor.

## Proposals (not built)
1. **Keep the players' traps over the crowd's zone weights.** Today the ladder drops traps before the crowd modifiers, so a survivor's trap is set aside 40% of the time. Try the crowd step before the trap step: full, then no crowd (traps and curse kept), then no traps, then plain. This is a generator change: re-measure both bands and re-record the generator goldens. About 2 hours.
2. **Tell each player what their own run did,** on the next day's intro: "You fell in the west: one of the 21." "Your vote won." "Your trap waits in the south-east." Both testers' third answer was that they couldn't see it. It needs the floor response to carry the player's own day-before facts: a server field, no rule change. About half a day.
3. **The intro's set-aside line could name the step** ("too deadly with the crowd's curse"). It is enough for now.

## Results
- `bun run check`: 166/166, simulation and generator goldens unchanged. Lint is clean.
- E2E: 144/144, the full suite plus section 27, including the timed 18-move run (2.5 s) and layouts from 320×320 to 1280×800. Input to motion 14.9 ms; animation lock median 99 ms, max 115 ms.
