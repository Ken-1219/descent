// The one Phaser scene. It draws `State` and plays the events `step()` returns; it decides no rule.
import * as Phaser from 'phaser';
import { PALETTE, TILE, type Token } from '../shared/content';
import { lightRadius, visibility, type Event, type State } from '../shared/sim';
import {
  ANIMS, PACK, buildAtlas, links, choreograph, enemyLook, frameAt, HURT, loadPack, marks, px, py, rgba, RUN, shine, tileLook,
  type Anim, type Frame, type Key, type Light, type Streak,
} from './sprites';

// Look (§15.4). Visual only; game tuning lives in content.ts.
const SHAKE_MS = 120;
const SHAKE_PX = 2;
const KILL_MS = 84;
const REMEMBERED_ALPHA = 0.7;
const GLOW_DARK = 0.5;
const TORCH_GLOW_TILES = 2.5;
const BRAZIER_GLOW_TILES = 3;

const color = (t: Token) => parseInt(PALETTE[t].slice(1), 16);
const total = (a: Anim) => a.ms.reduce((s, m) => s + m, 0);
const isWall = (c: string | undefined) => c !== undefined && '#TSsZz'.includes(c);
// Depth gives §6's draw order: row by row from the top, so whatever stands in front covers what is behind.
const depth = (y: number, layer: number) => (y + 1) * 10 + layer;

type Actor = {
  img: Phaser.GameObjects.Image;
  anim: Anim;
  after: Anim | null;
  /** Played while a motion is running (enemy run cycles). */
  run: Anim | null;
  t0: number;
  phase: number;
  x: number;
  y: number;
  yo: number;
  /** Pose offset in px: the wind-up lean. */
  ox: number;
  oy: number;
  tint: Token | null;
};
type Motion = { actor: Actor; keys: Key[] };

export class DescentScene extends Phaser.Scene {
  readonly ready: Promise<void>;
  private resolveReady: () => void = () => undefined;
  private state: State;
  private hero: Actor | null = null;
  private enemies = new Map<number, Actor>();
  private digits = new Map<number, Phaser.GameObjects.Image>();
  private props = new Map<number, { sig: string; actors: Actor[] }>();
  private markImgs: Phaser.GameObjects.Image[] = [];
  private torches: { img: Phaser.GameObjects.Image; frame: number; until: number }[] = [];
  private motions: Motion[] = [];
  private streaks: Streak[] = [];
  private streakAt = 0;
  private streakGfx: Phaser.GameObjects.Graphics | null = null;
  private linkGfx: Phaser.GameObjects.Graphics | null = null;
  private fog: Phaser.GameObjects.Graphics | null = null;
  private glow: Phaser.Textures.CanvasTexture | null = null;
  private glowAt = '';
  private torchLights: Light[] = [];
  private brazierLights: Light[] = [];
  private endDeath: (() => void) | null = null;
  private reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  /** Screen shakes played so far (read by the dev hook to check reduced motion). */
  shakes = 0;

  constructor(state: State) {
    super('descent');
    this.state = state;
    this.ready = new Promise((resolve) => (this.resolveReady = resolve));
  }

  create() {
    void this.setup();
  }

  private async setup() {
    const pack = await loadPack();
    const packTex = this.textures.addCanvas('pack', pack);
    for (const [name, [x, y, w, h]] of Object.entries(PACK)) packTex?.add(name, 0, x, y, w, h);
    const atlas = buildAtlas();
    const ownTex = this.textures.addCanvas('own', atlas.canvas);
    for (const [name, f] of Object.entries(atlas.frames)) ownTex?.add(name, 0, f.x, f.y, TILE, TILE * 2);
    this.build(this.state);
    this.scale.on('resize', () => this.frame());
    this.resolveReady();
  }

  /** Rebuilds the whole floor from state (start and restart). */
  reset(state: State) {
    this.state = state;
    this.endDeath = null;
    this.build(state);
  }

  private actor(x: number, y: number, layer: number, anim: Anim): Actor {
    const img = this.add.image(px(x), py(y), 'own', 'hero@lit').setOrigin(0.5, 1).setDepth(depth(y, layer));
    return { img, anim, after: null, run: null, t0: this.time.now, phase: Math.floor(Math.random() * 1000), x: px(x), y: py(y), yo: 0, ox: 0, oy: 0, tint: null };
  }

  private image(f: Frame, x: number, y: number, d: number) {
    return this.add.image(px(x), py(y), f.src === 'own' ? 'own' : 'pack', f.src === 'own' ? `${f.name}@lit` : f.name).setOrigin(0.5, 1).setDepth(d);
  }

