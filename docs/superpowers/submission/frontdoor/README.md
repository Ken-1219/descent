# Front-door kit for r/DescentDaily (Phase 11k, for the owner to apply by hand)

Everything here is from the game's own art and words: no "Reddit" in any name, and no Snoo.

## 1. Community description (Mod Tools → Community → General settings → Description, 500 characters at most)

> A daily dungeon: everyone plays the same floor once a day, and where the community dies builds tomorrow's floor.

## 2. Sidebar (a text widget, "About Descent")

> **How to play**
> 1. Open today's floor (the pinned post) and tap **Descend**. One run a day counts.
> 2. Reach the stairs before your torch burns out. Every danger shows a red mark a turn before it strikes.
> 3. Fall, and leave a warning on your ghost. Clear it, and vote tomorrow's curse and set a trap for the next delvers.
>
> A new floor every day at 15:00 UTC.
>
> **Privacy:** what Descent keeps and how to delete it: [r/DescentDaily/wiki/descent-privacy](https://www.reddit.com/r/DescentDaily/wiki/descent-privacy)

## 3. Welcome post (text post; pin it under the game post)

**Title:** Welcome to Descent: start here

> Descent is a dungeon that the community builds by dying in it.
>
> **Every day at 15:00 UTC a new floor opens, and everyone plays the same one, once.** A run takes a few minutes: a torch that burns with every move, three hearts, and dangers that always warn you a turn ahead.
>
> **What you do today shapes tomorrow.**
> - Where people fall, danger gathers on the next floor.
> - Fall, and you can carve a warning on your ghost for the next delvers. They vote it Trust or Liar.
> - Clear the floor, and you vote tomorrow's curse and hide a trap in it under your name. If it catches someone, you earn souls.
> - The next morning, the floor's intro shows your mark: where your trap waits, and whether your curse won.
>
> Every seventh floor, the Warden waits in chains. The whole community breaks its links together.
>
> **Start with the pinned "Descent: today's floor" post.** It always opens today's floor. Your first visit begins with a short practice floor.
>
> The nameless delvers you'll meet are the game's own bots, so the first floors aren't empty. They carve what's true where they fell, mostly. One in four lies.
>
> Privacy: [wiki/descent-privacy](https://www.reddit.com/r/DescentDaily/wiki/descent-privacy). Bugs and ideas: comment here.

## 4. Images (Mod Tools → Community appearance)

| File | Where | Size |
|---|---|---|
| `icon-256.png` | Avatar (community icon) | 256×256 |
| `banner-desktop-1920x384.png` | Banner, desktop | 1920×384 |
| `banner-mobile-1600x480.png` | Banner, mobile (if the setting offers a separate one) | 1600×480 |
| `thumb-1200x800.png` | Devpost thumbnail (3:2) | 1200×800 |

- **How they were made:** they're drawn in the Lab's "Front door" tab (`bun run local`, then http://localhost:5190/lab.html#frontdoor). They use the Descent sprites (the Delver, the wisps) and the graded CC0 dungeon tiles the game uses, in the game's two fonts and flat palette tokens (no gradients).
- **How they were exported:** a Playwright screenshot of each canvas at one CSS pixel per pixel.
- **Layout:** the banners keep the title in the centre third, which phones never crop. The left-most 200 px, where the icon and the community name sit, hold only wall and floor tiles.
