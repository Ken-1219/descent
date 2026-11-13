// LOCAL ONLY: Design Lab. Never a Devvit entrypoint.
import { PALETTE, TILE, type Level } from '../shared/content';
import { buildAtlas, contrast, drawFrame, iconCanvas, type SpriteName } from './sprites';
import { button, dpad, el, ghostCard, hearts, plate, slot, wick } from './ui';

const panel = document.getElementById('panel');
const tabs = document.querySelector('.lab__tabs');
if (!panel || !tabs) throw new Error('lab.html is missing #panel or .lab__tabs');

const section = (title: string, ...kids: (Node | string)[]) => el('section', '', el('h2', '', title), ...kids);
const row = (...kids: (Node | string)[]) => el('div', 'lab__row', ...kids);
const caption = (text: string) => el('p', 'lab__caption', text);

// Mock room: lab data, not game tuning. Light radii are squared tile distances from the hero.
const ROOM = ['#########', '#..^....#', '#.....W.#', '#.@.^...#', '#.......#', '#.....>.#', '#########'];
const HERO = { x: 2, y: 3 };
const LIT = 4;
const EDGE = 8;
const DIM = 18;
const REMEMBERED_MAX_X = 6;
const TILES: Record<string, SpriteName> = { '#': 'wall', '^': 'spikes', '>': 'stairs' };

const levelAt = (x: number, y: number): Level | null => {
  const d = (x - HERO.x) ** 2 + (y - HERO.y) ** 2;
  if (d <= LIT) return 'lit';
  if (d <= EDGE) return 'edge';
  if (d <= DIM) return 'dim';
  return x <= REMEMBERED_MAX_X ? 'remembered' : null;
};

const mockRoom = () => {
  const atlas = buildAtlas();
  const w = ROOM[0]?.length ?? 0;
  const h = ROOM.length;
  const canvas = el('canvas', 'room');
  canvas.width = w * TILE;
  canvas.height = h * TILE;
  canvas.setAttribute('aria-label', 'Mock lit room: hero with torch, spikes, a wisp, remembered stairs');
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  ctx.fillStyle = PALETTE['ink-0'];
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ROOM.forEach((line, y) =>
    [...line].forEach((ch, x) => {
      const level = levelAt(x, y);
      if (!level) return;
      drawFrame(ctx, atlas, TILES[ch] ?? 'floor', level, x * TILE, y * TILE);
      if (ch === 'W' && level !== 'remembered') drawFrame(ctx, atlas, 'wisp', level, x * TILE, y * TILE);
    })
  );
  drawFrame(ctx, atlas, 'hero', 'lit', HERO.x * TILE, HERO.y * TILE);
  return canvas;
};

// Integer zoom only: the largest of 2×–4× that fits the panel.
const fitZoom = (canvas: HTMLCanvasElement, note: HTMLElement) => {
  const zoom = Math.max(2, Math.min(4, Math.floor((panel.clientWidth - 4) / canvas.width)));
  canvas.style.width = `${canvas.width * zoom}px`;
  canvas.style.height = `${canvas.height * zoom}px`;
  note.textContent = `Lit, edge dither, dim, remembered and unseen tiles at ${zoom}×.`;
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

  const room = mockRoom();
  const note = caption('');
  addEventListener('resize', () => fitZoom(room, note));
  queueMicrotask(() => fitZoom(room, note));

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
