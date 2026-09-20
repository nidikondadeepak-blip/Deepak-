// ============================================================================
// SHINOBI ARENA — live game controller: renderer, camera, input, net-sync,
// interpolation, combat feedback. Server is authoritative; we predict nothing
// except input intent + optimistic weapon/sound feedback.
// v1.1 Free-Fire pass: ACES depth, soft aim-assist, auto-fire, aim zoom,
// sprint FOV kick, damped shoulder cam, extrapolation, hit direction,
// off-screen enemy arrows, victim scale-pop.
// ============================================================================
import * as THREE from '../vendor/three/three.module.js';
import { createNinjaMesh, animateNinja, updatePlate } from './characters.js';
import { buildWorld } from './world.js';
import { createProjectileMesh, updateProjectileMesh } from './weapons.js';
import { FXSystem } from './fx.js';
import { net } from './net.js';
import { sfx } from './audio.js';
import {
  updateHUD, drawMinimap, addFeed, announce, clearFeed, showHitmarker,
  damageFlash, spawnDamageNumber, weaponLabel, skillIcon,
} from './ui.js';

const INPUT_HZ = 20;
const _pv = new THREE.Vector3(); // scratch for projections

function aimStore() {
  try { return localStorage.getItem('shinobi:autofire'); }
  catch { return null; }
}

