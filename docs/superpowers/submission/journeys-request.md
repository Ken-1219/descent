# Devvit Journeys: allowlist request (draft for the owner to send)

**Where:** r/Devvit modmail, https://www.reddit.com/message/compose/?to=r/Devvit (the Devvit Discord, https://developers.reddit.com/discord, also works).
- The docs say a `JOURNEY_RECEIPT_DENIED_NOT_ALLOWLISTED` receipt "is an indicator to reach out to the Devvit team for allowlisting" (docs/capabilities/analytics/journeys-receipts).
- They also say "all journey maps must be reviewed and approved prior to activation" (docs/capabilities/analytics/devvit-journeys).
- No form is documented; the request goes by modmail.

**Send it after** the judged subreddit runs an uploaded version (RELEASE.md). On a playtest version every event is answered `JOURNEY_RECEIPT_DENIED_PLAYTEST` and is never recorded, whatever the allowlist says.

---

**Subject:** Journeys allowlist request: descent-game

Hi Devvit team,

Please review the journey map below and allowlist **descent-game** for Journey telemetry. The events are already wired (Devvit Web, `@devvit/analytics` 0.15.3, `permissions.journeys: true`), and every receipt so far has been valid but denied as playtest.

- **App:** descent-game (Devvit Web)
- **Installed on:** r/<players subreddit>, version <uploaded version>
- **Developer:** u/Clean_Position8332

**What the game is:** a daily roguelike. One floor a day; everyone plays the same floor once. Where players die reshapes tomorrow's floor.

**Journey map (one journey = one run of the day's floor):**

| Event | Fires when | Fields |
|---|---|---|
| App.Ready | the game has loaded and a move is possible | none |
| Journey.Start | the player taps **Descend** on the floor's intro (an explicit commit; never on load or view). A resumed run starts on its first move. | none |
| Journey.Progress | the first move of the run | `progress: 0.1`, `action: "run_started"` |
| Journey.Progress | the run ends | `progress: 1.0`, `action: "won"` or `"fell"` |
| Journey.Interaction | after the run, the player saves a carving on their ghost | `action: "carved"` |
| Journey.Interaction | after a cleared run, the player votes tomorrow's curse | `action: "voted"` |
| Journey.Interaction | after a cleared run, the player sets a trap for tomorrow | `action: "trap_set"` |
| Journey.End | the result card has no choice left (each is optional) | `complete: true` if the floor was cleared, else `false`; `game: { win, score }` |

**Notes:**
- Interactions fire only after the server has accepted the action, never on input down.
- Nothing is sent after Journey.End, so no stray journeys start.
- No PII is sent in any field.
- The practice mode (replaying a floor that doesn't count) sends no journey events.

Thanks!
