// ============================================================================
// SHINOBI ARENA — GameRoom: authoritative 20Hz simulation for one match.
// Owns: players, projectiles, pickups, shrinking zone, bot AI, damage, deaths.
// Clients only send intents (move/fire/skill); the server decides everything.
// ============================================================================
import {
  TICK_DT, MAX_HP, MAX_CHAKRA, CHAKRA_REGEN, SPRINT_DRAIN, SPRINT_MULT,
  GRAVITY, JUMP_VEL, MAX_JUMPS, PLAYER_RADIUS, PLAYER_HEIGHT, MATCH_TIME, COUNTDOWN_TIME,
  REGEN_DELAY, REGEN_RATE, RAMEN_HEAL, RAMEN_RESPAWN, ZONE_PHASES,
  WEAPONS, CHARACTERS, BOT_NAMES,
} from './constants.js';
import { getMapLayout } from './mapLayout.js';

let projCounter = 1;
let botCounter = 1;

function rand(a, b) { return a + Math.random() * (b - a); }
function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function dist2D(ax, az, bx, bz) { return Math.hypot(ax - bx, az - bz); }

export class GameRoom {
  constructor(code, { mapId = 'konoha', mode = 'solo', hostId = null } = {}) {
    this.code = code;
    this.mapId = mapId;
    this.mode = mode; // 'solo' | 'squad'
    this.hostId = hostId;
    this.layout = getMapLayout(mapId);
    this.half = this.layout.size / 2 - 2;
    this.players = new Map();   // id -> player
    this.sockets = new Map();   // id -> socket (humans only)
    this.projectiles = [];
    this.events = [];           // flushed to clients every tick
    this.state = 'lobby';       // lobby | countdown | playing | ended
    this.tick = 0;
    this.time = 0;              // match elapsed
    this.countdown = 0;
    this.endAt = 0;
    this.result = null;
    this.pickups = this.layout.pickups.map((p) => ({ ...p, taken: false, timer: 0 }));
    this.zone = this.freshZone();
    this.nextThink = 0;
  }

  // ------------------------------------------------------------- lobby ----
  addPlayer(id, name, characterId, isBot = false, socket = null) {
    if (!CHARACTERS[characterId]) characterId = 'naruto';
    const team = this.mode === 'squad' ? this.assignTeam() : -1;
    const p = {
      id, name: String(name || 'Ninja').slice(0, 16), characterId, isBot, team,
      x: 0, y: 0, z: 0, vy: 0, yaw: 0, pitch: 0, onGround: true, jumps: MAX_JUMPS,
      hp: MAX_HP, chakra: MAX_CHAKRA, alive: true,
      weapon: 'kunai',
      weaponCdUntil: 0, skillCdUntil: 0,
      lastDamageAt: -99, lastVictimOf: null,
      kills: 0, deaths: 0, damage: 0, healed: 0,
      // debuffs / buffs
      stunUntil: 0, byakuganUntil: 0,
      healPool: 0, healUntil: 0,         // sakura self-HoT
      // active skill animation locks (server-resolved)
      lock: null,                        // { type:'chidori'|'barrage', ... }
      barrageTarget: null,
      // net input (latest intent from client / bot brain)
      input: { mx: 0, mz: 0, yaw: 0, pitch: 0, sprint: false, jump: false },
      ready: isBot, // bots are always "ready"
      fx: [],                            // one-shot fx flags consumed by snapshot
      bot: isBot ? this.freshBotBrain() : null,
      deadSpectate: null,
    };
    this.players.set(id, p);
    if (socket) this.sockets.set(id, socket);
    if (!this.hostId && !isBot) this.hostId = id;
    return p;
  }

  assignTeam() {
    const counts = {};
    for (const p of this.players.values()) {
      if (p.team >= 0) counts[p.team] = (counts[p.team] || 0) + 1;
    }
    let best = 0, bestN = Infinity;
    for (let t = 0; t < 4; t++) {
      const n = counts[t] || 0;
      if (n < bestN) { bestN = n; best = t; }
    }
    return best;
  }

  removePlayer(id) {
    this.players.delete(id);
    this.sockets.delete(id);
    if (this.hostId === id) {
      const next = [...this.players.values()].find((p) => !p.isBot);
      this.hostId = next ? next.id : null;
    }
  }

  humans() { return [...this.players.values()].filter((p) => !p.isBot); }
  alivePlayers() { return [...this.players.values()].filter((p) => p.alive); }

