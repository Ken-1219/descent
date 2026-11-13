# Phase 3: Core run (design)

Source: PLAN.md §11 Phase 3, §4 determinism, §7 HUD and controls, §10 hook, §15.1, §15.4. The user's rules for this phase:
- Every rule lives in `src/shared`. The scene only draws state and plays the events `step()` returns.
- Fog is decided per tile; the glow never decides visibility.
- The door is one tile in the sim.
- Death (about 1.9 s) is exempt from the 120 ms lock, but any input skips it.
- Floor 0 cannot kill and takes under 60 s.

## Shared interface (exact)

```ts
// src/shared/sim.ts
export type Action = 'U' | 'D' | 'L' | 'R' | 'W' | 'I';
export type Pos = { x: number; y: number };
export type Floor = { depth: number; rows: readonly string[]; torch: number; mercy: boolean };
export type Enemy = { id: number; kind: 'goblin'; x: number; y: number; hp: number; mode: 'idle' | 'alert' | 'chase' };
export type End = { kind: 'won' | 'dead'; cause: string };
export type State = {
  floor: Floor; tiles: readonly string[]; pos: Pos; hearts: number; torch: number; turn: number;
  hasKey: boolean; seen: readonly number[]; enemies: readonly Enemy[]; ended: End | null;
};
export type Event =
  | { t: 'move'; from: Pos; to: Pos } | { t: 'blocked'; at: Pos } | { t: 'locked'; at: Pos }
  | { t: 'door'; at: Pos } | { t: 'key'; at: Pos } | { t: 'attack'; id: number; at: Pos } | { t: 'kill'; id: number; at: Pos }
  | { t: 'alert'; id: number } | { t: 'enemyMove'; id: number; from: Pos; to: Pos } | { t: 'enemyAttack'; id: number }
  | { t: 'hurt'; amount: number; cause: string } | { t: 'torchOut' } | { t: 'won' } | { t: 'dead'; cause: string };
export function start(floor: Floor): State;
export function step(state: State, action: Action): { state: State; events: Event[] };
export function replay(floor: Floor, log: readonly Action[]): State;
export function lightRadius(state: State): number;
/** Per tile (index y*w+x): 0 unseen, 1 remembered, 2 lit. */
export function visibility(state: State): number[];
// src/shared/rng.ts
export function mulberry32(seed: number): () => number; // returns an integer in [0, 2^32)
export function hash(s: string): number;
export function pick<T>(next: () => number, items: readonly T[]): T;
// src/shared/content.ts additions
export const HEARTS = 3, TORCH_RADIUS = 4, TORCH_LOW_RADIUS = 3, TORCH_LOW_PCT = 20,
  TORCH_OUT_RADIUS = 1, TORCH_OUT_DRAIN = 2, GOBLIN_SIGHT = 4, GOBLIN_HP = 1;
export const FLOOR_0: Floor;
```

## Rules

- Tiles:
  - `#` wall; `T` wall with a torch (decoration, still a wall); `.` floor; `^` spikes (fixed, always up)
  - `k` key; `D` locked door, which becomes `/` (open) when opened; `>` stairs
  - `@` start and `g` goblin start, both floor underneath
- Turn order (§4): player acts → mechanisms tick (none yet) → enemies act in id order → torch −1 → damage resolves → end check.
- Actions that don't take a turn:
  - Bumping a wall: `blocked`.
  - Bumping a locked door without the key: `locked`.
  - `I` with no item: nothing happens.
- Bumping the locked door with the key opens it (`door`, uses the key, takes a turn); the player stays put. Entering a key tile picks it up. Entering spikes queues 1 damage (cause `spikes`). Entering stairs wins.
- Bumping an enemy attacks it (hp −1; at 0 it is removed: `kill`).
- Goblin T1:
  - idle → `alert` when the player is within Manhattan distance 4 with line of sight. The alert turn is the tell; the goblin doesn't move.
  - On the next turn it switches to `chase`, and from then on it steps toward the player each turn.
  - Moving: greedy on the larger axis first, then the other axis. It never enters walls, closed doors, spikes, other enemies or the player.
  - When adjacent while chasing, it attacks (1 damage, cause `goblin`).
