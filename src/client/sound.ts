// Phase 11 (A63): every sound is made here in code (WebAudio oscillators and a noise burst): no files, nothing to license.
// Silent until the first tap or key in the game (the splash never imports this), a mute that is remembered, and each sound
// only ever doubles something already on screen.
import type { Event } from '../shared/sim';

type Tone = { f: number; to?: number; ms: number; at?: number; type?: OscillatorType; gain?: number; noise?: true };
// Short and low by default: a step is a tick, not a note. Pitches fall for harm, rise for good news.
const SOUNDS = {
  step: [{ f: 190, to: 150, ms: 35, type: 'triangle', gain: 0.04 }],
  bump: [{ f: 85, ms: 50, type: 'square', gain: 0.04 }],
  link: [{ f: 540, to: 360, ms: 80, type: 'square', gain: 0.05 }, { f: 1080, ms: 40, at: 30, type: 'triangle', gain: 0.03 }],
  hurt: [{ f: 0, ms: 90, noise: true, gain: 0.12 }, { f: 170, to: 70, ms: 150, type: 'sawtooth', gain: 0.07 }],
  windup: [{ f: 120, to: 160, ms: 90, type: 'square', gain: 0.03 }],
  pickup: [{ f: 660, ms: 50, type: 'triangle', gain: 0.05 }, { f: 990, ms: 80, at: 50, type: 'triangle', gain: 0.05 }],
  door: [{ f: 140, to: 100, ms: 110, type: 'square', gain: 0.04 }],
  kill: [{ f: 0, ms: 60, noise: true, gain: 0.06 }, { f: 300, to: 120, ms: 90, type: 'triangle', gain: 0.05 }],
  dead: [{ f: 220, to: 55, ms: 600, type: 'sawtooth', gain: 0.07 }, { f: 0, ms: 200, at: 600, noise: true, gain: 0.02 }],
  won: [{ f: 392, ms: 90, type: 'triangle', gain: 0.05 }, { f: 523, ms: 90, at: 90, type: 'triangle', gain: 0.05 }, { f: 784, ms: 220, at: 180, type: 'triangle', gain: 0.05 }],
} satisfies Record<string, Tone[]>;
type Sound = keyof typeof SOUNDS;

/** The one sound a turn makes: the most important thing that happened (death over harm over news over a step). */
const ORDER: [Event['t'], Sound][] = [['dead', 'dead'], ['won', 'won'], ['hurt', 'hurt'], ['link', 'link'], ['kill', 'kill'], ['pickup', 'pickup'], ['key', 'pickup'], ['door', 'door'], ['gate', 'door'], ['windup', 'windup'], ['blocked', 'bump'], ['move', 'step']];

const KEY = 'descent:muted';
let ctx: AudioContext | null = null;
let muted = (() => { try { return localStorage.getItem(KEY) === '1'; } catch { return false; } })();

function tone(c: AudioContext, t: Tone) {
  const start = c.currentTime + (t.at ?? 0) / 1000;
  const end = start + t.ms / 1000;
  const g = c.createGain();
  g.gain.setValueAtTime(t.gain ?? 0.05, start);
  g.gain.exponentialRampToValueAtTime(0.0001, end); // a pluck: loud start, quick decay, no click at the end
  g.connect(c.destination);
  if (t.noise) {
    const buf = c.createBuffer(1, Math.ceil(c.sampleRate * t.ms / 1000), c.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1; // cosmetic randomness, client only
    const src = c.createBufferSource();
    src.buffer = buf;
    src.connect(g);
    src.start(start);
    return;
  }
  const o = c.createOscillator();
  o.type = t.type ?? 'square';
  o.frequency.setValueAtTime(t.f, start);
  if (t.to) o.frequency.exponentialRampToValueAtTime(t.to, end);
  o.connect(g);
  o.start(start);
  o.stop(end);
}

export const sound = {
  /** Called on the first tap or key in the game: browsers only start audio from a gesture. */
  unlock() {
    if (ctx || muted) return;
    try { ctx = new AudioContext(); } catch { ctx = null; } // no audio device: the game plays on, silently
  },
  /** Plays the turn's one sound (if audio is on) and returns which it was, for the dev hook. */
  play(events: readonly Event[]): Sound | null {
    const hit = ORDER.find(([t]) => events.some((e) => e.t === t))?.[1] ?? null;
    if (ctx && !muted && hit) for (const t of SOUNDS[hit]) tone(ctx, t);
    return hit;
  },
  get muted() { return muted; },
  toggle(): boolean {
    muted = !muted;
    try { localStorage.setItem(KEY, muted ? '1' : '0'); } catch { /* private mode: the choice lasts this visit */ }
    if (!muted) sound.unlock();
    return muted;
  },
};
