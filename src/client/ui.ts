import { iconCanvas } from './sprites';

type Kids = (Node | string)[];

export const el = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls = '',
  ...kids: Kids
): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  node.append(...kids);
  return node;
};

export const button = (label: Node | string, cls = ''): HTMLButtonElement => {
  const b = el('button', `btn ${cls}`.trim(), label);
  b.type = 'button';
  return b;
};

export const plate = (...kids: Kids) => el('div', 'plate', ...kids);

export const hearts = (n: number, max: number) => {
  const box = el('div', 'hearts');
  box.setAttribute('role', 'img');
  box.setAttribute('aria-label', `Hearts ${n} of ${max}`);
  for (let i = 0; i < max; i++) box.append(iconCanvas(i < n ? 'heart' : 'heart-lost', 2));
  return box;
};

// The wick burns right to left: unburned cord, then the flame, then ash.
export const wick = (left: number, max: number, low = false) => {
  const cord = el('div', 'wick__left');
  cord.style.width = `${Math.round((left / max) * 100)}%`;
  const track = el('div', 'wick__track', cord, iconCanvas('flame', 2), el('div', 'wick__ash'));
  const box = el('div', `wick${low ? ' wick--low' : ''}`, track, el('span', 'wick__count', String(left)));
  box.setAttribute('role', 'img');
  box.setAttribute('aria-label', `Torch ${left} of ${max}`);
  return box;
};

export const slot = (label: string, icon?: HTMLCanvasElement) => {
  const box = el('div', `slot${icon ? ' slot--full' : ''}`, ...(icon ? [icon] : []));
  box.setAttribute('role', 'img');
  box.setAttribute('aria-label', label);
  return box;
};

const pad = (act: string, label: string, icon: Node | string) => {
  const b = button(icon);
  b.dataset.act = act;
  b.setAttribute('aria-label', label);
  return b;
};

export const dpad = () =>
  el(
    'nav',
    'dpad',
    pad('U', 'Up', iconCanvas('arrow-up', 2)),
    pad('L', 'Left', iconCanvas('arrow-left', 2)),
    pad('W', 'Wait', 'Wait'),
    pad('R', 'Right', iconCanvas('arrow-left', 2, { flipX: true })),
    pad('D', 'Down', iconCanvas('arrow-up', 2, { flipY: true }))
  );

export type GhostCard = { name: string; carving: string; deaths: number; trust: number; liar: number; canVote: boolean };

export const ghostCard = (g: GhostCard) => {
  const stat = (k: string, v: number) => el('div', '', el('dt', '', k), el('dd', '', String(v)));
  const trust = button('Trust');
  const liar = button('Liar');
  trust.disabled = liar.disabled = !g.canVote;
  return el(
    'article',
    'plate ghost-card',
    el('div', 'ghost-card__avatar', iconCanvas('wisp', 4)),
    el(
      'div',
      '',
      el('div', 'ghost-card__name', `u/${g.name}`),
      el('p', 'ghost-card__carving', g.carving),
      el('dl', 'ghost-card__record', stat('Deaths', g.deaths), stat('Trusted', g.trust), stat('Liar', g.liar))
    ),
    el('div', 'ghost-card__votes', trust, liar)
  );
};