  lobbyState() {
    return {
      code: this.code, mapId: this.mapId, mode: this.mode,
      state: this.state, hostId: this.hostId, countdown: Math.ceil(this.countdown),
      players: [...this.players.values()].map((p) => ({
        id: p.id, name: p.name, characterId: p.characterId,
        team: p.team, isBot: p.isBot, ready: p.ready,
      })),
    };
  }

  // ------------------------------------------------------------- match ----
  fillWithBots(target) {
    const chars = Object.keys(CHARACTERS);
    let bi = 0;
    while (this.players.size < target) {
      const name = BOT_NAMES[(botCounter + bi) % BOT_NAMES.length];
      const ch = chars[(botCounter + bi) % chars.length];
      this.addPlayer(`bot-${botCounter++}`, `${name}`, ch, true);
      bi++;
      if (bi > 20) break;
    }
  }

  startCountdown() {
    if (this.state !== 'lobby') return false;
    if (this.players.size < 2) return false;
    this.state = 'countdown';
    this.countdown = COUNTDOWN_TIME;
    return true;
  }

  beginMatch() {
    this.state = 'playing';
    this.tick = 0; this.time = 0;
    this.projectiles = [];
    this.events = [];
    this.zone = this.freshZone();
    this.pickups = this.layout.pickups.map((p) => ({ ...p, taken: false, timer: 0 }));
    // spawn everyone spread out
    const spawns = this.layout.spawns;
    let i = 0;
    for (const p of this.players.values()) {
      const s = spawns[i % spawns.length]; i++;
      p.x = s.x + rand(-2, 2); p.z = s.z + rand(-2, 2);
      p.y = this.groundHeightAt(p.x, p.z) + 0.1;
      p.yaw = s.yaw; p.pitch = 0; p.vy = 0;
      p.hp = MAX_HP; p.chakra = MAX_CHAKRA; p.alive = true;
      p.kills = 0; p.deaths = 0; p.damage = 0; p.healed = 0;
      p.lock = null; p.fx = [];
      p.stunUntil = 0; p.byakuganUntil = 0; p.healPool = 0;
    }
    this.emit({ k: 'announce', text: 'BATTLE START!', sub: 'Last ninja standing wins' });
  }

  freshZone() {
    const s = this.layout.zoneStart;
    return { x: s.x, z: s.z, r: s.r, tx: s.x, tz: s.z, tr: s.r, phase: 0, timer: ZONE_PHASES[0].wait, shrinking: false };
  }

  endMatch(reason) {
    if (this.state === 'ended') return;
    this.state = 'ended';
    const sorted = [...this.players.values()].sort((a, b) =>
      (b.alive - a.alive) || (b.kills - a.kills) || (b.damage - a.damage));
    this.result = {
      reason,
      winner: sorted[0] ? { id: sorted[0].id, name: sorted[0].name, characterId: sorted[0].characterId, team: sorted[0].team } : null,
      placements: sorted.map((p, i) => ({
        place: i + 1, id: p.id, name: p.name, characterId: p.characterId,
        team: p.team, isBot: p.isBot, kills: p.kills, damage: Math.round(p.damage),
        healed: Math.round(p.healed), alive: p.alive,
      })),
    };
    this.endAt = this.time;
  }

  // ----------------------------------------------------------- collision --
  groundHeightAt(x, z) {
    let g = 0;
    for (const c of this.layout.colliders) {
      if (!c.stand) continue;
      if (Math.abs(x - c.x) <= c.w / 2 && Math.abs(z - c.z) <= c.d / 2) {
        if (c.y1 > g) g = c.y1;
      }
    }
    return g;
  }

  // Push a circle (player) out of solid boxes it intersects vertically.
  collidePlayer(p) {
    p.x = clamp(p.x, -this.half, this.half);
    p.z = clamp(p.z, -this.half, this.half);
    for (const c of this.layout.colliders) {
      if (!c.solid) continue;
      // If feet are above the top (with step tolerance), it's a floor, not a wall.
      if (p.y >= c.y1 - 0.45) continue;
      // If player head is below box bottom, ignore (bridge decks etc.)
      if (p.y + PLAYER_HEIGHT <= c.y0 + 0.05) continue;
      const dx = p.x - c.x, dz = p.z - c.z;
      const px = c.w / 2 + PLAYER_RADIUS - Math.abs(dx);
      const pz = c.d / 2 + PLAYER_RADIUS - Math.abs(dz);
      if (px > 0 && pz > 0) {
        if (px < pz) p.x = c.x + Math.sign(dx || 1) * (c.w / 2 + PLAYER_RADIUS);
        else p.z = c.z + Math.sign(dz || 1) * (c.d / 2 + PLAYER_RADIUS);
      }
    }
  }

