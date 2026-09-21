// ============================================================================
// SHINOBI ARENA — HD ninja factory + procedural animation.
// v1.2 realistic pass: PBR skin/cloth/metal, detailed eyes, outfit trim,
// leaf-symbol plates, wrapped handles. No cartoon outlines.
// One rig, per-hero hair/face/outfit. Used by the game + char-select preview.
// ============================================================================
import * as THREE from '../vendor/three/three.module.js';

// legacy export (kept for compatibility) — PBR needs no gradient map
let gradientMap = null;
export function getGradientMap() {
  if (gradientMap) return gradientMap;
  const data = new Uint8Array([120, 180, 230, 255]);
  const tex = new THREE.DataTexture(data, data.length, 1, THREE.RedFormat);
  tex.needsUpdate = true;
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  gradientMap = tex;
  return gradientMap;
}

const matCache = new Map();
export function toon(color, opts = {}) {
  const key = color + '|' + (opts.rough ?? '') + '|' + (opts.metal ?? '');
  if (!matCache.has(key)) {
    matCache.set(key, new THREE.MeshStandardMaterial({
      color,
      roughness: opts.rough ?? 0.82,
      metalness: opts.metal ?? 0.04,
      envMapIntensity: 0.5,
    }));
  }
  return matCache.get(key);
}

const metalCache = new Map();
export function metal(color, rough = 0.3) {
  const key = color + '|' + rough;
  if (!metalCache.has(key)) {
    metalCache.set(key, new THREE.MeshStandardMaterial({
      color, metalness: 0.9, roughness: rough, envMapIntensity: 1.15,
    }));
  }
  return metalCache.get(key);
}

const skinCache = new Map();
export function skin(color) {
  if (!skinCache.has(color)) {
    skinCache.set(color, new THREE.MeshStandardMaterial({
      color, roughness: 0.55, metalness: 0.0,
      emissive: color, emissiveIntensity: 0.07, envMapIntensity: 0.35,
    }));
  }
  return skinCache.get(color);
}

function mesh(geo, color, x = 0, y = 0, z = 0, opts = {}) {
  const m = new THREE.Mesh(geo, opts.mat || toon(color, opts));
  m.position.set(x, y, z);
  if (opts.ry) m.rotation.y = opts.ry;
  if (opts.rz) m.rotation.z = opts.rz;
  if (opts.rx) m.rotation.x = opts.rx;
  m.castShadow = true;
  return m;
}

// --- leaf-village spiral symbol (headband plates) ---
let leafTex = null;
function getLeafTex() {
  if (leafTex) return leafTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  g.clearRect(0, 0, 64, 64);
  g.strokeStyle = '#1e3a5f';
  g.lineWidth = 6;
  g.lineCap = 'round';
  // spiral swirl
  g.beginPath();
  for (let a = 0; a < Math.PI * 4.2; a += 0.1) {
    const r = 4 + a * 2.1;
    const x = 32 + Math.cos(a + 1.2) * r, y = 32 + Math.sin(a + 1.2) * r;
    if (a === 0) g.moveTo(x, y); else g.lineTo(x, y);
  }
  g.stroke();
  // leaf tail
  g.beginPath();
  g.moveTo(32, 8); g.quadraticCurveTo(44, 20, 40, 34);
  g.stroke();
  leafTex = new THREE.CanvasTexture(c);
  leafTex.colorSpace = THREE.SRGBColorSpace;
  return leafTex;
}

// --- explosive-tag seal texture ---
let sealTex = null;
function getSealTex() {
  if (sealTex) return sealTex;
  const c = document.createElement('canvas');
  c.width = 64; c.height = 96;
  const g = c.getContext('2d');
  g.fillStyle = '#f5ecd8';
  g.fillRect(0, 0, 64, 96);
  g.strokeStyle = '#c0272d';
  g.lineWidth = 4;
  g.strokeRect(5, 5, 54, 86);
  g.lineWidth = 5;
  g.beginPath();
  g.moveTo(32, 16); g.lineTo(32, 80);
  g.moveTo(16, 34); g.lineTo(48, 34);
  g.moveTo(20, 58); g.lineTo(44, 52);
  g.stroke();
  g.fillStyle = '#c0272d';
  g.beginPath(); g.arc(32, 72, 5, 0, Math.PI * 2); g.fill();
  sealTex = new THREE.CanvasTexture(c);
  sealTex.colorSpace = THREE.SRGBColorSpace;
  return sealTex;
}

