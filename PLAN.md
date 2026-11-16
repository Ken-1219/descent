# Descent — Build Plan

Plan date: Nov 13, 2026 · Deadline: Dec 9, 7:30 AM IST · Feature freeze: Dec 5

Descent ships in 13 gated phases (0–12). Each phase ends with something visible in a browser, a Playwright check Claude Code runs itself, and a stop for your approval.

## 1. How to use this plan

- `PLAN.md` is the single source of truth. `CLAUDE.md` holds only the short rules in §4.
- One phase per Claude Code session. Kickoff prompt: `Read PLAN.md and CLAUDE.md. Do Phase N only. Run the check loop. Stop at the gate.`
- A phase is done when all seven hold:
  1. `bun run check` is green (type-check + Vitest).
  2. The Playwright check loop (§10) passes at every viewport in the matrix.
  3. Screenshots are saved in `shots/phase-N/`.
  4. The report lists the exact URL(s) for you to open.
  5. `/ponytail-review` ran on the diff; its delete list is applied or answered.
  6. Every file is listed in the §5 map with a one-line purpose.
  7. The phase report is 15 lines or fewer: built, verified, deviations, questions.
- Claude Code never starts the next phase unprompted. Ideas outside the phase go in a "Later" list at the bottom of this file, one line each.

## 2. Purpose and scope

**Purpose.** Win Best Daily Game or an Honorable Mention by shipping one small, polished idea: *the community's deaths build tomorrow's floor*. Every decision is judged against the four criteria: Delightful UX, Polish, Reddity, Daily Content.

**In scope**

- One turn-based run per day, 2–3 minutes, one action type (move; bumping attacks).
- Floor 0 tutorial, then a seeded floor per day with tiered obstacles.
- Ghosts and fixed-phrase carvings, compass heatmap, curse vote, Trapsetter and souls.
- Daily rollover: new post, summary comment, flair.
- Splash, intro, game, death, victory, already-played, leaderboard screens.
- The Warden boss and Chronicle screen, unless cut under §14.

**Out of scope (do not build)**

- React, Tailwind, any UI or state library.
- Realtime. The already-played screen polls every 20 s instead.
- Free-text input, accounts, settings pages, a level editor.
- Classes, gear, stats, meta-progression, a second item slot.
- External network calls, analytics, LLM calls.
- A standalone website, multiple art themes, music.
- Anti-scouting beyond replay validation. Log run starts; act on them after the hackathon.

## 3. Changes to the Nov 12 game plan

| # | Was | Now | Why |
|---|---|---|---|
| 1 | React screens + Phaser | Plain DOM/CSS screens + one Phaser scene | Fewer files, smaller bundle, and Playwright can read DOM screens |
| 2 | Realtime with polling fallback | Polling only | First item on the cut list; decide it now |
| 3 | CC0 packs recolored purple | Kenney 1-Bit pack tinted by our palette, plus code-drawn layers | Purple is the default AI-game look; 1-bit sprites make the palette entirely ours |
| 4 | Snoovatars as map sprites | Wisps on the map; snoovatar in the ghost card | 300 avatar images at 16 px are unreadable and heavy |
| 5 | 4×4-tile heat zones | 3×3 compass zones, rank-weighted | Stable across grid sizes; reads the same with 20 or 300 players |
| 6 | Redis sets and lists | Hashes, sorted sets, strings only | See §4 platform facts |
| 7 | "Difficulty rises" | Depth budget + tier table + bot-measured curve (§8) | Makes difficulty visible and testable |
| 8 | Skeleton "avoid a second time" | Collapses when hit, rebuilds after N turns | One rule a player learns in one encounter |
| 9 | CC0 SFX files | SFX synthesized with WebAudio | No files, no licences |
| 10 | Freeze Dec 6 / Dec 5 (both appear) | Dec 5 | Later section of the game plan wins |
| 11 | Rollover time open | 10:00 UTC, one constant | New floor waits for the US morning; visible to the dev at 3:30 PM IST |
| 12 | Kenney 1-bit, flat light bands (row 3) | 0x72 DungeonTileset II (CC0), stone graded onto the ink ramp, soft torch glow; our own hero, wisp and icons as outlined pixel maps | User decision at the Phase 1 gate (Nov 13): 1-bit sprites could not read as characters at 16 px |

## 4. Engineering rules

### Platform facts checked on Nov 13, 2026

| Fact | Consequence |
|---|---|
| The Phaser starter is Devvit + Vite + Phaser + Hono + TypeScript on Node 22 | Add nothing to that stack |
| The Devvit Vite plugin has no `vite dev` or HMR; playtest uploads the build and runs it on Reddit | We need our own local harness for fast loops and Playwright |
| Code shared by client and server belongs in a neutral folder such as `src/shared` | All game rules live there |
| Server endpoints must start with `/api/`; limits are 30 s per request, 4 MB payload, 10 MB response (unverified: not found in the docs on Nov 13) | Rollover must be bounded work |
| Devvit Redis has strings, hashes, sorted sets, numbers, bitfields and transactions, but no plain sets or lists | Data model in Phase 6 uses hashes and sorted sets |
| Each installation gets 100 MB storage unpublished, 5 GB published, and a 5 MB request size | Our data is far below this |
| Scheduled tasks are declared in `devvit.json` with an `/internal/...` endpoint and a cron string | Rollover is one cron task |
| Built-in splash screens are gone; use a dedicated splash entrypoint HTML page | `splash.html` is ours to design |
| Expanded mode must be started by an explicit user action | The Descend button calls `requestExpandedMode` |
| Template guidance: keep the splash fast and heavy dependencies in `game.html` | No Phaser on the splash |
| An open issue reports inline posts set to "tall" rendering well under 512 px on the mobile apps | Splash must work at 320 px height |
| `@devvit/test` gives Vitest an in-memory Redis, Reddit API and Scheduler per test | Server tests need no hand-written mocks |

The Redis, scheduler and test facts came from mirrored copies of Reddit's docs. Phase 0 re-checks them at developers.reddit.com/docs.

### Ponytail

- Install: run `/plugin marketplace add DietrichGebert/ponytail`, then `/plugin install ponytail@ponytail`, then start a new session.
- Mode: `full`. `ultra` may challenge the feature itself, so never use it here.
- The ladder: does it need to exist, does the codebase have it, the standard library, the native platform, an installed dependency, can it be one line, and only then minimum new code.
- Before each phase commit, run `/ponytail-review` on the diff; it returns a read-only delete list.
- Mark deliberate shortcuts with a `// ponytail:` comment naming the ceiling and the upgrade trigger. Run `/ponytail-debt` in Phase 11.
- Ponytail is a nudge, not a guarantee: an independent 80-task test measured about 15% less code against an advertised 54%. The file map in §5 and its split rule are the control.

The ladder applied to Descent:

| Need | Stop at |
|---|---|
| Menus, HUD, text | DOM + CSS (native platform) |
| UI animation | CSS `steps()` |
| Pathfinding | One BFS in `grid.ts`, reused for solvability, the bot and enemy chase |
| Randomness | One mulberry32 in `rng.ts` |
| Sound | WebAudio oscillators, about 40 lines |
| Persistence | Redis hashes and sorted sets, no wrapper layer |
| Seeding history | The same `bot()` used for difficulty tests |