  private build(state: State) {
    this.children.removeAll(true);
    this.enemies.clear();
    this.digits.clear();
    this.props.clear();
    this.markImgs = [];
    this.motions = [];
    this.streaks = [];
    this.torches = [];
    this.torchLights = [];
    const w = state.tiles[0]?.length ?? 0;
    state.tiles.forEach((row, y) =>
      [...row].forEach((c, x) => {
        if (isWall(c)) {
          // Every wall gets the full brick face: the pack's wall-top cap is mostly transparent and would show the void.
          this.add.image(px(x), py(y), 'pack', 'wall').setOrigin(0.5, 1).setDepth(depth(y, 1));
          if (c === 'T') {
            this.torches.push({ img: this.add.image(px(x), py(y), 'own', 'torch-0@lit').setOrigin(0.5, 1).setDepth(depth(y, 2)), frame: 0, until: 0 });
            this.torchLights.push({ x: px(x), y: py(y) - TILE / 2, r: TORCH_GLOW_TILES * TILE, tint: 'ember' });
          }
          return;
        }
        this.add.image(px(x), py(y), 'pack', 'floor').setOrigin(0.5, 1).setDepth(0);
      }),
    );
    this.hero = this.actor(state.pos.x, state.pos.y, 5, ANIMS['hero-idle']);
    this.streakGfx = this.add.graphics().setDepth(1998);
    this.linkGfx = this.add.graphics().setDepth(1997);
    this.fog = this.add.graphics().setDepth(2000);
    if (this.textures.exists('glow')) this.textures.remove('glow');
    this.glow = this.textures.createCanvas('glow', w * TILE, state.tiles.length * TILE);
    this.add.image(0, 0, 'glow').setOrigin(0, 0).setDepth(1999); // under the fog: light never shows what you can't see
    this.glowAt = '';
    this.frame();
    this.cameras.main.startFollow(this.hero.img, true);
    this.sync(state);
  }

  /** Camera bounds: the map, or the view centred on the map when the map is the smaller of the two. */
  private frame() {
    const cam = this.cameras.main;
    const { width: vw, height: vh } = this.scale;
    const mw = (this.state.tiles[0]?.length ?? 0) * TILE;
    const mh = this.state.tiles.length * TILE;
    cam.setBounds(Math.min(0, (mw - vw) / 2), Math.min(0, (mh - vh) / 2), Math.max(mw, vw), Math.max(mh, vh));
  }

  /** Props whose tile changed are rebuilt (pits open, gates slam, spikes breathe); unchanged ones keep animating. */
  private syncProps(state: State) {
    const w = state.tiles[0]?.length ?? 0;
    state.tiles.forEach((row, y) => {
      for (let x = 0; x < row.length; x++) {
        const i = y * w + x;
        const look = tileLook(state, x, y);
        const sig = look.map((p) => p.anim.frames.map((f) => f.name).join('+')).join('|');
        if (this.props.get(i)?.sig === sig) continue;
        for (const a of this.props.get(i)?.actors ?? []) a.img.destroy();
        this.props.set(i, {
          sig,
          actors: look.map((p, k) => {
            const a = this.actor(x, y, 2 + k, p.anim);
            if (p.flat) a.img.setDepth(1 + k / 10);
            return a;
          }),
        });
      }
    });
    // A lit brazier is a light source like a wall torch.
    this.brazierLights = state.tiles.flatMap((row, y) =>
      [...row].flatMap((c, x) => (c === 'y' ? [{ x: px(x), y: py(y) - TILE / 2, r: BRAZIER_GLOW_TILES * TILE, tint: 'ember' as const }] : [])),
    );
  }

