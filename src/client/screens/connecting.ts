import { h } from '../dom';

export function connectingScreen(root: HTMLElement, route: { text: string }): () => void {
  const slow = h('p', { class: 'hint' });
  root.append(
    h('main', { class: 'screen connecting' }, h('div', { class: 'spinner', 'aria-hidden': 'true' }), h('p', {}, route.text), slow),
  );
  // 무료 서버는 처음 깨어날 때 오래 걸릴 수 있음
  const t = setTimeout(() => (slow.textContent = '서버가 잠에서 깨는 중이에요. 최대 1분 정도 걸릴 수 있어요…'), 4000);
  return () => clearTimeout(t);
}
