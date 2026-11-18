// Phase 11c: Devvit Journeys (developers.reddit.com/docs/capabilities/analytics/devvit-journeys). One journey is one run:
// Start when the player commits (Descend on the intro, or the first move of a resumed run), Progress at the first move and
// at the run's end, Interactions for the choices after it, End once no choice is left. Views are never journeys, and
// nothing is sent after End (an interaction then would silently start a new journey). Calls go out one at a time, so
// Start's journey id exists before anything that needs it. Local dev builds send nothing.
type Telemetry = (typeof import('@devvit/analytics/client/reddit'))['telemetry'];

let client: Promise<Telemetry | null> | null = null;
const telemetry = () => (client ??= import.meta.env.DEV ? Promise.resolve(null) : import('@devvit/analytics/client/reddit').then((m) => m.telemetry, () => null));
let queue: Promise<unknown> = Promise.resolve();
const send = (call: (t: Telemetry) => Promise<unknown>) => {
  queue = queue.then(() => telemetry()).then((t) => (t ? call(t) : null)).catch(() => null); // telemetry never breaks play
};

let open = false;
export const journey = {
  /** App.Ready: the game is loaded and a move is possible. */
  ready: () => send((t) => t.appReady()),
  /** Journey.Start, on a committed action only. Idempotent within a run. */
  start() {
    if (open) return;
    open = true;
    send((t) => t.startJourney());
  },
  /** Journey.Progress: `run_started` (0.1) at the first move, `won` / `fell` (1.0) when the run ends. */
  progress(progress: number, action: 'run_started' | 'won' | 'fell') {
    if (open) send((t) => t.progress({ progress, action }));
  },
  /** Journey.Interaction: a choice made after the run, while its journey is still open. */
  interaction(action: 'carved' | 'voted' | 'trap_set') {
    if (open) send((t) => t.interaction({ action }));
  },
  /** Journey.End: complete means the floor was cleared; the game result rides along. */
  end(win: boolean, score: number) {
    if (!open) return;
    open = false;
    send((t) => t.endJourney({ complete: win, game: { win, score } }));
  },
};
