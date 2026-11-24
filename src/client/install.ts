/**
 * 홈 화면에 앱으로 추가하기.
 *  - 안드로이드/PC 크롬·엣지·삼성인터넷: 브라우저가 주는 설치 창을 버튼으로 띄운다
 *  - 아이폰 사파리: 자동 설치 창이 없어서 "공유 → 홈 화면에 추가" 안내
 *  - 카카오톡 등 앱 안 브라우저: 설치가 안 되므로 "다른 브라우저로 열기" 안내
 */

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export type InstallMode = 'installed' | 'prompt' | 'ios' | 'inapp' | 'none';

let deferred: InstallPromptEvent | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((fn) => fn());

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault(); // 브라우저 기본 배너 대신 우리 버튼으로
  deferred = e as InstallPromptEvent;
  notify();
});
window.addEventListener('appinstalled', () => {
  deferred = null;
  notify();
});

const ua = navigator.userAgent;

export function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function installMode(): InstallMode {
  if (isStandalone()) return 'installed';
  if (/KAKAOTALK|Instagram|FBAN|FBAV|NAVER|Line\//i.test(ua)) return 'inapp';
  if (deferred) return 'prompt';
  const iOS = /iPhone|iPad|iPod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (iOS) return 'ios';
  return 'none';
}

export async function promptInstall(): Promise<boolean> {
  if (!deferred) return false;
  const ev = deferred;
  deferred = null;
  await ev.prompt();
  const { outcome } = await ev.userChoice;
  notify();
  return outcome === 'accepted';
}

export function onInstallChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** 배포 환경(https)에서만 서비스 워커 등록 — 개발 중 화면 새로고침을 방해하지 않도록 */
export function registerServiceWorker() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}
