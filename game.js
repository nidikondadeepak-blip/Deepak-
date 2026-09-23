(() => {
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d", { alpha: false });
  const W = () => canvas.width;
  const H = () => canvas.height;

  function resize() {
    canvas.width = innerWidth;
    canvas.height = innerHeight;
  }
  addEventListener("resize", resize);
  resize();

  const keys = {};
  const stick = { x: 0, y: 0 };
  addEventListener("keydown", (e) => { keys[e.code] = true; if (["Space", "ArrowUp", "ArrowDown"].includes(e.code)) e.preventDefault(); });
  addEventListener("keyup", (e) => { keys[e.code] = false; });

  let playing = false;
  let yaw = 0, pitch = 0.12;
  const player = { x: 0, y: 0, z: 22, vy: 0 };
  let hp = 100, chakra = 100, collected = 0;
  const orbs = [];

  const npcs = [
    { name: "Sasuke", line: "Hn. Scrolls first, dobe.", x: 8, z: 12, hair: "#111", vest: "#1c2833" },
    { name: "Sakura", line: "Focus your chakra. Check the stalls.", x: -8, z: 12, hair: "#f5b7b1", vest: "#d35400" },
    { name: "Kakashi", line: "See underneath the underneath.", x: 4, z: -28, hair: "#bbb", vest: "#1e8449" },
    { name: "Tsunade", line: "Eight scrolls. Then we talk.", x: 2, z: -40, hair: "#f9e79f", vest: "#1e8449" },
    { name: "Teuchi", line: "Ramen after the mission!", x: -36, z: 24, hair: "#7b5e3b", vest: "#f4f6f7" },
  ];

  const scrolls = [
    [0, -38], [38, 6], [-36, 22], [0, 10], [-46, -16], [28, 16], [-20, 4], [10, -70],
  ].map(([x, z]) => ({ x, z, taken: false }));

  // boxes: [x,y,z, w,h,d, color]
  const boxes = [];
  function box(x, y, z, w, h, d, color) {
    boxes.push({ x, y, z, w, h, d, color });
  }

  // ground is drawn separately
  // cliff
  box(0, 20, -95, 160, 40, 28, "#6b5a48");
  // hokage building
  box(0, 4, -42, 36, 8, 28, "#8d8a84");
  box(0, 11, -42, 32, 6, 24, "#c0392b");
  box(0, 17, -42, 26, 5.5, 20, "#e74c3c");
  box(0, 22, -42, 20, 5, 16, "#c0392b");
  box(0, 26, -42, 22, 3, 18, "#d4a017");

  function house(x, z, w, d, h, wall, roof) {
    box(x, h / 2, z, w, h, d, wall);
    box(x, h + 1.2, z, w + 1.4, 2.2, d + 1.4, roof);
  }
  house(-28, 16, 12, 10, 6, "#e8c96a", "#7b3f11");
  house(-42, 8, 10, 9, 5.2, "#d4a017", "#922b21");
  house(-34, -6, 11, 8, 5.5, "#c9a66b", "#6e2c1f");
  house(-22, 4, 8, 7, 4.6, "#f5e6c8", "#1a5276");
  house(30, 16, 12, 10, 7, "#f5e6c8", "#c0392b");
  house(44, 6, 14, 11, 8, "#b03a2e", "#7b241c");
  house(36, -8, 10, 9, 6, "#eadcc8", "#922b21");
  house(22, 2, 8, 8, 5, "#f8e5b0", "#1a5276");
  house(-38, 22, 10, 8, 4.2, "#f5e6c8", "#c0392b");
  box(-48, 5, -18, 11, 10, 11, "#f5e6c8");
  box(-48, 14, -18, 13, 8, 13, "#2471a3");

  for (let i = 0; i < 6; i++) {
    box(-10 + (i % 3) * 10, 1.1, 8 + Math.floor(i / 3) * 8, 5, 2.2, 4, "#6e4c2a");
  }
  // trees as tall boxes
  for (let i = 0; i < 40; i++) {
    const a = (i / 40) * Math.PI * 2;
    const r = 70 + (i * 17) % 90;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    box(x, 2, z, 1.2, 4, 1.2, "#5a3a22");
    box(x, 6.5, z, 4.2, 4.5, 4.2, "#2e7a32");
  }
  for (let i = 0; i < 16; i++) {
    box(-70 + i * 9, 8, -118, 4, 6, 4, "#2e7a32");
  }
  // faces on cliff (blocks)
  const fx = [-48, -32, -16, 0, 16, 32, 48];
  fx.forEach((x) => {
    box(x, 38, -80, 10, 12, 6, "#c4a882");
    box(x, 45, -80, 11, 2.2, 6.4, "#2f4a32");
  });
  // rail
  box(0, 1.1, 36, 48, 0.3, 0.4, "#c0392b");

  function toast(t) {
    const el = document.getElementById("toast");
    el.textContent = t;
    el.classList.remove("hidden");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.add("hidden"), 1600);
  }

  function talk() {
    const near = npcs.find((n) => Math.hypot(n.x - player.x, n.z - player.z) < 5);
    if (near) toast(near.name + ": " + near.line);
  }

  function fireRasengan() {
    if (!playing || chakra < 14) return;
    chakra -= 14;
    const s = Math.sin(yaw), c = Math.cos(yaw);
    orbs.push({ x: player.x + s * 2, y: 1.4, z: player.z + c * 2, vx: s * 28, vz: c * 28, life: 1.4 });
    toast("Rasengan!");
  }

  document.getElementById("start").onclick = () => {
    document.getElementById("menu").style.display = "none";
    playing = true;
  };

  let dragging = false, lx = 0, ly = 0;
  canvas.addEventListener("pointerdown", (e) => {
    if (!playing) return;
    if (e.target.closest && e.target.closest("#joy, #btns, #menu")) return;
    dragging = true;
    lx = e.clientX;
    ly = e.clientY;
    try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
  });
  canvas.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    yaw -= (e.clientX - lx) * 0.005;
    pitch = Math.max(-0.2, Math.min(0.7, pitch + (e.clientY - ly) * 0.004));
    lx = e.clientX;
    ly = e.clientY;
  });
  canvas.addEventListener("pointerup", () => { dragging = false; });
  addEventListener("keydown", (e) => { if (e.code === "KeyE") talk(); });
  canvas.addEventListener("click", (e) => {
    if (!playing) return;
    if (e.clientX > innerWidth * 0.55) fireRasengan();
  });

  (function mobile() {
    const joy = document.getElementById("joy");
    const knob = document.getElementById("joy-knob");
    if (!joy) return;
    let pid = null;
    function setS(cx, cy, x, y) {
      const dx = x - cx, dy = y - cy;
      const len = Math.hypot(dx, dy) || 1;
      const m = Math.min(48, len);
      stick.x = (dx / len) * (m / 48);
      stick.y = (dy / len) * (m / 48);
      knob.style.transform = `translate(${stick.x * 48}px,${stick.y * 48}px)`;
    }
    joy.addEventListener("pointerdown", (e) => {
      e.stopPropagation();
      pid = e.pointerId;
      joy.setPointerCapture(pid);
      const r = joy.getBoundingClientRect();
      setS(r.left + r.width / 2, r.top + r.height / 2, e.clientX, e.clientY);
    });
    joy.addEventListener("pointermove", (e) => {
      if (e.pointerId !== pid) return;
      const r = joy.getBoundingClientRect();
      setS(r.left + r.width / 2, r.top + r.height / 2, e.clientX, e.clientY);
    });
    const end = () => { pid = null; stick.x = stick.y = 0; knob.style.transform = ""; };
    joy.addEventListener("pointerup", end);
    document.getElementById("btn-jump").onpointerdown = (e) => { e.preventDefault(); keys.Space = true; };
    document.getElementById("btn-jump").onpointerup = () => { keys.Space = false; };
    document.getElementById("btn-rasen").onpointerdown = (e) => { e.preventDefault(); fireRasengan(); };
    document.getElementById("btn-talk").onpointerdown = (e) => { e.preventDefault(); talk(); };
  })();

  function camBasis() {
    const cy = Math.cos(yaw), sy = Math.sin(yaw);
    const cp = Math.cos(pitch), sp = Math.sin(pitch);
    return {
      fx: sy * cp, fy: -sp, fz: cy * cp,
      rx: cy, ry: 0, rz: -sy,
      ux: sy * sp, uy: cp, uz: cy * sp,
    };
  }

  function project(px, py, pz, cam, eye) {
    const dx = px - eye.x, dy = py - eye.y, dz = pz - eye.z;
    const x = dx * cam.rx + dy * cam.ry + dz * cam.rz;
    const y = dx * cam.ux + dy * cam.uy + dz * cam.uz;
    const z = dx * cam.fx + dy * cam.fy + dz * cam.fz;
    if (z < 0.6) return null;
    const f = 1.15 * H() / z;
    return { x: W() / 2 + x * f, y: H() / 2 - y * f, z };
  }

  function shade(hex, k) {
    const n = parseInt(hex.slice(1), 16);
    let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    r = Math.max(0, Math.min(255, r * k));
    g = Math.max(0, Math.min(255, g * k));
    b = Math.max(0, Math.min(255, b * k));
    return `rgb(${r | 0},${g | 0},${b | 0})`;
  }

  const facesBuf = [];

  function addFace(pts, color, zavg) {
    facesBuf.push({ pts, color, z: zavg });
  }

  function boxFaces(b, cam, eye) {
    const hx = b.w / 2, hy = b.h / 2, hz = b.d / 2;
    const c = [
      [b.x - hx, b.y - hy, b.z - hz],
      [b.x + hx, b.y - hy, b.z - hz],
      [b.x + hx, b.y + hy, b.z - hz],
      [b.x - hx, b.y + hy, b.z - hz],
      [b.x - hx, b.y - hy, b.z + hz],
      [b.x + hx, b.y - hy, b.z + hz],
      [b.x + hx, b.y + hy, b.z + hz],
      [b.x - hx, b.y + hy, b.z + hz],
    ].map((p) => project(p[0], p[1], p[2], cam, eye));
    const F = [
      [0, 1, 2, 3, 0.72],
      [5, 4, 7, 6, 1.05],
      [4, 0, 3, 7, 0.82],
      [1, 5, 6, 2, 0.9],
      [3, 2, 6, 7, 1.12],
      [4, 5, 1, 0, 0.55],
    ];
    for (const [a, d, c2, e, sh] of F) {
      const p = [c[a], c[d], c[c2], c[e]];
      if (p.some((q) => !q)) continue;
      const z = (p[0].z + p[1].z + p[2].z + p[3].z) / 4;
      addFace(p, shade(b.color, sh), z);
    }
  }

  function drawPoly(pts, fill) {
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
  }

  function drawChar(x, y, z, hair, vest, cam, eye, label) {
    const p = project(x, y + 1.2, z, cam, eye);
    if (!p) return;
    const s = Math.max(6, 180 / p.z);
    facesBuf.push({
      z: p.z,
      custom: () => {
        ctx.fillStyle = vest;
        ctx.fillRect(p.x - s * 0.35, p.y - s * 0.1, s * 0.7, s * 0.9);
        ctx.fillStyle = "#f1c27d";
        ctx.beginPath();
        ctx.arc(p.x, p.y - s * 0.35, s * 0.32, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = hair;
        ctx.beginPath();
        ctx.arc(p.x, p.y - s * 0.5, s * 0.3, Math.PI, Math.PI * 2);
        ctx.fill();
        if (label) {
          ctx.fillStyle = "#ffe08a";
          ctx.font = `${Math.max(10, s * 0.35)}px Trebuchet MS,sans-serif`;
          ctx.textAlign = "center";
          ctx.fillText(label, p.x, p.y - s * 1.05);
        }
      },
    });
  }

  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;

    if (playing) {
      const speed = keys.ShiftLeft || keys.ShiftRight ? 16 : 9;
      const sy = Math.sin(yaw), cy = Math.cos(yaw);
      let mx = 0, mz = 0;
      if (keys.KeyW) { mx += sy; mz += cy; }
      if (keys.KeyS) { mx -= sy; mz -= cy; }
      if (keys.KeyA) { mx += cy; mz -= sy; }
      if (keys.KeyD) { mx -= cy; mz += sy; }
      mx += -stick.y * sy + -stick.x * cy;
      mz += -stick.y * cy + stick.x * sy;
      const len = Math.hypot(mx, mz);
      if (len > 0.01) {
        player.x += (mx / len) * speed * dt;
        player.z += (mz / len) * speed * dt;
      }
      if (keys.Space && player.y < 0.05) player.vy = 8;
      player.vy -= 22 * dt;
      player.y += player.vy * dt;
      if (player.y < 0) { player.y = 0; player.vy = 0; }
      player.x = Math.max(-140, Math.min(140, player.x));
      player.z = Math.max(-140, Math.min(140, player.z));

      scrolls.forEach((s) => {
        if (s.taken) return;
        if (Math.hypot(s.x - player.x, s.z - player.z) < 2.4) {
          s.taken = true;
          collected++;
          document.getElementById("scrolls").textContent = collected + " / 8";
          toast("Scroll obtained! " + collected + "/8");
          if (collected >= 8) {
            document.getElementById("mission").textContent = "Mission complete! Believe it!";
            toast("MISSION COMPLETE");
          }
        }
      });
      for (let i = orbs.length - 1; i >= 0; i--) {
        const o = orbs[i];
        o.x += o.vx * dt; o.z += o.vz * dt; o.life -= dt;
        if (o.life <= 0) orbs.splice(i, 1);
      }
      chakra = Math.min(100, chakra + dt * 9);
      document.getElementById("hp-bar").style.width = hp + "%";
      document.getElementById("chakra-bar").style.width = chakra + "%";
      const near = npcs.some((n) => Math.hypot(n.x - player.x, n.z - player.z) < 5);
      document.getElementById("interact").classList.toggle("hidden", !near);
    }

    const eye = playing
      ? { x: player.x - Math.sin(yaw) * 8, y: 3.2 + player.y + pitch * 4, z: player.z - Math.cos(yaw) * 8 }
      : { x: Math.sin(now * 0.00012) * 8, y: 16, z: 48 };
    if (!playing) {
      yaw = now * 0.00012;
      pitch = 0.18;
    }
    const cam = camBasis();

    const g = ctx.createLinearGradient(0, 0, 0, H());
    g.addColorStop(0, "#7eb6e8");
    g.addColorStop(0.55, "#b8d4ea");
    g.addColorStop(0.55, "#4a8a3c");
    g.addColorStop(1, "#2d5a28");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W(), H());

    // horizon ground disc via projected circle points
    const groundPts = [];
    for (let i = 0; i < 48; i++) {
      const a = (i / 48) * Math.PI * 2;
      const p = project(Math.cos(a) * 160, 0, Math.sin(a) * 160, cam, eye);
      if (p) groundPts.push(p);
    }
    if (groundPts.length > 3) {
      ctx.beginPath();
      ctx.moveTo(groundPts[0].x, groundPts[0].y);
      groundPts.forEach((p) => ctx.lineTo(p.x, p.y));
      ctx.closePath();
      ctx.fillStyle = "#4f8a3c";
      ctx.fill();
    }

    facesBuf.length = 0;
    for (const b of boxes) boxFaces(b, cam, eye);
    npcs.forEach((n) => drawChar(n.x, 0, n.z, n.hair, n.vest, cam, eye, n.name));
    if (playing) drawChar(player.x, player.y, player.z, "#f4d03f", "#e67e22", cam, eye, "");
    scrolls.forEach((s) => {
      if (s.taken) return;
      const bob = Math.sin(now * 0.004 + s.x) * 0.25;
      const p = project(s.x, 1.2 + bob, s.z, cam, eye);
      if (!p) return;
      facesBuf.push({
        z: p.z,
        custom: () => {
          const r = Math.max(4, 70 / p.z);
          ctx.fillStyle = "#f5cba7";
          ctx.fillRect(p.x - r, p.y - r * 0.4, r * 2, r * 0.8);
          ctx.strokeStyle = "#c0392b";
          ctx.lineWidth = 2;
          ctx.strokeRect(p.x - r, p.y - r * 0.4, r * 2, r * 0.8);
        },
      });
    });
    orbs.forEach((o) => {
      const p = project(o.x, o.y, o.z, cam, eye);
      if (!p) return;
      facesBuf.push({
        z: p.z,
        custom: () => {
          const r = Math.max(4, 90 / p.z);
          ctx.fillStyle = "#4fc3f7";
          ctx.beginPath();
          ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
          ctx.fill();
        },
      });
    });

    facesBuf.sort((a, b) => b.z - a.z);
    for (const f of facesBuf) {
      if (f.custom) f.custom();
      else drawPoly(f.pts, f.color);
    }

    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
