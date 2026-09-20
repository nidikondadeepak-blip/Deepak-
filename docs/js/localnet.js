// ============================================================================
// SHINOBI ARENA — LocalNet: offline backend with the SAME interface as the
// socket backend. Runs the real authoritative GameRoom simulation locally
// (you vs 7 bot ninjas), emitting identical 'room' / 'snapshot' / 'matchEnd'
// events. Zero DOM usage — safe to import anywhere (even node for tests).
// ============================================================================
import { GameRoom } from '../../server/GameRoom.js';
import { getMapLayout } from '../../server/mapLayout.js';
import { QUICKPLAY_SIZE } from '../../server/constants.js';

function makeCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 5 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

export class LocalNet {
  constructor() {
    this.id = 'you';
    this.handlers = {};
    this.room = null;
    this._loop = null;
    this._roomTimer = null;
    this._last = 0;
    this._acc = 0;
  }

  connect() {
    // async welcome, mirroring the socket handshake
    setTimeout(() => this._fire('welcome', { id: this.id }), 0);
    return this;
  }

  on(ev, fn) {
    (this.handlers[ev] ||= []).push(fn);
  }

  off(ev, fn) {
    if (this.handlers[ev]) this.handlers[ev] = this.handlers[ev].filter((f) => f !== fn);
  }

  _fire(ev, data) {
    for (const fn of this.handlers[ev] || []) {
      try { fn(data); } catch (err) { console.error('[localnet]', ev, err); }
    }
  }

  emit(ev, data = {}) {
    switch (ev) {
      case 'quickPlay': this._quickPlay(data); break;
      case 'createRoom':
      case 'joinRoom':
        this._fire('errorMsg', { msg: 'Offline demo: quick battle only! (Run `npm start` for online rooms.)' });
        break;
      case 'leaveRoom': this._stop(); this._fire('leftRoom'); break;
      case 'startMatch': this._fire('errorMsg', { msg: 'Offline demo: quick battle only!' }); break;
      case 'setReady': case 'setCharacter': case 'addBot': break; // no-op offline
      case 'input': {
        const p = this.room && this.room.players.get(this.id);
        if (!p || this.room.state !== 'playing') break;
        p.input.mx = Math.max(-1, Math.min(1, +data.mx || 0));
        p.input.mz = Math.max(-1, Math.min(1, +data.mz || 0));
        p.input.yaw = +data.yaw || 0;
        p.input.pitch = +data.pitch || 0;
        p.input.sprint = !!data.sprint;
        if (data.jump) p.input.jump = true;
        break;
      }
      case 'fire': {
        const p = this.room && this.room.players.get(this.id);
        if (p && this.room.state === 'playing') this.room.fire(p, +data.yaw || 0, +data.pitch || 0, data.weapon);
        break;
      }
      case 'useSkill': {
        const p = this.room && this.room.players.get(this.id);
        if (p && this.room.state === 'playing') this.room.useSkill(p, +data.yaw || 0, +data.pitch || 0);
        break;
      }
      case 'pingC': break;
      default: break;
    }
  }

  _quickPlay({ name, characterId, mapId, mode }) {
    this._stop();
    const m = mode === 'squad' ? 'squad' : 'solo';
    const layoutId = getMapLayout(mapId) ? mapId : 'konoha';
    this.room = new GameRoom('LOCAL' + makeCode().slice(0, 2), { mapId: layoutId, mode: m, hostId: this.id });
    this.room.addPlayer(this.id, name || 'Ninja', characterId || 'naruto', false);
    this.room.fillWithBots(Math.max(QUICKPLAY_SIZE, this.room.players.size));
    this.room.startCountdown();
    this._fire('room', this.room.lobbyState());

    // lobby/countdown updates + 20Hz sim, mirroring server/server.js
    this._last = Date.now();
    this._acc = 0;
    let lobbyTick = 0;
    this._loop = setInterval(() => {
      const now = Date.now();
      this._acc += Math.min(0.5, (now - this._last) / 1000);
      this._last = now;
      const DT = 1 / 20;
      while (this._acc >= DT) {
        this._acc -= DT;
        try { this.room.update(); } catch (err) { console.error('[localnet] tick:', err); }
      }
      if (this.room.state === 'playing') {
        this._fire('snapshot', this.room.snapshot());
        if (this.room.state === 'ended') this._fire('matchEnd', this.room.result);
      } else if (this.room.state === 'ended') {
        // result already sent; hold the room until leaveRoom
      } else if (++lobbyTick % 5 === 0) {
        this._fire('room', this.room.lobbyState());
      }
    }, 50);
  }

  _stop() {
    if (this._loop) { clearInterval(this._loop); this._loop = null; }
    if (this._roomTimer) { clearInterval(this._roomTimer); this._roomTimer = null; }
    this.room = null;
  }

  disconnect() { this._stop(); }
}
