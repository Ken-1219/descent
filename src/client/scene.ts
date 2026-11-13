// The one Phaser scene. It draws `State` and plays the events `step()` returns; it decides no rule.
import * as Phaser from 'phaser';
import { PALETTE, TILE, type Token } from '../shared/content';
import { lightRadius, visibility, type Event, type Pos, type State } from '../shared/sim';
import { ANIMS, PACK, buildAtlas, floorTile, frameAt, loadPack, rgba, shine, type Anim, type Light } from './sprites';

// Motion and look (§15.4). Visual only; game tuning lives in content.ts.
const HOP_MS = [24, 24, 16, 32];
const HOP_HURT_MS = [24, 16, 16, 60]; // the landing frame becomes the 60 ms hit-stop, keeping the lock under 120 ms
const HOP_Y = [0, -2, -1, 0];
const LUNGE_PX = 4;
const LUNGE_MS = 40;
const NUDGE_MS = 48;
const SHAKE_MS = 120;
const SHAKE_PX = 2;
const KILL_MS = 84;
const REMEMBERED_ALPHA = 0.7;
const GLOW_DARK = 0.5;
const TORCH_GLOW_TILES = 2.5;

const color = (t: Token) => parseInt(PALETTE[t].slice(1), 16);
const total = (a: Anim) => a.ms.reduce((s, m) => s + m, 0);
const isWall = (c: string | undefined) => c === '#' || c === 'T';
// Depth gives §6's draw order: row by row from the top, so whatever stands in front covers what is behind.
const depth = (y: number, layer: number) => (y + 1) * 10 + layer;
const px = (x: number) => x * TILE + TILE / 2;
const py = (y: number) => y * TILE + TILE;

type Actor = {
  img: Phaser.GameObjects.Image;
  anim: Anim;
  after: Anim | null;
  t0: number;
  phase: number;
  x: number;
  y: number;
  yo: number;
  tint: Token | null;
};
type Key = { at: number; x: number; y: number; yo: number };
type Motion = { actor: Actor; keys: Key[] };

