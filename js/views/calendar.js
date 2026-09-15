// 달력: 월간 격자에 하루평가 색·얼굴, 특이사항 아이콘, 투약 표시
import { h } from '../ui.js';
import { getDaysInRange, getMasters } from '../store.js';
import { monthGrid, monthRange, todayKey, DOW, parseKey } from '../date.js';
import { RATINGS } from '../defaults.js';

const state = { year: null, month: null };

export async function renderCalendar(root, ctx) {
  const m = await getMasters();
  const today = todayKey(m.settings.dayBoundaryHour);
  if (!state.year) { const d = parseKey(ctx.day || today); state.year = d.getFullYear(); state.month = d.getMonth() + 1; }
  const [lo, hi] = monthRange(state.year, state.month);
  const days = await getDaysInRange(lo, hi);
  const byKey = Object.fromEntries(days.map((d) => [d.day, d]));
  const tagById = Object.fromEntries(m.tags.map((t) => [t.id, t]));

  const move = (n) => { state.month += n; if (state.month > 12) { state.month = 1; state.year++; } if (state.month < 1) { state.month = 12; state.year--; } ctx.goTab('calendar'); };

  const cells = monthGrid(state.year, state.month).map((c) => {
    const d = byKey[c.key];
    const rating = d?.rating;
    const face = rating ? RATINGS.find((r) => r.v === rating)?.face : '';
    const icons = d ? [...d.tags.slice(0, 3).map((t) => tagById[t.tagId]?.icon ?? ''), d.injection ? '💉' : ''].join('') : '';
    const cls = ['cal-cell', !c.inMonth && 'out', c.key === today && 'today', rating && `r${rating}`].filter(Boolean).join(' ');
    return h('div', { class: cls, onclick: () => { ctx.setDay(c.key); ctx.goTab('today'); } },
      h('div', { class: 'n' }, c.day),
      h('div', { class: 'f' }, face || (d?.weight?.kg ? h('span', { class: 'small muted' }, d.weight.kg.toFixed(1)) : '')),
      h('div', { class: 'i' }, icons));
  });

  const monthStats = summarize(days.filter((d) => d.day <= today));

  root.replaceChildren(
    h('div', { class: 'cal-head' },
      h('button', { class: 'icon-btn', onclick: () => move(-1) }, '‹'),
      h('h1', null, `${state.year}년 ${state.month}월`),
      h('button', { class: 'icon-btn', onclick: () => move(1) }, '›')),
    h('div', { class: 'cal-grid' },
      DOW.map((d) => h('div', { class: 'cal-dow' }, d)),
      cells),
    h('div', { class: 'cal-legend' },
      RATINGS.map((r) => h('span', null, `${r.face} ${r.label}`)), h('span', null, '💉 투약')),
    h('div', { class: 'card', style: 'margin-top:12px' },
      h('div', { class: 'card-title' }, h('span', null, '이번 달 요약')),
      h('div', { class: 'grid2' },
        stat('기록한 날', `${monthStats.logged}일`),
        stat('평균 하루평가', monthStats.avgRating ? `${monthStats.avgRating} / 5` : '-'),
        stat('체중 변화', monthStats.weightDelta != null ? `${monthStats.weightDelta > 0 ? '+' : ''}${monthStats.weightDelta.toFixed(1)} kg` : '-'),
        stat('투약 횟수', `${monthStats.injections}회`))));
}

function stat(k, v) {
  return h('div', { class: 'stat' }, h('div', { class: 'k' }, k), h('div', { class: 'v' }, v));
}

function summarize(days) {
  const rated = days.filter((d) => d.rating);
  const weights = days.filter((d) => d.weight?.kg).sort((a, b) => (a.day < b.day ? -1 : 1));
  return {
    logged: days.filter((d) => d.updatedAt).length,
    avgRating: rated.length ? (rated.reduce((a, d) => a + d.rating, 0) / rated.length).toFixed(1) : null,
    weightDelta: weights.length >= 2 ? weights[weights.length - 1].weight.kg - weights[0].weight.kg : null,
    injections: days.filter((d) => d.injection).length,
  };
}
