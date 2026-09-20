// ============================================================================
// SHINOBI ARENA — cel-shaded anime ninja factory + procedural animation.
// One rig, five flavors (hair / outfit / eyes per hero). Used by both the
// live game and the character-select 3D preview.
// ============================================================================
import * as THREE from '/vendor/three/three.module.js';

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
export function toon(color) {
  const key = color;
  if (!matCache.has(key)) {
    matCache.set(key, new THREE.MeshToonMaterial({ color, gradientMap: getGradientMap() }));
  }
  return matCache.get(key);
}
const outlineMat = new THREE.MeshBasicMaterial({ color: 0x0a0a12, side: THREE.BackSide });

// Add inverted-hull outline shells to every mesh so the whole ninja pops.
function addOutlines(root) {
  const meshes = [];
  root.traverse((o) => { if (o.isMesh && !o.userData.noOutline) meshes.push(o); });
  for (const m of meshes) {
    const shell = new THREE.Mesh(m.geometry, outlineMat);
    shell.scale.setScalar(1.07);
    shell.raycast = () => {};
    m.add(shell);
  }
}

function mesh(geo, color, x = 0, y = 0, z = 0, opts = {}) {
  const m = new THREE.Mesh(geo, opts.mat || toon(color));
  m.position.set(x, y, z);
  if (opts.ry) m.rotation.y = opts.ry;
  if (opts.rz) m.rotation.z = opts.rz;
  if (opts.rx) m.rotation.x = opts.rx;
  m.castShadow = true;
  if (opts.noOutline) m.userData.noOutline = true;
  return m;
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
  } else if (charId === 'hinata') {
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

function buildFace(charId, colors, head) {
  // eyes
  if (charId === 'hinata') {
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xf4f6ff });
    for (const s of [-1, 1]) {
      const e = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 8), eyeMat);
      e.position.set(s * 0.085, 0.0, 0.185);
      e.userData.noOutline = true;
      head.add(e);
    }
  } else {
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0x101018 });
    for (const s of [-1, 1]) {
      const e = new THREE.Mesh(new THREE.SphereGeometry(0.032, 8, 8), eyeMat);
      e.position.set(s * 0.08, 0.0, 0.19);
      e.scale.z = 0.5;
      e.userData.noOutline = true;
      head.add(e);
    }
  }
  // whiskers for naruto, thick brows for lee
  if (charId === 'naruto') {
    const wMat = new THREE.MeshBasicMaterial({ color: 0x8a5a2a });
    for (const s of [-1, 1]) for (let i = 0; i < 3; i++) {
      const w = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.008, 0.008), wMat);
      w.position.set(s * 0.17, -0.03 + i * 0.03, 0.14);
      w.userData.noOutline = true;
      head.add(w);
    }
  }
  if (charId === 'lee') {
    const bMat = new THREE.MeshBasicMaterial({ color: 0x0a0a0a });
    for (const s of [-1, 1]) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.03, 0.02), bMat);
      b.position.set(s * 0.08, 0.07, 0.185);
      b.userData.noOutline = true;
      head.add(b);
    }
  }
  // leaf headband plate
  const band = mesh(new THREE.BoxGeometry(0.3, 0.12, 0.02),
    colors.headband, 0, 0.1, 0.185, { noOutline: true });
  head.add(band);
  const plate = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.09, 0.015),
    new THREE.MeshToonMaterial({ color: 0xb9c2cc, gradientMap: getGradientMap(), metalness: 0.4, roughness: 0.4 }));
  plate.position.set(0, 0.1, 0.2);
  plate.userData.noOutline = true;
  head.add(plate);
}

// small hand-held weapon props
function buildWeaponProp(kind) {
  const g = new THREE.Group();
  const steel = 0xc8d2dc, dark = 0x3a3f4a;
  if (kind === 'kunai') {
    g.add(mesh(new THREE.ConeGeometry(0.045, 0.22, 4), steel, 0, 0.1, 0));
    g.add(mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.12, 6), dark, 0, -0.06, 0));
    g.add(mesh(new THREE.TorusGeometry(0.045, 0.012, 6, 12), dark, 0, -0.15, 0));
  } else if (kind === 'shuriken') {
    for (let i = 0; i < 4; i++) {
      const blade = mesh(new THREE.ConeGeometry(0.05, 0.16, 4), steel, 0, 0, 0);
      blade.rotation.z = (i * Math.PI) / 2;
      blade.position.set(Math.cos((i * Math.PI) / 2) * 0.07, Math.sin((i * Math.PI) / 2) * 0.07, 0);
      blade.rotation.y = Math.PI / 2;
      g.add(blade);
    }
    g.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.03, 8), dark, 0, 0, 0, { rx: Math.PI / 2 }));
    g.rotation.x = Math.PI / 2;
  } else { // bomb = kunai + paper tag
    g.add(mesh(new THREE.ConeGeometry(0.045, 0.22, 4), steel, 0, 0.1, 0));
    g.add(mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.12, 6), dark, 0, -0.06, 0));
    const tag = mesh(new THREE.BoxGeometry(0.12, 0.2, 0.01), 0xf5ecd8, 0.08, -0.1, 0, { noOutline: true });
    tag.rotation.z = 0.4;
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
    const sandal = mesh(new THREE.BoxGeometry(0.2, 0.1, 0.34), 0x2a2a35, 0, -0.85, 0.05);
    pivot.add(leg, sandal);
    root.add(pivot);
    parts['leg' + side] = pivot;
  }
  // torso
  const hips = new THREE.Group();
  hips.position.y = 0.95;
  root.add(hips);
  parts.hips = hips;
  const torso = mesh(new THREE.CapsuleGeometry(0.24, 0.42, 6, 12), O, 0, 0.42, 0);
  const belt = mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.1, 12), A, 0, 0.12, 0);
  hips.add(torso, belt);
  if (charId === 'lee') { // orange leg warmers vibe -> belt wraps
    hips.add(mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.06, 12), 0xff5a3c, 0, 0.2, 0));
  }

  // arms (pivots at shoulders)
  for (const side of ['L', 'R']) {
    const s = side === 'L' ? -1 : 1;
    const pivot = new THREE.Group();
    pivot.position.set(s * 0.33, 0.62, 0);
    const arm = mesh(new THREE.CapsuleGeometry(0.09, 0.44, 4, 10), O, 0, -0.3, 0);
    const hand = mesh(new THREE.SphereGeometry(0.095, 10, 8), S, 0, -0.58, 0);
    pivot.add(arm, hand);
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
  const head = new THREE.Group();
  head.position.y = 0.24;
  const skull = mesh(new THREE.SphereGeometry(0.21, 16, 14), S, 0, 0, 0);
  head.add(skull);
  buildHair(charId, colors, head);
  buildFace(charId, colors, head);
  neck.add(head);
  parts.head = head;

  // jacket collar for sasuke / naruto pop
  if (charId === 'sasuke' || charId === 'naruto') {
    neck.add(mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.16, 10, 1, true), O, 0, 0.02, 0));
  }

  addOutlines(root);

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
  }
  if (ninja.spinT > 0) {
    ninja.spinT -= dt;
    ninja.root.rotation.y += dt * 18; // flying-kick spin
  }
  // hips bob
  p.hips.position.y = 0.95 + Math.abs(Math.cos(ninja.walkPhase)) * 0.07 * runAmp + (state.airborne ? 0.05 : Math.sin(time * 2.2) * 0.015);
  // head look
  p.neck.rotation.x = THREE.MathUtils.clamp(-(state.pitch || 0) * 0.5, -0.4, 0.4);
}
