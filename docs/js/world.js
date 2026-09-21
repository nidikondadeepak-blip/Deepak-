// ============================================================================
// SHINOBI ARENA — Konoha world builder. Builds the full 3D village from the
// server's authoritative layout JSON, so visuals and collision always match.
// v1.2 realistic pass: gradient sky dome, tiled roofs, plaster walls,
// reflective windows, street lamps, snow-capped mountains, PBR water.
// ============================================================================
import * as THREE from '../vendor/three/three.module.js';
import { toon, metal } from './characters.js';

function textTexture(text, { w = 256, h = 128, bg = '#f5ecd8', fg = '#c0272d', font = '900 84px "Trebuchet MS", sans-serif' } = {}) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, w, h);
  g.fillStyle = fg; g.font = font; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, w / 2, h / 2 + 4);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// --- cached procedural materials ---
const texCache = new Map();
function canvasTex(key, w, h, draw, srgb = true) {
  if (texCache.has(key)) return texCache.get(key);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  texCache.set(key, t);
  return t;
}
function std(map, rough = 0.85, metalness = 0.0, extra = {}) {
  return new THREE.MeshStandardMaterial({ map, roughness: rough, metalness, envMapIntensity: 0.45, ...extra });
}
const hex = (n) => '#' + n.toString(16).padStart(6, '0');

// HD grass: speckles + patches + tufts + tiny stones
function groundTexture(baseHex) {
  return canvasTex('ground' + baseHex, 512, 512, (g) => {
    g.fillStyle = hex(baseHex);
    g.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 7000; i++) {
      g.fillStyle = Math.random() < 0.5 ? 'rgba(0,0,0,0.10)' : 'rgba(255,255,255,0.10)';
      const s = 1 + Math.random() * 3;
      g.fillRect(Math.random() * 512, Math.random() * 512, s, s);
    }
    for (let i = 0; i < 26; i++) {
      const x = Math.random() * 512, y = Math.random() * 512, r = 30 + Math.random() * 80;
      const grad = g.createRadialGradient(x, y, 4, x, y, r);
      grad.addColorStop(0, Math.random() < 0.5 ? 'rgba(60,80,20,0.16)' : 'rgba(180,200,120,0.12)');
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grad;
      g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    }
    // grass tufts
    g.lineWidth = 2;
    for (let i = 0; i < 700; i++) {
      const x = Math.random() * 512, y = Math.random() * 512;
      g.strokeStyle = Math.random() < 0.5 ? 'rgba(30,90,30,0.5)' : 'rgba(140,180,90,0.5)';
      g.beginPath();
      g.moveTo(x, y); g.lineTo(x + (Math.random() - 0.5) * 8, y - 4 - Math.random() * 5);
      g.stroke();
    }
    // tiny stones
    for (let i = 0; i < 160; i++) {
      g.fillStyle = 'rgba(150,150,150,0.5)';
      g.beginPath();
      g.arc(Math.random() * 512, Math.random() * 512, 1 + Math.random() * 2, 0, Math.PI * 2);
      g.fill();
    }
  });
}

function roadTexture(baseHex) {
  return canvasTex('road' + baseHex, 128, 256, (g) => {
    g.fillStyle = hex(baseHex);
    g.fillRect(0, 0, 128, 256);
    for (let i = 0; i < 700; i++) {
      g.fillStyle = Math.random() < 0.5 ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.08)';
      g.fillRect(Math.random() * 128, Math.random() * 256, 2, 2);
    }
    g.fillStyle = 'rgba(50,35,20,0.6)';
    g.fillRect(0, 0, 6, 256); g.fillRect(122, 0, 6, 256);
    g.fillStyle = 'rgba(255,255,255,0.25)';
    for (let y = 0; y < 256; y += 42) g.fillRect(60, y, 8, 22);
    // cracks
    g.strokeStyle = 'rgba(40,30,20,0.5)';
    g.lineWidth = 1.5;
    for (let i = 0; i < 5; i++) {
      let x = Math.random() * 128, y = Math.random() * 256;
      g.beginPath(); g.moveTo(x, y);
      for (let j = 0; j < 5; j++) { x += (Math.random() - 0.5) * 30; y += Math.random() * 22; g.lineTo(x, y); }
      g.stroke();
    }
  });
}

function plazaTexture(baseHex) {
  return canvasTex('plaza' + baseHex, 256, 256, (g) => {
    g.fillStyle = hex(baseHex);
    g.fillRect(0, 0, 256, 256);
    g.strokeStyle = 'rgba(60,50,40,0.5)';
    for (let r = 30; r < 130; r += 20) {
      g.lineWidth = r % 40 === 30 ? 5 : 2;
      g.beginPath(); g.arc(128, 128, r, 0, Math.PI * 2); g.stroke();
    }
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      g.strokeStyle = 'rgba(60,50,40,0.4)';
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(128 + Math.cos(a) * 30, 128 + Math.sin(a) * 30);
      g.lineTo(128 + Math.cos(a) * 126, 128 + Math.sin(a) * 126);
      g.stroke();
    }
    for (let i = 0; i < 400; i++) {
      g.fillStyle = 'rgba(0,0,0,0.06)';
      g.fillRect(Math.random() * 256, Math.random() * 256, 2, 2);
    }
    g.fillStyle = '#2f8f4d';
    g.beginPath(); g.arc(128, 128, 16, 0, Math.PI * 2); g.fill();
  });
}

