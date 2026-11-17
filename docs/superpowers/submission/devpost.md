# Descent: Devpost description (draft for the owner to edit)

## Tagline
The community's deaths build the dungeon.

## What it is
**The community's deaths build the dungeon.** Descent posts one floor of a dungeon to its subreddit every day. Everyone plays the same floor, once. Where the crowd dies today decides tomorrow's floor:
- Hazards gather where people fell.
- Yesterday's top killer spreads.
- Today's winners vote a curse onto tomorrow and hide traps in it under their own names.

Every death leaves a ghost on the floor for later players: a wisp at the spot, and a short warning carved from a fixed list that others judge Trust or Liar.

A run is a few minutes of turn-based play: a torch that burns down with every move, three hearts, and enemies that always show their wind-up a turn ahead. Every seventh floor holds the Warden, a chained boss the whole subreddit wears down together. Each bump breaks one link, and its chain is sized to yesterday's crowd. The player who breaks the last link gets a memorial post, along with the community's top link-breakers.

## How it plays on Reddit
- **The feed card** shows today's floor in miniature, with its ghosts and a short loop: a delver falls, a wisp rises, tomorrow's trap appears. One tap opens the floor.
- **Before your first move**, the intro shows a compass of where yesterday's crowd died against where today's danger is. It names the curse, the top killer and the traps survivors set.
- **After your run** you see your ghost on the map. Losers carve; winners vote a curse and set a trap. Then come the boards (today, deepest, souls, honour) and the Chronicle, a one-line ledger of every floor so far.
- **Each day** a new post arrives with a summary comment of what the crowd did yesterday.

## How we built it
- **Platform:** Devvit Web, with a Phaser 4 game in the expanded view and a plain DOM splash card light enough for the feed.
- **One rule engine:** the rules live in one shared TypeScript module. The browser plays a run with it, and the server replays the logged moves with the same code before accepting a score, so the board can't be faked by editing the client.
- **The generator:** each floor is built from the day's tally (deaths per zone, kills, curse votes, traps). Every generated floor must pass solvability checks and a difficulty band measured by a bot, so the crowd can make a floor harder but never unwinnable.
- **Redis** holds runs, ghosts, votes and the boss's shared chain. The chain is moved by one atomic increment per accepted run, so exactly one run makes the kill.
- **The art** is the CC0 DungeonTileset II by 0x72, graded onto our own palette. The hero, the wisps and the torch are drawn for the game. Every sound is synthesized in code.

## Challenges
- Letting a crowd change a floor without ever making it unfair: every floor is checked by a bot against a difficulty curve, and falls back step by step if the crowd's changes push it out of the band.
- A boss shared by everyone, killed exactly once, even when two killing blows land at the same moment.
- Keeping the feed card fast (8.5 KB of script) and getting the game from tap to first move in about two seconds on Reddit.

## What we learned
<!-- owner: your own words -->

## What's next
<!-- owner -->

## Built with
Devvit Web, TypeScript, Phaser, Hono, Vite, Redis (Devvit), WebAudio.
