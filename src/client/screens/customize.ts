import { randomAvatar, type Avatar, type AvatarKey } from '../../shared/avatar';
import { HAT_COLORS, TOP_COLORS, type ColorOption } from '../../shared/avatarParts';
import { state, type Route } from '../app';
import { avatarElement } from '../avatarRender';
import { h } from '../dom';
import { sendAvatar } from '../room';
import { saveAvatar } from '../storage';

interface Section {
  key: AvatarKey;
  label: string;
  colors: ColorOption[];
}

/** 화면에 표시할 항목. 새 항목을 추가하면 여기에 한 줄 추가. */
const SECTIONS: Section[] = [
  { key: 'hatColor', label: '모자 색', colors: HAT_COLORS },
  { key: 'topColor', label: '반팔티 색', colors: TOP_COLORS },
];

export function customizeScreen(root: HTMLElement, go: (r: Route) => void, route: { back: Route }): void {
  let draft: Avatar = { ...state.avatar };

  const preview = h('div', { class: 'preview' });
  const body = h('div', { class: 'sections' });

  const render = () => {
    preview.replaceChildren(avatarElement(draft, 5, 'avatar big'));
    body.replaceChildren(
      ...SECTIONS.map((sec) =>
        h(
          'section',
          { class: 'opt' },
          h('h3', {}, sec.label),
          h(
            'div',
            { class: 'swatches' },
            ...sec.colors.map((c, i) =>
              h('button', {
                class: 'swatch' + (draft[sec.key] === i ? ' selected' : ''),
                style: `--c:${c.color}`,
                title: c.name,
                'aria-label': `${sec.label}: ${c.name}`,
                'aria-pressed': draft[sec.key] === i ? 'true' : 'false',
                onclick: () => {
                  draft = { ...draft, [sec.key]: i };
                  render();
                },
              }),
            ),
          ),
        ),
      ),
    );
  };

  root.append(
    h(
      'main',
      { class: 'screen customize' },
      h(
        'header',
        { class: 'cz-head' },
        h('h2', {}, '캐릭터 꾸미기'),
        preview,
        h(
          'div',
          { class: 'btn-row' },
          h('button', { class: 'btn small', onclick: () => ((draft = randomAvatar()), render()) }, '🎲 랜덤'),
          h('button', { class: 'btn small', onclick: () => go(route.back) }, '취소'),
          h(
            'button',
            {
              class: 'btn small primary',
              onclick: () => {
                state.avatar = draft;
                saveAvatar(draft);
                sendAvatar(draft); // 방에 들어가 있으면 다른 사람에게도 반영
                go(route.back);
              },
            },
            '저장',
          ),
        ),
      ),
      h('div', { class: 'cz-scroll' }, body),
    ),
  );
  render();
}
