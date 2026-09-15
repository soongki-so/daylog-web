// 앱 진입점: 탭 전환, 현재 날짜 상태, 데이터 변경 시 다시 그리기
import { todayKey } from './date.js';
import { getMasters, onChange } from './store.js';
import { renderToday } from './views/today.js';
import { renderCalendar } from './views/calendar.js';
import { renderTrends } from './views/trends.js';
import { renderSettings } from './views/settings.js';

const state = { tab: 'today', day: null };
const view = document.getElementById('view');
const tabsEl = document.getElementById('tabs');

const ctx = {
  get day() { return state.day; },
  setDay(k) { state.day = k; },
  goTab(tab) { state.tab = tab; render(); },
  async goToday() { const m = await getMasters(); state.day = todayKey(m.settings.dayBoundaryHour); },
};

const views = { today: renderToday, calendar: renderCalendar, trends: renderTrends, settings: renderSettings };

let rendering = false, pending = false;
async function render() {
  if (rendering) { pending = true; return; }
  rendering = true;
  try {
    tabsEl.querySelectorAll('.tab').forEach((b) => b.classList.toggle('active', b.dataset.tab === state.tab));
    const y = window.scrollY;
    await views[state.tab](view, ctx);
    window.scrollTo(0, y);
  } finally {
    rendering = false;
    if (pending) { pending = false; render(); }
  }
}

tabsEl.addEventListener('click', (e) => {
  const b = e.target.closest('.tab');
  if (!b) return;
  if (b.dataset.tab === 'today' && state.tab === 'today') ctx.goToday().then(render);
  else ctx.goTab(b.dataset.tab);
});

onChange(() => render());

// 자정이 지나면 "오늘"을 갱신
document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState !== 'visible') return;
  const m = await getMasters();
  const t = todayKey(m.settings.dayBoundaryHour);
  if (state.tab === 'today' && state.day !== t && state._lastToday !== t) { state.day = t; render(); }
  state._lastToday = t;
});

(async () => {
  await ctx.goToday();
  state._lastToday = state.day;
  render();
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
})();
