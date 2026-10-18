// 앱 진입점: 탭 전환, 현재 날짜 상태, 데이터 변경 시 다시 그리기
import { todayKey } from './date.js';
import { getMasters, onChange } from './store.js';
import { renderToday } from './views/today.js';
import { renderCalendar } from './views/calendar.js';
import { renderTrends } from './views/trends.js';
import { renderSettings } from './views/settings.js';
import { renderAvatar } from './views/avatar.js';
import { startSync, onSyncStatus } from './sync.js';
import { syncBadge } from './views/today.js';

const state = { tab: 'today', day: null };
const view = document.getElementById('view');
const tabsEl = document.getElementById('tabs');

const ctx = {
  get day() { return state.day; },
  setDay(k) { state.day = k; },
  goTab(tab) { state.tab = tab; render(); },
  async goToday() { const m = await getMasters(); state.day = todayKey(m.settings.dayBoundaryHour); },
};

const views = { today: renderToday, calendar: renderCalendar, trends: renderTrends, settings: renderSettings, avatar: renderAvatar };

// 넓은 화면(컴퓨터·아이패드 가로)에서는 오늘 · 달력 · 변화를 나란히 보여 준다
const wideMQ = window.matchMedia('(min-width: 1100px)');
let cols = null;
function ensureLayout() {
  const wide = wideMQ.matches;
  document.getElementById('app').classList.toggle('wide', wide);
  if (wide && !cols) {
    const mk = (name) => { const el = document.createElement('section'); el.className = `col col-${name}`; return el; };
    cols = { main: mk('main'), cal: mk('cal'), trends: mk('trends') };
    view.replaceChildren(cols.main, cols.cal, cols.trends);
  } else if (!wide && cols) {
    cols = null;
    view.replaceChildren();
  }
  return wide;
}

let rendering = false, pending = false;
async function render() {
  if (rendering) { pending = true; return; }
  rendering = true;
  try {
    tabsEl.querySelectorAll('.tab').forEach((b) => b.classList.toggle('active', b.dataset.tab === state.tab));
    if (ensureLayout()) {
      const tops = [cols.main.scrollTop, cols.cal.scrollTop, cols.trends.scrollTop];
      await views[state.tab === 'settings' || state.tab === 'avatar' ? state.tab : 'today'](cols.main, ctx);
      await renderCalendar(cols.cal, ctx);
      await renderTrends(cols.trends, ctx);
      [cols.main.scrollTop, cols.cal.scrollTop, cols.trends.scrollTop] = tops;
    } else {
      const y = window.scrollY;
      await views[state.tab](view, ctx);
      window.scrollTo(0, y);
    }
  } finally {
    rendering = false;
    if (pending) { pending = false; render(); }
  }
}
wideMQ.addEventListener('change', () => render());

tabsEl.addEventListener('click', (e) => {
  const b = e.target.closest('.tab');
  if (!b) return;
  if (b.dataset.tab === 'today' && state.tab === 'today') ctx.goToday().then(render);
  else ctx.goTab(b.dataset.tab);
});

onChange(() => render());

// 동기화 상태가 바뀌면 머리의 표시만 바꿔 끼움 (화면 전체를 다시 그리지 않아 입력 중인 칸이 유지됨)
onSyncStatus(() => {
  const old = document.getElementById('sync-badge');
  const next = syncBadge(ctx);
  if (old && next) old.replaceWith(next);
});

// 자정이 지나면 "오늘"을 갱신
document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState !== 'visible') return;
  const m = await getMasters();
  const t = todayKey(m.settings.dayBoundaryHour);
  if (state.tab === 'today' && state.day !== t && state._lastToday !== t) { state.day = t; render(); }
  state._lastToday = t;
});

// 단축어가 URL로 열어준 경우: #health=<인코딩된 텍스트>
async function importFromHash() {
  const m = location.hash.match(/^#health=(.+)$/);
  if (!m) return;
  history.replaceState(null, '', location.pathname + location.search);
  try {
    const { parseHealthText, importHealthDays } = await import('./health.js');
    const rows = parseHealthText(decodeURIComponent(m[1]));
    const r = await importHealthDays(rows);
    const { toast } = await import('./ui.js');
    toast(`건강 데이터 ${r.count}일치 가져왔어요`);
  } catch (err) { alert('건강 데이터 가져오기 실패: ' + err.message); }
}

(async () => {
  startSync();
  await importFromHash();
  await ctx.goToday();
  state._lastToday = state.day;
  render();
  if ('serviceWorker' in navigator && location.protocol !== 'file:') registerSW();
})();

// 새 버전 자동 반영: 홈 화면 앱은 다시 열어도 옛 화면을 그대로 들고 있어서,
// (1) 앱이 앞으로 올 때마다 sw.js 가 바뀌었는지 확인하고 (2) 새 서비스워커가 자리를 잡으면 한 번 새로고침한다
async function registerSW() {
  try {
    const hadController = !!navigator.serviceWorker.controller; // 처음 설치(이전 워커 없음)면 새로고침하지 않음
    const reg = await navigator.serviceWorker.register('./sw.js');
    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (refreshing || !hadController) return;
      refreshing = true;
      location.reload();
    });
    const check = () => reg.update().catch(() => {});
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check(); });
    window.addEventListener('focus', check);
    setInterval(check, 30 * 60 * 1000); // 켜 둔 채로 오래 쓸 때도 30분마다 확인
  } catch { /* 서비스워커 없이도 앱은 동작 */ }
}
