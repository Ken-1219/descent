import { CARVINGS, CURSE_TEXT, NAMELESS, TRAP_TEXT, ZONE_NAMES, type CarvingKind, type Curse, type Item } from '../shared/content';
import { CARVING_CHOICES, carvingLabel, carvingOf, type Ghost, type Vote } from '../shared/ghosts';
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
  /** Trust/Liar. `totals` and `mine` only reach a player whose run has ended; `note` replaces the buttons until then. */
  votes?: { canVote: boolean; totals?: { trust: number; liar: number }; mine?: Vote; onVote?: (v: Vote) => void; note?: string };
  onClose?: () => void;
};

export const ghostCard = (g: GhostCard) => {
  const stat = (k: string, v: number) => el('div', '', el('dt', '', k), el('dd', '', String(v)));
  const actions = el('div', 'ghost-card__votes');
  const v = g.votes;
  if (v?.note) actions.append(el('p', 'ghost-card__note muted', v.note));
  else if (v) {
    const make = (vote: Vote, label: string) => {
      const b = button(v.totals ? `${label} ${v.totals[vote]}` : label);
      b.setAttribute('aria-pressed', String(v.mine === vote));
      b.disabled = !v.canVote || !!v.mine;
      b.addEventListener('click', () => v.onVote?.(vote));
      return b;
    };
    actions.append(make('trust', 'Trust'), make('liar', 'Liar'));
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

/** `curse`: the floor's curse name (the crowd's vote), shown as a chip after the floor number. */
/** `chain`: on the Warden's floor, the links left on its shared chain (its HP less what this run broke); else null. */
export type HudView = { hearts: number; hasKey: boolean; item: Item | null; torch: number; torchMax: number; depth: number; curse: string | null; chain: number | null };
const ITEM_NAME: Record<Item, string> = { potion: 'potion', oil: 'lamp oil', bomb: 'bomb' };

/** Builds the HUD once; `update` replaces only the pieces whose value changed. */
export const createHud = (root: HTMLElement, lowPct: number, maxHearts: number, itemIcon: (item: Item) => HTMLCanvasElement | undefined) => {
  let last: HudView | null = null;
  const floor = el('span', 'hud__floor');
  const parts = { hearts: el('span'), key: el('span'), item: el('span'), wick: el('span', 'hud__wick') };
  root.replaceChildren(floor, parts.hearts, parts.key, parts.item, parts.wick);
  parts.item.replaceChildren(slot('Item slot empty'));
  return (v: HudView) => {
    // A cursed floor: the number turns blood with a blood mark after it (a shape too, not colour alone); the name is in
    // the label here, and spelled out by the yesterday line and the plates (no room for it in a 320 px HUD).
    if (v.depth !== last?.depth || v.curse !== last?.curse) {
      floor.textContent = String(v.depth);
      floor.toggleAttribute('data-cursed', !!v.curse);
      floor.title = v.curse ? `Cursed: ${v.curse}` : '';
      floor.setAttribute('aria-label', v.curse ? `Floor ${v.depth}, curse: ${v.curse}` : `Floor ${v.depth}`);
    }
    if (v.hearts !== last?.hearts) parts.hearts.replaceChildren(hearts(v.hearts, maxHearts));
    // The key never appears on a Warden floor, so its slot shows the chain there.
    if (v.chain !== null && v.chain !== last?.chain) {
      const box = slot(`Warden chain: ${v.chain} links left`, iconCanvas('chain', 2));
      box.append(el('span', 'hud__links', String(v.chain)));
      parts.key.replaceChildren(box);
    }
    else if (v.chain === null && (v.hasKey !== last?.hasKey || last?.chain !== null)) parts.key.replaceChildren(v.hasKey ? slot('Key held', iconCanvas('key', 2)) : slot('No key'));
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

/** The curse vote: one select, each curse with its one-line effect (select, then Vote). */
export const cursePicker = (onChange: (c: Curse | null) => void) => {
  const select = el('select', 'picker');
  select.setAttribute('aria-label', 'Curse for tomorrow');
  const none = el('option', '', 'Choose a curse');
  none.value = '';
  select.append(none);
  for (const [id, t] of Object.entries(CURSE_TEXT)) {
    const o = el('option', '', `${t.name}: ${t.effect}`);
    o.value = id;
    select.append(o);
  }
  select.addEventListener('change', () => {
    const c = Object.keys(CURSE_TEXT).find((k): k is Curse => k === select.value);
    onChange(c ?? null);
  });
  return select;
};

/** The trap picker: a 3×3 compass of zones (spatial, so a grid) and a select for the kind (select, then Set trap). */
export const trapPicker = (onChange: (zone: number | null, kind: keyof typeof TRAP_TEXT | null) => void) => {
  let zone: number | null = null;
  let kind: keyof typeof TRAP_TEXT | null = null;
  const grid = el('div', 'compass-pick');
  grid.setAttribute('role', 'group');
  grid.setAttribute('aria-label', 'Zone');
  const cells = ZONE_NAMES.map((name, z) => {
    const b = button(['NW', 'N', 'NE', 'W', 'C', 'E', 'SW', 'S', 'SE'][z] ?? '');
    b.setAttribute('aria-label', name);
    b.setAttribute('aria-pressed', 'false');
    b.addEventListener('click', () => {
      zone = z;
      for (const c of cells) c.setAttribute('aria-pressed', String(c === b));
      onChange(zone, kind);
    });
    return b;
  });
  grid.append(...cells);
  const select = el('select', 'picker');
  select.setAttribute('aria-label', 'Trap');
  const none = el('option', '', 'Choose a trap');
  none.value = '';
  select.append(none);
  for (const [id, label] of Object.entries(TRAP_TEXT)) {
    const o = el('option', '', label);
    o.value = id;
    select.append(o);
  }
  select.addEventListener('change', () => {
    kind = Object.keys(TRAP_TEXT).find((k): k is keyof typeof TRAP_TEXT => k === select.value) ?? null;
    onChange(zone, kind);
  });
  return el('div', 'trap-pick', grid, select);
};

/** Carved ghosts on this floor as rows; a row opens the ghost card (Trust/Liar live there). */
export const carvingsList = (ghosts: readonly Ghost[], open: (g: Ghost) => void) => {
  const list = el('ul', 'carvings');
  for (const g of ghosts) {
    if (!g.carving) continue;
    const row = button(el('span', '', `${g.name ? `u/${g.name}` : NAMELESS}: ${carvingLabel(g.carving)}`), 'carvings__row');
    if (g.votes) row.append(el('span', 'muted', `${g.votes.trust} trust · ${g.votes.liar} liar`));
    row.addEventListener('click', () => open(g));
    list.append(el('li', '', row));
  }
  return list;
};

/**
 * The intro's compass: per zone, yesterday's deaths (☠) and today's danger counted from the stored floor (▲), so where
 * the crowd died and where the hazards actually went read side by side. The heaviest of each is marked by shape too.
 */
export const introCompass = (deaths: readonly number[] | null, danger: readonly number[]) => {
  const most = (xs: readonly number[]) => (Math.max(...xs) > 0 ? xs.indexOf(Math.max(...xs)) : -1);
  const dz = deaths ? most(deaths) : -1;
  const hz = most(danger);
  const grid = el('div', 'intro-compass');
  grid.setAttribute('role', 'img');
  grid.setAttribute('aria-label', `Compass. ${ZONE_NAMES.map((z, i) => `${z}: ${deaths ? `${deaths[i] ?? 0} fell, ` : ''}danger ${danger[i] ?? 0}`).join('. ')}`);
  ZONE_NAMES.forEach((_, i) => {
    const cell = el('div', 'intro-compass__cell', ...(deaths ? [el('span', 'intro-compass__dead', `☠ ${deaths[i] ?? 0}`)] : []), el('span', 'intro-compass__danger', `▲ ${danger[i] ?? 0}`));
    if (i === dz) cell.dataset.deadliest = '';
    if (i === hz) cell.dataset.danger = '';
    grid.append(cell);
  });
  return grid;
};

/** The Warden's chain as a meter: links left of the pool (a shape and a number, not colour alone). */
export const chainMeter = (hp: number, pool: number) => {
  const m = el('div', 'chain-meter', el('span', 'chain-meter__fill'), el('span', 'chain-meter__text', `${hp} of ${pool} links`));
  m.setAttribute('role', 'meter');
  m.setAttribute('aria-valuemin', '0');
  m.setAttribute('aria-valuemax', String(pool));
  m.setAttribute('aria-valuenow', String(hp));
  m.setAttribute('aria-label', `Warden chain: ${hp} of ${pool} links`);
  m.style.setProperty('--left', `${pool ? Math.round((100 * hp) / pool) : 0}%`);
  return m;
};
