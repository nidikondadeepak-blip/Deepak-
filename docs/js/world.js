// ============================================================================
// SHINOBI ARENA — Konoha world builder. Builds the full 3D village from the
// server's authoritative layout JSON, so visuals and collision always match.
// ============================================================================
import * as THREE from 'three';
import { toon, getGradientMap } from './characters.js';

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

function box(w, h, d, color, x = 0, y = 0, z = 0, ry = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), toon(color));
  m.position.set(x, y, z); m.rotation.y = ry;
  m.castShadow = true; m.receiveShadow = true;
  return m;
}

const HOUSE_TINTS = [0xf3e2c2, 0xe8d3ae, 0xdfc49a, 0xf6ead2, 0xe2cfa8];
const ROOF_TINTS = [0x8e2f2f, 0x5a6b7a, 0x7a4a2e, 0x9e3a3a, 0x4a5a6e];

function pyramidRoof(w, d, h, color) {
  const geo = new THREE.ConeGeometry(Math.SQRT1_2, h, 4);
  const m = new THREE.Mesh(geo, toon(color));
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

  // --- lights & sky ---
  scene.background = new THREE.Color(layout.sky.top);
  scene.fog = new THREE.Fog(layout.sky.bottom, 120, 320);
  const hemi = new THREE.HemisphereLight(layout.sky.top, layout.ground.base, 0.9);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(layout.sky.sun, 1.6);
  sun.position.set(60, 100, 30);
  sun.castShadow = quality !== 'low';
  sun.shadow.camera.left = -130; sun.shadow.camera.right = 130;
  sun.shadow.camera.top = 130; sun.shadow.camera.bottom = -130;
  sun.shadow.camera.far = 300;
  sun.shadow.mapSize.set(quality === 'high' ? 2048 : 1024, quality === 'high' ? 2048 : 1024);
  sun.shadow.bias = -0.0008;
  scene.add(sun);
  scene.add(new THREE.AmbientLight(0xffffff, 0.25));

  // --- ground ---
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(S + 200, S + 200),
    new THREE.MeshToonMaterial({ color: layout.ground.base, gradientMap: getGradientMap() }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  group.add(ground);

  // plaza + roads
  const plaza = new THREE.Mesh(new THREE.CircleGeometry(11, 32), toon(layout.ground.plaza));
  plaza.rotation.x = -Math.PI / 2; plaza.position.y = 0.02; plaza.receiveShadow = true;
  group.add(plaza);
  const roadMat = toon(layout.ground.road);
  const road1 = new THREE.Mesh(new THREE.PlaneGeometry(9, S), roadMat);
  road1.rotation.x = -Math.PI / 2; road1.position.y = 0.015; road1.receiveShadow = true;
  group.add(road1);
  const road2 = new THREE.Mesh(new THREE.PlaneGeometry(S, 9), roadMat);
  road2.rotation.x = -Math.PI / 2; road2.position.y = 0.015; road2.receiveShadow = true;
  group.add(road2);

  // --- distant mountains + clouds (cheap skybox dressing) ---
  {
    const mGeo = new THREE.ConeGeometry(30, 55, 5);
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 + 0.3;
      const m = new THREE.Mesh(mGeo, toon(i % 2 ? 0x6a8f7b : 0x7fa08a));
      m.position.set(Math.cos(a) * (half + 90), 18, Math.sin(a) * (half + 90));
      group.add(m);
    }
    if (quality !== 'low') {
      const cGeo = new THREE.SphereGeometry(8, 10, 8);
      const cMat = new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: getGradientMap(), transparent: true, opacity: 0.92 });
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
  for (const c of layout.colliders) {
    const cx = c.x, cz = c.z, w = c.w, d = c.d, h = c.y1 - (c.y0 || 0), yBase = c.y0 || 0;
    switch (c.kind) {
      case 'house':
      case 'houseBig': {
        const tint = HOUSE_TINTS[(c.tint || 0) % HOUSE_TINTS.length];
        const roofC = ROOF_TINTS[(c.tint || 0) % ROOF_TINTS.length];
        const bodyH = h * 0.72;
        group.add(box(w, bodyH, d, tint, cx, yBase + bodyH / 2, cz));
        const roof = pyramidRoof(w * 1.25, d * 1.25, h * 0.42 + 1.2, roofC);
        roof.position.set(cx, yBase + bodyH + (h * 0.42 + 1.2) / 2 - 0.2, cz);
        group.add(roof);
        // door + windows
        group.add(box(1.6, 2.2, 0.15, 0x5a3a22, cx, yBase + 1.1, cz + d / 2 + 0.05));
        group.add(box(1.4, 1.1, 0.12, 0x2b3a55, cx - w / 4, yBase + bodyH * 0.55, cz + d / 2 + 0.05));
        group.add(box(1.4, 1.1, 0.12, 0x2b3a55, cx + w / 4, yBase + bodyH * 0.55, cz + d / 2 + 0.05));
        break;
      }
      case 'tower': {
        group.add(box(w, h * 0.7, d, 0xf0e4c8, cx, yBase + h * 0.35, cz));
        const roof = pyramidRoof(w * 1.3, d * 1.3, h * 0.45, 0xb03030);
        roof.position.set(cx, yBase + h * 0.7 + h * 0.22, cz);
        group.add(roof);
        const sign = new THREE.Mesh(new THREE.PlaneGeometry(6, 3),
          new THREE.MeshBasicMaterial({ map: textTexture('火影', { w: 256, h: 128, bg: '#f0e4c8', fg: '#b03030' }) }));
        sign.position.set(cx, yBase + h * 0.55, cz + d / 2 + 0.06);
        group.add(sign);
        group.add(box(3, 4, 0.2, 0x5a3a22, cx, yBase + 2, cz + d / 2 + 0.05));
        break;
      }
      case 'towerRoof': break; // roof already included with tower
      case 'academy': {
        group.add(box(w, h * 0.75, d, 0xd8c9a8, cx, yBase + h * 0.375, cz));
        const roof = pyramidRoof(w * 1.2, d * 1.25, h * 0.4, 0x4a5a6e);
        roof.position.set(cx, yBase + h * 0.75 + h * 0.2, cz);
        group.add(roof);
        const sign = new THREE.Mesh(new THREE.PlaneGeometry(4, 4),
          new THREE.MeshBasicMaterial({ map: textTexture('忍', { w: 128, h: 128, bg: '#33415e', fg: '#ffd23e', font: '900 96px "Trebuchet MS"' }) }));
        sign.position.set(cx, yBase + h * 0.55, cz + d / 2 + 0.06);
        group.add(sign);
        break;
      }
      case 'ichiraku': {
        group.add(box(w, h * 0.62, d, 0xc98d5e, cx, yBase + h * 0.31, cz));
        const roof = pyramidRoof(w * 1.3, d * 1.3, 2.4, 0x7a3a2e);
        roof.position.set(cx, yBase + h * 0.62 + 1.0, cz);
        group.add(roof);
        // red awning
        const awn = box(w * 1.1, 0.12, 3, 0xc0272d, cx, yBase + 2.9, cz + d / 2 + 1.2);
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
        // sign pole
        group.add(box(0.25, 5.5, 0.25, 0x4a3320, cx + w / 2 + 1.5, yBase + 2.75, cz + d / 2 + 1));
        const sign = new THREE.Mesh(new THREE.BoxGeometry(0.3, 3.4, 1.4),
          new THREE.MeshBasicMaterial({ map: textTexture('一楽', { w: 128, h: 256, bg: '#f5ecd8', fg: '#c0272d', font: '900 100px "Trebuchet MS"' }) }));
        sign.position.set(cx + w / 2 + 1.5, yBase + 3.6, cz + d / 2 + 1);
        group.add(sign);
        // counter + stools
        group.add(box(w * 0.9, 1, 0.8, 0x6e4a2e, cx, yBase + 0.5, cz + d / 2 + 2.2));
        for (let i = 0; i < 4; i++) {
          const st = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.6, 10), toon(0x8e2f2f));
          st.position.set(cx - 2.4 + i * 1.6, yBase + 0.3, cz + d / 2 + 3.4);
          st.castShadow = true;
          group.add(st);
        }
        break;
      }
      case 'cliff': {
        const rock = box(w, h, d, 0x9e7b5e, cx, yBase + h / 2, cz);
        group.add(rock);
        group.add(box(w * 1.02, 2, d * 1.02, 0x5e8f4e, cx, yBase + h + 0.5, cz)); // grass cap
        // Hokage stone faces along the front
        const n = c.faces || 5;
        for (let i = 0; i < n; i++) {
          const fx = cx + (i - (n - 1) / 2) * (w / (n + 0.6));
          const face = new THREE.Group();
          face.add(box(7, 9, 2.5, 0xc9a06e, 0, 0, 0));
          face.add(box(5.5, 2, 2.7, 0xb08a5e, 0, 3.4, 0));       // hair/headband band
          face.add(box(1.4, 2.2, 1.2, 0xc9a06e, 0, -0.5, 1.6));  // nose
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
        group.add(box(w, h, d, 0x8a6a42, cx, yBase + h / 2, cz));
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
          group.add(box(0.25, h, 0.25, 0x6e4a2e, cx + sx * w / 2.4, yBase + h / 2, cz + sz * d / 2.4));
        const canopy = box(w * 1.3, 0.15, d * 1.4, 0xe8e0d0, cx, yBase + h + 0.1, cz);
        group.add(canopy);
        group.add(box(w * 1.3, 0.5, 0.15, 0xc0272d, cx, yBase + h - 0.15, cz + d * 0.7));
        group.add(box(w * 0.9, 1, d * 0.8, 0x8a6a42, cx, yBase + 0.5, cz));
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
        group.add(box(w, deckH, d, 0x9a7048, cx, yBase + h - deckH / 2, cz));
        // rails
        if (w > d) {
          group.add(box(w, 0.9, 0.2, 0x6e4a2e, cx, yBase + h + 0.45, cz - d / 2));
          group.add(box(w, 0.9, 0.2, 0x6e4a2e, cx, yBase + h + 0.45, cz + d / 2));
        } else {
          group.add(box(0.2, 0.9, d, 0x6e4a2e, cx - w / 2, yBase + h + 0.45, cz));
          group.add(box(0.2, 0.9, d, 0x6e4a2e, cx + w / 2, yBase + h + 0.45, cz));
        }
        break;
      }
      case 'platform': {
        const top = box(w, 0.4, d, 0x9a7048, cx, yBase + h - 0.2, cz);
        group.add(top);
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
  // tree trunks + 2 foliage blobs
  instanced(new THREE.CylinderGeometry(0.35, 0.5, 4, 7), 0x6e4a2e, treeSpots, 2);
  instanced(new THREE.SphereGeometry(2.2, 10, 8), 0x3f9e4d, treeSpots, 4.6);
  instanced(new THREE.SphereGeometry(1.4, 9, 7), 0x55b85e, treeSpots.map((s) => ({ ...s, x: s.x + 1.1 * (s.s || 1) })), 5.6);
  instanced(new THREE.CylinderGeometry(0.8, 1.1, 9, 8), 0x5e3d26, bigTreeSpots, 4.5);
  instanced(new THREE.SphereGeometry(5, 10, 8), 0x2f8f4d, bigTreeSpots, 10.5);
  instanced(new THREE.SphereGeometry(3.2, 9, 7), 0x45ad58, bigTreeSpots.map((s) => ({ ...s, x: s.x + 2.6 * (s.s || 1) })), 12);
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
        const R = 0xc0272d;
        group.add(box(0.8, 7, 0.8, R, d.x - 3, 3.5, d.z));
        group.add(box(0.8, 7, 0.8, R, d.x + 3, 3.5, d.z));
        group.add(box(8.5, 1, 1.2, R, d.x, 7.2, d.z));
        group.add(box(7, 0.7, 0.9, 0x2b2b35, d.x, 6, d.z));
        break;
      }
      case 'dummy': {
        const dum = new THREE.Group();
        dum.add(box(0.5, 2.6, 0.5, 0x8a6a42, 0, 1.3, 0));
        dum.add(box(1.8, 0.3, 0.3, 0x8a6a42, 0, 1.9, 0));
        dum.add(box(0.7, 0.7, 0.7, 0xd8b878, 0, 2.8, 0));
        dum.position.set(d.x, 0, d.z); dum.rotation.y = d.ry || 0;
        group.add(dum);
        break;
      }
      case 'target': {
        group.add(box(0.3, 2.4, 0.3, 0x6e4a2e, d.x, 1.2, d.z));
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
        group.add(flame);
        updatables.push({ update: (_dt, t) => { flame.scale.setScalar(1 + Math.sin(t * 9 + d.x) * 0.18); } });
        break;
      }
      case 'lake': {
        const lake = new THREE.Mesh(new THREE.PlaneGeometry(d.w || 24, d.d || 18),
          new THREE.MeshToonMaterial({ color: 0x35b6ff, gradientMap: getGradientMap(), transparent: true, opacity: 0.85 }));
        lake.rotation.x = -Math.PI / 2; lake.position.set(d.x, 0.05, d.z);
        group.add(lake);
        break;
      }
      case 'river': {
        const river = new THREE.Mesh(new THREE.PlaneGeometry(d.w || 10, d.d || 200),
          new THREE.MeshToonMaterial({ color: 0x35b6ff, gradientMap: getGradientMap(), transparent: true, opacity: 0.8 }));
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

  // --- ramen pickups (bowls) ---
  const ramenMeshes = [];
  {
    const bowlGeo = new THREE.CylinderGeometry(0.5, 0.32, 0.35, 12);
    const soupGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.08, 12);
    layout.pickups.forEach((p) => {
      const g = new THREE.Group();
      const bowl = new THREE.Mesh(bowlGeo, toon(0xe8e0d0));
      bowl.position.y = 0.35; bowl.castShadow = true;
      const soup = new THREE.Mesh(soupGeo, new THREE.MeshBasicMaterial({ color: 0xff9a2e }));
      soup.position.y = 0.52;
      const glow = new THREE.Mesh(new THREE.SphereGeometry(0.7, 10, 8),
        new THREE.MeshBasicMaterial({ color: 0x37e05a, transparent: true, opacity: 0.25 }));
      glow.position.y = 0.6;
      g.add(bowl, soup, glow);
      g.position.set(p.x, 0, p.z);
      group.add(g);
      ramenMeshes.push(g);
      updatables.push({ update: (_dt, t) => { g.rotation.y = t * 1.5; glow.scale.setScalar(1 + Math.sin(t * 4) * 0.12); } });
    });
  }

  // --- safe-zone ring (red barrier wall) ---
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

  function setZone(x, z, r) {
    zoneWall.position.x = x; zoneWall.position.z = z;
    zoneWall.scale.set(r, 1, r);
    zoneRing.position.x = x; zoneRing.position.z = z;
    zoneRing.scale.set(r, r, 1);
  }

  function setRamen(i, visible) {
    if (ramenMeshes[i]) ramenMeshes[i].visible = !!visible;
  }

  function update(dt, t) {
    for (const u of updatables) u.update(dt, t);
  }

  function dispose() {
    scene.remove(group, hemi, sun);
    group.traverse((o) => {
      if (o.isMesh || o.isPoints) {
        o.geometry?.dispose?.();
      }
    });
  }

  return { group, update, setZone, setRamen, half, hokageFaces };
}
