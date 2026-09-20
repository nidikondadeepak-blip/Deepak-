// ============================================================================
// SHINOBI ARENA — particle system + jutsu effects (Rasengan, Chidori, heals…)
// ============================================================================
import * as THREE from '../vendor/three/three.module.js';

const MAX_PARTICLES = 1600;

export class FXSystem {
  constructor(scene) {
    this.scene = scene;
    this.n = 0;
    this.pos = new Float32Array(MAX_PARTICLES * 3);
    this.vel = new Float32Array(MAX_PARTICLES * 3);
    this.life = new Float32Array(MAX_PARTICLES);
    this.maxLife = new Float32Array(MAX_PARTICLES);
    this.grav = new Float32Array(MAX_PARTICLES);
    this.col = new Float32Array(MAX_PARTICLES * 3);
    this.size = new Float32Array(MAX_PARTICLES);
    this.head = 0;

    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    this.geo = g;
    this.points = new THREE.Points(g, new THREE.PointsMaterial({
      size: 0.45, vertexColors: true, transparent: true, opacity: 0.95,
      depthWrite: false, sizeAttenuation: true,
    }));
    this.points.frustumCulled = false;
    scene.add(this.points);

    // reusable flash light (explosions / rasengan / chidori)
    this.flash = new THREE.PointLight(0xffaa33, 0, 30, 1.8);
    scene.add(this.flash);
    this.flashI = 0;

    // temporary attached objects {obj, until, tick}
    this.temp = [];
    this.time = 0;
  }

  spawn(x, y, z, vx, vy, vz, life, r, g, b, grav = 9) {
    const i = this.head;
    this.head = (this.head + 1) % MAX_PARTICLES;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    this.life[i] = life; this.maxLife[i] = life;
    this.col[i * 3] = r; this.col[i * 3 + 1] = g; this.col[i * 3 + 2] = b;
    this.grav[i] = grav;
  }

