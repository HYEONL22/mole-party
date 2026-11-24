import './style.css';
import { ROOM_CODE_RE } from '../shared/protocol';
import { state, type Route } from './app';
import { getRoom, joinRoom, rejoinSaved, setUrlRoom } from './room';
import { connectingScreen } from './screens/connecting';
import { customizeScreen } from './screens/customize';
import { gameScreen } from './screens/game';
import { lobbyScreen } from './screens/lobby';
import { resultScreen } from './screens/result';
import { startScreen } from './screens/start';
import { cleanNickname, loadRoomSession } from './storage';
import { registerServiceWorker } from './install';

const root = document.getElementById('app')!;
let cleanup: (() => void) | void;

function go(route: Route): void {
  if (cleanup) cleanup();
  cleanup = undefined;
  root.replaceChildren();
  window.scrollTo(0, 0);
  switch (route.name) {
    case 'start':
      cleanup = startScreen(root, go, route);
      break;
    case 'connecting':
      cleanup = connectingScreen(root, route);
      break;
    case 'lobby':
      cleanup = lobbyScreen(root, go, route);
      break;
    case 'customize':
      cleanup = customizeScreen(root, go, route);
      break;
    case 'game':
      cleanup = gameScreen(root, go, route);
      break;
    case 'result':
      cleanup = resultScreen(root, go, route);
      break;
  }
}

/**
 * 처음 열었을 때:
 * 1) 이 탭에서 들어가 있던 방이 있으면(새로고침) 같은 자리로 복귀
 * 2) 초대 링크(?room=CODE)로 왔고 닉네임이 저장돼 있으면 바로 입장
 * 3) 아니면 시작 화면 (링크 코드는 미리 채워 둠)
 */
async function boot() {
  const urlCode = new URLSearchParams(location.search).get('room')?.toUpperCase() ?? '';
  const linkCode = ROOM_CODE_RE.test(urlCode) ? urlCode : '';
  const saved = loadRoomSession();

  if (saved && (!linkCode || linkCode === saved.code)) {
    go({ name: 'connecting', text: '방으로 돌아가는 중…' });
    if (await rejoinSaved()) {
      // 게임 중에 새로고침했다면 대기실에서 판이 끝나기를 기다린다
      const playing = getRoom()?.phase === 'playing';
      return go({ name: 'lobby', message: playing ? '새로고침해서 이번 판에서 빠졌어요. 다음 판부터 같이 할 수 있어요.' : undefined });
    }
  }

  if (linkCode) {
    const nickname = cleanNickname(state.nickname);
    if (!nickname) {
      return go({ name: 'start', code: linkCode, message: '초대받은 방이에요! 닉네임을 정하고 [참가]를 눌러 주세요.' });
    }
    go({ name: 'connecting', text: `${linkCode} 방에 들어가는 중…` });
    const err = await joinRoom(linkCode, nickname, state.avatar);
    if (!err) return go({ name: 'lobby' });
    setUrlRoom(null);
    return go({ name: 'start', code: linkCode, message: err, error: true });
  }

  if (urlCode) setUrlRoom(null);
  go({ name: 'start' });
}

registerServiceWorker();
void boot();
