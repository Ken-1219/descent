// LOCAL ONLY: Design Lab. Never a Devvit entrypoint.
import { PALETTE, TILE, type Token } from '../shared/content';
import { buildAtlas, contrast, drawFrame, drawPack, iconCanvas, loadPack, type Atlas, type PackName } from './sprites';
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
type Light = { x: number; y: number; r: number; tint: Token };

const rgba = (t: Token, a: number) => {
  const h = PALETTE[t];
  return `rgba(${parseInt(h.slice(1, 3), 16)}, ${parseInt(h.slice(3, 5), 16)}, ${parseInt(h.slice(5, 7), 16)}, ${a})`;
};

const FLOOR_VARIANTS: readonly PackName[] = ['floor-crack', 'floor-chip'];
const floorAt = (x: number, y: number): PackName => FLOOR_VARIANTS[(x * 7 + y * 3) % 9] ?? 'floor';

// Darkness with soft holes cut at each light, then a warm or cold wash on top.
const shine = (ctx: CanvasRenderingContext2D, w: number, h: number, lights: Light[]) => {
  const dark = el('canvas');
  dark.width = w;
  dark.height = h;
  const d = dark.getContext('2d');
  if (!d) return;
  d.fillStyle = rgba('ink-0', DARK);
  d.fillRect(0, 0, w, h);
  d.globalCompositeOperation = 'destination-out';
  for (const l of lights) {
    const g = d.createRadialGradient(l.x, l.y, 0, l.x, l.y, l.r);
    g.addColorStop(0, rgba('ink-0', 1));
    g.addColorStop(0.5, rgba('ink-0', 0.75));
    g.addColorStop(1, rgba('ink-0', 0));
    d.fillStyle = g;
    d.fillRect(0, 0, w, h);
  }
  ctx.drawImage(dark, 0, 0);
  ctx.globalCompositeOperation = 'soft-light';
  for (const l of lights) {
    const g = ctx.createRadialGradient(l.x, l.y, 0, l.x, l.y, l.r);
    g.addColorStop(0, rgba(l.tint, 0.7));
    g.addColorStop(1, rgba(l.tint, 0));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }
  ctx.globalCompositeOperation = 'source-over';
};

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
          drawFrame(ctx, atlas, 'flame', 'lit', px, py);
          centre(x, y, 2.4, 'ember');
        }
        return;
      }
      drawPack(ctx, pack, floorAt(x, y), px, py);
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
  shine(ctx, canvas.width, canvas.height, lights);
};

// Hero candidates side by side, each standing on a floor tile at 4×.
const HEROES: [string, PackName | null][] = [['Cleric (ours)', null], ['Knight', 'knight'], ['Wizard', 'wizard'], ['Elf', 'elf'], ['Dwarf', 'dwarf'], ['Lizard', 'lizard']];
const heroLineup = (atlas: Atlas, pack: HTMLCanvasElement) =>
  el(
    'div',
    'legend',
    ...HEROES.map(([label, name]) => {
      const c = el('canvas');
      c.width = TILE;
      c.height = TILE * 2;
      c.style.width = `${TILE * 4}px`;
      c.style.height = `${TILE * 8}px`;
      const ctx = c.getContext('2d');
      if (ctx) {
        ctx.fillStyle = PALETTE['ink-1'];
        ctx.fillRect(0, 0, c.width, c.height);
        drawPack(ctx, pack, 'floor', 0, TILE);
        if (name) drawPack(ctx, pack, name, 0, TILE);
        else drawFrame(ctx, atlas, 'hero', 'lit', 0, TILE);
      }
      return el('figure', 'legend__cell', c, el('figcaption', '', label));
    })
  );

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
  const heroes = el('div');
  addEventListener('resize', () => fitZoom(room, note));
  queueMicrotask(() => fitZoom(room, note));
  void loadPack().then((pack) => {
    mockRoom(atlas, pack, room);
    heroes.replaceChildren(heroLineup(atlas, pack));
  });

  return [
    section('The room', room, note),
    section('Hero options', heroes),
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

const TABS: [string, string, () => Node[]][] = [
  ['tokens', 'Tokens', tokensTab],
  ['kit', 'Kit', kitTab],
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
