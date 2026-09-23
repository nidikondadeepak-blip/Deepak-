# Konoha / Shinobi Arena

This repo contains:

1. **Konoha: Shadow of the Leaf** — walkable Hidden Leaf Village (`index.html`, `game.js`)
2. **Shinobi Arena** — 3D battle-royale demo under `client/` / `docs/`

## Konoha village (this branch)

Serve the repo root over HTTP and open `index.html`.

```bash
python3 serve.py
# http://localhost:3000
```

**Desktop:** WASD move · drag to look · click Rasengan · Space jump · E talk  
**Phone:** left stick · drag right to look · Jump / Rasengan / Talk

Collect 8 scrolls around the village.

## Shinobi Arena

Cel-shaded 3D battle royale in Konoha. Demo in [`docs/`](docs/). Local multiplayer:

```bash
npm install
npm start
```

**Android APK:** see the [latest release](https://github.com/nidikondadeepak-blip/Deepak-/releases/tag/latest) (`shinobi-arena.apk`).

Full design: [GAME_DESIGN_DOCUMENT.md](GAME_DESIGN_DOCUMENT.md)

*Fan-made parody inspired by Naruto. Not affiliated with Shueisha / TV Tokyo.*
