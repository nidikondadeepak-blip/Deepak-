// ============================================================================
// SHINOBI ARENA — network facade.
// Online: Socket.IO backend. Offline (GitHub Pages demo): LocalNet backend
// driving the real GameRoom simulation inside the browser. Game code talks
// only to `net` and works identically in both modes.
// ============================================================================

class SocketNet {
  constructor() {
    this.socket = null;
    this.id = null;
    this.handlers = {};
  }
  connect() {
    if (this.socket) return this.socket;
    if (typeof io === 'undefined') throw new Error('socket.io unavailable (offline mode?)');
    // eslint-disable-next-line no-undef
    this.socket = io({ reconnection: true, reconnectionAttempts: 5 });
    this.socket.on('welcome', ({ id }) => { this.id = id; });
    this.socket.on('pongS', () => {});
    for (const [ev, fns] of Object.entries(this.handlers)) {
      for (const fn of fns) this.socket.on(ev, fn);
    }
    return this.socket;
  }
  on(ev, fn) {
    (this.handlers[ev] ||= []).push(fn);
    if (this.socket) this.socket.on(ev, fn);
  }
  off(ev, fn) {
    if (this.handlers[ev]) this.handlers[ev] = this.handlers[ev].filter((f) => f !== fn);
    if (this.socket) this.socket.off(ev, fn);
  }
  emit(ev, data) {
    if (this.socket) this.socket.emit(ev, data);
  }
}

export const socketNet = new SocketNet();

let backend = socketNet;

// Facade keeps its own registry so swapping backends never loses listeners.
const registry = []; // [ev, fn]
export function setNetBackend(b) {
  for (const [ev, fn] of registry) {
    try { backend.off(ev, fn); } catch { /* noop */ }
  }
  backend = b;
  for (const [ev, fn] of registry) backend.on(ev, fn);
}
export function currentBackend() { return backend; }

export const net = {
  get id() { return backend.id; },
  set id(v) { backend.id = v; },
  connect(...a) { return backend.connect(...a); },
  on(ev, fn) { registry.push([ev, fn]); backend.on(ev, fn); },
  off(ev, fn) {
    for (let i = registry.length - 1; i >= 0; i--) {
      if (registry[i][0] === ev && registry[i][1] === fn) registry.splice(i, 1);
    }
    backend.off(ev, fn);
  },
  emit(ev, data) { backend.emit(ev, data); },
};
