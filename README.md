# 🍃 SHINOBI ARENA — Naruto-universe 3D Multiplayer Battle Royale

A colorful, cel-shaded **3D anime battle royale** (Free Fire-style) set in the Hidden Leaf Village.
**200 HP** each. **Kunai, shuriken & paper bombs only — NO GUNS.** Five heroes with signature jutsu,
rooftop parkour across Konoha, shrinking barrier, real-time multiplayer, bots, squads, and mobile support.

📖 Full vision, balance & systems: **[GAME_DESIGN_DOCUMENT.md](GAME_DESIGN_DOCUMENT.md)**

---

## ▶ Run it (30 seconds)

```bash
npm install
npm start
# open http://localhost:3000
```

- **PLAY** = instant 8-ninja battle (you + 7 bots).
- **Create Room** = get a 5-letter code, share it, friends join from any browser on your network
  (`http://YOUR-IP:3000`). Add bots, press START.
- `npm test` = headless sim tests · `node tests/e2e.test.js` = live 2-client network test (server must be running).

> No build step, no CDN calls — Three.js is vendored via npm and served locally, SFX are synthesized in code.

---

## 🥷 Heroes & Jutsu (Q)

| Hero | Jutsu | Effect |
|---|---|---|
| Naruto | 🌀 Rasengan | 70 dmg point-blank sphere + huge knockback |
| Sasuke | ⚡ Chidori | 14 m dash, 55 dmg + stun |
| Rock Lee | 🦵 Taijutsu Barrage | 5 flying kicks pin one enemy (60 dmg) |
| Hinata | 👁 Byakugan | 8 s see-through-walls + speed |
| Sakura | 💚 Medical Ninjutsu | Heal self 80 + squad 60 |

## 🗺 Maps
- **Hidden Leaf Village (Konoha)** — Hokage Monument, Ichiraku Ramen, Academy, training grounds, parkour rooftops
- **Training Grounds 44** — giant trees, branch platforms, river
- **Valley of the End** — 🔒 coming soon

## 🕹 Controls
**WASD** move · **Mouse** aim · **LMB** throw · **1/2/3** weapons · **Q** jutsu · **Space×2** double jump ·
**Shift** sprint · **ESC** pause · walk over **🍜 ramen** to heal · mobile: joystick + buttons

---

## 🧱 Code structure

```
shinobi-arena/
├── server/                    # authoritative simulation (Node + Socket.IO @20Hz)
│   ├── server.js              # express + REST (/api/config, /api/map/:id) + rooms/matchmaking
│   ├── GameRoom.js            # THE game: movement/collision, projectiles, jutsu,
│   │                          # zone, pickups, bot AI, damage/death, snapshots
│   ├── constants.js           # single source of truth: 200 HP, weapons, heroes, tuning
│   └── mapLayout.js           # Konoha + Training Grounds: colliders/spawns/pickups/decor
├── client/                    # Three.js renderer + UI (zero build step)
│   ├── index.html             # Home · Characters · Maps · Lobby · Game HUD · Results · modals
│   ├── css/style.css          # anime UI theme
│   └── js/
│       ├── main.js            # boot, profile/XP, screen routing, lobby/match flow
│       ├── game.js            # live match: camera, input, interpolation, combat feedback
│       ├── net.js             # socket.io wrapper
│       ├── world.js           # builds 3D Konoha from server layout JSON (visuals==collision)
│       ├── characters.js      # cel-shaded ninja rig + hair/outfits + procedural animation
│       ├── weapons.js         # kunai/shuriken/bomb projectile meshes
│       ├── fx.js              # pooled particles + Rasengan/Chidori/heal/explosion VFX
│       ├── preview.js         # character-select 3D turntable
│       ├── ui.js              # HUD, minimap, killfeed, lobby/results, toasts
│       └── audio.js           # 100% synthesized WebAudio SFX (no files)
├── tests/
│   ├── sim.test.js            # headless: 200HP rule, no-guns rule, bot match, squad heal, jutsu
│   └── e2e.test.js            # live server: 2-human room + quickplay protocol test
└── GAME_DESIGN_DOCUMENT.md    # complete GDD (vision, balance, netcode, roadmap)
```

### Core logic in 60 seconds
- **Server owns everything:** clients send intents (`input` @20Hz, `fire`, `useSkill`); `GameRoom.update()`
  integrates movement (circle-vs-AABB, standable roofs, double jump), substeps projectiles,
  resolves 5 jutsu, shrinks the zone, runs bot brains, and emits compact `snapshot`s.
- **Client renders & predicts feel:** `game.js` lerps ninjas to snapshots, flies a shoulder-cam with
  wall pull-in, and plays optimistic throw sounds/animations; all damage/positions stay server-true.
- **One truth, two builders:** `mapLayout.js` colliders drive server physics AND `world.js` meshes —
  what you see is what you collide with. Same for tuning via `/api/config`.

### Socket protocol
`quickPlay · createRoom · joinRoom · leaveRoom · setCharacter · setReady · addBot · startMatch ·
input · fire · useSkill` → `welcome · room · snapshot · matchEnd · errorMsg`

---

*Fan-made parody inspired by Naruto. Not affiliated with Shueisha / TV Tokyo. Believe it! 🍃*
