// LOCAL ONLY: Design Lab. Never a Devvit entrypoint.
import { FAMILIES, PALETTE, TILE, type Token } from '../shared/content';
import { SCENES, type Scene } from '../shared/scenes';
import { start, step, visibility, type Event, type State } from '../shared/sim';
import {
  ANIMS, LOCK_MS, choreograph, enemyLook, floorTile, HURT, marks, px, py, rgba, shine, tileLook, type Light, buildAtlas, contrast, drawAnim,
  drawFrame, drawPack, frameAt, iconCanvas, loadPack, type Anim, type Atlas, type PackName,
} from './sprites';
import { button, dpad, el, ghostCard, hearts, plate, slot, wick } from './ui';

const panel = document.getElementById('panel');
const tabs = document.querySelector('.lab__tabs');
if (!panel || !tabs) throw new Error('lab.html is missing #panel or .lab__tabs');

const section = (title: string, ...kids: (Node | string)[]) => el('section', '', el('h2', '', title), ...kids);
const row = (...kids: (Node | string)[]) => el('div', 'lab__row', ...kids);
const caption = (text: string) => el('p', 'lab__caption', text);

// Mock room: lab data, not game tuning. T wall top, W wall, f wall torch, ^ spikes, c crate, s skull,
// > stairs, @ hero, * wisp. Light radii are in tiles.
const ROOM = ['TTTTTTTTT', 'WWfWWWfWW', 'W.......W', 'W..^^..sW', 'W.@...*.W', 'Wc...^^.W', 'W.....>.W', 'TTTTTTTTT'];
const PROPS: Record<string, PackName> = { '^': 'spikes', c: 'crate', s: 'skull', '>': 'stairs' };
const DARK = 0.86;

const mockRoom = (atlas: Atlas, pack: HTMLCanvasElement, canvas: HTMLCanvasElement) => {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const lights: Light[] = [];
  const centre = (x: number, y: number, r: number, tint: Token) => lights.push({ x: x * TILE + 8, y: y * TILE + 8, r: r * TILE, tint });
  ctx.fillStyle = PALETTE['ink-0'];
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ROOM.forEach((line, y) =>
    [...line].forEach((ch, x) => {
      const px = x * TILE;
      const py = y * TILE;
      if (ch === 'T') return drawPack(ctx, pack, 'wall-top', px, py);
      if (ch === 'W' || ch === 'f') {
        drawPack(ctx, pack, 'wall', px, py);
        if (ch === 'f') {
          drawFrame(ctx, atlas, 'torch-0', 'lit', px, py);
          centre(x, y, 2.4, 'ember');
        }
        return;
      }
      drawPack(ctx, pack, floorTile(x, y), px, py);
      const prop = PROPS[ch];
      if (prop) drawPack(ctx, pack, prop, px, py);
      if (ch === '*') {
        drawFrame(ctx, atlas, 'wisp', 'lit', px, py);
        centre(x, y, 1.8, 'wisp');
      }
      if (ch === '@') {
        drawFrame(ctx, atlas, 'hero', 'lit', px, py);
        centre(x, y, 3.4, 'ember');
      }
    })
  );
  shine(ctx, canvas.width, canvas.height, lights, DARK);
};

// Integer zoom only: the largest of 2×–4× that fits the panel.
const fitZoom = (canvas: HTMLCanvasElement, note: HTMLElement) => {
  const zoom = Math.max(2, Math.min(4, Math.floor((panel.clientWidth - 4) / canvas.width)));
  canvas.style.width = `${canvas.width * zoom}px`;
  canvas.style.height = `${canvas.height * zoom}px`;
  note.textContent = `Graded 0x72 tiles under torch glow, at ${zoom}×.`;
};

