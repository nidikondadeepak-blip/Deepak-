// Builds the offline (GitHub Pages) demo into /docs:
//   docs/            <- client/ (index.html, css, js)
//   docs/server/     <- pure sim modules (GameRoom/constants/mapLayout)
//   docs/vendor/...  <- three.module.js (no CDN needed)
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

fs.writeFileSync(path.join(DOCS, '.nojekyll'), '');

// verify
const need = [
  'index.html', 'css/style.css', 'js/main.js', 'js/localnet.js', 'js/game.js',
  'server/GameRoom.js', 'server/constants.js', 'server/mapLayout.js',
  'vendor/three/three.module.js', '.nojekyll',
];
for (const f of need) {
  if (!fs.existsSync(path.join(DOCS, f))) throw new Error('missing build output: ' + f);
}
console.log(`docs/ built OK (${need.length} files verified)`);
