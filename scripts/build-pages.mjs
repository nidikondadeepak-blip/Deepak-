// Builds the offline (GitHub Pages) demo into /docs:
//   docs/            <- client/ (index.html, css, js)
//   docs/server/     <- pure sim modules (GameRoom/constants/mapLayout)
//   docs/vendor/...  <- three.module.js + post-processing addons (no CDN needed)
// Structure mirrors the repo so relative imports work unchanged.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DOCS = path.join(ROOT, 'docs');

fs.rmSync(DOCS, { recursive: true, force: true });
fs.mkdirSync(DOCS, { recursive: true });

fs.cpSync(path.join(ROOT, 'client'), DOCS, { recursive: true });

fs.mkdirSync(path.join(DOCS, 'server'), { recursive: true });
for (const f of ['GameRoom.js', 'constants.js', 'mapLayout.js']) {
  fs.copyFileSync(path.join(ROOT, 'server', f), path.join(DOCS, 'server', f));
}

fs.mkdirSync(path.join(DOCS, 'vendor', 'three'), { recursive: true });
fs.copyFileSync(
  path.join(ROOT, 'node_modules', 'three', 'build', 'three.module.js'),
  path.join(DOCS, 'vendor', 'three', 'three.module.js')
);

// post-processing addons (EffectComposer chain) — rewrite bare 'three'
// imports to relative so old WebViews work without an importmap.
const ADDONS = [
  'postprocessing/Pass.js',
  'postprocessing/MaskPass.js',
  'postprocessing/ShaderPass.js',
  'postprocessing/EffectComposer.js',
  'postprocessing/RenderPass.js',
  'postprocessing/UnrealBloomPass.js',
  'postprocessing/OutputPass.js',
  'shaders/CopyShader.js',
  'shaders/LuminosityHighPassShader.js',
  'shaders/OutputShader.js',
  'shaders/VignetteShader.js',
];
for (const rel of ADDONS) {
  const src = fs.readFileSync(
    path.join(ROOT, 'node_modules', 'three', 'examples', 'jsm', rel), 'utf8');
  // VignetteShader has no imports at all — that is fine; just rewrite bare ones.
  const out = src.replace(/from\s+['"]three['"]/g, `from '../../three.module.js'`);
  if (/from\s+['"]three['"]/.test(out)) throw new Error('rewrite failed: ' + rel);
  const dest = path.join(DOCS, 'vendor', 'three', 'addons', rel);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, out);
}

// don't ship the 1.8MB source icon (resized copies are used instead)
fs.rmSync(path.join(DOCS, 'icons', 'icon-src.png'), { force: true });

fs.writeFileSync(path.join(DOCS, '.nojekyll'), '');

// verify
const need = [
  'index.html', 'css/style.css', 'js/main.js', 'js/localnet.js', 'js/game.js',
  'server/GameRoom.js', 'server/constants.js', 'server/mapLayout.js',
  'vendor/three/three.module.js',
  'vendor/three/addons/postprocessing/EffectComposer.js',
  'vendor/three/addons/postprocessing/UnrealBloomPass.js',
  'vendor/three/addons/postprocessing/OutputPass.js',
  'vendor/three/addons/shaders/VignetteShader.js',
  '.nojekyll',
];
for (const f of need) {
  if (!fs.existsSync(path.join(DOCS, f))) throw new Error('missing build output: ' + f);
}
// no bare specifiers anywhere in the shipped bundle
for (const rel of ADDONS) {
  const txt = fs.readFileSync(path.join(DOCS, 'vendor', 'three', 'addons', rel), 'utf8');
  if (/from\s+['"]three['"]/.test(txt)) throw new Error('bare import shipped: ' + rel);
}
console.log(`docs/ built OK (${need.length} files verified)`);