  pointHitsWorld(x, y, z) {
    if (y <= 0.02) return true;
    if (Math.abs(x) > this.half + 1 || Math.abs(z) > this.half + 1) return true;
    for (const c of this.layout.colliders) {
      if (!c.solid && !c.stand) continue;
      if (y < c.y0 || y > c.y1) continue;
      if (Math.abs(x - c.x) <= c.w / 2 && Math.abs(z - c.z) <= c.d / 2) return true;
    }
    return false;
  }

  // ---------------------------------------------------------------- tick --
  update() {
    if (this.state === 'countdown') {
      this.countdown -= TICK_DT;
      if (this.countdown <= 0) this.beginMatch();
      return;
    }
    if (this.state !== 'playing') return;
    this.tick++;
    this.time += TICK_DT;

    // bots think on a staggered schedule
    if (this.time >= this.nextThink) {
      this.nextThink = this.time + 0.25;
      for (const p of this.players.values()) if (p.isBot && p.alive) this.thinkBot(p);
    }

    for (const p of this.players.values()) {
      if (p.alive) this.updatePlayer(p);
    }
    this.updateProjectiles();
    this.updatePickups();
    this.updateZone();
    this.checkMatchEnd();
  }

  speedOf(p) {
    const base = CHARACTERS[p.characterId].speed;
    let s = base;
    if (p.input.sprint && p.chakra > 1) s *= SPRINT_MULT;
    if (this.time < p.byakuganUntil) s *= CHARACTERS.hinata.skill.speedBuff;
    if (this.time < p.stunUntil) s = 0;
    if (p.lock) s = 0; // skill lock overrides movement
    return s;
  }

  updatePlayer(p) {
    const stunned = this.time < p.stunUntil;

    // --- skill locks (chidori dash / lee barrage positioning) ---
    if (p.lock) this.updateLock(p);

    // --- movement from intent ---
    const inp = p.input;
    const sp = this.speedOf(p);
    if (!stunned && !p.lock) {
      // camera-relative wish dir
      const sin = Math.sin(inp.yaw), cos = Math.cos(inp.yaw);
      let dx = inp.mx * cos - inp.mz * sin;
      let dz = -inp.mx * sin - inp.mz * cos;
      const len = Math.hypot(dx, dz);
      if (len > 1) { dx /= len; dz /= len; }
      const moving = len > 0.05;
      p.x += dx * sp * TICK_DT;
      p.z += dz * sp * TICK_DT;
      p.yaw = inp.yaw; p.pitch = clamp(inp.pitch, -1.2, 1.2);
      if (moving && inp.sprint && p.chakra > 0) p.chakra = Math.max(0, p.chakra - SPRINT_DRAIN * TICK_DT);
      // jump (edge consumed)
      if (inp.jump) {
        inp.jump = false;
        if (p.jumps > 0) {
          p.vy = JUMP_VEL;
          p.jumps--;
          p.onGround = false;
          p.fx.push(p.jumps === MAX_JUMPS - 1 ? 'jump' : 'djump');
        }
      }
    } else {
      p.yaw = inp.yaw; p.pitch = clamp(inp.pitch, -1.2, 1.2);
      inp.jump = false;
    }

    // --- vertical ---
    p.vy -= GRAVITY * TICK_DT;
    p.y += p.vy * TICK_DT;
    this.collidePlayer(p);
    const g = this.groundHeightAt(p.x, p.z);
    if (p.y <= g) {
      // fell onto a roof/ground (but not through a tall wall — collide ran first)
      if (p.vy < -3) p.fx.push('land');
      p.y = g; p.vy = 0; p.onGround = true; p.jumps = MAX_JUMPS;
    } else if (p.y > g + 0.05) {
      p.onGround = false;
    }

    // --- chakra regen ---
    if (!(inp.sprint && (Math.abs(inp.mx) + Math.abs(inp.mz) > 0.05))) {
      p.chakra = Math.min(MAX_CHAKRA, p.chakra + CHAKRA_REGEN * TICK_DT);
    }
    // --- out-of-combat hp regen ---
    if (this.time - p.lastDamageAt > REGEN_DELAY && p.hp < MAX_HP) {
      p.hp = Math.min(MAX_HP, p.hp + REGEN_RATE * TICK_DT);
    }
    // --- sakura heal-over-time ---
    if (p.healPool > 0 && this.time < p.healUntil) {
      const tick = Math.min(p.healPool, (p.healPool / Math.max(0.01, p.healUntil - this.time)) * TICK_DT + 0.001);
      const real = Math.min(tick, MAX_HP - p.hp);
      p.hp += real; p.healPool -= tick;
      p.healed += real;
    }
    // --- zone damage ---
    if (dist2D(p.x, p.z, this.zone.x, this.zone.z) > this.zone.r) {
      const dps = ZONE_PHASES[Math.min(this.zone.phase, ZONE_PHASES.length - 1)].dps;
      this.damage(p, null, dps * TICK_DT, 'zone');
    }
    // --- ramen pickups (walk over) ---
    for (let i = 0; i < this.pickups.length; i++) {
      const pk = this.pickups[i];
      if (pk.taken) continue;
      if (p.hp >= MAX_HP) continue;
      if (dist2D(p.x, p.z, pk.x, pk.z) < 1.6 && Math.abs(p.y - 0) < 3) {
        pk.taken = true; pk.timer = RAMEN_RESPAWN;
        const real = Math.min(RAMEN_HEAL, MAX_HP - p.hp);
        p.hp += real; p.healed += real;
        p.fx.push('ramen');
        this.emit({ k: 'pickup', id: p.id, idx: i });
      }
    }
  }

