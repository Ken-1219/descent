// LOCAL ONLY: the Lab tabs that draw whole floors: Bestiary (one scene per tier-table cell) and Depth (generated floors,
// crowd painting, the win-rate curve). Split from lab.ts, which passed 600 lines. Never a Devvit entrypoint.
import { CURSE_TEXT, FAMILIES, PALETTE, TILE, TRAP_TEXT, ZONE_NAMES } from '../shared/content';
import { modsFrom, rolloverFloor, type Tally } from '../shared/crowd';
import { SCENES, type Scene } from '../shared/scenes';
import { bot } from '../shared/bot';
import { NO_MODS, generate, zoneWeights, type Mods } from '../shared/gen';
import { start, step, visibility, type Event, type Floor, type State } from '../shared/sim';
import { ANIMS, LOCK_MS, buildAtlas, choreograph, drawAnim, drawFrame, drawPack, enemyLook, HURT, links, loadPack, marks, px, py, rgba, tileLook, type Anim, type Atlas } from './sprites';
import { button, el, wick } from './ui';

export const section = (title: string, ...kids: (Node | string)[]) => el('section', '', el('h2', '', title), ...kids);
export const caption = (text: string) => el('p', 'lab__caption', text);
export const figure = (c: HTMLCanvasElement, label: string) => el('figure', 'legend__cell', c, el('figcaption', '', label));
const panelWidth = () => document.getElementById('panel')?.clientWidth ?? 360;

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
const drawTurn = (ctx: CanvasRenderingContext2D, atlas: Atlas, pack: HTMLCanvasElement, run: Run, t: number, elapsed: number, now: number, fog = true) => {
  const s = run.states[t];
  if (!s) return;
  const prev = run.states[t - 1];
  const events = run.turns[t] ?? [];
  const turn = choreograph(events, s);
  ctx.fillStyle = PALETTE['ink-0'];
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  s.tiles.forEach((row, y) => [...row].forEach((c, x) => drawPack(ctx, pack, isWallChar(c) ? 'wall' : 'floor', x * TILE, y * TILE)));
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
  ctx.fillStyle = PALETTE.bone;
  for (const dots of links(s)) for (const d of dots) ctx.fillRect(d.x, d.y, 1, 1);
  for (const st of turn.streaks) {
    if (elapsed < st.at || elapsed > st.until) continue;
    const f = Math.min(1, (elapsed - st.at) / ((st.until - st.at) * 0.6));
    ctx.fillStyle = PALETTE.bone;
    const [x0, y0] = [px(st.from.x), py(st.from.y) - TILE / 2];
    const [x1, y1] = [x0 + (px(st.to.x) - x0) * f, y0 + (py(st.to.y) - TILE / 2 - y0) * f];
    ctx.fillRect(Math.min(x0, x1), Math.min(y0, y1), Math.max(1, Math.abs(x1 - x0)), Math.max(1, Math.abs(y1 - y0)));
  }
  const w = s.tiles[0]?.length ?? 0;
  if (!fog) return;
  visibility(s).forEach((v, i) => {
    if (v === 2) return;
    ctx.fillStyle = rgba('ink-0', v === 0 ? UNSEEN : REMEMBERED);
    ctx.fillRect((i % w) * TILE, Math.floor(i / w) * TILE, TILE, TILE);
  });
};

type Player = { sc: Scene; run: Run; ctx: CanvasRenderingContext2D; fig: HTMLElement; t: number; elapsed: number; paused: boolean; speed: number; wick: HTMLElement | null; shown: number };
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
    // Dark rooms burn the torch: their cells carry the HUD wick, redrawn when the turn changes.
    const s = p.run.states[p.t];
    if (p.wick && s && p.shown !== p.t) p.wick.replaceChildren(wick(s.torch, s.floor.torch));
    p.shown = p.t;
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
  const wickBox = sc.family === 'dark' ? el('div', 'beast__wick') : null;
  const fig = el('figure', 'beast', c, ...(wickBox ? [wickBox] : []), el('figcaption', 'beast__caption', sc.tier ? `T${sc.tier}. ${sc.caption}` : sc.caption), el('p', 'beast__meta muted', `${sc.id} · cost ${sc.cost} · ${sc.log.length} turns`), el('div', 'beast__controls', pause, stepBtn, slow));
  fig.dataset.scene = sc.id;
  const ctx = c.getContext('2d');
  if (!ctx) return fig;
  const p: Player = { sc, run: runScene(sc), ctx, fig, t: 0, elapsed: 0, paused: false, speed: 1, wick: wickBox, shown: -1 };
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