### `CLAUDE.md` (paste as is)

```md
# Descent — rules for Claude Code
Read PLAN.md first. Do one phase per session, then stop at its gate.

## Always
- Ponytail full mode. Run /ponytail-review before each phase commit.
- Files: PLAN.md §5 is the file map, not a hard whitelist. Create a new file when its code is independent of every existing file, or when a file passes about 600 lines and has a part that can move out cleanly. Add each new file to §5 with a one-line purpose and list it in the phase report. No approval needed; the Never rules (no utils/helpers/types folders, barrels or one-function files) still apply.
- Game rules live only in src/shared. The client draws, the server judges.
- No Math.random, Date, floats, or unordered iteration in src/shared.
- Every tuning number lives in src/shared/content.ts.
- Colours and sizes come from tokens. No raw hex outside content.ts and style.css.
- Use the Phaser and Devvit versions already in package.json. Do not upgrade.
- End with the check loop (PLAN.md §10) and a phase report.

## Never
- React, Tailwind, UI kits, state libraries, new runtime dependencies.
- utils/, helpers/, types/ folders; barrel index files; one-function files; wrapper classes.
- Extra docs, CI, lint plugins, Docker, Storybook.
- Work from a later phase.
- External network calls, analytics, LLM calls.
```

### Determinism rules for `src/shared`

- Integers only. Stable iteration order (arrays, never object-key order). Every sort has a total comparator.
- Turn order is fixed: player acts → mechanisms tick → enemies act in id order → torch −1 → damage resolves → end check.
- `step(state, action)` returns events for the view. The Phaser scene never decides a rule.

## 5. File map

```
PLAN.md  CLAUDE.md  README.md  devvit.json
vite.local.config.ts        local harness only, no Devvit plugin
vite.phaser.ts              slim Phaser: bundles phaser/src/phaser-core.js with unused features off (prod build and dev pre-bundle)
src/shared/
  content.ts                palette, obstacle/enemy/item/curse/carving tables, tuning
  rng.ts                    mulberry32, rand (pure step for state-held rng), hash, pick, shuffle
  grid.ts                   tile-grid geometry: what a map char blocks, line of sight, BFS, rays (gen.ts reuses the BFS)
  gen.ts                    tiersFor(), generate(depth, seed, mods), budget, crowd weights, player traps, fairness gates, safePath()
  bot.ts                    bot(floor, skill, seed): plays from what a player can see (visibility + tells); gate 3 and the curve
  sim.ts                    State, step(), tells(), replay(), score(), judge() (validates and replays a submitted log)
  crowd.ts                  Phase 8: tally → mods, the rollover ladder and no-spiral band, trap attribution from a replay (server and Lab)
  ghosts.ts                 ghost and carving types, carvingOf(), ghostView() (capped wire view), fixtureGhosts(); never read by the sim
  scenes.ts                 one scene per tier-table cell, trap and item: map, log, expected outcome (tests, Lab, ?scene= in dev only)
  api.ts                    wire types (reuse the template's shared types file if one exists)
src/client/
  splash.html  splash.ts    inline feed card, no Phaser
  game.html    game.ts      boot, screen router, input, debug hook
  net.ts                    api() (fetch in production, local.ts in dev) and the background submit with 3 retries
  scene.ts                  the one Phaser scene
  ui.ts                     DOM screens and HUD
  sprites.ts                pixel-map rendering, light levels, pack frames and grading, ANIMS + frameAt
  art.ts                    pixel art drawn for Descent: hero, wisp, wall torch, death frames, UI icons
  style.css                 tokens and all UI CSS
  local.ts                  LOCAL ONLY: fake endpoints on localStorage, fixtures, advanceDay
  lab.html     lab.ts       LOCAL ONLY: Design Lab (Tokens, Kit, Cast, tab router)
  labfloors.ts              LOCAL ONLY: Lab tabs that draw floors: Bestiary, Depth, Ghosts (fixtures) and Rollover (tally → floor)
  assets/                   atlas.png, fonts/*.woff2, fonts/OFL.txt, icon
src/server/
  index.ts                  Hono app, one log line per request
  routes/                   template route files: api.ts (/api/*), menu.ts, forms.ts (seed bots), triggers.ts, scheduler.ts (cron)
  game.ts                   Redis reads/writes: floors, runs, ghosts, votes, traps, souls, boards
  rollover.ts               daily job and mod menu actions
tests/
  shared.test.ts  server.test.ts
  bundle.test.ts            production build: server carries gen and bot; client carries no gen, bot, scenes, Lab, local or hook
  gen.test.ts               tiers, determinism, crowd, curses, traps, 2,000-floor gates, generate() timing
  curve.test.ts             bot win-rate curve on two seed lists (own file so Vitest runs it in parallel)
  rollover.test.ts          Phase 8: tally, ladder, band, 28 bot days, trap selection and trap souls, flair bounds
  play.mcp.js               end-to-end browser check run through the Playwright MCP (rules, input, death, resize)
shots/                      gitignored
docs/superpowers/           per-phase specs and plans written by Superpowers
```

- Adapt names to what the template already has; never duplicate a template file.
- New files: create one when its code is independent of existing files, or when a file passes about 600 lines and has a part that can move out cleanly. Add it to this map and name it in the phase report. No approval needed.
- `local.ts`, `lab.html` and `lab.ts` are not Devvit entrypoints and must not appear in the production bundle. Verify this in Phase 0.

## 6. Design direction: "Torchlit Ink"

The dungeon is cold ink. The only warm thing in it is you.

### The three-light rule

| Light | Colour | Means |
|---|---|---|
| Ember | warm orange | You, your torch, the primary action |
| Wisp | pale green-cyan | The dead: ghosts, carvings, anything left by players |
| Blood | red | Will hurt you this turn |

Inside our own art and UI, nothing else may use these three colours. Creature and prop art from the 0x72 pack keeps its own colours; a threat's tell is always our `blood` mark, never the creature's art alone.

### Tokens

| Token | Hex | Use |
|---|---|---|
| `ink-0` | `#0d0f14` | Void, page background |
| `ink-1` | `#171b24` | Remembered floor |
| `ink-2` | `#262c3a` | Plates, unlit walls |
| `stone` | `#4a5165` | Dim walls, dormant mechanisms |
| `pale` | `#8b93a7` | Secondary text, robe shade |
| `bone` | `#d9cfb8` | Lit floor detail, primary text, borders |
| `ember` | `#f2a33a` | Torch, hero flame, primary button |
| `ember-deep` | `#b5541e` | Low torch, pressed button |
| `wisp` | `#8fe3c8` | Ghosts, carvings |
| `blood` | `#d8433b` | Active danger, damage |
| `gilt` | `#e8cf6a` | Treasure, key |
| `bile` | `#b7c94a` | Curses |

