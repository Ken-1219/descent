# Phase 7b: votes, traps, curse, souls (design)

Source: PLAN.md §7, §8 (crowd modifiers, curses), §11 Phase 7b, and the owner's Phase 7b brief. Starting point: 7ad300d.

## Redis keys
- `f:{d}:traps` hash (PLAN): user → `{ zone, kind, at }`.
  - Written with `hSetNX`, by a stored win only.
  - Phase 8 reads it to place traps (owner, zone 0–8, kind) and to award trap souls.
- `f:{d}:curse` sorted set (PLAN): curse → votes.
- `f:{d}:cv` sorted set (PLAN): `{ghost}:trust` and `{ghost}:liar` → votes on that ghost's carving.
- `souls`, `honour` sorted sets (PLAN): user → lifetime total.
- **New:** `f:{d}:votes` hash.
  - Fields: `{voter}>{ghost}` → `trust` or `liar`, and `{voter}>curse` → curse.
  - It is the one-vote guard (`hSetNX`). Sorted sets have no set-if-absent, so the PLAN tallies can't guard themselves.

## Rules
- **Every choice is final.** §15.1 makes the carving, the curse vote and the trap select-then-confirm.
  - Each vote, carving vote and trap is written with `hSetNX`.
  - The identical resend returns the stored value; a different one is rejected.
  - Of two simultaneous requests, exactly one is accepted.
  - A rolled-over floor returns `closed`.
- **Curse vote:** only a stored win, on the live floor. The standings are returned only to a player who has voted.
- **Trap:** only a stored win, on the live floor. Other players' traps are never returned to anyone.
- **Carving vote:**
  - The voter needs a stored run on that floor (won or dead), so voting unlocks after your run ends.
  - The ghost must exist and be carved, and must not be the voter's own.
  - Bots never vote. Votes on a bot's carving are stored and counted in its totals, but give no souls or honour.
- **Totals:** a ghost's Trust and Liar totals are sent only to a viewer whose run on that floor has ended. The capped list never ranks or filters by them; it stays carved first, then newest.
- **Ghost ids:** a ghost's id (its record key: a Reddit user id, or `bot:n`) goes on the wire so votes can name their target. The server checks it exists.

## Decisions (continuing A1–A14)
- A15. **Souls (lifetime, sorted set `souls`), written out in full:**
  - +1 to a carving's author for each Liar vote on it from a voter whose stored run on that floor is a death. Liar votes from winners are stored and counted in the totals but give no souls.
  - +1 to a trap's owner each time the trap hurts a player on the floor it is placed on; +3 when it kills instead (not +1 and +3).
    - Traps are placed by Phase 8 on the next floor, so these souls accrue from Phase 8 on.
    - They are derived from the server's replay of the victim's run (damage with cause `trap` on that trap's tile).
    - 7b stores the owner for that.
  - Bots neither give nor receive souls.
  - The reset tool removes the souls the reset player's Liar votes gave.
- A16. **Honour (lifetime, sorted set `honour`), written out in full:**
  - +1 to a carving's author for each Trust vote on it, from any non-bot voter with a stored run on that floor who is not the author.
  - Bots neither give nor receive honour.
  - The reset tool removes the honour the reset player's Trust votes gave.
- A17. **One carving vote per voter per ghost.** A voter may vote on many ghosts in a floor, but once on each. All votes are final.
- A18. **Curse resolution** (`resolveCurse`, shared, read by Phase 8):
  - the most votes wins
  - a tie goes to the mildest curse by measured win-rate cost: Light Sleepers, Overrun, Short Wick, Frail, Deep Dark (`CURSE_TIE_ORDER`)
  - one voter decides alone; no voters means no curse (never fabricate crowd data)
- A19. **Victory flow:** two steps, each with Skip, each select-then-confirm.
  1. Curse vote: a select with each curse's one-line effect; Vote is primary.
  2. Trap: a 3×3 compass grid for the zone and a select for the kind; Set trap is primary.

  The result plate shows your vote, the standings, and your trap. While the floor is live, an unfinished step is the plate's primary action.
- A20. **Carving votes after your run:** the result plate has a "Carvings (N)" action listing carved ghosts. A row opens the ghost card, which shows the totals plus Trust and Liar.
  - During a run, the card shows neither totals nor vote buttons; the votes row reads "Vote after your run".
  - Votes are optimistic on the card, stored in a local queue, and sent in the background with retries. The queue is flushed on the next load, so a vote made offline is sent later.
- A21. **Reset tool:** also removes the caller's curse vote, trap and carving votes, with the souls and honour they gave. Votes on the caller's own carving go with it, with what they gave the caller.
- A22. **Tally for Phase 8** (`tally`): deaths per 3×3 zone, kills by cause, the resolved curse, and the traps. Bots are included in heat and excluded from traps.

## Built and measured (Nov 16)
- **Reddit (playtest v0.0.1.140, Floor 4):**
  - Victory flow (after the reset tool): won in 13 turns, voted Frail (standings shown), set Spikes in the north-east.
    - `POST /api/run d4 saved won 1319`
    - `POST /api/vote d4 curse frail: voted`
    - `POST /api/trap d4 trap spikes zone 2: placed`
  - Death flow (reset again): died on turn 38 and skipped the carving. The carvings list showed totals; Trust on a bot's carving went from 0 to 1.
    - `POST /api/vote d4 trust on bot:42: voted`
  - Each reset logs `RESET run of … on floor 4`.
- **Played response with 1,000 ghosts and their votes:** 9.4 KB, 4.0 ms.
- **Deviations from PLAN:**
  - `f:{d}:votes` hash added (one-vote guard).
  - The card shows today's Trust and Liar totals on the buttons, not a lifetime record. The brief made the record optional; it needs lifetime keys that Phase 9's board will define.
  - "Heat and kills read by the intro" waits for Phase 9's intro screen. `tally()` is the read side for the rollover.
- **Finding:** each Devvit app version runs on its own origin, so `localStorage` (saved run logs, the Floor 0 flag, the vote queue) starts empty after an app update.
