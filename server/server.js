// ============================================================================
// SHINOBI ARENA — server entry: static client + REST config + Socket.IO net.
// ============================================================================
import express from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { Server } from 'socket.io';
import { TICK_RATE, TICK_DT, MAX_PLAYERS, QUICKPLAY_SIZE, getConfigPayload } from './constants.js';
import { getMapLayout, listMaps } from './mapLayout.js';
import { GameRoom } from './GameRoom.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const PORT = process.env.PORT || 3000;

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' },
  maxHttpBufferSize: 1e6,
});

// --- static client + vendored three.js (no CDN needed) ---
app.use(express.static(path.join(ROOT, 'client')));
app.use('/vendor/three', express.static(path.join(ROOT, 'node_modules', 'three', 'build')));
// pure-sim modules (constants/mapLayout/GameRoom) are importable by the
// browser too, powering the offline demo + shared tuning
app.use('/server', express.static(path.join(ROOT, 'server'), { index: false }));

// --- config APIs: single source of truth for tuning / maps ---
app.get('/api/config', (_req, res) => res.json(getConfigPayload()));
app.get('/api/maps', (_req, res) => res.json(listMaps()));
app.get('/api/map/:id', (req, res) => {
  const layout = getMapLayout(req.params.id);
  if (!layout) return res.status(404).json({ error: 'unknown map' });
  res.json(layout);
});
app.get('/api/rooms', (_req, res) => {
  res.json([...rooms.values()]
    .filter((r) => r.state === 'lobby')
    .map((r) => ({ code: r.code, mapId: r.mapId, mode: r.mode, players: r.players.size, max: MAX_PLAYERS })));
});

// ------------------------------------------------------------------ rooms --
const rooms = new Map();       // code -> GameRoom
const playerRoom = new Map();  // socketId -> code

function makeCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code;
  do {
    code = Array.from({ length: 5 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  } while (rooms.has(code));
  return code;
}

function broadcastLobby(room) {
  const state = room.lobbyState();
  for (const id of room.sockets.keys()) io.to(id).emit('room', state);
}

function startLoop(room) {
  if (room._loop) return;
  let last = Date.now();
  let acc = 0;
  room._loop = setInterval(() => {
    const now = Date.now();
    acc += Math.min(0.5, (now - last) / 1000); // clamp huge gaps (sleep/hibernate)
    last = now;
    while (acc >= TICK_DT) {
      acc -= TICK_DT;
      try {
        room.update();
      } catch (err) {
        console.error(`[room ${room.code}] tick error:`, err);
      }
    }
    // 20Hz snapshots while playing; lobby/countdown updates at ~4Hz
    if (room.state === 'playing') {
      const snap = room.snapshot();
      for (const id of room.sockets.keys()) io.to(id).emit('snapshot', snap);
      if (room.state === 'ended') {
        for (const id of room.sockets.keys()) io.to(id).emit('matchEnd', room.result);
      }
    } else if (room.state === 'ended') {
      // ended already announced; keep room briefly for results screen
    } else {
      if (!room._lobbyTick) room._lobbyTick = 0;
      if (++room._lobbyTick % 5 === 0) broadcastLobby(room);
    }
  }, 1000 / TICK_RATE);
}

function stopLoop(room) {
  if (room._loop) { clearInterval(room._loop); room._loop = null; }
}

function cleanupRoomIfEmpty(room) {
  const humans = room.humans();
  if (humans.length === 0) {
    stopLoop(room);
    rooms.delete(room.code);
    console.log(`[room ${room.code}] closed (empty)`);
  }
}

// ---------------------------------------------------------------- sockets --
io.on('connection', (socket) => {
  console.log(`[+] ${socket.id} connected`);
  socket.emit('welcome', { id: socket.id });

  const myRoom = () => {
    const code = playerRoom.get(socket.id);
    return code ? rooms.get(code) : null;
  };
  const leaveCurrent = () => {
    const room = myRoom();
    if (!room) return;
    playerRoom.delete(socket.id);
    room.removePlayer(socket.id);
    broadcastLobby(room);
    if (room.state === 'playing') {
      // leaver's ninja falls in battle (no reconnect scope in v1)
      const leaver = room.players.get(socket.id);
      void leaver;
    }
    cleanupRoomIfEmpty(room);
  };

  socket.on('quickPlay', ({ name, characterId, mapId, mode } = {}) => {
    leaveCurrent();
    const layout = getMapLayout(mapId) ? mapId : 'konoha';
    const m = mode === 'squad' ? 'squad' : 'solo';
    // find a lobby waiting on the same map+mode
    let room = [...rooms.values()].find((r) =>
      r.state === 'lobby' && r.mapId === layout && r.mode === m &&
      r.players.size < MAX_PLAYERS && !r._quickLocked);
    if (!room) {
      room = new GameRoom(makeCode(), { mapId: layout, mode: m, hostId: socket.id });
      room._quickLocked = true; // quickplay rooms auto-start, not joinable by code
      rooms.set(room.code, room);
      startLoop(room);
    }
    room.addPlayer(socket.id, name || 'Ninja', characterId, false, socket);
    playerRoom.set(socket.id, room.code);
    broadcastLobby(room);
    // auto-fill with bots & start the countdown
    room.fillWithBots(Math.max(QUICKPLAY_SIZE, room.players.size));
    broadcastLobby(room);
    if (room.startCountdown()) {
      io.to(socket.id).emit('room', room.lobbyState());
    }
  });

  socket.on('createRoom', ({ name, characterId, mapId, mode } = {}) => {
    leaveCurrent();
    const layout = getMapLayout(mapId) ? mapId : 'konoha';
    const room = new GameRoom(makeCode(), {
      mapId: layout, mode: mode === 'squad' ? 'squad' : 'solo', hostId: socket.id,
    });
    rooms.set(room.code, room);
    startLoop(room);
    room.addPlayer(socket.id, name || 'Ninja', characterId, false, socket);
    playerRoom.set(socket.id, room.code);
    socket.emit('room', room.lobbyState());
    console.log(`[room ${room.code}] created (${layout}/${room.mode}) by ${socket.id}`);
  });

  socket.on('joinRoom', ({ code, name, characterId } = {}) => {
    leaveCurrent();
    const room = rooms.get(String(code || '').toUpperCase());
    if (!room) return socket.emit('errorMsg', { msg: 'Room not found. Check the code!' });
    if (room.state !== 'lobby') return socket.emit('errorMsg', { msg: 'Match already started!' });
    if (room.players.size >= MAX_PLAYERS) return socket.emit('errorMsg', { msg: 'Room is full!' });
    room.addPlayer(socket.id, name || 'Ninja', characterId, false, socket);
    playerRoom.set(socket.id, room.code);
    broadcastLobby(room);
  });

  socket.on('leaveRoom', () => { leaveCurrent(); socket.emit('leftRoom'); });

  socket.on('setCharacter', ({ characterId } = {}) => {
    const room = myRoom();
    const p = room && room.players.get(socket.id);
    if (!p || room.state !== 'lobby') return;
    p.characterId = characterId;
    broadcastLobby(room);
  });

  socket.on('setReady', ({ ready } = {}) => {
    const room = myRoom();
    const p = room && room.players.get(socket.id);
    if (!p || room.state !== 'lobby') return;
    p.ready = !!ready;
    broadcastLobby(room);
  });

  socket.on('addBot', () => {
    const room = myRoom();
    if (!room || room.hostId !== socket.id || room.state !== 'lobby') return;
    if (room.players.size >= MAX_PLAYERS) return;
    room.fillWithBots(room.players.size + 1);
    broadcastLobby(room);
  });

  socket.on('startMatch', () => {
    const room = myRoom();
    if (!room || room.hostId !== socket.id) return;
    if (room.players.size < 2) {
      // solo host: fill with bots so the match can start
      room.fillWithBots(QUICKPLAY_SIZE);
    }
    if (!room.startCountdown()) {
      return socket.emit('errorMsg', { msg: 'Need at least 2 ninjas to start!' });
    }
    broadcastLobby(room);
  });

  socket.on('input', (inp = {}) => {
    const room = myRoom();
    const p = room && room.players.get(socket.id);
    if (!p || room.state !== 'playing' || !p.alive) return;
    p.input.mx = Math.max(-1, Math.min(1, +inp.mx || 0));
    p.input.mz = Math.max(-1, Math.min(1, +inp.mz || 0));
    p.input.yaw = +inp.yaw || 0;
    p.input.pitch = +inp.pitch || 0;
    p.input.sprint = !!inp.sprint;
    if (inp.jump) p.input.jump = true;
  });

  socket.on('fire', ({ yaw, pitch, weapon } = {}) => {
    const room = myRoom();
    const p = room && room.players.get(socket.id);
    if (!p || room.state !== 'playing') return;
    room.fire(p, +yaw || 0, +pitch || 0, weapon);
  });

  socket.on('useSkill', ({ yaw, pitch } = {}) => {
    const room = myRoom();
    const p = room && room.players.get(socket.id);
    if (!p || room.state !== 'playing') return;
    room.useSkill(p, +yaw || 0, +pitch || 0);
  });

  socket.on('pingC', ({ t } = {}) => socket.emit('pongS', { t, now: Date.now() }));

  socket.on('disconnect', () => {
    console.log(`[-] ${socket.id} disconnected`);
    const room = myRoom();
    if (room) {
      const p = room.players.get(socket.id);
      if (p && room.state === 'playing' && p.alive) {
        // disconnected ninja is eliminated (prevents AFK winners)
        room.damage(p, null, 99999, 'disconnect');
      }
      leaveCurrent();
    }
  });
});

// --------------------------------------------------------------- boot -----
server.listen(PORT, '0.0.0.0', () => {
  console.log(`
   ▄███████ shinobi arena ▄███████
   Naruto-universe 3D battle royale — http://localhost:${PORT}
   tick: ${TICK_RATE}Hz | max/room: ${MAX_PLAYERS} | HP: 200 | weapons: kunai/shuriken/paper-bombs ONLY
  `);
});