const tokensTab = () => {
  const swatches = el('div', 'swatches');
  for (const [name, hex] of Object.entries(PALETTE)) {
    const on0 = contrast(hex, PALETTE['ink-0']);
    const on2 = contrast(hex, PALETTE['ink-2']);
    const chip = el('div', 'swatch__chip');
    chip.style.background = `var(--${name})`;
    const verdict = name.startsWith('ink') ? el('div', 'swatch__fail', 'surface') : on0 < 4.5 && on2 < 4.5 ? el('div', 'swatch__fail', 'shapes only') : '';
    swatches.append(
      el('div', 'swatch', chip, el('div', '', el('div', '', name), el('div', 'muted', hex), el('div', 'muted', `${on0.toFixed(1)} on ink-0, ${on2.toFixed(1)} on ink-2`), verdict))
    );
  }

  const atlas = buildAtlas();
  const room = el('canvas', 'room');
  room.width = (ROOM[0]?.length ?? 0) * TILE;
  room.height = ROOM.length * TILE;
  room.setAttribute('aria-label', 'Mock room: cleric with torch, wall torches, spikes, a wisp, stairs');
  const note = caption('');
  addEventListener('resize', () => fitZoom(room, note));
  queueMicrotask(() => fitZoom(room, note));
  void loadPack().then((pack) => mockRoom(atlas, pack, room));

  return [
    section('The room', room, note),
    section('Palette', swatches),
    section(
      'Type',
      el(
        'div',
        'type-scale',
        el('p', 'title', 'Floor 7'),
        el('p', 'title title--small', 'You fell at the spike hall'),
        el('p', '', 'The north-east took 41. It is worse today.'),
        el('p', '', 'You fell at the spike hall. 41 fell before you.'),
        el('p', 'muted', 'Secondary lines are 16 px in pale.')
      )
    ),
  ];
};

const states = (label: string, cls: string) => {
  const make = (state: string, extra: string) => {
    const b = button(label, `${cls} ${extra}`);
    if (state === 'Disabled') b.disabled = true;
    return el('div', '', b, caption(state));
  };
  return row(make('Default', ''), make('Hover', 'is-hover'), make('Pressed', 'is-pressed'), make('Focus', 'is-focus'), make('Disabled', ''));
};

const kitTab = () => {
  const floor = el('span', 'hud__floor', '7');
  floor.setAttribute('aria-label', 'Floor 7');
  const hud = el('div', 'hud', floor, hearts(2, 3), slot('Key held', iconCanvas('key', 2)), slot('Item slot empty'), wick(12, 30));
  return [
    section('HUD bar', hud),
    section('Buttons', states('Descend', 'btn--primary'), states('Carve', '')),
    section('Plate', plate('A flat plate holds one thing.')),
    section('Hearts', row(hearts(3, 3), hearts(2, 3), hearts(0, 3))),
    section('Torch wick', el('div', '', wick(30, 30), wick(12, 30), wick(4, 30, true))),
    section('D-pad', dpad()),
    section(
      'Ghost card',
      row(
        ghostCard({ name: 'ashen_delver', carving: 'Spikes ahead. Go left.', deaths: 6, trust: 14, liar: 3, canVote: false }),
        ghostCard({ name: 'quiet_lantern', carving: 'The rat sleeps. Pass by.', deaths: 2, trust: 3, liar: 9, canVote: true })
      ),
      caption('Voting unlocks after your run ends.')
    ),
  ];
};

// ---- Cast tab ----

// Cells are 32×40 source px: room for the 32×36 Warden; the standing tile's origin is (8, 24).
const CW = 32;
const CH = 40;
const OX = 8;
const OY = CH - TILE;
const still = (name: PackName): Anim => ({ frames: [{ src: 'pack', name }], ms: [1000], loop: true });

const CAST: [string, Anim][] = [
  ['Delver', ANIMS['hero-idle']],
  ['Wisp', ANIMS['wisp-float']],
  ['Your ghost', ANIMS['ghost-float']],
  ['Goblin', ANIMS['goblin-idle']],
  ['Imp', ANIMS['imp-idle']],
  ['Skeleton', ANIMS['skelet-idle']],
  ['Bone pile', still('skull')],
  ['Warden', ANIMS['warden-idle']],
  ['Potion', ANIMS['potion-bob']],
  ['Lamp oil', ANIMS['oil-bob']],
  ['Bomb', ANIMS['bomb-fuse']],
  ['Key', ANIMS['key-bob']],
  ['Wall torch', ANIMS['torch-flame']],
  ['Stairs', still('stairs')],
  ['Door', still('door')],
  ['Open door', still('door-open')],
];

