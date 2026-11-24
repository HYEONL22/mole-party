/**
 * 효과음 — 파일 없이 Web Audio로 직접 합성 (다운로드 0, 저작권 걱정 없음).
 * 폰 브라우저는 사용자가 한 번 터치해야 소리를 낼 수 있어서, 첫 터치 때 오디오를 깨운다.
 */

const MUTE_KEY = 'moleparty.muted';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noiseBuf: AudioBuffer | null = null;
let muted = readMuted();

function readMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
}

export function isMuted() {
  return muted;
}

export function setMuted(v: boolean) {
  muted = v;
  try {
    localStorage.setItem(MUTE_KEY, v ? '1' : '0');
  } catch {
    /* 무시 */
  }
  if (master) master.gain.value = v ? 0 : 0.45;
}

/** 첫 터치/클릭 때 호출 (iOS 사파리 오디오 잠금 해제) */
export function unlockAudio() {
  try {
    if (!ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.45;
      master.connect(ctx.destination);
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    if (ctx.state === 'suspended') void ctx.resume();
  } catch {
    ctx = null;
  }
}

if (typeof document !== 'undefined') {
  // 통화·다른 앱 사용 뒤에도 다시 깨울 수 있도록 계속 듣는다
  document.addEventListener('pointerdown', unlockAudio, { capture: true, passive: true });
  document.addEventListener('keydown', unlockAudio, { capture: true });
}

interface ToneOpts {
  freq: number;
  to?: number;
  dur: number;
  type?: OscillatorType;
  vol?: number;
  delay?: number;
}

function tone({ freq, to, dur, type = 'square', vol = 0.25, delay = 0 }: ToneOpts) {
  if (!ctx || !master || muted) return;
  const t = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (to) osc.frequency.exponentialRampToValueAtTime(to, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g).connect(master);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

function noise(dur: number, vol: number, cutoff: number, delay = 0) {
  if (!ctx || !master || !noiseBuf || muted) return;
  const t = ctx.currentTime + delay;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.setValueAtTime(cutoff, t);
  f.frequency.exponentialRampToValueAtTime(Math.max(60, cutoff / 8), t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(master);
  src.start(t);
  src.stop(t + dur + 0.02);
}

const arp = (notes: number[], step: number, opts: Partial<ToneOpts> = {}) =>
  notes.forEach((freq, i) => tone({ freq, dur: step * 1.6, delay: i * step, type: 'square', vol: 0.18, ...opts }));

export const sfx = {
  /** 누르는 순간 (판정 전) — 뿅망치 소리 */
  tap: () => {
    tone({ freq: 220, to: 70, dur: 0.09, type: 'triangle', vol: 0.5 });
    noise(0.05, 0.25, 2500);
  },
  /** 빈 구멍 */
  miss: () => tone({ freq: 320, to: 240, dur: 0.04, type: 'triangle', vol: 0.12 }),
  normal: () => tone({ freq: 660, to: 880, dur: 0.08, type: 'square', vol: 0.14 }),
  gold: () => arp([988, 1319, 1976], 0.05, { type: 'triangle', vol: 0.22 }),
  flash: () => tone({ freq: 1200, to: 2600, dur: 0.12, type: 'sawtooth', vol: 0.12 }),
  decoy: () => {
    tone({ freq: 220, to: 140, dur: 0.22, type: 'sawtooth', vol: 0.16 });
    tone({ freq: 233, to: 148, dur: 0.22, type: 'sawtooth', vol: 0.12 });
  },
  bomb: () => {
    noise(0.5, 0.8, 1400);
    tone({ freq: 110, to: 35, dur: 0.45, type: 'sine', vol: 0.6 });
  },
  /** 다른 사람이 잡았을 때 (작게) */
  other: () => tone({ freq: 520, to: 420, dur: 0.06, type: 'triangle', vol: 0.08 }),
  combo: () => arp([784, 988, 1175, 1568], 0.045),
  count: () => tone({ freq: 660, dur: 0.12, type: 'square', vol: 0.16 }),
  go: () => arp([784, 1175], 0.08, { vol: 0.2 }),
  tick: () => tone({ freq: 1400, dur: 0.03, type: 'square', vol: 0.06 }),
  fever: () => {
    for (let i = 0; i < 3; i++) {
      tone({ freq: 880, to: 1320, dur: 0.12, type: 'sawtooth', vol: 0.1, delay: i * 0.16 });
    }
  },
  end: () => arp([523, 659, 784, 1047], 0.1, { type: 'triangle', vol: 0.22 }),
};

/** 진동 (안드로이드만 지원, iOS는 무시됨) */
export function buzz(ms: number | number[]) {
  if (muted) return;
  // 사용자가 실제로 화면을 터치한 적이 있어야 진동 가능 (아니면 브라우저가 막고 경고를 남김)
  const ua = (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation;
  if (ua && !ua.hasBeenActive) return;
  try {
    navigator.vibrate?.(ms);
  } catch {
    /* 무시 */
  }
}