  // ------------------------------------------------------------ projectiles
  fire(p, yaw, pitch, weaponId) {
    if (!p.alive || this.time < p.stunUntil || p.lock) return;
    const w = WEAPONS[weaponId] || WEAPONS.kunai;
    if (this.time < p.weaponCdUntil) return;
    if (p.chakra < (w.chakraCost || 0)) return;
    p.chakra -= w.chakraCost || 0;
    p.weaponCdUntil = this.time + w.cooldown;
    p.weapon = w.id;
    p.yaw = yaw; p.pitch = clamp(pitch, -1.2, 1.2);

    const ox = p.x - Math.sin(yaw) * 0.6;
    const oz = p.z - Math.cos(yaw) * 0.6;
    const oy = p.y + 1.55;
    for (let i = 0; i < w.count; i++) {
      const off = (i - (w.count - 1) / 2) * (w.spread || 0);
      const a = yaw + off + (p.isBot ? rand(-0.03, 0.03) : 0);
      const cp = Math.cos(pitch), spp = Math.sin(pitch);
      this.projectiles.push({
        id: projCounter++,
        kind: w.id,
        ownerId: p.id,
        team: p.team,
        x: ox, y: oy, z: oz,
        vx: -Math.sin(a) * cp * w.speed,
        vy: (w.id === 'bomb' ? w.upVel : 0) + spp * w.speed * (w.id === 'bomb' ? 0.6 : 1),
        vz: -Math.cos(a) * cp * w.speed,
        gravity: w.gravity,
        life: w.life,
        damage: w.damage,
        age: 0,
      });
    }
    p.fx.push(w.id === 'bomb' ? 'throwBomb' : 'throw');
  }

  updateProjectiles() {
    const keep = [];
    for (const pr of this.projectiles) {
      pr.age += TICK_DT;
      pr.life -= TICK_DT;
      pr.vy -= pr.gravity * TICK_DT;
      // substep for fast projectiles so they can't tunnel through ninjas
      const steps = 3;
      let dead = pr.life <= 0;
      let hitPlayer = null;
      for (let s = 0; s < steps && !dead && !hitPlayer; s++) {
        pr.x += (pr.vx / steps) * TICK_DT;
        pr.y += (pr.vy / steps) * TICK_DT;
        pr.z += (pr.vz / steps) * TICK_DT;
        if (this.pointHitsWorld(pr.x, pr.y, pr.z)) { dead = true; break; }
        for (const p of this.players.values()) {
          if (!p.alive || p.id === pr.ownerId) continue;
          if (this.mode === 'squad' && p.team === pr.team) continue;
          const dx = p.x - pr.x, dz = p.z - pr.z;
          if (dx * dx + dz * dz > 0.85 * 0.85) continue;
          if (pr.y > p.y - 0.2 && pr.y < p.y + PLAYER_HEIGHT + 0.25) { hitPlayer = p; break; }
        }
      }
      if (pr.kind === 'bomb') {
        if (hitPlayer || dead) {
          this.explode(pr.x, pr.y, pr.z, pr);
          continue;
        }
        keep.push(pr);
        continue;
      }
      if (hitPlayer) {
        const owner = this.players.get(pr.ownerId);
        this.damage(hitPlayer, owner, pr.damage, pr.kind);
        if (owner && !owner.isBot) owner.fx.push('hitmark');
        continue;
      }
      if (!dead) keep.push(pr);
    }
    this.projectiles = keep;
  }

