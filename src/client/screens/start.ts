import { ROOM_CODE_RE } from '../../shared/protocol';
import { state, type Route } from '../app';
import { avatarElement } from '../avatarRender';
import { h } from '../dom';
import { createRoom, joinRoom } from '../room';
import { SPRITES } from '../sprites';
import { NICKNAME_MAX, cleanNickname, saveNickname } from '../storage';

export function startScreen(
  root: HTMLElement,
  go: (r: Route) => void,
  route: { code?: string; message?: string; error?: boolean },
): void {
  const input = h('input', {
    type: 'text',
    maxlength: NICKNAME_MAX,
    placeholder: `닉네임 (최대 ${NICKNAME_MAX}자)`,
    autocomplete: 'off',
    enterkeyhint: 'done',
    value: state.nickname,
  });
  const codeInput = h('input', {
    type: 'text',
    class: 'code-input',
    maxlength: 5,
    placeholder: '방 코드',
    autocomplete: 'off',
    autocapitalize: 'characters',
    spellcheck: 'false',
    'aria-label': '방 코드 5자리',
    value: route.code ?? '',
  });
  const hint = h('p', { class: 'hint' + (route.error ? ' error' : ''), role: 'status' }, route.message ?? '');
  const setHint = (text: string, error = true) => {
    hint.textContent = text;
    hint.className = 'hint' + (error ? ' error' : '');
  };

  const requireNick = (): string | null => {
    const n = cleanNickname(input.value);
    if (!n) {
      setHint('닉네임을 입력해 주세요.');
      input.focus();
      return null;
    }
    state.nickname = n;
    saveNickname(n);
    return n;
  };

  input.addEventListener('input', () => setHint('', false));
  input.addEventListener('change', () => {
    state.nickname = cleanNickname(input.value);
    saveNickname(state.nickname);
  });
  codeInput.addEventListener('input', () => {
    codeInput.value = codeInput.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    setHint('', false);
  });

  const busyButtons: HTMLButtonElement[] = [];
  const run = async (label: string, task: () => Promise<string | null>) => {
    busyButtons.forEach((b) => (b.disabled = true));
    setHint(label, false);
    const err = await task();
    if (err) {
      busyButtons.forEach((b) => (b.disabled = false));
      setHint(err);
    } else {
      go({ name: 'lobby' });
    }
  };

  const onCreate = () => {
    const n = requireNick();
    if (n) void run('방을 만드는 중…', () => createRoom(n, state.avatar));
  };
  const onJoin = () => {
    const n = requireNick();
    if (!n) return;
    const code = codeInput.value.trim().toUpperCase();
    if (!ROOM_CODE_RE.test(code)) {
      setHint('방 코드 5자리를 입력해 주세요.');
      codeInput.focus();
      return;
    }
    void run('방에 들어가는 중…', () => joinRoom(code, n, state.avatar));
  };
  codeInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') onJoin();
  });

  const createBtn = h('button', { class: 'btn primary', onclick: onCreate }, '방 만들기');
  const joinBtn = h('button', { class: 'btn join-btn', onclick: onJoin }, '참가');
  const soloBtn = h('button', { class: 'btn', onclick: () => requireNick() && go({ name: 'game', mode: 'solo' }) }, '혼자 연습하기');
  busyButtons.push(createBtn, joinBtn, soloBtn);

  const mascot = h('div', { class: 'title-art' });
  const moleEl = document.createElement('canvas');
  moleEl.width = 64;
  moleEl.height = 64;
  moleEl.className = 'pixel';
  const mctx = moleEl.getContext('2d')!;
  mctx.imageSmoothingEnabled = false;
  mctx.drawImage(SPRITES.normal, 0, 0, 64, 64);
  mascot.append(moleEl, avatarElement(state.avatar, 3, 'avatar title-avatar'));

  root.append(
    h(
      'main',
      { class: 'screen start' },
      h('h1', { class: 'logo' }, '두더지 ', h('span', {}, '친구방')),
      mascot,
      h('label', { class: 'field' }, h('span', {}, '닉네임'), input),
      h(
        'button',
        { class: 'btn small link-btn', onclick: () => go({ name: 'customize', back: { name: 'start', code: codeInput.value } }) },
        '캐릭터 꾸미기',
      ),
      hint,
      h(
        'div',
        { class: 'btn-col' },
        createBtn,
        h('div', { class: 'join-row' }, codeInput, joinBtn),
        h('div', { class: 'divider' }, '또는'),
        soloBtn,
      ),
    ),
  );
  if (route.code) codeInput.focus();
}