// --- per-hero hair styles ---
function buildHair(charId, colors, head) {
  const H = colors.hair;
  const g = new THREE.Group();
  if (charId === 'naruto') {
    g.add(mesh(new THREE.SphereGeometry(0.21, 12, 10, 0, Math.PI * 2, 0, 1.9), H, 0, 0.05, -0.01));
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      const spike = mesh(new THREE.ConeGeometry(0.07, 0.22, 6), H,
        Math.cos(a) * 0.18, 0.16 + (i % 2) * 0.05, Math.sin(a) * 0.18);
      spike.rotation.set(Math.sin(a) * 0.9, 0, -Math.cos(a) * 0.9);
      g.add(spike);
    }
  } else if (charId === 'sasuke') {
    g.add(mesh(new THREE.SphereGeometry(0.215, 12, 10, 0, Math.PI * 2, 0, 2.0), H, 0, 0.05, -0.02));
    for (let i = 0; i < 7; i++) {
      const a = Math.PI * 0.6 + (i / 6) * Math.PI * 1.1;
      const spike = mesh(new THREE.ConeGeometry(0.075, 0.3, 6), H,
        Math.cos(a) * 0.16, 0.1, Math.sin(a) * 0.16 - 0.06);
      spike.rotation.set(1.2, 0, -Math.cos(a) * 0.7);
      g.add(spike);
    }
    // emo fringe
    g.add(mesh(new THREE.BoxGeometry(0.3, 0.16, 0.06), H, 0, 0.12, 0.17));
  } else if (charId === 'lee') {
    g.add(mesh(new THREE.SphereGeometry(0.225, 14, 10, 0, Math.PI * 2, 0, 1.75), H, 0, 0.06, -0.01));
    g.add(mesh(new THREE.CylinderGeometry(0.225, 0.215, 0.08, 14), H, 0, 0.1, -0.01));
  } else if (charId === 'hinata' || charId === 'neji') {
    g.add(mesh(new THREE.SphereGeometry(0.215, 12, 10, 0, Math.PI * 2, 0, 2.1), H, 0, 0.06, -0.02));
    g.add(mesh(new THREE.BoxGeometry(0.09, 0.5, 0.1), H, -0.2, -0.2, -0.02)); // hime sidelocks
    g.add(mesh(new THREE.BoxGeometry(0.09, 0.5, 0.1), H, 0.2, -0.2, -0.02));
    g.add(mesh(new THREE.BoxGeometry(0.3, 0.42, 0.1), H, 0, -0.22, -0.12));
  } else { // sakura — bob with big forehead protector vibe
    g.add(mesh(new THREE.SphereGeometry(0.22, 12, 10, 0, Math.PI * 2, 0, 2.2), H, 0, 0.06, -0.02));
    g.add(mesh(new THREE.BoxGeometry(0.34, 0.2, 0.3), H, 0, 0.02, -0.06));
    g.add(mesh(new THREE.BoxGeometry(0.1, 0.24, 0.08), H, -0.19, -0.08, 0.05));
    g.add(mesh(new THREE.BoxGeometry(0.1, 0.24, 0.08), H, 0.19, -0.08, 0.05));
  }
  head.add(g);
  return g;
}

const EYE_COLORS = {
  naruto: 0x2e6bff, sasuke: 0x14141c, sakura: 0x2e8f4d,
  lee: 0x1a1a1a, hinata: null, neji: null, kakashi: 0x1a1a1a,
};

