# 🍃 SHINOBI ARENA — Game Design Document

> **Genre:** 3D Multiplayer Arena / Battle Royale
> **Universe:** Naruto-inspired Hidden Leaf Village (Konoha)
> **Art style:** Colorful vibrant 3D anime (cel-shaded / toon)
> **Platform:** Web (Three.js + Node.js + Socket.IO) — desktop & mobile browsers
> **Players:** 4–12 per room (humans + bots), Solo or Squad
> **Version:** 1.0

---

## 1. Vision & Pillars

**One-liner:** *Free Fire-style battle royale, but you're a Naruto ninja with 200 HP, kunai-only combat, and rooftop parkour across the Hidden Leaf Village.*

### Design pillars
1. **Ninja fantasy first** — no guns exist. Kunai, shuriken and paper bombs only. Double jumps, chakra sprinting, rooftop-hopping.
2. **Every hero is viable** — all ninjas share 200 HP; heroes differ in mobility + one signature jutsu, never raw stats.
3. **Readable anime combat** — big damage numbers, kill confirms, screen shake, exaggerated jutsu VFX, killfeed.
4. **Zero-install multiplayer** — click PLAY in a browser and you're in a real-time 8-ninja battle in seconds.
5. **Short sessions** — 5s countdown, ~4–8 minute matches, instant requeue.

### Target audience
Anime fans 10+, casual shooter players, friend groups (room codes), streamers (spectate + results screen).

---

## 2. Core Loop

```
HOME → (Characters / Maps) → PLAY ─┐
                                    ▼
                    LOBBY (room code, ready, bots) → 5s COUNTDOWN
                                    ▼
                    BATTLE (loot ramen, 3rd-person throwing combat,
                            jutsu, shrinking barrier) → ELIMINATED? spectate
                                    ▼
                    RESULTS (placements, XP, level-up) → PLAY AGAIN
```

**Moment-to-moment loop (30s):** spot enemy → pick range/weapon → throw + strafe + double-jump → land jutsu → confirm kill → grab ramen → rotate with zone.

---

## 3. Playable Characters (all 200 HP)

| Hero | Style | Speed | Diff. | Signature Jutsu |
|---|---|---|---|---|
| **Naruto Uzumaki** | Brawler | 6.3 | ★☆☆ | **Rasengan** — 70 dmg point-blank chakra sphere + huge knockback. Punishes anyone in your face. |
| **Sasuke Uchiha** | Assassin | 6.5 | ★★☆ | **Chidori** — 14 m lightning dash, 55 dmg + 0.9 s stun to everyone in the path. Gap-closer + escape. |
| **Rock Lee** | Rushdown | 6.9 (fastest) | ★★☆ | **Taijutsu Barrage** — locks one enemy ≤7.5 m, 5 flying kicks × 12 dmg over 1.6 s, victim pinned in place. |
| **Hinata Hyuga** | Scout | 6.0 | ★★★ | **Byakugan Vision** — 8 s wallhack (enemies highlighted through everything) + 15% speed. Info wins fights. |
| **Sakura Haruno** | Support | 6.0 | ★☆☆ | **Medical Ninjutsu** — heals self 80 HP + squadmates 60 HP (14 m) over 3 s. Only sustain in the game. |

### Balance rules
- **HP is sacred:** `MAX_HP = 200` for everyone — enforced by unit test.
- Time-to-kill target: ~3–6 s of accurate throws (kunai ≈ 41 DPS).
- Rasengan (70) can never one-shot; two jutsu/throws combos finish kills.
- Every jutsu costs chakra (30–50) + long cooldown (16–25 s) → one use per fight, roughly.
- Lee is fastest but his jutsu needs setup; Hinata is slowest but sees everything.

---

## 4. Weapons (NINJA ONLY — no guns)

| Weapon | Key | Damage | Rate | Notes |
|---|---|---|---|---|
| **Kunai** | 1 | 14 | 0.34 s | Hitscan-feel projectile (46 m/s), accurate mid-range dueler. |
| **Shadow Shuriken ×3** | 2 | 7 × 3 | 0.62 s | Fan of 3 fast stars (54 m/s). Shotgun-like up close. |
| **Paper-Bomb Kunai** | 3 | 52 center / 22 edge | 4.0 s | Arcing lob (gravity), 5.5 m AoE, knockback, 8 chakra. 40% self-damage. |

