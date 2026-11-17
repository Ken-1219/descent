# Phase 10b: Ready for real players (design)

Sources: the owner's Phase 10b brief (Nov 17), PLAN §11 Phase 10b, §15, the Devvit Rules (developers.reddit.com/docs/devvit_rules, read Nov 17) and the Developer Terms (redditinc.com, last revised Mar 24 2026). Starting point: a50011f.

## 1. Rules check (done before any code)

| Feature | What the rules say | Standing |
|---|---|---|
| Automatic user flair | Rules, Privacy: "get explicit consent and appropriate permissions before … taking any actions (automated or not), on behalf of redditors (including before making any modification to redditors' accounts)" | Doubtful. **Changed (owner): opt-in** (A55). |
| Daily post, summary comment, memorial post | Posted by the app account, not on behalf of users. The user-action rules cover posting *as* a user; spam means "frequently sending unsolicited messages". | Allowed. The summary comment drops usernames (A53). |
| Usernames and snoovatars on ghosts, boards, memorial | Rules, Content: display of existing content is allowed under the Developer Terms. Rules, Deletions: on account deletion, remove "the related user ID (t2_*) … the author ID, name, profile URL, avatar image URL, user flair". | Allowed, provided deleted accounts are purged (A53). Snoovatars are fetched when shown, never stored. |
| Account deletion | There is no account-delete trigger (Trigger Event Catalog, Nov 17). The rules recommend deleting stored user data within 30 days. | **Changed (owner): a daily sweep purges deleted accounts only; no TTL**, so existing players keep everything (A53). |
| Privacy policy | Terms 7.2: "make available … a privacy policy … how users can request deletion". Rules: required for fetch/personal info "or if requested by Reddit". | **Added (owner): a wiki page**, linked from the splash and the Board (A56). |
| Deletion requests | Terms 7.3: "an easily accessible way to request for their App Content to be modified and deleted". | **Added (owner): "Delete my data"**, two taps from the Board (A56). |
| A way to report problems | Rules, Safety: "Provide app users with a way to report issues with the app". | **Added (owner): a modmail link** on the result plate (A58). |
| Dev tools | No rule names them. They are moderator-only menu items, off by default (`devTools`) and logged. | Allowed. Switched off before review (checklist). |
| Measurements | Rules: "only use data necessary for your app's stated functionality", "be up front about your data practices"; personal information triggers the privacy-policy rule. | Allowed as designed: no device identifiers, no user agent stored (only one of four classes), counts and histograms only, disclosed on the privacy page (A57). |
| External calls | Fetch is a premium feature that needs approval. | None used. Beacons go to our own server. |

## 2. Decisions (continuing A1–A52)

- **A53. Deleted accounts (no TTL):**
  - `purge(user)` removes every stored copy of a user's ID and name:
    - the lifetime sets `deepest`, `deaths`, `liars`, `trapsouls`, `souls`, `honour`
    - the hashes `names`, `streak`, `tutorial`, `flairOn`
    - on every floor: `runs`, `ghosts`, `carvings`, `starts`, `traps`, `flair`, `resets`, `scores`, `funnel` markers, error counts; vote fields naming them as voter or target; `cv` members; `trapped` fields
    - trap owners in stored floor JSON (the trap stays, the owner becomes nobody)
    - Warden damage sets
    - a Warden kill (the killer becomes "a delver", and the memorial post is edited)
  - Day counts (`heat`, `kills`, `real`, curse standings) stay: they name nobody.
  - The summary comment no longer names the Warden's killer, so no comment ever needs editing.
  - **The sweep:** a daily job walks `names` with a stored cursor, `SWEEP.perDay` users a day, and asks `getUserById`. Only `undefined` purges; an error skips that user. It is logged.
- **A54. One identity index:** `names` already holds every real player (written when a run is accepted). The sweep walks it, so nothing new is stored to find users.
- **A55. Flair is opt-in:**
  - A "Depth as flair: Off/On" toggle on the result plate writes `flairOn`.
  - The flair job flairs only opted-in players.
  - Turning it off removes your flair.
  - Players who never opted in keep their current flair until the next flair job, which removes it once per player on that floor's list (`removeUserFlair`).
- **A56. Privacy and deletion:**
  - **Privacy page:** a mod menu item "Write the privacy page" writes the `descent-privacy` wiki page from `PRIVACY` in content.ts (create, else update). The splash and the Board link it.
  - **Delete my data:** "Delete my data" on the Board asks once more ("Delete everything Descent stores about you?"), then calls `purge` for yourself.
- **A57. Measurements (beacons):**
  - **Route:** `POST /api/beacon {kind, …}`; one log line each.
    - `load`: ms to `descent:interactive` and a client class (`ios`, `android`, `mweb`, `desktop`), from coarse user-agent tests on the client. Only the class is sent.
    - `error`: message (≤120 chars), screen.
    - `save`: a failed save.
  - **Storage, per floor:**
    - a load histogram per class (`LOAD.bucketMs` buckets, capped at `LOAD.maxMs`); p50/p90 come from the buckets
    - counts of errors and save failures
  - **Rate limit:** at most `BEACON.errorsPerUser` errors per user per floor (counted in `f:{d}:errs`, purged with the user), and 3 per page load on the client. Logged-out errors share one `anon` budget per floor.