function buildFace(charId, colors, head) {
  const S = colors.skin;
  const pupilColor = EYE_COLORS[charId] ?? 0x1a1a1a;
  // eye whites + pupils (hyuga get pale pupil-less eyes)
  const whiteMat = new THREE.MeshStandardMaterial({ color: 0xf8f8f2, roughness: 0.35 });
  const pupilMat = new THREE.MeshStandardMaterial({
    color: pupilColor == null ? 0xd8dce8 : pupilColor, roughness: 0.25,
  });
  for (const s of [-1, 1]) {
    const white = new THREE.Mesh(new THREE.SphereGeometry(0.048, 10, 8), whiteMat);
    white.position.set(s * 0.085, 0.005, 0.175);
    white.scale.z = 0.55;
    head.add(white);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(pupilColor == null ? 0.036 : 0.022, 8, 8), pupilMat);
    pupil.position.set(s * 0.085, 0.005, 0.196);
    pupil.scale.z = 0.5;
    head.add(pupil);
  }
  // eyebrows
  const browMat = new THREE.MeshStandardMaterial({ color: colors.hair, roughness: 0.8 });
  for (const s of [-1, 1]) {
    const b = new THREE.Mesh(
      new THREE.BoxGeometry(charId === 'lee' ? 0.1 : 0.08, charId === 'lee' ? 0.032 : 0.02, 0.02), browMat);
    b.position.set(s * 0.085, 0.082, 0.188);
    b.rotation.z = -s * 0.22;
    head.add(b);
  }
  // mouth + nose hint
  const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.012, 0.012),
    new THREE.MeshStandardMaterial({ color: 0x6e3a2e, roughness: 0.7 }));
  mouth.position.set(0, -0.088, 0.196);
  head.add(mouth);
  const nose = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.04, 0.02), skin(S));
  nose.position.set(0, -0.03, 0.203);
  head.add(nose);
  // whiskers for naruto
  if (charId === 'naruto') {
    const wMat = new THREE.MeshBasicMaterial({ color: 0x8a5a2a });
    for (const s of [-1, 1]) for (let i = 0; i < 3; i++) {
      const w = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.008, 0.008), wMat);
      w.position.set(s * 0.17, -0.03 + i * 0.03, 0.14);
      head.add(w);
    }
  }
  // forehead protector: cloth band + engraved metal plate
  const band = mesh(new THREE.CylinderGeometry(0.218, 0.218, 0.11, 16, 1, true),
    colors.headband, 0, 0.1, 0, { rough: 0.9 });
  band.material = band.material.clone();
  band.material.side = THREE.DoubleSide;
  head.add(band);
  const plate = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.1, 0.03), metal(0xb9c2cc, 0.35));
  plate.position.set(0, 0.1, 0.2);
  plate.castShadow = true;
  head.add(plate);
  const symbol = new THREE.Mesh(new THREE.PlaneGeometry(0.11, 0.11),
    new THREE.MeshBasicMaterial({ map: getLeafTex(), transparent: true }));
  symbol.position.set(0, 0.1, 0.216);
  head.add(symbol);
}

// small hand-held weapon props (real metal + wrapped grips)
function buildWeaponProp(kind) {
  const g = new THREE.Group();
  const steel = metal(0xc8d2dc, 0.25);
  if (kind === 'kunai') {
    g.add(mesh(new THREE.ConeGeometry(0.045, 0.22, 4), 0, 0, 0.1, 0, { mat: steel }));
    g.add(mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.12, 6), 0x2a2a35, 0, -0.06, 0, { rough: 0.9 }));
    for (let i = 0; i < 3; i++) {
      const wrap = mesh(new THREE.TorusGeometry(0.021, 0.008, 6, 10), 0x8e2f2f, 0, -0.03 - i * 0.035, 0);
      wrap.rotation.x = Math.PI / 2;
      g.add(wrap);
    }
    g.add(mesh(new THREE.TorusGeometry(0.045, 0.012, 6, 12), 0, 0, -0.15, 0, { mat: steel }));
  } else if (kind === 'shuriken') {
    for (let i = 0; i < 4; i++) {
      const blade = mesh(new THREE.ConeGeometry(0.05, 0.16, 4), 0, 0, 0, 0, { mat: steel });
      blade.rotation.z = (i * Math.PI) / 2;
      blade.position.set(Math.cos((i * Math.PI) / 2) * 0.07, Math.sin((i * Math.PI) / 2) * 0.07, 0);
      blade.rotation.y = Math.PI / 2;
      g.add(blade);
    }
    g.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.03, 8), 0x3a3f4a, 0, 0, 0, { rx: Math.PI / 2 }));
    g.rotation.x = Math.PI / 2;
  } else { // bomb = kunai + paper seal tag
    g.add(mesh(new THREE.ConeGeometry(0.045, 0.22, 4), 0, 0, 0.1, 0, { mat: steel }));
    g.add(mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.12, 6), 0x2a2a35, 0, -0.06, 0, { rough: 0.9 }));
    const tag = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.2, 0.01),
      new THREE.MeshStandardMaterial({ map: getSealTex(), roughness: 0.9 }));
    tag.position.set(0.08, -0.1, 0);
    tag.rotation.z = 0.4;
    tag.castShadow = true;
    g.add(tag);
  }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

// --- nameplate sprite (name + hp bar) ---
function makePlate() {
  const canvas = document.createElement('canvas');
  canvas.width = 256; canvas.height = 64;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: tex, depthTest: true, transparent: true });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(1.7, 0.425, 1);
  sprite.position.y = 2.2;
  sprite.userData = { canvas, tex, key: '' };
  return sprite;
}

