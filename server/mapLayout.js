// ============================================================================
// SHINOBI ARENA — map layouts (single source of truth for collision).
// Server simulates against `colliders`; the client ALSO renders the village
// from this exact data (GET /api/map/:id), so visuals and collision always
// match. y0/y1 are heights. stand=true means ninjas can land on top.
// kind drives which 3D visual the client builds.
// ============================================================================

// Deterministic RNG so layouts are stable across restarts.
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// THE HIDDEN LEAF VILLAGE (KONOHA) — main battlefield
// ---------------------------------------------------------------------------
function buildKonoha() {
  const size = 240;
  const colliders = [];
  const decor = [];
  const C = (kind, x, z, w, d, y1, opts = {}) =>
    colliders.push({ kind, x, z, w, d, y0: opts.y0 ?? 0, y1, solid: opts.solid ?? true, stand: opts.stand ?? true, ...opts.extra });
  const D = (type, x, z, extra = {}) => decor.push({ type, x, z, ...extra });

  // --- Hokage Monument: giant cliff across the north edge (fightable rooftop!) ---
  C('cliff', 0, -112, 150, 18, 30, { extra: { faces: 5 } });

  // --- Hokage Tower (red roof mansion) ---
  C('tower', 34, -62, 18, 14, 15);
  C('towerRoof', 34, -62, 22, 18, 19, { y0: 15, solid: false, stand: false });

  // --- Ninja Academy ---
  C('academy', -48, -44, 24, 14, 11);

  // --- Ichiraku Ramen (iconic!) ---
  C('ichiraku', -18, 12, 9, 7, 4.6);
  D('noren', -18, 12); D('lanternRow', -18, 12);

  // --- Hospital / big red building south plaza ---
  C('houseBig', 8, 58, 16, 12, 9);
  C('houseBig', -34, 62, 14, 12, 8);

  // --- Residential blocks: parkour-friendly rooftops ---------------------------
  // Streets on a loose grid; houses 5-9m tall with 6-10m gaps (jumpable).
  const rng = mulberry32(1337);
  const blocks = [
    // [centerX, centerZ, cols, rows, spacing]
    [-70, -70, 3, 2, 20], [70, -70, 3, 2, 20],
    [-72, 0, 3, 3, 21], [72, -8, 3, 3, 21],
    [-40, -8, 2, 2, 22], [36, 8, 2, 2, 22],
    [-8, -40, 2, 2, 24], [0, 30, 2, 1, 24],
    [-70, 70, 2, 2, 22], [64, 66, 2, 2, 22],
  ];
  for (const [bx, bz, cols, rows, sp] of blocks) {
    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < rows; j++) {
        const x = bx + (i - (cols - 1) / 2) * sp + (rng() - 0.5) * 3;
        const z = bz + (j - (rows - 1) / 2) * sp + (rng() - 0.5) * 3;
        if (Math.hypot(x, z) < 14) continue;               // keep plaza open
        if (Math.hypot(x + 18, z - 12) < 9) continue;      // ichiraku breathing room
        if (Math.hypot(x - 74, z - 42) < 22) continue;     // training grounds
        if (Math.hypot(x + 70, z - 52) < 16) continue;     // lake
        const w = 8 + rng() * 5, d = 7 + rng() * 5;
        const h = 4.5 + rng() * 4.5;                      // 4.5 - 9m rooftops
        C('house', x, z, w, d, h, { extra: { tint: Math.floor(rng() * 5) } });
      }
    }
  }

  // --- Training grounds (east): fenced yard, dummies, targets ---
  const TG = { x: 74, z: 42 };
  C('fence', TG.x - 12, TG.z, 1.2, 26, 1.3, { stand: false });
  C('fence', TG.x + 12, TG.z, 1.2, 26, 1.3, { stand: false });
  C('fence', TG.x, TG.z - 13, 25, 1.2, 1.3, { stand: false });
  C('fence', TG.x, TG.z + 13, 25, 1.2, 1.3, { stand: false });
  for (let i = 0; i < 4; i++) D('dummy', TG.x - 7 + i * 4.5, TG.z - 6, { ry: (rng() - 0.5) });
  for (let i = 0; i < 3; i++) D('target', TG.x - 5 + i * 5, TG.z + 8, { ry: Math.PI });
  C('platform', TG.x, TG.z, 6, 6, 0.6);                    // sparring stage
  D('torch', TG.x - 10, TG.z - 11); D('torch', TG.x + 10, TG.z + 11);

  // --- Lake + bridge (west) ---
  D('lake', -70, 52, { w: 26, d: 20 });
  C('bridge', -70, 52, 4, 24, 1.4, { extra: { walkOnly: true } });

  // --- Village gate (south) ---
  C('gatePillar', -6, 108, 3, 3, 12, { stand: false });
  C('gatePillar', 6, 108, 3, 3, 12, { stand: false });
  C('gateBeam', 0, 108, 18, 4, 14, { y0: 11, solid: false, stand: false });
  D('gateSign', 0, 108);

  // --- Torii gates & stone lanterns along main street ---
  D('torii', 0, -20); D('torii', 0, 40); D('torii', 0, 80);
  for (let i = 0; i < 8; i++) {
    D('stoneLantern', -6, -30 + i * 15);
    D('stoneLantern', 6, -22 + i * 15);
  }

  // --- Forest ring (trees OUTSIDE the playable bowl become decor; a few
  //     trunks near the edge are solid cover) ---
  for (let i = 0; i < 90; i++) {
    const a = rng() * Math.PI * 2;
    const r = 100 + rng() * 22;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    const s = 0.8 + rng() * 0.9;
    D('tree', x, z, { s });
    if (i % 6 === 0) C('trunk', x, z, 1.4, 1.4, 7, { stand: false });
  }
  // A few inner shade trees (cover inside the village)
  const innerTrees = [[-30, -20], [24, -34], [52, 22], [-52, 30], [14, -8], [-6, 84], [40, 84], [-88, 20], [88, -32]];
  for (const [x, z] of innerTrees) { D('tree', x, z, { s: 1 + rng() * 0.5 }); C('trunk', x, z, 1.4, 1.4, 7, { stand: false }); }

  // --- Market stalls near plaza (low cover you can jump on) ---
  C('stall', 12, -4, 4, 3, 2.6);
  C('stall', -10, 26, 4, 3, 2.6);
  C('stall', 20, 30, 4, 3, 2.6);

  // --- Spawn points: spread ring so nobody spawns on top of each other ---
  const spawns = [];
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 + 0.26;
    const r = 82;
    spawns.push({ x: Math.cos(a) * r, z: Math.sin(a) * r * 0.92, yaw: Math.atan2(-Math.cos(a), -Math.sin(a)) });
  }

  // --- Ramen pickup spots (heal 60) ---
  const pickups = [
    { x: -18, z: 18 }, { x: 0, z: 0 }, { x: 74, z: 42 }, { x: 34, z: -52 },
    { x: -48, z: -34 }, { x: -70, z: 42 }, { x: 52, z: -70 }, { x: -52, z: 70 },
    { x: 20, z: 78 }, { x: -20, z: -70 }, { x: 0, z: 100 }, { x: 90, z: 10 },
  ];

  return {
    id: 'konoha',
    name: 'Hidden Leaf Village',
    subtitle: 'Konoha — Main Battlefield',
    desc: 'Fight across ramen shops, academy rooftops and the Hokage Monument. Jump the roofs, rule the village.',
    size,
    colliders,
    decor,
    spawns,
    pickups,
    zoneStart: { x: 0, z: 0, r: 105 },
    sky: { top: 0x3fa9ff, bottom: 0xffe3b3, sun: 0xfff2cc },
    ground: { base: 0x69c24a, road: 0xd9b380, plaza: 0xcfc4ae },
  };
}