const DARK_CAST: (keyof typeof ANIMS)[] = ['hero-idle', 'wisp-float', 'goblin-idle'];

type Cell = { ctx: CanvasRenderingContext2D; anim: Anim; phase: number; floor: boolean; dark: number; silhouette: boolean; shuffle: boolean; pause: number };
let cells: Cell[] = [];
let ticking = 0;

const cellCanvas = (zoom: number) => {
  const c = el('canvas');
  c.width = CW;
  c.height = CH;
  c.style.width = `${CW * zoom}px`;
  c.style.height = `${CH * zoom}px`;
  return c;
};

const figure = (c: HTMLCanvasElement, label: string) => el('figure', 'legend__cell', c, el('figcaption', '', label));

// The torch flame never loops: shuffled frames with random holds (cosmetic randomness, client only).
const torchState = new WeakMap<Cell, { frame: number; until: number }>();
const torchFrame = (cell: Cell, now: number) => {
  const s = torchState.get(cell) ?? { frame: 0, until: 0 };
  if (now >= s.until) {
    s.frame = (s.frame + 1 + Math.floor(Math.random() * 2)) % 3;
    s.until = now + 84 + Math.floor(Math.random() * 57);
  }
  torchState.set(cell, s);
  return s.frame;
};

const paintCell = (cell: Cell, atlas: Atlas, pack: HTMLCanvasElement, now: number) => {
  const { ctx } = cell;
  ctx.clearRect(0, 0, CW, CH);
  if (!cell.silhouette) {
    ctx.fillStyle = PALETTE['ink-1'];
    ctx.fillRect(0, 0, CW, CH);
  }
  if (cell.floor) {
    drawPack(ctx, pack, 'floor', 0, OY);
    drawPack(ctx, pack, 'floor', TILE, OY);
  }
  const total = cell.anim.ms.reduce((a, b) => a + b, 0);
  const t = now + cell.phase;
  const elapsed = cell.anim.loop ? t : t % (total + cell.pause);
  if (cell.shuffle) {
    const frame = cell.anim.frames[torchFrame(cell, now)];
    if (frame) drawAnim(ctx, atlas, pack, { frames: [frame], ms: [1000], loop: true }, 0, OX, OY);
  } else drawAnim(ctx, atlas, pack, cell.anim, elapsed, OX, OY);
  if (cell.silhouette) {
    // Silhouette gate: every opaque pixel becomes ink-0 on a pale plate.
    ctx.globalCompositeOperation = 'source-atop';
    ctx.fillStyle = PALETTE['ink-0'];
    ctx.fillRect(0, 0, CW, CH);
    ctx.globalCompositeOperation = 'destination-over';
    ctx.fillStyle = PALETTE.pale;
    ctx.fillRect(0, 0, CW, CH);
    ctx.globalCompositeOperation = 'source-over';
  }
  if (cell.dark > 0) {
    ctx.fillStyle = rgba('ink-0', cell.dark);
    ctx.fillRect(0, 0, CW, CH);
  }
};

const tick = (atlas: Atlas, pack: HTMLCanvasElement, gen: number) => {
  if (gen !== ticking || !document.body.contains(cells[0]?.ctx.canvas ?? null)) return;
  const now = performance.now();
  for (const c of cells) paintCell(c, atlas, pack, now);
  requestAnimationFrame(() => tick(atlas, pack, gen));
};

