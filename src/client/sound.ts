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

/**
 * 아이폰: 무음(진동) 스위치가 켜져 있으면 Web Audio 소리가 안 난다.
 * 짧은 무음 <audio>를 한 번 재생해 두면 "미디어 소리"로 취급돼 스위치와 상관없이 들린다.
 */
let mediaUnlocked = false;
function unlockMediaChannel() {
  if (mediaUnlocked) return;
  mediaUnlocked = true;
  try {
    const nav = navigator as Navigator & { audioSession?: { type: string } };
    if (nav.audioSession) nav.audioSession.type = 'playback'; // Safari 16.4+
  } catch {
    /* 무시 */
  }
  try {
    const a = new Audio(SILENT_WAV);
    a.setAttribute('playsinline', '');
    a.volume = 0.01;
    void a.play().catch(() => (mediaUnlocked = false));
  } catch {
    mediaUnlocked = false;
  }
}

/** 0.1초짜리 무음 WAV (8kHz, 8bit) */
const SILENT_WAV = (() => {
  const n = 800;
  const bytes = new Uint8Array(44 + n);
  const dv = new DataView(bytes.buffer);
  const str = (o: number, s: string) => [...s].forEach((c, i) => (bytes[o + i] = c.charCodeAt(0)));
  str(0, 'RIFF');
  dv.setUint32(4, 36 + n, true);
  str(8, 'WAVEfmt ');
  dv.setUint32(16, 16, true);
  dv.setUint16(20, 1, true);
  dv.setUint16(22, 1, true);
  dv.setUint32(24, 8000, true);
  dv.setUint32(28, 8000, true);
  dv.setUint16(32, 1, true);
  dv.setUint16(34, 8, true);
  str(36, 'data');
  dv.setUint32(40, n, true);
  bytes.fill(128, 44);
  let bin = '';
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return 'data:audio/wav;base64,' + btoa(bin);
})();

/** 터치/클릭 때 호출 (폰 브라우저 오디오 잠금 해제) */
export function unlockAudio() {
  unlockMediaChannel();
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
  // 폰에서는 손가락을 "뗄 때"(pointerup/touchend/click)만 소리 허용 신호로 인정된다.
  // 누르는 순간(pointerdown)만 들으면 폰에서는 소리가 영영 안 켜짐 → 둘 다 듣는다.
  // 통화·다른 앱 사용 뒤에도 다시 깨울 수 있도록 계속 듣는다.
  for (const ev of ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown']) {
    document.addEventListener(ev, unlockAudio, { capture: true, passive: true });
  }
  // 다른 앱에 다녀오면 오디오가 멈춰 있는 경우가 있어 다시 깨운다
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && ctx?.state !== 'running') void ctx?.resume().catch(() => {});
  });
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
  /** 친구가 방에 들어옴 (딩동) */
  join: () => arp([1047, 784], 0.14, { type: 'sine', vol: 0.25 }),
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
