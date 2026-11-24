# 60-second video: shot list (draft, refreshed in Phase 11k)

**The story:** one person's run becomes the next day's floor for everyone, and the next morning the game shows them their mark on it. Record at 390×844 (phone) unless a shot says otherwise.

**Set-up:**
- Run `bun run local`; the URLs below are on http://localhost:5190.
- `localStorage.clear()` in the devtools console resets the local "server" between shots.
- `descent:f0 = 1` (set it in the console) skips Floor 0.
- The knobs are listed at the top of `src/client/local.ts`.
- **The crowd world** (`?world=video&day=9`, then `&day=10`) is one player's two days with 20 nameless delvers each. Day 10 is rolled over from day 9's tally by the real rollover, including this player's curse vote and trap. Use a fresh world name for each take.

| # | Time | Shot | Set-up | What must be on screen |
|---|---|---|---|---|
| 1 | 0–5 s | The feed card | the always-today post on r/DescentDaily, or `splash.html?ghosts=20` | "Descent", the one-line pitch, "Floor N", the floor's name, "N fell here today · N carved a warning", the date and the attribution |
| 2 | 5–12 s | Today's intro | `game.html?world=video&day=9` | The floor's name, the compass (☠ fell yesterday, ▲ danger today), the curse and "New today"; tap Descend |
| 3 | 12–20 s | Playing | same | A few moves, a red wind-up mark and a dodge, a nameless delver's carving ("Stairs this way ←") read under the HUD, the Map button showing the seen map (no turn spent) |
| 4 | 20–26 s | **A death** | `game.html?floor=trap&yesterday=1`, walk onto the spikes until dead | The hit-stop and shake, the collapse, the wisp rising, and the cause on the result card: "A trap set by u/trapper" |
| 5 | 26–30 s | Leaving a ghost | same card | Carve: "Trap ahead"; the wisp on the mini map |
| 6 | 30–38 s | **A winner shapes tomorrow** | back in `?world=video&day=9`, clear the floor | The result card: vote a curse (Light Sleepers), then "Set a trap for tomorrow": Centre, Dart slit, Set trap |
| 7 | 38–44 s | **Deaths become tomorrow's floor** | `lab.html#rollover` (desktop 1280×800) | Paint deaths into one zone, pick a curse: tomorrow's floor regenerates with the hazards gathered there |
| 8 | 44–51 s | **Your mark** | `game.html?world=video&day=10` | The new floor's name and tint, and on the intro: "Your mark: Your dart slit waits in the centre. Your vote won: Light Sleepers." |
| 9 | 51–56 s | The Warden | `game.html?floor=warden&boss=alive` | "The Warden waits, chained. 84 of 120 links"; bump twice, the chain counts down |
| 10 | 56–60 s | End card | `splash.html` | "Descent: the community's deaths build the dungeon." |

**Optional cut-ins (1–2 s each, if time allows):** "Practice this floor" on a result card; a teach-once line under the HUD the first time a dark room appears; the Chronicle.

**On Reddit instead (optional, real data):** on r/descent_game_dev with Dev tools on (never on r/DescentDaily):
1. Die on today's floor and carve.
2. Win with a second account, vote a curse and set a trap.
3. Run "Roll over now".
4. Record the new post's summary comment and the winner's intro: "Your mark: Your spikes wait in the …".

This shows the same story with real names.