  explode(x, y, z, pr) {
    const w = WEAPONS.bomb;
    const owner = this.players.get(pr.ownerId);
    this.emit({ k: 'boom', x, y, z, r: w.aoe });
    for (const p of this.players.values()) {
      if (!p.alive) continue;
      if (this.mode === 'squad' && owner && p.team === owner.team && p.id !== owner.id) continue;
      const d = Math.sqrt((p.x - x) ** 2 + ((p.y + 0.9 - y) ** 2) + (p.z - z) ** 2);
      if (d > w.aoe) continue;
      const t = 1 - d / w.aoe;
      const dmg = w.minSplash + (w.damage - w.minSplash) * t;
      // self-damage at 40% so bombs stay fun, not suicidal
      this.damage(p, owner, p.id === pr.ownerId ? dmg * 0.4 : dmg, 'bomb');
      // knockback
      const nx = (p.x - x) / (d || 1), nz = (p.z - z) / (d || 1);
      p.x += nx * 3.2 * t; p.z += nz * 3.2 * t;
      p.vy = Math.max(p.vy, 6 * t);
      p.onGround = false;
      this.collidePlayer(p);
    }
    if (owner && !owner.isBot) owner.fx.push('hitmark');
  }

  // ---------------------------------------------------------------- combat
  damage(victim, attacker, amount, source) {
    if (!victim.alive || this.state !== 'playing') return;
    if (amount <= 0) return;
    victim.hp -= amount;
    victim.lastDamageAt = this.time;
    if (attacker && attacker.id !== victim.id) {
      attacker.damage += amount;
      victim.lastVictimOf = attacker.id;
    }
    if (victim.hp <= 0) {
      victim.hp = 0;
      victim.alive = false;
      victim.deaths++;
      victim.lock = null;
      this.emit({ k: 'death', victim: victim.id, vName: victim.name, vChar: victim.characterId });
      if (attacker && attacker.id !== victim.id) {
        attacker.kills++;
        this.emit({
          k: 'kill', killer: attacker.id, kName: attacker.name,
          victim: victim.id, vName: victim.name, weapon: source,
        });
        if (!attacker.isBot) attacker.fx.push('killConfirm');
      } else {
        this.emit({ k: 'kill', killer: null, kName: source === 'zone' ? 'BARRIER' : '???', victim: victim.id, vName: victim.name, weapon: source });
      }
    } else if (amount >= 1) {
      this.emit({ k: 'dmg', id: victim.id, amt: Math.round(amount), hp: Math.round(victim.hp) });
    }
  }

