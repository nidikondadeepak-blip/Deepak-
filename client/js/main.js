// ============================================================================
// SHINOBI ARENA — boot, screens, profile, lobby & match orchestration
// ============================================================================
import { net } from './net.js';
import { Game } from './game.js';
import { createPreview } from './preview.js';
import { sfx, setVolume, setMuted, isMuted } from './audio.js';
import {
  showScreen, toast, renderLobby, renderResults, skillIcon, charFaceStyle,
} from './ui.js';

const store = {
  load(k, fb) {
    try { const v = localStorage.getItem('shinobi:' + k); return v ? JSON.parse(v) : fb; }
    catch { return fb; }
  },
  save(k, v) { try { localStorage.setItem('shinobi:' + k, JSON.stringify(v)); } catch { /* noop */ } },
};

const profile = {
  name: store.load('name', 'Genin'),
  char: store.load('char', 'naruto'),
  map: store.load('map', 'konoha'),
  mode: store.load('mode', 'solo'),
  stats: store.load('stats', { matches: 0, wins: 0, kills: 0, xp: 0 }),
};
const settings = Object.assign(
  { sens: 1, vol: 0.6, quality: 'med', invertY: false, shake: true },
  store.load('settings', {}),
);

let CONFIG = null;
let MAPS = [];
let preview = null;
let game = null;
let lastRoom = null;
let inGame = false;
let charIndex = 0;

const $ = (id) => document.getElementById(id);

// ------------------------------------------------------------ bg leaves ---
function startBgLeaves() {
  const c = $('bg-leaves');
  const g = c.getContext('2d');
  let W, H;
  const resize = () => { W = c.width = window.innerWidth; H = c.height = window.innerHeight; };
  resize();
  window.addEventListener('resize', resize);
  const leaves = Array.from({ length: 60 }, () => ({
    x: Math.random(), y: Math.random(), s: 4 + Math.random() * 8,
    v: 0.02 + Math.random() * 0.05, ph: Math.random() * 6,
  }));
  (function loop() {
    requestAnimationFrame(loop);
    if (!$('screen-home').classList.contains('active') &&
        !$('screen-characters').classList.contains('active') &&
        !$('screen-maps').classList.contains('active') &&
        !$('screen-lobby').classList.contains('active') &&
        !$('screen-results').classList.contains('active')) return;
    g.clearRect(0, 0, W, H);
    const t = performance.now() / 1000;
    g.fillStyle = '#7fe07f';
    for (const l of leaves) {
      l.y += l.v / 60;
      if (l.y > 1.05) { l.y = -0.05; l.x = Math.random(); }
      const x = (l.x + Math.sin(t + l.ph) * 0.02) * W;
      const y = l.y * H;
      g.save();
      g.translate(x, y);
      g.rotate(t * 2 + l.ph);
      g.globalAlpha = 0.5;
      g.beginPath();
      g.ellipse(0, 0, l.s, l.s * 0.45, 0, 0, Math.PI * 2);
      g.fill();
      g.restore();
    }
  })();
}

// ---------------------------------------------------------------- profile --
function levelOf(xp) { return 1 + Math.floor(Math.sqrt(xp / 600)); }
function refreshProfile() {
  $('profile-name').value = profile.name;
  $('profile-avatar').textContent = (profile.name || 'N')[0].toUpperCase();
  const c = CONFIG.characters[profile.char];
  $('profile-char').textContent = c ? `${c.name} · ${c.skill.name}` : '';
  const st = profile.stats;
  $('st-matches').textContent = st.matches;
  $('st-wins').textContent = st.wins;
  $('st-kills').textContent = st.kills;
  const lvl = levelOf(st.xp);
  $('st-level').textContent = lvl;
  const cur = (lvl - 1) * (lvl - 1) * 600;
  const next = lvl * lvl * 600;
  $('xp-fill').style.width = `${Math.min(100, ((st.xp - cur) / (next - cur)) * 100)}%`;
}

// --------------------------------------------------------------- characters
function renderCharPage() {
  const order = CONFIG.characterOrder;
  charIndex = Math.max(0, order.indexOf(profile.char));
  const wrap = $('char-cards');
  wrap.innerHTML = '';
  order.forEach((id, i) => {
    const c = CONFIG.characters[id];
    const el = document.createElement('div');
    el.className = 'char-card' + (id === profile.char ? ' selected' : '');
    el.innerHTML = `<div class="face" style="${charFaceStyle(id, CONFIG.characters)}">${c.name[0]}</div>
      <b>${c.name.split(' ')[0]}</b><small>❤ ${c.hp}</small>`;
    el.onclick = () => { sfx.click(); charIndex = i; syncCharPage(); };
    wrap.appendChild(el);
  });
  syncCharPage();
}