  burst(p, { count = 20, color = [1, 0.6, 0.2], speed = 8, life = 0.7, grav = 9, up = 3 } = {}) {
    const [r, g, b] = color;
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const e = (Math.random() - 0.3) * Math.PI;
      const s = speed * (0.4 + Math.random() * 0.8);
      this.spawn(p.x, p.y, p.z,
        Math.cos(a) * Math.cos(e) * s, Math.sin(e) * s + up, Math.sin(a) * Math.cos(e) * s,
        life * (0.6 + Math.random() * 0.7), r, g, b, grav);
    }
  }

  flashAt(p, color = 0xffaa33, intensity = 60) {
    this.flash.position.copy(p);
    this.flash.color.setHex(color);
    this.flashI = intensity;
  }

  explosion(p, r = 5.5) {
    this.burst(p, { count: 60, color: [1, 0.55, 0.15], speed: 14, life: 0.9 });
    this.burst(p, { count: 30, color: [1, 0.9, 0.5], speed: 7, life: 0.5, up: 6 });
    this.burst(p, { count: 25, color: [0.35, 0.32, 0.3], speed: 5, life: 1.4, grav: -1, up: 5 });
    this.flashAt(p, 0xff7733, 90);
    this.shockRing(p, 0xffaa33, r);
  }

  hitSpark(p) {
    this.burst(p, { count: 12, color: [1, 0.95, 0.6], speed: 7, life: 0.4, grav: 4 });
  }

  bloodPuff(p) { // stylized "impact stars" — anime, not gore
    this.burst(p, { count: 10, color: [1, 0.3, 0.3], speed: 5, life: 0.5 });
  }

  landPuff(p) {
    this.burst(p, { count: 8, color: [0.8, 0.75, 0.65], speed: 3, life: 0.5, up: 1.5 });
  }

  throwPuff(p) {
    this.burst(p, { count: 5, color: [0.9, 0.9, 1], speed: 2, life: 0.3, up: 1 });
  }

  shockRing(p, color = 0xffffff, maxR = 6, dur = 0.45) {
    const m = new THREE.Mesh(
      new THREE.TorusGeometry(1, 0.12, 8, 40),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, depthWrite: false }));
    m.rotation.x = Math.PI / 2;
    m.position.copy(p); m.position.y += 0.3;
    this.scene.add(m);
    const t0 = this.time;
    this.temp.push({
      obj: m, until: t0 + dur,
      tick: (t) => {
        const k = (t - t0) / dur;
        m.scale.setScalar(0.5 + k * maxR);
        m.material.opacity = 0.9 * (1 - k);
      },
    });
  }

  // --- RASENGAN: swirling chakra sphere gripped in the hand ---
  rasengan(hand) {
    const g = new THREE.Group();
    const core = new THREE.Mesh(new THREE.SphereGeometry(0.28, 14, 12),
      new THREE.MeshBasicMaterial({ color: 0xeaf6ff, transparent: true, opacity: 0.95 }));
    const mid = new THREE.Mesh(new THREE.SphereGeometry(0.45, 14, 12),
      new THREE.MeshBasicMaterial({ color: 0x35b6ff, transparent: true, opacity: 0.55, depthWrite: false }));
    const outer = new THREE.Mesh(new THREE.SphereGeometry(0.62, 14, 12),
      new THREE.MeshBasicMaterial({ color: 0x9fdcff, transparent: true, opacity: 0.3, depthWrite: false, side: THREE.DoubleSide }));
    const orbiters = [];
    for (let i = 0; i < 8; i++) {
      const o = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 6),
        new THREE.MeshBasicMaterial({ color: 0xd8f4ff }));
      orbiters.push(o); g.add(o);
    }
    g.add(core, mid, outer);
    const wp = new THREE.Vector3();
    hand.getWorldPosition(wp);
    g.position.copy(wp);
    this.scene.add(g);
    const t0 = this.time, dur = 0.9;
    const center = wp.clone();
    this.flashAt(center, 0x35b6ff, 70);
    this.temp.push({
      obj: g, until: t0 + dur,
      tick: (t, dt) => {
        const k = (t - t0) / dur;
        g.rotation.y += dt * 25; g.rotation.x += dt * 13;
        orbiters.forEach((o, i) => {
          const a = t * 14 + (i / orbiters.length) * Math.PI * 2;
          o.position.set(Math.cos(a) * 0.55, Math.sin(t * 11 + i) * 0.3, Math.sin(a) * 0.55);
        });
        const s = 1 + Math.sin(k * Math.PI) * 0.35;
        g.scale.setScalar(s);
        mid.material.opacity = 0.55 * (1 - k * 0.7);
        if (Math.random() < 0.6) this.burst(center, { count: 2, color: [0.4, 0.75, 1], speed: 4, life: 0.4, grav: 0 });
      },
    });
    this.shockRing(center, 0x35b6ff, 4.5);
  }

  // --- CHIDORI: crackling lightning around the hand + body ---
  chidori(ninja, dur = 0.5) {
    const g = new THREE.Group();
    const mat = new THREE.LineBasicMaterial({ color: 0x9fdcff, transparent: true, opacity: 1 });
    const bolts = [];
    for (let i = 0; i < 7; i++) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6 * 3), 3));
      const line = new THREE.Line(geo, mat);
      line.frustumCulled = false;
      bolts.push(line); g.add(line);
    }
    this.scene.add(g);
    const t0 = this.time;
    let rejitter = 0;
    this.temp.push({
      obj: g, until: t0 + dur,
      tick: (t, dt) => {
        const root = ninja.root.position;
        g.position.set(root.x, root.y + 1.3, root.z);
        rejitter -= dt;
        if (rejitter <= 0) {
          rejitter = 0.05;
          for (const line of bolts) {
            const p = line.geometry.attributes.position.array;
            let x = 0, y = 0.6, z = 0;
            for (let s = 0; s < 6; s++) {
              p[s * 3] = x; p[s * 3 + 1] = y; p[s * 3 + 2] = z;
              x += (Math.random() - 0.5) * 1.6;
              y -= 0.35 + Math.random() * 0.3;
              z += (Math.random() - 0.5) * 1.6;
            }
            line.geometry.attributes.position.needsUpdate = true;
          }
        }
        // spark particles + light flicker
        const wp = new THREE.Vector3(root.x, root.y + 1.3, root.z);
        this.burst(wp, { count: 3, color: [0.6, 0.85, 1], speed: 6, life: 0.3, grav: 2 });
        this.flashAt(wp, 0x7fd4ff, 50);
        mat.opacity = 1 - (t - t0) / dur;
      },
    });
  }

  // --- LEE barrage: afterimage rings + kick impact stars ---
  barrageKick(p) {
    this.burst(p, { count: 16, color: [1, 0.85, 0.3], speed: 9, life: 0.45 });
    this.shockRing(p, 0xffd23e, 2.5, 0.3);
  }

  // --- BYAKUGAN: white shockwave + veins flash ---
  byakugan(ninja) {
    const p = ninja.root.position.clone();
    p.y += 1.2;
    this.shockRing(p, 0xeaf6ff, 5, 0.6);
    this.burst(p, { count: 30, color: [0.92, 0.96, 1], speed: 6, life: 0.7, grav: 1 });
    this.flashAt(p, 0xd8f4ff, 50);
  }

  // --- SAKURA heal: rising green crosses for a duration ---
  heal(ninja, dur = 3) {
    const t0 = this.time;
    const marker = new THREE.Group();
    this.scene.add(marker);
    this.temp.push({
      obj: marker, until: t0 + dur,
      tick: (t) => {
        const r = ninja.root.position;
        if (Math.random() < 0.8) {
          this.spawn(r.x + (Math.random() - 0.5) * 1.4, r.y + 0.2, r.z + (Math.random() - 0.5) * 1.4,
            0, 2.5 + Math.random(), 0, 1.1, 0.25, 1, 0.45, -1);
        }
      },
    });
    const p = ninja.root.position.clone(); p.y += 1;
    this.shockRing(p, 0x37e05a, 3.5);
  }

  // --- death poof (classic log-substitution smoke!) ---
  deathPoof(p) {
    this.burst(p, { count: 40, color: [0.85, 0.82, 0.78], speed: 5, life: 1.1, grav: 0.5, up: 3 });
  }

  // --- spawn protection shimmer ---
  spawnShield(ninja, dur = 2) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(1.2, 14, 12),
      new THREE.MeshBasicMaterial({ color: 0xffd23e, transparent: true, opacity: 0.25, depthWrite: false }));
    this.scene.add(m);
    const t0 = this.time;
    this.temp.push({
      obj: m, until: t0 + dur,
      tick: (t) => {
        const r = ninja.root.position;
        m.position.set(r.x, r.y + 1, r.z);
        m.material.opacity = 0.25 * (1 - (t - t0) / dur);
      },
    });
  }

  update(dt, time) {
    this.time = time;
    // particles
    const { pos, vel, life, grav } = this;
    for (let i = 0; i < MAX_PARTICLES; i++) {
      if (life[i] <= 0) continue;
      life[i] -= dt;
      if (life[i] <= 0) { pos[i * 3 + 1] = -1000; continue; }
      vel[i * 3 + 1] -= grav[i] * dt;
      pos[i * 3] += vel[i * 3] * dt;
      pos[i * 3 + 1] += vel[i * 3 + 1] * dt;
      pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
      if (pos[i * 3 + 1] < 0.05 && vel[i * 3 + 1] < 0) {
        vel[i * 3 + 1] *= -0.4;
        pos[i * 3 + 1] = 0.05;
      }
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.color.needsUpdate = true;
    // flash decay
    this.flashI = Math.max(0, this.flashI - dt * 320);
    this.flash.intensity = this.flashI;
    // temp objects
    for (let i = this.temp.length - 1; i >= 0; i--) {
      const t = this.temp[i];
      if (time >= t.until) {
        this.scene.remove(t.obj);
        this.temp.splice(i, 1);
      } else {
        t.tick(time, dt);
      }
    }
  }

  dispose() {
    this.scene.remove(this.points, this.flash);
    for (const t of this.temp) this.scene.remove(t.obj);
    this.temp = [];
  }
}
