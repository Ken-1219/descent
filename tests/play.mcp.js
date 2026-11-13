// End-to-end check for the game and Lab (Phase 3+). Run it through the Playwright MCP tool browser_run_code_unsafe
// with this file as `filename`, while `bun run local` serves http://localhost:5190. Returns PASS/FAIL per check.
// It uses the dev-only window.__descent hook, so it never runs against production builds.
async (page) => {
  const URL = 'http://localhost:5190/game.html';
  const browser = page.context().browser();
  const results = [];
  const errs = [];
  const check = (name, pass, detail) => results.push({ name, pass: !!pass, detail });
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
    check('Enter on the focused "Descend again" restarts', r.turn === 0 && !r.ended && !(await endVisible(p)), `turn ${r.turn}`);
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

  return { passed: results.filter((r) => r.pass).length, failed: results.filter((r) => !r.pass), total: results.length, errs, results: results.map((r) => `${r.pass ? 'PASS' : 'FAIL'} ${r.name}${r.detail ? ' — ' + r.detail : ''}`) };
}
