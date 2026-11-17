// Phase 9: the Board and the Chronicle, opened from the already-played plate. Each loads on demand (never with the floor).
import { CURSE_TEXT, PRIVACY, ZONE_NAMES } from '../shared/content';
import type { BoardRow, BoardRows, ChronicleRow } from '../shared/api';
import { api } from './net';
import { button, el, endPanel, type PanelAction } from './ui';

/** One board: rank, name, value; your row is marked, and shown after a gap when it is outside the top rows. */
const boardList = (b: BoardRows, unit: string) => {
  const row = (r: BoardRow) => {
    const li = el('li', `board__row${r.you ? ' board__row--you' : ''}`, el('span', 'board__rank', `${r.rank}`), el('span', 'board__name', r.you ? `${r.name} (you)` : r.name), el('span', 'board__value', `${r.value} ${unit}`));
    return li;
  };
  const list = el('ol', 'board', ...b.rows.map(row));
  if (!b.rows.length) list.append(el('li', 'board__empty muted', 'Nobody yet.'));
  if (b.me && !b.rows.some((r) => r.you)) list.append(el('li', 'board__gap muted', '…'), row(b.me));
  return list;
};

/** The Chronicle: a ledger, one line per floor. */
const chronicleList = (rows: readonly ChronicleRow[], killerName: (k: string) => string) => {
  const list = el('ol', 'chronicle');
  for (const r of rows) {
    const where = r.zone === null ? '' : `, most in the ${ZONE_NAMES[r.zone]?.toLowerCase()}`;
    const curse = r.curse ? ` · ${CURSE_TEXT[r.curse].name}` : '';
    const killer = r.killer ? ` · ${killerName(r.killer)} took the most` : '';
    list.append(el('li', 'chronicle__row', el('span', 'chronicle__floor', `Floor ${r.depth}`), el('span', '', `${r.fell} fell${where}; ${r.cleared} cleared${curse}${killer}.`)));
  }
  if (!rows.length) list.append(el('li', 'muted', 'The ledger is empty. Floor 1 is still open.'));
  return list;
};

/**
 * Phase 10b (A56): the privacy text (in the game, not a link out), and "Delete my data" behind one confirmation. After a purge the device's saved run
 * logs go too, so nothing is resubmitted, and the page reloads as a newcomer's.
 */
function dataLinks(end: HTMLElement, again: () => void) {
  const page = button('Privacy', 'privacy__open');
  page.addEventListener('click', () =>
    endPanel(end, {
      title: 'Privacy',
      line: 'What Descent stores and why.',
      body: [el('div', 'privacy', ...PRIVACY.blocks.slice(1).map((b) => ('h' in b ? el('h2', '', b.h) : 'p' in b ? el('p', '', b.p) : el('p', '', el('strong', '', b.li[0]), `: ${b.li[1]}`))))],
      primary: { label: 'Back', run: again },
    }),
  );
  const del = button('Delete my data', 'forget__open');
  del.addEventListener('click', () =>
    endPanel(end, {
      title: 'Delete my data?',
      line: 'This deletes everything Descent stores about you: your runs, ghosts, carvings, votes, traps, records and streak. It cannot be undone.',
      primary: {
        label: 'Delete everything',
        run: () =>
          void api.forget().then(
            () => {
              try {
                for (const k of Object.keys(localStorage)) if (k.startsWith('descent:')) localStorage.removeItem(k);
              } catch { /* private mode: nothing was saved */ }
              endPanel(end, { title: 'Deleted', line: 'Descent no longer stores anything about you.', primary: { label: 'Close', run: () => location.reload() } });
            },
            () => endPanel(end, { title: 'Not deleted', line: "Can't reach the dungeon. Nothing was deleted; try again.", primary: { label: 'Back', run: again } }),
          ),
      },
      secondary: { label: 'Keep my data', run: again },
    }),
  );
  return el('div', 'board__data', page, del);
}

/** The board: loaded only now (never with the floor). Today, deepest floor, souls, honour; the two plates. */
export async function boardPanel(end: HTMLElement, depth: number, back: PanelAction) {
  endPanel(end, { title: 'Board', line: 'Reading the ledger…', primary: back });
  const b = await api.board(depth).catch(() => null);
  if (!b) return endPanel(end, { title: 'Board', line: "Can't reach the board. Try again.", primary: back });
  const tabs: [string, string, () => Node][] = [
    ['Today', 'today', () => boardList(b.today, 'pts')],
    ['Deepest', 'deepest', () => boardList(b.deepest, 'floor')],
    ['Souls', 'souls', () => boardList(b.souls, 'souls')],
    ['Honour', 'honour', () => boardList(b.honour, 'honour')],
  ];
  const view = el('div', 'board__view');
  const bar = el('div', 'board__tabs');
  const show = (key: string) => {
    for (const t of bar.children) t.setAttribute('aria-pressed', String(t.getAttribute('data-board') === key));
    view.replaceChildren(tabs.find(([, k]) => k === key)?.[2]() ?? el('p'));
  };
  for (const [label, key] of tabs) {
    const t = button(label);
    t.dataset.board = key;
    t.addEventListener('click', () => show(key));
    bar.append(t);
  }
  show('today');
  const plates = [b.trapsetter && `Top Trapsetter: ${b.trapsetter.name} (${b.trapsetter.value} souls)`, b.liar && `Most Notorious Liar: ${b.liar.name} (${b.liar.value} liar votes)`].filter(Boolean).join(' · ');
  endPanel(end, { title: 'Board', line: plates || `Floor ${depth}: ${b.today.total} on the board today.`, body: [bar, view, dataLinks(end, () => void boardPanel(end, depth, back))], primary: back });
}

export async function chroniclePanel(end: HTMLElement, back: PanelAction, killerName: (k: string) => string) {
  const c = await api.chronicle().catch(() => null);
  endPanel(end, { title: 'Chronicle', line: c ? 'The ledger of the dead, newest first.' : "Can't reach the Chronicle. Try again.", body: c ? [chronicleList(c.rows, killerName)] : [], primary: back });
}