function plasterMat(tintHex) {
  const t = canvasTex('plaster' + tintHex, 128, 128, (g) => {
    g.fillStyle = hex(tintHex);
    g.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 900; i++) {
      g.fillStyle = Math.random() < 0.5 ? 'rgba(0,0,0,0.07)' : 'rgba(255,255,255,0.07)';
      g.fillRect(Math.random() * 128, Math.random() * 128, 2, 2);
    }
    g.fillStyle = 'rgba(0,0,0,0.05)';
    for (let i = 0; i < 6; i++) g.fillRect(0, Math.random() * 128, 128, 1 + Math.random() * 2);
  });
  return std(t, 0.92);
}

function roofMat(tintHex) {
  const t = canvasTex('roof' + tintHex, 128, 128, (g) => {
    g.fillStyle = hex(tintHex);
    g.fillRect(0, 0, 128, 128);
    for (let row = 0; row < 8; row++) {
      const y = row * 16;
      for (let col = 0; col < 8; col++) {
        const x = col * 16 + (row % 2 ? 8 : 0);
        g.fillStyle = 'rgba(0,0,0,0.28)';
        g.beginPath(); g.arc(x, y + 14, 8, Math.PI, 0); g.fill();
        g.fillStyle = 'rgba(255,255,255,0.10)';
        g.beginPath(); g.arc(x, y + 15, 8, Math.PI * 1.15, Math.PI * 1.85); g.stroke();
      }
      g.fillStyle = 'rgba(0,0,0,0.35)';
      g.fillRect(0, y, 128, 2);
    }
  });
  t.repeat.set(3, 2);
  return std(t, 0.75);
}

function woodMat(dark = false) {
  const t = canvasTex('wood' + dark, 128, 128, (g) => {
    g.fillStyle = dark ? '#6e4a2e' : '#9a7048';
    g.fillRect(0, 0, 128, 128);
    for (let p = 0; p < 4; p++) {
      g.fillStyle = 'rgba(0,0,0,0.35)';
      g.fillRect(p * 32, 0, 2, 128);
      g.strokeStyle = 'rgba(0,0,0,0.18)';
      g.lineWidth = 1;
      for (let i = 0; i < 8; i++) {
        const x = p * 32 + 4 + Math.random() * 24;
        g.beginPath(); g.moveTo(x, 0);
        g.bezierCurveTo(x + 3, 42, x - 3, 84, x + 2, 128);
        g.stroke();
      }
    }
  });
  return std(t, 0.8);
}

function stoneMat() {
  const t = canvasTex('stone', 128, 128, (g) => {
    g.fillStyle = '#9e8a76';
    g.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 700; i++) {
      const v = 120 + Math.random() * 60;
      g.fillStyle = `rgba(${v},${v * 0.92},${v * 0.82},0.5)`;
      g.fillRect(Math.random() * 128, Math.random() * 128, 3, 3);
    }
    g.strokeStyle = 'rgba(60,50,40,0.5)';
    g.lineWidth = 2;
    for (let i = 0; i < 4; i++) {
      let x = Math.random() * 128, y = Math.random() * 128;
      g.beginPath(); g.moveTo(x, y);
      for (let j = 0; j < 4; j++) { x += (Math.random() - 0.5) * 50; y += (Math.random() - 0.5) * 50; g.lineTo(x, y); }
      g.stroke();
    }
  });
  return std(t, 0.95);
}

function canopyMat() {
  const t = canvasTex('canopy', 128, 64, (g) => {
    for (let i = 0; i < 8; i++) {
      g.fillStyle = i % 2 ? '#c0272d' : '#f0e8d8';
      g.fillRect(i * 16, 0, 16, 64);
    }
    g.fillStyle = 'rgba(0,0,0,0.12)';
    g.fillRect(0, 52, 128, 12);
  });
  return std(t, 0.9);
}

function skyTexture() {
  return canvasTex('sky', 16, 256, (g) => {
    const grad = g.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0.0, '#1e5fc8');
    grad.addColorStop(0.45, '#5f9fe8');
    grad.addColorStop(0.75, '#b8d8f0');
    grad.addColorStop(1.0, '#e8f2f2');
    g.fillStyle = grad;
    g.fillRect(0, 0, 16, 256);
  });
}

const glassMat = new THREE.MeshStandardMaterial({
  color: 0x9fc8dd, metalness: 0.85, roughness: 0.18, envMapIntensity: 1.2,
});
const frameMat = new THREE.MeshStandardMaterial({ color: 0xf2ede2, roughness: 0.7 });
const beamMat = new THREE.MeshStandardMaterial({ color: 0x4a3320, roughness: 0.85 });

let glowTexW = null;
function glowSprite(color, scale, opacity = 0.6) {
  if (!glowTexW) {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(32, 32, 2, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.4, 'rgba(255,255,255,0.4)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    glowTexW = new THREE.CanvasTexture(c);
  }
  const s = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTexW, color, transparent: true, opacity,
    depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  s.scale.setScalar(scale);
  return s;
}

function box(w, h, d, color, x = 0, y = 0, z = 0, ry = 0, mat = null) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat || toon(color));
  m.position.set(x, y, z); m.rotation.y = ry;
  m.castShadow = true; m.receiveShadow = true;
  return m;
}