// ---------------------------------------------------------------------------
// TRAINING GROUNDS 44 — dense forest arena ("Forest of Death" vibes)
// ---------------------------------------------------------------------------
function buildTrainingGrounds() {
  const size = 220;
  const colliders = [];
  const decor = [];
  const rng = mulberry32(777);
  const C = (kind, x, z, w, d, y1, opts = {}) =>
    colliders.push({ kind, x, z, w, d, y0: opts.y0 ?? 0, y1, solid: opts.solid ?? true, stand: opts.stand ?? true, ...opts.extra });
  const D = (type, x, z, extra = {}) => decor.push({ type, x, z, ...extra });

  // Central tower
  C('tower', 0, 0, 14, 14, 16);
  C('towerRoof', 0, 0, 18, 18, 20, { y0: 16, solid: false, stand: false });
  D('torii', 0, 14);

  // Giant trees with fightable branch platforms
  for (let i = 0; i < 26; i++) {
    const a = rng() * Math.PI * 2;
    const r = 28 + rng() * 68;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    const s = 1.3 + rng() * 1.1;
    D('bigTree', x, z, { s });
    C('trunk', x, z, 2.2 * s, 2.2 * s, 9 * s, { stand: false });
    if (i % 2 === 0) C('platform', x + 3.4 * s, z, 5, 5, 6.5, { y0: 5.9, solid: false }); // branch platform
  }
  // Underbrush decor trees
  for (let i = 0; i < 70; i++) {
    const a = rng() * Math.PI * 2;
    const r = 20 + rng() * 85;
    D('tree', Math.cos(a) * r, Math.sin(a) * r, { s: 0.7 + rng() * 0.8 });
  }

  // River cutting through (visual) + 2 bridges
  D('river', 0, 0, { w: 10, d: 220 });
  C('bridge', -30, 0, 26, 4, 1.4, { extra: { walkOnly: true } });
  C('bridge', 35, 0, 26, 4, 1.4, { extra: { walkOnly: true } });

  // Training posts scattered
  for (let i = 0; i < 10; i++) {
    const a = rng() * Math.PI * 2, r = 40 + rng() * 40;
    D('dummy', Math.cos(a) * r, Math.sin(a) * r, { ry: rng() * 6 });
  }

  const spawns = [];
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const r = 78;
    spawns.push({ x: Math.cos(a) * r, z: Math.sin(a) * r, yaw: Math.atan2(-Math.cos(a), -Math.sin(a)) });
  }
  const pickups = [
    { x: 0, z: 20 }, { x: -30, z: 6 }, { x: 35, z: -6 }, { x: -50, z: -50 },
    { x: 50, z: 50 }, { x: -55, z: 30 }, { x: 55, z: -30 }, { x: 0, z: -60 }, { x: 20, z: 60 },
  ];

  return {
    id: 'training-grounds',
    name: 'Training Grounds 44',
    subtitle: 'Forest of Death — Dense Forest Arena',
    desc: 'Giant trees, branch platforms and a river split. Ambush country — Hinata shines here.',
    size,
    colliders,
    decor,
    spawns,
    pickups,
    zoneStart: { x: 0, z: 0, r: 96 },
    sky: { top: 0x2f8f6e, bottom: 0xd8f7c8, sun: 0xf4ffd6 },
    ground: { base: 0x3f9e4d, road: 0x8a6f4d, plaza: 0x9c8a6a },
  };
}

const cache = {};
export function getMapLayout(mapId) {
  if (cache[mapId]) return cache[mapId];
  let layout = null;
  if (mapId === 'konoha') layout = buildKonoha();
  else if (mapId === 'training-grounds') layout = buildTrainingGrounds();
  if (layout) cache[mapId] = layout;
  return layout;
}

export function listMaps() {
  return [
    { id: 'konoha', name: 'Hidden Leaf Village', subtitle: 'Konoha — Main Battlefield', available: true, players: '4–12', size: 'Large' },
    { id: 'training-grounds', name: 'Training Grounds 44', subtitle: 'Forest of Death', available: true, players: '4–12', size: 'Medium' },
    { id: 'valley-of-the-end', name: 'Valley of the End', subtitle: '??? — Coming Soon', available: false, players: '2–4', size: 'Duel' },
  ];
}
