# Phase 11b: Load time on Reddit (design and results)

Sources: the owner's Phase 11b brief (Nov 17), PLAN §15.3. Starting point: d39d755. The guards are unchanged: the golden runs, the full e2e suite and the timed 18-move run all pass. Nothing in the simulation or a stored format changes. The one wire change is the one the brief asked for: the load beacon gains optional `stages`.

## Decisions (continuing A1–A66)
- **A67. Load stages:** the load beacon carries `stages { script, floor, engine, intro }` (ms from page start), and `ms` is still "first move possible". The server keeps an intro histogram next to the load histogram per client class. Health and the ROLLOVER line show both, so the intro number never hides the first-move number.
- **A68. The intro does not wait for Phaser:** `game.ts` awaits the engine only where the scene is created. A fresh run's intro is a DOM panel, so it shows the moment the floor response arrives. Descend tapped before the scene is up reads "Lighting the torch…" and goes through when it is. The intro's helpers became function declarations so they can run that early.
- **A69. Warming on intent:** a hover, focus or press on the splash's Descend prefetches `game.html`, `game.js`, `phaser-core.js`, `scene.js`, `sprites.js` and `atlas.png` into the HTTP cache the game shares with the card. Nothing is fetched for a mere feed impression.

## Before (cold loads on Reddit, desktop; each on a fresh version)
In all three, the game's first byte came at 0.9–1.0 s (Reddit's webview start-up). `phaser-core.js` (203 KB) was the critical path, downloading from 0.9–1.0 s to 3.3–3.6 s. The intro waited on it.

| Load | script | floor | engine | intro | first move |
|---|---|---|---|---|---|
| 1 | ≈2300 | 2680 | ≈3330 | 3437 | 3437 |
| 2 | 1950 | 2319 | 3673 | 3690 | 3733 |
| 3 | 2169 | 2532 | 3822 | 3839 | 3878 |

## After (same method)

| Load | script | floor | engine | intro | first move |
|---|---|---|---|---|---|
| 1 | 1925 | 2278 | 2705 | 2291 | 2739 |
| 2 | 1625 | 1974 | 2235 | 1988 | 2272 |
| 3 | 1149 | 1494 | 2187 | 1500 | 2218 |

- **Medians:** intro readable 3690 → 1988 ms (−46%); first move possible 3733 → 2272 ms (−39%).
- **On these clicks** Playwright hovers only milliseconds before pressing, so a real hover or long press warms earlier still.
- **Phones** are expected to be slower. Health shows real players' p50/p90 by client class.
