// ============================================================================
// SHINOBI ARENA — HUD, minimap, killfeed, lobby/results rendering, toasts
// ============================================================================

export function showScreen(name) {
  document.querySelectorAll('.screen').forEach((s) => s.classList.remove('active'));
  document.getElementById(`screen-${name}`).classList.add('active');
}

export function toast(msg, good = false, ms = 3200) {
  const c = document.getElementById('toast-container');
  const el = document.createElement('div');
  el.className = 'toast' + (good ? ' good' : '');
  el.textContent = msg;
  c.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .4s'; }, ms - 400);
  setTimeout(() => el.remove(), ms);
}

export function announce(text, sub = '', ms = 2600) {
  const a = document.getElementById('announce');
  document.getElementById('announce-text').textContent = text;
  document.getElementById('announce-sub').textContent = sub;
  a.classList.remove('hidden');
  clearTimeout(announce._t);
  announce._t = setTimeout(() => a.classList.add('hidden'), ms);
}

export function addFeed(html, me = false) {
  const kf = document.getElementById('killfeed');
  const el = document.createElement('div');
  el.className = 'feed-item' + (me ? ' me' : '');
  el.innerHTML = html;
  kf.prepend(el);
  while (kf.children.length > 6) kf.lastChild.remove();
  setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .5s'; }, 6000);
  setTimeout(() => el.remove(), 6600);
}

export function clearFeed() {
  document.getElementById('killfeed').innerHTML = '';
}

export function showHitmarker() {
  const h = document.getElementById('hitmarker');
  h.classList.remove('show');
  void h.offsetWidth;
  h.classList.add('show');
}

export function damageFlash(strength = 1) {
  const v = document.getElementById('dmg-vignette');
  v.style.opacity = Math.min(1, 0.35 + strength * 0.4);
  clearTimeout(damageFlash._t);
  damageFlash._t = setTimeout(() => { v.style.opacity = '0'; }, 180);
}

const SKILL_ICON = { rasengan: '🌀', chidori: '⚡', barrage: '🦵', byakugan: '👁', heal: '💚' };
export function skillIcon(id) { return SKILL_ICON[id] || '🌀'; }

const WEAPON_LABEL = { kunai: 'Kunai', shuriken: 'Shuriken ×3', bomb: 'Paper Bomb', 'skill:rasengan': 'Rasengan 🌀', 'skill:chidori': 'Chidori ⚡', 'skill:barrage': 'Barrage 🦵', zone: 'Barrier ⛩' };
export function weaponLabel(w) { return WEAPON_LABEL[w] || w; }

// --- damage numbers (DOM projected from 3D) ---
export function spawnDamageNumber(camera, worldPos, text, cls = '') {
  const v = worldPos.clone();
  v.y += 2.1;
  v.project(camera);
  if (v.z > 1) return;
  const x = (v.x * 0.5 + 0.5) * window.innerWidth;
  const y = (-v.y * 0.5 + 0.5) * window.innerHeight;
  const layer = document.getElementById('dmg-layer');
  const el = document.createElement('div');
  el.className = 'dmg-num ' + cls;
  el.textContent = text;
  el.style.left = `${x + (Math.random() - 0.5) * 40}px`;
  el.style.top = `${y}px`;
  layer.appendChild(el);
  setTimeout(() => el.remove(), 850);
}