- Type: **Jacquard 24** (pixel blackletter) for the title, floor numbers and death/victory headlines only. **Pixelify Sans** for everything else, 16 px minimum: its 2 and 5 smear into 8 and S below 16 px.
- Self-host both as woff2. Confirm each font's OFL licence file when adding it, and credit it in the README.
- Sprites: 16 px wide. Environment, props, items and enemies come from 0x72 DungeonTileset II v1.7 (CC0) in `assets/atlas.png`. Their idle, run and hit frames are reused exactly as drawn and only re-timed (§15.4). At load, stone tiles are graded onto `ink-0`…`pale` and spike tiles onto `blood`; creatures and props keep their art. Only the hero, wisps, the wall torch and the death-to-wisp frames are drawn for Descent, as pixel maps: a 1 px `ink-0` outline plus up to four token shades. Flip but never rotate; never scale a sprite except by the canvas's integer zoom.
- Tall sprites: a frame may be taller than one tile (heroes 19–21 px, the Warden 36 px). It stands bottom-aligned on its tile and overhangs the tile above. Draw row by row from the top, then by x, so a sprite always covers the overhang of whatever stands behind it and is covered by whatever stands in front of it.
- Light: an `ink-0` darkness layer with soft radial glows cut from it. Glow is allowed only on light sources (the hero's torch, wall torches) and on wisps: `ember` for fire, `wisp` for the dead. Nothing else glows: no glowing UI, text, items or enemies. Fog of war: remembered tiles are drawn dark and colourless; unseen tiles are not drawn.
- Motion: sprite animation is frame-stepped at 12 fps or less. A tile hop is 96 ms. Screen shake is 2 px for 120 ms, on damage only. Screen changes are cuts or a row-by-row "descent" wipe.
- UI surfaces: flat `ink-2` plates, 2 px `bone` border, square corners, a hard 2 px offset shadow that collapses on press.
- Voice: terse, dry, second person. "You fell at the spike hall. 41 fell before you." No exclamation marks.
- Honour `prefers-reduced-motion`: no shake, no flicker.

### Anti-slop list (checked at every design gate)

Banned:

- Purple or indigo anything; gradients on UI surfaces; blur or glass effects.
- Rounded cards with soft shadows; glow on anything except light sources and wisps.
- Emoji as icons; Press Start 2P; hype copy.
- Smooth scaling or rotation of pixel sprites; mixed pixel sizes inside the canvas.
- Symmetric auto-generated-looking sprites; pillow shading.
- Spinners (use the torch flame); sliding toasts; confetti.
- A centred title with three feature cards.

Required:

- Integer canvas zoom only (2×, 3×, 4×).
- Danger is always a shape as well as a colour.
- Every screen passes the squint test: you can find the hero, the nearest threat and the primary action in one second.

## 7. Design specs

### Hero: the Delver

- White-hooded cleric, 16×19 (the pack heroes measure 19–21 px): outlined pixel map, robe in `bone`/`pale`/`stone`, face in shadow with two `ember` eyes, gilt sash, torch on the leading side.
- Idle: 2 frames at 2 fps. Flame: 3 frames.
- Move: 4-frame hop, y offsets 0, −2, −1, 0. Attack: 4 px lunge and back in 80 ms.
- Hurt: 2 frames tinted `blood` plus shake.
- Death: body collapses in 3 frames, the flame goes out last, then a wisp rises from the tile. Ember becoming wisp is the game's signature image; it must read at 2×.
- Torch below 20%: flame shrinks to 1 px and the light bands tighten. Torch out: body tints `stone`.

### Ghosts and carvings

- Wisp: about 8×10 teardrop pixel map with two eye pixels, bobbing 1 px at 2 fps, with a soft `wisp` glow.
- Stacking: one wisp, two wisps for 2–4, a cluster with a count plate for 5 or more.
- Your own ghost from an earlier day has an `ember` outline.
- Carving glyph on the tile, in `wisp`: ▲ warning, → path, ◆ bait. The text appears in a line under the HUD only while you stand adjacent.
- Ghost card (tap a wisp): snoovatar at 96 px in a bone-bordered plate, u/name, carving, lifetime record, Trust/Liar buttons. Voting unlocks after your run ends.
- Carvings come from about 16 fixed phrases with a direction arrow. No free text.

### Enemies (0x72 pack art; every tell is a `blood` mark or a frame change)

| Enemy | Look | Tell |
|---|---|---|
| Goblin (`goblin`) | 16×16 pack sprite, 4-frame idle and run | Turns to face you and a `blood` glint marks it one turn before it chases |
| Imp (`imp`) | 16×16 pack sprite; perches on idle frame 0 until woken | Its run frames start the turn before it flies |
| Skeleton (`skelet`) | 16×16 pack sprite; collapses into a bone pile (pack `skull`) | The pile shows a countdown 3, 2, 1 |
| The Warden (`big_zombie`) | 2×2 tiles, 32×36 pack sprite | Target row or column flashes `blood` one turn before the slam |

### HUD and controls

- Top bar, 48 px: floor number in Jacquard, three hearts (blood fill, bone outline, hollow when lost), key plate, item plate.
- Torch meter: a wick that burns right to left with a small flame at the burning end and the turn count beside it. This replaces a generic bar.
- Portrait: map square on top, controls below. The d-pad is four plates in a cross with Wait in the centre; the item button sits on the opposite thumb.
- Input uses Pointer Events. One swipe on the map is one step, with no auto-repeat. Holding a d-pad plate repeats at 5 steps/s after 300 ms; any damage cancels the repeat.
- Desktop (`hover: hover` and `pointer: fine`): d-pad hidden, key hints shown. Arrows or WASD, Space waits, E uses the item.
- Landscape phone: controls move beside the map.
- Every touch target is at least 44×44 CSS px. Bottom padding uses `env(safe-area-inset-bottom)`.
- HUD elements carry `aria-label`s such as "Hearts 2 of 3", for players and for Playwright.

### Screens

| Screen | Must show | Signature detail |
|---|---|---|
| Splash | Floor, curse, "N fell today", Descend | Mini-render of today's floor with live wisp dots; 3-second loop of death → wisp → tomorrow's trap |
| Intro | Floor, curse, compass heat from yesterday, boss chain on boss days | "The north-east took 41. It is worse today." |
| Death | Cause, progress %, rank | Carving picker placed on a view of the tile where you fell |
| Victory | Score, rank, curse vote, trap placement | Compass picker for tomorrow's trap zone |
| Already played | Result, live ghost count, countdown, carving votes | Your wisp on the mini-map |
| Board | Today, all-time depth, souls, honour | Top Trapsetter and Most Notorious Liar plates |
| Chronicle | One row per floor | Reads like a ledger of the dead |

Splash states to design: not played, played, boss day, zero ghosts. It must fit 320 px of height.

## 8. Dynamic difficulty

### The cycle rule

- `band = floor((depth − 1) / 7)`, `pos = ((depth − 1) mod 7) + 1`.
- Each family has an intro position. In band `b`, a family whose position has been reached is at tier `b + 1`; the rest are at tier `b`. Tier 0 means absent; tier caps at 4.
- So every floor introduces exactly one new thing: a new family in the first week, that family's next tier in later weeks.

### Tier table

| Family (pos) | T1, floors 1–7 | T2, 8–14 | T3, 15–21 | T4, 22+ |
|---|---|---|---|---|
| Spikes (1) | Fixed: always up | Breathing: up 1 turn in 3, half-raised the turn before | Wave: rows offset by one phase | Buried: hidden until adjacent; hairline crack tell |
| Goblins (1) | Lone goblin, chases within 4 tiles | Pair that flanks | Den spawns a goblin every 6 turns until stepped on | Starving: double move every third turn |
| Imps (2) | Wakes within 4 tiles, moves 2 per turn | Diver: straight line, overshoots | Swarm of 3 wakes together | Wakes on torchlight instead of distance |
| Mechanisms (3) | Plate opens a door | Plate slams the door behind you | Plate fires a dart line, range 5, slit visible | Timed door closes 5 turns after the plate |
| Skeletons (4) | Rebuilds 4 turns after a hit | Rebuilds in 3; walks around spikes | Archer: fires along a row at range 3 | Pair sharing one rebuild timer |
| Pits (5) | Open pit: −1 heart, land nearer the stairs | Crumbling floor: gone after one step | Crumbling chains over pits | Hidden pit: one missing mortar line |
| Dark rooms (6) | Torch radius 1 inside | Torch burns 2 per turn inside | Contains one other family | A dark wing with one brazier you can light |
| Warden (7) | One slam pattern | Shorter telegraph gap | Slams a cross | Slams twice |

Trapsetter options, always available to survivors: spikes, dart slit, false stairs. False stairs miss one step pixel.

### Starting numbers (tune in Phase 5; all live in `content.ts`)

| Quantity | Formula | d1 | d8 | d15 | d22 | d28 |
|---|---|---|---|---|---|---|
| Grid side | `15 + 2·min(band, 5)` | 15 | 17 | 19 | 21 | 21 |
| Budget | `8 + 3·min(depth, 35)` | 11 | 32 | 53 | 74 | 92 |
| Torch slack | `max(1.5, 2.3 − 0.03·depth)` | 2.27 | 2.06 | 1.85 | 1.64 | 1.50 |
| Rooms | `4 + min(band, 5)` | 4 | 5 | 6 | 7 | 7 |

- Instance cost by tier: 1, 2, 3, 5. Enemies cost one more. No family takes over 40% of the budget.
  *Phase 5:* each tier cell's cost is set in `content.ts` from its measured lethality (one point per 10 of hearts lost plus torch turns at half a heart each, per 100 instances by the skill-60 bot, clamped 1–16; dark rooms are priced by the same rule); budget `16 + 16·min(depth, 35)`; family cap 40%; room density by band.
- `torch = ceil(shortestPath × slack)`, so the torch is fair by construction on any layout.
  *Phase 5:* the torch comes from the zero-damage path's burn (turns, waits, dark rooms at 2), not the geometric shortest path; slack is `max(235%, 268% − 2%·depth) + 8%` per room beyond 4.
- Hearts start at 3 on every floor (2 under the Frail curse); a potion never takes them above 3.

### Rule decisions (Phase 3; later phases must not contradict)

- Torch out: vision shrinks to 1 tile and you lose 1 heart every 2 turns in the dark.
- Bumping a wall or a locked door costs no turn and no torch.

### Rule decisions (Phase 4; approved, binding)

1. Tiers are per floor and per family (`Floor.tiers`, default 1); each tier's numbers are written out in full in `content.ts`.
2. Enemy attacks aim at a tile: the wind-up marks it, the attack lands next turn, so stepping away dodges. This includes the Floor 0 goblin.
3. T1 imps wake within 4 tiles even through walls; T4 imps wake only when your light reaches their tile.
4. Every dart arms one turn and fires the next. Darts and arrows hit the first creature in their path, enemies included. A Trapsetter slit arms when you step into its line.
5. Buried spikes surface when you stand next to them, then stay up.
6. A T1 skeleton walks onto spikes and collapses. A bone pile is floor for everyone: you knock it down, pass, and it gets up behind you. At 0 it rebuilds if its tile is empty, otherwise on the first turn it is (like rule 10). A pair's second pile joins the first pile's countdown. (Amended after Phase 5: piles used to block movement and a bump reset them; that walled off corridors.)
7. A fall lands on the safe tile within 3 that is nearest the stairs. T2 crumbling floor falls after you step off. A T3 chain cracks under you and falls the next turn.
8. False stairs cost 1 heart and crumble to floor. All Trapsetter damage has cause `trap`.
9. A potion at full hearts is still used up. Lamp oil adds 20 turns, capped at the floor's torch. Traps and items cost 0 (outside the budget).
10. A gate won't close on something standing in it.
11. Dark-room vision applies only while you stand inside the room. T3 dark rooms use T2's rules and hold another family.
12. A den spawns an idle goblin, which glints before it chases.
13. Imp dives arc only 1 px. A diver aims at the tile you stand on and marks only that tile; it flies the line and lands past it, and only the aimed tile takes damage (if the landing tile is taken, it stops on the aimed tile). One step off dodges, even in a corridor. (Amended after Phase 5: the whole line used to hurt.)
14. Cracks are reserved for danger (no cracked-floor decoration). Blood corner marks always mean "hurts next turn". Plates use the blue pack art; the red one reads as a blood tell.

### Floor shape

1. Room 1 is always safe.
2. The day's new family or tier appears alone in a showcase room. When two arrive at once (band starts after depth 1), each gets its own showcase room.
3. Later rooms combine it with one older family; a room holds at most `FRESH_PER_ROOM` (2) instances of a new family, so the new thing never floods the floor.
4. No hazard within 2 tiles of the entrance.

### Crowd modifiers

- Rank the nine compass zones by yesterday's deaths. Budget weights: 2.2, 1.6, 1.2, then 0.8; zones with no deaths get 0.6.
  *Phase 5:* the weights split the budget between rooms (each room gets its zone's share) and scale room capacity, normalised to the mean weight. A room in a zone weighted above the mean may hold any family (this relaxes floor-shape rule 3 there). Tested: a painted zone with a room holds about 32% of hazards, against 12% unpainted.
- With zero deaths, weights are uniform and the intro says so. Never fabricate crowd data.
- Yesterday's top-killing family gets 1.5× purchase weight.
- Player traps: each survivor picks a zone and a type. At most 12 materialise per floor, chosen by seeded shuffle and placed on a seeded valid tile. The rest add weight to their zone.
- Souls: +1 when your trap hurts someone, +3 when it kills, +1 per Liar vote from a player who died that day. Honour: +1 per Trust vote.

### Curses (the crowd's vote; numbers in `content.ts`)

| Curse | Effect | Win-rate cost (skill 60, floors 1–28, 90 seeds each) |
|---|---|---|
| Short Wick | torch 90% (never below gate 2) | −5 |
| Overrun | budget and room capacity 160% | −4 |
| Deep Dark | light radius −1, never below 2; dark rooms keep their own radius | −6 |
| Light Sleepers | enemies wake 4 tiles further (light-waking imps also wake within 4); room 1 keeps the normal range, only the entrance tile is kept beyond the cursed one | −4 (peaks at +4: longer ranges push enemies away from the entrance) |
| Frail | start with 2 hearts | −6 |

### Fairness gates (a failing floor is regenerated with `seed + 1`)

1. A zero-damage path exists, ignoring enemies. Use BFS over (x, y, turn mod cycle length) so breathing traps count.
2. That path needs at most 70% of the torch.
3. `bot(skill = 1.0)` finishes with at least one heart.
   *Phase 5:* past `RETRY_CAP` (25) rejections the generator falls back to a lighter floor (half budget, no player traps; then an empty floor, which always passes), because a day with no floor is the worst outcome. Tests treat any fallback as a bug; 2,000 floors use none.
   *Phase 5:* this bot plays with the map (fog off, hidden hazards known, gate 1's shunned tiles), because the gate is a proof the floor can be beaten. The curve bot stays blind: it reads only what a player sees.

### Measuring the curve

- `bot(floor, skill)`: with probability `skill` it takes the best known step; otherwise it walks greedily toward the stairs inside its vision.
- Run skill 0.6 on 50 seeds per depth. Target win rate: about 80% at depth 1, falling to about 35% at depth 28, never under 25%.
- The curve must never rise by more than 10 points between consecutive depths, except after a boss floor.

## 9. Design Lab

`lab.html` is a local-only page where every design is approved before it enters the game.

| Tab | Shows |
|---|---|
| Tokens | Palette swatches with contrast ratios, type scale, one mock lit room |
| Kit | Plates, buttons in every state, hearts, torch wick, d-pad, ghost card |
| Cast | Each sprite at 1×, 2×, 4×; on lit, dim and dark tiles; a black silhouette line-up; every animation looping |
| Bestiary | Every family × tier as a looping micro-scene: a dummy walks in, the tell shows, the rule fires |
| Depth | Slider 1–60; floors at depths 1, 4, 8, 15, 22, 28 side by side; hazard census per floor; the bot win-rate chart; a 3×3 grid to paint yesterday's deaths and watch the floor change |
| Screens | Every screen from fixtures, in iframes at 360, 390 and 768 px wide |
| Juice | Hop, hurt, death-to-wisp, descent wipe, each replayable |

- Fixtures: `game.html?fixture=death` and the like, defined in `local.ts`: death, victory, played, intro-boss, zero-ghosts, 300-ghosts, long-username.
- Phone check without Reddit: `bun run local -- --host`, then open the LAN URL on a phone.

## 10. Self-testing with Playwright MCP

Playwright MCP covers layout, viewports and touch emulation against the local harness. It cannot reproduce the real Reddit iOS/Android webview, so three short human phone checks remain.

### Setup (Phase 0)

- Desktop server: `claude mcp add playwright npx @playwright/mcp@latest`
- Mobile server: `claude mcp add playwright-mobile -- npx @playwright/mcp@latest --device "iPhone 15"`
- The `--device` option emulates a mobile device; `--viewport-size` sets browser dimensions.
- Confirm both with `claude mcp list`. The exact `claude mcp add` syntax should be checked with `claude mcp add --help`.
- Tools include `browser_navigate`, `browser_resize`, `browser_take_screenshot`, `browser_snapshot`, `browser_evaluate`, `browser_press_key`, `browser_click`, `browser_console_messages`, `browser_network_requests` and `browser_run_code`.
- `browser_resize` changes only the viewport size. Touch, device pixel ratio and user agent come from the mobile server.

### Local harness

- `bun run local` serves `src/client` with plain Vite using `vite.local.config.ts`.
- In local mode `game.ts` routes `api()` to `local.ts`, which fakes the endpoints on localStorage using the same `src/shared` functions the server uses.
- `local.ts` also replaces `requestExpandedMode` with a plain navigation to `game.html`.
- The canvas is invisible to accessibility snapshots, so local mode exposes a hook:

```ts
window.__descent = {
  ready,                 // Promise, resolves when the scene is interactive
  state(),               // plain snapshot: pos, hearts, torch, turn, floor, ended
  act(a),                // 'U'|'D'|'L'|'R'|'W'|'I'
  load(depth, opts),     // jump to any floor or fixture
  advanceDay(),          // run the local rollover
  skipAnim(on),          // instant events for fast tests
}
```

### Viewport matrix

| Name | Size | Server |
|---|---|---|
| Small Android | 360×640 | playwright |
| iPhone | 390×844 | playwright-mobile |
| Large Android | 412×915 | playwright |
| Phone landscape | 844×390 | playwright |
| Tablet | 768×1024 | playwright |
| Desktop | 1280×800 | playwright |
| Splash short | 320×320 | playwright |
| Splash tall | 390×512 and 720×512 | playwright |

### The check loop (end of every phase)

1. `bun run check`.
2. Start `bun run local` in the background and open the phase's URLs.
3. For each viewport: resize, await `__descent.ready`, screenshot to `shots/phase-N/<screen>-<viewport>.png`.
4. `browser_console_messages` shows no errors; `browser_network_requests` shows no external hosts.
5. Layout assertions through `browser_evaluate`:
   - `document.documentElement.scrollWidth <= innerWidth`.
   - The canvas rect is inside the viewport and its CSS size is an integer multiple of its source size.
   - Every `button` rect is at least 44×44.
   - Controls do not intersect the canvas.
   - No element marked `data-fit` has `scrollWidth > clientWidth`.
6. Play: on desktop, `browser_press_key`; on the mobile server, `browser_click` on d-pad plates and a pointer drag for a swipe. Compare `__descent.state()` before and after.
7. Open each screenshot and walk the anti-slop list. Record pass or fail per item.
8. With `browser_run_code`, emulate `prefers-reduced-motion` and a light colour scheme; re-shoot the splash.

### Real Reddit smoke test (Phases 6, 8, 12)

- Log in to Reddit once by hand in the Playwright browser profile.
- Claude Code opens the playtest post, clicks Descend, and confirms the game frame loads without console errors.
- If the frame can't be driven from outside, stop there and hand the checklist to the human.

### Human phone checks (Phases 3, 9, 11; 10 minutes each)

Real iOS and Android Reddit apps: load time, one-handed play, page does not scroll under the game, safe areas, backgrounding and return, light and dark Reddit themes.

## 11. Phases

Each phase lists Build, Show me (what to open), Checks, and Gate.

### Phase 0 — Setup and harness (Nov 13)

- **Build:** install Ponytail and both Playwright servers. Read the template; record its entrypoint names, Phaser major version and scripts at the top of `CLAUDE.md`. Add `vite.local.config.ts`, the `local` and `check` scripts, an empty `lab.html`, Vitest and `@devvit/test`. Re-verify §4 facts in the official docs, plus the Redis set-if-absent command, the snoovatar method and the flair method.
- **Show me:** `localhost:5190/lab.html` saying "Descent Lab", and three screenshots of the untouched template.
- **Checks:** the production build contains no `lab` or `local` code.
- **Gate:** the lab opens; `bun run dev` still playtests on Reddit.

### Phase 1 — Visual foundation (Nov 14)

- **Build:** tokens in `style.css` and `content.ts`; fonts; `sprites.ts` pipeline (atlas frames, code-drawn layers, tinting, four light levels). Lab tabs Tokens and Kit.
- **Show me:** the mock lit room and every kit component.
- **Checks:** contrast of `bone` on `ink-0` and `ink-2` is at least 4.5:1; the anti-slop list passes.
- **Gate (look):** the direction is approved, or the changes are named. Nothing later starts until this passes.

### Phase 2 — Cast (Nov 15)

- **Build:** Delver, wisp, goblin, imp, skeleton, Warden, items (potion, bomb, lantern), key, stairs, door, wall torch, floor and wall variants, all with animations. Lab tab Cast.
- **Rule:** a code-drawn sprite that fails review twice is replaced by the nearest pack sprite.
- **Show me:** the silhouette line-up and the death-to-wisp loop at 2×.
- **Gate (cast):** each sprite is identifiable in silhouette at 2×.

### Phase 3 — Core run (Nov 16–18)

- **Build:** `rng.ts`; `sim.ts` with movement, bump attack, hearts, torch, fog, key and door, one goblin, fixed spikes, stairs; `scene.ts` drawing state and playing events; `ui.ts` HUD and controls; input on keyboard, d-pad and swipe; Floor 0 as a hand-written string map; the `__descent` hook.
- **Tests:** `replay(floor, log)` equals stepping the same log; the same log gives the same result 100 times; Floor 0 can't kill.
- **Show me:** `game.html` playing Floor 0, on desktop and on a phone over LAN.
- **Checks:** Playwright completes Floor 0 by keyboard and by taps; the full matrix passes.
- **Gate (feel):** a move feels instant; Floor 0 takes under 60 seconds. First human phone check.

### Phase 4 — Tiered obstacles and enemies (Nov 19–20)

- **Build:** the §8 tier table as data in `content.ts`; sim rules for each family at T1–T4; sprites for each tell; items; Lab tab Bestiary.
- **Tests:** one Vitest case per table cell asserting the rule and its timing.
- **Show me:** Bestiary with all 28 family-tier cells and the three Trapsetter traps looping.
- **Gate (obstacles):** each tier's rule can be stated after watching its scene twice. If not, the tell is redrawn.

### Phase 5 — Generator and difficulty (Nov 21–22)

- **Build:** `gen.ts` with BSP rooms, entrance and stairs, budget spending, floor shape rules, compass weights, player-trap placement, fairness gates; curse effects; `bot()`; Lab tab Depth.
- **Tests:** same inputs give an identical floor; 2,000 floors across depths 1–60 produce zero failures of the fairness gates; the curve targets in §8 hold.
- **Show me:** drag the depth slider; paint deaths on the compass and watch the hazards move; read the win-rate chart.
- **Gate (curve):** the curve and the look of floors at depths 1, 8, 15 and 22 are approved.

### Phase 6 — Server and first real playtest (Nov 23–24)

- **Build:** `GET /api/floor`, `POST /api/run` with replay validation and one accepted run per user per day, scores, `splash.html` with `requestExpandedMode`, a minimal cron that posts the next floor, run resume from localStorage.
- **Redis keys:** `game` hash (`day`, `postId`, `started`); `f:{d}:mods` string; `f:{d}:floor` string (generated once, set-if-absent; replay validates against it, so retuning never changes a floor in play); `f:{d}:runs` hash; `f:{d}:scores` sorted set; `f:{d}:starts` hash (run-start log, §2); `rollovers` hash (UTC date → done, the cron's idempotency guard).
- **Tests:** with `@devvit/test`: a forged log is rejected; a second run is rejected; the same log scores the same on client and server.
- **Show me:** a post in the private test subreddit, playable end to end.
- **Gate:** a run survives a page reload and appears in Redis. Reddit smoke test.

### Phase 7a — Ghosts and carvings (Nov 25–26)

- **Build:** a death leaves a ghost on its tile (server-derived from the replay); one carving per ghost from about 12 fixed phrases, tile glyph by what the phrase claims (▲ warning, → path with the player's direction, ◆ treasure); the death write also records 3×3 compass heat and kills by cause (record only); capped ghost data in `GET /api/floor`; wisps on the map inside the torch radius (one, two for 2–4, a cluster with a count plate for 5+); carving line in the HUD on approach; ghost card (snoovatar, u/name, carving; room left for 7b's record and votes); carving picker on the death panel and the result plate; Floor 0 scripted ghosts; mod menu: seed N bot runs, purge bot runs. Endpoint `POST /api/carving`.
- **Redis keys:** `f:{d}:ghosts`, `f:{d}:carvings`, `f:{d}:heat`, `f:{d}:kills` hashes.
- **Dev tool:** mod menu "Reset my run on the live floor" (behind the `devTools` subreddit setting, logged): removes the caller's run and everything it wrote, so one account can replay a floor. Switch it off before submission.
- **Rules:** nothing about a ghost comes from the client; ghosts never enter the simulation; a carving is final (set-if-absent); bot records carry `bot: true` and show as "a nameless delver"; bot deaths count toward heat, and purge removes them with their heat and kills.
- **Show me:** die in one local profile, see that wisp in another.
- **Gate:** every write is replay-derived or limited to one per user. Reddit smoke test.

### Phase 7b — Votes, traps, curse, souls (Nov 27)

- **Build:** carving votes (Trust/Liar on the ghost card, unlocked after your run), curse vote, Trapsetter trap placement, souls and honour, victory screen with curse vote and trap picker; heat and kills read by the intro and rollover inputs. Endpoints `POST /api/vote`, `/api/trap`. Bots are excluded from souls, honour and votes (their `bot` flag).
- **Redis keys:** `f:{d}:traps` hash; `f:{d}:curse`, `f:{d}:cv`, `souls`, `honour` sorted sets; `f:{d}:votes` hash (the one-vote guard: sorted sets have no set-if-absent). Dev tool: `f:{d}:resets` hash (the reset count keys the client's saved log).
- **Milestone:** the public test subreddit opening (the owner schedules it).
- **Gate:** every write is replay-derived or vote-limited to one per user.

### Phase 8 — Full rollover (Nov 28–29)

- **Build:** `rollover.ts`: tally heat, kills, curse and traps → next floor's mods → new post → summary comment → flair → Chronicle record. Mod-only menu actions in `devvit.json`: advance day, seed N bot runs, post Floor 0.
- **Rules:** rollover is idempotent (a second call for the same day does nothing). Bot ghosts are named "a nameless delver" and have no snoovatar.
- **Plain-floor band (built after the gate):** each day's plain floor is rerolled (seed, seed + 1, …, at most 12) until its skill-60 win rate (24 runs) is within −25/+15 points of §8's target line, clamped to 20–95%; crowd mods then apply to that seed under the relative band. Floors more than 10 points outside the band: 507 of 840 before, 68 after.
- **Redis keys (built):** `rolled` hash (a depth is opened once, cron or dev tool); `f:{d}:trapped` hash (owner hurt/killed); `f:{d}:flair` hash (queued flair); `chronicle` hash; `tutorial` hash (the Floor 0 flag per user). The floor JSON carries its placed traps (owner, name) and `yesterday`.
- **Tests:** two identical tallies give identical mods; double rollover creates one post.
- **Show me:** local `advanceDay()` three times with painted deaths; the hazards follow the deaths.
- **Gate:** one real overnight rollover succeeds unattended. Reddit smoke test.

### Phase 9 — Screens and feed presence (Nov 30–Dec 1)

- **Build:** final splash with mini-render, live wisps and the 3-second loop; intro; already-played with polling and countdown; board; Chronicle. Lab tab Screens.
- **Checks:** every fixture at every viewport; splash at 320×320; long usernames don't clip.
- **Gate:** someone who has never seen the game explains it after 5 seconds of the splash. Second human phone check.

### Phase 10 — Boss and content completion (Dec 2–3)

- **Build:** the Warden arena. Stairs are open from the start; each bump removes one link; deaths keep their damage. Shared HP is 12 × yesterday's players, minimum 10 players. Killed: a "Fallen Warden" memorial post with top dealers. Not killed: leftover HP carries to the next boss floor. Final Floor 0. All five curses.
- **Redis key:** `boss:{cycle}` hash and a damage sorted set.
- **Gate:** a seeded boss day plays through to a memorial post locally.

### Phase 11 — Polish and freeze (Dec 4–5)

- **Build:** juice pass (Lab tab Juice), WebAudio SFX muted until first tap, loading flame, error and offline states, `/ponytail-debt` review.
- **Budgets:** splash JS under 60 KB gzipped; atlas under 100 KB; interactive in under 3 s with 4× CPU throttle.
- **Gate:** third human phone check on both apps. Feature freeze at end of Dec 5.

### Phase 12 — Seed and submit (Dec 6–8)

- Bug fixes only.
- Seed 5–7 days of history; say in the README which days include simulated delvers.
- README, Devpost text leading with "the community's deaths build the dungeon", 60-second video showing a death becoming tomorrow's trap, asset credits, feedback survey.
- Verify every link logged out and in incognito. Submit by the evening of Dec 8 IST.

## 12. Schedule

| Phase | Dates | Days |
|---|---|---|
| 0 Setup | Fri Nov 13 | 1 |
| 1 Visual foundation | Sat Nov 14 | 1 |
| 2 Cast | Sun Nov 15 | 1 |
| 3 Core run | Mon Nov 16 – Wed Nov 18 | 3 |
| 4 Obstacles | Thu Nov 19 – Fri Nov 20 | 2 |
| 5 Generator | Sat Nov 21 – Sun Nov 22 | 2 |
| 6 Server | Mon Nov 23 – Tue Nov 24 | 2 |
| 7a Ghosts, 7b Votes | Wed Nov 25 – Fri Nov 27 | 3 |
| 8 Rollover | Sat Nov 28 – Sun Nov 29 | 2 |
| 9 Screens | Mon Nov 30 – Tue Dec 1 | 2 |
| 10 Boss | Wed Dec 2 – Thu Dec 3 | 2 |
| 11 Polish | Fri Dec 4 – Sat Dec 5 | 2 |
| 12 Submit | Sun Dec 6 – Tue Dec 8 | 3 |

## 13. Risks and open questions

| Risk | Response |
|---|---|
| Code-drawn sprites look amateur | Two-strike rule in Phase 2; the pack sprite is the fallback |
| Local fake drifts from the real server | Both call the same `src/shared` functions; `@devvit/test` covers the Redis glue; smoke tests on Reddit |
| Positive feedback makes deadly zones unbeatable | Weights are capped at 2.2 and every floor passes the fairness gates |
| A similar idea exists | Grudgeball is a daily gauntlet whose board is built from other players' placed traps, with a solvability check. Lead with deaths shaping the floor, not trap placement |
| Schedule slips | Cut rules in §14 |

Open questions for Phase 0:

- Exact template file names and Phaser major version.
- Redis set-if-absent command name; snoovatar and flair method names.
- Actual inline post sizes on the mobile apps today.
- Size of the expanded-mode modal on desktop.

## 14. Cut rules

- Phase 6 not done by Nov 25: cut the Chronicle screen and carving votes.
- Phase 8 not done by Dec 1: cut the boss; use Dec 2–3 for polish.
- Any phase over by more than a day: cut T4 tiers.
- Never cut: ghosts and carvings, compass heat, Trapsetter and souls, curse vote, Floor 0, Phase 11.

## 15. Quality guidelines

These apply to every phase. Each rule is written so Claude Code can check it. A phase report must say which rules it checked.

### 15.1 UI/UX

**First contact**

- The splash explains the game in under 5 seconds and in 8 words or fewer of reading.
- A new player reaches their first move within 2 taps of the splash.
- Teach by doing. No instruction text longer than 8 words on screen at once. Floor 0 teaches the basics; each day's new mechanic appears on the intro screen as its sprite plus one line.

**Every screen**

- One primary action per screen, in `ember`, in the bottom thumb zone on mobile, in the same position on every end screen.
- Four states designed for each screen: loading, empty, error, full. Zero ghosts, zero votes and a failed request must each look intentional.
- No dead ends. Every end state offers a next thing: carve → vote → countdown to the next floor.
- Numbers over words. "41 fell here" not "Many players died in this area".

**Feedback and fairness**

- Every input shows a visible response within 100 ms. The hop starts on the same frame as the tap.
- The network never blocks play. After the floor loads, a run works fully offline. The result submits in the background with 3 retries; the end screen shows "Saving", then "Saved" or "Not saved, retry".
- A run survives a reload: the action log is kept in localStorage and replayed on return.
- Every death is explainable. The death screen names the cause and shows the tile. The thing that killed you showed its tell at least one turn earlier.
- Choices that can't be undone (carving, curse vote, trap) are select-then-confirm on the same screen. No modal dialogs.

**Touch and layout**

- Touch targets at least 44×44 CSS px with 8 px gaps.
- No hover-only information, no long-press-only or double-tap-only actions.
- The page never scrolls or bounces under the game: `touch-action: none` on the game area, `overscroll-behavior: contain` on the page.
- Nothing essential sits inside the device safe areas.
- Usable one-handed in portrait at 360×640.

**Access**

- Colour is never the only signal. Danger, ghosts and treasure each have a distinct shape.
- Text contrast at least 4.5:1. Body text at least 16 px.
- Fully playable by keyboard on desktop, with a visible focus ring on every button.
- `prefers-reduced-motion` removes shake and flicker.
- Sound is off until the first tap. The mute choice is remembered.
- HUD values have `aria-label`s.

### 15.2 Developer experience

**Commands**

- Three commands cover everything: `bun run local` (play and Lab, no Reddit login), `bun run check` (types + tests, under 60 seconds), `bun run dev` (playtest on Reddit).
- The README has a "Run it locally" section of 5 lines or fewer.

**Reproducibility**

- Any floor opens from a URL: `game.html?depth=15&seed=123`. Every bug note includes that URL.
- A bug in game rules is first captured as a failing test in `tests/shared.test.ts` using `{depth, seed, mods, log}`, then fixed.
- The server logs one line per request: user, depth, endpoint, outcome, milliseconds.
- Mod menu actions on the test subreddit: advance day, seed bot runs, post Floor 0.

**Changeability**

- Every tuning number lives in `src/shared/content.ts`. Changing difficulty never requires editing `gen.ts` or `sim.ts`.
- Wire types live in `src/shared/api.ts` and are imported by both client and server, so a mismatch is a compile error.
- No `any` in `src/shared` or `src/server`.
- In local mode, assertions in the sim throw. In production they log and continue.

**History**

- One commit per phase, message `phase-N: <what was built>`, plus a git tag `phase-N` so any phase can be restored.
- The phase report lists: what was built, what was verified, assumptions made, deviations from PLAN.md, new dependencies (expected: none).
- Comments explain why, not what. Deliberate shortcuts carry a `// ponytail:` comment with the ceiling and the upgrade trigger.

### 15.3 Performance

**Budgets**

| What | Budget | How it is measured |
|---|---|---|
| Splash JavaScript | under 60 KB gzipped, no Phaser | build output size |
| Splash interactive | under 1 s at 4× CPU throttle | `performance.mark('descent:splash')` |
| Game interactive | under 3 s at 4× CPU throttle | `performance.mark('descent:interactive')` |
| Game total transfer | under 1.5 MB, gzipped | sum of `browser_network_requests`, measured gzipped; every report records both raw and gzipped |
| Atlas | one PNG under 100 KB | file size |
| Fonts | two woff2 files, preloaded, under 60 KB together | file size |
| Input to motion | under 50 ms | timestamp in the debug hook |
| `generate(depth)` | mean under 20 ms on the dev machine at depth 28; at most 4 retries on any of seeds 1–200 (deterministic, so machine load can't fail it). Each day's floor is generated once and stored, so a slow seed never reaches a player; the max time is reported, not tested | Vitest timing and retry count |
| `replay()` on the server | under 50 ms per run | Vitest timing |
| `GET /api/floor` response | under 50 KB | response size |
| Rollover job | under 10 s | server log |

### 15.4 Animation (hand-made feel)

The test for every animation: would a person drawing this frame by frame have done it this way? Machines produce even timing and everything moving at once. People produce holds, beats and one thing leading another.

**Timing**

- No linear tweens and no uniform frame lengths. Every animation has at least one frame held longer than the others.
- Fast out, slow settle. The hop is 4 frames at 24, 24, 16, 32 ms: quick lift, long landing.
- Anticipation: one wind-up frame in the opposite direction before any attack or enemy lunge. For enemies this frame is also the tell.
- Hit-stop: freeze everything for 60 ms on any damage, then shake. Nothing else moves during the freeze.
- Total animation lock per turn is 120 ms or less. Input is buffered one action deep, so play never waits on animation.

**Weight and overlap**

- Follow-through: the torch flame lags the body by one frame. The hood settles one frame after a stop. The goblin's run cycle lags its hop by one frame.
- Weight shows in holds. The skeleton holds one extra frame before each step. The goblin never holds. The Warden's slam has a 2-frame hang at the top.
- Squash is one pixel for one frame on landing. Never more.
- Arcs: the imp's path between tiles curves (3 stepped y offsets). Nothing with wings moves in a straight line.

**Life**

- No two creatures idle in sync. Each gets an idle phase offset when it spawns.
- Irregular small motions: an ear twitch or blink every 4 to 9 seconds, at a random interval, never on a fixed loop.
- The flame does not loop. Its 3 frames play in shuffled order with holds of 80 to 140 ms.
- One secondary detail per action at most: a 2-pixel dust puff on landing, a bone chip when the skeleton collapses.
- Cosmetic randomness lives in `scene.ts` with its own generator. It never touches `src/shared`.

**Staging**

- One big motion at a time. When the hero is hurt, the world freezes. When a door slams, nothing else animates that frame.
- Death is the longest animation in the game, about 600 ms: collapse, a 200 ms beat of complete stillness, the flame gutters, then the wisp rises slowly.
- UI: buttons drop 2 px on pointer down, on the same frame. Scores count up in 6 steps and hold on the final number. No transition longer than 120 ms.

**Banned**

- The same sine bob on everything. Synchronised idles. Perpetual pulsing or glowing.
- Elastic and bounce easing. Rotation tweens. Scale tweens on sprites.
- Alpha fade as the only transition. Particle bursts as decoration.

**How Claude Code checks its own animation**

- The Lab's Juice tab plays every animation at 1× and 0.25×, with a frame stepper.
- For each animation, capture every frame with Playwright and save them side by side as one filmstrip: `shots/phase-N/anim-<name>.png`.
- Read the filmstrip and answer in the phase report: Which frame is the hold? Where is the anticipation? What leads and what follows? Is any frame identical to its neighbour by accident?
- An animation with no hold frame, or with evenly spaced positions, is redone.

**Rules**

- One Phaser scene, one atlas. No per-ghost images on the map. A snoovatar loads only when its card opens.
- Ghosts are aggregated per tile on the server. Draw at most 60 wisps on screen.
- The HUD updates only the nodes that changed. No rebuilding HTML each turn.
- Pause the Phaser loop when the tab is hidden and while a DOM-only screen is showing.
- Polling runs only on the already-played screen, every 20 s, stops when the tab is hidden, and asks only for changes since the last response.
- Each endpoint reads Redis in as few calls as possible; no per-user loop inside a request.
- Rollover does bounded work. Flair updates are capped at 200 users per run; the remainder continues in a follow-up scheduled job.
- A phase that breaks a budget is not done. The report states the measured number next to each budget.

## Later

(Claude Code appends out-of-phase ideas here, one line each.)

- Load: on Reddit, a cold chunk takes ~2.2 s from this machine whatever its size (372 KB and 203 KB took the same), so the Devvit CDN's per-request cost, not bytes, now sets time-to-interactive (3.28 s). Revisit if the human phone check shows the same; options: fewer requests (inline the atlas), or warm the chunk from the splash.
- Resume: keep the in-progress run log on the server (keyed by user and floor), so a deploy (new webview origin, empty storage) resumes a run instead of restarting it.
- Carvings list: snoovatars in the rows (polish pass).
- Curve rises after torch pricing: 9→10 (+10 on list A, +20 on B, 50 seeds) and 25→26 (+28 on A, +36 on B; depth 25 is 25% on 200 seeds). Both are torch-driven band effects; revisit once real deaths exist.

## Sources

- Ponytail deep dive: https://flaviocopes.com/ponytail
- JetBrains Ponytail test: https://blog.jetbrains.com/ai/2026/07/ponytail-skill-claude-tested/
- Devvit Phaser Starter Template: https://phaser.io/news/2026/05/devvit-phaser-starter-template
- Devvit Vite plugin guide: https://github.com/reddit/devvit-docs/pull/21/files
- Devvit issue 254, "tall" height on mobile: https://github.com/reddit/devvit/issues/254
- Playwright MCP server guide: https://docs.stacklok.com/toolhive/guides-mcp/playwright
- Grudgeball repository: https://github.com/edycutjong/grudgeball