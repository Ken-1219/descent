# Descent

**A daily dungeon where the community's deaths build tomorrow's floor.**

Every day at 15:00 UTC a new floor of the dungeon is posted to the subreddit. Everyone plays the same floor, once. Where people die today decides what tomorrow's floor looks like: hazards gather where the crowd fell, the floor's top killer spreads, the winners vote a curse onto tomorrow and set traps for the next delvers, and every death leaves a ghost that later players can read.

It is a short turn-based roguelike (a run takes a few minutes) built for Reddit with Devvit Web and Phaser.

## How to play

- **Moving:** arrow keys or WASD on a keyboard; swipe, or the on-screen pad, on a phone. Space waits a turn, E uses your item.
- **The torch** burns one turn of light per move. Reach the stairs before it goes out; in the dark you lose a heart every two turns.
- **Three hearts.** Spikes, darts, pits, goblins, imps, skeletons and the dark take them. Every danger warns you one turn ahead with a red mark.
- **Floor 0** is a short practice floor. It teaches moving, keys and doors, spikes, an enemy's wind-up, items and ghosts. You play it once; after that each post opens straight on the day's floor.

## How the crowd shapes each floor

- **Deaths move the danger.** The intro of each floor shows a compass: ☠ where people fell yesterday, ▲ where today's danger is.
- **The top killer spreads.** Whatever killed the most people yesterday is more likely to fill tomorrow's floor.
- **Winners choose.** Clearing a floor lets you vote tomorrow's curse (shorter torch, more hazards, smaller light, lighter-sleeping enemies, or fewer hearts) and set one trap (spikes, a dart slit or false stairs) in a zone you pick. Your trap appears tomorrow under your name. If it hurts or kills someone, you earn souls.
- **Ghosts.** When you die, a wisp marks the spot for everyone. You may carve a short warning on it from a fixed list ("Trap ahead", "Safe this way →"…), and other players vote it Trust or Liar after their own run.
- **The Warden.** Every seventh floor holds a chained boss shared by the whole community. Each bump breaks one link of its chain; its links are sized to yesterday's crowd. Whoever breaks the last link gets a memorial post naming the top link-breakers. If it survives the day, it keeps its wounds until its next floor.
- **Boards and the Chronicle.** Today's scores, the deepest floor reached, souls and honour; the Chronicle keeps one line per floor of what the crowd did.

## For moderators: setting it up

1. Install the app on your subreddit (see [RELEASE.md](RELEASE.md) for the exact commands).
2. Turn the subreddit wiki on, then run **Write the privacy page** from the subreddit's Mod Tools ⋯ menu. Link `/wiki/descent-privacy` in your sidebar.
3. Run **Start Floor 1** from the same menu. After that the app posts a floor every day at 15:00 UTC on its own, with a summary comment of yesterday.
4. **Health** in the same menu shows today's numbers: how many people got from the post to a finished run, load times by kind of device, errors and failed saves.
5. **The "Dev tools" setting** (reset a run, roll over now, set the Warden's links) is for testing only. Leave it off on a players' subreddit.

## Privacy

Descent stores your Reddit user ID and name with your runs, ghosts, carvings, votes, traps and lifetime records, on Reddit's servers for this app only. It also keeps anonymous measurements (load time, the kind of client, errors) that carry no device identifier. Depth as user flair is off unless you turn it on. "Delete my data" on the Board removes everything about you; a deleted Reddit account is removed by a daily check. The full text is in the game (the Privacy link on the post and the Board) and on the subreddit wiki page `descent-privacy`.

## Credits

- **Dungeon art:** [16x16 DungeonTileset II](https://0x72.itch.io/dungeontileset-ii) v1.7 by 0x72 (recoloured by GrafxKid), **CC0**. Its stone is graded onto Descent's palette at load. The hero, the wisps, the wall torch, the death-to-wisp frames and the icons are drawn for Descent.
- **Fonts:** [Jacquard 24](https://github.com/scfried/soft-type-jacquard) (The Soft Type Project Authors) and [Pixelify Sans](https://github.com/eifetx/Pixelify-Sans) (The Pixelify Sans Project Authors), both **SIL Open Font License 1.1** (`src/client/assets/fonts/OFL.txt`).
- **Sound:** every sound is synthesized in code with WebAudio (`src/client/sound.ts`); there are no sound files.
- **Engine and platform:** [Phaser](https://phaser.io/) (MIT), [Devvit Web](https://developers.reddit.com/), [Hono](https://hono.dev/) (MIT), [Vite](https://vite.dev/) (MIT).

## For developers

- **Requirements:** Node 24 and bun.
- **Install:** `bun install`
- **Play locally without Reddit:** `bun run local`, then open http://localhost:5190/game.html (the server is faked in the browser). Dev knobs are listed at the top of `src/client/local.ts`; the Lab (`/lab.html`) shows the art, every enemy scene, the generator and the screens.
- **Checks:** `bun run check` runs the type check, the unit tests and the golden runs. The end-to-end suite is `tests/play.mcp.js` (see its header).
- **Playtest on Reddit:** `bun run dev` (the dev subreddit only).
- **Release:** [RELEASE.md](RELEASE.md).

`src/shared` holds the rules (the same code judges a run on the server and plays it in the browser), `src/server` the Devvit server, `src/client` the splash card and the game.