const castCell = (anim: Anim, zoom: number, opts: Partial<Omit<Cell, 'ctx' | 'anim'>> = {}) => {
  const c = cellCanvas(zoom);
  const ctx = c.getContext('2d');
  if (ctx) {
    cells.push({
      ctx, anim,
      phase: Math.floor(Math.random() * 2000),
      floor: true, dark: 0, silhouette: false, shuffle: anim === ANIMS['torch-flame'], pause: 900,
      ...opts,
    });
  }
  return c;
};

// Every frame side by side with its ms, for the §15.4 frame-by-frame review.
const filmstrip = (name: string, anim: Anim, atlas: Atlas, pack: HTMLCanvasElement) => {
  const strip = el('div', 'legend');
  let at = 0;
  anim.frames.forEach((_, i) => {
    const c = cellCanvas(2);
    const ctx = c.getContext('2d');
    if (ctx) {
      ctx.fillStyle = PALETTE['ink-1'];
      ctx.fillRect(0, 0, CW, CH);
      drawPack(ctx, pack, 'floor', 0, OY);
      drawPack(ctx, pack, 'floor', TILE, OY);
      drawAnim(ctx, atlas, pack, anim, at, OX, OY);
    }
    strip.append(figure(c, `${anim.ms[i] ?? 0} ms`));
    at += anim.ms[i] ?? 0;
  });
  const film = el('div', '', el('h3', 'lab__caption', `${name}, ${frameAt(anim, at - 1) + 1} frames, ${at} ms`), strip);
  film.dataset.film = name;
  return film;
};

const castTab = () => {
  cells = [];
  const gen = ++ticking;
  const box = el('div', '', caption('Loading the pack...'));
  void loadPack().then((pack) => {
    const atlas = buildAtlas();
    const death = ANIMS['hero-death'];
    box.replaceChildren(
      section('Silhouettes at 2×', el('div', 'legend', ...CAST.map(([label, anim]) => figure(castCell(anim, 2, { silhouette: true, floor: false }), label)))),
      section('Death to wisp', el('div', 'legend', figure(castCell(death, 2, { phase: 0 }), '2×'), figure(castCell(death, 4, { phase: 0 }), '4×'))),
      section('Sizes', el('div', 'legend', ...[1, 2, 4].map((z) => figure(castCell(ANIMS['hero-idle'], z), `${z}×`)))),
      section(
        'In the dark',
        el('div', 'legend', ...[0, 0.5, 0.86].flatMap((dark) => DARK_CAST.map((k) => figure(castCell(ANIMS[k], 2, { dark }), `${k.split('-')[0]}, ${dark}`)))),
      ),
      section('Animations', el('div', 'legend', ...Object.entries(ANIMS).map(([k, anim]) => figure(castCell(anim, 2), k)))),
      section('Filmstrips', ...Object.entries(ANIMS).map(([k, anim]) => filmstrip(k, anim, atlas, pack))),
    );
    requestAnimationFrame(() => tick(atlas, pack, gen));
  });
  return [box];
};

// ---- Bestiary tab: every tier-table cell, Trapsetter trap and item as its scene, looping. ----
// The scene is the same data the Vitest case replays, drawn with the game's own look() and choreograph().

const TURN_MS = 640; // one turn on screen at 1×: the 120 ms of motion, then a held beat to read the tell
const END_HOLD_MS = 1400;
const SLOW = 0.25;
const UNSEEN = 0.72; // the Lab keeps unseen tiles faintly visible so the room reads; the game hides them
const REMEMBERED = 0.45;

type Run = { states: State[]; turns: Event[][] };
const runScene = (sc: Scene): Run => {
  const states = [start(sc.floor)];
  const turns: Event[][] = [[]];
  for (const a of sc.log) {
    const r = step(states[states.length - 1] ?? states[0] as State, a);
    states.push(r.state);
    turns.push(r.events);
  }
  return { states, turns };
};

const isWallChar = (c: string) => '#TSsZz'.includes(c);
const anyAnim = (f: Anim['frames'][number]): Anim => ({ frames: [f], ms: [1000], loop: true });

