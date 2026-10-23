/** WebAudio-synthesised sound effects. No audio files. */
type Sfx = 'click' | 'draw' | 'play' | 'advance' | 'regress' | 'protect' | 'block' | 'win' | 'turn' | 'error';

const KEY = 'wafer-road:muted';
let muted = false;
try {
  muted = localStorage.getItem(KEY) === '1';
} catch {
  /* ignore */
}
let ctx: AudioContext | null = null;
const listeners = new Set<() => void>();

export function isMuted(): boolean {
  return muted;
}
export function setMuted(m: boolean): void {
  muted = m;
  try {
    localStorage.setItem(KEY, m ? '1' : '0');
  } catch {
    /* ignore */
  }
  listeners.forEach((f) => f());
}
export function onMuteChange(f: () => void): () => void {
  listeners.add(f);
  return () => void listeners.delete(f);
}

function ac(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const C = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!C) return null;
    try {
      ctx = new C();
    } catch {
      return null;
    }
  }
  if (ctx.state === 'suspended') void ctx.resume().catch(() => undefined);
  return ctx;
}

function tone(freq: number, start: number, dur: number, type: OscillatorType = 'sine', vol = 0.15, slideTo?: number): void {
  const c = ac();
  if (!c) return;
  const t0 = c.currentTime + start;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(c.destination);
  o.start(t0);
  o.stop(t0 + dur + 0.02);
}

function noise(start: number, dur: number, vol = 0.1): void {
  const c = ac();
  if (!c) return;
  const n = Math.floor(c.sampleRate * dur);
  const buf = c.createBuffer(1, n, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
  const s = c.createBufferSource();
  const g = c.createGain();
  s.buffer = buf;
  g.gain.value = vol;
  s.connect(g).connect(c.destination);
  s.start(c.currentTime + start);
}

export function play(name: Sfx): void {
  if (muted) return;
  try {
    switch (name) {
      case 'click':
        tone(660, 0, 0.06, 'triangle', 0.08);
        break;
      case 'draw':
        noise(0, 0.08, 0.06);
        tone(420, 0, 0.07, 'triangle', 0.05, 640);
        break;
      case 'play':
        tone(330, 0, 0.1, 'triangle', 0.12, 520);
        noise(0, 0.05, 0.05);
        break;
      case 'advance':
        tone(523, 0, 0.1, 'sine', 0.14);
        tone(659, 0.09, 0.1, 'sine', 0.14);
        tone(784, 0.18, 0.18, 'sine', 0.14);
        break;
      case 'regress':
        tone(220, 0, 0.25, 'sawtooth', 0.12, 80);
        noise(0, 0.18, 0.1);
        break;
      case 'protect':
        tone(392, 0, 0.12, 'square', 0.07);
        tone(588, 0.1, 0.18, 'square', 0.07);
        break;
      case 'block':
        tone(900, 0, 0.08, 'square', 0.09, 400);
        tone(600, 0.08, 0.16, 'square', 0.09, 300);
        break;
      case 'turn':
        tone(740, 0, 0.09, 'sine', 0.09);
        tone(988, 0.1, 0.12, 'sine', 0.09);
        break;
      case 'error':
        tone(160, 0, 0.14, 'square', 0.07);
        break;
      case 'win':
        [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.13, 0.25, 'triangle', 0.14));
        tone(1319, 0.55, 0.5, 'triangle', 0.14);
        break;
    }
  } catch {
    /* audio failures are non-fatal */
  }
}
