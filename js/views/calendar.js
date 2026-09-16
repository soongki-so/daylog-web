// 달력: 월간 격자에 하루평가 색·얼굴, 특이사항 아이콘, 투약 기록/예정 표시
import { h } from '../ui.js';
import { getDaysInRange, getMasters } from '../store.js';
import { monthGrid, monthRange, todayKey, DOW, parseKey, fmtKey, diffDays } from '../date.js';
import { RATINGS } from '../defaults.js';
import { injectionSheet, injectionStatus } from './injection.js';

const state = { year: null, month: null };

export async function renderCalendar(root, ctx) {
  const m = await getMasters();
  const today = todayKey(m.settings.dayBoundaryHour);
  if (!state.year) { const d = parseKey(ctx.day || today); state.year = d.getFullYear(); state.month = d.getMonth() + 1; }
  const [lo, hi] = monthRange(state.year, state.month);
  const [days, inj] = await Promise.all([getDaysInRange(lo, hi), injectionStatus(today)]);
  const byKey = Object.fromEntries(days.map((d) => [d.day, d]));
  const tagById = Object.fromEntries(m.tags.map((t) => [t.id, t]));
  const injName = m.settings.injectionName;

  const move = (n) => { state.month += n; if (state.month > 12) { state.month = 1; state.year++; } if (state.month < 1) { state.month = 12; state.year--; } ctx.goTab('calendar'); };
  const refresh = () => ctx.goTab('calendar');

  const cells = monthGrid(state.year, state.month).map((c) => {
    const d = byKey[c.key];
    const rating = d?.rating;
    const face = rating ? RATINGS.find((r) => r.v === rating)?.face : '';
    const isNext = inj.next === c.key && !d?.injection;
    const icons = [
      ...(d ? d.tags.slice(0, 2).map((t) => tagById[t.tagId]?.icon ?? '') : []),
      d?.injection ? '💉' : (isNext ? '⏰' : ''),
      d?.weight?.source === 'inbody' ? '📋' : '',
    ].join('');
    const cls = ['cal-cell', !c.inMonth && 'out', c.key === today && 'today', rating && `r${rating}`, d?.injection && 'inj', isNext && 'inj-next'].filter(Boolean).join(' ');
    return h('div', { class: cls, onclick: () => { ctx.setDay(c.key); ctx.goTab('today'); } },
      h('div', { class: 'n' }, c.day),
      h('div', { class: 'f' }, face || (d?.weight?.kg ? h('span', { class: 'small muted' }, d.weight.kg.toFixed(1)) : '')),
      h('div', { class: 'i' }, icons));
  });

  const monthStats = summarize(days.filter((d) => d.day <= today));
  const monthInjections = days.filter((d) => d.injection).sort((a, b) => (a.day < b.day ? -1 : 1));

  root.replaceChildren(
    h('div', { class: 'cal-head' },
      h('button', { class: 'icon-btn', onclick: () => move(-1) }, '‹'),
      h('h1', null, `${state.year}년 ${state.month}월`),
      h('button', { class: 'icon-btn', onclick: () => move(1) }, '›')),
    h('div', { class: 'cal-grid' },
      DOW.map((d) => h('div', { class: 'cal-dow' }, d)),
      cells),
    h('div', { class: 'cal-legend' },
      RATINGS.map((r) => h('span', null, `${r.face} ${r.label}`)), h('span', null, '💉 투약'), h('span', null, '⏰ 투약 예정'), h('span', null, '📋 인바디')),

    // 투약 카드
    h('div', { class: 'card', style: 'margin-top:12px' },
      h('div', { class: 'card-title' },
        h('span', null, `💉 ${injName}`),
        h('button', { class: 'link', onclick: () => injectionSheet(m, today, byKey[today]?.injection ?? null, refresh) }, '+ 투약 기록')),
      h('div', { class: 'grid2', style: 'margin-bottom:10px' },
        stat('마지막 투약', inj.last ? `${fmtKey(inj.last.day)} · ${inj.last.injection.doseMg}mg` : '-'),
        stat('다음 예정', inj.next ? nextText(inj.next, today) : '기록 후 표시')),
      monthInjections.length
        ? monthInjections.map((d) => h('div', { class: 'list-item', onclick: () => injectionSheet(m, d.day, d.injection, refresh) },
          h('span', { class: 'grow' }, fmtKey(d.day), h('span', { class: 'muted small' }, ` ${d.injection.at ?? ''}`)),
          h('b', null, `${d.injection.doseMg} mg`),
          d.injection.note && h('span', { class: 'muted small' }, d.injection.note),
          h('span', { class: 'muted' }, '›')))
        : h('div', { class: 'empty' }, '이번 달 투약 기록이 없어요')),

    h('div', { class: 'card' },
      h('div', { class: 'card-title' }, h('span', null, '이번 달 요약')),
      h('div', { class: 'grid2' },
        stat('기록한 날', `${monthStats.logged}일`),
        stat('평균 하루평가', monthStats.avgRating ? `${monthStats.avgRating} / 5` : '-'),
        stat('체중 변화', monthStats.weightDelta != null ? `${monthStats.weightDelta > 0 ? '+' : ''}${monthStats.weightDelta.toFixed(1)} kg` : '-'),
        stat('투약 횟수', `${monthStats.injections}회`))));
}

function nextText(next, today) {
  const dd = diffDays(today, next);
  const when = dd === 0 ? '오늘' : dd > 0 ? `D-${dd}` : `${-dd}일 지남`;
  return `${fmtKey(next)} (${when})`;
}

function stat(k, v) {
  return h('div', { class: 'stat' }, h('div', { class: 'k' }, k), h('div', { class: 'v', style: 'font-size:15px' }, v));
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