// --- HUD per-frame update ---
export function updateHUD(me, snap, mySkillCdMax) {
  const maxHp = 200;
  const fill = document.getElementById('hud-hp-fill');
  fill.style.width = `${Math.max(0, (me.hp / maxHp) * 100)}%`;
  fill.classList.toggle('low', me.hp <= 60);
  document.getElementById('hud-hp-text').textContent = `${Math.max(0, me.hp)} / ${maxHp}`;
  document.getElementById('hud-chakra-fill').style.width = `${Math.max(0, Math.min(100, me.chK))}%`;

  document.querySelectorAll('.wslot').forEach((el) => {
    el.classList.toggle('active', el.dataset.w === me.weapon);
  });

  // skill cooldown sweep
  const cd = me.skillCd || 0;
  const ov = document.getElementById('skill-cd-overlay');
  const slot = document.getElementById('skill-slot');
  if (cd > 0) {
    ov.style.display = 'flex';
    ov.textContent = Math.ceil(cd);
    slot.classList.remove('ready-glow');
  } else {
    ov.style.display = 'none';
    slot.classList.add('ready-glow');
  }

  // buffs
  const buffs = document.getElementById('buffs');
  buffs.innerHTML = me.bya ? `<span class="buff">👁 BYAKUGAN</span>` : '';
  document.getElementById('byakugan-tint').style.opacity = me.bya ? '1' : '0';

  const alive = snap.players.filter((p) => p.alive).length;
  document.getElementById('alive-count').textContent = alive;
  document.getElementById('kills-count').textContent = me.kills || 0;

  const left = snap.left || 0;
  document.getElementById('match-timer').textContent =
    `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;

  const z = snap.zone;
  document.getElementById('zone-label').textContent = z.shrinking ? 'Barrier shrinking!' : 'Barrier shrinks in';
  document.getElementById('zone-timer').textContent = z.timer;
  document.getElementById('zone-pill').classList.toggle('danger', z.shrinking || z.timer <= 10);
}

// --- minimap ---
export function drawMinimap(canvas, layout, snap, myId, mode) {
  const g = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  const half = layout.size / 2;
  const px = (x) => ((x + half) / layout.size) * W;
  const pz = (z) => ((z + half) / layout.size) * H;
  const pr = (r) => (r / layout.size) * W;

  g.clearRect(0, 0, W, H);
  g.fillStyle = '#1d2b1a';
  g.fillRect(0, 0, W, H);
  // buildings
  g.fillStyle = '#5a6b7a';
  for (const c of layout.colliders) {
    if (c.y1 < 3) continue;
    g.fillRect(px(c.x - c.w / 2), pz(c.z - c.d / 2), Math.max(2, pr(c.w)), Math.max(2, pr(c.d)));
  }
  // zone
  g.strokeStyle = 'rgba(255,60,60,.9)';
  g.lineWidth = 2;
  g.beginPath();
  g.arc(px(snap.zone.x), pz(snap.zone.z), pr(snap.zone.r), 0, Math.PI * 2);
  g.stroke();
  // ramen
  g.fillStyle = '#ffb02e';
  snap.pickups.forEach((on, i) => {
    if (!on) return;
    const p = layout.pickups[i];
    g.fillRect(px(p.x) - 1.5, pz(p.z) - 1.5, 3, 3);
  });
  // players
  const me = snap.players.find((p) => p.id === myId);
  for (const p of snap.players) {
    if (!p.alive) continue;
    const isMe = p.id === myId;
    const ally = mode === 'squad' && me && p.team === me.team;
    g.fillStyle = isMe ? '#ffd23e' : ally ? '#37e05a' : (me && me.bya ? '#ff5ad8' : '#ff3b3b');
    const s = isMe ? 5 : 3.5;
    // enemies only shown if byakugan active (or always show count? show enemies — arcade style)
    if (!isMe && !ally && !(me && me.bya)) {
      // still show a faint blip if very close (footsteps!)
      const d = me ? Math.hypot(p.x - me.x, p.z - me.z) : 999;
      if (d > 18) continue;
      g.fillStyle = 'rgba(255,90,90,.55)';
    }
    g.beginPath();
    g.arc(px(p.x), pz(p.z), s, 0, Math.PI * 2);
    g.fill();
    if (isMe) {
      g.strokeStyle = '#fff'; g.lineWidth = 1.5;
      g.beginPath();
      g.moveTo(px(p.x), pz(p.z));
      g.lineTo(px(p.x) - Math.sin(p.yaw) * 10, pz(p.z) - Math.cos(p.yaw) * 10);
      g.stroke();
    }
  }
}

// --- lobby ---
export function charFaceStyle(charId, characters) {
  const c = characters[charId];
  if (!c) return '';
  const hex = (n) => `#${n.toString(16).padStart(6, '0')}`;
  return `background: linear-gradient(135deg, ${hex(c.colors.hair)}, ${hex(c.colors.outfit)});`;
}