export function updatePlate(ninja, name, hp, maxHp, { me = false, ally = false, xray = false } = {}) {
  const s = ninja.plate;
  const key = `${name}|${hp}|${me}|${ally}`;
  if (s.userData.key !== key) {
    s.userData.key = key;
    const c = s.userData.canvas, g = c.getContext('2d');
    g.clearRect(0, 0, 256, 64);
    g.font = '900 24px Trebuchet MS, sans-serif';
    g.textAlign = 'center';
    g.lineWidth = 5; g.strokeStyle = '#000';
    g.strokeText(name, 128, 26);
    g.fillStyle = me ? '#ffd23e' : ally ? '#37e05a' : '#fff';
    g.fillText(name, 128, 26);
    // hp bar
    g.fillStyle = '#000';
    g.fillRect(38, 36, 180, 16);
    const f = Math.max(0, hp / maxHp);
    g.fillStyle = f > 0.5 ? '#37e05a' : f > 0.25 ? '#ffb02e' : '#ff3b3b';
    g.fillRect(40, 38, 176 * f, 12);
    g.fillStyle = '#fff';
    g.font = '900 13px Trebuchet MS';
    g.fillText(`${Math.max(0, Math.ceil(hp))}`, 128, 50);
    s.userData.tex.needsUpdate = true;
  }
  s.material.depthTest = !xray;
  s.renderOrder = xray ? 999 : 0;
}

// ============================================================================
export function createNinjaMesh(charId, colors) {
  const root = new THREE.Group();
  const parts = {};
  const S = colors.skin, O = colors.outfit, P = colors.pants, A = colors.accent;

  // legs (pivots at hips)
  for (const side of ['L', 'R']) {
    const s = side === 'L' ? -1 : 1;
    const pivot = new THREE.Group();
    pivot.position.set(s * 0.13, 0.95, 0);
    const leg = mesh(new THREE.CapsuleGeometry(0.11, 0.62, 4, 10), P, 0, -0.42, 0);
    const wrap = mesh(new THREE.CylinderGeometry(0.115, 0.115, 0.1, 10), A, 0, -0.62, 0); // shin wrap
    const sandal = mesh(new THREE.BoxGeometry(0.2, 0.1, 0.34), 0x2a2a35, 0, -0.85, 0.05, { rough: 0.9 });
    const strap = mesh(new THREE.BoxGeometry(0.21, 0.03, 0.08), A, 0, -0.8, 0.08);
    pivot.add(leg, wrap, sandal, strap);
    root.add(pivot);
    parts['leg' + side] = pivot;
  }
  // torso
  const hips = new THREE.Group();
  hips.position.y = 0.95;
  root.add(hips);
  parts.hips = hips;
  const torso = mesh(new THREE.CapsuleGeometry(0.24, 0.42, 6, 12), O, 0, 0.42, 0, { rough: 0.85 });
  const hem = mesh(new THREE.CylinderGeometry(0.24, 0.29, 0.2, 12, 1, true), O, 0, 0.02, 0, { rough: 0.85 });
  hem.material = hem.material.clone();
  hem.material.side = THREE.DoubleSide;
  const belt = mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.1, 12), A, 0, 0.12, 0, { rough: 0.7 });
  const buckle = mesh(new THREE.BoxGeometry(0.1, 0.07, 0.04), 0, 0, 0.14, 0.24, { mat: metal(0xd8b84a, 0.35) });
  const pouch = mesh(new THREE.BoxGeometry(0.12, 0.12, 0.07), 0x4a3a28, 0.2, 0.1, 0.16, { rough: 0.9 });
  hips.add(torso, hem, belt, buckle, pouch);
  // shoulder pads
  for (const s of [-1, 1]) {
    hips.add(mesh(new THREE.SphereGeometry(0.11, 10, 8), O, s * 0.33, 0.62, 0));
  }
  if (charId === 'lee') { // orange belt wraps
    hips.add(mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.06, 12), 0xff5a3c, 0, 0.2, 0));
  }

  // arms (pivots at shoulders)
  for (const side of ['L', 'R']) {
    const s = side === 'L' ? -1 : 1;
    const pivot = new THREE.Group();
    pivot.position.set(s * 0.33, 0.62, 0);
    const arm = mesh(new THREE.CapsuleGeometry(0.09, 0.44, 4, 10), O, 0, -0.3, 0, { rough: 0.85 });
    const wrist = mesh(new THREE.CylinderGeometry(0.095, 0.095, 0.09, 10), A, 0, -0.46, 0);
    const hand = mesh(new THREE.SphereGeometry(0.095, 10, 8), S, 0, -0.58, 0, { mat: skin(S) });
    pivot.add(arm, wrist, hand);
    hips.add(pivot);
    parts['arm' + side] = pivot;
  }
  // weapon prop in right hand
  parts.handProps = {
    kunai: buildWeaponProp('kunai'),
    shuriken: buildWeaponProp('shuriken'),
    bomb: buildWeaponProp('bomb'),
  };
  for (const [k, prop] of Object.entries(parts.handProps)) {
    prop.position.set(0, -0.58, 0.12);
    prop.visible = k === 'kunai';
    parts.armR.add(prop);
  }

  // head
  const neck = new THREE.Group();
  neck.position.y = 0.78;
  hips.add(neck);
  parts.neck = neck;
  const collar = mesh(new THREE.CylinderGeometry(0.155, 0.2, 0.15, 12, 1, true), O, 0, 0.0, 0, { rough: 0.85 });
  collar.material = collar.material.clone();
  collar.material.side = THREE.DoubleSide;
  neck.add(collar);
  const head = new THREE.Group();
  head.position.y = 0.24;
  const skull = mesh(new THREE.SphereGeometry(0.21, 18, 14), S, 0, 0, 0, { mat: skin(S) });
  head.add(skull);
  buildHair(charId, colors, head);
  buildFace(charId, colors, head);
  neck.add(head);
  parts.head = head;

  // nameplate
  const plate = makePlate();
  root.add(plate);

  const ninja = {
    root, parts, plate, charId,
    throwT: 0,      // throw anim timer
    spinT: 0,       // barrage spin timer
    walkPhase: Math.random() * 6,
    deadT: 0,
    setWeapon(kind) {
      for (const [k, prop] of Object.entries(parts.handProps)) prop.visible = k === kind;
    },
  };
  return ninja;
}