function syncCharPage() {
  const order = CONFIG.characterOrder;
  const id = order[(charIndex + order.length) % order.length];
  const c = CONFIG.characters[id];
  document.querySelectorAll('.char-card').forEach((el, i) => {
    el.classList.toggle('selected', order[i] === id);
  });
  $('char-name').textContent = c.name;
  $('char-title').textContent = c.title;
  $('char-quote').textContent = `"${c.quote}"`;
  $('char-desc').textContent = c.desc;
  $('char-hp-fill').style.width = `${(c.hp / 200) * 100}%`;
  $('char-hp-text').textContent = `${c.hp} / 200`;
  const spdPct = Math.round(((c.speed - 5.5) / 2) * 100);
  $('char-speed-fill').style.width = `${Math.max(15, Math.min(100, spdPct))}%`;
  $('char-speed-text').textContent = c.speed.toFixed(1);
  $('char-diff').innerHTML = '●'.repeat(c.difficulty).split('').map(() => '<span style="color:#ff7a1a">●</span>').join('') +
    '<span style="opacity:.3">' + '●'.repeat(3 - c.difficulty) + '</span>';
  $('char-skill-icon').textContent = skillIcon(c.skill.id);
  $('skill-name').textContent = c.skill.name;
  $('skill-desc').textContent = c.skill.desc;
  $('skill-cd').textContent = `⏱ ${c.skill.cooldown}s cooldown`;
  $('skill-chakra').textContent = `🌀 ${c.skill.chakra} chakra`;
  $('btn-select-char').textContent = id === profile.char ? '✓ SELECTED' : `SELECT ${c.name.split(' ')[0].toUpperCase()}`;
  $('btn-select-char').onclick = () => {
    profile.char = id;
    store.save('char', id);
    sfx.click();
    syncCharPage();
    refreshProfile();
    toast(`${c.name} selected!`, true);
  };
  if (preview) preview.setCharacter(id, CONFIG.characters);
}

// -------------------------------------------------------------------- maps
function renderMapPage() {
  const wrap = $('map-cards');
  wrap.innerHTML = '';
  const artClass = { konoha: 'konoha', 'training-grounds': 'training', 'valley-of-the-end': 'valley' };
  const artEmoji = {
    konoha: ['⛰', '🍜', '🏯', '🌳'],
    'training-grounds': ['🌲', '🌲', '🗼', '🌲'],
    'valley-of-the-end': ['🗿', '💧', '🗿', '🌙'],
  };
  for (const m of MAPS) {
    const el = document.createElement('div');
    el.className = 'card map-card' + (m.id === profile.map ? ' selected' : '');
    const layout = m.id === 'valley-of-the-end' ? null : m;
    void layout;
    el.innerHTML = `
      <div class="map-art ${artClass[m.id] || 'konoha'}">
        ${m.available ? '' : '<div class="locked-tag">🔒 SOON</div>'}
        <div class="emoji-row">${(artEmoji[m.id] || ['🗺']).map((e) => `<span>${e}</span>`).join('')}</div>
      </div>
      <div class="map-body">
        <h3>${m.name}</h3>
        <div class="sub">${m.subtitle}</div>
        <p>${mapDesc(m.id)}</p>
        <div class="map-meta"><span>👥 ${m.players}</span><span>📐 ${m.size}</span></div>
        <button class="btn ${m.id === profile.map ? 'btn-secondary' : 'btn-play'}" ${m.available ? '' : 'disabled'}>
          ${!m.available ? 'COMING SOON' : m.id === profile.map ? '✓ SELECTED' : 'SELECT MAP'}
        </button>
      </div>`;
    if (m.available) {
      el.querySelector('button').onclick = () => {
        profile.map = m.id;
        store.save('map', m.id);
        sfx.click();
        renderMapPage();
        refreshHomeMap();
        toast(`${m.name} selected!`, true);
      };
    }
    wrap.appendChild(el);
  }
}

function mapDesc(id) {
  if (id === 'konoha') return 'Rooftop-hop across the Leaf Village — Ichiraku Ramen, the Academy, training grounds and the Hokage Monument.';
  if (id === 'training-grounds') return 'Dense forest arena with giant trees, branch platforms and a river split. Ambush country.';
  return 'The legendary waterfall duel site. Two statues, one rivalry. (Under construction by the Land of Waves.)';
}

function refreshHomeMap() {
  const m = MAPS.find((x) => x.id === profile.map);
  $('home-map-label').textContent = m ? m.name : profile.map;
}

