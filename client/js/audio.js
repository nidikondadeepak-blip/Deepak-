// ============================================================================
// SHINOBI ARENA — synthesized SFX (WebAudio, no audio files needed)
// ============================================================================

let ctx = null;
let master = null;
let muted = false;
let volume = 0.6;

function ensure() {
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = volume;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

export function setVolume(v) {
  volume = v;
  if (master) master.gain.value = muted ? 0 : v;
}
export function setMuted(m) {
  muted = m;
  if (master) master.gain.value = m ? 0 : volume;
}
export function isMuted() { return muted; }

// --- primitives ---
function tone({ freq = 440, freq2 = null, type = 'sine', dur = 0.15, vol = 0.5, delay = 0 }) {
  try {
    const c = ensure();
    const t = c.currentTime + delay;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (freq2) o.frequency.exponentialRampToValueAtTime(Math.max(1, freq2), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + dur + 0.05);
  } catch { /* audio not ready */ }
}

function noise({ dur = 0.2, vol = 0.5, delay = 0, filterFreq = 2000, filterFreq2 = null, type = 'bandpass', q = 1 }) {
  try {
    const c = ensure();
    const t = c.currentTime + delay;
    const len = Math.max(1, Math.floor(c.sampleRate * dur));
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = c.createBufferSource();
    src.buffer = buf;
    const f = c.createBiquadFilter();
    f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(filterFreq, t);
    if (filterFreq2) f.frequency.exponentialRampToValueAtTime(Math.max(10, filterFreq2), t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(master);
    src.start(t);
  } catch { /* audio not ready */ }
}

// --- game sounds ---
export const sfx = {
  click() { tone({ freq: 700, freq2: 900, type: 'square', dur: 0.07, vol: 0.25 }); },
  hover() { tone({ freq: 500, dur: 0.04, vol: 0.1 }); },
  throwKunai() { noise({ dur: 0.18, vol: 0.35, filterFreq: 4000, filterFreq2: 900 }); },
  throwShuriken() {
    noise({ dur: 0.14, vol: 0.3, filterFreq: 5000, filterFreq2: 1500 });
    tone({ freq: 1200, freq2: 2400, dur: 0.12, vol: 0.12, type: 'sawtooth' });
  },
  hit() { tone({ freq: 220, freq2: 90, type: 'square', dur: 0.12, vol: 0.4 }); noise({ dur: 0.08, vol: 0.3, filterFreq: 1200 }); },
  hurt() { tone({ freq: 300, freq2: 120, type: 'sawtooth', dur: 0.2, vol: 0.35 }); },
  explosion() {
    noise({ dur: 0.7, vol: 0.8, filterFreq: 3000, filterFreq2: 80, type: 'lowpass' });
    tone({ freq: 120, freq2: 30, dur: 0.6, vol: 0.7 });
  },
  fuse() { noise({ dur: 0.3, vol: 0.2, filterFreq: 6000, type: 'highpass' }); },
  jump() { tone({ freq: 350, freq2: 700, dur: 0.14, vol: 0.25 }); },
  djump() { tone({ freq: 500, freq2: 1000, dur: 0.16, vol: 0.3 }); noise({ dur: 0.15, vol: 0.2, filterFreq: 2000 }); },
  land() { noise({ dur: 0.1, vol: 0.25, filterFreq: 500, type: 'lowpass' }); },
  rasengan() {
    tone({ freq: 150, freq2: 900, dur: 0.5, vol: 0.5, type: 'sawtooth' });
    noise({ dur: 0.6, vol: 0.5, filterFreq: 800, filterFreq2: 5000 });
    tone({ freq: 90, freq2: 45, dur: 0.5, vol: 0.6, delay: 0.35 });
  },
  chidori() {
    for (let i = 0; i < 6; i++) noise({ dur: 0.06, vol: 0.4, delay: i * 0.05, filterFreq: 6000, type: 'highpass' });
    tone({ freq: 2000, freq2: 200, dur: 0.4, vol: 0.3, type: 'sawtooth' });
  },
  barrage() { for (let i = 0; i < 5; i++) { tone({ freq: 250, freq2: 100, type: 'square', dur: 0.1, vol: 0.35, delay: i * 0.28 }); } },
  byakugan() {
    tone({ freq: 600, freq2: 1800, dur: 0.4, vol: 0.3 });
    tone({ freq: 900, freq2: 2700, dur: 0.4, vol: 0.2, delay: 0.1 });
  },
  heal() {
    [523, 659, 784, 1046].forEach((f, i) => tone({ freq: f, dur: 0.25, vol: 0.25, delay: i * 0.12 }));
  },
  ramen() {
    tone({ freq: 400, freq2: 800, dur: 0.15, vol: 0.3 });
    tone({ freq: 800, freq2: 1200, dur: 0.2, vol: 0.3, delay: 0.15 });
  },
  kill() {
    tone({ freq: 500, freq2: 1000, dur: 0.15, vol: 0.4, type: 'square' });
    tone({ freq: 750, freq2: 1500, dur: 0.2, vol: 0.4, type: 'square', delay: 0.1 });
  },
  death() { tone({ freq: 400, freq2: 60, dur: 0.8, vol: 0.5, type: 'sawtooth' }); },
  countdown() { tone({ freq: 880, dur: 0.12, vol: 0.4, type: 'square' }); },
  go() { tone({ freq: 880, freq2: 1760, dur: 0.4, vol: 0.5, type: 'square' }); },
  zoneWarn() { tone({ freq: 440, freq2: 415, dur: 0.3, vol: 0.4, type: 'square' }); tone({ freq: 440, freq2: 415, dur: 0.3, vol: 0.4, type: 'square', delay: 0.35 }); },
  victory() { [523, 659, 784, 1046, 1318].forEach((f, i) => tone({ freq: f, dur: 0.3, vol: 0.35, delay: i * 0.15 })); },
  defeat() { [400, 350, 300, 200].forEach((f, i) => tone({ freq: f, dur: 0.35, vol: 0.35, type: 'sawtooth', delay: i * 0.2 })); },
};
