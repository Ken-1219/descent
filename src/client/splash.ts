/// <reference types="vite/client" />
// The feed card: floor number, Descend, played state. No Phaser and no sim: one request, a few DOM writes (§15.3).
import { context, navigateTo, requestExpandedMode, showLoginPrompt } from '@devvit/web/client';
import { api } from './net';

const $ = (id: string) => {
  const node = document.getElementById(id);
  if (!node) throw new Error(`splash.html is missing #${id}`);
  return node;
};
const floor = $('floor');
const line = $('line');
const go = $('go');
if (!(go instanceof HTMLButtonElement)) throw new Error('#go must be a button');

// The post knows its floor, so the number shows before any request returns.
const depth = context?.postData?.depth;
if (typeof depth === 'number') floor.textContent = `Floor ${depth}`;

const expand = (e: MouseEvent) => (import.meta.env.DEV ? location.assign(`game.html${location.search}`) : requestExpandedMode(e, 'game'));
let onGo: (e: MouseEvent) => void = expand;
go.addEventListener('click', (e) => onGo(e));

const set = (floorText: string | null, text: string, label: string, act: (e: MouseEvent) => void = expand) => {
  if (floorText) floor.textContent = floorText;
  line.textContent = text;
  go.textContent = label;
  go.disabled = false;
  onGo = act;
};

void api.floor().then(
  (r) => {
    if (r.kind === 'play') set(`Floor ${r.depth}`, r.ghosts.fell ? `${r.ghosts.fell} fell here today.` : "Today's deaths build tomorrow's floor.", 'Descend');
    else if (r.kind === 'played') set(`Floor ${r.depth}`, `${r.run.outcome === 'won' ? 'Cleared' : 'Fell'} · score ${r.run.score} · ${r.ghosts.fell} fell`, 'See your run');
    else if (r.kind === 'closed') set(`Floor ${r.depth}`, `Closed. Today is Floor ${r.today}.`, "Today's floor", () => r.todayUrl && (import.meta.env.DEV ? location.assign(r.todayUrl) : navigateTo(r.todayUrl)));
    else if (r.kind === 'login') set(`Floor ${r.depth}`, 'One run a day, under your name.', 'Log in to descend', () => showLoginPrompt());
    else set('Floor 0', 'No floor yet. Practice first.', 'Practice');
  },
  () => set(null, "Can't reach the dungeon.", 'Descend anyway'),
);
performance.mark('descent:splash');
