# Phase 11c: Match the brief (design and results)

Sources: the owner's Phase 11c brief (Nov 17), the hackathon page's points on daily games, the Devvit Journeys docs (developers.reddit.com/docs/capabilities/analytics/devvit-journeys, read Nov 17). Starting point: 9702757. No change to the simulation or a stored format; the golden runs guard that. The one wire addition is the Journeys endpoints the package defines.

## Decisions (continuing A1–A69)
- **A70. Nameless delvers:** a subreddit setting (number, default 0). The rollover schedules a `delvers` job (2 minutes later, never inside the rollover). The job seeds that many bot ghosts on today's floor only, through `seedBots`, so they stay labelled `bot:` and excluded exactly as before. *Corrected in Phase 11k (A127):* "as before" never covered tomorrow's floor, since every death fed the heat. Now bots shape tomorrow only as a fill-in: from `CROWD.realDeaths` (5) real deaths only real deaths count; below that the bots' deaths are added. Curse votes and traps stay players-only, and the intro, summary and Chronicle count players and nameless delvers apart.
- **A71. Always-today post:** the mod menu item "Post today's floor (to pin)" creates a post whose data has no depth. `floorFor` treats no depth as today, so the post follows every rollover and can never be closed. It is the link to pin and submit.
- **A72. Journeys:** `@devvit/analytics` (already installed at 0.15.3, now a direct dependency) and `permissions.journeys` in `devvit.json`.
  - **One journey is one run:**
    - App.Ready when a move is possible
    - Journey.Start on the intro's Descend (or a resumed run's first move)
    - Progress 0.1 `run_started` at the first move
    - Progress 1.0 `won` / `fell` at the run's end
    - Interactions `carved` / `voted` / `trap_set`
    - Journey.End `{complete: win, game: {win, score}}` once the result card has no step left
  - **Sending:** calls go out in order; nothing is sent after End (an interaction then would start a stray journey); local dev sends nothing.
  - **Server:** Hono routes stand in for the package's Express router and log each receipt.
- **A73. Splash essentials:** the date of the floor's day (the floor opens at 15:00 UTC) and `ATTRIBUTION` (content.ts) share the Privacy row. The state line carries today's stats (fell, carved). The card wraps and tightens below 400 px tall so everything stays on it at 320×320.
- **A74. One result card:**
  - A run ends on the result card: it shows "Saving your run…" until stored, then the full card.
  - The curse vote, the trap and the carving are optional steps opened from the card's primary button, each returning to it; a step skipped is not offered again on that visit.
  - With nothing left, the primary is "See the comments" (the post's comments). The streak was already on the card.
- **A75. Onboarding:** a newcomer's first Floor 0 clear goes straight to the day's intro (no panel, no tap). Empty compass zones show a dot instead of "0".
- **A76. Viewport:** up to 700 px tall, cards use 4 px gaps, a smaller title and compact compass cells, and drop the mini map (the real map is behind the card). The camera lift that keeps the death tile in view now accounts for an earlier lift and the HUD.

## Results
- **Journeys on Reddit:** every event arrived valid. The receipt for each is `JOURNEY_RECEIPT_DENIED_PLAYTEST` ("Event was valid, but Journey telemetry is not recorded for playtest app"). They are recorded on an uploaded, non-playtest version once Reddit allowlists the app.
- **Journeys cost:** 1.8 KB gzipped (`reddit.js`) plus 0.6 KB shared, loaded lazily inside the game. The splash is unchanged at 8.4 KB.
- **Screens after a run** (first-time player):
  - death: 2 → 1 (the carving step is optional from the card)
  - win: 3 → 1 (the vote and the trap are optional steps)
- **Newcomer, first open to first real move:** words read 96 → 79, taps 3 → 2 (plus Floor 0's 18 moves).
- **Panels that scrolled inside themselves:**
  - at 360×640: the intro (674/588), the death result card (731/588), privacy (1140/588)
  - at 390×844: privacy only
  - after the fix: everything fits except the privacy text, a reading view whose content can't fit without being cut
- **Tests:** unit 156/156 (golden runs unchanged); e2e 122/122.
