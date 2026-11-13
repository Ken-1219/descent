# Phase 0 — Setup and harness (design)

Source: PLAN.md §11 Phase 0. PLAN.md is the approved design; this only pins the details.

## Build

1. **Template facts** recorded at the top of `CLAUDE.md`: entrypoints, Phaser major version, scripts.
2. **`vite.local.config.ts`**: plain Vite, `root: src/client`, `publicDir: ../../public`, port 5173, no Devvit plugin. Added to `tools/tsconfig.vite.json` so it is type-checked.
3. **Scripts**
   - `local` = `vite --config vite.local.config.ts`
   - `check` = `tsc --build && vitest run`
   - `test:unit` is repointed to `vitest run` so the template CI keeps working.
4. **Dev dependencies**: `vitest` and `@devvit/test@0.15.3`, pinned to the Devvit version.
5. **`src/client/lab.html`**: one page saying "Descent Lab". No `lab.ts` yet.
6. **`tests/server.test.ts`**: one `createDevvitTest()` smoke test. It proves the harness works and pins the set-if-absent behaviour (`set(k, v, { nx: true })`, `hSetNX`) used in Phase 6.
7. **`.gitignore`**: add `shots/` and `.playwright-mcp/`.
8. **Playwright mobile MCP**: `claude mcp add -s user playwright-mobile -- npx @playwright/mcp@latest --device "iPhone 15"`.

## Verified facts (Nov 13, 2026)

| Fact | Result | Source |
|---|---|---|
| Redis types: strings, hashes, sorted sets, numbers, bitfields, transactions; no plain sets or lists | Confirmed | docs `capabilities/server/redis.md`; typings |
| Storage | **Changed**: 100 MB unpublished, 5 GB published (not 500 MB). The 5 MB request limit is confirmed | redis.md |
| Scheduler: `"scheduler": {"tasks": {name: {"endpoint": "/internal/...", "cron": "..."}}}` | Confirmed | scheduler.md; config schema |
| Expanded mode is user-initiated only; `requestExpandedMode(event, entry)` | Confirmed | view_modes_entry_points.md; typings |
| Vite plugin is build-only (no `vite dev` or HMR) | Confirmed | guides/tools/vite.md |
| `@devvit/test`: `createDevvitTest()` from `@devvit/test/server/vitest`, in-memory Redis, Reddit and Scheduler per test | Confirmed | guides/tools/devvit_test.md |
| Set-if-absent | `redis.set(k, v, { nx: true })` and `redis.hSetNX(k, f, v)` | typings `@devvit/redis` |
| Snoovatar | `reddit.getSnoovatarUrl(username)` returns `string \| undefined` | typings |
| Flair | `reddit.setUserFlair({ subredditName, username, text, ... })`; `setUserFlairBatch(sub, [...])` exists | typings |
| Endpoint limits (30 s, 4 MB, 10 MB) | Not found on the pages checked; unverified | — |

## Checks

- After `npm run build`, `dist/client` has no `lab*` file, and a grep for `Descent Lab` or `local` finds no harness code.
- `npm run check` is green.
- Check loop: `localhost:5173/lab.html`, plus template `splash.html` and `game.html` screenshots in `shots/phase-0/`.

## Assumptions

- A1. Vitest uses the existing `vite.config.ts`. If the Devvit plugin breaks Vitest, a `test` block goes into `vite.local.config.ts` and `--config` points at it. No new config file.
- A2. Test files are not type-checked by `tsc --build` (Vitest transpiles them). We add a tests tsconfig only if type errors in tests start to matter.
- A3. `lab.ts` is deferred to Phase 1, when the Lab gets content.
- A4. The template's `/api/init` call fails under the local harness, because `local.ts` fakes arrive later. Those console errors are expected in Phase 0 shots only.
- A5. `.gitignore` already ignores `*.md` and `docs/` (the user's choice), so PLAN, CLAUDE, the README and these specs stay local. That is unchanged here.
- A6. Subagent-driven execution: one implementer subagent does the code tasks. The main session does the review, the Playwright check loop and the commit, because the MCP browser lives here.
- A7. The `npm run dev` playtest gate needs a Reddit login, so it is a human step. Locally, `npm run build` stands in.
- A8. The template CI workflow is left untouched (it is a template file, not added CI).
