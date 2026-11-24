import type { RankEntry } from '../../shared/protocol';
import type { GameMode, Route } from '../app';
import { avatarElement } from '../avatarRender';
import { h } from '../dom';
import { getRoom, leaveRoom, onRoomChange } from '../room';

export function resultScreen(
  root: HTMLElement,
  go: (r: Route) => void,
  route: { ranking: RankEntry[]; myId: string; mode: GameMode },
): () => void {
  const medal = (rank: number) => (rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `${rank}위`);
  const multi = route.mode === 'multi';
  const winners = route.ranking.filter((r) => r.rank === 1);
  const title =
    multi && route.ranking.length > 1
      ? winners.length > 1
        ? '공동 1등!'
        : winners[0]?.id === route.myId
          ? '내가 1등! 🎉'
          : `${winners[0]?.nickname} 1등!`
      : route.mode === 'practice'
        ? '연습 결과'
        : '결과';

  root.append(
    h(
      'main',
      { class: 'screen result' },
      h('h2', {}, title),
      h(
        'ol',
        { class: 'ranking' },
        ...route.ranking.map((r) =>
          h(
            'li',
            { class: (r.id === route.myId ? 'me ' : '') + (r.rank === 1 ? 'first' : '') },
            h('span', { class: 'rank' }, medal(r.rank)),
            avatarElement(r.avatar, 2),
            h('span', { class: 'nick' }, r.nickname),
            h('b', {}, `${r.score}점`),
          ),
        ),
      ),
      multi
        ? h(
            'div',
            { class: 'btn-col' },
            h('button', { class: 'btn primary', onclick: () => go(getRoom() ? { name: 'lobby' } : { name: 'start' }) }, '같은 방에서 다시 하기'),
            h(
              'button',
              {
                class: 'btn',
                onclick: () => {
                  leaveRoom();
                  go({ name: 'start' });
                },
              },
              '나가기',
            ),
          )
        : route.mode === 'practice'
          ? h(
              'div',
              { class: 'btn-col' },
              h('button', { class: 'btn primary', onclick: () => go({ name: 'game', mode: 'practice' }) }, '다시 연습'),
              h('button', { class: 'btn', onclick: () => go(getRoom() ? { name: 'lobby' } : { name: 'start' }) }, '대기실로'),
            )
          : h(
              'div',
              { class: 'btn-col' },
              h('button', { class: 'btn primary', onclick: () => go({ name: 'game', mode: 'solo' }) }, '다시 하기'),
              h('button', { class: 'btn', onclick: () => go({ name: 'start' }) }, '나가기'),
            ),
    ),
  );

  // 결과를 보는 동안 방장이 바로 다음 판을 시작하면 같이 들어간다 (연습 결과를 보는 중이어도)
  return route.mode !== 'solo'
    ? onRoomChange((e) => {
        if (e.kind === 'game_start') go({ name: 'game', mode: 'multi' });
        else if (e.kind === 'lost') go({ name: 'start', message: e.message, error: true });
      })
    : () => {};
}
