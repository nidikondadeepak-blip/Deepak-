// ============================================================================
// SHINOBI ARENA — flying projectile meshes (kunai / shuriken / paper-bomb)
// ============================================================================
import * as THREE from '../vendor/three/three.module.js';
import { toon } from './characters.js';

const steel = 0xd5dde8, dark = 0x3a3f4a;

function kunaiMesh() {
  const g = new THREE.Group();
  const blade = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.5, 4), toon(steel));
  blade.rotation.x = Math.PI / 2; // point along +Z
  blade.position.z = 0.18;
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.28, 6), toon(dark));
  handle.rotation.x = Math.PI / 2;
  handle.position.z = -0.2;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.025, 6, 12), toon(dark));
  ring.position.z = -0.4;
  g.add(blade, handle, ring);
  return g;
}

function shurikenMesh() {
  const g = new THREE.Group();
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2;
    const blade = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.3, 4), toon(steel));
    blade.rotation.z = a - Math.PI / 2;
    blade.position.set(Math.cos(a) * 0.14, Math.sin(a) * 0.14, 0);
    blade.scale.z = 0.35;
    g.add(blade);
  }
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.06, 8), toon(dark));
  hub.rotation.x = Math.PI / 2;
  g.add(hub);
  return g;
}

function bombMesh() {
  const g = kunaiMesh();
  const tag = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.4, 0.02),
    new THREE.MeshBasicMaterial({ color: 0xf5ecd8, side: THREE.DoubleSide }));
  tag.position.set(0.2, -0.15, -0.3);
  tag.rotation.z = 0.5;
  g.add(tag);
  const blink = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 8),
    new THREE.MeshBasicMaterial({ color: 0xff3b3b }));
  blink.position.set(0, 0, -0.1);
  g.add(blink);
  g.userData.blink = blink;
  g.userData.tag = tag;
  return g;
}

let glowTex = null;
function getGlowTex() {
  if (glowTex) return glowTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 2, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.4, 'rgba(255,240,200,0.55)');
  grad.addColorStop(1, 'rgba(255,240,200,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  glowTex = new THREE.CanvasTexture(c);
  return glowTex;
}

export function createProjectileMesh(kind) {
  let obj;
  if (kind === 'shuriken') obj = shurikenMesh();
  else if (kind === 'bomb') obj = bombMesh();
  else obj = kunaiMesh();
  obj.userData.kind = kind;
  obj.userData.spin = Math.random() * 10;
  // additive glow + motion stretch so throws read clearly at speed
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: getGlowTex(), color: kind === 'bomb' ? 0xff9a3c : 0xd8f4ff,
    transparent: true, opacity: 0.75, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  glow.scale.setScalar(kind === 'bomb' ? 1.0 : 0.55);
  obj.add(glow);
  if (kind === 'kunai') obj.scale.set(1, 1, 1.6);
  return obj;
}

// orient along travel dir + spin shuriken / flutter tag
const _fwd = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _m = new THREE.Matrix4();
export function updateProjectileMesh(obj, dt, time) {
  const u = obj.userData;
  if (u.vx !== undefined) {
    _fwd.set(u.vx, u.vy || 0, u.vz).normalize();
    _m.lookAt(new THREE.Vector3(), _fwd.clone().negate(), _up);
    obj.quaternion.setFromRotationMatrix(_m);
  }
  if (u.kind === 'shuriken') {
    obj.rotateZ(dt * 30);
  } else if (u.kind === 'bomb') {
    if (u.blink) u.blink.material.color.setHex(Math.sin(time * 25) > 0 ? 0xff3b3b : 0x5a0f0f);
    if (u.tag) u.tag.rotation.y = Math.sin(time * 20) * 0.6;
  }
}
