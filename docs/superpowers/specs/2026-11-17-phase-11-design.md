# Phase 11: Polish and freeze (design)

Sources: PLAN §11 Phase 11, §15.1–15.4, the owner's Phase 11 brief (Nov 17). Starting point: 3dd998e (pre-work: e2e 115/115, confirmed flair, privacy in the game, golden runs).

**Hard rule:** nothing here changes the simulation, the generator, a stored format or a wire type. `tests/golden.test.ts` (10 runs and the generator at 6 depths) guards that.

## Order (what a judge sees first)
1. **Splash:** a one-line "what is this" under the name, kept on every state. The existing loop (a death, the wisp, tomorrow's trap) stays still under reduced motion. Checked in Reddit's light and dark themes.
2. **Loading:** a CSS flame inside `game.html`, drawn before any script runs. It hides when the scene is ready.
3. **Floor 0 and the first real floor:** sound (below), hit-stop on damage (A62), and button press feedback. The run's input timing is unchanged; an e2e check times a fixed run of moves before and after.
4. **First death and carving:** death sound and stillness beat (the 600 ms death is already built). The carving picker is unchanged.
5. **The rest:** frame time at 4× throttle with 300 ghosts; touch never scrolls the page; every endpoint failure has a state; budgets re-measured.

## Decisions (continuing A1–A61)
- **A62. Hit-stop:** on a hurt, the scene's motion clock pauses for 60 ms, then the shake plays (§15.4). Only drawing pauses: input is buffered as before, and the turn's lock is unchanged (the freeze lies inside the 120 ms lock), so a run of moves takes exactly as long. Reduced motion skips both.
- **A63. Sound (`src/client/sound.ts`, new, independent of every other file):**
  - Every sound is synthesized with WebAudio oscillators and noise in code. No files, so nothing to license.
  - It starts on the first pointer or key press in the game; the splash never imports it.
  - A mute toggle in the HUD (♪ / ♪̸), remembered in localStorage.
  - Each sound accompanies something already shown: step, bump, hurt, a link breaking, pickup, door and gate, a slam wind-up, death, win. Nothing is told by sound alone.
- **A64. Loading flame:** markup in `game.html`, CSS in `style.css` (raw colours live only there). The stylesheet is render-blocking, so the flame is in the first paint, before any script. Colours are the `ember`/`bone` tokens. If the game never starts, a line after 8 s says to close and reopen.
- **A65. Splash line:** "A daily dungeon: one run a day, and today's deaths build tomorrow's floor." It shows under the name on every state; the state line below it stays as it is.
- **A66. Endpoint failures:** each `/api/*` call has a designed state with a way forward (the table is in the report).

## Assumptions
- Reddit's light and dark themes only change the frame around the post. The splash card keeps its own ink background, so it reads the same in both. It is checked by switching Reddit's theme.
- The frame-time measurement uses Chrome's CPU throttling (CDP `Emulation.setCPUThrottlingRate` 4) on the local harness with `?ghosts=300`.

## Built and measured (Nov 17)
- **Tests:** `bun run check` 152/152, including the golden runs (10 runs, generator at 6 depths) unchanged; e2e 122/122; layouts 320×320 to 1280×800.
- **Input timing:** the fixed 18-move run took 1618–1689 ms before the polish and 1639 ms after (ceiling 1850 ms).
- **Loading flame:** first paint at 52 ms locally, with the flame in it.
- **Budgets (production bundle, 4× CPU throttle):**
  - splash interactive 22–98 ms
  - game interactive 280–578 ms
  - splash JS 8.5 KB gzipped
  - game transfer 325 KB gzipped (989 KB raw)
  - atlas 39.6 KB
  - fonts 43.1 KB
- **Frame time:** 4× throttle, `?ghosts=300`, 40 moves: 330 frames, longest 17 ms, none over 50 ms. There are no particles to cap.
- **Sound:** 2.1 KB minified, 0.98 KB gzipped; all synthesized.
- **Found by looking:** the pixel font drew the "fl"/"fi" ligatures as a wrong glyph ("floor" read "Aoor" on Reddit). Fixed with `font-variant-ligatures: none`.
- **Copy fixes:** "Your dart slit waits here; nobody has stepped on it yet." and "Nobody fell on Floor N, so nothing moved."
- **Cut:** the Lab Juice tab (developer-only; a judge never sees it). The Bestiary already plays every animation at 1× and ¼× with a stepper.