/** Draws turn `t` of a run, `elapsed` ms into its motion (scaled by the cell's speed), animations at `now`. */
const drawTurn = (ctx: CanvasRenderingContext2D, atlas: Atlas, pack: HTMLCanvasElement, run: Run, t: number, elapsed: number, now: number) => {
  const s = run.states[t];
  if (!s) return;
  const prev = run.states[t - 1];
  const events = run.turns[t] ?? [];
  const turn = choreograph(events, s);
  ctx.fillStyle = PALETTE['ink-0'];
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  s.tiles.forEach((row, y) => [...row].forEach((c, x) => drawPack(ctx, pack, isWallChar(c) ? 'wall' : floorTile(x, y), x * TILE, y * TILE)));
  s.tiles.forEach((row, y) => [...row].forEach((_, x) => {
    for (const p of tileLook(s, x, y)) drawAnim(ctx, atlas, pack, p.anim, now, x * TILE, y * TILE);
  }));
  for (const m of marks(s)) drawAnim(ctx, atlas, pack, anyAnim(m.frame), 0, m.x * TILE, m.y * TILE);
  // Actors stand on tile bottoms; a motion key overrides the resting position while it runs.
  const where = (who: 'hero' | number, x: number, y: number) => {
    const m = turn.motions.find((o) => o.who === who);
    const k = m && [...m.keys].reverse().find((o) => o.at <= elapsed);
    const moving = !!m && elapsed < (m.keys.at(-1)?.at ?? 0) + LOCK_MS / 4;
    return k ? { x: k.x, y: k.y + k.yo, moving } : { x: px(x), y: py(y), moving: false };
  };
  const actors: { y: number; draw: () => void }[] = [];
  for (const e of s.enemies) {
    const look = enemyLook(e);
    const at = where(e.id, e.x, e.y);
    actors.push({ y: at.y, draw: () => {
      drawAnim(ctx, atlas, pack, look.anim, now, at.x - TILE / 2 + (at.moving ? 0 : look.dx), at.y - TILE + (at.moving ? 0 : look.dy));
      if (look.digit) drawFrame(ctx, atlas, look.digit, 'lit', at.x - TILE / 2, at.y - TILE);
    } });
  }
  for (const e of events) {
    const gone = e.t === 'kill' ? prev?.enemies.find((o) => o.id === e.id) : undefined;
    if (gone && elapsed < 140) actors.push({ y: py(gone.y), draw: () => drawAnim(ctx, atlas, pack, HURT[gone.kind], elapsed, px(gone.x) - TILE / 2, py(gone.y) - TILE) });
  }
  const hero = where('hero', s.pos.x, s.pos.y);
  const hurt = events.some((e) => e.t === 'hurt');
  const heroAnim = s.ended?.kind === 'dead' ? ANIMS['hero-death'] : hurt && elapsed < 224 ? ANIMS['hero-hurt'] : ANIMS['hero-idle'];
  actors.push({ y: hero.y, draw: () => drawAnim(ctx, atlas, pack, heroAnim, heroAnim.loop ? now : elapsed, hero.x - TILE / 2, hero.y - TILE) });
  actors.sort((a, b) => a.y - b.y);
  for (const a of actors) a.draw();
  for (const st of turn.streaks) {
    if (elapsed < st.at || elapsed > st.until) continue;
    const f = Math.min(1, (elapsed - st.at) / ((st.until - st.at) * 0.6));
    ctx.fillStyle = PALETTE.bone;
    const [x0, y0] = [px(st.from.x), py(st.from.y) - TILE / 2];
    const [x1, y1] = [x0 + (px(st.to.x) - x0) * f, y0 + (py(st.to.y) - TILE / 2 - y0) * f];
    ctx.fillRect(Math.min(x0, x1), Math.min(y0, y1), Math.max(1, Math.abs(x1 - x0)), Math.max(1, Math.abs(y1 - y0)));
  }
  const w = s.tiles[0]?.length ?? 0;
  visibility(s).forEach((v, i) => {
    if (v === 2) return;
    ctx.fillStyle = rgba('ink-0', v === 0 ? UNSEEN : REMEMBERED);
    ctx.fillRect((i % w) * TILE, Math.floor(i / w) * TILE, TILE, TILE);
  });
};