- Torch:
  - −1 per turn taken.
  - Light radius is 4, or 3 when the torch is at or below 20%.
  - At 0: `torchOut` once, radius 1, then 1 damage every 2 turns (cause `dark`).
- Damage resolves once per turn. On a `mercy` floor, hearts never go below 1.
- End check: dead (hearts 0) takes priority over won. Once the run has ended, `step` returns the state unchanged with no events.
- Fog: lit = squared distance ≤ r² **and** line of sight. Line of sight is Bresenham, blocked by `#`, `T` and `D` (the end tile itself is visible). `seen` keeps every tile ever lit. `visibility()` derives lit / remembered / unseen.
- Integers only, arrays only, no randomness in the sim.

## Floor 0 (17×8, torch 120, mercy)

```
#####T#####T#####
#.....#.........#
#.@...D...^.....#
#...k.#...^..g..#
#.....#...^.....#
#######.........#
#>..............#
#################
```

Get the key, open the door, step around (or through) the spikes, meet the goblin, then go down and west to the stairs. Shortest path ≈ 30 turns.

## Client

- `game.html`/`game.ts`:
  - boot; the input router (keyboard, d-pad, swipe, all through Pointer Events and key events) with one action buffered
  - an end overlay with one primary action, "Descend again"
  - `window.__descent` in dev builds (`import.meta.env.DEV`): `ready`, `state()`, `act(a)`, `load(depth)`, `skipAnim(on)`, `metrics()`
  - `performance.mark('descent:interactive')`
- `scene.ts`, the one Phaser scene:
  - the atlas and the graded pack as canvas textures, with frames for every `PACK` entry and atlas frame
  - every sprite has origin (0.5, 1) at the bottom-centre of its tile; depth = (row + 1) × 10 + layer, which gives §6's row-by-row order
  - fog: an `ink-0` cover per tile (unseen alpha 1, remembered 0.7); enemies and items show only on lit tiles
  - glow: the darkness canvas with soft holes (hero, wall torches), redrawn when the hero moves, drawn above the fog
  - animations from `ANIMS` via `frameAt`; tint frames use `setTint(c).setTintMode(Phaser.TintModes.FILL)` (Phaser 4: `setTintFill` does nothing)
  - hop: 4 frames at 24/24/16/32 ms with y offsets 0/−2/−1/0 (96 ms); lunge 4 px out and back in 80 ms; hurt: 60 ms hit-stop, then a 2 px shake for 120 ms (none with reduced motion, and the shake doesn't lock input)
  - death: `hero-death` (about 1.9 s); any input skips it; instant with `skipAnim`
- Sizing: integer zoom = the largest of 2–4 that fits 11×9 tiles. The game size is the visible tiles × 16 at Scale NONE plus that zoom. The camera follows the hero within the map bounds.
- `ui.ts`: the HUD (floor, hearts, key slot, item slot, wick), updating only nodes that changed; controls are the d-pad plus the item button, with key hints on desktop.
- `style.css`: the game layout. Portrait: HUD, map, then controls in the bottom thumb zone. Landscape phone: controls beside the map. `touch-action: none` on the game area, `overscroll-behavior: contain`, `env(safe-area-inset-bottom)`.
- The template's `scenes/*.ts` and `game.css` are deleted.

## Assumptions

- D1. Torch out doesn't kill outright: radius 1 plus 1 damage every 2 turns (§7 says "Torch out: body tints stone", so the hero survives it).
- D2. "Floor 0 cannot kill" is enforced by `mercy` (hearts never go below 1), so a random walk can't die there. Damage still shows.
- D3. Bumping a wall or a locked door costs no turn and no torch.
- D4. `score()`, `bot()`, items and `advanceDay()` belong to later phases (5–8). `I` is accepted and does nothing.
- D5. No `local.ts` yet: Phase 3 has no server calls. Floor 0 comes from `content.ts`.
- D6. The end screens are a minimal overlay (headline, turns, "Descend again"). The full death and victory screens are Phase 7.
- D7. The dev hook is compiled only into dev builds through `import.meta.env.DEV` (Vite), so production never ships it.