// ------------------------------------------------------------------- match
async function startGameFromRoom(room) {
  if (inGame) return;
  inGame = true;
  $('loading').classList.remove('hidden');
  $('loading-msg').textContent = 'Infiltrating the village…';
  try {
    const res = await fetch(`/api/map/${room.mapId}`);
    if (!res.ok) throw new Error('map failed to load');
    const layout = await res.json();
    lastRoom = room;
    showScreen('game');
    game = new Game($('game-canvas'), {
      config: CONFIG, layout, room, settings,
      onMatchEnd: (result) => finishMatch(result),
      onQuit: () => quitToHome(),
    });
    game.start();
  } catch (err) {
    console.error(err);
    toast('Failed to load the battlefield. Try again!');
    inGame = false;
  } finally {
    $('loading').classList.add('hidden');
  }
}

function finishMatch(result) {
  const me = result.placements.find((p) => p.id === net.id) || { kills: 0, place: 8 };
  const won = result.winner && result.winner.id === net.id;
  const xpGain = me.kills * 120 + Math.max(0, 12 - me.place) * 40 + (won ? 400 : 0);
  profile.stats.matches++;
  profile.stats.kills += me.kills;
  if (won) profile.stats.wins++;
  profile.stats.xp += xpGain;
  store.save('stats', profile.stats);
  refreshProfile();
  if (game) { game.dispose(); game = null; }
  inGame = false;
  document.getElementById('spectate-bar').classList.add('hidden');
  renderResults(result, net.id, CONFIG.characters);
  showScreen('results');
  toast(`+${xpGain} XP`, true);
}

function quitToHome() {
  net.emit('leaveRoom');
  if (game) { game.dispose(); game = null; }
  inGame = false;
  document.getElementById('spectate-bar').classList.add('hidden');
  document.getElementById('pause-menu').classList.add('hidden');
  refreshProfile();
  showScreen('home');
}

