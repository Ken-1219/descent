// End-to-end check for the game and Lab (Phase 3+). Run it through the Playwright MCP tool browser_run_code_unsafe
// with this file as `filename`, while `bun run local` serves http://localhost:5190. Returns PASS/FAIL per check.
// It uses the dev-only window.__descent hook, so it never runs against production builds.
async (page) => {
  const URL = 'http://localhost:5190/game.html';
  const browser = page.context().browser();
  const results = [];
  const errs = [];
  const check = (name, pass, detail) => results.push({ name, pass: !!pass, detail });
  try {
  const KEY = { U: 'ArrowUp', D: 'ArrowDown', L: 'ArrowLeft', R: 'ArrowRight', W: ' ' };
  const TO_DOOR = ['D', 'R', 'R', 'U', 'R', 'R']; // key, walk to (5,2), bump the door open
  const WIN = ['D', 'R', 'R', 'U', 'R', 'R', 'R', 'R', 'D', 'D', 'D', 'D', 'L', 'L', 'L', 'L', 'L', 'L'];

  const open = async (opts = {}) => {
    const ctx = await browser.newContext(opts.touch
      ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 }
      : { viewport: { width: 1280, height: 800 }, ...(opts.media || {}) });
    const p = await ctx.newPage();
    p.on('pageerror', (e) => errs.push(String(e)));
    p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
    await p.goto(URL);
    await p.waitForFunction(() => window.__descent);
    await p.evaluate(() => window.__descent.ready);
    return { ctx, p };
  };
  const S = (p) => p.evaluate(() => window.__descent.state());
  const acts = (p, list) => p.evaluate(async (list) => { for (const a of list) await window.__descent.act(a); }, list);
  const endVisible = (p) => p.evaluate(() => !document.getElementById('end').hidden);

  // 1. Rules in the browser (skipAnim on, mercy floor)
  {
    const { ctx, p } = await open();
    await p.evaluate(() => window.__descent.skipAnim(true));
    await acts(p, ['L']);
    const a = await S(p);
    await acts(p, ['L']);
    const b = await S(p);
    check('wall bump costs no turn or torch', b.turn === a.turn && b.torch === a.torch && b.pos.x === 1, `turn ${a.turn}->${b.turn}`);
    await p.evaluate(() => window.__descent.load(0));
    await p.evaluate(() => window.__descent.skipAnim(true));
    await acts(p, ['R', 'R', 'R']);
    const c = await S(p);
    await acts(p, ['R']);
    const d = await S(p);
    check('locked door without key: blocked, no turn', d.turn === c.turn && d.pos.x === 5 && !d.hasKey, `pos ${d.pos.x},${d.pos.y}`);
    await p.evaluate(() => window.__descent.load(0));
    await p.evaluate(() => window.__descent.skipAnim(true));
    await acts(p, ['D', 'R', 'R']);
    const k = await S(p);
    check('key picked up and shown in HUD', k.hasKey && (await p.locator('[aria-label="Key held"]').count()) === 1, `hasKey ${k.hasKey}`);
    await acts(p, ['U', 'R', 'R']);
    const o = await S(p);
    check('door opens with key, uses the key, player stays', !o.hasKey && o.pos.x === 5, `pos ${o.pos.x}`);
    await acts(p, ['R', 'R', 'R', 'R', 'R']);
    const s1 = await S(p);
    check('spikes take a heart', s1.pos.x === 9 + 1 && s1.hearts === 2, `hearts ${s1.hearts} at x ${s1.pos.x}`);
    check('HUD hearts label follows state', (await p.locator('[aria-label="Hearts 2 of 3"]').count()) === 1, '');
    const g = s1.enemies[0];
    check('goblin alerts when within 4 tiles in sight (tell turn)', g && g.mode === 'alert', g && `${g.mode} at ${g.x},${g.y}`);
    await acts(p, ['W']);
    const g2 = (await S(p)).enemies[0];
    check('goblin chases the turn after its tell', g2 && g2.mode === 'chase' && (g2.x !== g.x || g2.y !== g.y), g2 && `${g2.mode} at ${g2.x},${g2.y}`);
    for (let i = 0; i < 8; i++) await acts(p, ['L', 'R']);
    const m = await S(p);
    check('mercy: Floor 0 never drops below 1 heart', m.hearts >= 1 && !m.ended, `hearts ${m.hearts}`);
    await p.evaluate(() => window.__descent.load(0));
    await p.evaluate(() => window.__descent.skipAnim(true));
    await acts(p, [...TO_DOOR, 'R', 'R', 'D', 'D', 'R', 'R', 'R', 'R']);
    let st = await S(p);
    for (let i = 0; i < 12 && st.enemies.length; i++) {
      const e = st.enemies[0];
      const dx = e.x - st.pos.x, dy = e.y - st.pos.y;
      await acts(p, [Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? 'R' : 'L') : (dy > 0 ? 'D' : 'U')]);
      st = await S(p);
    }
    check('bump attack kills the goblin', st.enemies.length === 0, `enemies ${st.enemies.length}`);
    await ctx.close();
  }

  // 2. Win by keyboard with real key presses; animation lock; end overlay by keyboard
  {
    const { ctx, p } = await open();
    const locks = [];
    for (const a of WIN) {
      const t = await p.evaluate(async (a) => { const t0 = performance.now(); await window.__descent.act(a); return performance.now() - t0; }, a);
      locks.push(t);
    }
    const won = await S(p);
    locks.sort((x, y) => x - y);
    check('Floor 0 won by actions', won.ended && won.ended.kind === 'won' && won.turn === 18, `turn ${won.turn}`);
    check('animation lock per turn <= 120 ms (+frame slack)', locks[locks.length - 1] <= 140, `median ${locks[9].toFixed(0)} max ${locks[locks.length - 1].toFixed(0)} ms`);
    check('end overlay shown with one primary action', (await endVisible(p)) && (await p.locator('#end .btn--primary').count()) === 1, '');
    await p.keyboard.press('Enter');
    const r = await S(p);
    check('first visit: Enter on "Descend to Floor 1" after Floor 0 opens the day\'s floor at its intro', r.floor === 1 && r.turn === 0 && !r.ended && (await p.evaluate(() => document.getElementById('end').classList.contains('end--intro'))), `floor ${r.floor} turn ${r.turn}`);
    await p.evaluate(() => window.__descent.load(0));
    const t0 = Date.now();
    for (const a of WIN) { await p.keyboard.press(KEY[a]); await p.waitForTimeout(125); }
    const kb = await S(p);
    check('Floor 0 won with real key presses, under 60 s', kb.ended && kb.ended.kind === 'won' && Date.now() - t0 < 60000, `${((Date.now() - t0) / 1000).toFixed(1)} s`);
    const ms = await p.evaluate(() => window.__descent.metrics());
    check('input to motion < 50 ms', ms.inputToMotion < 50, `${ms.inputToMotion.toFixed(1)} ms`);
    await ctx.close();
  }

  // 3. One action buffered: three fast presses -> two moves
  {
    const { ctx, p } = await open();
    await p.keyboard.press('ArrowRight');
    await p.keyboard.press('ArrowRight');
    await p.keyboard.press('ArrowRight');
    await p.waitForTimeout(400);
    const b = await S(p);
    check('input buffered one deep (3 fast presses -> 2 moves)', b.turn === 2 && b.pos.x === 4, `turn ${b.turn} x ${b.pos.x}`);
    await ctx.close();
  }

  // 4. Death: plays ~1.9 s; a tap skips straight to the end state; skipAnim makes it instant
  {
    const killRoute = [...TO_DOOR, 'R', 'R', 'R', 'R', 'R', 'L', 'R', 'L', 'R'];
    const { ctx, p } = await open();
    await p.evaluate(() => window.__descent.load(0, { mercy: false }));
    for (const a of killRoute.slice(0, -1)) await p.evaluate((a) => window.__descent.act(a), a);
    let t0 = Date.now();
    await p.keyboard.press(KEY[killRoute[killRoute.length - 1]]);
    await p.waitForFunction(() => !document.getElementById('end').hidden, null, { timeout: 5000 });
    const full = Date.now() - t0;
    const dead = await S(p);
    check('death on a non-mercy floor', dead.ended && dead.ended.kind === 'dead', JSON.stringify(dead.ended));
    check('death animation plays ~1.9 s', full > 1500 && full < 2600, `${full} ms`);
    check('end text names the cause', /took you/.test(await p.locator('#end').innerText()), (await p.locator('#end p').innerText()));
    await p.evaluate(() => window.__descent.load(0, { mercy: false }));
    for (const a of killRoute.slice(0, -1)) await p.evaluate((a) => window.__descent.act(a), a);
    t0 = Date.now();
    await p.keyboard.press(KEY[killRoute[killRoute.length - 1]]);
    await p.waitForTimeout(150);
    await p.keyboard.press('ArrowLeft');
    await p.waitForFunction(() => !document.getElementById('end').hidden, null, { timeout: 5000 });
    const skipped = Date.now() - t0;
    check('a key press skips death to the end state', skipped < 600, `${skipped} ms`);
    await p.evaluate(() => window.__descent.load(0, { mercy: false }));
    await p.evaluate(() => window.__descent.skipAnim(true));
    t0 = Date.now();
    await p.evaluate(async (r) => { for (const a of r) await window.__descent.act(a); }, killRoute);
    const inst = Date.now() - t0;
    check('skipAnim makes death instant', (await endVisible(p)) && inst < 300, `${inst} ms`);
    await ctx.close();
  }

  // 5. Torch out: radius 1, then dark damage every 2 turns
  {
    const { ctx, p } = await open();
    await p.evaluate(() => { window.__descent.load(0, { mercy: false, torch: 6 }); window.__descent.skipAnim(true); });
    await acts(p, ['W', 'W', 'W', 'W', 'W', 'W']);
    const o = await S(p);
    await acts(p, ['W', 'W']);
    const d1 = await S(p);
    await acts(p, ['W', 'W', 'W', 'W']);
    const d3 = await S(p);
    check('torch reaches 0 after its budget', o.torch === 0, `torch ${o.torch}`);
    check('dark costs a heart every 2 turns', d1.hearts === 2, `hearts after 2 dark turns ${d1.hearts}`);
    check('the dark can kill (non-mercy)', d3.ended && d3.ended.cause === 'dark', JSON.stringify(d3.ended));
    await ctx.close();
  }

  // 6. Touch: swipes, taps, hold-to-repeat, damage cancels repeat, Enter on a plate
  {
    const { ctx, p } = await open({ touch: true });
    const box = await p.locator('#stage').boundingBox();
    const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
    const swipe = async (dx, dy) => {
      await p.locator('#stage').dispatchEvent('pointerdown', { clientX: cx, clientY: cy, pointerType: 'touch', isPrimary: true });
      await p.locator('#stage').dispatchEvent('pointerup', { clientX: cx + dx, clientY: cy + dy, pointerType: 'touch', isPrimary: true });
      await p.waitForTimeout(150);
    };
    await swipe(60, 0); const sR = await S(p);
    await swipe(0, 60); const sD = await S(p);
    await swipe(-60, 0); const sL = await S(p);
    await swipe(0, -60); const sU = await S(p);
    check('swipe right/down/left/up each move one tile', sR.pos.x === 3 && sD.pos.y === 3 && sL.pos.x === 2 && sU.pos.y === 2, `${sR.pos.x},${sD.pos.y},${sL.pos.x},${sU.pos.y}`);
    await swipe(10, 5);
    check('a short drag (<24 px) does not move', (await S(p)).turn === 4, `turn ${(await S(p)).turn}`);
    await p.locator('.dpad [data-act="D"]').tap();
    await p.waitForTimeout(150);
    check('d-pad tap moves', (await S(p)).pos.y === 3, '');
    await p.evaluate(() => window.__descent.load(0));
    const plate = p.locator('.dpad [data-act="R"]');
    await plate.dispatchEvent('pointerdown', { pointerType: 'touch', isPrimary: true });
    await p.waitForTimeout(1000);
    await p.locator('#controls').dispatchEvent('pointerup', { pointerType: 'touch', isPrimary: true });
    await p.waitForTimeout(200);
    const h = await S(p);
    check('holding a plate repeats (stops at the locked door)', h.pos.x === 5, `x ${h.pos.x} turn ${h.turn}`);
    await p.evaluate(async () => { window.__descent.load(0); for (const a of ['D', 'R', 'R', 'U', 'R', 'R', 'R', 'R', 'R']) await window.__descent.act(a); });
    await plate.dispatchEvent('pointerdown', { pointerType: 'touch', isPrimary: true });
    await p.waitForTimeout(1100);
    await p.locator('#controls').dispatchEvent('pointerup', { pointerType: 'touch', isPrimary: true });
    await p.waitForTimeout(200);
    const c = await S(p);
    check('damage cancels the hold repeat', c.pos.x === 10 && c.hearts === 2, `x ${c.pos.x} hearts ${c.hearts}`);
    await p.evaluate(() => window.__descent.load(0));
    await p.locator('.dpad [data-act="R"]').focus();
    await p.keyboard.press('Enter');
    await p.waitForTimeout(150);
    check('Enter on a focused d-pad plate acts (keyboard access)', (await S(p)).pos.x === 3, `x ${(await S(p)).pos.x}`);
    check('focused plate shows a focus ring', await p.evaluate(() => getComputedStyle(document.activeElement).outlineStyle !== 'none'), '');
    await ctx.close();
  }

  // 7. Reduced motion: no shake; light scheme stays dark
  {
    const { ctx, p } = await open({ media: { reducedMotion: 'reduce', colorScheme: 'light' } });
    await acts(p, [...TO_DOOR, 'R', 'R', 'R', 'R', 'R']);
    const m = await p.evaluate(() => window.__descent.metrics());
    check('reduced motion: damage plays no shake', m.shakes === 0 && (await S(p)).hearts === 2, `shakes ${m.shakes}`);
    check('light colour scheme keeps the dark page', await p.evaluate(() => getComputedStyle(document.body).backgroundColor === 'rgb(13, 15, 20)'), '');
    await ctx.close();
    const n = await open();
    await acts(n.p, [...TO_DOOR, 'R', 'R', 'R', 'R', 'R']);
    check('normal motion: damage shakes once', (await n.p.evaluate(() => window.__descent.metrics())).shakes === 1, '');
    await n.ctx.close();
  }

  // 8. Resize keeps integer zoom and no overflow
  {
    const { ctx, p } = await open();
    const sizes = [[360, 640], [844, 390], [1280, 800], [412, 915]];
    const bad = [];
    for (const [w, h] of sizes) {
      await p.setViewportSize({ width: w, height: h });
      await p.waitForTimeout(150);
      const r = await p.evaluate(() => {
        const c = document.querySelector('#game-container canvas').getBoundingClientRect();
        const z = c.width / document.querySelector('#game-container canvas').width;
        return { z, ok: Number.isInteger(z) && c.right <= innerWidth + 0.5 && c.bottom <= innerHeight + 0.5 && document.documentElement.scrollWidth <= innerWidth };
      });
      if (!r.ok) bad.push(`${w}x${h} z=${r.z}`);
    }
    check('live resize keeps integer zoom, canvas in view, no scroll', bad.length === 0, bad.join(' '));
    await ctx.close();
  }

  // 9. Phase 4 Bestiary: every cell renders, loops, and has no console errors; pause, step and 0.25x work
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const p = await ctx.newPage();
    const labErrs = [];
    p.on('pageerror', (e) => labErrs.push(String(e)));
    p.on('console', (m) => { if (m.type() === 'error') labErrs.push(m.text()); });
    await p.goto('http://localhost:5190/lab.html#bestiary');
    await p.waitForSelector('.beast canvas');
    const snap = () => p.evaluate(() => [...document.querySelectorAll('.beast')].map((f) => {
      const c = f.querySelector('canvas');
      const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      let lit = 0;
      for (let i = 0; i < d.length; i += 4) if (d[i] + d[i + 1] + d[i + 2] > 60) lit++;
      return { id: f.dataset.scene, turn: Number(f.dataset.turn), lit };
    }));
    // Sample every 400 ms for 12 s (the longest scene loops in about 11 s): a looping cell wraps back to an earlier turn.
    const a = await snap();
    const wrapped = new Set();
    let prev = a;
    for (let i = 0; i < 30; i++) {
      await p.waitForTimeout(400);
      const now = await snap();
      now.forEach((c, k) => { if (c.turn < prev[k].turn) wrapped.add(c.id); });
      prev = now;
    }
    const blank = a.filter((c) => c.lit < 50).map((c) => c.id);
    const stuck = a.filter((c) => !wrapped.has(c.id)).map((c) => c.id);
    check('Bestiary shows 34 cells (28 family-tier + 3 traps + 3 items)', a.length === 34, `${a.length} cells`);
    check('every Bestiary cell draws its scene', blank.length === 0, blank.join(' '));
    check('every Bestiary cell loops (wraps to its start)', stuck.length === 0, stuck.join(' '));
    const cell = p.locator('.beast[data-scene="spikes-2"]');
    await cell.getByRole('button', { name: 'Pause' }).click();
    const t0 = Number(await cell.getAttribute('data-turn'));
    await p.waitForTimeout(1500);
    const t1 = Number(await cell.getAttribute('data-turn'));
    await cell.getByRole('button', { name: 'Step' }).click();
    await p.waitForTimeout(100);
    const t2 = Number(await cell.getAttribute('data-turn'));
    check('Pause holds the turn; Step advances exactly one', t0 === t1 && t2 === (t1 + 1) % 8 && (await cell.getAttribute('data-paused')) === 'true', `${t0} ${t1} ${t2}`);
    await cell.getByRole('button', { name: 'Play' }).click();
    await cell.getByRole('button', { name: '¼×' }).click();
    const s0 = Number(await cell.getAttribute('data-turn'));
    await p.waitForTimeout(1200);
    const s1 = Number(await cell.getAttribute('data-turn'));
    check('Play resumes; 0.25x slows a turn past 1.2 s', (await cell.getByRole('button', { name: '¼×' }).getAttribute('aria-pressed')) === 'true' && s1 - s0 <= 1, `${s0} -> ${s1}`);
    check('Bestiary has no console errors', labErrs.length === 0, labErrs.join(' | '));
    await ctx.close();
  }

  // 10. Phase 4 scenes playable to the end: by keyboard (desktop) and by taps (touch)
  {
    const SCENE_KEY = { ...KEY, I: 'e' };
    const scenes = await (async () => {
      const { ctx, p } = await open();
      const out = await p.evaluate(() => window.__descent.scenes());
      await ctx.close();
      return out;
    })();
    const byId = (id) => scenes.find((s) => s.id === id);
    for (const id of ['goblins-1', 'mechanisms-3', 'item-bomb']) {
      const { ctx, p } = await open();
      await p.goto(`${URL}?scene=${id}`);
      await p.waitForFunction(() => window.__descent);
      await p.evaluate(() => window.__descent.ready);
      for (const a of byId(id).log) { await p.keyboard.press(SCENE_KEY[a]); await p.waitForTimeout(140); }
      const st = await S(p);
      check(`scene ${id} plays to its end by keyboard`, st.ended && st.ended.kind === 'won' && (await endVisible(p)), JSON.stringify(st.ended));
      await ctx.close();
    }
    for (const id of ['item-potion', 'pits-1', 'mechanisms-1']) {
      const { ctx, p } = await open({ touch: true });
      await p.goto(`${URL}?scene=${id}`);
      await p.waitForFunction(() => window.__descent);
      await p.evaluate(() => window.__descent.ready);
      for (const a of byId(id).log) { await p.locator(a === 'I' ? '.item-btn' : `.dpad [data-act="${a}"]`).tap(); await p.waitForTimeout(140); }
      const st = await S(p);
      check(`scene ${id} plays to its end by taps`, st.ended && st.ended.kind === 'won', JSON.stringify(st.ended));
      await ctx.close();
    }
  }

  // 11. Phase 5: Depth tab renders without errors; painting deaths regenerates floors; ?depth=&seed= opens that floor
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const p = await ctx.newPage();
    const labErrs = [];
    p.on('pageerror', (e) => labErrs.push(String(e)));
    p.on('console', (m) => { if (m.type() === 'error') labErrs.push(m.text()); });
    await p.goto('http://localhost:5190/lab.html#depth');
    await p.waitForSelector('.depth__compare canvas', { timeout: 20000 });
    const floors = await p.locator('.depth__compare canvas').count();
    const cols = await p.evaluate(() => getComputedStyle(document.querySelector('.depth__compare')).gridTemplateColumns.split(' ').length);
    check('Depth tab: six comparison floors in two rows of three at 1x', floors === 6 && cols === 3 && (await p.evaluate(() => [...document.querySelectorAll('.depth__compare canvas')].every((c) => c.getBoundingClientRect().width === c.width))), `${floors} floors, ${cols} columns`);
    const labels = () => p.evaluate(() => [...document.querySelectorAll('.depth__compare canvas')].map((c) => c.getAttribute('aria-label')).join('|'));
    const before = await labels();
    for (let i = 0; i < 3; i++) await p.locator('.compass .btn').nth(8).click();
    check('painting deaths in a zone regenerates the floors', (await labels()) !== before, '');
    await p.locator('input[aria-label="Depth"]').fill('22');
    await p.waitForTimeout(200);
    check('the depth slider redraws the big floor', (await p.locator('.depth__big').getAttribute('data-depth')) === '22', '');
    check('Depth tab has no console errors', labErrs.length === 0, labErrs.join(' | '));
    await ctx.close();
    const g = await open();
    await g.p.goto(`${URL}?depth=15&seed=123`);
    await g.p.waitForFunction(() => window.__descent);
    await g.p.evaluate(() => window.__descent.ready);
    const st = await S(g.p);
    check('game.html?depth=15&seed=123 opens that generated floor', st.floor === 15 && !st.ended, `floor ${st.floor} torch ${st.torch}`);
    await g.ctx.close();
  }


  // 12. Phase 6: the day's floor (local.ts fakes /api/*): logging, resume, save states, played, closed, logged out, splash
  {
    const dayCtx = async (opts = {}) => {
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
      await ctx.addInitScript(() => localStorage.setItem('descent:f0', '1')); // Floor 0 already done
      const p = await ctx.newPage();
      p.on('pageerror', (e) => errs.push(String(e)));
      p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
      await p.goto(`${URL}${opts.q ?? ''}`);
      await p.waitForFunction(() => window.__descent);
      await p.evaluate(() => window.__descent.ready);
      await p.evaluate(() => { const e = document.getElementById('end'); if (e.classList.contains('end--intro')) e.querySelector('.btn--primary').click(); });
      return { ctx, p };
    };
    const endText = (p) => p.locator('#end').innerText();
    const { ctx, p } = await dayCtx();
    await p.evaluate(() => window.__descent.skipAnim(true));
    const s0 = await S(p);
    check('returning player opens the day\'s floor directly', s0.floor === 1 && !(await endVisible(p)), `floor ${s0.floor}`);
    // Bump into walls (free) and wait (logged): only state changes reach the log.
    for (const a of ['U', 'U', 'U', 'U', 'U', 'U', 'U', 'U', 'L', 'L', 'L', 'L', 'L', 'L', 'L', 'L']) await acts(p, [a]);
    await acts(p, ['W', 'W']);
    const mid = await S(p);
    const log = await p.evaluate(() => window.__descent.log());
    check('only state-changing actions are logged (no free bumps)', log.length === mid.turn, `log ${log.length} turn ${mid.turn}`);
    await p.reload();
    await p.waitForFunction(() => window.__descent);
    await p.evaluate(() => window.__descent.ready);
    const back = await S(p);
    check('a mid-run reload resumes at the same turn, tile, torch and hearts', back.turn === mid.turn && back.pos.x === mid.pos.x && back.pos.y === mid.pos.y && back.torch === mid.torch && back.hearts === mid.hearts && !back.ended, `turn ${back.turn}/${mid.turn}`);
    await p.evaluate(() => window.__descent.skipAnim(true));
    await p.evaluate(async () => { for (let i = 0; i < 1500 && !window.__descent.state().ended; i++) await window.__descent.act('W'); });
    await p.waitForFunction(() => /Saved/.test(document.getElementById('end').innerText), null, { timeout: 5000 });
    check('a finished run shows Saved (no retry), with one primary action', (await p.locator('#end .btn--primary').count()) === 1 && !(await p.getByRole('button', { name: 'Retry' }).isVisible()), (await endText(p)).replace(/\n/g, ' | '));
    await p.reload();
    await p.waitForFunction(() => window.__descent);
    check('a second attempt shows the stored result', /Floor 1/.test(await endText(p)) && /Score \d+/.test(await endText(p)) && (await endVisible(p)), (await endText(p)).replace(/\n/g, ' | '));
    const sp = await ctx.newPage();
    await sp.setViewportSize({ width: 320, height: 320 });
    await sp.goto('http://localhost:5190/splash.html');
    await sp.waitForFunction(() => !document.getElementById('go').disabled);
    const splash = await sp.evaluate(() => {
      const b = document.getElementById('go').getBoundingClientRect();
      return { text: document.body.innerText, fits: document.documentElement.scrollWidth <= innerWidth && b.bottom <= innerHeight && b.height >= 44, interactive: performance.getEntriesByName('descent:splash')[0]?.startTime ?? -1 };
    });
    check('splash at 320x320: floor number, played state, button in view', /Floor 1/.test(splash.text) && /See your run/.test(splash.text) && splash.fits, splash.text.replace(/\n/g, ' | '));
    await sp.close();
    // Rollover: yesterday's post is closed and offers today's floor.
    await p.evaluate(() => window.__descent.advanceDay());
    await p.goto(`${URL}?post=1`);
    await p.waitForFunction(() => window.__descent);
    check('your result still shows on yesterday\'s post', /Score/.test(await endText(p)), (await endText(p)).replace(/\n/g, ' | '));
    await ctx.close();
    const c2 = await dayCtx();
    await c2.p.evaluate(() => { window.__descent.advanceDay(); });
    await c2.p.goto(`${URL}?post=1`);
    await c2.p.waitForFunction(() => window.__descent);
    check('a rolled-over floor is closed and offers today\'s floor', /has closed/.test(await endText(c2.p)) && /Floor 2/.test(await endText(c2.p)), (await endText(c2.p)).replace(/\n/g, ' | '));
    await c2.p.locator('#end .btn--primary').click();
    await c2.p.waitForURL(/post=2/);
    await c2.p.waitForFunction(() => window.__descent);
    await c2.p.evaluate(() => window.__descent.ready);
    check('"Go to today\'s floor" opens today\'s floor (at its intro)', (await S(c2.p)).floor === 2 && (await c2.p.evaluate(() => document.getElementById('end').classList.contains('end--intro'))), `floor ${(await S(c2.p)).floor}`);
    await c2.p.evaluate(() => document.querySelector('#end .btn--primary').click());
    // A dropped connection: Saving, then Not saved with a retry that succeeds once the network is back.
    await c2.p.evaluate(() => { window.__descent.skipAnim(true); window.__descent.offline(true); });
    await c2.p.evaluate(async () => { for (let i = 0; i < 1500 && !window.__descent.state().ended; i++) await window.__descent.act('W'); });
    const saving = await endText(c2.p);
    await c2.p.waitForFunction(() => /Not saved/.test(document.getElementById('end').innerText), null, { timeout: 12000 });
    await c2.p.evaluate(() => window.__descent.offline(false));
    await c2.p.getByRole('button', { name: 'Retry' }).click();
    await c2.p.waitForFunction(() => /Saved/.test(document.getElementById('end').innerText) && !/Not saved/.test(document.getElementById('end').innerText), null, { timeout: 5000 });
    check('offline: Saving, then Not saved after 3 retries, then Retry saves', /Saving/.test(saving) && !/Retry/.test(saving), saving.replace(/\n/g, ' | '));
    await c2.ctx.close();
    const c3 = await dayCtx({ q: '?loggedOut=1' });
    check('logged out: "Log in to descend" with a Log in action', /Log in to descend/.test(await endText(c3.p)) && (await c3.p.locator('#end .btn--primary').innerText()) === 'Log in', (await endText(c3.p)).replace(/\n/g, ' | '));
    await c3.ctx.close();
  }


  // 13. Phase 7a: ghosts and carvings (Floor 0's scripted ghosts; local.ts stores your ghost and carving per floor)
  {
    const ctxAt = async (vp, q = '', f0 = true) => {
      const ctx = await browser.newContext({ viewport: vp });
      if (f0) await ctx.addInitScript(() => localStorage.setItem('descent:f0', '1'));
      const p = await ctx.newPage();
      p.on('pageerror', (e) => errs.push(String(e)));
      p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
      await p.goto(`${URL}${q}`);
      await p.waitForFunction(() => window.__descent);
      await p.evaluate(() => window.__descent.ready);
      await p.evaluate(() => { const e = document.getElementById('end'); if (e.classList.contains('end--intro')) e.querySelector('.btn--primary').click(); });
      return { ctx, p };
    };
    const endText = (p) => p.locator('#end').innerText();
    const flat = (t) => t.replace(/\n+/g, ' | ');
    const dieHere = (p) => p.evaluate(async () => { window.__descent.skipAnim(true); for (let i = 0; i < 1500 && !window.__descent.state().ended; i++) await window.__descent.act('W'); });

    // Approach: on Floor 0 the scripted ghost at (9,3) reads "Trap ahead" once you stand next to it; Read opens its card.
    {
      const { ctx, p } = await ctxAt({ width: 390, height: 844 }, '', false);
      await p.evaluate(() => window.__descent.skipAnim(true));
      check('Floor 0 draws its scripted ghosts with the same renderer', (await p.evaluate(() => window.__descent.ghosts().list.length)) === 2, '');
      const hiddenFar = await p.locator('#carving').isHidden();
      await acts(p, [...TO_DOOR, 'R', 'R', 'R']);
      const line = (await p.locator('#carving').isVisible()) ? await p.locator('#carving').innerText() : '';
      check('a carving shows on approach, with no input (aria-live line under the HUD)', hiddenFar && /a nameless delver: Trap ahead/.test(line) && (await p.locator('#carving').getAttribute('aria-live')) === 'polite', flat(line));
      const turn = (await S(p)).turn;
      await p.locator('#carving').getByRole('button', { name: 'Read' }).click();
      const card = (await p.locator('#card').isVisible()) ? await p.locator('#card').innerText() : '';
      await p.keyboard.press('ArrowRight');
      const still = (await S(p)).turn === turn;
      await p.keyboard.press('Escape');
      check('Read opens the ghost card; keys never move the hero under it; Esc closes it; reading is no action', /a nameless delver/.test(card) && /Trap ahead/.test(card) && still && (await p.locator('#card').isHidden()) && (await p.evaluate(() => window.__descent.log())) === '', flat(card));
      // Tap the wisp itself.
      const box = await p.evaluate(() => window.__descent.tileBox(9, 3));
      await p.locator('#stage').dispatchEvent('pointerdown', { clientX: box.left + box.size / 2, clientY: box.top + box.size / 2, pointerType: 'mouse', isPrimary: true });
      await p.locator('#stage').dispatchEvent('pointerup', { clientX: box.left + box.size / 2, clientY: box.top + box.size / 2, pointerType: 'mouse', isPrimary: true });
      const tapped = await p.locator('#card').isVisible();
      await p.locator('#card').getByRole('button', { name: 'Close' }).click();
      check('tapping a lit wisp opens its card; Close closes it', tapped && (await p.locator('#card').isHidden()) && (await S(p)).turn === turn, '');
      await ctx.close();
    }

    // Die, carve, reload: your ghost and its carving on the result plate and on the map.
    {
      const { ctx, p } = await ctxAt({ width: 390, height: 844 });
      await dieHere(p);
      await p.waitForSelector('#end select.picker');
      const carveBtn = p.locator('#end .btn--primary');
      const disabledFirst = await carveBtn.isDisabled();
      await p.locator('#end select.picker').selectOption('trap-ahead');
      await carveBtn.click();
      await p.waitForFunction(() => /Your ghost: Trap ahead/.test(document.getElementById('end').innerText), null, { timeout: 8000 });
      await p.reload();
      await p.waitForFunction(() => window.__descent);
      await p.waitForFunction(() => /Your ghost: Trap ahead/.test(document.getElementById('end').innerText), null, { timeout: 8000 });
      const mine = await p.evaluate(() => window.__descent.ghosts().list.find((g) => g.mine));
      check('die, carve, reload: the plate shows your ghost and carving; the map has your ghost', disabledFirst && mine && mine.carving === 'trap-ahead', flat(await endText(p)));
      await ctx.close();
    }

    // Skip, then carve later from the result plate (a path phrase carries its direction).
    {
      const { ctx, p } = await ctxAt({ width: 390, height: 844 });
      await dieHere(p);
      await p.waitForSelector('#end select.picker');
      await p.getByRole('button', { name: 'Skip' }).click();
      await p.waitForFunction(() => /left no carving/.test(document.getElementById('end').innerText), null, { timeout: 8000 });
      const plate = await endText(p);
      await p.locator('#end .btn--primary').click(); // Carve
      await p.locator('#end select.picker').selectOption('safe-way:L');
      await p.locator('#end .btn--primary').click();
      await p.waitForFunction(() => /Your ghost: Safe this way ←/.test(document.getElementById('end').innerText), null, { timeout: 8000 });
      check('skip, then carve later from the result plate; the path carries its direction', /Carve/.test(plate), flat(await endText(p)));
      await ctx.close();
    }

    // Offline: the carving waits for the run, then both save once the network is back.
    {
      const { ctx, p } = await ctxAt({ width: 390, height: 844 });
      await p.evaluate(() => window.__descent.offline(true));
      await dieHere(p);
      await p.waitForSelector('#end select.picker');
      await p.locator('#end select.picker').selectOption('dead-end');
      await p.locator('#end .btn--primary').click();
      const queued = await endText(p);
      await p.waitForTimeout(1200);
      await p.evaluate(() => window.__descent.offline(false));
      await p.waitForFunction(() => /Your ghost: Dead end/.test(document.getElementById('end').innerText), null, { timeout: 12000 });
      check('a carving made while the run is unsaved is queued and sent after the run saves', /Saving/.test(queued), flat(queued));
      await ctx.close();
    }

    // Layout: picker, card and a 300-ghost floor from 320×320 to 1280×800; the death tile and its neighbours stay visible.
    {
      const bad = [];
      for (const vp of [{ width: 320, height: 320 }, { width: 360, height: 640 }, { width: 844, height: 390 }, { width: 1280, height: 800 }]) {
        const { ctx, p } = await ctxAt(vp, '?ghosts=300');
        const layout = () => p.evaluate(() => {
          const out = [];
          if (document.documentElement.scrollWidth > innerWidth) out.push('hscroll');
          for (const b of document.querySelectorAll('button, select')) {
            const r = b.getBoundingClientRect();
            if (!r.width || getComputedStyle(b).visibility === 'hidden') continue;
            if (r.height < 44 || r.width < 44) out.push(`small ${b.textContent.trim().slice(0, 12)} ${Math.round(r.width)}x${Math.round(r.height)}`);
            if (r.bottom > innerHeight + 0.5 || r.right > innerWidth + 0.5) out.push(`off ${b.textContent.trim().slice(0, 12)}`);
          }
          return out;
        });
        bad.push(...(await layout()).map((b) => `${vp.width}x${vp.height} floor ${b}`));
        await dieHere(p);
        await p.waitForSelector('#end select.picker');
        await p.locator('#end select.picker').selectOption('stairs-way:U');
        await p.waitForTimeout(300);
        const view = await p.evaluate(() => {
          const s = window.__descent.state();
          const tile = window.__descent.tileBox(s.pos.x, s.pos.y);
          const panel = document.querySelector('#end .end__panel').getBoundingClientRect();
          const canvas = document.querySelector('#game-container canvas').getBoundingClientRect();
          const hud = document.getElementById('hud').getBoundingClientRect();
          return { ok: tile.bottom + tile.size <= panel.top + 1 && tile.top - tile.size >= Math.max(canvas.top, hud.bottom) - 1, tile, panelTop: panel.top };
        });
        if (!view.ok) bad.push(`${vp.width}x${vp.height} death tile hidden: tile ${Math.round(view.tile.top)}-${Math.round(view.tile.bottom)} panel ${Math.round(view.panelTop)}`);
        bad.push(...(await layout()).map((b) => `${vp.width}x${vp.height} picker ${b}`));
        await p.getByRole('button', { name: 'Skip' }).click();
        await p.waitForFunction(() => /left no carving/.test(document.getElementById('end').innerText), null, { timeout: 8000 });
        await ctx.close();
      }
      // The card itself at the smallest and largest size (Floor 0's ghost via Read).
      for (const vp of [{ width: 320, height: 320 }, { width: 1280, height: 800 }]) {
        const { ctx, p } = await ctxAt(vp, '', false);
        await p.evaluate(() => window.__descent.skipAnim(true));
        await acts(p, [...TO_DOOR, 'R', 'R', 'R']);
        await p.locator('#carving').getByRole('button', { name: 'Read' }).click();
        const r = await p.evaluate(() => {
          const c = document.querySelector('#card .ghost-card').getBoundingClientRect();
          const close = document.querySelector('#card .ghost-card__close').getBoundingClientRect();
          return c.left >= 0 && c.right <= innerWidth && c.top >= 0 && c.bottom <= innerHeight && close.height >= 44 && document.documentElement.scrollWidth <= innerWidth;
        });
        if (!r) bad.push(`${vp.width}x${vp.height} card overflows`);
        await ctx.close();
      }
      check('layout 320×320 to 1280×800: picker keeps the death tile and neighbours visible; card and 300-ghost floor fit; 44 px targets', bad.length === 0, bad.join(' ; '));
    }
  }


  // 14. Phase 7b: victory steps (curse vote, trap), carving votes after your run, offline queue, layout
  {
    const ctxAt = async (vp, q = '') => {
      const ctx = await browser.newContext({ viewport: vp });
      await ctx.addInitScript(() => localStorage.setItem('descent:f0', '1'));
      const p = await ctx.newPage();
      p.on('pageerror', (e) => errs.push(String(e)));
      p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
      await p.goto(`${URL}${q}`);
      await p.waitForFunction(() => window.__descent);
      await p.evaluate(() => window.__descent.ready);
      await p.evaluate(() => { const e = document.getElementById('end'); if (e.classList.contains('end--intro')) e.querySelector('.btn--primary').click(); });
      return { ctx, p };
    };
    const endText = async (p) => (await p.locator('#end').innerText()).replace(/\n+/g, ' | ');
    const win = (p) => p.evaluate(async () => { window.__descent.skipAnim(true); for (const a of 'DRRURRRRDDDDLLLLLL') await window.__descent.act(a); });
    const die = (p) => p.evaluate(async () => { window.__descent.skipAnim(true); for (let i = 0; i < 1500 && !window.__descent.state().ended; i++) await window.__descent.act('W'); });

    // Win, vote, set a trap, reload: both stored and shown on the plate.
    {
      const { ctx, p } = await ctxAt({ width: 390, height: 844 }, '?floor=f0');
      await win(p);
      await p.waitForSelector('#end select.picker');
      const disabled = await p.locator('#end .btn--primary').isDisabled();
      await p.locator('#end select.picker').selectOption('deep-dark');
      await p.locator('#end .btn--primary').click();
      await p.waitForFunction(() => /Set a trap/.test(document.getElementById('end').innerText));
      await p.getByRole('button', { name: 'South-west' }).click();
      await p.locator('#end select.picker').selectOption('stairs');
      await p.locator('#end .btn--primary').click();
      await p.waitForFunction(() => /Your trap/.test(document.getElementById('end').innerText));
      await p.reload();
      await p.waitForFunction(() => window.__descent);
      await p.waitForFunction(() => /Your trap/.test(document.getElementById('end').innerText));
      const t = await endText(p);
      check('win, vote, set a trap, reload: both stored and shown; standings after voting', disabled && /Your curse vote: Deep Dark/.test(t) && /Deep Dark 1/.test(t) && /False stairs, south-west/.test(t), t);
      await ctx.close();
    }

    // Skip both steps: the plate offers the curse vote as its primary action while the floor is live.
    {
      const { ctx, p } = await ctxAt({ width: 390, height: 844 }, '?floor=f0');
      await win(p);
      await p.waitForSelector('#end select.picker');
      await p.getByRole('button', { name: 'Skip' }).click();
      await p.waitForFunction(() => /Set a trap/.test(document.getElementById('end').innerText));
      await p.getByRole('button', { name: 'Skip' }).click();
      await p.waitForFunction(() => /Score/.test(document.getElementById('end').innerText));
      const t = await endText(p);
      const primary = await p.locator('#end .btn--primary').innerText();
      check('skip both steps: nothing stored; the plate offers "Vote on a curse"', !/Your curse vote|Your trap/.test(t) && primary === 'Vote on a curse', `${t} [${primary}]`);
      await ctx.close();
    }

    // Totals hidden during the run, shown after it; a vote made offline is queued and sent on the next load.
    {
      const { ctx, p } = await ctxAt({ width: 390, height: 844 }, '?ghosts=20');
      const carved = await p.evaluate(() => window.__descent.ghosts().list.find((g) => g.carving));
      const during = await p.evaluate(() => window.__descent.ghosts().list.every((g) => g.votes === undefined));
      await p.evaluate((id) => window.__descent.card(id), carved.id);
      const cardDuring = await p.locator('#card').innerText();
      await p.keyboard.press('Escape');
      await die(p);
      await p.waitForSelector('#end select.picker');
      await p.getByRole('button', { name: 'Skip' }).click();
      await p.waitForFunction(() => /Carvings \(/.test(document.getElementById('end').innerText));
      await p.locator('#end .carvings__open').click();
      await p.locator('#end .carvings__row').first().click();
      const cardAfter = await p.locator('#card').innerText();
      check('totals hidden during the run (no vote buttons or counts, "Vote after your run"), shown after it', during && /Vote after your run/.test(cardDuring) && !/Trust \d|Liar \d/.test(cardDuring) && /Trust \d+/.test(cardAfter) && /Liar \d+/.test(cardAfter), `${cardDuring.replace(/\n+/g, ' | ')} → ${cardAfter.replace(/\n+/g, ' | ')}`);
      await p.evaluate(() => window.__descent.offline(true));
      await p.locator('#card').getByRole('button', { name: /^Trust/ }).click();
      await p.waitForTimeout(300);
      const optimistic = await p.locator('#card').getByRole('button', { name: /^Trust/ }).getAttribute('aria-pressed');
      const queuedBefore = await p.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('descent:votes:')).map((k) => localStorage.getItem(k)).join(''));
      await p.reload(); // a new page is online again: the queue flushes on load
      await p.waitForFunction(() => window.__descent);
      await p.waitForFunction(() => /Score/.test(document.getElementById('end').innerText));
      await p.waitForTimeout(800);
      const stored = await p.evaluate(() => ({ sent: JSON.parse(localStorage.getItem('descent:local:votes:1') ?? '{}'), queue: JSON.parse(localStorage.getItem('descent:votes:1') ?? '{}') }));
      check('a vote made offline shows at once, is queued, and is sent on the next load', optimistic === 'true' && /trust/.test(queuedBefore) && Object.values(stored.sent).includes('trust') && Object.keys(stored.queue).length === 0, `${queuedBefore} → ${JSON.stringify(stored)}`);
      await ctx.close();
    }

    // Layout: the curse step, the trap step, the plate with choices, the carvings list and a card with votes.
    {
      const bad = [];
      const layout = (p, what, vp) => p.evaluate(() => {
        const out = [];
        if (document.documentElement.scrollWidth > innerWidth) out.push('hscroll');
        for (const b of document.querySelectorAll('#end button, #end select, #card button')) {
          const r = b.getBoundingClientRect();
          if (!r.width) continue;
          if (r.height < 44 || r.width < 44) out.push(`small ${b.textContent.trim().slice(0, 12)} ${Math.round(r.width)}x${Math.round(r.height)}`);
        }
        const panel = document.querySelector('#end:not([hidden]) .end__panel');
        if (panel) {
          const r = panel.getBoundingClientRect();
          if (r.top < 0 || r.bottom > innerHeight + 0.5 || r.right > innerWidth + 0.5) out.push('panel off screen');
          const prim = panel.querySelector('.btn--primary')?.getBoundingClientRect();
          if (prim && (prim.bottom > innerHeight + 0.5 || prim.top < 0)) out.push('primary off screen');
        }
        return out;
      }).then((o) => bad.push(...o.map((x) => `${vp.width}x${vp.height} ${what}: ${x}`)));
      for (const vp of [{ width: 320, height: 320 }, { width: 360, height: 640 }, { width: 844, height: 390 }, { width: 1280, height: 800 }]) {
        const { ctx, p } = await ctxAt(vp, '?floor=f0&ghosts=300');
        await win(p);
        await p.waitForSelector('#end select.picker');
        await layout(p, 'curse step', vp);
        await p.getByRole('button', { name: 'Skip' }).click();
        await p.waitForFunction(() => /Set a trap/.test(document.getElementById('end').innerText));
        await layout(p, 'trap step', vp);
        await p.getByRole('button', { name: 'Centre' }).click();
        await p.locator('#end select.picker').selectOption('spikes');
        await p.locator('#end .btn--primary').click();
        await p.waitForFunction(() => /Your trap/.test(document.getElementById('end').innerText));
        await layout(p, 'plate', vp);
        await p.locator('#end .carvings__open').click();
        await layout(p, 'carvings', vp);
        await p.locator('#end .carvings__row').first().click();
        await layout(p, 'card', vp);
        const card = await p.evaluate(() => { const r = document.querySelector('#card .ghost-card').getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight && r.right <= innerWidth; });
        if (!card) bad.push(`${vp.width}x${vp.height} card off screen`);
        await ctx.close();
      }
      check('layout 320×320 to 1280×800: curse step, trap step, plate, carvings list and voting card fit with 44 px targets', bad.length === 0, bad.join(' ; '));
    }
  }


  // 15. Phase 8: the yesterday line, a cursed floor, a death to a player's trap, the owner's news, the server tutorial flag
  {
    const ctxAt = async (vp, q = '', init = () => localStorage.setItem('descent:f0', '1')) => {
      const ctx = await browser.newContext({ viewport: vp });
      await ctx.addInitScript(init);
      const p = await ctx.newPage();
      p.on('pageerror', (e) => errs.push(String(e)));
      p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
      await p.goto(`${URL}${q}`);
      await p.waitForFunction(() => window.__descent);
      await p.evaluate(() => window.__descent.ready);
      await p.evaluate(() => { const e = document.getElementById('end'); if (e.classList.contains('end--intro')) e.querySelector('.btn--primary').click(); });
      return { ctx, p };
    };
    const kill = (p) => p.evaluate(async () => { window.__descent.skipAnim(true); for (const a of 'DRRURRRRRRRLRLR') await window.__descent.act(a); });
    {
      const { ctx, p } = await ctxAt({ width: 390, height: 844 }, '?floor=f0&yesterday=1&curse=frail');
      const chip = await p.locator('.hud__floor').getAttribute('aria-label');
      check('a cursed floor shows its curse: a blood mark on the floor number, named in its label', /curse: Frail/.test(String(chip)) && (await p.locator('.hud__floor[data-cursed]').count()) === 1 && (await S(p)).hearts === 2, String(chip));
      await ctx.close();
    }
    {
      const { ctx, p } = await ctxAt({ width: 390, height: 844 }, '?floor=trap');
      await kill(p);
      await p.waitForSelector('#end select.picker');
      const death = await p.locator('#end').innerText();
      await p.getByRole('button', { name: 'Skip' }).click();
      await p.waitForFunction(() => /Score/.test(document.getElementById('end').innerText));
      await p.reload();
      await p.waitForFunction(() => window.__descent);
      await p.waitForFunction(() => /Score/.test(document.getElementById('end').innerText));
      const plate = await p.locator('#end').innerText();
      const mine = await p.evaluate(() => window.__descent.ghosts().list.find((g) => g.mine));
      check('a death to a player\'s trap names its owner: death panel, plate after reload, and your ghost', /The spikes set by u\/trapper took you/.test(death) && /A trap set by u\/trapper took you/.test(plate) && mine?.by === 'trapper', `${death.split('\n')[2]} | ${plate.split('\n')[2]}`);
      await ctx.close();
    }
    {
      const { ctx, p } = await ctxAt({ width: 390, height: 844 }, '?floor=f0&mytrap=2,1&yesterday=1&nointro=0');
      await p.goto(`${URL}?floor=f0&mytrap=2,1&yesterday=1`);
      await p.waitForFunction(() => window.__descent);
      await p.evaluate(() => window.__descent.ready);
      const line = await p.locator('#end').innerText();
      await p.evaluate(() => document.querySelector('#end .btn--primary').click());
      await p.evaluate(async () => { window.__descent.skipAnim(true); for (let i = 0; i < 1500 && !window.__descent.state().ended; i++) await window.__descent.act('W'); });
      await p.waitForSelector('#end select.picker');
      await p.getByRole('button', { name: 'Skip' }).click();
      await p.waitForFunction(() => /Score/.test(document.getElementById('end').innerText));
      const plate = await p.locator('#end').innerText();
      check('a trap owner sees what their trap did, on the intro and on the plate', /Your spikes hurt 2 and took 1 here\./.test(line) && /Your spikes hurt 2 and took 1 here\./.test(plate), line.replace(/\n+/g, ' | '));
      await ctx.close();
    }
    {
      // Empty browser storage (a deploy), but the server remembers the tutorial: the day's floor opens directly.
      const { ctx, p } = await ctxAt({ width: 390, height: 844 }, '', () => localStorage.setItem('descent:local:tutorial', 'true'));
      check('the Floor 0 flag lives on the server: empty storage still skips the tutorial', (await S(p)).floor === 1 && (await p.evaluate(() => localStorage.getItem('descent:f0'))) === null, `floor ${(await S(p)).floor}`);
      await ctx.close();
    }
    {
      const bad = [];
      const layout = (p, what, vp) => p.evaluate(() => {
        const out = [];
        if (document.documentElement.scrollWidth > innerWidth) out.push('hscroll');
        for (const el of document.querySelectorAll('.hud__floor, #end:not([hidden]) .end__panel')) {
          const r = el.getBoundingClientRect();
          if (r.width && (r.right > innerWidth + 0.5 || r.bottom > innerHeight + 0.5 || r.left < 0)) out.push(`${el.id || el.className} off screen`);
        }
        const hud = document.getElementById('hud');
        if (hud.scrollWidth > hud.clientWidth + 1) out.push('HUD overflows');
        for (const b of document.querySelectorAll('#end button')) { const r = b.getBoundingClientRect(); if (r.width && r.height < 44) out.push(`small ${b.textContent}`); }
        return out;
      }).then((o) => bad.push(...o.map((x) => `${vp.width}x${vp.height} ${what}: ${x}`)));
      for (const vp of [{ width: 320, height: 320 }, { width: 360, height: 640 }, { width: 844, height: 390 }, { width: 1280, height: 800 }]) {
        const { ctx, p } = await ctxAt(vp, '?floor=trap&curse=light-sleepers&yesterday=1&mytrap=3,2');
        await kill(p);
        await p.waitForSelector('#end select.picker');
        await layout(p, 'trap death', vp);
        await p.getByRole('button', { name: 'Skip' }).click();
        await p.waitForFunction(() => /Score/.test(document.getElementById('end').innerText));
        await layout(p, 'plate', vp);
        await ctx.close();
      }
      check('layout 320×320 to 1280×800: cursed floor number, trap death and plate fit', bad.length === 0, bad.join(' ; '));
    }
  }


  // 16. Phase 9: the intro in each state, two taps from the splash, the board (inside and outside the top), the lifetime record
  {
    const raw = async (vp, url) => {
      const ctx = await browser.newContext({ viewport: vp });
      await ctx.addInitScript(() => localStorage.setItem('descent:f0', '1'));
      const p = await ctx.newPage();
      p.on('pageerror', (e) => errs.push(String(e)));
      p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
      await p.goto(url);
      return { ctx, p };
    };
    const ready = async (p) => { await p.waitForFunction(() => window.__descent); await p.evaluate(() => window.__descent.ready); };
    const endText = async (p) => (await p.locator('#end').innerText()).replace(/\n+/g, ' | ');
    const isIntro = (p) => p.evaluate(() => document.getElementById('end').classList.contains('end--intro'));
    const states = [
      ['Floor 1 (no yesterday)', '?floor=f0', /The first floor\. Nobody has fallen yet\./, /No curse today\./],
      ['under 3 deaths', '?floor=f0&yesterday=few', /Only 2 fell on Floor \d+: too few to move anything\./, /No curse today\./],
      ['a full day, cursed', '?yesterday=1&curse=frail&ghosts=20', /23 fell on Floor \d+, most in the north-east; 9 cleared it\./, /Cursed: Frail, start on 2 hearts\./],
    ];
    for (const [name, q, a, b] of states) {
      const { ctx, p } = await raw({ width: 390, height: 844 }, `${URL}${q}`);
      await ready(p);
      const t = await endText(p);
      const cells = await p.locator('.intro-compass__cell').count();
      check(`intro, ${name}: states what today's floor holds, one Descend`, (await isIntro(p)) && a.test(t) && b.test(t) && cells === 9 && (await p.locator('#end .btn--primary').innerText()) === 'Descend', t.slice(0, 160));
      await ctx.close();
    }
    {
      // The danger line follows the stored floor: the fixture's deaths peak in the north-east, the floor's danger elsewhere.
      const { ctx, p } = await raw({ width: 390, height: 844 }, `${URL}?yesterday=1&ghosts=20`);
      await ready(p);
      const t = await endText(p);
      const marked = await p.evaluate(() => ({ dead: [...document.querySelectorAll('.intro-compass__cell')].findIndex((c) => c.hasAttribute('data-deadliest')), danger: [...document.querySelectorAll('.intro-compass__cell')].findIndex((c) => c.hasAttribute('data-danger')) }));
      check('intro reads today\'s stored floor: where the danger actually is, beside where the crowd died', marked.dead === 2 && marked.danger >= 0 && (marked.danger === 2 || /Today's danger gathered in the/.test(t)), JSON.stringify(marked));
      await ctx.close();
    }
    {
      // Two taps: splash Descend, then intro Descend; the first move is then open.
      const { ctx, p } = await raw({ width: 390, height: 844 }, 'http://localhost:5190/splash.html');
      await p.waitForFunction(() => !document.getElementById('go').disabled);
      await p.locator('#go').click(); // tap 1
      await ready(p);
      await p.locator('#end .btn--primary').click(); // tap 2
      await p.keyboard.press('ArrowDown'); // the first move
      await p.waitForTimeout(300);
      const s1 = await S(p);
      check('a returning player reaches the first move in two taps from the splash', s1.floor === 1 && s1.turn === 1 && (await p.locator('#end').isHidden()), `floor ${s1.floor} turn ${s1.turn}`);
      await ctx.close();
    }
    const die = (p) => p.evaluate(async () => { window.__descent.skipAnim(true); for (let i = 0; i < 1500 && !window.__descent.state().ended; i++) await window.__descent.act('W'); });
    const toPlate = async (p) => {
      await p.evaluate(() => { const e = document.getElementById('end'); if (e.classList.contains('end--intro')) e.querySelector('.btn--primary').click(); });
      await die(p);
      await p.waitForSelector('#end select.picker');
      await p.getByRole('button', { name: 'Skip' }).click();
      await p.waitForFunction(() => /Score/.test(document.getElementById('end').innerText));
    };
    {
      const { ctx, p } = await raw({ width: 390, height: 844 }, `${URL}?board=5&ghosts=20`);
      await ready(p);
      await toPlate(p);
      const plate = await endText(p);
      const maps = await p.locator('#end .minimap').count();
      await p.locator('#end .board__open').click();
      await p.waitForSelector('#end .board__row');
      const inside = await p.evaluate(() => ({ you: [...document.querySelectorAll('#end .board__row--you')].length, gap: !!document.querySelector('#end .board__gap'), rows: document.querySelectorAll('#end .board__row').length }));
      check('the already-played plate: streak, live count, countdown, mini-map, Board and Chronicle', /Streak 1 floor/.test(plate) && /fell here today/.test(plate) && /next floor in \dh/.test(plate) && maps === 1, plate.slice(0, 200));
      check('the board with you inside the top rows: your row marked, no gap', inside.you === 1 && !inside.gap && inside.rows === 6, JSON.stringify(inside));
      await p.locator('#end .btn--primary').click(); // Back
      await p.locator('#end .carvings__open').click();
      await p.locator('#end .carvings__row').first().click();
      await p.waitForFunction(() => /Deaths/.test(document.getElementById('card').innerText));
      const card = (await p.locator('#card').innerText()).replace(/\n+/g, ' | ');
      check('the ghost card shows the lifetime record (deaths, trusted, liar)', /Deaths \| 7 \| Trusted \| 12 \| Liar \| 3/.test(card), card);
      await p.keyboard.press('Escape');
      await ctx.close();
    }
    {
      const { ctx, p } = await raw({ width: 390, height: 844 }, `${URL}?board=40`);
      await ready(p);
      await toPlate(p);
      await p.locator('#end .board__open').click();
      await p.waitForSelector('#end .board__row');
      const outside = await p.evaluate(() => ({ you: document.querySelector('#end .board__row--you')?.textContent, gap: !!document.querySelector('#end .board__gap'), rows: document.querySelectorAll('#end .board__row').length }));
      check('the board with you outside the top rows: top 10, a gap, then your row and rank', outside.gap && outside.rows === 11 && /^41/.test(outside.you ?? ''), JSON.stringify(outside));
      await p.locator('#end .btn--primary').click();
      await p.locator('#end .chronicle__open').click();
      await p.waitForFunction(() => /Chronicle/.test(document.getElementById('end').innerText));
      check('the Chronicle opens from the plate', /ledger/.test(await endText(p)), (await endText(p)).slice(0, 100));
      await ctx.close();
    }
    {
      const bad = [];
      const layout = (p, what, vp) => p.evaluate(() => {
        const out = [];
        if (document.documentElement.scrollWidth > innerWidth) out.push('hscroll');
        const panel = document.querySelector('#end:not([hidden]) .end__panel');
        if (panel) {
          const r = panel.getBoundingClientRect();
          if (r.top < -0.5 || r.bottom > innerHeight + 0.5 || r.right > innerWidth + 0.5) out.push('panel off screen');
          const prim = panel.querySelector('.btn--primary')?.getBoundingClientRect();
          if (!prim || prim.bottom > innerHeight + 0.5 || prim.top < 0) out.push('primary off screen');
        }
        for (const b of document.querySelectorAll('#end button')) { const r = b.getBoundingClientRect(); if (r.width && (r.height < 44 || r.width < 44)) out.push(`small ${b.textContent.trim().slice(0, 10)}`); }
        for (const n of document.querySelectorAll('#end .board__name')) if (n.scrollWidth > n.clientWidth + 1) out.push(`name clipped ${n.textContent}`);
        return out;
      }).then((o) => bad.push(...o.map((x) => `${vp.width}x${vp.height} ${what}: ${x}`)));
      for (const vp of [{ width: 320, height: 320 }, { width: 360, height: 640 }, { width: 844, height: 390 }, { width: 1280, height: 800 }]) {
        for (const q of ['?floor=f0', '?floor=f0&yesterday=few', '?yesterday=1&curse=frail&mytrap=2,1&ghosts=20&board=40']) {
          const { ctx, p } = await raw(vp, `${URL}${q}`);
          await ready(p);
          await layout(p, `intro ${q}`, vp);
          if (q.includes('board')) {
            await toPlate(p);
            await layout(p, 'plate', vp);
            await p.locator('#end .board__open').click();
            await p.waitForSelector('#end .board__row');
            await layout(p, 'board', vp);
            await p.locator('#end .btn--primary').click();
            await p.locator('#end .chronicle__open').click();
            await p.waitForFunction(() => /Chronicle/.test(document.getElementById('end').innerText));
            await layout(p, 'chronicle', vp);
          }
          await ctx.close();
        }
        const sp = await raw(vp, 'http://localhost:5190/splash.html?ghosts=20');
        await sp.p.waitForFunction(() => !document.getElementById('go').disabled);
        const s = await sp.p.evaluate(() => { const b = document.getElementById('go').getBoundingClientRect(); return document.documentElement.scrollWidth <= innerWidth && b.bottom <= innerHeight + 0.5 && b.height >= 44 && !!document.querySelector('.splash__view canvas'); });
        if (!s) bad.push(`${vp.width}x${vp.height} splash`);
        await sp.ctx.close();
      }
      check('layout 320×320 to 1280×800: intro states, plate, board (a 20-character name unclipped), Chronicle and splash fit', bad.length === 0, bad.join(' ; '));
    }
  }

  } catch (e) {
    // A step that throws (a timeout) is recorded after the last check that ran, so the rest of the report survives.
    check(`suite stopped after "${results.at(-1)?.name}"`, false, String(e).split('\n')[0]);
  }
  return { passed: results.filter((r) => r.pass).length, failed: results.filter((r) => !r.pass), total: results.length, errs, results: results.map((r) => `${r.pass ? 'PASS' : 'FAIL'} ${r.name}${r.detail ? ' — ' + r.detail : ''}`) };
}