// dark-wood beam frame (realistic roof/platform edging)
function edgeFrame(w, d, thick = 0.5, h = 0.28) {
  const g = new THREE.Group();
  g.add(box(w, h, thick, 0, 0, 0, -d / 2, 0, beamMat));
  g.add(box(w, h, thick, 0, 0, 0, d / 2, 0, beamMat));
  g.add(box(thick, h, d, 0, -w / 2, 0, 0, 0, beamMat));
  g.add(box(thick, h, d, 0, w / 2, 0, 0, 0, beamMat));
  return g;
}

// window with frame, reflective glass, mullions + sill
function windowUnit(wd, ht) {
  const g = new THREE.Group();
  g.add(box(wd + 0.24, ht + 0.24, 0.1, 0, 0, 0, 0, 0, frameMat));
  g.add(box(wd, ht, 0.12, 0, 0, 0, 0.01, 0, glassMat));
  g.add(box(0.06, ht, 0.14, 0, 0, 0, 0.02, 0, frameMat));
  g.add(box(wd, 0.06, 0.14, 0, 0, 0, 0.02, 0, frameMat));
  g.add(box(wd + 0.5, 0.12, 0.28, 0, 0, -ht / 2 - 0.16, 0.06, 0, frameMat)); // sill
  return g;
}

function doorUnit(wd, ht) {
  const g = new THREE.Group();
  g.add(box(wd + 0.3, ht + 0.15, 0.14, 0, 0, 0, 0, 0, frameMat));
  g.add(box(wd, ht, 0.12, 0, 0, -0.05, 0.02, 0, woodMat(true)));
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 8), metal(0xd8b84a, 0.3));
  knob.position.set(wd / 2 - 0.25, -0.1, 0.12);
  g.add(knob);
  g.add(box(wd + 0.6, 0.18, 0.9, 0x8a8a92, 0, -ht / 2 - 0.08, 0.35)); // stone step
  return g;
}

const HOUSE_TINTS = [0xf3e2c2, 0xe8d3ae, 0xdfc49a, 0xf6ead2, 0xe2cfa8];
const ROOF_TINTS = [0x8e2f2f, 0x5a6b7a, 0x7a4a2e, 0x9e3a3a, 0x4a5a6e];

function pyramidRoof(w, d, h, mat) {
  const geo = new THREE.ConeGeometry(Math.SQRT1_2, h, 4);
  const m = new THREE.Mesh(geo, mat);
  m.scale.set(w, 1, d);
  m.rotation.y = Math.PI / 4;
  m.castShadow = true; m.receiveShadow = true;
  return m;
}