// Procedural run/idle/jump/skill animation. state: {moveSpeed, airborne, crouch?}
export function animateNinja(ninja, state, dt, time) {
  const p = ninja.parts;
  const speed = state.moveSpeed || 0;
  ninja.walkPhase += dt * (4 + speed * 1.9);

  if (state.dead) {
    ninja.deadT = Math.min(1, ninja.deadT + dt * 3);
    ninja.root.rotation.x = -Math.PI / 2 * ninja.deadT;
    ninja.root.position.y = (state.groundY || 0) + 0.25 * ninja.deadT;
    return;
  }
  ninja.deadT = 0;
  ninja.root.rotation.x = 0;

  const sw = Math.sin(ninja.walkPhase);
  const runAmp = Math.min(1, speed / 6);
  // legs
  p.legL.rotation.x = sw * 0.75 * runAmp + (state.airborne ? -0.5 : 0);
  p.legR.rotation.x = -sw * 0.75 * runAmp + (state.airborne ? 0.35 : 0);
  // arms
  if (ninja.throwT > 0) {
    ninja.throwT -= dt;
    const k = Math.max(0, ninja.throwT / 0.3);
    p.armR.rotation.x = -2.4 * k + (1 - k) * 0.6; // whip forward
    p.armL.rotation.x = -sw * 0.5 * runAmp;
  } else if (state.lock === 'chidori') {
    p.armR.rotation.x = -1.7; p.armL.rotation.x = 0.9; // chidori arm thrust forward
    p.armR.rotation.z = -0.3;
    ninja.root.rotation.x = 0.35; // lean into the dash
  } else if (state.lock === 'barrage' || ninja.spinT > 0) {
    p.armL.rotation.x = -1.2; p.armR.rotation.x = -1.2;
    p.legL.rotation.x = 1.1; p.legR.rotation.x = -0.6;
  } else {
    p.armL.rotation.x = -sw * 0.6 * runAmp + (state.airborne ? -0.9 : Math.sin(time * 2) * 0.05);
    p.armR.rotation.x = sw * 0.6 * runAmp + (state.airborne ? -0.9 : Math.sin(time * 2 + 1) * 0.05);
    ninja.root.rotation.x = runAmp * 0.13; // lean into the sprint
  }
  if (ninja.spinT > 0) {
    ninja.spinT -= dt;
    ninja.root.rotation.y += dt * 18; // flying-kick spin
  }
  // hips bob
  p.hips.position.y = 0.95 + Math.abs(Math.cos(ninja.walkPhase)) * 0.07 * runAmp + (state.airborne ? 0.05 : Math.sin(time * 2.2) * 0.015);
  // head look
  p.neck.rotation.x = THREE.MathUtils.clamp(-(state.pitch || 0) * 0.5, -0.4, 0.4);
  // breathing: subtle torso scale
  const br = 1 + Math.sin(time * 2.2) * 0.012 * (1 - runAmp);
  p.hips.scale.set(br, 1, br);
}
