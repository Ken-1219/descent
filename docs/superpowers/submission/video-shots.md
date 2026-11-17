# 60-second video: shot list (draft)

**The story:** one person's death becomes tomorrow's trap for someone else. Record at 390×844 (phone) unless a shot says otherwise.

**Set-up:**
- Run `bun run local`; the URLs below are on http://localhost:5190.
- `localStorage.clear()` in the devtools console resets the local "server" between shots.
- `descent:f0 = 1` (set it in the console) skips Floor 0.
- The knobs are listed at the top of `src/client/local.ts`.

| # | Time | Shot | Set-up | What must be on screen |
|---|---|---|---|---|
| 1 | 0–5 s | The feed card | `splash.html?ghosts=20` | "Descent", the one-line pitch, the mini floor with wisps and the loop: a fall, a wisp, a trap |
| 2 | 5–12 s | Today's intro | `game.html?ghosts=20&yesterday=1` | The compass (☠ yesterday, ▲ today) and "Top killer"; tap Descend |
| 3 | 12–20 s | Playing | same | A few moves, a red wind-up mark, a dodge, a ghost's carving appearing under the HUD |
| 4 | 20–28 s | **A death** | `game.html?floor=trap&yesterday=1`, walk onto the spikes until dead | The hit-stop and shake, the 600 ms collapse, the wisp rising, then the plate: "A trap set by u/trapper" |
| 5 | 28–33 s | Leaving a ghost | same plate | Pick "Trap ahead" and Carve; your wisp on the mini map |
| 6 | 33–40 s | **A winner sets tomorrow's trap** | `game.html?floor=f0`, then the route `DRRURRRRDDDDLLLLLL` | "Floor N cleared", vote a curse, then "Set a trap for tomorrow": Centre, Spikes, Set trap |
| 7 | 40–47 s | **Deaths become tomorrow's floor** | `lab.html#rollover` (desktop 1280×800) | Paint deaths into one zone, pick a curse: tomorrow's floor regenerates with the hazards gathered there |
| 8 | 47–53 s | **The trap pays** | `game.html?mytrap=2,1` (the owner's view the next day) | The intro: "Your spikes hurt 2 and took 1 here." |
| 9 | 53–58 s | The Warden | `game.html?floor=warden&boss=alive` | "The Warden waits, chained. 84 of 120 links"; bump twice, the chain counts down |
| 10 | 58–60 s | End card | `splash.html` | "Descent: the community's deaths build the dungeon." |

**On Reddit instead (optional, real data):** on r/descent_game_dev with Dev tools on:
1. Die on today's floor and carve.
2. Win with a second account and set a trap.
3. Run "Roll over now".
4. Record the new post's summary comment and intro: "Survivors set 1 trap here."

This shows the same story with real names.