type Player = { sc: Scene; run: Run; ctx: CanvasRenderingContext2D; fig: HTMLElement; t: number; elapsed: number; paused: boolean; speed: number };
let players: Player[] = [];
let bestiaryGen = 0;

const tickBestiary = (atlas: Atlas, pack: HTMLCanvasElement, gen: number, last: number) => {
  if (gen !== bestiaryGen || !document.body.contains(players[0]?.fig ?? null)) return;
  const now = performance.now();
  const dt = Math.min(100, now - last);
  for (const p of players) {
    const lastTurn = p.run.states.length - 1;
    const span = p.t === lastTurn ? END_HOLD_MS : TURN_MS;
    // Paused cells still finish the current turn's motion, so Step shows the move and then holds.
    p.elapsed = Math.min(p.paused ? span - 1 : Infinity, p.elapsed + dt * p.speed);
    if (!p.paused && p.elapsed >= span) {
      p.t = p.t >= lastTurn ? 0 : p.t + 1;
      p.elapsed = 0;
    }
    p.fig.dataset.turn = String(p.t);
    drawTurn(p.ctx, atlas, pack, p.run, p.t, p.elapsed, now);
  }
  requestAnimationFrame(() => tickBestiary(atlas, pack, gen, now));
};

const sceneCell = (sc: Scene, zoom: number) => {
  const w = (sc.floor.rows[0]?.length ?? 0) * TILE;
  const h = sc.floor.rows.length * TILE;
  const c = el('canvas');
  c.width = w;
  c.height = h;
  c.style.width = `${w * zoom}px`;
  c.style.height = `${h * zoom}px`;
  c.setAttribute('aria-label', `${sc.id}: ${sc.caption}`);
  const pause = button('Pause');
  const stepBtn = button('Step');
  const slow = button('¼×');
  slow.setAttribute('aria-pressed', 'false');
  const fig = el('figure', 'beast', c, el('figcaption', 'beast__caption', sc.tier ? `T${sc.tier}. ${sc.caption}` : sc.caption), el('p', 'beast__meta muted', `${sc.id} · cost ${sc.cost} · ${sc.log.length} turns`), el('div', 'beast__controls', pause, stepBtn, slow));
  fig.dataset.scene = sc.id;
  const ctx = c.getContext('2d');
  if (!ctx) return fig;
  const p: Player = { sc, run: runScene(sc), ctx, fig, t: 0, elapsed: 0, paused: false, speed: 1 };
  const setPaused = (on: boolean) => {
    p.paused = on;
    pause.textContent = on ? 'Play' : 'Pause';
    fig.dataset.paused = String(on);
  };
  pause.addEventListener('click', () => setPaused(!p.paused));
  stepBtn.addEventListener('click', () => {
    setPaused(true);
    p.t = p.t >= p.run.states.length - 1 ? 0 : p.t + 1;
    p.elapsed = 0;
  });
  slow.addEventListener('click', () => {
    p.speed = p.speed === 1 ? SLOW : 1;
    slow.setAttribute('aria-pressed', String(p.speed !== 1));
  });
  setPaused(false);
  players.push(p);
  return fig;
};

