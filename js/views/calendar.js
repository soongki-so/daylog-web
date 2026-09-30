// 달력: 월간 격자에 하루평가 색·얼굴, 특이사항 아이콘, 투약 기록/예정 표시
import { h } from '../ui.js';
import { getDaysInRange, getMasters } from '../store.js';
import { monthGrid, monthRange, todayKey, DOW, parseKey, fmtKey, diffDays } from '../date.js';
import { RATINGS } from '../defaults.js';
import { injectionSheet, injectionStatus } from './injection.js';
import { daySheet, eventsOf, shortLabel, kindOf } from '../events.js';
import { addDays } from '../date.js';

const state = { year: null, month: null };

export async function renderCalendar(root, ctx) {
  const m = await getMasters();
  const today = todayKey(m.settings.dayBoundaryHour);
  if (!state.year) { const d = parseKey(ctx.day || today); state.year = d.getFullYear(); state.month = d.getMonth() + 1; }
  const grid = monthGrid(state.year, state.month);
  const [lo, hi] = [grid[0].key, grid[grid.length - 1].key]; // 앞뒤 달 날짜 칸까지 포함
  const [days, inj] = await Promise.all([getDaysInRange(lo, hi), injectionStatus(today)]);
  const byKey = Object.fromEntries(days.map((d) => [d.day, d]));
  const tagById = Object.fromEntries(m.tags.map((t) => [t.id, t]));
  const injName = m.settings.injectionName;

  const move = (n) => { state.month += n; if (state.month > 12) { state.month = 1; state.year++; } if (state.month < 1) { state.month = 12; state.year--; } ctx.goTab('calendar'); };
  const refresh = () => ctx.goTab('calendar');

  const cells = grid.map((c) => {
    const d = byKey[c.key];
    const rating = d?.rating;
    const face = rating ? RATINGS.find((r) => r.v === rating)?.face : '';
    const isNext = inj.next === c.key && !d?.injection;
    const icons = [
      ...(d ? d.tags.slice(0, 2).map((t) => tagById[t.tagId]?.icon ?? '') : []),
      d?.injection ? '💉' : (isNext ? '⏰' : ''),
      d?.weight?.source === 'inbody' ? '📋' : '',
      d?.exercise?.some((x) => x.kind === 'pt') ? '🏋️' : '',
    ].join('');
    const evs = eventsOf(d).slice().sort((a, b) => (a.at ?? '99') < (b.at ?? '99') ? -1 : 1);
    const cls = ['cal-cell', !c.inMonth && 'out', c.key === today && 'today', rating && `r${rating}`, d?.injection && 'inj', isNext && 'inj-next', evs.length && 'has-ev'].filter(Boolean).join(' ');
    return h('div', { class: cls, onclick: () => daySheet(ctx, c.key, refresh) },
      h('div', { class: 'row', style: 'gap:3px;width:100%;justify-content:center' }, h('span', { class: 'n' }, c.day), face ? h('span', { class: 'f' }, face) : null),
      evs.slice(0, 2).map((ev) => h('div', { class: `ev ev-${ev.kind}${ev.status === 'skipped' ? ' ev-skip' : ''}`, title: shortLabel(ev) }, ev.title)),
      evs.length > 2 ? h('div', { class: 'ev ev-more' }, `+${evs.length - 2}`) : null,
      h('div', { class: 'i' }, icons, !face && d?.weight?.kg ? h('span', { class: 'small muted' }, ` ${d.weight.kg.toFixed(1)}`) : null));
  });

  // 다가오는 일정 (오늘부터 14일)
  const upcomingDays = await getDaysInRange(today, addDays(today, 14));
  const upcoming = upcomingDays.flatMap((d) => eventsOf(d).filter((e) => e.status !== 'skipped').map((e) => ({ ...e, day: d.day })))
    .sort((a, b) => (a.day + (a.at ?? '99')) < (b.day + (b.at ?? '99')) ? -1 : 1);

  const [mlo, mhi] = monthRange(state.year, state.month);
  const inMonth = days.filter((d) => d.day >= mlo && d.day <= mhi);
  const monthStats = summarize(inMonth.filter((d) => d.day <= today));
  const monthInjections = inMonth.filter((d) => d.injection).sort((a, b) => (a.day < b.day ? -1 : 1));

  root.replaceChildren(
    h('div', { class: 'cal-head' },
      h('button', { class: 'icon-btn', onclick: () => move(-1) }, '‹'),
      h('h1', null, `${state.year}년 ${state.month}월`),
      h('button', { class: 'icon-btn', onclick: () => move(1) }, '›')),
    h('div', { class: 'cal-grid' },
      DOW.map((d) => h('div', { class: 'cal-dow' }, d)),
      cells),
    h('div', { class: 'cal-legend' },
      h('span', null, '날짜를 누르면 일정 추가'), h('span', null, '💉 투약'), h('span', null, '⏰ 투약 예정'), h('span', null, '📋 인바디'), h('span', null, '🏋️ PT')),

    // 다가오는 일정
    h('div', { class: 'card', style: 'margin-top:12px' },
      h('div', { class: 'card-title' }, h('span', null, '📅 다가오는 일정'), h('button', { class: 'link', onclick: () => daySheet(ctx, today, refresh) }, '+ 오늘 일정')),
      upcoming.length ? upcoming.slice(0, 8).map((e) => h('div', { class: 'list-item', onclick: () => daySheet(ctx, e.day, refresh) },
        h('span', { class: 'muted small', style: 'min-width:64px' }, e.day === today ? '오늘' : e.day === addDays(today, 1) ? '내일' : fmtKey(e.day).replace(/^(\d+)월 (\d+)일.*/, '$1/$2')),
        h('span', { class: 'grow' }, `${kindOf(e.kind).icon} ${e.title}`, e.at ? h('span', { class: 'muted small' }, ` ${e.at}`) : null),
        h('span', { class: 'muted' }, '›')))
        : h('div', { class: 'empty' }, '2주 안에 일정이 없어요. 회식·약속·PT를 미리 넣어 두면 전후 식사 안내를 해 드려요.')),

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
