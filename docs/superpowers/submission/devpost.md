# Descent: Devpost description (draft for the owner to edit)

**Status:** submitted on Devpost on Nov 24, 2026 (editable until Dec 9, 7:30 am IST). Still to add: 3:2 thumbnail, screenshots, the video, the feedback survey.

## Tagline
The community's deaths build the dungeon.

## Inspiration
Daily games give everyone the same board, but nothing anyone does on it carries over: tomorrow starts clean. A subreddit is a crowd with a memory, so we wanted a daily game where yesterday's crowd is visible in today's level. Where people died, what they warned about and what the winners chose should become the floor you play next.

## What it is
**The community's deaths build the dungeon.** Descent posts one floor of a dungeon to its subreddit every day. Everyone plays the same floor, once. Where the crowd dies today decides tomorrow's floor:
- Hazards gather where people fell.
- Yesterday's top killer spreads.
- Today's winners vote a curse onto tomorrow and hide traps in it under their own names.

Every death leaves a ghost on the floor for later players: a wisp at the spot, and a short warning carved from a fixed list that others judge Trust or Liar. The next morning the intro shows each player their own mark on the new floor: "Your dart slit waits in the centre", "Your vote won: Light Sleepers".

A run is a few minutes of turn-based play: a torch that burns down with every move, three hearts (never more than one lost in a turn), and enemies that always show their wind-up a turn ahead. Each floor has its own name, the stone changes tint every seven floors, and a seen map (the Map button) remembers every tile you've lit. One run a day counts; after it you can practise the floor as often as you like. Every seventh floor holds the Warden, a chained boss the whole subreddit wears down together. Each bump breaks one link, and its chain is sized to yesterday's crowd. The player who breaks the last link gets a memorial post, along with the community's top link-breakers.

## How it plays on Reddit
- **The feed card** shows today's floor in miniature, with its name, its date and how many fell there. One tap opens the floor. A pinned "today's floor" post always opens the current day, so there is one link to share.
- **The first visit** is a short Floor 0 that teaches the basics; anything new after that is taught once, in a line under the HUD, the first time you meet it.
- **Before your first move**, the intro shows a compass of where yesterday's crowd died against where today's danger is. It names the curse, the top killer and the traps survivors set, and under "Your mark" what your own run did to today.
- **After your run** one result card holds everything, each step optional: carve a warning on your ghost, vote a curse, set a trap, practise the floor. Then come the boards (today, deepest, souls, honour) and the Chronicle, a one-line ledger of every floor so far.
- **Each day** a new post arrives with a summary comment of what the crowd did yesterday.
- **A floor is never empty:** a subreddit can add "nameless delvers", bots that die on the new floor and carve what is true there (one carving in four lies on purpose, as players might). They are labelled, never on a board, and shape the next floor only when too few players fell there.

## How we built it
- **Platform:** Devvit Web, with a Phaser 4 game in the expanded view and a plain DOM splash card light enough for the feed.
- **One rule engine:** the rules live in one shared TypeScript module. The browser plays a run with it, and the server replays the logged moves with the same code before accepting a score, so the board can't be faked by editing the client.
- **The generator:** each floor is built from the day's tally (deaths per zone, kills, curse votes, traps). Every floor must pass solvability checks, and a bot plays it to measure its difficulty against a line that falls with depth. When the crowd's floor lands outside that band, the game gives up its own choices first and redraws its own layout; the players' curse and traps are kept. On 448 simulated days, 86% of posted floors land inside the band and 2% too hard.
- **Redis** holds runs, ghosts, votes and the boss's shared chain. The chain is moved by one atomic increment per accepted run, so exactly one run makes the kill.
- **The art** is the CC0 DungeonTileset II by 0x72, graded onto our own palette. The hero, the wisps and the torch are drawn for the game. Every sound is synthesized in code.

## Challenges
- Letting a crowd change a floor without ever making it unfair, and without throwing away what players chose: a bot measures every floor, a fallback ladder gives up the game's own choices before any player's, and the posted floor is redrawn until it sits in the band. Measuring on noise was its own problem; the final verdict uses 64 bot runs so a floor isn't kept or refused by luck.
- A boss shared by everyone, killed exactly once, even when two killing blows land at the same moment.
- Keeping the feed card fast (under 10 KB of script, gzipped) and getting the game from tap to its intro in about a second on Reddit's mobile web.
- Teaching a roguelike without a tutorial wall: six blind playtests reshaped the first floor, the hints, the map and every danger's warning.

## What we learned
- A crowd-shaped level needs a referee. Without a bot measuring every floor, a few unlucky days compounded into floors nobody could clear.
- Fairness has to be measured, not assumed: a win rate from 16 bot runs swings by 12 points, so the final verdict uses 64.
- Teaching beats telling. Each blind playtest removed text and added a one-line hint at the moment it mattered.
- A daily game needs a crowd on day one, so the game's own labelled bots fill a quiet floor and then step aside once real players arrive.

## What's next
- More families of dangers and curses as the floors deepen past the first Warden.
- Subreddit-versus-subreddit seasons: the same seed in two communities, compared floor by floor.
- Weekly digests in the subreddit: the deadliest tile, the most-trusted carving, the trap that caught the most delvers.

## Built with
Devvit Web, TypeScript, Phaser, Hono, Vite, Redis (Devvit), WebAudio.

## Links (for the form)
- Demo subreddit: https://www.reddit.com/r/DescentDaily/ (public). The pinned "Descent: today's floor" post always opens today's floor.
- Test post (pinned, always today): https://www.reddit.com/r/DescentDaily/comments/1y463th/descent_todays_floor/
- Reddit username: u/Clean_Position8332. Ported game: No.
- App listing: https://developers.reddit.com/apps/descent-game
- Code: https://github.com/Ken-1219/descent

## Testing instructions (for the form)
Open the pinned "Descent: today's floor" post on r/DescentDaily and tap Descend. A first visit starts with a one-minute practice floor. One run a day counts for the boards and shapes tomorrow; after it, "Practice this floor" on the result card replays the floor as often as you like. A new floor posts every day at 15:00 UTC with a summary comment of what the crowd did. Works on desktop, mobile web and the Reddit apps.