  // ----------------------------------------------------------------- skills
  useSkill(p, yaw, pitch) {
    if (!p.alive || this.time < p.stunUntil || p.lock) return;
    const ch = CHARACTERS[p.characterId];
    const s = ch.skill;
    if (this.time < p.skillCdUntil) return;
    if (p.chakra < s.chakra) { p.fx.push('noChakra'); return; }
    p.chakra -= s.chakra;
    p.yaw = yaw;
    const enemies = [...this.players.values()].filter((e) =>
      e.alive && e.id !== p.id && (this.mode !== 'squad' || e.team !== p.team));

    switch (s.id) {
      case 'rasengan': {
        p.skillCdUntil = this.time + s.cooldown;
        p.fx.push('skill:rasengan');
        this.emit({ k: 'skill', id: p.id, skill: 'rasengan' });
        // small forward lunge
        p.x -= Math.sin(yaw) * 2.2; p.z -= Math.cos(yaw) * 2.2;
        this.collidePlayer(p);
        for (const e of enemies) {
          const d = dist2D(p.x, p.z, e.x, e.z);
          if (d > s.range || Math.abs(e.y - p.y) > 3) continue;
          let ang = Math.atan2(-(e.x - p.x), -(e.z - p.z)) - yaw;
          while (ang > Math.PI) ang -= Math.PI * 2;
          while (ang < -Math.PI) ang += Math.PI * 2;
          if (Math.abs(ang) > s.arc) continue;
          this.damage(e, p, s.damage, 'skill:rasengan');
          const nx = (e.x - p.x) / (d || 1), nz = (e.z - p.z) / (d || 1);
          e.x += nx * 4; e.z += nz * 4; e.vy = Math.max(e.vy, 7);
          e.onGround = false;
          this.collidePlayer(e);
        }
        break;
      }
      case 'chidori': {
        p.skillCdUntil = this.time + s.cooldown;
        p.fx.push('skill:chidori');
        this.emit({ k: 'skill', id: p.id, skill: 'chidori' });
        p.lock = { type: 'chidori', t: 0, dur: 0.38, yaw, hit: new Set() };
        break;
      }
      case 'barrage': {
        // need a target in range
        let best = null, bestD = s.range;
        for (const e of enemies) {
          const d = dist2D(p.x, p.z, e.x, e.z);
          if (d < bestD && Math.abs(e.y - p.y) < 4) { best = e; bestD = d; }
        }
        if (!best) { p.chakra += s.chakra; p.fx.push('noTarget'); return; } // refund
        p.skillCdUntil = this.time + s.cooldown;
        p.fx.push('skill:barrage');
        this.emit({ k: 'skill', id: p.id, skill: 'barrage', target: best.id });
        p.lock = { type: 'barrage', t: 0, dur: s.duration, targetId: best.id, hitsDone: 0, nextHit: 0 };
        best.stunUntil = Math.max(best.stunUntil, this.time + s.duration);
        p.stunUntil = Math.max(p.stunUntil, this.time + s.duration); // rooted while kicking
        break;
      }
      case 'byakugan': {
        p.skillCdUntil = this.time + s.cooldown;
        p.byakuganUntil = this.time + s.duration;
        p.fx.push('skill:byakugan');
        this.emit({ k: 'skill', id: p.id, skill: 'byakugan' });
        break;
      }
      case 'heal': {
        p.skillCdUntil = this.time + s.cooldown;
        p.fx.push('skill:heal');
        this.emit({ k: 'skill', id: p.id, skill: 'heal' });
        p.healPool += s.selfHeal; p.healUntil = this.time + s.duration;
        if (this.mode === 'squad') {
          for (const a of this.players.values()) {
            if (!a.alive || a.id === p.id || a.team !== p.team) continue;
            if (dist2D(p.x, p.z, a.x, a.z) > s.radius) continue;
            a.healPool += s.allyHeal; a.healUntil = this.time + s.duration;
            a.fx.push('healed');
          }
        }
        break;
      }
    }
  }

  updateLock(p) {
    const L = p.lock;
    L.t += TICK_DT;
    if (L.type === 'chidori') {
      const s = CHARACTERS.sasuke.skill;
      const step = (s.range / L.dur) * TICK_DT;
      p.x -= Math.sin(L.yaw) * step;
      p.z -= Math.cos(L.yaw) * step;
      p.yaw = L.yaw;
      this.collidePlayer(p);
      const g = this.groundHeightAt(p.x, p.z);
      if (p.y < g) { p.y = g; p.vy = 0; }
      for (const e of this.players.values()) {
        if (!e.alive || e.id === p.id || L.hit.has(e.id)) continue;
        if (this.mode === 'squad' && e.team === p.team) continue;
        if (dist2D(p.x, p.z, e.x, e.z) < s.width && Math.abs(e.y - p.y) < 3.5) {
          L.hit.add(e.id);
          this.damage(e, p, s.damage, 'skill:chidori');
          e.stunUntil = Math.max(e.stunUntil, this.time + s.stun);
        }
      }
      if (L.t >= L.dur) p.lock = null;
    } else if (L.type === 'barrage') {
      const s = CHARACTERS.lee.skill;
      const target = this.players.get(L.targetId);
      if (!target || !target.alive) { p.lock = null; return; }
      // stick to target, orbiting for the "flying kicks" feel
      const a = this.time * 9;
      p.x = target.x + Math.cos(a) * 1.6;
      p.z = target.z + Math.sin(a) * 1.6;
      p.y = target.y + 0.4;
      p.yaw = Math.atan2(-(target.x - p.x), -(target.z - p.z));
      target.stunUntil = Math.max(target.stunUntil, this.time + 0.3);
      const interval = s.duration / s.hits;
      if (this.time >= L.nextHit && L.hitsDone < s.hits) {
        L.nextHit = this.time + interval;
        L.hitsDone++;
        this.damage(target, p, s.damage, 'skill:barrage');
        target.fx.push('barrageHit');
        p.fx.push('barrageKick');
      }
      if (L.t >= L.dur || L.hitsDone >= s.hits) {
        p.lock = null;
        // launcher finale knocks them away slightly
        target.vy = Math.max(target.vy, 5);
        target.onGround = false;
      }
    }
  }

