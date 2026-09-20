// ============================================================================
// SHINOBI ARENA — character-select 3D preview (rotatable ninja on pedestal)
// ============================================================================
import * as THREE from 'three';
import { createNinjaMesh, animateNinja, toon } from './characters.js';

export function createPreview(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
  camera.position.set(0, 1.7, 4.4);
  camera.lookAt(0, 1.1, 0);

  scene.add(new THREE.HemisphereLight(0xbfe3ff, 0x3a2c6e, 1.0));
  const key = new THREE.DirectionalLight(0xfff2cc, 1.4);
  key.position.set(3, 6, 4);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x7fd4ff, 0.7);
  rim.position.set(-4, 3, -3);
  scene.add(rim);

  // pedestal
  const ped = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.3, 0.35, 24), toon(0x3d3268));
  ped.position.y = -0.18;
  scene.add(ped);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.15, 0.05, 8, 40),
    new THREE.MeshBasicMaterial({ color: 0xffd23e }));
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.02;
  scene.add(ring);
  const disc = new THREE.Mesh(new THREE.CircleGeometry(3.2, 32),
    new THREE.MeshBasicMaterial({ color: 0x14121f, transparent: true, opacity: 0.55 }));
  disc.rotation.x = -Math.PI / 2;
  disc.position.y = -0.36;
  scene.add(disc);

  let ninja = null;
  let yaw = 0.5;
  let dragging = false;
  let lastX = 0;
  let autoSpin = true;

  canvas.addEventListener('pointerdown', (e) => { dragging = true; lastX = e.clientX; autoSpin = false; canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener('pointermove', (e) => { if (dragging) { yaw += (e.clientX - lastX) * 0.012; lastX = e.clientX; } });
  canvas.addEventListener('pointerup', () => { dragging = false; setTimeout(() => { autoSpin = true; }, 2500); });

  function resize() {
    const r = canvas.getBoundingClientRect();
    if (r.width < 2) return;
    renderer.setSize(r.width, r.height, false);
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    camera.aspect = r.width / r.height;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);

  function setCharacter(charId, characters) {
    const c = characters[charId];
    if (!c) return;
    if (ninja) scene.remove(ninja.root);
    ninja = createNinjaMesh(charId, c.colors);
    ninja.plate.visible = false;
    ninja.setWeapon('kunai');
    scene.add(ninja.root);
    resize();
  }

  let raf = 0;
  let last = performance.now();
  function loop(now) {
    raf = requestAnimationFrame(loop);
    if (!canvas.isConnected || !canvas.clientWidth) return;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (autoSpin && !dragging) yaw += dt * 0.7;
    if (ninja) {
      ninja.root.rotation.y = yaw;
      animateNinja(ninja, { moveSpeed: 0, airborne: false }, dt, now / 1000);
      // idle weapon flourish
      ninja.parts.armR.rotation.x = -0.4 + Math.sin(now / 500) * 0.12;
    }
    ring.rotation.z += dt * 0.6;
    renderer.render(scene, camera);
  }
  raf = requestAnimationFrame(loop);
  resize();

  return {
    setCharacter,
    resize,
    dispose() { cancelAnimationFrame(raf); renderer.dispose(); },
  };
}