export function buildWorld(scene, layout, quality = 'med') {
  const group = new THREE.Group();
  scene.add(group);
  const S = layout.size, half = S / 2;
  const updatables = [];

  // --- sky dome + sun + fog ---
  scene.background = new THREE.Color(layout.sky.top);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(420, 24, 16),
    new THREE.MeshBasicMaterial({ map: skyTexture(), side: THREE.BackSide, fog: false, depthWrite: false }));
  group.add(dome);
  const sunSpr = glowSprite(0xfff3d0, 90, 0.95);
  sunSpr.material.fog = false;
  sunSpr.position.set(150, 220, 75);
  group.add(sunSpr);
  scene.fog = new THREE.Fog(0xc8dcec, 150, 380);

  // --- lights: warm sun + cool sky bounce + fill ---
  const hemi = new THREE.HemisphereLight(0xbfe0ff, 0x6a7a4a, 0.75);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff0d8, 2.0);
  sun.position.set(60, 100, 30);
  sun.castShadow = quality !== 'low';
  sun.shadow.camera.left = -130; sun.shadow.camera.right = 130;
  sun.shadow.camera.top = 130; sun.shadow.camera.bottom = -130;
  sun.shadow.camera.far = 300;
  const shSize = quality === 'low' ? 1024 : 2048;
  sun.shadow.mapSize.set(shSize, shSize);
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.5;
  scene.add(sun);
  const fill = new THREE.DirectionalLight(0xa8c8ff, 0.4);
  fill.position.set(-50, 40, -60);
  scene.add(fill);
  scene.add(new THREE.AmbientLight(0xffffff, 0.12));

  // --- HD ground ---
  const gTex = groundTexture(layout.ground.base);
  gTex.repeat.set(48, 48);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(S + 200, S + 200), std(gTex, 0.95));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  group.add(ground);

  // plaza + roads
  const plaza = new THREE.Mesh(new THREE.CircleGeometry(11, 40), std(plazaTexture(layout.ground.plaza), 0.9));
  plaza.rotation.x = -Math.PI / 2; plaza.position.y = 0.02; plaza.receiveShadow = true;
  group.add(plaza);
  const rTex1 = roadTexture(layout.ground.road);
  rTex1.repeat.set(1, 28);
  const road1 = new THREE.Mesh(new THREE.PlaneGeometry(9, S), std(rTex1, 0.92));
  road1.rotation.x = -Math.PI / 2; road1.position.y = 0.015; road1.receiveShadow = true;
  group.add(road1);
  const rTex2 = roadTexture(layout.ground.road + 1);
  rTex2.repeat.set(28, 1);
  const road2 = new THREE.Mesh(new THREE.PlaneGeometry(S, 9), std(rTex2, 0.92));
  road2.rotation.x = -Math.PI / 2; road2.position.y = 0.015; road2.receiveShadow = true;
  group.add(road2);

  // --- distant mountains (snow-capped) + clouds ---
  {
    const mGeo = new THREE.ConeGeometry(30, 55, 5);
    const capGeo = new THREE.ConeGeometry(10.5, 17, 5);
    const snowMat = toon(0xf4f8fc, { rough: 0.9 });
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 + 0.3;
      const m = new THREE.Mesh(mGeo, toon(i % 2 ? 0x5a7f6b : 0x6f9080, { rough: 1 }));
      m.position.set(Math.cos(a) * (half + 90), 18, Math.sin(a) * (half + 90));
      const cap = new THREE.Mesh(capGeo, snowMat);
      cap.position.y = 20;
      m.add(cap);
      group.add(m);
    }
    if (quality !== 'low') {
      const cGeo = new THREE.SphereGeometry(8, 10, 8);
      const cMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, transparent: true, opacity: 0.92 });
      for (let i = 0; i < 7; i++) {
        const cl = new THREE.Group();
        for (let j = 0; j < 3; j++) {
          const puff = new THREE.Mesh(cGeo, cMat);
          puff.position.set(j * 9 - 9, (j % 2) * 3, 0);
          puff.scale.y = 0.55;
          cl.add(puff);
        }
        cl.position.set((Math.random() - 0.5) * 320, 70 + Math.random() * 25, (Math.random() - 0.5) * 320);
        group.add(cl);
        updatables.push({ update: (dt) => { cl.position.x += dt * 1.2; if (cl.position.x > 220) cl.position.x = -220; } });
      }
    }
  }

  // === colliders -> buildings ===
  const hokageFaces = [];
  const woodDark = woodMat(true);
  const woodLight = woodMat(false);
  for (const c of layout.colliders) {
    const cx = c.x, cz = c.z, w = c.w, d = c.d, h = c.y1 - (c.y0 || 0), yBase = c.y0 || 0;
    switch (c.kind) {
      case 'house':
      case 'houseBig': {
        const tint = HOUSE_TINTS[(c.tint || 0) % HOUSE_TINTS.length];
        const roofC = ROOF_TINTS[(c.tint || 0) % ROOF_TINTS.length];
        const bodyH = h * 0.72;
        group.add(box(w, bodyH, d, 0, cx, yBase + bodyH / 2, cz, 0, plasterMat(tint)));
        group.add(box(w + 0.15, 0.7, d + 0.15, 0x7a6a58, cx, yBase + 0.35, cz)); // stone base
        const roof = pyramidRoof(w * 1.25, d * 1.25, h * 0.42 + 1.2, roofMat(roofC));
        roof.position.set(cx, yBase + bodyH + (h * 0.42 + 1.2) / 2 - 0.2, cz);
        group.add(roof);
        const eave = edgeFrame(w * 1.27, d * 1.27);
        eave.position.set(cx, yBase + bodyH - 0.05, cz);
        group.add(eave);
        // door + windows
        const door = doorUnit(1.7, 2.4);
        door.position.set(cx, yBase + 1.2, cz + d / 2 + 0.02);
        group.add(door);
        for (const s of [-1, 1]) {
          const win = windowUnit(1.5, 1.2);
          win.position.set(cx + s * w / 4, yBase + bodyH * 0.58, cz + d / 2 + 0.02);
          group.add(win);
          if (c.kind === 'houseBig') { // upper floor windows
            const win2 = windowUnit(1.3, 1.1);
            win2.position.set(cx + s * w / 4, yBase + bodyH * 0.88, cz + d / 2 + 0.02);
            group.add(win2);
          }
        }
        break;
      }
      case 'tower': {
        group.add(box(w, h * 0.7, d, 0, cx, yBase + h * 0.35, cz, 0, plasterMat(0xf0e4c8)));
        group.add(box(w + 0.2, 1.2, d + 0.2, 0x7a6a58, cx, yBase + 0.6, cz));
        const roof = pyramidRoof(w * 1.3, d * 1.3, h * 0.45, roofMat(0xb03030));
        roof.position.set(cx, yBase + h * 0.7 + h * 0.22, cz);
        group.add(roof);
        const eave = edgeFrame(w * 1.32, d * 1.32);
        eave.position.set(cx, yBase + h * 0.7 - 0.05, cz);
        group.add(eave);
        const sign = new THREE.Mesh(new THREE.PlaneGeometry(6, 3),
          new THREE.MeshBasicMaterial({ map: textTexture('火影', { w: 256, h: 128, bg: '#f0e4c8', fg: '#b03030' }) }));
        sign.position.set(cx, yBase + h * 0.55, cz + d / 2 + 0.06);
        group.add(sign);
        const door = doorUnit(3, 4);
        door.position.set(cx, yBase + 2, cz + d / 2 + 0.02);
        group.add(door);
        for (const wy of [0.32, 0.78]) {
          for (const s of [-1, 1]) {
            const win = windowUnit(1.6, 1.3);
            win.position.set(cx + s * w / 4, yBase + h * wy, cz + d / 2 + 0.02);
            group.add(win);
          }
        }
        break;
      }
      case 'towerRoof': break; // roof already included with tower
      case 'academy': {
        group.add(box(w, h * 0.75, d, 0, cx, yBase + h * 0.375, cz, 0, plasterMat(0xd8c9a8)));
        const roof = pyramidRoof(w * 1.2, d * 1.25, h * 0.4, roofMat(0x4a5a6e));
        roof.position.set(cx, yBase + h * 0.75 + h * 0.2, cz);
        group.add(roof);
        const sign = new THREE.Mesh(new THREE.PlaneGeometry(4, 4),
          new THREE.MeshBasicMaterial({ map: textTexture('忍', { w: 128, h: 128, bg: '#33415e', fg: '#ffd23e', font: '900 96px "Trebuchet MS"' }) }));
        sign.position.set(cx, yBase + h * 0.55, cz + d / 2 + 0.06);
        group.add(sign);
        for (let r = 0; r < 2; r++) {
          for (let i = -1; i <= 1; i++) {
            const win = windowUnit(1.5, 1.2);
            win.position.set(cx + i * w / 4, yBase + h * (0.3 + r * 0.32), cz + d / 2 + 0.02);
            group.add(win);
          }
        }
        break;
      }
      case 'ichiraku': {
        group.add(box(w, h * 0.62, d, 0, cx, yBase + h * 0.31, cz, 0, woodMat(false)));
        const roof = pyramidRoof(w * 1.3, d * 1.3, 2.4, roofMat(0x7a3a2e));
        roof.position.set(cx, yBase + h * 0.62 + 1.0, cz);
        group.add(roof);
        // red awning
        const awn = box(w * 1.1, 0.12, 3, 0, cx, yBase + 2.9, cz + d / 2 + 1.2, 0, canopyMat());
        awn.rotation.x = 0.35;
        group.add(awn);
        // noren curtains
        const norenTex = textTexture('ラーメン', { w: 512, h: 128, bg: '#27408b', fg: '#f5ecd8', font: '900 72px "Trebuchet MS"' });
        for (let i = 0; i < 3; i++) {
          const n = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.1),
            new THREE.MeshBasicMaterial({ map: norenTex, side: THREE.DoubleSide }));
          n.position.set(cx - 1.7 + i * 1.7, yBase + 2.2, cz + d / 2 + 2.2);
          group.add(n);
        }
        // warm paper lanterns under the awning
        for (let i = 0; i < 3; i++) {
          const lx = cx - 1.7 + i * 1.7;
          const lan = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 8),
            new THREE.MeshBasicMaterial({ color: 0xffc85e }));
          lan.position.set(lx, yBase + 2.55, cz + d / 2 + 1.9);
          const halo = glowSprite(0xffb84e, 1.6, 0.5);
          halo.position.copy(lan.position);
          group.add(lan, halo);
        }
        // sign pole
        group.add(box(0.25, 5.5, 0.25, 0, cx + w / 2 + 1.5, yBase + 2.75, cz + d / 2 + 1, 0, woodDark));
        const sign = new THREE.Mesh(new THREE.BoxGeometry(0.3, 3.4, 1.4),
          new THREE.MeshBasicMaterial({ map: textTexture('一楽', { w: 128, h: 256, bg: '#f5ecd8', fg: '#c0272d', font: '900 100px "Trebuchet MS"' }) }));
        sign.position.set(cx + w / 2 + 1.5, yBase + 3.6, cz + d / 2 + 1);
        group.add(sign);
        // counter + stools
        group.add(box(w * 0.9, 1, 0.8, 0, cx, yBase + 0.5, cz + d / 2 + 2.2, 0, woodDark));
        for (let i = 0; i < 4; i++) {
          const st = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.6, 10), toon(0x8e2f2f));
          st.position.set(cx - 2.4 + i * 1.6, yBase + 0.3, cz + d / 2 + 3.4);
          st.castShadow = true;
          group.add(st);
        }
        break;
      }
      case 'cliff': {
        group.add(box(w, h, d, 0, cx, yBase + h / 2, cz, 0, stoneMat()));
        group.add(box(w * 1.02, 2, d * 1.02, 0x5e8f4e, cx, yBase + h + 0.5, cz)); // grass cap
        // Hokage stone faces along the front
        const n = c.faces || 5;
        for (let i = 0; i < n; i++) {
          const fx = cx + (i - (n - 1) / 2) * (w / (n + 0.6));
          const face = new THREE.Group();
          face.add(box(7, 9, 2.5, 0, 0, 0, 0, 0, stoneMat()));
          face.add(box(5.5, 2, 2.7, 0xb08a5e, 0, 3.4, 0));       // hair/headband band
          face.add(box(1.4, 2.2, 1.2, 0xb59a78, 0, -0.5, 1.6));  // nose
          face.add(box(1.6, 1, 0.4, 0x6e5238, -1.8, 0.8, 1.3));  // eyes
          face.add(box(1.6, 1, 0.4, 0x6e5238, 1.8, 0.8, 1.3));
          face.add(box(2.4, 0.7, 0.4, 0x6e5238, 0, -2.6, 1.3));  // mouth
          face.position.set(fx, yBase + h - 7, cz + d / 2 + 1.2);
          group.add(face);
          hokageFaces.push(face);
        }
        break;
      }
      case 'fence': {
        group.add(box(w, h, d, 0, cx, yBase + h / 2, cz, 0, woodDark));
        const posts = Math.max(2, Math.floor(Math.max(w, d) / 3));
        for (let i = 0; i < posts; i++) {
          const t = posts === 1 ? 0 : (i / (posts - 1) - 0.5);
          group.add(box(0.4, h + 0.5, 0.4, 0x6e4a2e,
            cx + (w > d ? t * w : 0), yBase + (h + 0.5) / 2, cz + (w > d ? 0 : t * d)));
        }
        break;
      }
      case 'stall': {
        for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]])
          group.add(box(0.25, h, 0.25, 0, cx + sx * w / 2.4, yBase + h / 2, cz + sz * d / 2.4, 0, woodDark));
        group.add(box(w * 1.3, 0.15, d * 1.4, 0, cx, yBase + h + 0.1, cz, 0, canopyMat()));
        group.add(box(w * 1.3, 0.5, 0.15, 0xc0272d, cx, yBase + h - 0.15, cz + d * 0.7));
        group.add(box(w * 0.9, 1, d * 0.8, 0, cx, yBase + 0.5, cz, 0, woodLight));
        // goods on the counter: fruit piles
        for (let i = 0; i < 3; i++) {
          const pile = new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 6),
            toon([0xe86a3c, 0xe8c53c, 0x7fc83c][i]));
          pile.position.set(cx - 1 + i, yBase + 1.15, cz);
          pile.castShadow = true;
          group.add(pile);
        }
        break;
      }
      case 'gatePillar': {
        group.add(box(w, h, d, 0xc0272d, cx, yBase + h / 2, cz));
        group.add(box(w + 1, 1, d + 1, 0x2b2b35, cx, yBase + h + 0.5, cz));
        break;
      }
      case 'gateBeam': {
        group.add(box(w, h, d, 0x2b2b35, cx, yBase + h / 2, cz));
        break;
      }
      case 'bridge': {
        const deckH = 0.3;
        group.add(box(w, deckH, d, 0, cx, yBase + h - deckH / 2, cz, 0, woodLight));
        // rails
        if (w > d) {
          group.add(box(w, 0.9, 0.2, 0, cx, yBase + h + 0.45, cz - d / 2, 0, woodDark));
          group.add(box(w, 0.9, 0.2, 0, cx, yBase + h + 0.45, cz + d / 2, 0, woodDark));
        } else {
          group.add(box(0.2, 0.9, d, 0, cx - w / 2, yBase + h + 0.45, cz, 0, woodDark));
          group.add(box(0.2, 0.9, d, 0, cx + w / 2, yBase + h + 0.45, cz, 0, woodDark));
        }
        break;
      }
      case 'platform': {
        const top = box(w, 0.4, d, 0, cx, yBase + h - 0.2, cz, 0, woodLight);
        group.add(top);
        const trim = edgeFrame(w + 0.3, d + 0.3, 0.35, 0.22);
        trim.position.set(cx, yBase + h + 0.02, cz);
        group.add(trim);
        if (yBase < 1) {
          group.add(box(w * 0.9, h, d * 0.9, 0x6e5638, cx, yBase + h / 2 - 0.2, cz));
        } else {
          // floating branch platform: ropes up
          for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]])
            group.add(box(0.12, 3, 0.12, 0x6e4a2e, cx + sx * w / 2.4, yBase + h + 1.3, cz + sz * d / 2.4));
        }
        break;
      }
      case 'trunk': {
        const t = new THREE.Mesh(new THREE.CylinderGeometry(w * 0.32, w * 0.42, h, 8), toon(0x6e4a2e));
        t.position.set(cx, yBase + h / 2, cz);
        t.castShadow = true;
        group.add(t);
        break;
      }
      default: break;
    }
  }

  // --- street lamps along both roads (warm glow, no dynamic lights) ---
  {
    const poleMat = toon(0x2b2b35, { rough: 0.6, metal: 0.4 });
    const lampSpots = [];
    for (const z of [-60, -20, 20, 60]) { lampSpots.push([7.5, z], [-7.5, z]); }
    for (const x of [-60, -20, 20, 60]) { lampSpots.push([x, 7.5], [x, -7.5]); }
    const haloList = [];
    for (const [lx, lz] of lampSpots) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 5.2, 8), poleMat);
      pole.position.set(lx, 2.6, lz);
      pole.castShadow = true;
      const cap = new THREE.Mesh(new THREE.ConeGeometry(0.5, 0.4, 8), poleMat);
      cap.position.set(lx, 5.5, lz);
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.26, 10, 8),
        new THREE.MeshBasicMaterial({ color: 0xffd98e }));
      bulb.position.set(lx, 5.1, lz);
      const halo = glowSprite(0xffc86e, 2.6, 0.45);
      halo.position.set(lx, 5.1, lz);
      group.add(pole, cap, bulb, halo);
      haloList.push(halo);
    }
    updatables.push({ update: (_dt, t) => {
      for (let i = 0; i < haloList.length; i++) {
        haloList[i].material.opacity = 0.4 + Math.sin(t * 2.2 + i * 1.7) * 0.08;
      }
    } });
  }

  // === decor (instanced where numerous) ===
  const treeSpots = layout.decor.filter((d) => d.type === 'tree');
  const bigTreeSpots = layout.decor.filter((d) => d.type === 'bigTree');
  const lanternSpots = layout.decor.filter((d) => d.type === 'stoneLantern');

  function instanced(geo, color, spots, yOff, sMul = 1) {
    if (!spots.length) return;
    const im = new THREE.InstancedMesh(geo, toon(color), spots.length);
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    spots.forEach((s, i) => {
      const sc = (s.s || 1) * sMul;
      q.setFromAxisAngle(up, (s.ry || 0) + i * 1.7);
      m4.compose(new THREE.Vector3(s.x, yOff * sc, s.z), q, new THREE.Vector3(sc, sc, sc));
      im.setMatrixAt(i, m4);
    });
    im.castShadow = true;
    group.add(im);
  }
  // tree trunks + 3-layer foliage blobs
  instanced(new THREE.CylinderGeometry(0.35, 0.5, 4, 7), 0x6e4a2e, treeSpots, 2);
  instanced(new THREE.SphereGeometry(2.2, 10, 8), 0x2f7a3d, treeSpots, 4.6);
  instanced(new THREE.SphereGeometry(1.7, 9, 7), 0x3f9e4d, treeSpots.map((s) => ({ ...s, x: s.x + 1.0 * (s.s || 1) })), 5.4);
  instanced(new THREE.SphereGeometry(1.2, 9, 7), 0x62c873, treeSpots.map((s) => ({ ...s, x: s.x - 0.7 * (s.s || 1), z: s.z + 0.6 * (s.s || 1) })), 6.1);
  instanced(new THREE.CylinderGeometry(0.8, 1.1, 9, 8), 0x5e3d26, bigTreeSpots, 4.5);
  instanced(new THREE.SphereGeometry(5, 10, 8), 0x2a7a42, bigTreeSpots, 10.5);
  instanced(new THREE.SphereGeometry(3.4, 9, 7), 0x3f9e4d, bigTreeSpots.map((s) => ({ ...s, x: s.x + 2.6 * (s.s || 1) })), 12);
  instanced(new THREE.SphereGeometry(2.4, 9, 7), 0x62c873, bigTreeSpots.map((s) => ({ ...s, x: s.x - 1.8 * (s.s || 1), z: s.z + 1.4 * (s.s || 1) })), 13.2);
  // stone lanterns
  instanced(new THREE.BoxGeometry(0.9, 1.6, 0.9), 0x8a8a92, lanternSpots, 0.8);
  if (lanternSpots.length) {
    const glow = new THREE.MeshBasicMaterial({ color: 0xffe9a0 });
    const im = new THREE.InstancedMesh(new THREE.BoxGeometry(0.6, 0.4, 0.6), glow, lanternSpots.length);
    const m4 = new THREE.Matrix4();
    lanternSpots.forEach((s, i) => { m4.makeTranslation(s.x, 1.7, s.z); im.setMatrixAt(i, m4); });
    group.add(im);
  }

  for (const d of layout.decor) {
    switch (d.type) {
      case 'torii': {
        const R = new THREE.MeshStandardMaterial({ color: 0xc0272d, roughness: 0.45, metalness: 0.1 });
        const B = toon(0x2b2b35);
        const mk = (w, h, dd, x, y, z, m) => {
          const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, dd), m || R);
          b.position.set(x, y, z); b.castShadow = true;
          group.add(b);
        };
        mk(0.8, 7, 0.8, d.x - 3, 3.5, d.z);
        mk(0.8, 7, 0.8, d.x + 3, 3.5, d.z);
        mk(8.5, 1, 1.2, d.x, 7.2, d.z);
        mk(7, 0.7, 0.9, d.x, 6, d.z, B);
        break;
      }
      case 'dummy': {
        const dum = new THREE.Group();
        dum.add(box(0.5, 2.6, 0.5, 0, 0, 1.3, 0, 0, woodDark));
        dum.add(box(1.8, 0.3, 0.3, 0, 0, 1.9, 0, 0, woodDark));
        dum.add(box(0.7, 0.7, 0.7, 0xd8b878, 0, 2.8, 0));
        dum.position.set(d.x, 0, d.z); dum.rotation.y = d.ry || 0;
        group.add(dum);
        break;
      }
      case 'target': {
        group.add(box(0.3, 2.4, 0.3, 0, d.x, 1.2, d.z, 0, woodDark));
        const t = new THREE.Mesh(new THREE.CircleGeometry(0.9, 20),
          new THREE.MeshBasicMaterial({ map: textTexture('◎', { w: 128, h: 128, bg: '#f5ecd8', fg: '#c0272d', font: '900 100px "Trebuchet MS"' }) }));
        t.position.set(d.x, 2.6, d.z + 0.2);
        if (d.ry) t.rotation.y = d.ry;
        group.add(t);
        break;
      }
      case 'torch': {
        group.add(box(0.25, 3, 0.25, 0x4a3320, d.x, 1.5, d.z));
        const flame = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 8),
          new THREE.MeshBasicMaterial({ color: 0xff9a2e }));
        flame.position.set(d.x, 3.3, d.z);
        const halo = glowSprite(0xff9a2e, 2.2, 0.5);
        halo.position.set(d.x, 3.3, d.z);
        group.add(flame, halo);
        updatables.push({ update: (_dt, t) => { flame.scale.setScalar(1 + Math.sin(t * 9 + d.x) * 0.18); } });
        break;
      }
      case 'lake': {
        const lake = new THREE.Mesh(new THREE.PlaneGeometry(d.w || 24, d.d || 18),
          new THREE.MeshStandardMaterial({ color: 0x2fa8dd, roughness: 0.12, metalness: 0.05, transparent: true, opacity: 0.9, envMapIntensity: 1.0 }));
        lake.rotation.x = -Math.PI / 2; lake.position.set(d.x, 0.05, d.z);
        group.add(lake);
        break;
      }
      case 'river': {
        const river = new THREE.Mesh(new THREE.PlaneGeometry(d.w || 10, d.d || 200),
          new THREE.MeshStandardMaterial({ color: 0x2fa8dd, roughness: 0.12, metalness: 0.05, transparent: true, opacity: 0.85, envMapIntensity: 1.0 }));
        river.rotation.x = -Math.PI / 2; river.position.set(d.x, 0.04, d.z);
        group.add(river);
        break;
      }
      case 'gateSign': {
        const s = new THREE.Mesh(new THREE.PlaneGeometry(7, 1.8),
          new THREE.MeshBasicMaterial({ map: textTexture('木ノ葉', { w: 512, h: 128, bg: '#2b2b35', fg: '#f5ecd8' }), side: THREE.DoubleSide }));
        s.position.set(d.x, 12.6, d.z);
        group.add(s);
        break;
      }
      case 'lanternRow':
      case 'noren': break; // built into ichiraku
      default: break;
    }
  }

  // --- drifting leaves (signature Konoha vibe) ---
  let leaves = null;
  {
    const count = quality === 'low' ? 120 : quality === 'high' ? 500 : 300;
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * S;
      pos[i * 3 + 1] = Math.random() * 25 + 1;
      pos[i * 3 + 2] = (Math.random() - 0.5) * S;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    leaves = new THREE.Points(g, new THREE.PointsMaterial({ color: 0x7fe07f, size: 0.5, transparent: true, opacity: 0.9 }));
    group.add(leaves);
    updatables.push({
      update: (dt, t) => {
        const p = g.attributes.position.array;
        for (let i = 0; i < count; i++) {
          p[i * 3] += dt * (1.5 + Math.sin(t + i) * 0.8);
          p[i * 3 + 1] += dt * Math.cos(t * 0.7 + i * 1.3) * 0.6 - dt * 0.25;
          if (p[i * 3] > half) p[i * 3] = -half;
          if (p[i * 3 + 1] < 0.3) p[i * 3 + 1] = 24;
        }
        g.attributes.position.needsUpdate = true;
      },
    });
  }

  // --- ramen pickups (ceramic bowls + subtle beacon) ---
  const ramenMeshes = [];
  {
    const bowlGeo = new THREE.CylinderGeometry(0.5, 0.32, 0.35, 12);
    const soupGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.08, 12);
    const bowlMat = new THREE.MeshStandardMaterial({ color: 0xf2ede2, roughness: 0.3, envMapIntensity: 0.8 });
    const soupMat = new THREE.MeshStandardMaterial({ color: 0xe07b1e, roughness: 0.4, emissive: 0x903c00, emissiveIntensity: 0.35 });
    layout.pickups.forEach((p) => {
      const g = new THREE.Group();
      const bowl = new THREE.Mesh(bowlGeo, bowlMat);
      bowl.position.y = 0.35; bowl.castShadow = true;
      const soup = new THREE.Mesh(soupGeo, soupMat);
      soup.position.y = 0.52;
      const chop = box(0.08, 0.08, 1.1, 0x8a5a2a, 0.15, 0.62, 0);
      chop.rotation.y = 0.5;
      const glow = new THREE.Mesh(new THREE.SphereGeometry(0.7, 10, 8),
        new THREE.MeshBasicMaterial({ color: 0x37e05a, transparent: true, opacity: 0.18 }));
      glow.position.y = 0.6;
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.32, 9, 10, 1, true),
        new THREE.MeshBasicMaterial({ color: 0x37e05a, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false }));
      beam.position.y = 4.8;
      g.add(bowl, soup, chop, glow, beam);
      g.position.set(p.x, 0, p.z);
      group.add(g);
      ramenMeshes.push(g);
      updatables.push({ update: (_dt, t) => {
        g.rotation.y = t * 1.5;
        glow.scale.setScalar(1 + Math.sin(t * 4) * 0.12);
        beam.material.opacity = 0.13 + Math.sin(t * 3 + p.x) * 0.05;
      } });
    });
  }

  // --- safe-zone ring (red barrier wall + crisp ground edge) ---
  const zoneWall = new THREE.Mesh(
    new THREE.CylinderGeometry(1, 1, 60, 48, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xff2e2e, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false }));
  zoneWall.position.y = 30;
  group.add(zoneWall);
  const zoneRing = new THREE.Mesh(
    new THREE.TorusGeometry(1, 0.35, 8, 64),
    new THREE.MeshBasicMaterial({ color: 0xff5a3c }));
  zoneRing.rotation.x = Math.PI / 2;
  zoneRing.position.y = 0.6;
  group.add(zoneRing);
  const zoneGround = new THREE.Mesh(
    new THREE.RingGeometry(0.965, 1.0, 72),
    new THREE.MeshBasicMaterial({ color: 0xff3b3b, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false }));
  zoneGround.rotation.x = -Math.PI / 2;
  zoneGround.position.y = 0.12;
  group.add(zoneGround);
  updatables.push({ update: (_dt, t) => {
    zoneWall.material.opacity = 0.2 + Math.sin(t * 3) * 0.07;
  } });

  function setZone(x, z, r) {
    zoneWall.position.x = x; zoneWall.position.z = z;
    zoneWall.scale.set(r, 1, r);
    zoneRing.position.x = x; zoneRing.position.z = z;
    zoneRing.scale.set(r, r, 1);
    zoneGround.position.x = x; zoneGround.position.z = z;
    zoneGround.scale.set(r, r, 1);
  }

  function setRamen(i, visible) {
    if (ramenMeshes[i]) ramenMeshes[i].visible = !!visible;
  }

  function update(dt, t) {
    for (const u of updatables) u.update(dt, t);
  }

  function dispose() {
    scene.remove(group, hemi, sun, fill);
    group.traverse((o) => {
      if (o.isMesh || o.isPoints) {
        o.geometry?.dispose?.();
      }
    });
  }

  return { group, update, setZone, setRamen, half, hokageFaces };
}