  // ------------------------------------------------------------------ zone
  updateZone() {
    const z = this.zone;
    if (z.phase >= ZONE_PHASES.length) return;
    const ph = ZONE_PHASES[z.phase];
    z.timer -= TICK_DT;
    if (!z.shrinking) {
      if (z.timer <= 0) {
        z.shrinking = true;
        z.timer = ph.shrink;
        // pick next circle inside current one
        const nr = Math.max(6, z.r * ph.factor);
        const maxOff = Math.max(0, (z.r - nr) * 0.6);
        const a = Math.random() * Math.PI * 2, off = Math.random() * maxOff;
        z.tx = clamp(z.x + Math.cos(a) * off, -this.half + nr, this.half - nr);
        z.tz = clamp(z.z + Math.sin(a) * off, -this.half + nr, this.half - nr);
        z.tr = nr;
        z.fromX = z.x; z.fromZ = z.z; z.fromR = z.r;
        this.emit({ k: 'announce', text: 'BARRIER SHRINKING!', sub: 'Get inside the circle!', tone: 'danger' });
      }
    } else {
      const t = 1 - Math.max(0, z.timer / ph.shrink);
      const e = t * t * (3 - 2 * t);
      z.x = z.fromX + (z.tx - z.fromX) * e;
      z.z = z.fromZ + (z.tz - z.fromZ) * e;
      z.r = z.fromR + (z.tr - z.fromR) * e;
      if (z.timer <= 0) {
        z.phase++;
        z.shrinking = false;
        if (z.phase < ZONE_PHASES.length) z.timer = ZONE_PHASES[z.phase].wait;
      }
    }
  }

  updatePickups() {
    for (const pk of this.pickups) {
      if (pk.taken) {
        pk.timer -= TICK_DT;
        if (pk.timer <= 0) pk.taken = false;
      }
    }
  }

  checkMatchEnd() {
    const alive = this.alivePlayers();
    if (this.mode === 'solo') {
      if (alive.length <= 1) this.endMatch(alive.length ? 'last-standing' : 'draw');
    } else {
      const teams = new Set(alive.map((p) => p.team));
      if (teams.size <= 1) this.endMatch('team-wipe');
    }
    if (this.state === 'playing' && this.time >= MATCH_TIME) this.endMatch('timeout');
  }

  // --------------------------------------------------------------- bot AI --
  freshBotBrain() {
    return {
      strafeDir: Math.random() < 0.5 ? -1 : 1,
      strafeAt: 0,
      jumpAt: rand(1, 4),
      skillAt: rand(4, 14),
      bombAt: rand(3, 9),
      wanderYaw: rand(0, Math.PI * 2),
      repathAt: 0,
      targetId: null,
    };
  }