- Infinite ammo (you're a ninja, pouches are bottomless), gated by cooldowns.
- Switching is instant (scroll wheel / 1-2-3 / tap).
- Projectiles are server-simulated with substepping (no tunneling), collide with players, roofs, walls, ground.

---

## 5. Maps

### 5.1 Hidden Leaf Village — Konoha (main battlefield, 240 m)
Iconic explorable landmarks, all collision-accurate (server layout = client visuals):
- **Hokage Monument** — 30 m climbable cliff with 5 carved stone faces (fight on top!).
- **Ichiraku Ramen** — red awning, noren curtains, sign pole, stools & counter.
- **Hokage Tower** (火影 mansion), **Ninja Academy** (忍), market stalls, village gate.
- **Rooftop parkour grid** — ~30 houses 4.5–9 m tall with jumpable 6–10 m gaps.
- **Training grounds** — fenced yard, wooden dummies, ◎ targets, sparring stage, torches.
- Lake + bridge, torii gates, stone lanterns, forest ring, drifting leaf particles.

### 5.2 Training Grounds 44 (forest arena, 220 m)
Giant climbable trees, floating branch platforms, central tower, river + 2 bridges, scattered dummies. Ambush/verticality map — Hinata's playground.

### 5.3 Valley of the End — 🔒 COMING SOON (2–4 player duel map teaser)

---

## 6. Systems

### 6.1 Health, Chakra, Regen
- **200 HP**, no armor. Out-of-combat regen: 4 HP/s after 6 s without damage.
- **100 chakra:** fuels sprint (9/s drain), paper bombs (8), jutsu (30–50). Regens 14/s.
- **🍜 Ramen pickups:** 9–12 per map, walk-over to heal 60 HP, respawn in 30 s.

### 6.2 Movement
- WASD + mouse-look 3rd-person (5.4 m shoulder cam with wall pull-in).
- **Double jump** (chakra jump), sprint ×1.42, rooftop collision + step-up.
- Server-authoritative: clients send intent @20 Hz; circle-vs-AABB resolve, standable roofs.

### 6.3 Akatsuki Barrier (shrinking zone)
5 phases (wait → shrink → smaller circle), DPS 4 → 7 → 12 → 18 → 25 outside. Rendered as a giant red barrier wall + minimap circle + HUD countdown. Forces rooftop rotations and final showdowns.

### 6.4 Modes
- **Solo (FFA):** last ninja standing. Sakura heals only herself.
- **Squad:** auto-balanced teams (≤4 teams), friendly fire OFF, Sakura heals teammates ≤14 m. Last team standing.

### 6.5 Bots
Server-side ninja AI fills rooms to 8 (quick-play) or on host request: range-keeping strafes, double jumps, weapon choice by distance, jutsu with per-hero logic (Lee rushes, Sakura heals <130 HP, Hinata reveals), ramen-seeking when hurt, zone rotation. Named after the extended cast (Kakashi, Guy, Tenten…).

### 6.6 Progression (local profile)
Name, hero, XP/levels (`Lv = 1 + √(xp/600)`): kills ×120, placement bonus, +400 win. Matches/wins/kills persist in `localStorage`.

### 6.7 Combat feel ("game juice")
Hitmarkers, kill confirms, DOM damage numbers (crits ≥40), red damage vignette, screen shake (toggle), death smoke-poofs, throw puffs, landing dust, Byakugan screen tint + through-wall markers, announcements ("BARRIER SHRINKING!"), synthesized SFX (no audio files).

---

## 7. Controls

| Action | Desktop | Mobile |
|---|---|---|
| Move | WASD | Left joystick |
| Aim | Mouse (pointer-lock) | Right-half drag |
| Throw | LMB (hold = auto) | ◎ button |
| Weapons | 1/2/3 or wheel | 🗡 cycles |
| Jutsu | Q | 🌀 button |
| Jump ×2 | Space | ▲ button |
| Sprint | Shift | Joystick full-tilt (auto) |
| Pause | ESC | ⏸ button |
| Spectate next | N / button | button |

---

## 8. UI / UX Flow (implemented screens)

1. **Home** — logo, profile card (name/XP/stats), PLAY, Solo/Squad toggle, map label, Create/Join room, menu (Characters/Maps/How-to/Settings).
2. **Characters** — 3D rotatable preview (drag), 200 HP bar, speed, difficulty pips, skill card, quote, 5 hero cards, SELECT.
3. **Maps** — 3 map cards w/ art, player counts, SELECT (Valley locked).
4. **Lobby** — room code, map/mode, ninja list w/ ready states, Ready/Add Bot/Start(host)/Leave, live countdown.
5. **Game HUD** — crosshair, hitmarker, HP/chakra bars, 3 weapon slots + jutsu slot w/ cooldown sweep, killfeed, minimap (buildings/zone/ramen/blips), alive/kills/timer/zone pills, buffs, announcements, spectate bar, pause, mute, touch layer.
6. **Results** — winner banner, reason, placements table (kills/damage/healed), XP toast, Play Again/Home.
7. **Modals** — How to Play (goal/controls/jutsu/ninja law), Settings (sensitivity/volume/quality/invert/shake), toasts.

---

## 9. Technical Design (netcode & architecture)

- **Authoritative server, dumb renderers:** Node.js + Socket.IO @20 Hz tick. Clients send only intents (`input`, `fire`, `useSkill`); server simulates movement, projectiles, jutsu, zone, bots, damage — and broadcasts compact `snapshot`s.
- **Single source of truth:** `server/constants.js` (HP/damage/cooldowns/heroes) and `server/mapLayout.js` (colliders/spawns/pickups) are served via `/api/config` + `/api/map/:id`, so client visuals/FX can never drift from simulation.
- **Interpolation:** clients lerp all ninjas (incl. self) toward 20 Hz snapshots (≈50–100 ms behind, teleport-snap >12 m for dashes/spawns).
- **Hit resolution:** server-side substepped projectiles (3 substeps), radius checks; melee jutsu use range/arc tests. Friendly-fire off in squads.
- **Rooms:** quick-play (auto-fill + auto-start) and code rooms (host-controlled, bots optional). Empty rooms GC'd.
- **Anti-cheat (v1):** server validates cooldowns, chakra, ranges, stuns; speed is server-integrated (teleport hacks impossible); disconnect = elimination (no AFK wins).
- **Rendering:** Three.js (vendored locally, zero CDN dependency), `MeshToonMaterial` + gradient map + inverted-hull outlines, instanced trees/lanterns, one shadow-casting sun, pooled particles (1600), DOM damage numbers, canvas minimap.
- **Audio:** 100% WebAudio-synthesized SFX (throws, explosions, per-jutsu signatures, jingles). No assets.
- **Scale notes:** 12 players × 20 Hz snapshots ≈ trivial bandwidth; rooms are independent (multi-core via clustering is future work).

---

## 10. Art Direction

- **Cel-shaded anime:** 4-step toon gradient, black inverted-hull outlines on heroes, saturated palette (Konoha orange/teal/leaf-green).
- **Chibi-proportioned ninjas** (~1.75 m, big heads) with per-hero hair sculpts (Naruto spikes, Sasuke fringe, Lee bowl, Hinata hime, Sakura bob), whiskers/brows, leaf headbands.
- **Konoha dressing:** kanji signage (火影/忍/一楽/木ノ葉), red awnings, paper lanterns, torii, drifting leaves, toy-like mountains + clouds.
- **VFX language:** blue = chakra (Rasengan/Chidori), red = danger (barrier/explosions), green = healing, white = Byakugan, yellow = hype (kills/level).

---

## 11. Balancing Tables

### Jutsu economy
| Jutsu | Dmg | CD | Chakra | Notes |
|---|---|---|---|---|
| Rasengan | 70 | 18 s | 40 | 4.8 m, 108° arc, knockback |
| Chidori | 55 | 16 s | 40 | 14 m dash, 2.6 m wide, 0.9 s stun |
| Barrage | 5×12=60 | 20 s | 45 | ≤7.5 m lock, pins victim 1.6 s |
| Byakugan | 0 (info) | 22 s | 30 | 8 s wallhack + 15% speed |
| Heal | −80/−60 | 25 s | 50 | 3 s HoT, 14 m squad radius |

### TTK reference (200 HP)
Kunai 14 @0.34 s ≈ 41 DPS → ~5 s · Shuriken 21 @0.62 s close ≈ 34 DPS · Bomb 52 direct · Bomb + kunai ×2 = 80 burst.

---

## 12. Roadmap (post-1.0 ideas)

- Valley of the End duel map + 1v1 ranked ladder
- More heroes (Kakashi: Lightning Blade; Gaara: Sand Shield; Shikamaru: Shadow Possession)
- Cosmetics: headbands, outfits, kill effects (local unlocks)
- Replays / killcam, voice emotes, clans & friends list
- Reconnect support, regional relays, server clustering
- Anti-cheat v2 (input sanity heuristics), ranked seasons

---

*Believe it! 🍃 — Fan-made parody. Not affiliated with Naruto / Shueisha / TV Tokyo.*
