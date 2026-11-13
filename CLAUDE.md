# Descent — rules for Claude Code
Read PLAN.md first. Do one phase per session, then stop at its gate.

## Template facts (Phase 0, Nov 13 2026)
- Entrypoints (devvit.json): `default` = `splash.html` (inline), `game` = `game.html`; client out `dist/client`, server `dist/server/index.cjs`.
- Phaser **4.2.1** (major 4), Devvit 0.15.3, Hono 4.13.17, Vite 8.3.7, TS 6.0.3. Node ≥24 per package.json.
- Package manager: **bun** (`bun install`, `bun run <script>`); `bun.lock` is the lockfile.
- Scripts: `local` (plain Vite harness, :5190 — 5173–5175 are used by other local projects), `check` (tsc --build + vitest), `build`, `dev` (= devvit playtest), `deploy`, `launch`, `lint`, `test:unit` (vitest).
- Server routes: Hono in `src/server/index.ts`; `/api/*` client-callable, `/internal/*` for menu/form/trigger/scheduler.
- Redis: strings, hashes, sorted sets, numbers, bitfields, transactions — no sets/lists. Set-if-absent: `redis.set(k, v, { nx: true })`, `redis.hSetNX`. Storage 100 MB unpublished / 5 GB published; 5 MB per request.
- Reddit: `reddit.getSnoovatarUrl(username)`, `reddit.setUserFlair({ subredditName, username, text })`, `setUserFlairBatch`.
- Scheduler: `devvit.json` → `"scheduler": { "tasks": { "<name>": { "endpoint": "/internal/...", "cron": "0 10 * * *" } } }`.
- Tests: `const test = createDevvitTest()` from `@devvit/test/server/vitest`; inside `test()`, the normal `redis`/`reddit` imports from `@devvit/web/server` hit a per-test in-memory mock (no `redis` fixture arg).

## Always
- Before any code in a phase: use superpowers brainstorming, then writing-plans. PLAN.md is the approved design. Do not reopen its decisions.
- Do not ask me questions during planning. Where there is a choice, take the recommended option and record it under "Assumptions" in the phase spec.
- Do not wait for plan approval. When the plan is written, start executing it, using subagent-driven.
- Stop and ask only for: actions outside this repo that can't be undone (npm run launch, posting to a public subreddit, deleting Redis data), or steps only a human can do (Reddit login, phone checks).
- The phase report lists every assumption made, so I can change any of them later.
- You are allowed to run npm commands, (preferred use bun, if it supports)
- Always pick the best option available which is best in architecture wise as well as developer wise.
- Superpowers may write only inside docs/superpowers/. Where Superpowers and Ponytail disagree, Ponytail and the file whitelist win.
- Tests first for src/shared and src/server. Visual work (sprites, CSS, screens) is verified by the Playwright check loop instead.
- Work on the main branch, one commit per phase. No git worktrees.
- Ponytail full mode. Run /ponytail-review before each phase commit.
- Files: only those in PLAN.md §5. A new file needs a one-line "file request" approved by the user.
- Game rules live only in src/shared. The client draws, the server judges.
- No Math.random, Date, floats, or unordered iteration in src/shared.
- Every tuning number lives in src/shared/content.ts.
- Colours and sizes come from tokens. No raw hex outside content.ts and style.css.
- Use the Phaser and Devvit versions already in package.json. Do not upgrade.
- End with the check loop (PLAN.md §10) and a phase report.
- Also read @AGENTS.md for the Devvit template notes.
- Follow PLAN.md §15 (UI/UX, developer experience, performance). The phase report states which rules were checked and the measured performance numbers.
- Ensure that commits aren't co-authored by Claude. 

## Plugins and tools
- Installed and approved: ponytail, superpowers, frontend-design, Playwright MCP (desktop and mobile).
- You may install another plugin from the claude-plugins-official marketplace without asking, if it helps avoid generic design or improves animation. Name it and say why in the phase report. It takes effect from the next session.
- Never install a plugin from any other marketplace or GitHub repo. Propose it in the phase report with its link and what it would add.
- No plugin overrides PLAN.md §6 (Torchlit Ink), §15, or the file whitelist.
- frontend-design applies to DOM screens only (splash, HUD, end screens, Lab). It must not add frameworks, fonts beyond the two chosen, gradients, or new colours.
- Animation uses Phaser tweens and CSS steps() only. No animation libraries.

## Permissions and guidelines
- Follow this project's rules: CLAUDE.md, AGENTS.md, PLAN.md, and the permissions in .claude/settings.json and .claude/settings.local.json.
- Also follow my global rules in ~/.claude/CLAUDE.md and ~/.claude/settings.json. Both sets apply together.
- Where project and global rules differ, the stricter one wins. A deny anywhere is a deny everywhere.
- If a command is denied or needs approval, do not rephrase it, wrap it in a script, or use another tool to get the same effect. Stop that step, continue with the rest of the phase, and list it in the phase report under "Blocked". Installations should never block the implementation. If some library needs to be installed, and you are unable to do so, make sure to implement everything with latest documentation of that library and leave the installation for me, but only if u are unable to do so.
- Never edit .claude/settings.json, .claude/settings.local.json, or anything in ~/.claude to give yourself more access. Propose the change in the phase report instead.
- Before the first command of a session, check that it is on the allow list. Prefer the allowed npm scripts over ad-hoc shell commands.


## Never
- React, Tailwind, UI kits, state libraries, new runtime dependencies.
- utils/, helpers/, types/ folders; barrel index files; one-function files; wrapper classes.
- Extra docs outside docs/superpowers/, CI, lint plugins, Docker, Storybook.
- Work from a later phase.
- External network calls, analytics, LLM calls.