// Filmstrips (§15.4): each enemy action and trap cycle, frame by frame, from the same drawTurn().
const FILMS: [string, string, number, number][] = [
  ['goblin wind-up and lunge', 'goblins-1', 3, 5],
  ['goblin double move', 'goblins-4', 2, 3],
  ['goblin den spawn', 'goblins-3', 5, 6],
  ['imp flight', 'imps-1', 3, 4],
  ['imp dive', 'imps-2', 6, 7],
  ['skeleton collapse and rebuild', 'skeletons-1', 7, 11],
  ['archer shot', 'skeletons-3', 4, 5],
  ['breathing spikes', 'spikes-2', 0, 3],
  ['spike wave', 'spikes-3', 3, 5],
  ['buried spikes', 'spikes-4', 1, 3],
  ['dart plate', 'mechanisms-3', 3, 4],
  ['gate slam', 'mechanisms-2', 4, 5],
  ['timed gate', 'mechanisms-4', 5, 6],
  ['crumbling floor', 'pits-2', 3, 4],
  ['chain falls', 'pits-3', 2, 4],
  ['hidden pit', 'pits-4', 2, 3],
  ['brazier', 'dark-4', 7, 8],
  ['Trapsetter dart', 'trap-dart', 1, 2],
  ['false stairs', 'trap-stairs', 2, 3],
  ['bomb', 'item-bomb', 2, 3],
];
const FILM_AT = [0, 24, 48, 72, 96, 119];

const film = (name: string, sc: Scene, from: number, to: number, atlas: Atlas, pack: HTMLCanvasElement) => {
  const run = runScene(sc);
  const strip = el('div', 'legend');
  for (let t = from; t <= to; t++) {
    const moving = choreograph(run.turns[t] ?? [], run.states[t] ?? run.states[0] as State).lock > 0;
    for (const at of moving ? FILM_AT : [TURN_MS - 1]) {
      const c = el('canvas');
      c.width = (sc.floor.rows[0]?.length ?? 0) * TILE;
      c.height = sc.floor.rows.length * TILE;
      c.style.width = `${c.width * 2}px`;
      c.style.height = `${c.height * 2}px`;
      const ctx = c.getContext('2d');
      if (ctx) drawTurn(ctx, atlas, pack, run, t, at, 0);
      strip.append(figure(c, `t${t} +${at} ms`));
    }
  }
  const box = el('div', '', el('h3', 'lab__caption', `${name} (${sc.id})`), strip);
  box.dataset.film = sc.id;
  return box;
};

const bestiaryTab = () => {
  players = [];
  const gen = ++bestiaryGen;
  const box = el('div', '', caption('Loading the pack...'));
  void loadPack().then((pack) => {
    const atlas = buildAtlas();
    const zoom = panel.clientWidth >= 10 * TILE * 2 ? 2 : 1;
    const byId = (id: string) => SCENES.find((s) => s.id === id);
    box.replaceChildren(
      ...FAMILIES.map((f) =>
        section(f[0]?.toUpperCase() + f.slice(1), el('div', 'bestiary', ...SCENES.filter((s) => s.family === f).map((sc) => sceneCell(sc, zoom)))),
      ),
      section('Trapsetter and items', el('div', 'bestiary', ...SCENES.filter((s) => s.family === 'trap' || s.family === 'item').map((sc) => sceneCell(sc, zoom)))),
      section('Filmstrips', ...FILMS.flatMap(([name, id, a, b]) => {
        const sc = byId(id);
        return sc ? [film(name, sc, a, b, atlas, pack)] : [];
      })),
    );
    requestAnimationFrame((t) => tickBestiary(atlas, pack, gen, t));
  });
  return [box];
};

const TABS: [string, string, () => Node[]][] = [
  ['tokens', 'Tokens', tokensTab],
  ['kit', 'Kit', kitTab],
  ['cast', 'Cast', castTab],
  ['bestiary', 'Bestiary', bestiaryTab],
];

const show = () => {
  const id = location.hash.slice(1) || 'tokens';
  const tab = TABS.find(([key]) => key === id) ?? TABS[0];
  if (!tab) return;
  panel.replaceChildren(...tab[2]());
  for (const b of tabs.children) b.setAttribute('aria-selected', String(b.getAttribute('data-tab') === tab[0]));
};

for (const [key, label] of TABS) {
  const b = button(label);
  b.setAttribute('role', 'tab');
  b.dataset.tab = key;
  b.addEventListener('click', () => (location.hash = key));
  tabs.append(b);
}
addEventListener('hashchange', show);
show();
