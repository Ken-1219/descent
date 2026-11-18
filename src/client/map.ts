// Phase 11f: the map overview. Every tile you have seen, small enough to take in the whole floor at once, with you and
// (once seen) the stairs. Opening it is not an action: no turn passes and nothing is logged. It draws only `seen`, the
// sim's own memory, so it never shows more than you saw.
import { PALETTE } from '../shared/content';
import { isWall, width } from '../shared/grid';
import type { State } from '../shared/sim';
import { button, el } from './ui';

const MIN_CELL = 3;
const MAX_CELL = 12;

/** The overview as a plate for the card overlay; `fit` is the box it must fit in (CSS px). */
export function mapPlate(s: State, fit: { width: number; height: number }, onClose: () => void) {
  const w = width(s.tiles);
  const h = s.tiles.length;
  const cell = Math.max(MIN_CELL, Math.min(MAX_CELL, Math.floor(Math.min(fit.width / w, fit.height / h))));
  const canvas = el('canvas', 'map__canvas');
  canvas.width = w * cell;
  canvas.height = h * cell;
  const g = canvas.getContext('2d');
  let stairs = false;
  let edges = false;
  if (g) {
    s.tiles.forEach((row, y) => {
      for (let x = 0; x < row.length; x++) {
        if (!s.seen[y * w + x]) continue;
        const c = row[x] ?? '#';
        // False stairs look like stairs to the eye, so they do on the map too.
        const up = c === '>' || c === 'F';
        stairs ||= up;
        // Phase 11f (third playtest): floor light, walls dim, unexplored black; a seen floor tile beside an unseen one is
        // an edge you haven't followed yet (gilt), so a dead-end notch reads differently from a way on.
        const edge = !isWall(c) && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx = 0, dy = 0]) => !s.seen[(y + dy) * w + x + dx] && x + dx >= 0 && x + dx < w);
        edges ||= edge;
        g.fillStyle = up ? PALETTE.ember : isWall(c) ? PALETTE['ink-2'] : edge ? PALETTE.gilt : PALETTE.stone;
        g.fillRect(x * cell, y * cell, cell, cell);
      }
    });
    g.fillStyle = PALETTE.bone;
    g.fillRect(s.pos.x * cell, s.pos.y * cell, cell, cell);
  }
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', `Map of the tiles you have seen. You are marked in white${stairs ? '; the stairs in orange' : '; no stairs seen yet'}${edges ? '; unexplored edges in gold' : ''}.`);
  const close = button('Close', 'map__close');
  close.addEventListener('click', onClose);
  return el('div', 'plate map', el('h2', 'map__title', 'Map'), el('p', 'map__key muted', `You: white · ${stairs ? 'stairs: orange' : 'no stairs seen yet'}${edges ? ' · gold: not explored past here' : ''}`), canvas, close);
}