  /** Fog, props, enemy poses and tell marks from the new state. Fog is per tile; the glow is drawn above and decides nothing. */
  private sync(state: State) {
    this.state = state;
    this.syncProps(state);
    const vis = visibility(state);
    const w = state.tiles[0]?.length ?? 0;
    const fog = this.fog;
    if (fog) {
      fog.clear();
      vis.forEach((v, i) => {
        if (v === 2) return;
        fog.fillStyle(color('ink-0'), v === 0 ? 1 : REMEMBERED_ALPHA);
        fog.fillRect((i % w) * TILE, Math.floor(i / w) * TILE, TILE, TILE);
      });
    }
    for (const e of state.enemies) {
      let a = this.enemies.get(e.id);
      if (!a) {
        a = this.actor(e.x, e.y, 5, enemyLook(e).anim);
        this.enemies.set(e.id, a);
      }
      const look = enemyLook(e);
      if (a.anim !== look.anim && !a.after) a.anim = look.anim;
      a.run = RUN[e.kind];
      a.ox = look.dx;
      a.oy = look.dy;
      a.img.setVisible(vis[e.y * w + e.x] === 2);
      // A pile is floor (rule 6): it lies under whoever stands on it.
      a.img.setDepth(depth(e.y, e.mode === 'pile' ? 3 : 5));
      if (e.mode !== 'pile' && e.x !== state.pos.x) a.img.setFlipX(state.pos.x < e.x);
      this.digits.get(e.id)?.destroy();
      this.digits.delete(e.id);
      if (look.digit) this.digits.set(e.id, this.image({ src: 'own', name: look.digit }, e.x, e.y, depth(e.y, 7)).setVisible(vis[e.y * w + e.x] === 2));
    }
    const lg = this.linkGfx;
    if (lg) {
      lg.clear().fillStyle(color('bone'), 1);
      for (const dots of links(state)) for (const d of dots) lg.fillRect(d.x, d.y, 1, 1);
    }
    for (const img of this.markImgs) img.destroy();
    this.markImgs = marks(state).map((m) => this.image(m.frame, m.x, m.y, depth(m.y, 6)));
    if (this.hero) this.hero.tint = state.torch <= 0 && !state.ended ? 'stone' : null;
  }

  /** Plays one turn's events; resolves when the turn's animation lock (≤ 120 ms) ends, or when death finishes. */
  play(events: readonly Event[], next: State, instant: boolean): Promise<void> {
    const now = this.time.now;
    const hero = this.hero;
    if (!hero) return Promise.resolve();
    const turn = choreograph(events, next);
    for (const m of turn.motions) {
      const actor = m.who === 'hero' ? hero : this.enemies.get(m.who);
      if (!actor) continue;
      const keys = m.keys.map((k) => ({ ...k, at: now + k.at }));
      this.motions.push({ actor, keys });
      const first = m.keys[0], last = m.keys.at(-1);
      if (first && last) {
        actor.img.setDepth(depth(Math.round(last.y / TILE) - 1, 5));
        if (last.x !== actor.x) actor.img.setFlipX(last.x < actor.x);
      }
    }
    this.streaks = turn.streaks;
    this.streakAt = now;
    let died = false;
    for (const e of events) {
      if (e.t === 'kill' || e.t === 'collapse') {
        const a = this.enemies.get(e.id);
        const kind = this.state.enemies.find((o) => o.id === e.id)?.kind ?? next.enemies.find((o) => o.id === e.id)?.kind;
        if (a && kind) {
          a.anim = HURT[kind];
          a.t0 = now;
          if (e.t === 'kill') {
            this.time.delayedCall(instant ? 0 : KILL_MS, () => a.img.destroy());
            this.enemies.delete(e.id);
            this.digits.get(e.id)?.destroy();
            this.digits.delete(e.id);
          } else {
            const pile = next.enemies.find((o) => o.id === e.id);
            if (pile) a.after = enemyLook(pile).anim;
          }
        }
      } else if (e.t === 'hurt') {
        hero.anim = ANIMS['hero-hurt'];
        hero.after = ANIMS['hero-idle'];
        hero.t0 = now;
        if (!this.reduced && !instant) {
          this.cameras.main.shake(SHAKE_MS, SHAKE_PX / this.cameras.main.width);
          this.shakes++;
        }
      } else if (e.t === 'dead') died = true;
    }
    this.sync(next);
    if (instant) this.settle();
    if (died) return this.die(instant);
    return instant || turn.lock === 0 ? Promise.resolve() : new Promise((r) => this.time.delayedCall(turn.lock, r));
  }

  private die(instant: boolean): Promise<void> {
    const hero = this.hero;
    if (!hero) return Promise.resolve();
    const death = ANIMS['hero-death'];
    hero.anim = death;
    hero.after = null;
    hero.tint = null;
    hero.t0 = instant ? this.time.now - total(death) : this.time.now;
    if (instant) return Promise.resolve();
    return new Promise((resolve) => {
      const done = () => {
        hero.t0 = this.time.now - total(death);
        this.endDeath = null;
        resolve();
      };
      this.endDeath = done;
      this.time.delayedCall(total(death), () => this.endDeath?.());
    });
  }