export const bestiaryTab = () => {
  players = [];
  const gen = ++bestiaryGen;
  const box = el('div', '', caption('Loading the pack...'));
  void loadPack().then((pack) => {
    const atlas = buildAtlas();
    const zoom = panelWidth() >= 10 * TILE * 2 ? 2 : 1;
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


// ---- Depth tab: generated floors, painted crowd deaths, the win-rate curve. ----

const COMPARE = [1, 4, 8, 15, 22, 28];
const DEATH_STEPS = [0, 5, 15, 40];
const CURVE_SEEDS = 50;
const CURVE_DEPTHS = 28;
const deaths = [0, 0, 0, 0, 0, 0, 0, 0, 0];
let depthGen = 0;

/** Count of each hazard kind on a floor, for the census line. */
const census = (f: Floor) => {
  const all = f.rows.join('');
  const n = (chars: string) => [...all].filter((c) => chars.includes(c)).length;
  return `spikes ${n('^x')} · pits ${n('Oo,')} · goblins ${n('gG')} · imps ${n('i')} · skeletons ${n('K')} · plates ${n('_')} · gates ${n('Hh')} · darts ${n('SZ')} · dark rooms ${f.dark?.length ?? 0} · items ${n('plb')} · torch ${f.torch}`;
};

/** The whole floor, lit, at an integer zoom; dark rooms shaded so they read in the overview. */
const floorCanvas = (f: Floor, atlas: Atlas, pack: HTMLCanvasElement, zoom: number) => {
  const c = el('canvas');
  c.width = (f.rows[0]?.length ?? 0) * TILE;
  c.height = f.rows.length * TILE;
  c.style.width = `${c.width * zoom}px`;
  c.style.height = `${c.height * zoom}px`;
  const ctx = c.getContext('2d');
  if (ctx) {
    drawTurn(ctx, atlas, pack, { states: [start(f)], turns: [[]] }, 0, LOCK_MS, 0, false);
    ctx.fillStyle = rgba('ink-0', 0.45);
    for (const r of f.dark ?? []) ctx.fillRect(r.x * TILE, r.y * TILE, r.w * TILE, r.h * TILE);
  }
  c.setAttribute('aria-label', `Depth ${f.depth}, seed ${f.seed ?? 0}: ${census(f)}`);
  return c;
};

/** Win rate (%) by depth as an SVG line, with the §8 target (80% at depth 1 to 35% at 28) dashed beside it. */
const curveChart = (rates: readonly number[]) => {
  const W = Math.min(720, panelWidth() - 8), H = 260, L = 48, R = 80, T = 16, B = 40;
  const x = (d: number) => L + ((d - 1) * (W - L - R)) / (CURVE_DEPTHS - 1);
  const y = (v: number) => T + ((100 - v) * (H - T - B)) / 100;
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('width', String(W));
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', `Bot win rate at skill 60 by depth: ${rates.map((v, i) => `depth ${i + 1} ${v}%`).join(', ')}`);
  const add = (tag: string, attrs: Record<string, string>, text = '') => {
    const n = document.createElementNS(ns, tag);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
    if (text) n.textContent = text;
    svg.append(n);
    return n;
  };
  for (const v of [0, 25, 50, 75, 100]) {
    add('line', { x1: String(L), x2: String(W - R), y1: String(y(v)), y2: String(y(v)), style: 'stroke: var(--ink-2); stroke-width: 1' });
    add('text', { x: String(L - 8), y: String(y(v) + 5), 'text-anchor': 'end', style: 'fill: var(--pale); font-size: 16px' }, `${v}`);
  }
  for (const d of [1, 7, 14, 21, 28]) add('text', { x: String(x(d)), y: String(H - 12), 'text-anchor': 'middle', style: 'fill: var(--pale); font-size: 16px' }, `${d}`);
  add('line', { x1: String(x(1)), y1: String(y(80)), x2: String(x(28)), y2: String(y(35)), style: 'stroke: var(--pale); stroke-width: 2; stroke-dasharray: 6 4' });
  add('text', { x: String(x(28) + 6), y: String(y(35) + 5), style: 'fill: var(--pale); font-size: 16px' }, 'target');
  if (rates.length > 1) add('polyline', { points: rates.map((v, i) => `${x(i + 1)},${y(v)}`).join(' '), style: 'fill: none; stroke: var(--ember); stroke-width: 2' });
  rates.forEach((v, i) => {
    const dot = add('circle', { cx: String(x(i + 1)), cy: String(y(v)), r: '4', style: 'fill: var(--ember); stroke: var(--ink-0); stroke-width: 2' });
    const tip = document.createElementNS(ns, 'title');
    tip.textContent = `Depth ${i + 1}: ${v}%`;
    dot.append(tip);
  });
  const table = el('table', 'curve__table', el('tr', '', el('th', '', 'Depth'), ...rates.map((_, i) => el('th', '', String(i + 1)))), el('tr', '', el('th', '', 'Win %'), ...rates.map((v) => el('td', '', String(v)))));
  return el('div', 'curve', svg, el('details', '', el('summary', '', 'Table'), table));
};

export const depthTab = () => {
  const gen = ++depthGen;
  const box = el('div', '', caption('Loading the pack...'));
  void loadPack().then((pack) => {
    if (gen !== depthGen) return;
    const atlas = buildAtlas();
    const mods = (): Mods => ({ ...NO_MODS, deaths: [...deaths] });
    const slider = el('input');
    Object.assign(slider, { type: 'range', min: '1', max: '60', value: '15' });
    slider.setAttribute('aria-label', 'Depth');
    const seed = el('input');
    Object.assign(seed, { type: 'number', min: '1', value: '1' });
    seed.setAttribute('aria-label', 'Seed');
    const label = el('span', 'depth__label');
    const big = el('div', 'depth__big');
    const compare = el('div', 'depth__compare');
    const compass = el('div', 'compass');
    const drawAll = () => {
      const d = Number(slider.value), sd = Number(seed.value) || 1;
      const g = generate(d, sd, mods());
      const side = g.floor.rows[0]?.length ?? 15;
      const zoom = Math.max(1, Math.min(3, Math.floor((panelWidth() - 8) / (side * TILE))));
      label.textContent = `Depth ${d} · seed ${sd}`;
      big.replaceChildren(
        floorCanvas(g.floor, atlas, pack, zoom),
        el('p', 'lab__caption', census(g.floor)),
        el('p', 'muted', `Tiers ${Object.entries(g.floor.tiers ?? {}).map(([f, t]) => `${f} ${t}`).join(', ')} · showcase ${g.showcase.join(', ')} · safe path ${g.safe.burn} turns · rejected seeds ${g.rejected}`),
      );
      big.dataset.depth = String(d);
      compare.replaceChildren(...COMPARE.map((cd) => {
        const cg = generate(cd, sd, mods());
        return el('figure', 'depth__floor', floorCanvas(cg.floor, atlas, pack, 1), el('figcaption', '', `Depth ${cd}`), el('p', 'muted', census(cg.floor)));
      }));
      const w = zoneWeights(deaths);
      compass.replaceChildren(...deaths.map((n, z) => {
        const b = button(`${n} fell · ×${((w[z] ?? 10) / 10).toFixed(1)}`);
        b.setAttribute('aria-label', `Zone ${z + 1}: ${n} deaths`);
        b.addEventListener('click', () => {
          deaths[z] = DEATH_STEPS[(DEATH_STEPS.indexOf(n) + 1) % DEATH_STEPS.length] ?? 0;
          drawAll();
        });
        return b;
      }));
    };
    slider.addEventListener('input', drawAll);
    seed.addEventListener('change', drawAll);
    // The curve: 50 seeds × 28 depths, one depth per tick so the page stays responsive.
    const chart = el('div', '', curveChart([]));
    const measure = button('Measure the curve', 'btn--primary');
    const status = el('p', 'muted', 'Bot skill 60, seeds 1–50, no crowd mods.');
    measure.addEventListener('click', () => {
      measure.disabled = true;
      const rates: number[] = [];
      const one = () => {
        if (gen !== depthGen) return;
        const d = rates.length + 1;
        let wins = 0;
        for (let k = 1; k <= CURVE_SEEDS; k++) if (bot(generate(d, k).floor, 60, k).state.ended?.kind === 'won') wins++;
        rates.push(Math.round((100 * wins) / CURVE_SEEDS));
        chart.replaceChildren(curveChart(rates));
        status.textContent = rates.length < CURVE_DEPTHS ? `Measuring: depth ${rates.length} of ${CURVE_DEPTHS}` : 'Done: skill 60, seeds 1–50.';
        chart.dataset.done = String(rates.length === CURVE_DEPTHS);
        if (rates.length < CURVE_DEPTHS) setTimeout(one, 0);
      };
      setTimeout(one, 0);
    });
    box.replaceChildren(
      section('Floor', el('div', 'depth__controls', label, slider, seed), big),
      section("Yesterday's deaths", caption('Tap a zone to add deaths; every floor regenerates.'), compass),
      section('Depths 1, 4, 8, 15, 22, 28', compare),
      section('Win rate at skill 60', status, measure, chart),
    );
    drawAll();
  });
  return [box];
};

/** Ghosts tab: the game framed at phone size with 0, 1, 20, 300 and 1,000 fixture ghosts (local.ts ?ghosts=N). */
export const ghostsTab = () => {
  try {
    localStorage.setItem('descent:f0', '1'); // skip Floor 0 so the frame opens on the day's floor
  } catch {
    /* the frame then opens on Floor 0, with its scripted ghosts */
  }
  const frame = el('iframe', 'ghosts__frame');
  frame.title = 'Game with fixture ghosts';
  const pick = (n: number) => {
    frame.src = `game.html?ghosts=${n}`;
    for (const b of row.children) b.setAttribute('aria-pressed', String(b.textContent === String(n)));
  };
  const row = el('div', 'lab__row', ...[0, 1, 20, 300, 1000].map((n) => {
    const b = button(String(n));
    b.addEventListener('click', () => pick(n));
    return b;
  }));
  pick(20);
  return [section('Ghost fixtures', caption('The day\'s floor with N other players\' deaths; one deadly spot is in sight from the start.'), row, frame)];
};

/**
 * Rollover tab: a tally (deaths per zone, kills, curse votes, survivors' traps) → the mods it asks for → the ladder step
 * and band → tomorrow's floor, with each placed player trap. For tuning the crowd effect.
 */
let rollGen = 0;
export const rolloverTab = () => {
  const gen = ++rollGen;
  const box = el('div', '', caption('Loading the pack...'));
  void loadPack().then((pack) => {
    if (gen !== rollGen) return;
    const atlas = buildAtlas();
    const deaths = Array<number>(9).fill(0);
    const depth = el('input');
    Object.assign(depth, { type: 'range', min: '2', max: '30', value: '8' });
    depth.setAttribute('aria-label', 'Tomorrow\'s depth');
    const curse = el('select', 'picker');
    curse.setAttribute('aria-label', 'Curse votes');
    curse.append(...[['', 'No curse votes'], ...Object.entries(CURSE_TEXT).map(([c, t]) => [c, `${t.name} wins the vote`])].map(([c = '', label = '']) => {
      const o = el('option', '', label);
      o.value = c;
      return o;
    }));
    const killer = el('select', 'picker');
    killer.setAttribute('aria-label', 'Top killer');
    killer.append(...['', 'goblin', 'imp', 'spikes', 'skeleton', 'dark'].map((k) => {
      const o = el('option', '', k ? `${k}: 9 kills` : 'No kills');
      o.value = k;
      return o;
    }));
    const traps = el('input');
    Object.assign(traps, { type: 'number', min: '0', max: '1000', value: '5' });
    traps.setAttribute('aria-label', 'Survivors setting traps');
    const compass = el('div', 'compass');
    const out = el('div', 'depth__big');
    const draw = () => {
      const n = Math.max(0, Math.min(1000, Number(traps.value) || 0));
      const tally: Tally = {
        deaths,
        kills: killer.value ? { [killer.value]: 9 } : {},
        curseVotes: curse.value ? { [curse.value]: 3 } : {},
        traps: Array.from({ length: n }, (_, i) => ({ zone: (i * 5) % 9, kind: (['spikes', 'dart', 'stairs'] as const)[i % 3] ?? 'spikes', owner: `t2_${i}`, name: `survivor_${i}` })),
      };
      const d = Number(depth.value);
      const r = rolloverFloor(d, 7, tally);
      const m = modsFrom(tally);
      const side = r.floor.rows[0]?.length ?? 15;
      const zoom = Math.max(1, Math.min(3, Math.floor((panelWidth() - 8) / (side * TILE))));
      out.replaceChildren(
        floorCanvas(r.floor, atlas, pack, zoom),
        el('p', 'lab__caption', `Ladder step: ${r.step}${r.tried.length ? ` (after ${r.tried.map((t) => `${t.step}: ${t.why}`).join('; ')})` : ''} · win ${r.win}% vs plain ${r.plainWin}%`),
        el('p', 'muted', `Mods asked: curse ${m.curses[0] ?? 'none'} · top family ${m.topFamily ?? 'none'} · zone weights ×${zoneWeights(deaths).map((w) => (w / 10).toFixed(1)).join(' ')} · ${m.traps.length} traps asked`),
        el('p', 'muted', `Placed: ${(r.floor.traps ?? []).map((t) => `${TRAP_TEXT[t.kind]} by u/${t.name} at ${t.x},${t.y}`).join(' · ') || 'no player traps'}`),
        el('p', 'muted', census(r.floor)),
      );
      out.dataset.step = r.step;
      compass.replaceChildren(...deaths.map((v, z) => {
        const b = button(`${v} fell`);
        b.setAttribute('aria-label', `${ZONE_NAMES[z]}: ${v} deaths`);
        b.addEventListener('click', () => {
          deaths[z] = DEATH_STEPS[(DEATH_STEPS.indexOf(v) + 1) % DEATH_STEPS.length] ?? 0;
          draw();
        });
        return b;
      }));
    };
    for (const c of [depth, curse, killer, traps]) c.addEventListener('change', draw);
    box.replaceChildren(
      section('Today\'s tally', caption('Tap zones to add deaths; pick a killer, a curse and how many survivors set traps.'), compass, el('div', 'depth__controls', depth, curse, killer, traps)),
      section('Tomorrow', out),
    );
    draw();
  });
  return [box];
};

/** Screens tab: every Phase 9 screen and state at phone size, from local fixtures (local.ts knobs). */
export const screensTab = () => {
  try {
    localStorage.setItem('descent:f0', '1');
  } catch {
    /* frames then open on Floor 0 */
  }
  const SCREENS: [string, string][] = [
    ['Intro: Floor 1 (no yesterday)', 'game.html?floor=f0'],
    ['Intro: under 3 deaths', 'game.html?floor=f0&yesterday=few'],
    ['Intro: full, cursed, your trap', 'game.html?yesterday=1&curse=frail&mytrap=2,1&ghosts=20'],
    ['Splash', 'splash.html?ghosts=20'],
    ['Splash, cursed', 'splash.html?ghosts=20&curse=deep-dark'],
    ['Warden: alive', 'game.html?floor=warden&boss=alive'],
    ['Warden: carried over', 'game.html?floor=warden&boss=carried'],
    ['Warden: fallen', 'game.html?floor=warden&boss=killed'],
    ['Splash, boss day', 'splash.html?floor=warden&boss=alive'],
  ];
  const frame = el('iframe', 'ghosts__frame');
  frame.title = 'Screen';
  const pick = (url: string) => {
    frame.src = url;
    for (const b of row.children) b.setAttribute('aria-pressed', String(b.getAttribute('data-url') === url));
  };
  const row = el('div', 'lab__row', ...SCREENS.map(([label, url]) => {
    const b = button(label);
    b.dataset.url = url;
    b.addEventListener('click', () => pick(url));
    return b;
  }));
  pick(SCREENS[0]?.[1] ?? 'game.html');
  return [section('Screens', caption('The played plate, Board and Chronicle open from a finished run in any frame.'), row, frame)];
};
