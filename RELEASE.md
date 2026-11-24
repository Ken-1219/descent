# Releasing Descent to the players' subreddit

Two subreddits, two jobs:

- **r/descent_game_dev**, the private playtest subreddit (`devvit.json` → `dev.subreddit`): `bun run dev` (playtest) uploads a new prerelease version (`0.0.1.N`) on every save. Dev tools, resets and "Roll over now" live here.
- **r/DescentDaily**, the players' subreddit, runs one fixed, uploaded version, and gets a new one only when the owner says so. Every update serves the game from a new web origin, so players' browsers lose what they stored on the device: unfinished-run logs, the practice-done flag and the mute choice. The server keeps runs, records and the tutorial flag.

Commands are from the project root; `bunx devvit` is the Devvit CLI already in `devDependencies`. Checked against the Devvit CLI docs (developers.reddit.com/docs/guides/tools/devvit_cli, Nov 17 2026).

## 1. Cut a version
1. Check that everything passes: `bun run check` (types, unit and golden runs) and the e2e suite (`tests/play.mcp.js`, see its header).
2. Upload a fixed version: `bun run deploy`. It type-checks, lints, then runs `devvit upload`, which turns playtest `0.0.1.N` into `0.0.2` (a patch bump). To pick the number yourself: `bunx devvit upload --version 0.1.0`.
3. Write the version down. `bunx devvit list apps` lists what was uploaded.

## 2. Install it on the players' subreddit
1. You must moderate the subreddit with full permissions.
2. Install exactly that version: `bunx devvit install r/<players> descent-game@<version>`.
3. Check it: `bunx devvit list installs r/<players>`.
4. **An uploaded version, never a playtest one.** The judged subreddit must run a version made by `devvit upload` and installed with `devvit install`. Playtest versions (`0.0.1.N`) answer every Devvit Journeys event with `JOURNEY_RECEIPT_DENIED_PLAYTEST` ("not recorded for playtest app"), so they would never count. Once the uploaded version is installed, send the allowlist request in `docs/superpowers/submission/journeys-request.md`. Until Reddit allowlists the app, receipts read `JOURNEY_RECEIPT_DENIED_NOT_ALLOWLISTED`; after, `JOURNEY_RECEIPT_VALID`. The logs show each receipt (`journey <event>: <status>`).
5. **No publishing.** The hackathon rules say not to submit the app for publishing; an uploaded, private app qualifies. Never run `devvit publish` or `bun run launch`.

## 3. Start the game there
1. **Dev tools off:** open the subreddit's settings for the app (subreddit → Mod Tools → Apps → descent-game → Settings). Confirm "Dev tools (reset my run, roll over now, set the Warden's links)" is **off**. Its default is off.
2. **Wiki on:** Mod Tools → Settings → Wiki → enable it ("Mod editing only" is enough). Then the privacy page shows on new Reddit.
3. From the subreddit's Mod Tools ⋯ menu, run **Write the privacy page**. A toast says "Privacy page written to the wiki".
4. From the same menu, run **Start Floor 1**. It posts "Floor 1" once; running it again only says Floor 1 is live.

## 4. Confirm
1. **The post:** "Floor 1" is in the subreddit. Its card says "A daily dungeon: one run a day…", and Descend opens the intro.
2. **The cron:** the next day after 15:00 UTC, "Floor 2" is posted with a summary comment. In the logs (`bunx devvit logs r/<players> --since 30m`) look for `ROLLOVER cron <date>: floor 1 -> 2 (post t3_…)`, `summary comment t1_…` and `flair floor 1: … set`. The deleted-account sweep runs daily at 15:30 UTC and logs `SWEEP checked N, purged M`.
3. **The privacy page:** `https://www.reddit.com/r/<players>/wiki/descent-privacy` opens on new Reddit, logged in and logged out. Put this link in the sidebar.
4. **Dev tools off:** "Reset my run…", "Roll over now" and "Set the Warden's links" answer "Dev tools are switched off in the app settings".
5. **Health:** the ⋯ menu → Health shows today's funnel and load times. Check it after the first players.

## 5. Updating later
- **Only when the owner says so:** repeat steps 1, 2 and 4 with the new version. Never run `bun run dev` against the players' subreddit; playtest stays on r/descent_game_dev.
- **Roll back:** `bunx devvit install r/<players> descent-game@<previous version>`.
