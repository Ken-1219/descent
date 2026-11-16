// A floor at a glance, drawn from its rows on a 2D canvas: no sprites, no Phaser, no sim, so the splash can use it within
// its budget. Walls and floor in ink, the dead as wisp dots, yours in ember.
import { PALETTE } from '../shared/content';

export type MiniGhost = { x: number; y: number; mine?: boolean };

/** `px` canvas pixels per tile; CSS scales the canvas by whole multiples (image-rendering: pixelated). */
export function miniMap(rows: readonly string[], ghosts: readonly MiniGhost[], px = 3): HTMLCanvasElement {
  const c = document.createElement('canvas');
  const w = rows[0]?.length ?? 0;
  c.width = w * px;
  c.height = rows.length * px;
  c.className = 'minimap';
  c.setAttribute('role', 'img');
  const mine = ghosts.find((g) => g.mine);
  c.setAttribute('aria-label', `Map of the floor: ${ghosts.length} ghost tiles${mine ? ', your ghost in ember' : ''}`);
  const ctx = c.getContext('2d');
  if (!ctx) return c;
  rows.forEach((row, y) =>
    [...row].forEach((ch, x) => {
      ctx.fillStyle = '#TSsZz'.includes(ch) ? PALETTE['ink-2'] : PALETTE.stone;
      ctx.fillRect(x * px, y * px, px, px);
    }),
  );
  for (const g of ghosts) {
    ctx.fillStyle = g.mine ? PALETTE.ember : PALETTE.wisp;
    ctx.fillRect(g.x * px, g.y * px, px, px);
  }
  return c;
}