  /** Any input during the death animation jumps straight to its end. */
  skip() {
    this.endDeath?.();
  }

  private settle() {
    for (const m of this.motions) {
      const last = m.keys[m.keys.length - 1];
      if (last) Object.assign(m.actor, { x: last.x, y: last.y, yo: 0 });
    }
    this.motions = [];
    this.streaks = [];
  }

  override update(time: number) {
    const moving = new Set<Actor>();
    this.motions = this.motions.filter((m) => {
      const key = [...m.keys].reverse().find((k) => k.at <= time);
      if (key) Object.assign(m.actor, { x: key.x, y: key.y, yo: key.yo });
      const live = time < (m.keys[m.keys.length - 1]?.at ?? 0) + 1;
      if (live) moving.add(m.actor);
      return live;
    });
    const actors = [this.hero, ...this.enemies.values(), ...[...this.props.values()].flatMap((p) => p.actors)];
    for (const a of actors) if (a) this.show(a, time, moving.has(a));
    for (const [id, img] of this.digits) {
      const a = this.enemies.get(id);
      if (a) img.setPosition(a.x, a.y);
    }
    for (const t of this.torches) {
      // The flame never loops: shuffled frames, holds of 84–140 ms (cosmetic randomness, client only).
      if (time >= t.until) {
        t.frame = (t.frame + 1 + Math.floor(Math.random() * 2)) % 3;
        t.until = time + 84 + Math.floor(Math.random() * 57);
        t.img.setFrame(`torch-${t.frame}@lit`);
      }
    }
    this.drawStreaks(time);
    this.drawGlow();
  }

  /** A dart or arrow: a 1 px bone streak whose head flies from the slit or bow to where it stops. */
  private drawStreaks(time: number) {
    const g = this.streakGfx;
    if (!g) return;
    g.clear();
    for (const s of this.streaks) {
      const t = time - this.streakAt;
      if (t < s.at || t > s.until) continue;
      const f = Math.min(1, (t - s.at) / ((s.until - s.at) * 0.6));
      const hx = px(s.from.x) + (px(s.to.x) - px(s.from.x)) * f;
      const hy = py(s.from.y) - TILE / 2 + (py(s.to.y) - py(s.from.y)) * f;
      g.lineStyle(1, color('bone'), 1);
      g.lineBetween(px(s.from.x), py(s.from.y) - TILE / 2, Math.round(hx), Math.round(hy));
    }
  }

  private show(a: Actor, now: number, moving: boolean) {
    const anim = moving && a.run ? a.run : a.anim;
    const elapsed = now - a.t0 + (anim.loop ? a.phase : 0);
    if (!a.anim.loop && a.after && elapsed >= total(a.anim)) {
      a.anim = a.after;
      a.after = null;
      a.t0 = now;
    }
    const f = anim.frames[frameAt(anim, elapsed)];
    if (!f) return;
    a.img.setTexture(f.src === 'own' ? 'own' : 'pack', f.src === 'own' ? `${f.name}@lit` : f.name);
    a.img.setPosition(a.x + (moving ? 0 : a.ox), a.y + a.yo + (f.dy ?? 0) + (moving ? 0 : a.oy));
    const tint = f.tint ?? a.tint;
    if (tint) a.img.setTint(color(tint)).setTintMode(f.tint ? Phaser.TintModes.FILL : Phaser.TintModes.MULTIPLY);
    else a.img.clearTint();
  }

  private drawGlow() {
    const hero = this.hero;
    const glow = this.glow;
    if (!hero || !glow) return;
    const r = lightRadius(this.state);
    const at = `${hero.x},${hero.y},${r},${this.brazierLights.length}`;
    if (at === this.glowAt) return;
    this.glowAt = at;
    const ctx = glow.getContext();
    ctx.clearRect(0, 0, glow.width, glow.height);
    const lights = [...this.torchLights, ...this.brazierLights, { x: hero.x, y: hero.y - TILE / 2, r: (r + 0.5) * TILE, tint: 'ember' as const }];
    shine(ctx, glow.width, glow.height, lights, GLOW_DARK);
    // Warm wash over the scene: the glow layer has nothing beneath it to soft-light, so tint directly.
    for (const l of lights) {
      const g = ctx.createRadialGradient(l.x, l.y, 0, l.x, l.y, l.r);
      g.addColorStop(0, rgba(l.tint, 0.14));
      g.addColorStop(1, rgba(l.tint, 0));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, glow.width, glow.height);
    }
    glow.refresh();
  }
}