  thinkBot(p) {
    const b = p.bot;
    if (this.time < p.stunUntil || p.lock) { p.input.mx = 0; p.input.mz = 0; return; }
    // nearest enemy
    let best = null, bestD = Infinity;
    for (const e of this.players.values()) {
      if (!e.alive || e.id === p.id) continue;
      if (this.mode === 'squad' && e.team === p.team) continue;
      const d = dist2D(p.x, p.z, e.x, e.z);
      if (d < bestD) { best = e; bestD = d; }
    }
    b.targetId = best ? best.id : null;

    // zone safety first
    const zd = dist2D(p.x, p.z, this.zone.x, this.zone.z);
    let moveYaw;
    if (zd > this.zone.r * 0.92) {
      moveYaw = Math.atan2(-(this.zone.x - p.x), -(this.zone.z - p.z));
      p.input.sprint = true;
    } else if (best && bestD < 46) {
      // combat: keep mid range, strafe
      if (this.time > b.strafeAt) { b.strafeAt = this.time + rand(0.8, 2.2); b.strafeDir *= -1; }
      const toEnemy = Math.atan2(-(best.x - p.x), -(best.z - p.z));
      const want = p.characterId === 'lee' ? 4 : 13; // lee rushes in
      const radial = bestD > want + 2 ? 0 : bestD < want - 3 ? Math.PI : (Math.PI / 2) * b.strafeDir;
      moveYaw = toEnemy + radial;
      p.input.sprint = bestD > 20;
      p.input.yaw = toEnemy + rand(-0.06, 0.06);
      p.input.pitch = clamp(Math.atan2((best.y + 1.2) - (p.y + 1.55), bestD), -0.6, 0.6);
    } else {
      // wander toward center / nearest ramen if hurt
      if (this.time > b.repathAt) {
        b.repathAt = this.time + rand(2, 5);
        let tx = this.zone.x + rand(-30, 30), tz = this.zone.z + rand(-30, 30);
        if (p.hp < 110) {
          let bp = null, bd = Infinity;
          for (const pk of this.pickups) {
            if (pk.taken) continue;
            const d = dist2D(p.x, p.z, pk.x, pk.z);
            if (d < bd) { bd = d; bp = pk; }
          }
          if (bp) { tx = bp.x; tz = bp.z; }
        }
        b.wanderYaw = Math.atan2(-(tx - p.x), -(tz - p.z));
      }
      moveYaw = b.wanderYaw;
      p.input.yaw = moveYaw;
      p.input.sprint = true;
    }

    // convert world-space desired dir into camera-relative input.
    // (The server movement matrix is its own inverse, so encode == decode.)
    const dx = -Math.sin(moveYaw), dz = -Math.cos(moveYaw);
    const sin = Math.sin(p.input.yaw), cos = Math.cos(p.input.yaw);
    p.input.mx = clamp(dx * cos - dz * sin, -1, 1);
    p.input.mz = clamp(-dx * sin - dz * cos, -1, 1);

    if (this.time > b.jumpAt) {
      b.jumpAt = this.time + rand(1.5, 5);
      if (best && bestD < 30 && Math.random() < 0.7) p.input.jump = true;
    }

    // attacks
    if (best && bestD < 40 && Math.abs(best.y - p.y) < 6) {
      const w = this.time > b.bombAt && bestD > 8 && bestD < 30 ? 'bomb'
        : bestD < 10 ? 'shuriken' : 'kunai';
      if (w === 'bomb') b.bombAt = this.time + rand(5, 11);
      if (Math.random() < (w === 'kunai' ? 0.75 : 0.6)) this.fire(p, p.input.yaw, p.input.pitch, w);
    }
    // skills
    if (best && this.time > b.skillAt) {
      const s = CHARACTERS[p.characterId].skill;
      const inRange =
        (s.id === 'rasengan' && bestD < 4.5) ||
        (s.id === 'chidori' && bestD > 4 && bestD < 15) ||
        (s.id === 'barrage' && bestD < 7) ||
        (s.id === 'byakugan' && bestD > 15) ||
        (s.id === 'heal' && p.hp < 130);
      if ((inRange && Math.random() < 0.8) || (s.id === 'byakugan' && Math.random() < 0.3)) {
        const aim = Math.atan2(-(best.x - p.x), -(best.z - p.z));
        this.useSkill(p, aim, 0);
        b.skillAt = this.time + rand(9, 18);
      }
    }
  }

  // -------------------------------------------------------------- net API --
  emit(ev) { this.events.push(ev); }

  snapshot() {
    const players = [];
    for (const p of this.players.values()) {
      players.push({
        id: p.id, name: p.name, ch: p.characterId, team: p.team, bot: p.isBot,
        x: +p.x.toFixed(2), y: +p.y.toFixed(2), z: +p.z.toFixed(2),
        yaw: +p.yaw.toFixed(3), hp: Math.ceil(p.hp), chK: Math.round(p.chakra),
        alive: p.alive, weapon: p.weapon, kills: p.kills,
        skillCd: Math.max(0, +(p.skillCdUntil - this.time).toFixed(1)),
        bya: this.time < p.byakuganUntil,
        stun: this.time < p.stunUntil,
        lock: p.lock ? p.lock.type : null,
        fx: p.fx.splice(0, p.fx.length),
      });
    }
    return {
      tick: this.tick,
      t: +this.time.toFixed(2),
      left: Math.max(0, Math.ceil(MATCH_TIME - this.time)),
      zone: {
        x: +this.zone.x.toFixed(1), z: +this.zone.z.toFixed(1), r: +this.zone.r.toFixed(1),
        shrinking: this.zone.shrinking, timer: Math.ceil(Math.max(0, this.zone.timer)),
        phase: this.zone.phase,
      },
      players,
      projs: this.projectiles.map((pr) => ({
        id: pr.id, k: pr.kind, x: +pr.x.toFixed(2), y: +pr.y.toFixed(2), z: +pr.z.toFixed(2),
        vx: +pr.vx.toFixed(1), vy: +pr.vy.toFixed(1), vz: +pr.vz.toFixed(1),
      })),
      pickups: this.pickups.map((pk) => (pk.taken ? 0 : 1)),
      events: this.events.splice(0, this.events.length),
    };
  }
}
