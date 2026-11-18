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
  // Phase 11c: a run ends on its one result card; carving, the curse vote and the trap are optional steps opened from it.
  const toCard = (p) => p.waitForFunction(() => /Score/.test(document.getElementById('end').innerText), null, { timeout: 12000 });
  const toPicker = async (p) => {
    await toCard(p);
    await p.locator('#end .btn--primary').click();
    await p.waitForSelector('#end select.picker');
  };

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
    const r = await S(p);
    locks.sort((x, y) => x - y);
    check('animation lock per turn <= 120 ms (+frame slack)', locks[locks.length - 1] <= 140, `median ${locks[9].toFixed(0)} max ${locks[locks.length - 1].toFixed(0)} ms`);
    // Phase 11c: a newcomer's first clear of Floor 0 opens the day's floor at its intro, with no panel or tap in between.
    check('first visit: clearing Floor 0 by actions opens the day\'s floor at its intro, one primary action', r.floor === 1 && r.turn === 0 && !r.ended && (await endVisible(p)) && (await p.locator('#end .btn--primary').count()) === 1 && (await p.evaluate(() => document.getElementById('end').classList.contains('end--intro'))), `floor ${r.floor} turn ${r.turn}`);
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
    await toCard(p); // saved: the full result card replaces "Saving your run…"
    check('a finished run lands on its result card (no retry), with one primary action', (await p.locator('#end .btn--primary').count()) === 1 && !(await p.getByRole('button', { name: 'Retry' }).isVisible()), (await endText(p)).replace(/\n/g, ' | '));
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
    await toCard(c2.p); // the retry saved it: the full result card replaces the saving one
    check('offline: Saving, then Not saved after 3 retries, then Retry saves and the result card arrives', /Saving/.test(saving) && !/Retry/.test(saving), saving.replace(/\n/g, ' | '));
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
      // Far from any ghost the line is not a carving (a newcomer's Floor 0 shows the practice line there, Phase 10b).
      const hiddenFar = !/Trap ahead/.test((await p.locator('#carving').isVisible()) ? await p.locator('#carving').innerText() : '');
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
      await toPicker(p); // the card's Carve opens the carving step
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
      await toCard(p);
      await p.waitForFunction(() => /left no carving/.test(document.getElementById('end').innerText), null, { timeout: 8000 });
      const plate = await endText(p);
      await p.locator('#end .btn--primary').click(); // Carve
      await p.locator('#end select.picker').selectOption('safe-way:L');
      await p.locator('#end .btn--primary').click();
      await p.waitForFunction(() => /Your ghost: Safe this way ←/.test(document.getElementById('end').innerText), null, { timeout: 8000 });
      check('skip, then carve later from the result plate; the path carries its direction', /Carve/.test(plate), flat(await endText(p)));
      await ctx.close();
    }

    // Offline: the result card says the run is saving (then "Not saved" with Retry); once the network is back it arrives.
    {
      const { ctx, p } = await ctxAt({ width: 390, height: 844 });
      await p.evaluate(() => window.__descent.offline(true));
      await dieHere(p);
      const queued = await endText(p);
      await p.waitForTimeout(1200);
      await p.evaluate(() => window.__descent.offline(false));
      await p.waitForFunction(() => /Score/.test(document.getElementById('end').innerText) || !!document.querySelector('#end .save__retry:not([hidden])'), null, { timeout: 12000 });
      if (await p.locator('#end .save__retry:not([hidden])').count()) await p.locator('#end .save__retry').click();
      await toCard(p);
      check('a run that cannot save yet shows its card saving (Retry if it fails); the full card arrives once the network is back', /You fell/.test(queued) && /Saving your run/.test(queued), flat(queued));
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
        await toPicker(p);
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
      await toPicker(p); // the card's "Vote on a curse" step
      const disabled = await p.locator('#end .btn--primary').isDisabled();
      await p.locator('#end select.picker').selectOption('deep-dark');
      await p.locator('#end .btn--primary').click();
      await toPicker(p); // back on the card, its next step: "Set a trap"
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

    // One card after a win: its primary is the curse vote; skipping it offers the trap; skipping that leaves no step.
    {
      const { ctx, p } = await ctxAt({ width: 390, height: 844 }, '?floor=f0');
      await win(p);
      await toCard(p);
      const p0 = await p.locator('#end .btn--primary').innerText();
      await p.locator('#end .btn--primary').click();
      await p.getByRole('button', { name: 'Skip' }).click();
      await toCard(p);
      const p1 = await p.locator('#end .btn--primary').innerText();
      await p.locator('#end .btn--primary').click();
      await p.getByRole('button', { name: 'Skip' }).click();
      await toCard(p);
      const t = await endText(p);
      const p2 = await p.locator('#end .btn--primary').innerText();
      check('a win lands on one result card: Vote on a curse, then Set a trap, each optional; skipped, nothing is stored and no step remains', p0 === 'Vote on a curse' && p1 === 'Set a trap' && !/Your curse vote|Your trap/.test(t) && !/Vote on a curse|Set a trap/.test(p2) && /Streak/.test(t), `${p0} → ${p1} → ${p2}`);
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
      await toCard(p);
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
        await toCard(p);
        await layout(p, 'result card', vp);
        await toPicker(p);
        await layout(p, 'curse step', vp);
        await p.getByRole('button', { name: 'Skip' }).click();
        await toPicker(p);
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
      const death = await p.locator('#end').innerText(); // the card while it saves
      await toCard(p);
      await p.reload();
      await p.waitForFunction(() => window.__descent);
      await p.waitForFunction(() => /Score/.test(document.getElementById('end').innerText));
      const plate = await p.locator('#end').innerText();
      const mine = await p.evaluate(() => window.__descent.ghosts().list.find((g) => g.mine));
      check('a death to a player\'s trap names its owner: death panel, plate after reload, and your ghost', /(The spikes|A trap) set by u\/trapper took you/.test(death) && /A trap set by u\/trapper took you/.test(plate) && mine?.by === 'trapper', `${death.split('\n')[2]} | ${plate.split('\n')[2]}`);
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
      await toCard(p);
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
        await toCard(p);
        await layout(p, 'result card after a trap death', vp);
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
      await toCard(p);
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


  // 17. Phase 10: the Warden: the intro in each state, the chain counting your bumps, the end line, the plate, the splash
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
    const text = async (p, sel = '#end') => (await p.locator(sel).innerText()).replace(/\n+/g, ' | ');
    const W = `${URL}?floor=warden`;
    for (const [state, want, meter] of [
      ['alive', /The Warden waits, chained\. \| 84 of 120 links \| Bump it to break a link\. Stairs are open\./, '84'],
      ['carried', /The Warden returns, still wounded\. \| 40 of 40 links/, '40'],
      ['killed', /The Warden fell to u\/Warden_Slayer_2026\. \| Its arena is quiet\. The stairs are open\./, null],
    ]) {
      const { ctx, p } = await raw({ width: 390, height: 844 }, `${W}&boss=${state}`);
      await ready(p);
      const t = await text(p);
      const now = await p.locator('#end .chain-meter').getAttribute('aria-valuenow').catch(() => null);
      const enemies = await p.evaluate(() => window.__descent.state().enemies.length);
      check(`Warden intro, ${state}: shows the boss and its chain (or its killer), one Descend`, want.test(t) && now === meter && (state === 'killed' ? enemies === 0 : enemies === 1), t.slice(0, 180));
      await ctx.close();
    }
    {
      const { ctx, p } = await raw({ width: 390, height: 844 }, `${W}&boss=alive`);
      await ready(p);
      await p.locator('#end .btn--primary').click();
      await p.evaluate(async () => { window.__descent.skipAnim(true); for (const a of 'DDRRR') await window.__descent.act(a); }); // (4,3): beside the block
      const before = await p.locator('#hud [aria-label^="Warden chain"]').getAttribute('aria-label');
      await p.evaluate(async () => { for (const a of 'RRR') await window.__descent.act(a); });
      const after = await p.locator('#hud [aria-label^="Warden chain"]').getAttribute('aria-label');
      check('the HUD chain counts down one link per bump (its HP when the run began, less yours)', before === 'Warden chain: 84 links left' && after === 'Warden chain: 81 links left', `${before} → ${after}`);
      await p.evaluate(async () => { for (const a of 'UURRRRRDDDDD') { if (window.__descent.state().ended) break; await window.__descent.act(a); } });
      await p.waitForFunction(() => document.querySelector('#end:not([hidden])'));
      const endT = await text(p);
      check('the end of a Warden run says how many links you broke', /You broke 3 links\./.test(endT), endT.slice(0, 140));
      await toCard(p);
      const plate = await text(p);
      check('the plate shows the Warden\'s chain after your run and the links you broke', /81 of 120 links/.test(plate) && /You broke 3 links\./.test(plate), plate.slice(0, 200));
      await ctx.close();
    }
    for (const [state, want] of [['alive', /The Warden: 84 of 120 links\./], ['killed', /The Warden has fallen\./]]) {
      const { ctx, p } = await raw({ width: 390, height: 844 }, `http://localhost:5190/splash.html?floor=warden&boss=${state}`);
      await p.waitForFunction(() => !document.getElementById('go').disabled);
      const t = await text(p, 'body');
      check(`splash, boss day (${state})`, want.test(t), t);
      await ctx.close();
    }
    {
      const bad = [];
      const fits = (p, what, vp) => p.evaluate(() => {
        const out = [];
        if (document.documentElement.scrollWidth > innerWidth) out.push('hscroll');
        const panel = document.querySelector('#end:not([hidden]) .end__panel');
        if (panel) {
          const r = panel.getBoundingClientRect();
          if (r.top < -0.5 || r.bottom > innerHeight + 0.5 || r.right > innerWidth + 0.5) out.push('panel off screen');
          const prim = panel.querySelector('.btn--primary')?.getBoundingClientRect();
          if (!prim || prim.bottom > innerHeight + 0.5 || prim.top < 0) out.push('primary off screen');
          const m = panel.querySelector('.chain-meter');
          if (m && m.scrollWidth > m.clientWidth + 1) out.push('meter text clipped');
        }
        const hud = document.getElementById('hud')?.getBoundingClientRect();
        if (hud && hud.right > innerWidth + 0.5) out.push('hud overflow');
        return out;
      }).then((o) => bad.push(...o.map((x) => `${vp.width}x${vp.height} ${what}: ${x}`)));
      for (const vp of [{ width: 320, height: 320 }, { width: 360, height: 640 }, { width: 844, height: 390 }, { width: 1280, height: 800 }]) {
        for (const state of ['alive', 'carried', 'killed']) {
          const { ctx, p } = await raw(vp, `${W}&boss=${state}`);
          await ready(p);
          await fits(p, `intro ${state}`, vp);
          if (state === 'alive') {
            await p.locator('#end .btn--primary').click();
            await p.evaluate(async () => { window.__descent.skipAnim(true); for (const a of 'DDRRR') await window.__descent.act(a); });
            await fits(p, 'hud chain', vp);
            await p.evaluate(async () => { for (let i = 0; i < 400 && !window.__descent.state().ended; i++) await window.__descent.act('W'); });
            await toCard(p);
            await p.waitForFunction(() => /Score/.test(document.getElementById('end').innerText));
            await fits(p, 'plate', vp);
          }
          await ctx.close();
        }
        const sp = await raw(vp, 'http://localhost:5190/splash.html?floor=warden&boss=alive');
        await sp.p.waitForFunction(() => !document.getElementById('go').disabled);
        const ok = await sp.p.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.getElementById('go').getBoundingClientRect().bottom <= innerHeight + 0.5);
        if (!ok) bad.push(`${vp.width}x${vp.height} splash boss`);
        await sp.ctx.close();
      }
      check('layout 320×320 to 1280×800: Warden intro (alive, carried, fallen), HUD chain, plate and boss splash fit', bad.length === 0, bad.join(' ; '));
    }
  }

  // 18. Phase 10b: the feedback path, flair opt-in, Delete my data, beacons, the four stranger arrivals, and layouts
  {
    const raw = async (vp, url, { f0 = true, day = 3 } = {}) => {
      const ctx = await browser.newContext({ viewport: vp });
      await ctx.addInitScript(([f0, day]) => {
        if (location.protocol === 'http:' && !sessionStorage.getItem('seeded')) {
          sessionStorage.setItem('seeded', '1');
          localStorage.setItem('descent:local:day', String(day));
          if (f0) localStorage.setItem('descent:f0', '1');
        }
      }, [f0, day]);
      const p = await ctx.newPage();
      p.on('pageerror', (e) => errs.push(String(e)));
      p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
      await p.goto(url);
      return { ctx, p };
    };
    const ready = async (p) => { await p.waitForFunction(() => window.__descent); await p.evaluate(() => window.__descent.ready); };
    const text = async (p, sel = '#end') => (await p.locator(sel).innerText()).replace(/\n+/g, ' | ');
    const W = `${URL}?floor=warden&boss=alive`;
    /** Play the arena to a death (torch out), skip the carving: the played plate. */
    const toPlate = async (p) => {
      await ready(p);
      await p.locator('#end .btn--primary').click();
      await p.evaluate(async () => { window.__descent.skipAnim(true); for (let i = 0; i < 400 && !window.__descent.state().ended; i++) await window.__descent.act('W'); });
      await toCard(p);
      await p.waitForFunction(() => /Score/.test(document.getElementById('end').innerText));
    };
    {
      const { ctx, p } = await raw({ width: 390, height: 844 }, W);
      await toPlate(p);
      const flair = p.locator('#end .flair__toggle');
      const off = (await flair.innerText()) === 'Depth as flair: Off' && (await flair.getAttribute('aria-pressed')) === 'false';
      await flair.click();
      await p.waitForFunction(() => document.querySelector('#end .flair__toggle')?.getAttribute('aria-pressed') === 'true');
      await p.reload();
      await ready(p);
      await p.waitForFunction(() => /Score/.test(document.getElementById('end').innerText));
      const kept = (await p.locator('#end .flair__toggle').innerText()) === 'Depth as flair: On';
      check('flair is opt-in: Off until you turn it on, and it stays on', off && kept);
      const beacons = await p.evaluate(() => JSON.parse(localStorage.getItem('descent:local:beacons') ?? '[]'));
      const load = beacons.find((b) => b.kind === 'load');
      const stageKeys = load?.stages ? Object.keys(load.stages).sort().join() : '';
      check('a load beacon carries the floor, a time, one of four client classes and the load stages, nothing else', load && load.depth === 3 && Number.isInteger(load.ms) && ['ios', 'android', 'mweb', 'desktop'].includes(load.client) && Object.keys(load).sort().join() === 'client,depth,kind,ms,stages' && stageKeys === 'engine,floor,intro,script', JSON.stringify(load));
      let asked = '';
      await p.route('https://www.reddit.com/**', (r) => { asked = r.request().url(); return r.abort(); });
      await p.locator('#end .report__open').click();
      await p.waitForTimeout(500);
      check('"Something broke?" opens modmail compose to the subreddit, pre-filled with floor, screen and client class', /\/message\/compose\?to=%2Fr%2F/.test(asked) && /Floor%203/.test(asked) && /result%20plate/.test(asked), asked.slice(0, 160));
      await ctx.close();
    }
    {
      const { ctx, p } = await raw({ width: 390, height: 844 }, W);
      await toPlate(p);
      await p.locator('#end .board__open').click();
      await p.waitForSelector('#end .forget__open');
      const hasPrivacy = await p.locator('#end .privacy__open').count();
      await p.locator('#end .forget__open').click();
      const ask = await text(p);
      await p.getByRole('button', { name: 'Keep my data' }).click();
      await p.waitForSelector('#end .forget__open');
      await p.locator('#end .forget__open').click();
      await p.getByRole('button', { name: 'Delete everything' }).click();
      await p.waitForFunction(() => /Descent no longer stores anything about you/.test(document.getElementById('end').innerText));
      await p.getByRole('button', { name: 'Close' }).click();
      await ready(p);
      const after = await p.evaluate(() => ({ f0: localStorage.getItem('descent:f0'), run: localStorage.getItem('descent:local:run:3'), depth: Number(document.getElementById('hud').innerText.trim().split(/\s+/)[0]) }));
      check('Delete my data: the Board links the privacy page; one confirmation, then nothing is kept and you arrive as a newcomer', hasPrivacy === 1 && /Delete my data\?/.test(ask) && after.run === null && after.f0 === null && after.depth === 0, `${ask.slice(0, 80)} ${JSON.stringify(after)}`);
      await ctx.close();
    }
    {
      const sp = await raw({ width: 390, height: 844 }, 'http://localhost:5190/splash.html?floor=warden&boss=alive');
      await sp.p.waitForFunction(() => !document.getElementById('go').disabled);
      const steps0 = await sp.p.evaluate(() => JSON.parse(localStorage.getItem('descent:local:beacons') ?? '[]').filter((b) => b.kind === 'step').map((b) => b.step));
      await sp.p.locator('#go').click();
      await sp.p.waitForURL(/game\.html/);
      const steps1 = await sp.p.evaluate(() => JSON.parse(localStorage.getItem('descent:local:beacons') ?? '[]').filter((b) => b.kind === 'step').map((b) => b.step));
      check('the splash sends the funnel\'s first two steps: splash on load, descend on the tap', steps0.join() === 'splash' && steps1.join() === 'splash,descend', `${steps0} → ${steps1}`);
      await sp.ctx.close();
    }
    {
      // The privacy text opens inside the game: in the splash card (Back restores it) and as a Board panel. No link out.
      const vp = { width: 320, height: 320 };
      const sp = await raw(vp, 'http://localhost:5190/splash.html');
      await sp.p.waitForFunction(() => !document.getElementById('go').disabled);
      await sp.p.locator('#privacy').click();
      const inCard = await sp.p.evaluate(() => { const t = document.querySelector('.splash__text'); const back = t?.querySelector('.btn'); return { text: t?.innerText.slice(0, 60) ?? '', url: location.href, fits: document.documentElement.scrollWidth <= innerWidth, back: !!back && back.getBoundingClientRect().bottom <= innerHeight + 0.5 }; });
      await sp.p.getByRole('button', { name: 'Back' }).click();
      const restored = await sp.p.locator('#go').isVisible();
      check('splash Privacy: the text opens in the card at 320×320 (Back in reach) and Back restores the card; no navigation', /what it stores and why/.test(inCard.text) && /splash\.html$/.test(inCard.url) && inCard.fits && inCard.back && restored, JSON.stringify(inCard));
      await sp.ctx.close();
      const { ctx, p } = await raw({ width: 390, height: 844 }, W);
      await toPlate(p);
      await p.locator('#end .board__open').click();
      await p.waitForSelector('#end .privacy__open');
      await p.locator('#end .privacy__open').click();
      const t = await text(p);
      await p.getByRole('button', { name: 'Back' }).click();
      const backOnBoard = await p.locator('#end .forget__open').isVisible();
      check('Board Privacy: an in-game panel with what is stored, and Back returns to the Board', /Privacy \| What Descent stores and why/.test(t) && /Delete my data/.test(t) && backOnBoard, t.slice(0, 120));
      await ctx.close();
    }
    // The stranger's four arrivals.
    {
      const old = await raw({ width: 390, height: 844 }, `${URL}?post=1`);
      await ready(old.p);
      const t = await text(old.p);
      const s = await raw({ width: 390, height: 844 }, 'http://localhost:5190/splash.html?post=1');
      await s.p.waitForFunction(() => !document.getElementById('go').disabled);
      const st = await text(s.p, 'body');
      check('stranger on an old floor\'s post: told it closed, one button to today\'s floor (game and splash)', /Floor 1 has closed \| Today is Floor 3\./.test(t) && /Closed\. Today is Floor 3\. \| Today's floor/.test(st), `${t.slice(0, 80)} / ${st.slice(0, 80)}`);
      await old.ctx.close();
      await s.ctx.close();
    }
    {
      // A floor you played, after it closed: it names today's floor and goes there (splash and plate), not a dead end.
      const { ctx, p } = await raw({ width: 390, height: 844 }, W, { day: 3 });
      await toPlate(p);
      await p.evaluate(() => localStorage.setItem('descent:local:day', '4'));
      await p.goto(`${URL}?floor=warden&boss=alive&post=3`);
      await ready(p);
      await p.waitForFunction(() => /Score/.test(document.getElementById('end').innerText));
      const prim = await p.locator('#end .btn--primary').innerText();
      await p.goto('http://localhost:5190/splash.html?floor=warden&boss=alive&post=3'); // same tab: a new one would re-seed day 3
      await p.waitForFunction(() => !document.getElementById('go').disabled);
      const st = (await p.locator('body').innerText()).replace(/\n+/g, ' | ');
      check('stranger on an old floor they played: the plate and the splash point to today\'s floor', prim === 'Go to Floor 4' && /Today is Floor 4\. \| Today's floor/.test(st), `${prim} / ${st.slice(0, 90)}`);
      await ctx.close();
    }
    {
      const g = await raw({ width: 390, height: 844 }, `${URL}?loggedOut=1`);
      await ready(g.p);
      const t = await text(g.p);
      const s = await raw({ width: 390, height: 844 }, 'http://localhost:5190/splash.html?loggedOut=1');
      await s.p.waitForFunction(() => !document.getElementById('go').disabled);
      const st = await text(s.p, 'body');
      check('stranger logged out: Log in to descend (game and splash), and the privacy link is on the splash', /Log in to descend/.test(t) && /Log in to descend \|[^|]*Privacy/.test(st), `${t.slice(0, 80)} / ${st.slice(0, 80)}`);
      await g.ctx.close();
      await s.ctx.close();
    }
    {
      const { ctx, p } = await raw({ width: 390, height: 844 }, W, { f0: false });
      await ready(p);
      const line = await text(p, '#carving').catch(() => '');
      check('stranger mid-day on a Warden floor: Floor 0 first, and it says it is practice (short enough not to be cut off)', /^Practice first: find the stairs\.$/.test(line.trim()), line);
      await ctx.close();
    }
    {
      const { ctx, p } = await raw({ width: 390, height: 844 }, W);
      await ready(p);
      await p.locator('#end .btn--primary').click();
      await p.evaluate(async () => { window.__descent.skipAnim(true); for (const a of 'DD') await window.__descent.act(a); });
      // An app update serves the game from a new origin: the device's storage is empty, the server's is not.
      await p.evaluate(() => { for (const k of Object.keys(localStorage)) if (!k.startsWith('descent:local:')) localStorage.removeItem(k); });
      await p.reload();
      await ready(p);
      const st = await p.evaluate(() => ({ depth: Number(document.getElementById('hud').innerText.trim().split(/\s+/)[0]), turn: window.__descent.state().turn }));
      const t = await text(p);
      check('stranger on the first day after an update: no Floor 0 again (the server remembers), the day\'s intro, a fresh run', st.depth === 3 && st.turn === 0 && /Floor 3/.test(t) && /Descend/.test(t), `${JSON.stringify(st)} ${t.slice(0, 60)}`);
      await ctx.close();
    }
    // Layouts for everything new: plate links, the Board's data row, the delete confirmation, the practice line, the splash link.
    {
      const bad = [];
      for (const vp of [{ width: 320, height: 320 }, { width: 375, height: 667 }, { width: 1280, height: 800 }]) {
        const fit = (p, what) => p.evaluate(() => {
          const out = [];
          if (document.documentElement.scrollWidth > innerWidth) out.push('hscroll');
          const panel = document.querySelector('#end:not([hidden]) .end__panel');
          const prim = panel?.querySelector('.btn--primary')?.getBoundingClientRect();
          if (panel && (!prim || prim.bottom > innerHeight + 0.5)) out.push('primary off screen');
          for (const b of document.querySelectorAll('#end:not([hidden]) .btn')) if (b.scrollWidth > b.clientWidth + 1) out.push(`clipped "${b.textContent}"`);
          return out;
        }).then((o) => o.forEach((x) => bad.push(`${vp.width}x${vp.height} ${what}: ${x}`)));
        const { ctx, p } = await raw(vp, W);
        await toPlate(p);
        await fit(p, 'plate');
        await p.locator('#end .board__open').click();
        await p.waitForSelector('#end .forget__open');
        await fit(p, 'board');
        await p.locator('#end .forget__open').click();
        await fit(p, 'delete confirm');
        await ctx.close();
        const n = await raw(vp, W, { f0: false });
        await ready(n.p);
        const line = await n.p.evaluate(() => { const c = document.getElementById('carving'); const r = c.getBoundingClientRect(); return !c.hidden && r.right <= innerWidth + 0.5 && document.documentElement.scrollWidth <= innerWidth; });
        if (!line) bad.push(`${vp.width}x${vp.height} practice line`);
        await n.ctx.close();
        const sp = await raw(vp, 'http://localhost:5190/splash.html');
        await sp.p.waitForFunction(() => !document.getElementById('go').disabled);
        const ok = await sp.p.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.getElementById('go').getBoundingClientRect().bottom <= innerHeight + 0.5 && document.getElementById('privacy').getBoundingClientRect().bottom <= innerHeight + 0.5);
        if (!ok) bad.push(`${vp.width}x${vp.height} splash privacy`);
        await sp.ctx.close();
      }
      check('layout 320×320 to 1280×800: plate links, Board data row, delete confirmation, practice line, splash privacy link', bad.length === 0, bad.join(' ; '));
    }
  }

  // 19. Phase 11: polish never slows play; the flame shows first; sound waits for a tap and stays muted when told; touch never scrolls
  {
    const fresh = async (vp, url, init) => {
      const ctx = await browser.newContext({ viewport: vp, ...(init?.ctx || {}) });
      await ctx.addInitScript(() => {
        window.__audio = 0;
        const A = window.AudioContext;
        if (A) window.AudioContext = class extends A { constructor(...a) { super(...a); window.__audio++; } };
      });
      if (init?.script) await ctx.addInitScript(init.script);
      const p = await ctx.newPage();
      p.on('pageerror', (e) => errs.push(String(e)));
      p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
      await p.goto(url);
      return { ctx, p };
    };
    const ready = async (p) => { await p.waitForFunction(() => window.__descent); await p.evaluate(() => window.__descent.ready); };
    {
      // Timing: the same 18 moves, pressed as a held key repeats, take no longer than before the polish (1.62–1.69 s measured on 3dd998e).
      const { ctx, p } = await fresh({ width: 1280, height: 800 }, URL);
      await ready(p);
      const route = 'DRRURRRRDDDDLLLLLL';
      const t0 = Date.now();
      let i = 0;
      while (i < route.length) {
        if ((await p.evaluate(() => window.__descent.state().turn)) >= i) { await p.keyboard.press(KEY[route[i]]); i++; }
        await p.waitForTimeout(30);
      }
      await p.waitForFunction((n) => window.__descent.state().turn >= n, route.length);
      const ms = Date.now() - t0;
      check('a fixed run of 18 moves takes no longer than before the polish (≤ 1850 ms; baseline 1618–1689 ms)', ms <= 1850, `${ms} ms`);
      await ctx.close();
    }
    {
      // The flame: painted with the first paint, hidden once the floor is up.
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
      const p = await ctx.newPage();
      await p.goto(URL, { waitUntil: 'commit' });
      await p.waitForSelector('#boot', { state: 'visible', timeout: 2000 });
      await p.waitForFunction(() => performance.getEntriesByType('paint').length > 0);
      const paint = await p.evaluate(() => performance.getEntriesByType('paint').map((e) => [e.name, Math.round(e.startTime)]));
      await p.waitForFunction(() => window.__descent);
      await p.evaluate(() => window.__descent.ready);
      const gone = await p.locator('#boot').isHidden();
      const fp = paint.find(([n]) => n === 'first-paint')?.[1] ?? 0;
      check('the loading flame is in the first paint (within 100 ms locally) and gives way to the floor', fp > 0 && fp <= 100 && gone, JSON.stringify(paint));
      await ctx.close();
    }
    {
      // Sound: nothing on the splash; nothing in the game before a tap or key; one context after; muted stays muted.
      const sp = await fresh({ width: 390, height: 844 }, 'http://localhost:5190/splash.html');
      await sp.p.waitForFunction(() => !document.getElementById('go').disabled);
      await sp.p.locator('#go').click();
      await sp.p.waitForURL(/game\.html/);
      await ready(sp.p);
      const before = await sp.p.evaluate(() => window.__audio);
      await sp.ctx.close();
      const { ctx, p } = await fresh({ width: 390, height: 844 }, URL);
      await ready(p);
      const idle = await p.evaluate(() => window.__audio);
      await p.keyboard.press('ArrowDown');
      await p.waitForFunction(() => window.__descent.state().turn >= 1);
      const after = await p.evaluate(() => ({ n: window.__audio, sound: window.__descent.metrics().sound }));
      const mute = p.locator('#hud .hud__mute');
      const label0 = await mute.innerText();
      await mute.click();
      await p.reload();
      await ready(p);
      const kept = await p.evaluate(() => ({ muted: window.__descent.metrics().muted, label: document.querySelector('#hud .hud__mute').innerText }));
      await p.keyboard.press('ArrowDown');
      const silent = await p.evaluate(() => window.__audio);
      check('sound: never on the splash, none before the first key, one context after it, a step makes the step sound', before === 0 && idle === 0 && after.n === 1 && after.sound === 'step', `${before} ${idle} ${JSON.stringify(after)}`);
      check('the mute sits in the HUD and is remembered: muted after a reload, and no audio starts while muted', label0 === 'Sound' && kept.muted && kept.label === 'Muted' && silent === 0, `${label0} ${JSON.stringify(kept)} ${silent}`);
      await ctx.close();
    }
    {
      // Reduced motion: damage plays no hit-stop and no shake (it still hurts, still sounds, still shows the hurt frame).
      const { ctx, p } = await fresh({ width: 390, height: 844 }, URL, { ctx: { reducedMotion: 'reduce' } });
      await ready(p);
      await p.evaluate(() => window.__descent.load(0, { mercy: false, torch: 3 }));
      await p.evaluate(async () => { for (let i = 0; i < 12 && !window.__descent.state().ended; i++) await window.__descent.act('W'); });
      const m = await p.evaluate(() => window.__descent.metrics());
      const { ctx: c2, p: p2 } = await fresh({ width: 390, height: 844 }, URL);
      await ready(p2);
      await p2.evaluate(() => window.__descent.load(0, { mercy: false, torch: 3 }));
      await p2.evaluate(async () => { for (let i = 0; i < 12 && !window.__descent.state().ended; i++) await window.__descent.act('W'); });
      const m2 = await p2.evaluate(() => window.__descent.metrics());
      check('reduced motion removes hit-stop and shake; with motion, damage plays both', m.hitStops === 0 && m.shakes === 0 && m2.hitStops > 0 && m2.shakes > 0, `${JSON.stringify(m)} / ${JSON.stringify(m2)}`);
      await ctx.close();
      await c2.close();
    }
    {
      // Touch: swipes on the stage never scroll the page or pull to refresh.
      const { ctx, p } = await fresh({ width: 390, height: 844 }, URL, { ctx: { isMobile: true, hasTouch: true } });
      await ready(p);
      const css = await p.evaluate(() => ({ body: getComputedStyle(document.body).overscrollBehaviorY, html: getComputedStyle(document.documentElement).overscrollBehaviorY, stage: getComputedStyle(document.getElementById('stage')).touchAction }));
      await p.mouse.wheel(0, 600);
      const y = await p.evaluate(() => scrollY + document.documentElement.scrollTop);
      check('touch: the page cannot scroll or pull to refresh while playing; the stage takes every swipe', css.body === 'none' && css.html === 'none' && css.stage === 'none' && y === 0, `${JSON.stringify(css)} y=${y}`);
      await ctx.close();
    }
    {
      // Layout: the splash's "what is this" line and the HUD's mute fit from 320×320 up.
      const bad = [];
      for (const vp of [{ width: 320, height: 320 }, { width: 375, height: 667 }, { width: 1280, height: 800 }]) {
        const sp = await fresh(vp, 'http://localhost:5190/splash.html');
        await sp.p.waitForFunction(() => !document.getElementById('go').disabled);
        const s = await sp.p.evaluate(() => { const w = document.querySelector('.splash__what').getBoundingClientRect(); const g = document.getElementById('go').getBoundingClientRect(); return document.documentElement.scrollWidth <= innerWidth && w.height > 0 && w.right <= innerWidth + 0.5 && g.bottom <= innerHeight + 0.5; });
        if (!s) bad.push(`${vp.width}x${vp.height} splash`);
        await sp.ctx.close();
        const g = await fresh(vp, URL);
        await ready(g.p);
        const h = await g.p.evaluate(() => { const m = document.querySelector('#hud .hud__mute').getBoundingClientRect(); const hud = document.getElementById('hud'); return m.right <= innerWidth + 0.5 && hud.scrollWidth <= hud.clientWidth + 1 && document.documentElement.scrollWidth <= innerWidth; });
        if (!h) bad.push(`${vp.width}x${vp.height} hud mute`);
        await g.ctx.close();
      }
      check('layout 320×320 to 1280×800: the splash line and the HUD mute fit', bad.length === 0, bad.join(' ; '));
    }
  }

  // 20. Phase 11b: the intro is a panel: readable and Descend tappable on the floor response, with Phaser held back
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await ctx.addInitScript(() => localStorage.setItem('descent:f0', '1'));
    await ctx.route(/phaser/, async (r) => { await new Promise((ok) => setTimeout(ok, 2500)); await r.continue(); });
    const p = await ctx.newPage();
    p.on('pageerror', (e) => errs.push(String(e)));
    const t0 = Date.now();
    await p.goto(URL);
    await p.waitForSelector('#end:not([hidden]) .btn--primary', { timeout: 8000 });
    const introAt = Date.now() - t0;
    const early = await p.evaluate(() => ({ text: document.getElementById('end').innerText, hook: !!window.__descent, boot: document.getElementById('boot').hidden }));
    await p.locator('#end .btn--primary').click();
    const waiting = await p.locator('#end .btn--primary').innerText().catch(() => '');
    await p.waitForFunction(() => window.__descent);
    await p.evaluate(() => window.__descent.ready);
    await p.waitForFunction(() => document.getElementById('end').hidden);
    await p.keyboard.press('ArrowDown');
    await p.waitForFunction(() => window.__descent.state().turn >= 1, null, { timeout: 3000 }).catch(() => {});
    const turn = await p.evaluate(() => window.__descent.state().turn);
    check('the intro shows on the floor response while Phaser still loads; Descend waits for the scene, then the first move plays', /Floor \d+/.test(early.text) && /Descend/.test(early.text) && !early.hook && early.boot && waiting === 'Lighting the torch…' && turn >= 1, `intro at ${introAt} ms, ${JSON.stringify({ hook: early.hook, boot: early.boot, waiting, turn })}`);
    await ctx.close();
  }

  // 21. Phase 11c: the splash shows the start screen's essentials: name, description, date, attribution, today's stats
  {
    const ctx = await browser.newContext({ viewport: { width: 320, height: 320 } });
    const p = await ctx.newPage();
    await p.goto('http://localhost:5190/splash.html?ghosts=20');
    await p.waitForFunction(() => !document.getElementById('go').disabled);
    const t = await p.evaluate(() => ({ text: document.querySelector('.splash__card').innerText, fits: document.documentElement.scrollWidth <= innerWidth && document.querySelector('.splash__foot').getBoundingClientRect().bottom <= innerHeight + 0.5 }));
    check('splash essentials at 320×320: name, description, floor, date, attribution and today\'s stats, all on the card', /Descent/.test(t.text) && /A daily dungeon/.test(t.text) && /Floor \d+/.test(t.text) && /\d{1,2} [A-Z][a-z]{2}/.test(t.text) && /by u\//.test(t.text) && /\d+ fell here today · \d+ carved a warning/.test(t.text) && t.fits, t.text.replace(/\n+/g, ' | '));
    await ctx.close();
  }

  // 22. Phase 11d: practice. Today's floor from its card (after your run) and past floors from the Chronicle; nothing counts
  {
    const at = async (vp, q, day = 3) => {
      const ctx = await browser.newContext({ viewport: vp });
      await ctx.addInitScript((day) => { if (!sessionStorage.getItem('s')) { sessionStorage.setItem('s', '1'); localStorage.setItem('descent:f0', '1'); localStorage.setItem('descent:local:day', String(day)); } }, day);
      const p = await ctx.newPage();
      p.on('pageerror', (e) => errs.push(String(e)));
      await p.goto(`${URL}${q}`);
      await p.waitForFunction(() => window.__descent);
      await p.evaluate(() => window.__descent.ready);
      return { ctx, p };
    };
    // The local fake server caches a floor it generates (as the real server stores floors); that cache is not a write by practice.
    const stored = (p) => p.evaluate(() => JSON.stringify(Object.keys(localStorage).filter((k) => k.startsWith('descent:local:') && !k.endsWith(':beacons') && !k.startsWith('descent:local:floor:')).sort().map((k) => [k, localStorage.getItem(k)])));
    const dieOut = (p) => p.evaluate(async () => { window.__descent.skipAnim(true); for (let i = 0; i < 1500 && !window.__descent.state().ended; i++) await window.__descent.act('W'); });
    {
      const { ctx, p } = await at({ width: 390, height: 844 }, '?ghosts=20');
      await p.locator('#end .btn--primary').click();
      await dieOut(p);
      await toCard(p);
      const before = await stored(p);
      const secondary = await p.locator('#end .end__actions .btn:not(.btn--primary)').innerText();
      await p.getByRole('button', { name: 'Practice this floor' }).click();
      const tag = await p.locator('#practice').innerText();
      const st = await p.evaluate(() => ({ turn: window.__descent.state().turn, ghosts: window.__descent.ghosts().list.length, panel: !document.getElementById('end').hidden }));
      const carved = await p.evaluate(() => window.__descent.ghosts().list.find((g) => g.carving && !g.mine)?.id);
      if (carved) await p.evaluate((id) => window.__descent.card(id), carved);
      const card = carved ? await p.locator('#card').innerText() : '';
      const voteButtons = carved ? await p.locator('#card').getByRole('button', { name: /^(Trust|Liar)/ }).count() : 0;
      if (carved) await p.keyboard.press('Escape');
      await dieOut(p);
      await p.waitForFunction(() => /Practice: you fell/.test(document.getElementById('end').innerText));
      const over = await p.locator('#end').innerText();
      const after = await stored(p);
      await p.getByRole('button', { name: 'Leave practice' }).click();
      await toCard(p);
      const back = await p.evaluate(() => ({ tag: document.getElementById('practice').hidden, text: document.getElementById('end').innerText }));
      check('practice from the result card: plainly labelled, the floor\'s ghosts show, no votes, nothing stored; Leave returns to the card', secondary === 'Practice this floor' && /Practice · nothing counts/.test(tag) && /Leave/.test(tag) && st.turn === 0 && !st.panel && st.ghosts > 0 && voteButtons === 0 && /nothing was saved/.test(over) && /Practice again/.test(over) && before === after && back.tag && /Score/.test(back.text), JSON.stringify({ secondary, tag, st, card: card.slice(0, 60), same: before === after }));
      await ctx.close();
    }
    {
      const { ctx, p } = await at({ width: 390, height: 844 }, '?floor=warden&boss=alive');
      await p.locator('#end .btn--primary').click();
      await dieOut(p);
      await toCard(p);
      const before = await stored(p);
      await p.locator('#end .chronicle__open').click();
      await p.waitForSelector('#end .chronicle__practice');
      await p.locator('#end .chronicle__practice').first().click();
      await p.waitForFunction(() => !document.getElementById('practice').hidden);
      const st = await p.evaluate(() => ({ floor: window.__descent.state().floor, warden: window.__descent.state().enemies.length, hud: document.getElementById('hud').innerText }));
      await p.getByRole('button', { name: 'Leave' }).click();
      await p.waitForSelector('#end .chronicle__practice');
      const after = await stored(p);
      check('practice a past (Warden) floor from the Chronicle: the past floor with its Warden, labelled, nothing stored; Leave returns to the Chronicle', st.floor === 2 && st.warden >= 1 && !/links/.test(st.hud) && before === after, JSON.stringify(st));
      await ctx.close();
    }
    {
      const bad = [];
      for (const vp of [{ width: 320, height: 320 }, { width: 375, height: 667 }, { width: 1280, height: 800 }]) {
        const { ctx, p } = await at(vp, '?ghosts=20');
        await p.locator('#end .btn--primary').click();
        await dieOut(p);
        await toCard(p);
        await p.getByRole('button', { name: 'Practice this floor' }).click();
        const tagOk = await p.evaluate(() => { const t = document.getElementById('practice').getBoundingClientRect(); const b = document.querySelector('#practice .btn').getBoundingClientRect(); return t.right <= innerWidth + 0.5 && t.bottom <= innerHeight + 0.5 && b.height >= 44 && document.documentElement.scrollWidth <= innerWidth; });
        if (!tagOk) bad.push(`${vp.width}x${vp.height} practice notice`);
        await dieOut(p);
        await p.waitForFunction(() => /Practice: you fell/.test(document.getElementById('end').innerText));
        const endOk = await p.evaluate(() => { const panel = document.querySelector('#end .end__panel'); const prim = panel.querySelector('.btn--primary').getBoundingClientRect(); return prim.bottom <= innerHeight + 0.5 && prim.top >= 0 && document.documentElement.scrollWidth <= innerWidth; });
        if (!endOk) bad.push(`${vp.width}x${vp.height} practice end`);
        await p.getByRole('button', { name: 'Leave practice' }).click();
        await toCard(p);
        await p.locator('#end .chronicle__open').click();
        await p.waitForSelector('#end .chronicle__practice');
        const chrOk = await p.evaluate(() => [...document.querySelectorAll('#end .chronicle__practice')].every((b) => { const r = b.getBoundingClientRect(); return r.height >= 44 && r.right <= innerWidth + 0.5 && b.scrollWidth <= b.clientWidth + 1; }) && document.documentElement.scrollWidth <= innerWidth);
        if (!chrOk) bad.push(`${vp.width}x${vp.height} chronicle practice buttons`);
        await ctx.close();
      }
      check('layout 320×320 to 1280×800: the practice notice, the practice end panel and the Chronicle\'s Practice buttons fit', bad.length === 0, bad.join(' ; '));
    }
  }

  // 23. Phase 11d (blind playtest): damage says what hit you and the hearts left, on the turn it happens
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const p = await ctx.newPage();
    await p.goto(URL);
    await p.waitForFunction(() => window.__descent);
    await p.evaluate(() => window.__descent.ready);
    await p.evaluate(async (path) => { window.__descent.skipAnim(true); for (const a of path) { await window.__descent.act(a); if (window.__descent.state().hearts < 3) break; } }, [...TO_DOOR, 'R', 'R', 'R', 'R', 'R', 'R']);
    const st = await p.evaluate(() => ({ hearts: window.__descent.state().hearts, line: document.getElementById('carving').hidden ? '' : document.getElementById('carving').innerText }));
    check('a hit is named under the HUD with the hearts left (Spikes hit you: 2 hearts left.)', st.hearts === 2 && /Spikes hit you: 2 hearts left\./.test(st.line), JSON.stringify(st));
    await ctx.close();
  }
  } catch (e) {
    // A step that throws (a timeout) is recorded after the last check that ran, so the rest of the report survives.
    check(`suite stopped after "${results.at(-1)?.name}"`, false, String(e).split('\n')[0]);
  }
  return { passed: results.filter((r) => r.pass).length, failed: results.filter((r) => !r.pass), total: results.length, errs, results: results.map((r) => `${r.pass ? 'PASS' : 'FAIL'} ${r.name}${r.detail ? ' — ' + r.detail : ''}`) };
}
