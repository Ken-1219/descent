## Devvit Phaser Starter

A starter to build web applications on Reddit's developer platform

- [Devvit](https://developers.reddit.com/): A way to build and deploy immersive games on Reddit
- [Vite](https://vite.dev/): For compiling the webView
- [Phaser](https://phaser.io/): 2D game engine
- [Hono](https://hono.dev/): For backend logic
- [TypeScript](https://www.typescriptlang.org/): For type safety

## Getting Started

> Make sure you have Node 22 downloaded on your machine before running!

1. Run `npm create devvit@latest --template=phaser`
2. Go through the installation wizard. You will need to create a Reddit account and connect it to Reddit developers
3. Copy the command on the success page into your terminal

## Commands

- `npm run dev`: Starts a development server where you can develop your application live on Reddit.
- `npm run build`: Builds your client and server projects
- `npm run deploy`: Uploads a new version of your app
- `npm run launch`: Publishes your app for review
- `npm run login`: Logs your CLI into Reddit
- `npm run type-check`: Type checks, lints, and prettifies your app

## Credits

Thanks to the Phaser team for [providing a great template](https://github.com/phaserjs/template-vite-ts)!

### Fonts

Both fonts are self-hosted and licensed under the SIL Open Font License 1.1; the full text ships in `src/client/assets/fonts/OFL.txt`.

- Jacquard 24: Copyright 2023 The Soft Type Project Authors (https://github.com/scfried/soft-type-jacquard)
- Pixelify Sans: Copyright 2021 The Pixelify Sans Project Authors (https://github.com/eifetx/Pixelify-Sans)

### Sprites

- Dungeon tiles, items and creatures: 16x16 DungeonTileset II v1.7 by 0x72 (https://0x72.itch.io/dungeontileset-ii), CC0 1.0, in `src/client/assets/atlas.png`. Floors, walls, stairs, doors, spikes, the goblin, imp, skeleton and the Warden (`big_zombie`), potions and the bomb all come from it, with the pack's own animation frames. Thank you, 0x72.
- Drawn for Descent: the hero, the wisp, the wall torch, the death-to-wisp frames and the UI icons.
