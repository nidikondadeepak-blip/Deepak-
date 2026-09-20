// ============================================================================
// SHINOBI ARENA — socket.io client wrapper
// ============================================================================

class Net {
  constructor() {
    this.socket = null;
    this.id = null;
    this.handlers = {};
  }
  connect() {
    if (this.socket) return this.socket;
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

export const net = new Net();