- **A58. Report a problem:** "Something broke?" on the result plate (and the error panel) opens Reddit's modmail compose to the subreddit, with the subject and body pre-filled: floor, screen, client class. One tap to open, one to send. Nothing is stored by us.
- **A59. Funnel, per floor:**
  - **Steps:** `splash`, `descend`, `floor0`, `start`, `finish`, `carved`, `voted`, `trap`.
  - **Counting:** each counts once per user per floor (`hSetNX f:{d}:seen user:step`, then `hIncrBy f:{d}:funnel step`). A resend adds nothing.
  - **Bots** never count (they never reach these routes, and `isBot` is checked anyway).
  - **Logged out:** splash loads count under `splash_anon`, not deduplicated (there is no identity to deduplicate).
  - **Who counts what:**
    - the client beacons `splash`, `descend`, `floor0`
    - the server counts the rest where it accepts the action (`start`, the first acceptance of a run, a carving, a vote, a trap)
- **A60. Health:**
  - A mod-only menu item "Health" shows a read-only form for today's floor: the funnel, p50/p90 load by class, error and save-failure counts.
  - The ROLLOVER line gains the same numbers for the closing day.
- **A61. Stranger walk-through:** old floor post, logged out, mid-day Warden floor, first day after an update. Each is checked in e2e (locally, with the dev knobs) and on Reddit; fixes are listed in the report.

## 3. Files
- **`src/server/privacy.ts` (new):** `purge`, the sweep, the privacy wiki page. It is independent of the run code, so it gets its own file.
- **`src/server/health.ts` (new):** beacons, the funnel, the Health view and the rollover's health line.
- **Changed:**
  - `src/server/game.ts`: funnel hooks; flair opt-in
  - `src/server/boss.ts`: rename the killer on purge, edit the memorial
  - `src/server/rollover.ts`: the summary drops the killer's name; the health line
  - routes: `api.ts` (beacon, funnel, flair, forget), `menu.ts` (Health, privacy page), `scheduler.ts` (sweep)
  - `devvit.json`
  - client: `game.ts`, `screens.ts` (Board links), `splash.ts`, `net.ts` (beacons)
  - `content.ts`: SWEEP, LOAD, BEACON, PRIVACY

## 4. Assumptions
- `getUserById` returning `undefined` means deleted, or suspended beyond recovery. A suspended account that comes back loses its Descent record. This is accepted as the compliant side.
- The four client classes come from user-agent substrings (`Reddit/` plus iOS or Android markers, else `Mobi`, else desktop). A wrong class only shifts a histogram.
- The privacy page lives on the subreddit wiki: the rules reject links to Reddit's own policy, not pages we write.

## 5. Built and measured (Nov 17)
- **Tests:** `bun run check` 141/141 (new: `tests/privacy.test.ts` 4, `tests/health.test.ts` 2). e2e 112/112 on the run before the last two client changes (the old-floor pointer and the privacy URL); see the report's Blocked section.
- **Reddit visit (Floor 8, main account), Health:** `splash 1 > descend 1 > floor0 1 > start 1 > finish 1 > carved 1 > voted 1 > trap 1`, desktop p50 0.5s, p90 3.5s (2 loads), errors 0 / 0. Log: `POST /api/beacon d8 load desktop 393ms`, `POST /api/start d0 start` (Floor 0), `POST /internal/menu/health health floor 8 10ms`.
- **Privacy page:** written by the menu tool (`descent-privacy`). Old Reddit renders it. The new UI said "does not exist" for an app-written page, so the links use old.reddit (`PRIVACY.url`).
- **Stranger walk-through, what was found and fixed:**
  1. A newcomer's Floor 0 on a Warden day looked like the post had been skipped. Fixed: "Practice first: reach the stairs to open Floor N."
  2. An old floor you had played said only "See your run", a dead end. Fixed: "Today is Floor N" with a button, on the splash and the plate (seen live on the Floor 6 post).
  3. Plate and Board buttons clipped their labels at 320 px ("Chronicle", "Deepest"; at 1280 "Something broke?" with five links). Fixed: they wrap.
  4. The subreddit is private: a logged-out stranger sees "This community is private". This is the owner's setting (checklist).
  5. After an app update (a new origin, so empty storage): no Floor 0 again (the server flag), and a fresh run on the day's floor. Fine.
- **Found on the way:**
  - `drainFlair` passed `{ name }` where Reddit wants `{ username }`, so the batch never had usernames. Fixed with the opt-in rewrite.
  - Beacon logs said "dropped" for steps already counted. They now say "(already counted)".
