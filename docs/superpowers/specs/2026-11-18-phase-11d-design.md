# Phase 11d: Journeys access, practice, blind playtests (design and results)

Sources: the owner's Phase 11d brief (Nov 18), the Devvit Journeys docs (devvit-journeys, journeys-receipts, journeys-dashboard), the FAQ and launch guide on contacting the team. Starting point: 0013169. No simulation or stored-format change; the golden runs guard that. One read-only endpoint is added: `GET /api/practice`.

## Pre-work: CI
GitHub CI ran `npm install` with no lockfile. Some Devvit packages ask for `"@devvit/server": "*"`, so after `@devvit/server` 0.15.4 was published (16 Nov 16:44 UTC), npm installed it beside the pinned 0.15.3. The Devvit test harness then failed every server test with "No context found" (57 failures). CI now installs from `bun.lock` with `bun install --frozen-lockfile` (oven-sh/setup-bun v2.2.0, pinned by SHA). Reproduced in a clean clone: npm fails 57 tests; bun from the lockfile passes 156/156.

## Decisions (continuing A1–A76)
- **A77. Journeys access:**
  - **The route:** r/Devvit modmail (or the Devvit Discord). A `JOURNEY_RECEIPT_DENIED_NOT_ALLOWLISTED` receipt "is an indicator to reach out to the Devvit team for allowlisting", and journey maps "must be reviewed and approved".
  - **The draft:** `docs/superpowers/submission/journeys-request.md` holds the message and the journey map.
  - **RELEASE.md** now says the judged subreddit must run an uploaded version: playtest versions answer `JOURNEY_RECEIPT_DENIED_PLAYTEST` and are never recorded.
- **A78. Practice:** a floor played again where nothing counts. The client plays it locally with no `live` run, so nothing is ever sent: no run, ghost, vote, trap, board entry, soul, streak, funnel step or journey event.
  - **Where it's offered:** "Practice this floor" is the result card's secondary action (so never before your own run), and each Chronicle row has a "Practice" button.
  - **Past floors:** fetched from `GET /api/practice?depth=N`, which only reads. It refuses today's floor before your own run, future floors and logged-out players. A practice log could not be accepted anyway (a past floor is closed; today's already has your run).
  - **On screen:** a gilt notice at the foot of the map reads "Practice · nothing counts" with Leave. That floor's ghosts and carvings show, read-only (no vote buttons). The end panel says "Practice: nothing was saved." with Practice again and Leave practice.
  - **Cost:** nothing extra loads unless used: no new chunk, one small fetch only for a past floor.
  - **Old floors:** floors stored before the newer fields existed open: Floor 4, from Phase 8, checked on Reddit.

## Results (Reddit, v0.0.1.384)
- **Today's floor:** practised Floor 10 from its card after the main account's real run. No request reached the server during the practice. Leave returned to the real card with the same score.
- **Past Warden floor:** practised Floor 7 from the Chronicle; log `GET /api/practice practice d7: served (nothing saved)`. Floor 4 as well.
- **Health, Floor 10:** after the practice session the funnel read start 1, finish 1, trap 1 (the real run's). The practice death added no finish and no carving.
- **Tests:** unit 157/157 (new `tests/practice.test.ts`); e2e 125/125 (new section 22: card practice, Chronicle Warden practice, layouts 320×320 to 1280×800).

## Blind playtest (a subagent that had never seen the repo; local build, 390×844, new logged-in player)
The full notes are in the phase report.

| Floor | Bot predicted win | Blind result |
|---|---|---|
| d1 s1 | 100% | cleared, 26 turns |
| d1 s2 | 75% | cleared, 16 |
| d1 s3 | 100% | cleared, 43 |
| d10 s1 | 100% | cleared, 28 (1 heart left) |
| d10 s2 | 56% | cleared, 44 |
| d10 s3 | 0% | fell to an imp, turn 19 |
| d20 s1 | 19% | cleared, 37 (1 heart) |
| d20 s2 | 100% | cleared, 39 |
| d20 s3 | 0% | fell to an imp, turn 26 |
| d28 s1 | 94% | fell to the Warden, turn 70 |
| d28 s2 | 56% | fell to the dark (torch out), about 100 |
| d28 s3 | 25% | fell to the Warden, turn 74 |

These are raw generated floors; the rollover rerolls each day's floor into its band, so the 0% floors would never be posted.

**Fixed now (A79, wording and hints; no rule change):**
- **Retry before anything failed:** a fresh save line hid nothing until its first save, so the card's vote and trap steps showed Retry. It now starts hidden.
- **A held Space pressed a death screen's button:** for half a second after a panel opens, and on key repeats, Space/Enter don't press its buttons.
- **The Sound button toggling by itself:** the mute gives up focus after a click, and game keys drop focus from the HUD.
- **No feedback in the moment:**
  - each hit is named under the HUD with the hearts left ("Spikes hit you: 2 hearts left.")
  - entering a dark room says the torch burns faster there and that a brazier ends it (once per room)
  - picking up an item while holding one says which was left behind
- **The practice line was cut off at 390 px:** now "Practice first: find the stairs."
- **The intro compass's red frame:** the legend now says "red frame: most danger".

**Proposals (larger than wording; not built):**
1. **Phone framing:** the map was a band of about 8–10 tiles in the middle of an 844 px screen, and the easing camera made exits hard to judge. Proposal: on tall screens, zoom so the map fills the height (more tiles across), and snap the camera instead of easing.
2. **Digits:** the pixel font's 3, 5 and 8 were misread (torch 35 read as 88). Proposal: draw HUD numbers in the UI font, or add a digit-only glyph set.
3. **Imps:** read as hitting while passing, with bumps that sometimes did nothing visible. Proposal: a clearer tell for an imp's strike and a hit flash when your bump lands. That is client feedback only; their rules stay as they are.
4. **The Warden's marks:** brackets on tile corners didn't show whether your own tile was marked, or when. Proposal: fill marked tiles, and show a 1-or-2 count while it winds up.