export class Game {
  constructor(canvas, { config, layout, room, settings, onMatchEnd, onQuit }) {
    this.canvas = canvas;
    this.config = config;
    this.layout = layout;
    this.room = room;
    this.settings = settings;
    this.onMatchEnd = onMatchEnd;
    this.onQuit = onQuit;
    this.meId = net.id;

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: settings.quality !== 'low' });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.shadowMap.enabled = settings.quality !== 'low';
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping; // filmic 3D depth
    this.renderer.toneMappingExposure = 1.12;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(62, 1, 0.1, 500);

    this.world = buildWorld(this.scene, layout, settings.quality);
    this.fx = new FXSystem(this.scene);

    this.players = new Map();  // id -> { ninja, rx, ry, rz, yaw, hp, alive, ... }
    this.projs = new Map();    // projId -> mesh
    this.snap = null;
    this.prevSnap = null;

    // camera orbit state (also our aim)
    this.yaw = 0; this.pitch = -0.08;
    this.camDist = 5.4;
    this._camPos = null;       // damped camera position
    this.zoomed = false;
    this.shake = 0;

    // input state
    this.keys = {};
    this.weapon = 'kunai';
    this.weaponIdx = 0;
    this.jumpQueued = false;
    this.firing = false;
    this.lastFireAt = 0;
    this.locked = false;
    this.fallbackLook = false; // mouse-follow aim when pointer-lock is blocked
    this.joy = { x: 0, y: 0, active: false };
    this.spectateId = null;
    this.started = false;
    this.dead = false;
    this.matchOver = false;

    // aim feel state
    const af = aimStore();
    this.autoFire = af == null ? this.isTouch() : af === '1';
    this.hotTime = 0;
    this.spreadKick = 0;
    this._hot = null;
    this._chEl = null;
    this._edgeBox = null;
    this._edgePool = null;

    this._boundLoop = this.loop.bind(this);
    this._last = performance.now();
    this._inputTimer = 0;
    this._snapHandler = (s) => this.onSnapshot(s);
    this._endHandler = (r) => this.onEnd(r);

    this.resize();
  }

  // ------------------------------------------------------------- lifecycle
  start() {
    net.on('snapshot', this._snapHandler);
    net.on('matchEnd', this._endHandler);
    window.addEventListener('resize', this._onResize);
    document.addEventListener('keydown', this._onKeyDown);
    document.addEventListener('keyup', this._onKeyUp);
    document.addEventListener('mousemove', this._onMouseMove);
    document.addEventListener('mousedown', this._onMouseDown);
    document.addEventListener('mouseup', this._onMouseUp);
    document.addEventListener('wheel', this._onWheel, { passive: true });
    document.addEventListener('pointerlockchange', this._onLockChange);
    document.addEventListener('pointerlockerror', this._onLockError);
    document.addEventListener('contextmenu', this._onCtx);
    this.canvas.addEventListener('click', this._onCanvasClick);
    this.bindTouch();
    this.bindHudButtons();
    clearFeed();
    document.getElementById('hud').classList.remove('hidden');
    // skill slot icon
    const me = this.config.characters[this.myChar()];
    if (me) {
      document.getElementById('skill-slot-icon').textContent = skillIcon(me.skill.id);
      document.getElementById('skill-slot-name').textContent = me.skill.name.split(' ')[0];
    }
    this._raf = requestAnimationFrame(this._boundLoop);
    // auto pointer-lock prompt
    announce('GET READY!', 'Click the battlefield to grab your kunai', 3000);
  }

  dispose() {
    cancelAnimationFrame(this._raf);
    clearInterval(this._inputTimer);
    net.off('snapshot', this._snapHandler);
    net.off('matchEnd', this._endHandler);
    if (this._touchCleanup) {
      for (const [el, ev, fn] of this._touchCleanup) el.removeEventListener(ev, fn);
      this._touchCleanup = [];
    }
    window.removeEventListener('resize', this._onResize);
    document.removeEventListener('keydown', this._onKeyDown);
    document.removeEventListener('keyup', this._onKeyUp);
    document.removeEventListener('mousemove', this._onMouseMove);
    document.removeEventListener('mousedown', this._onMouseDown);
    document.removeEventListener('mouseup', this._onMouseUp);
    document.removeEventListener('wheel', this._onWheel);
    document.removeEventListener('pointerlockchange', this._onLockChange);
    document.removeEventListener('pointerlockerror', this._onLockError);
    document.removeEventListener('contextmenu', this._onCtx);
    this.canvas.removeEventListener('click', this._onCanvasClick);
    if (document.pointerLockElement) document.exitPointerLock();
    document.getElementById('hud').classList.add('hidden');
    document.getElementById('touch-layer').classList.add('hidden');
    if (this._chEl) { this._chEl.classList.remove('hot'); this._chEl.style.display = ''; }
    if (this._edgeBox) this._edgeBox.innerHTML = '';
    this._edgePool = null;
    const v = document.getElementById('dmg-vignette');
    if (v) { v.style.background = ''; v.style.opacity = '0'; }
    this.world.dispose();
    this.fx.dispose();
    this.renderer.dispose();
  }

  myChar() {
    const rec = this.room.players.find((p) => p.id === this.meId);
    return rec ? rec.characterId : 'naruto';
  }

  // ---------------------------------------------------------------- events
  _onResize = () => this.resize();
  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  _onCtx = (e) => e.preventDefault();

  _onCanvasClick = () => {
    this.tryLock();
  };

  _onLockChange = () => {
    this.locked = document.pointerLockElement === this.canvas;
    if (this.locked) this.fallbackLook = false;
  };

  _onLockError = () => {
    if (!this.locked) this.enableFallbackLook();
  };

  // Request pointer-lock, gracefully degrading to mouse-follow aim
  // (embedded iframes / Safari often block pointer-lock).
  tryLock() {
    if (this.locked || this.fallbackLook || this.isTouch()) return;
    try {
      const r = this.canvas.requestPointerLock?.();
      if (r && r.catch) r.catch(() => this.enableFallbackLook());
    } catch {
      this.enableFallbackLook();
    }
  }

  enableFallbackLook() {
    if (this.fallbackLook || this.locked) return;
    this.fallbackLook = true;
    announce('MOUSE-FOLLOW AIM', 'pointer-lock blocked — just move your mouse to aim', 3200);
  }

  _onKeyDown = (e) => {
    if (e.code === 'Space') e.preventDefault();
    if (e.repeat) return;
    this.keys[e.code] = true;
    if (e.code === 'Space') this.jumpQueued = true;
    if (e.code === 'Digit1') this.setWeapon(0);
    if (e.code === 'Digit2') this.setWeapon(1);
    if (e.code === 'Digit3') this.setWeapon(2);
    if (e.code === 'KeyQ') this.castSkill();
    if (e.code === 'KeyN') this.nextSpectate();
  };
  _onKeyUp = (e) => { this.keys[e.code] = false; };

  _onMouseMove = (e) => {
    if (!this.locked && !this.fallbackLook) return;
    if (this.fallbackLook && !this.locked) {
      // don't steer while paused or off-screen
      if (!document.getElementById('screen-game').classList.contains('active')) return;
      if (!document.getElementById('pause-menu').classList.contains('hidden')) return;
    }
    // movementX works unlocked in Chrome/FF; Safari fallback via clientX delta
    const mx = e.movementX ?? (e.clientX - (this._lastCX ?? e.clientX));
    const my = e.movementY ?? (e.clientY - (this._lastCY ?? e.clientY));
    this._lastCX = e.clientX; this._lastCY = e.clientY;
    const s = 0.0026 * (this.settings.sens || 1) * (this.zoomed ? 0.55 : 1);
    this.yaw -= mx * s;
    this.pitch -= my * s * (this.settings.invertY ? -1 : 1);
    this.pitch = Math.max(-1.1, Math.min(1.1, this.pitch));
  };

  _onMouseDown = (e) => {
    if (!document.getElementById('screen-game').classList.contains('active')) return;
    if (e.target !== this.canvas) return; // ignore clicks on HUD buttons
    if (e.button === 2) { this.zoomed = true; return; } // RMB aim zoom
    if (e.button === 0) {
      if (!this.locked && !this.fallbackLook && !this.isTouch()) { this.tryLock(); return; }
      this.firing = true;
      this.tryFire();
    }
  };
  _onMouseUp = (e) => {
    if (e.button === 0) this.firing = false;
    if (e.button === 2) this.zoomed = false;
  };

  _onWheel = (e) => {
    if (!document.getElementById('screen-game').classList.contains('active')) return;
    const d = e.deltaY > 0 ? 1 : -1;
    this.setWeapon((this.weaponIdx + d + 3) % 3);
  };

  isTouch() { return 'ontouchstart' in window && navigator.maxTouchPoints > 0; }
  joySprint() { return this.joy.active && Math.hypot(this.joy.x, this.joy.y) > 0.92; }
  moveHeld() {
    return !!(this.keys.KeyW || this.keys.KeyA || this.keys.KeyS || this.keys.KeyD ||
      this.keys.ArrowUp || this.keys.ArrowDown || this.keys.ArrowLeft || this.keys.ArrowRight ||
      this.joy.active);
  }
  sprintHeld() {
    return !!(this.keys.ShiftLeft || this.keys.ShiftRight) || this.joySprint();
  }

  // tracked listener (removed on dispose so re-queued matches don't stack)
  _tOn(el, ev, fn, opts) {
    (this._touchCleanup ||= []).push([el, ev, fn]);
    el.addEventListener(ev, fn, opts);
  }

  bindTouch() {
    if (!this.isTouch()) return;
    document.getElementById('touch-layer').classList.remove('hidden');
    const joyZone = document.getElementById('joy-zone');
    const knob = document.getElementById('joy-knob');
    let joyId = null;
    const setKnob = (dx, dy) => { knob.style.left = `${35 + dx}px`; knob.style.top = `${35 + dy}px`; };
    this._tOn(joyZone, 'touchstart', (e) => {
      const t = e.changedTouches[0];
      joyId = t.identifier;
      this.joy.active = true;
      e.preventDefault();
    }, { passive: false });
    this._tOn(window, 'touchmove', (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === joyId) {
          const r = joyZone.getBoundingClientRect();
          let dx = t.clientX - (r.left + r.width / 2);
          let dy = t.clientY - (r.top + r.height / 2);
          const m = Math.hypot(dx, dy) || 1;
          const cl = Math.min(m, 45);
          dx = (dx / m) * cl; dy = (dy / m) * cl;
          setKnob(dx, dy);
          this.joy.x = dx / 45; this.joy.y = dy / 45;
        }
      }
    }, { passive: true });
    this._tOn(window, 'touchend', (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === joyId) {
          joyId = null;
          this.joy = { x: 0, y: 0, active: false };
          setKnob(0, 0);
        }
      }
    });
    // right-half drag = look
    let lookId = null, lx = 0, ly = 0;
    this._tOn(this.canvas, 'touchstart', (e) => {
      for (const t of e.changedTouches) {
        if (t.clientX > window.innerWidth * 0.4 && lookId === null) {
          lookId = t.identifier; lx = t.clientX; ly = t.clientY;
        }
      }
    }, { passive: true });
    this._tOn(window, 'touchmove', (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === lookId) {
          const s = 0.006 * (this.settings.sens || 1);
          this.yaw -= (t.clientX - lx) * s;
          this.pitch -= (t.clientY - ly) * s * (this.settings.invertY ? -1 : 1);
          this.pitch = Math.max(-1.1, Math.min(1.1, this.pitch));
          lx = t.clientX; ly = t.clientY;
        }
      }
    }, { passive: true });
    this._tOn(window, 'touchend', (e) => {
      for (const t of e.changedTouches) if (t.identifier === lookId) lookId = null;
    });
    const hold = (id, down, up) => {
      const el = document.getElementById(id);
      this._tOn(el, 'touchstart', (e) => { e.preventDefault(); down(); }, { passive: false });
      this._tOn(el, 'touchend', (e) => { e.preventDefault(); up && up(); }, { passive: false });
    };
    hold('touch-fire', () => { this.firing = true; this.tryFire(); }, () => { this.firing = false; });
    hold('touch-jump', () => { this.jumpQueued = true; });
    hold('touch-skill', () => this.castSkill());
    hold('touch-weapon', () => this.setWeapon((this.weaponIdx + 1) % 3));
    document.getElementById('touch-skill').textContent =
      skillIcon(this.config.characters[this.myChar()]?.skill.id);
  }

  bindHudButtons() {
    document.querySelectorAll('.wslot').forEach((el) => {
      el.onclick = () => {
        const i = this.config.weaponOrder.indexOf(el.dataset.w);
        if (i >= 0) this.setWeapon(i);
      };
    });
    document.getElementById('skill-slot').onclick = () => this.castSkill();
    document.getElementById('btn-spectate-next').onclick = () => this.nextSpectate();
    const af = document.getElementById('autofire-btn');
    af.classList.toggle('on', this.autoFire);
    af.onclick = () => {
      this.autoFire = !this.autoFire;
      af.classList.toggle('on', this.autoFire);
      try { localStorage.setItem('shinobi:autofire', this.autoFire ? '1' : '0'); } catch { /* noop */ }
      sfx.click();
    };
  }

  setWeapon(i) {
    this.weaponIdx = i;
    this.weapon = this.config.weaponOrder[i];
    sfx.click();
    const rec = this.players.get(this.meId);
    if (rec) rec.ninja.setWeapon(this.weapon);
  }

  castSkill() {
    if (!this.snap || this.dead || this.matchOver) return;
    net.emit('useSkill', { yaw: this.yaw, pitch: this.pitch });
  }

  tryFire() {
    if (!this.snap || this.dead || this.matchOver) return;
    const w = this.config.weapons[this.weapon];
    const now = performance.now() / 1000;
    if (now - this.lastFireAt < w.cooldown) return;
    this.lastFireAt = now;
    // soft aim-assist: bend the throw toward the closest enemy near the crosshair
    let yaw = this.yaw, pitch = this.pitch;
    const tgt = this.findAimTarget(0.085, 55);
    if (tgt) {
      let dy = tgt.yaw - yaw;
      while (dy > Math.PI) dy -= Math.PI * 2;
      while (dy < -Math.PI) dy += Math.PI * 2;
      yaw += dy * 0.55;
      pitch = Math.max(-1.1, Math.min(1.1, pitch + (tgt.pitch - pitch) * 0.55));
    }
    this.spreadKick = 1; // crosshair bloom
    net.emit('fire', { yaw, pitch, weapon: this.weapon });
    // optimistic feedback
    const rec = this.players.get(this.meId);
    if (rec) {
      rec.ninja.throwT = 0.3;
      const hp = new THREE.Vector3();
      rec.ninja.parts.armR.getWorldPosition(hp);
      this.fx.throwPuff(hp);
    }
    if (this.weapon === 'shuriken') sfx.throwShuriken();
    else if (this.weapon === 'bomb') { sfx.throwKunai(); sfx.fuse(); }
    else sfx.throwKunai();
    if (this.weapon === 'bomb') this.addShake(0.25);
  }

  // ---------------------------------------------------------- aim helpers
  aimForward() {
    const cp = Math.cos(this.pitch);
    return new THREE.Vector3(-Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp);
  }

  losClear(ax, ay, az, bx, by, bz) {
    for (let i = 1; i < 14; i++) {
      const t = i / 14;
      if (this.pointInSolid(ax + (bx - ax) * t, ay + (by - ay) * t, az + (bz - az) * t)) return false;
    }
    return true;
  }

  // nearest visible enemy inside the aim cone (crosshair hotspot / assist)
  findAimTarget(maxAngle = 0.06, maxDist = 55) {
    if (!this.snap || this.dead || this.matchOver) return null;
    const me = this.snap.players.find((p) => p.id === this.meId);
    const meRec = this.players.get(this.meId);
    if (!me || !me.alive || !meRec) return null;
    const fwd = this.aimForward();
    const ex = meRec.rx, ey = meRec.ry + 1.55, ez = meRec.rz;
    const cosMax = Math.cos(maxAngle);
    let best = null;
    for (const p of this.snap.players) {
      if (p.id === this.meId || !p.alive) continue;
      if (this.room.mode === 'squad' && p.team === me.team) continue;
      const rec = this.players.get(p.id);
      if (!rec) continue;
      const dx = rec.rx - ex, dy = (rec.ry + 1.2) - ey, dz = rec.rz - ez;
      const dist = Math.hypot(dx, dy, dz);
      if (dist > maxDist || dist < 0.5) continue;
      const dot = (dx * fwd.x + dy * fwd.y + dz * fwd.z) / dist;
      if (dot < cosMax) continue;
      if (!this.losClear(ex, ey, ez, rec.rx, rec.ry + 1.2, rec.rz)) continue;
      const angle = Math.acos(Math.min(1, dot));
      if (!best || angle < best.angle) {
        best = {
          rec, p, angle, dist,
          yaw: Math.atan2(-dx, -dz),
          pitch: Math.asin(Math.max(-1, Math.min(1, dy / dist))),
        };
      }
    }
    return best;
  }

  updateCrosshair(dt) {
    const ch = this._chEl || (this._chEl = document.getElementById('crosshair'));
    ch.style.display = (this.dead || this.matchOver) ? 'none' : '';
    if (this.dead || this.matchOver) return;
    this.spreadKick = Math.max(0, this.spreadKick - dt * 4);
    let moveBloom = 0;
    if (this.moveHeld()) moveBloom = this.sprintHeld() ? 6 : 3;
    const gap = (this.zoomed ? 4 : 7) + moveBloom + this.spreadKick * 9;
    ch.style.setProperty('--gap', gap.toFixed(1) + 'px');
    ch.classList.toggle('hot', !!this._hot);
  }

  updateEdgeArrows() {
    const box = this._edgeBox || (this._edgeBox = document.getElementById('edge-arrows'));
    if (!this._edgePool) {
      this._edgePool = [];
      for (let i = 0; i < 5; i++) {
        const d = document.createElement('div');
        d.className = 'edge-arrow';
        d.style.display = 'none';
        box.appendChild(d);
        this._edgePool.push(d);
      }
    }
    let shown = 0;
    const W = window.innerWidth, H = window.innerHeight;
    if (!this.matchOver && this.snap) {
      const me = this.snap.players.find((p) => p.id === this.meId);
      for (const p of this.snap.players) {
        if (shown >= 5) break;
        if (p.id === this.meId || !p.alive) continue;
        if (me && this.room.mode === 'squad' && p.team === me.team) continue;
        const rec = this.players.get(p.id);
        if (!rec) continue;
        if (me && me.alive && Math.hypot(p.x - me.x, p.z - me.z) > 48) continue;
        _pv.set(rec.rx, rec.ry + 1.2, rec.rz).project(this.camera);
        const behind = _pv.z > 1;
        let nx = _pv.x, ny = _pv.y;
        if (behind) { nx = -nx; ny = -ny; }
        if (!behind && Math.abs(nx) < 0.95 && Math.abs(ny) < 0.9) continue; // on-screen
        const ang = Math.atan2(ny, nx);
        const el = this._edgePool[shown++];
        el.style.display = '';
        el.style.left = `${W / 2 + Math.cos(ang) * W * 0.42}px`;
        el.style.top = `${H / 2 - Math.sin(ang) * H * 0.42}px`;
        el.style.transform = `rotate(${(90 - (ang * 180) / Math.PI).toFixed(1)}deg)`;
      }
    }
    for (let i = shown; i < 5; i++) this._edgePool[i].style.display = 'none';
  }

  showHitDirection(fx, fz) {
    const meRec = this.players.get(this.meId);
    if (!meRec) return;
    const phi = Math.atan2(-(fx - meRec.rx), -(fz - meRec.rz));
    let rel = phi - this.yaw;
    while (rel > Math.PI) rel -= Math.PI * 2;
    while (rel < -Math.PI) rel += Math.PI * 2;
    const deg = (-rel * 180) / Math.PI;
    const v = document.getElementById('dmg-vignette');
    v.style.background =
      `conic-gradient(from ${deg - 35}deg, rgba(255,30,30,.55) 0deg, rgba(255,30,30,.55) 70deg, transparent 70deg)`;
    clearTimeout(this._hitdirT);
    this._hitdirT = setTimeout(() => { v.style.background = ''; }, 450);
  }

  // ----------------------------------------------------------------- net --
  onSnapshot(snap) {
    this.prevSnap = this.snap;
    this.snap = snap;
    if (!this.started) {
      this.started = true;
      // spawn protection shimmer + face center
      const me = snap.players.find((p) => p.id === this.meId);
      if (me) this.yaw = me.yaw;
      announce('BATTLE START!', 'Last ninja standing wins!', 2600);
      sfx.go();
      // start input pump
      this._inputTimer = setInterval(() => this.sendInput(), 1000 / INPUT_HZ);
    }
    this.world.setZone(snap.zone.x, snap.zone.z, snap.zone.r);
    snap.pickups.forEach((on, i) => this.world.setRamen(i, on));

    // players: create/update
    const seen = new Set();
    for (const p of snap.players) {
      seen.add(p.id);
      let rec = this.players.get(p.id);
      if (!rec) {
        const c = this.config.characters[p.ch];
        const ninja = createNinjaMesh(p.ch, c.colors);
        ninja.setWeapon(p.weapon);
        this.scene.add(ninja.root);
        // byakugan target marker (diamond above enemies)
        const marker = new THREE.Mesh(new THREE.OctahedronGeometry(0.3),
          new THREE.MeshBasicMaterial({ color: 0xff2e88, depthTest: false, transparent: true, opacity: 0.95 }));
        marker.position.y = 2.7;
        marker.renderOrder = 999;
        marker.visible = false;
        ninja.root.add(marker);
        rec = { ninja, marker, rx: p.x, ry: p.y, rz: p.z, yaw: p.yaw, hp: p.hp, alive: true, firstSeen: true, dead: false, pop: 0, evx: 0, evy: 0, evz: 0 };
        this.players.set(p.id, rec);
        this.fx.spawnShield(ninja, 2);
        if (p.id === this.meId) this.yaw = p.yaw;
      }
      if (rec.firstSeen) { rec.rx = p.x; rec.ry = p.y; rec.rz = p.z; rec.yaw = p.yaw; rec.firstSeen = false; }
      // per-snapshot velocity for 45ms extrapolation (smoother than raw lerp)
      if (rec.target) {
        rec.evx = (p.x - rec.target.x) * 20;
        rec.evy = (p.y - rec.target.y) * 20;
        rec.evz = (p.z - rec.target.z) * 20;
      }
      rec.target = p;
      rec.hp = p.hp;
      if (p.id !== this.meId) rec.ninja.setWeapon(p.weapon);
      if (!p.alive && rec.alive) {
        rec.alive = false; rec.dead = true;
        const dp = new THREE.Vector3(p.x, p.y + 1, p.z);
        this.fx.deathPoof(dp);
        if (p.id === this.meId) this.onMyDeath();
      }
      // one-shot fx flags
      for (const f of p.fx || []) this.handleFxFlag(p, rec, f);
    }
    // remove leavers
    for (const [id, rec] of this.players) {
      if (!seen.has(id)) {
        this.scene.remove(rec.ninja.root);
        this.players.delete(id);
      }
    }

    // projectiles
    const pseen = new Set();
    for (const pr of snap.projs) {
      pseen.add(pr.id);
      let m = this.projs.get(pr.id);
      if (!m) {
        m = createProjectileMesh(pr.k);
        m.position.set(pr.x, pr.y, pr.z);
        this.scene.add(m);
        this.projs.set(pr.id, m);
      }
      m.position.set(pr.x, pr.y, pr.z);
      m.userData.vx = pr.vx; m.userData.vy = pr.vy || 0; m.userData.vz = pr.vz;
    }
    for (const [id, m] of this.projs) {
      if (!pseen.has(id)) { this.scene.remove(m); this.projs.delete(id); }
    }

    // events
    for (const ev of snap.events || []) this.handleEvent(ev);

    // HUD + plates + minimap
    const me = snap.players.find((p) => p.id === this.meId);
    if (me) {
      updateHUD({ ...me, weapon: this.dead ? me.weapon : this.weapon }, snap);
      // plates
      for (const p of snap.players) {
        const rec = this.players.get(p.id);
        if (!rec) continue;
        const isMe = p.id === this.meId;
        rec.ninja.plate.visible = !isMe && p.alive;
        const ally = this.room.mode === 'squad' && p.team === me.team;
        const isEnemy = !isMe && !ally;
        rec.marker.visible = !!(me.bya && isEnemy && p.alive);
        updatePlate(rec.ninja, p.name, p.hp, 200, { me: isMe, ally, xray: !!(me.bya && isEnemy) });
      }
      drawMinimap(document.getElementById('minimap'), this.layout, snap, this.meId, this.room.mode);
    }
  }

  handleFxFlag(p, rec, f) {
    const np = new THREE.Vector3(p.x, p.y + 1.2, p.z);
    const isMe = p.id === this.meId;
    const near = this.distToMe(p) < 45;
    switch (f) {
      case 'throw': case 'throwBomb':
        if (!isMe) {
          rec.ninja.throwT = 0.3;
          if (near) (f === 'throw' ? sfx.throwKunai : sfx.fuse)();
        }
        break;
      case 'jump': if (near) sfx.jump(); break;
      case 'djump': if (near) sfx.djump(); this.fx.landPuff(np); break;
      case 'land': this.fx.landPuff(new THREE.Vector3(p.x, p.y + 0.1, p.z)); break;
      case 'hitmark':
        if (isMe) { showHitmarker(); sfx.hit(); }
        break;
      case 'killConfirm': {
        if (isMe) {
          sfx.kill();
          const kc = document.getElementById('kill-confirm');
          kc.classList.remove('hidden');
          clearTimeout(kc._t);
          kc._t = setTimeout(() => kc.classList.add('hidden'), 1800);
        }
        break;
      }
      case 'noChakra': if (isMe) announce('NO CHAKRA!', 'wait for it to refill…', 900); break;
      case 'noTarget': if (isMe) announce('NO TARGET!', 'get closer to an enemy', 900); break;
      case 'ramen':
        if (isMe) { sfx.ramen(); spawnDamageNumber(this.camera, np, '+60 🍜', 'heal'); }
        this.fx.burst(np, { count: 12, color: [0.3, 1, 0.4], speed: 4, life: 0.7 });
        break;
      case 'healed': {
        const rp = rec.ninja.root.position.clone(); rp.y += 1.2;
        this.fx.burst(rp, { count: 14, color: [0.3, 1, 0.4], speed: 3, life: 0.9, grav: -2 });
        break;
      }
      case 'barrageHit': this.fx.barrageKick(np); sfx.hit(); break;
      case 'barrageKick': rec.ninja.spinT = 0.35; break;
      case 'skill:rasengan':
        rec.ninja.throwT = 0.5;
        this.fx.rasengan(rec.ninja.parts.armR);
        sfx.rasengan();
        if (isMe) { this.addShake(0.5); announce('RASENGAN!', '', 900); }
        break;
      case 'skill:chidori':
        this.fx.chidori(rec.ninja, 0.55);
        sfx.chidori();
        if (isMe) { this.addShake(0.4); announce('CHIDORI!', '', 900); }
        break;
      case 'skill:barrage':
        rec.ninja.spinT = 1.6;
        sfx.barrage();
        if (isMe) announce('TAIJUTSU BARRAGE!', '', 1200);
        break;
      case 'skill:byakugan':
        this.fx.byakugan(rec.ninja);
        sfx.byakugan();
        if (isMe) announce('BYAKUGAN!', 'enemies revealed through walls', 2000);
        break;
      case 'skill:heal':
        rec.ninja.throwT = 0.5;
        this.fx.heal(rec.ninja, 3);
        sfx.heal();
        if (isMe) announce('MEDICAL NINJUTSU!', 'healing…', 1200);
        break;
    }
  }

  handleEvent(ev) {
    const isMe = (id) => id === this.meId;
    switch (ev.k) {
      case 'kill': {
        const w = weaponLabel(ev.weapon);
        if (ev.killer) {
          addFeed(`<b>${this.esc(ev.kName)}</b> ⚔ <b>${this.esc(ev.vName)}</b> <span style="opacity:.7">${w}</span>`, isMe(ev.killer));
          if (isMe(ev.killer)) {
            document.getElementById('kill-confirm-name').textContent = `— ${ev.vName}`;
          }
        } else {
          addFeed(`<b>${this.esc(ev.vName)}</b> fell to ${w}`, false);
        }
        if (isMe(ev.victim)) { sfx.death(); }
        break;
      }
      case 'dmg': {
        const rec = this.players.get(ev.id);
        if (!rec) break;
        rec.pop = 1; // scale-pop feedback on whoever got hit
        const wp = rec.ninja.root.position.clone();
        if (isMe(ev.id)) {
          damageFlash(ev.amt / 40);
          sfx.hurt();
          this.addShake(Math.min(0.6, ev.amt / 60));
          if (ev.fx != null && ev.fz != null) this.showHitDirection(ev.fx, ev.fz);
        } else if (this.distToMe({ x: wp.x, z: wp.z }) < 55) {
          spawnDamageNumber(this.camera, wp, `-${ev.amt}`, ev.amt >= 40 ? 'crit' : '');
        }
        this.fx.bloodPuff(wp.clone().add(new THREE.Vector3(0, 1.2, 0)));
        break;
      }
      case 'boom': {
        const bp = new THREE.Vector3(ev.x, ev.y, ev.z);
        this.fx.explosion(bp, ev.r);
        sfx.explosion();
        const d = this.distToMe({ x: ev.x, z: ev.z });
        if (d < 20) this.addShake(0.7 * (1 - d / 20) + 0.2);
        break;
      }
      case 'skill':
        // fx flags on the player carry the visuals; nothing extra needed
        break;
      case 'announce':
        announce(ev.text, ev.sub || '', 2600);
        if (ev.tone === 'danger') sfx.zoneWarn();
        else sfx.go();
        break;
      case 'pickup': break; // handled via fx flag
      case 'death': break;  // handled via alive transition
    }
  }

  esc(s) { return String(s).replace(/[&<>"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m])); }

  distToMe(p) {
    const me = this.players.get(this.meId);
    if (!me) return 999;
    return Math.hypot(me.rx - p.x, me.rz - p.z);
  }

  onMyDeath() {
    this.dead = true;
    this.firing = false;
    this.zoomed = false;
    sfx.death();
    announce('ELIMINATED!', 'spectating… (N = next ninja)', 2500);
    // pick first alive to spectate
    const alive = this.snap.players.find((p) => p.alive);
    this.spectateId = alive ? alive.id : null;
    document.getElementById('spectate-bar').classList.remove('hidden');
    this.updateSpectateLabel();
  }

  nextSpectate() {
    if (!this.dead || !this.snap) return;
    const alive = this.snap.players.filter((p) => p.alive);
    if (!alive.length) return;
    const i = alive.findIndex((p) => p.id === this.spectateId);
    this.spectateId = alive[(i + 1) % alive.length].id;
    this.updateSpectateLabel();
  }
  updateSpectateLabel() {
    const t = this.snap && this.snap.players.find((p) => p.id === this.spectateId);
    document.getElementById('spectate-name').textContent = t ? t.name : '…';
  }

  onEnd(result) {
    if (this.matchOver) return;
    this.matchOver = true;
    this.firing = false;
    this.zoomed = false;
    clearInterval(this._inputTimer);
    if (document.pointerLockElement) document.exitPointerLock();
    const won = result.winner && result.winner.id === this.meId;
    if (won) sfx.victory(); else sfx.defeat();
    setTimeout(() => this.onMatchEnd(result), 1200);
  }

  sendInput() {
    if (!this.snap || this.dead || this.matchOver) return;
    let mx = 0, mz = 0;
    if (this.keys.KeyW || this.keys.ArrowUp) mz += 1;
    if (this.keys.KeyS || this.keys.ArrowDown) mz -= 1;
    if (this.keys.KeyD || this.keys.ArrowRight) mx += 1;
    if (this.keys.KeyA || this.keys.ArrowLeft) mx -= 1;
    if (this.joy.active) { mx = this.joy.x; mz = -this.joy.y; }
    net.emit('input', {
      mx, mz, yaw: this.yaw, pitch: this.pitch,
      sprint: this.sprintHeld(),
      jump: this.jumpQueued,
    });
    this.jumpQueued = false;
    // hold-to-throw
    if (this.firing) this.tryFire();
  }

  addShake(m) {
    if (this.settings.shake === false) return;
    this.shake = Math.min(1.2, this.shake + m);
  }

  // --------------------------------------------------------------- camera
  pointInSolid(x, y, z) {
    for (const c of this.layout.colliders) {
      if (!c.solid) continue;
      if (y < c.y0 || y > c.y1) continue;
      if (Math.abs(x - c.x) <= c.w / 2 && Math.abs(z - c.z) <= c.d / 2) return true;
    }
    return false;
  }

  updateCamera(dt, time) {
    const focusId = this.dead ? this.spectateId : this.meId;
    const rec = this.players.get(focusId);
    if (!rec) return;
    const px = rec.rx, py = rec.ry, pz = rec.rz;

    if (this.dead && rec) {
      // slow orbit around spectated ninja
      const a = time * 0.4;
      const cx = px + Math.cos(a) * 8, cz = pz + Math.sin(a) * 8;
      this.camera.position.set(cx, py + 4, cz);
      this.camera.lookAt(px, py + 1.2, pz);
      if (this._camPos) this._camPos.set(cx, py + 4, cz);
      return;
    }
    // zoom distance + FOV (sprint kick, aim zoom)
    const wantDist = this.zoomed ? 3.4 : 5.4;
    this.camDist += (wantDist - this.camDist) * (1 - Math.exp(-dt * 10));
    const sprinting = !this.dead && this.sprintHeld() && this.moveHeld();
    const wantFov = this.zoomed ? 42 : sprinting ? 68 : 62;
    if (Math.abs(this.camera.fov - wantFov) > 0.05) {
      this.camera.fov += (wantFov - this.camera.fov) * (1 - Math.exp(-dt * 8));
      this.camera.updateProjectionMatrix();
    }

    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    const fx = -Math.sin(this.yaw) * cp, fz = -Math.cos(this.yaw) * cp;
    const headY = py + 1.7;
    let dist = this.camDist;
    // pull camera in if a wall is in the way
    for (let d = dist; d > 1.2; d -= 0.6) {
      const cx = px - fx * d, cy = headY - sp * d + 0.4, cz = pz - fz * d;
      if (!this.pointInSolid(cx, cy, cz)) { dist = d; break; }
      dist = d - 0.6;
    }
    dist = Math.max(1.1, dist);
    let cx = px - fx * dist, cy = headY - sp * dist + 0.35, cz = pz - fz * dist;
    cy = Math.max(0.4, cy);
    // shoulder offset to the right
    const rx = -fz, rz = fx;
    cx += rx * 0.65; cz += rz * 0.65;
    // critically-damped follow (melts wall pop-in, keeps aim 1:1)
    if (!this._camPos) this._camPos = new THREE.Vector3(cx, cy, cz);
    const ck = 1 - Math.exp(-dt * 22);
    this._camPos.x += (cx - this._camPos.x) * ck;
    this._camPos.y += (cy - this._camPos.y) * ck;
    this._camPos.z += (cz - this._camPos.z) * ck;
    // shake
    this.shake = Math.max(0, this.shake - dt * 3.2);
    const sh = this.shake * this.shake * 0.5;
    this.camera.position.set(
      this._camPos.x + (Math.random() - 0.5) * sh,
      this._camPos.y + (Math.random() - 0.5) * sh,
      this._camPos.z + (Math.random() - 0.5) * sh
    );
    // look at aim point ahead
    const ax = px + fx * 12 + rx * 0.65, ay = headY + sp * 12, az = pz + fz * 12 + rz * 0.65;
    this.camera.lookAt(ax, ay, az);
  }

  // ----------------------------------------------------------------- loop
  loop(now) {
    this._raf = requestAnimationFrame(this._boundLoop);
    const dt = Math.min(0.05, (now - this._last) / 1000);
    this._last = now;
    const time = now / 1000;

    // crosshair hotspot (once per frame, shared by crosshair + auto-fire)
    this._hot = this.findAimTarget(0.06, 55);
    this.updateCrosshair(dt);
    this.updateEdgeArrows();

    // auto-fire: holding the crosshair on a visible enemy throws automatically
    if (this.autoFire && this._hot && !this.dead && !this.matchOver && this.snap) {
      this.hotTime += dt;
      if (this.hotTime > 0.14) this.tryFire();
    } else {
      this.hotTime = 0;
    }

    // interpolate players toward latest snapshot (+45ms extrapolation)
    const k = 1 - Math.exp(-dt * 18);
    const ky = 1 - Math.exp(-dt * 18);
    for (const [, rec] of this.players) {
      const t = rec.target;
      if (!t) continue;
      // snap on teleport-ish jumps (spawn / dashes)
      const dJump = Math.hypot(t.x - rec.rx, t.z - rec.rz);
      if (dJump > 12) {
        rec.rx = t.x; rec.ry = t.y; rec.rz = t.z;
        rec.evx = rec.evy = rec.evz = 0;
      } else {
        const tx = t.x + THREE.MathUtils.clamp(rec.evx * 0.045, -1.5, 1.5);
        const ty = t.y + THREE.MathUtils.clamp(rec.evy * 0.045, -1.5, 1.5);
        const tz = t.z + THREE.MathUtils.clamp(rec.evz * 0.045, -1.5, 1.5);
        rec.rx += (tx - rec.rx) * k;
        rec.ry += (ty - rec.ry) * Math.min(1, k * 1.4);
        rec.rz += (tz - rec.rz) * k;
      }
      let dy = t.yaw - rec.yaw;
      while (dy > Math.PI) dy -= Math.PI * 2;
      while (dy < -Math.PI) dy += Math.PI * 2;
      rec.yaw += dy * ky;
      rec.ninja.root.position.set(rec.rx, rec.ry, rec.rz);
      // aim body slightly toward own look yaw for remote, movement for feel
      rec.ninja.root.rotation.y = rec.yaw + Math.PI;
      // hit scale-pop
      if (rec.pop > 0) rec.pop = Math.max(0, rec.pop - dt * 7);
      rec.ninja.root.scale.setScalar(1 + rec.pop * 0.14);
      const speed = Math.min(10, dJump * 20);
      animateNinja(rec.ninja, {
        moveSpeed: t.alive ? (t.lock ? 9 : speed) : 0,
        airborne: !t.alive ? false : undefined,
        dead: !t.alive,
        groundY: t.y,
        lock: t.lock,
        pitch: 0,
      }, dt, time + rec.rx);
      if (rec.marker.visible) {
        rec.marker.rotation.y += dt * 4;
        rec.marker.position.y = 2.7 + Math.sin(time * 5) * 0.15;
      }
    }

    // projectiles spin
    for (const [, m] of this.projs) updateProjectileMesh(m, dt, time);

    this.updateCamera(dt, time);
    this.world.update(dt, time);
    this.fx.update(dt, time);
    this.renderer.render(this.scene, this.camera);
  }
}