export class DescentScene extends Phaser.Scene {
  readonly ready: Promise<void>;
  private resolveReady: () => void = () => undefined;
  private state: State;
  private hero: Actor | null = null;
  private enemies = new Map<number, Actor>();
  private props = new Map<number, Actor>();
  private torches: { img: Phaser.GameObjects.Image; frame: number; until: number }[] = [];
  private marks = new Map<number, Phaser.GameObjects.Rectangle>();
  private motions: Motion[] = [];
  private fog: Phaser.GameObjects.Graphics | null = null;
  private glow: Phaser.Textures.CanvasTexture | null = null;
  private glowAt = '';
  private torchLights: Light[] = [];
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
    return { img, anim, after: null, t0: this.time.now, phase: Math.floor(Math.random() * 1000), x: px(x), y: py(y), yo: 0, tint: null };
  }

  private build(state: State) {
    this.children.removeAll(true);
    this.enemies.clear();
    this.props.clear();
    this.marks.clear();
    this.motions = [];
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
        this.add.image(px(x), py(y), 'pack', floorTile(x, y)).setOrigin(0.5, 1).setDepth(0);
        this.placeProp(c, x, y, y * w + x);
      }),
    );
    this.hero = this.actor(state.pos.x, state.pos.y, 5, ANIMS['hero-idle']);
    for (const e of state.enemies) this.enemies.set(e.id, this.actor(e.x, e.y, 5, ANIMS['goblin-idle']));
    this.fog = this.add.graphics().setDepth(2000);
    if (this.textures.exists('glow')) this.textures.remove('glow');
    this.glow = this.textures.createCanvas('glow', w * TILE, state.tiles.length * TILE);
    this.add.image(0, 0, 'glow').setOrigin(0, 0).setDepth(1999); // under the fog: light never shows what you can't see
    this.glowAt = '';
    const cam = this.cameras.main;
    cam.setBounds(0, 0, w * TILE, state.tiles.length * TILE);
    cam.startFollow(this.hero.img, true);
    this.sync(state);
  }

  private placeProp(c: string, x: number, y: number, i: number) {
    const still = (name: keyof typeof PACK, flat: boolean) => {
      const a = this.actor(x, y, 2, { frames: [{ src: 'pack', name }], ms: [1000], loop: true });
      if (flat) a.img.setDepth(1);
      this.props.set(i, a);
    };
    if (c === '^') still('spikes', true);
    else if (c === '>') still('stairs', true);
    else if (c === 'D') still('door', false);
    else if (c === '/') still('door-open', false);
    else if (c === 'k') this.props.set(i, this.actor(x, y, 2, ANIMS['key-bob']));
  }

  /** Fog, enemy visibility and tells from the new state. Fog is per tile; the glow is drawn above and decides nothing. */
  private sync(state: State) {
    this.state = state;
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
      const a = this.enemies.get(e.id);
      if (!a) continue;
      a.img.setVisible(vis[e.y * w + e.x] === 2);
      if (e.mode === 'alert' && !this.marks.has(e.id)) {
        // The goblin's tell: a blood glint above it on the turn before it chases.
        this.marks.set(e.id, this.add.rectangle(px(e.x), py(e.y) - TILE - 2, 2, 2, color('blood')).setDepth(depth(e.y, 6)));
      }
      if (e.mode !== 'alert') {
        this.marks.get(e.id)?.destroy();
        this.marks.delete(e.id);
      }
      a.img.setFlipX(state.pos.x < e.x);
    }
  }

  private move(a: Actor, from: Pos, to: Pos, ms: readonly number[], now: number) {
    let at = now;
    const keys = ms.map((m, k) => {
      const f = (k + 1) / ms.length;
      const key = { at, x: px(from.x + (to.x - from.x) * f), y: py(from.y + (to.y - from.y) * f), yo: HOP_Y[k] ?? 0 };
      at += m;
      return key;
    });
    this.motions.push({ actor: a, keys });
    a.img.setDepth(depth(to.y, 5));
    if (to.x !== from.x) a.img.setFlipX(to.x < from.x);
    return ms.reduce((s, m) => s + m, 0);
  }

  private lunge(a: Actor, toward: Pos, half: number, now: number, distance: number) {
    const dx = Math.sign(px(toward.x) - a.x) * distance;
    const dy = Math.sign(py(toward.y) - a.y) * distance;
    this.motions.push({ actor: a, keys: [{ at: now, x: a.x + dx, y: a.y + dy, yo: 0 }, { at: now + half, x: a.x, y: a.y, yo: 0 }] });
    return half * 2;
  }

  /** Plays one turn's events; resolves when the turn's animation lock (≤ 120 ms) ends, or when death finishes. */
  play(events: readonly Event[], next: State, instant: boolean): Promise<void> {
    const now = this.time.now;
    const hero = this.hero;
    if (!hero) return Promise.resolve();
    const hurt = events.some((e) => e.t === 'hurt');
    let lock = 0;
    let died = false;
    for (const e of events) {
      if (e.t === 'move') lock = Math.max(lock, this.move(hero, e.from, e.to, hurt ? HOP_HURT_MS : HOP_MS, now));
      else if (e.t === 'blocked' || e.t === 'locked') lock = Math.max(lock, this.lunge(hero, e.at, NUDGE_MS / 2, now, 1));
      else if (e.t === 'attack') lock = Math.max(lock, this.lunge(hero, e.at, LUNGE_MS, now, LUNGE_PX));
      else if (e.t === 'enemyMove') {
        const a = this.enemies.get(e.id);
        if (a) {
          a.anim = ANIMS['goblin-run'];
          lock = Math.max(lock, this.move(a, e.from, e.to, HOP_MS, now));
        }
      } else if (e.t === 'enemyAttack') {
        const a = this.enemies.get(e.id);
        if (a) lock = Math.max(lock, this.lunge(a, next.pos, LUNGE_MS, now, LUNGE_PX));
      } else if (e.t === 'kill') {
        const a = this.enemies.get(e.id);
        if (a) {
          a.anim = ANIMS['goblin-hurt'];
          a.t0 = now;
          this.time.delayedCall(instant ? 0 : KILL_MS, () => a.img.destroy());
          this.enemies.delete(e.id);
          this.marks.get(e.id)?.destroy();
          this.marks.delete(e.id);
        }
      } else if (e.t === 'hurt') {
        hero.anim = ANIMS['hero-hurt'];
        hero.after = ANIMS['hero-idle'];
        hero.t0 = now;
        if (!this.reduced && !instant) {
          this.cameras.main.shake(SHAKE_MS, SHAKE_PX / this.cameras.main.width);
          this.shakes++;
        }
      } else if (e.t === 'key' || e.t === 'door') {
        const i = e.at.y * (next.tiles[0]?.length ?? 0) + e.at.x;
        const prop = this.props.get(i);
        if (e.t === 'key') {
          prop?.img.destroy();
          this.props.delete(i);
        } else if (prop) prop.anim = { frames: [{ src: 'pack', name: 'door-open' }], ms: [1000], loop: true };
      } else if (e.t === 'torchOut') hero.tint = 'stone';
      else if (e.t === 'dead') died = true;
    }
    this.sync(next);
    if (instant) this.settle();
    if (died) return this.die(instant);
    return instant || lock === 0 ? Promise.resolve() : new Promise((r) => this.time.delayedCall(Math.min(lock, 120), r));
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
  }

  override update(time: number) {
    this.motions = this.motions.filter((m) => {
      const key = [...m.keys].reverse().find((k) => k.at <= time);
      if (key) Object.assign(m.actor, { x: key.x, y: key.y, yo: key.yo });
      return time < (m.keys[m.keys.length - 1]?.at ?? 0) + 1;
    });
    const actors = [this.hero, ...this.enemies.values(), ...this.props.values()];
    for (const a of actors) if (a) this.show(a, time);
    for (const t of this.torches) {
      // The flame never loops: shuffled frames, holds of 84–140 ms (cosmetic randomness, client only).
      if (time >= t.until) {
        t.frame = (t.frame + 1 + Math.floor(Math.random() * 2)) % 3;
        t.until = time + 84 + Math.floor(Math.random() * 57);
        t.img.setFrame(`torch-${t.frame}@lit`);
      }
    }
    this.drawGlow();
  }

  private show(a: Actor, now: number) {
    const elapsed = now - a.t0 + (a.anim.loop ? a.phase : 0);
    if (!a.anim.loop && a.after && elapsed >= total(a.anim)) {
      a.anim = a.after;
      a.after = null;
      a.t0 = now;
    }
    const f = a.anim.frames[frameAt(a.anim, elapsed)];
    if (!f) return;
    a.img.setTexture(f.src === 'own' ? 'own' : 'pack', f.src === 'own' ? `${f.name}@lit` : f.name);
    a.img.setPosition(a.x, a.y + a.yo + (f.dy ?? 0));
    const tint = f.tint ?? a.tint;
    if (tint) a.img.setTint(color(tint)).setTintMode(f.tint ? Phaser.TintModes.FILL : Phaser.TintModes.MULTIPLY);
    else a.img.clearTint();
  }

  private drawGlow() {
    const hero = this.hero;
    const glow = this.glow;
    if (!hero || !glow) return;
    const r = lightRadius(this.state);
    const at = `${hero.x},${hero.y},${r}`;
    if (at === this.glowAt) return;
    this.glowAt = at;
    const ctx = glow.getContext();
    ctx.clearRect(0, 0, glow.width, glow.height);
    const lights = [...this.torchLights, { x: hero.x, y: hero.y - TILE / 2, r: (r + 0.5) * TILE, tint: 'ember' as const }];
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