export function renderLobby(room, myId, maps, characters) {
  document.getElementById('lobby-code').textContent = room.code;
  const map = maps.find((m) => m.id === room.mapId);
  document.getElementById('lobby-map').textContent = map ? map.name : room.mapId;
  document.getElementById('lobby-mode').textContent = room.mode.toUpperCase();
  document.getElementById('lobby-count').textContent = room.players.length;

  const list = document.getElementById('lobby-players');
  list.innerHTML = '';
  for (const p of room.players) {
    const c = characters[p.characterId];
    const el = document.createElement('div');
    el.className = 'lobby-player';
    el.innerHTML = `
      <div class="face" style="${charFaceStyle(p.characterId, characters)}">${(c ? c.name : '?')[0]}</div>
      <div class="nm">${escapeHtml(p.name)} ${p.id === room.hostId ? '<span class="host-tag">HOST</span>' : ''} ${p.isBot ? '<span class="host-tag">BOT</span>' : ''}
        <small>${c ? c.name : ''} · ${c ? c.skill.name : ''}${room.mode === 'squad' ? ` · Team ${p.team + 1}` : ''}</small>
      </div>
      <div class="rdy ${p.ready ? 'on' : ''}">${p.ready ? 'READY' : '…'}</div>`;
    list.appendChild(el);
  }
  const me = room.players.find((p) => p.id === myId);
  const isHost = room.hostId === myId;
  document.getElementById('btn-ready').classList.toggle('ready', !!(me && me.ready));
  document.getElementById('btn-ready').textContent = me && me.ready ? '✓ Ready!' : '✓ Ready';
  document.getElementById('btn-start').style.display = isHost ? '' : 'none';
  document.getElementById('btn-addbot').style.display = isHost ? '' : 'none';

  const cd = document.getElementById('lobby-countdown');
  if (room.state === 'countdown') {
    cd.classList.remove('hidden');
    cd.textContent = room.countdown;
  } else {
    cd.classList.add('hidden');
  }
  document.getElementById('lobby-hint').textContent =
    room.state === 'countdown' ? 'Battle starting — get ready!' :
    isHost ? 'Share the code with friends, add bots, then START.' :
    'Waiting for the host to start… (tip: press Ready!)';
}

// --- results ---
export function renderResults(result, myId, characters) {
  const won = result.winner && result.winner.id === myId;
  const title = document.getElementById('results-title');
  title.textContent = won ? '🏆 VICTORY!' : result.winner ? `🏆 ${result.winner.name} WINS!` : 'DRAW!';
  title.className = won ? 'win' : 'lose';
  const reason = { 'last-standing': 'Last ninja standing', 'team-wipe': 'Last squad standing', timeout: 'Time up — ranked by performance', draw: 'Mutual destruction!' }[result.reason] || result.reason;
  document.getElementById('results-sub').textContent = `${reason} · ${result.placements.length} combatants`;
  const tb = document.querySelector('#results-table tbody');
  tb.innerHTML = '';
  const medal = ['🥇', '🥈', '🥉'];
  for (const p of result.placements) {
    const c = characters[p.characterId];
    const tr = document.createElement('tr');
    if (p.id === myId) tr.className = 'me';
    tr.innerHTML = `<td>${medal[p.place - 1] || p.place}</td>
      <td>${escapeHtml(p.name)}${p.isBot ? ' 🤖' : ''}</td>
      <td>${c ? c.name : ''}</td><td>${p.kills}</td><td>${p.damage}</td><td>${p.healed}</td>`;
    tb.appendChild(tr);
  }
}

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}