// -------------------------------------------------------------------- boot
async function boot() {
  startBgLeaves();
  try {
    $('loading-msg').textContent = 'Loading ninja registry…';
    const [cfg, maps] = await Promise.all([
      fetch('/api/config').then((r) => r.json()),
      fetch('/api/maps').then((r) => r.json()),
    ]);
    CONFIG = cfg;
    MAPS = maps;
  } catch (err) {
    $('loading-msg').textContent = 'Could not reach the server. Is it running? (npm start)';
    console.error(err);
    return;
  }

  // profile + settings UI
  refreshProfile();
  refreshHomeMap();
  setVolume(settings.vol);
  $('set-sens').value = settings.sens;
  $('set-sens-v').textContent = Number(settings.sens).toFixed(1);
  $('set-vol').value = settings.vol;
  $('set-vol-v').textContent = `${Math.round(settings.vol * 100)}%`;
  $('set-quality').value = settings.quality;
  $('set-invertY').checked = settings.invertY;
  $('set-shake').checked = settings.shake;

  $('profile-name').addEventListener('change', (e) => {
    profile.name = e.target.value.trim().slice(0, 16) || 'Genin';
    store.save('name', profile.name);
    refreshProfile();
  });
  const syncMode = () => {
    $('mode-solo').classList.toggle('active', profile.mode === 'solo');
    $('mode-squad').classList.toggle('active', profile.mode === 'squad');
  };
  syncMode();
  $('mode-solo').onclick = () => { profile.mode = 'solo'; store.save('mode', 'solo'); syncMode(); sfx.click(); };
  $('mode-squad').onclick = () => { profile.mode = 'squad'; store.save('mode', 'squad'); syncMode(); sfx.click(); };

  // nav
  $('btn-characters').onclick = () => { sfx.click(); renderCharPage(); showScreen('characters'); preview?.resize(); };
  $('btn-maps').onclick = () => { sfx.click(); renderMapPage(); showScreen('maps'); };
  $('btn-home-maps').onclick = () => { sfx.click(); renderMapPage(); showScreen('maps'); };
  $('btn-char-back').onclick = () => { sfx.click(); showScreen('home'); };
  $('btn-maps-back').onclick = () => { sfx.click(); showScreen('home'); };
  $('char-prev').onclick = () => { sfx.click(); charIndex--; syncCharPage(); };
  $('char-next').onclick = () => { sfx.click(); charIndex++; syncCharPage(); };
  $('btn-howto').onclick = () => { sfx.click(); $('modal-howto').classList.remove('hidden'); };
  $('btn-howto-close').onclick = () => { sfx.click(); $('modal-howto').classList.add('hidden'); };
  $('btn-settings').onclick = () => { sfx.click(); $('modal-settings').classList.remove('hidden'); };
  $('btn-settings-close').onclick = () => { sfx.click(); $('modal-settings').classList.add('hidden'); };
  $('btn-pause-howto').onclick = () => { sfx.click(); $('modal-howto').classList.remove('hidden'); };

  // settings
  $('set-sens').oninput = (e) => { settings.sens = +e.target.value; $('set-sens-v').textContent = settings.sens.toFixed(1); store.save('settings', settings); };
  $('set-vol').oninput = (e) => { settings.vol = +e.target.value; $('set-vol-v').textContent = `${Math.round(settings.vol * 100)}%`; setVolume(settings.vol); store.save('settings', settings); };
  $('set-quality').onchange = (e) => { settings.quality = e.target.value; store.save('settings', settings); toast('Quality applies to the next match'); };
  $('set-invertY').onchange = (e) => { settings.invertY = e.target.checked; store.save('settings', settings); };
  $('set-shake').onchange = (e) => { settings.shake = e.target.checked; store.save('settings', settings); };

  // net
  net.connect();
  net.on('errorMsg', ({ msg }) => toast(msg));
  net.on('room', (room) => {
    lastRoom = room;
    if (room.state === 'lobby') {
      if (!inGame) {
        renderLobby(room, net.id, MAPS, CONFIG.characters);
        showScreen('lobby');
      }
    } else {
      // countdown or playing -> enter the battlefield
      startGameFromRoom(room);
    }
  });
  net.on('leftRoom', () => { /* noop */ });

  // home actions
  $('btn-quickplay').onclick = () => {
    sfx.click();
    profile.name = $('profile-name').value.trim().slice(0, 16) || 'Genin';
    store.save('name', profile.name);
    net.emit('quickPlay', { name: profile.name, characterId: profile.char, mapId: profile.map, mode: profile.mode });
    toast('Finding worthy opponents…', true);
  };
  $('btn-create').onclick = () => {
    sfx.click();
    profile.name = $('profile-name').value.trim().slice(0, 16) || 'Genin';
    net.emit('createRoom', { name: profile.name, characterId: profile.char, mapId: profile.map, mode: profile.mode });
  };
  $('btn-join').onclick = () => {
    sfx.click();
    const code = $('join-code').value.trim().toUpperCase();
    if (!code) return toast('Enter a room code first!');
    profile.name = $('profile-name').value.trim().slice(0, 16) || 'Genin';
    net.emit('joinRoom', { code, name: profile.name, characterId: profile.char });
  };

  // lobby actions
  $('btn-ready').onclick = () => {
    sfx.click();
    const me = lastRoom && lastRoom.players.find((p) => p.id === net.id);
    net.emit('setReady', { ready: !(me && me.ready) });
  };
  $('btn-addbot').onclick = () => { sfx.click(); net.emit('addBot'); };
  $('btn-start').onclick = () => { sfx.click(); net.emit('startMatch'); };
  $('btn-leave').onclick = () => { sfx.click(); quitToHome(); };

  // results actions
  $('btn-again').onclick = () => {
    sfx.click();
    showScreen('home');
    $('btn-quickplay').click();
  };
  $('btn-home').onclick = () => { sfx.click(); quitToHome(); };

  // in-game chrome
  $('mute-btn').onclick = () => {
    setMuted(!isMuted());
    $('mute-btn').textContent = isMuted() ? '🔇' : '🔊';
  };
  $('btn-pause').onclick = () => {
    if (document.pointerLockElement) document.exitPointerLock();
    $('pause-menu').classList.remove('hidden');
  };
  $('btn-resume').onclick = () => {
    sfx.click();
    $('pause-menu').classList.add('hidden');
    if (game && !game.isTouch()) {
      try {
        const p = $('game-canvas').requestPointerLock();
        if (p && p.catch) p.catch(() => toast('Click the battlefield to re-lock aim'));
      } catch { toast('Click the battlefield to re-lock aim'); }
    }
  };
  $('btn-quit').onclick = () => { sfx.click(); quitToHome(); };
  document.addEventListener('pointerlockchange', () => {
    if (inGame && game && !game.matchOver && !document.pointerLockElement && !game.isTouch()) {
      const pm = $('pause-menu');
      if (pm.classList.contains('hidden')) pm.classList.remove('hidden');
    }
  });

  // 3D preview (lazy-init when canvas has size)
  preview = createPreview($('preview-canvas'));
  renderCharPage();

  $('loading').classList.add('hidden');
  showScreen('home');
  console.log('%c🍃 SHINOBI ARENA loaded — believe it!', 'font-size:16px;font-weight:bold');
}

boot();
