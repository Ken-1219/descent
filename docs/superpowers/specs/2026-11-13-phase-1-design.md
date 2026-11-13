# Phase 1: Visual foundation (design)

Source: PLAN.md §11 Phase 1, §6 Torchlit Ink, §9 Lab, §15. PLAN.md is the approved design; this spec only pins down the details.

## Approach

Everything in the pipeline is code-drawn: 1-bit bitmaps written as strings, rasterised into a single atlas canvas. There is no PNG pack in Phase 1. The Kenney 1-Bit pack stays the fallback from Phase 2's two-strike rule.
- Rejected: loading the Kenney atlas now. It would add a download and licence work for sprites we may never use.
- Rejected: CSS-only drawing. Pixel sprites must look the same in the canvas and in the DOM.

## Units

| File | Does | Depends on |
|---|---|---|
| `src/shared/content.ts` | `PALETTE` (12 tokens), `TILE = 16`, `LIGHT` remap tables for `dim` and `remembered` | nothing |
| `src/client/sprites.ts` | bitmap defs, `buildAtlas()`, `drawFrame()`, `iconCanvas()`, `contrast()` | content.ts |
| `src/client/style.css` | `@font-face` ×2, token custom properties, kit CSS (plate, button states, hearts, wick, d-pad, ghost card, focus ring) | fonts |
| `src/client/ui.ts` | kit element builders reused by the HUD in Phase 3: `button`, `plate`, `hearts`, `wick`, `dpad`, `ghostCard` | sprites.ts |
| `src/client/lab.html` + `lab.ts` | tabs: Tokens (swatches + contrast, type scale, mock lit room) and Kit | all of the above |
| `src/client/assets/fonts/` | `jacquard-24.woff2` (35 KB), `pixelify-sans.woff2` (8 KB), Latin 400 only | — |
| `tests/shared.test.ts` | token parity between CSS and TS, contrast floors, light tables use only tokens, bitmap shape rules | content, sprites |

## Pipeline rules

- A sprite is up to two layers, each a 16×16 grid of `#`/`.` with one palette token, plus an optional `bg` token fill. Flipping is allowed through draw options; rotation is not.
- Light levels (revised twice at the gate): the floor is flagstones, ink-2 slabs with ink-1 grooves. In dim light the slabs drop to ink-1 and the grooves vanish, so the torch's pool is the only place the stone shows. Walls are ink-2 bricks with ink-0 grooves that survive every level, and stone top faces that dim away. No dots or cracks. `dim` drops each neutral one rung; `remembered` also drops all colour.
  - `dim`: bone and pale become stone; stone becomes ink-1, so mortar and cracks survive in shadow; gilt and bile become ink-2; ember becomes ember-deep. Wisp and blood keep their colour, so the dead and danger still read in shadow.
  - `remembered`: ink-1 and ink-2 become ink-1; every other token becomes ink-2.
- `buildAtlas()` returns `{ canvas, frames: Record<"name@level", {x, y}> }`. In Phase 3, Phaser will take it with `textures.addCanvas` plus frame adds.
- DOM icons use `iconCanvas(name, zoom)`, which returns a canvas sized `16·zoom` with `image-rendering: pixelated`.

## Kit decisions

- Plates are flat ink-2 with a 2 px bone border, square corners, and a hard 2 px shadow in stone. The primary button is ember with ink-0 text and an ember-deep shadow. On press the shadow collapses and the face moves 2 px. Disabled uses a stone border and pale text.
- The focus ring is a 2 px ember outline offset by 2 px. Ember means "you are here".
- Hearts are a 2-layer sprite: a bone outline and a blood fill. A lost heart drops the fill layer. Each heart has an `aria-label` such as "Hearts 2 of 3".
- The wick is a 2 px bone line for the turns left and a dotted stone line for the turns burned. A flame sprite sits at the burning end with the count beside it.
- The d-pad is a 3×3 grid of 56 px plates: four arrow sprites (up and left are drawn; down and right are flips) and Wait in the centre.
- The ghost card is a 96 px avatar frame, u/name, the carving line, the record, and Trust and Liar buttons. Locally a wisp placeholder stands in for the avatar, with no network.

## Contrast (measured)

- bone: 12.4 on ink-0, 9.0 on ink-2. pale: 6.2 on ink-0, 4.54 on ink-2. ink-0 on ember: 9.2.
- blood (3.2 on ink-2) and stone fail as text, so they are used only for shapes and fills.

## Assumptions

- B1. The atlas is a canvas built at runtime, not `atlas.png`. The PNG exists only if the pack fallback is used in Phase 2.
- B2. Mock-room light radii are Lab data in `lab.ts`, not game tuning. Torch radii join `content.ts` in Phase 3.
- B3. `ui.ts` is started now with kit builders, so the Phase 3 HUD reuses them instead of duplicating them.
- B4. The template's `game.css` and `splash.css` stay until those screens are rebuilt in Phases 3, 6 and 9.
- B5. OFL licence text is credited in the README with copyright lines and a link. A file request for `fonts/OFL.txt` is in the report.
- B6. `contrast()` uses floats and lives in `sprites.ts`, a client file, not `src/shared`.
- B7. The Lab tab is remembered in `location.hash`.
- B8. Placeholder wisp and tile bitmaps are drawn for the mock room; Phase 2 owns their final form. The hero failed review three times, so under the two-strike rule it uses Kenney 1-Bit Pack tile 24,1 (CC0), converted to our bitmap format with an ember flame on the staff. The pack itself is not in the repo.

## Gate revision (Nov 13, user decision)

The user chose a shaded CC0 pack over 1-bit sprites after reviewing mockups. Changes:
- `assets/atlas.png` is 0x72 DungeonTileset II v1.7 (CC0, 39.6 KB). `loadPack()` grades the stone tiles onto `ink-0`…`pale` by nearest luminance, and spikes onto `blood`. Characters and props keep their art.
- The light bands are replaced in the Lab room by an `ink-0` darkness layer with soft radial glows (`ember` for the hero and wall torches, `wisp` for wisps). `LIGHT` tables remain for our bitmaps and for fog of war in Phase 3.
- `SpriteDef` gains a pixel-map form (`map` + `key`). The hero is a white-hooded cleric drawn that way. The pack's knight, wizard, elf, dwarf and lizard are shown beside it in the Lab as alternatives.
- PLAN.md §3 (row 12), §6 and §7 are updated to match.
- The cleric was redrawn (then trimmed to 16×19, the same height as the pack heroes, which measure 19–21 px) to match the pack heroes' proportions: a hood fold, ember eyes in hood shadow, a gilt sash, the robe lit on the torch side, and a torch with a gilt core and an ember-deep handle. Atlas cells are now two tiles high, and sprites stand bottom-aligned on their tile.
