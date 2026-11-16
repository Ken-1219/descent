import { CARVINGS, NAMELESS, type CarvingKind, type Item } from '../shared/content';
import { CARVING_CHOICES, carvingLabel, carvingOf } from '../shared/ghosts';
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

/**
 * The ghost card: avatar, u/name, carving, cause. `record` and `votes` are 7b's rows (lifetime record, Trust/Liar); the
 * layout keeps their place so adding them needs no redesign. The Lab Kit shows the full card.
 */
export type GhostCard = {
  name: string | null;
  carving: string | null;
  cause?: string;
  avatar?: Node;
  record?: { deaths: number; trust: number; liar: number };
  votes?: { canVote: boolean };
  onClose?: () => void;
};

export const ghostCard = (g: GhostCard) => {
  const stat = (k: string, v: number) => el('div', '', el('dt', '', k), el('dd', '', String(v)));
  const actions = el('div', 'ghost-card__votes');
  if (g.votes) {
    const trust = button('Trust');
    const liar = button('Liar');
    trust.disabled = liar.disabled = !g.votes.canVote;
    actions.append(trust, liar);
  }
  if (g.onClose) {
    const close = button('Close', 'ghost-card__close');
    close.addEventListener('click', g.onClose);
    actions.append(close);
  }
  const card = el(
    'article',
    'plate ghost-card',
    el('div', 'ghost-card__avatar', g.avatar ?? iconCanvas('wisp', 4)),
    el(
      'div',
      'ghost-card__text',
      el('div', 'ghost-card__name', g.name ? `u/${g.name}` : NAMELESS),
      el('p', 'ghost-card__carving', g.carving ?? 'Left no carving.'),
      ...(g.cause ? [el('p', 'ghost-card__cause muted', `Taken by the ${g.cause}.`)] : []),
      ...(g.record ? [el('dl', 'ghost-card__record', stat('Deaths', g.record.deaths), stat('Trusted', g.record.trust), stat('Liar', g.record.liar))] : []),
    ),
    actions,
  );
  card.setAttribute('aria-label', `Ghost of ${g.name ? `u/${g.name}` : NAMELESS}`);
  return card;
};

/** Picker groups: what each kind of phrase does, in words that never hint whether it is true. */
const GROUP: Readonly<Record<CarvingKind, string>> = { warning: 'Warn', path: 'Show the way', treasure: 'Promise' };

/** The carving picker: one native select (compact enough to keep the death tile in view at 320×320). */
export const carvingPicker = (onChange: (raw: string | null) => void) => {
  const select = el('select', 'picker');
  select.setAttribute('aria-label', 'Carving');
  const none = el('option', '', 'Choose a carving');
  none.value = '';
  select.append(none);
  for (const kind of ['warning', 'path', 'treasure'] as const) {
    const group = el('optgroup');
    group.label = GROUP[kind];
    for (const raw of CARVING_CHOICES) {
      if (CARVINGS[raw.split(':')[0] ?? '']?.kind !== kind) continue;
      const o = el('option', '', carvingLabel(raw));
      o.value = raw;
      group.append(o);
    }
    select.append(group);
  }
  select.addEventListener('change', () => onChange(carvingOf(select.value) ? select.value : null));
  return select;
};

export type HudView = { hearts: number; hasKey: boolean; item: Item | null; torch: number; torchMax: number; depth: number };
const ITEM_NAME: Record<Item, string> = { potion: 'potion', oil: 'lamp oil', bomb: 'bomb' };

/** Builds the HUD once; `update` replaces only the pieces whose value changed. */
export const createHud = (root: HTMLElement, lowPct: number, maxHearts: number, itemIcon: (item: Item) => HTMLCanvasElement | undefined) => {
  let last: HudView | null = null;
  const floor = el('span', 'hud__floor');
  const parts = { hearts: el('span'), key: el('span'), item: el('span'), wick: el('span', 'hud__wick') };
  root.replaceChildren(floor, parts.hearts, parts.key, parts.item, parts.wick);
  parts.item.replaceChildren(slot('Item slot empty'));
  return (v: HudView) => {
    if (v.depth !== last?.depth) {
      floor.textContent = String(v.depth);
      floor.setAttribute('aria-label', `Floor ${v.depth}`);
    }
    if (v.hearts !== last?.hearts) parts.hearts.replaceChildren(hearts(v.hearts, maxHearts));
    if (v.hasKey !== last?.hasKey) parts.key.replaceChildren(v.hasKey ? slot('Key held', iconCanvas('key', 2)) : slot('No key'));
    if (v.item !== last?.item) parts.item.replaceChildren(v.item ? slot(`Item: ${ITEM_NAME[v.item]}`, itemIcon(v.item)) : slot('Item slot empty'));
    if (v.torch !== last?.torch) parts.wick.replaceChildren(wick(v.torch, v.torchMax, v.torch * 100 <= v.torchMax * lowPct));
    last = v;
  };
};

/** D-pad on the right thumb, item on the left; key hints replace both on desktop. */
export const controls = (root: HTMLElement) => {
  const item = button('Item', 'item-btn');
  item.dataset.act = 'I';
  item.setAttribute('aria-label', 'Use item');
  root.replaceChildren(item, el('p', 'keyhints', 'Arrows move. Space waits. E uses item.'), dpad());
};

export type PanelAction = { label: string; run: () => void; disabled?: boolean };
/**
 * End overlay and every designed state: headline, one line, optional body (the carving picker), an optional status
 * line, then one primary action and at most one secondary, at the bottom.
 */
export const endPanel = (
  root: HTMLElement,
  p: { title: string; line: string; primary: PanelAction; secondary?: PanelAction; body?: Node[]; status?: Node; clear?: boolean },
) => {
  const make = (a: PanelAction, cls: string) => {
    const b = button(a.label, cls);
    b.disabled = !!a.disabled;
    b.addEventListener('click', a.run);
    return b;
  };
  const primary = make(p.primary, 'btn--primary');
  const actions = el('div', 'end__actions', ...(p.secondary ? [make(p.secondary, '')] : []), primary);
  root.replaceChildren(el('div', 'plate end__panel', el('h1', 'title', p.title), el('p', '', p.line), ...(p.body ?? []), ...(p.status ? [p.status] : []), actions));
  root.classList.toggle('end--clear', !!p.clear); // leaves the map undimmed (the carving picker shows your tile)
  root.hidden = false;
  (p.body?.find((n): n is HTMLElement => n instanceof HTMLSelectElement) ?? primary).focus();
  return primary;
};

/** "Saving", then "Saved" or "Not saved" with a retry (§15.1). `aria-live` so the change is announced. */
export const saveLine = () => {
  const text = el('span');
  const retry = button('Retry', 'save__retry');
  const node = el('p', 'save', text, retry);
  node.setAttribute('aria-live', 'polite');
  return {
    node,
    set: (s: 'saving' | 'saved' | 'failed', again?: () => void) => {
      node.dataset.state = s;
      text.textContent = s === 'saving' ? 'Saving' : s === 'saved' ? 'Saved' : 'Not saved';
      retry.hidden = s !== 'failed' || !again;
      retry.onclick = again ?? null;
    },
  };
};
