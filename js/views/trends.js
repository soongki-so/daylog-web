// 변화: 기간별 체중(7일 평균, 투약 마커), 에너지, 수면, 운동, 물
import { h } from '../ui.js';
import { getDaysInRange, getMasters } from '../store.js';
import { addDays, todayKey, fmtShort, diffDays } from '../date.js';
import { lineChart, barChart, movingAverage } from '../charts.js';
import { energyOf } from './today.js';

const PERIODS = [
  { key: '1m', label: '1개월', days: 30 },
  { key: '3m', label: '3개월', days: 91 },
  { key: '6m', label: '6개월', days: 182 },
  { key: '1y', label: '1년', days: 365 },
  { key: 'all', label: '전체', days: null },
];
const state = { period: '1m' };

export async function renderTrends(root, ctx) {
  const m = await getMasters();
  const today = todayKey(m.settings.dayBoundaryHour);
  const p = PERIODS.find((x) => x.key === state.period);
  let lo = p.days ? addDays(today, -(p.days - 1)) : '2000-01-01';
  let days = await getDaysInRange(lo, today);
  if (!p.days) lo = days.length ? days[0].day : addDays(today, -29);
  const n = diffDays(lo, today) + 1;
  const byKey = Object.fromEntries(days.map((d) => [d.day, d]));
  const keys = Array.from({ length: n }, (_, i) => addDays(lo, i));
  const labels = keys.map(fmtShort);
  const docs = keys.map((k) => byKey[k] ?? null);

  // 체중
  const weight = docs.map((d) => d?.weight?.kg ?? null);
  const avg7 = movingAverage(weight, 7);
  const injMarkers = docs.map((d, i) => (d?.injection ? { index: i, label: `${d.injection.doseMg}mg` } : null)).filter(Boolean);
  const wVals = weight.filter((v) => v != null);

  // 체성분 (인바디)
  const muscle = docs.map((d) => d?.weight?.muscle ?? null);
  const fatPct = docs.map((d) => d?.weight?.bodyFat ?? null);
  const hasComp = muscle.some((v) => v != null) || fatPct.some((v) => v != null);

  // 에너지
  const intake = docs.map((d) => (d && d.meals.length ? energyOf(d, m.settings).intake : null));
  const expend = docs.map((d) => (d && (d.meals.length || d.exercise.length || d.energy) ? energyOf(d, m.settings).expenditure : null));

  // 수면 / 운동 / 물
  const sleepH = docs.map((d) => (d?.sleep ? +(d.sleep.minutes / 60).toFixed(1) : null));
  const exMin = docs.map((d) => (d ? d.exercise.reduce((a, x) => a + (x.minutes ?? 0), 0) || null : null));
  const water = docs.map((d) => (d ? d.water.reduce((a, x) => a + x.ml, 0) || null : null));

  const avg = (arr) => { const v = arr.filter((x) => x != null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };

  root.replaceChildren(
    h('div', { class: 'cal-head' }, h('h1', null, '변화')),
    h('div', { class: 'periods' }, PERIODS.map((x) => h('button', { class: x.key === state.period ? 'on' : '', onclick: () => { state.period = x.key; ctx.goTab('trends'); } }, x.label))),

    chartCard('⚖️ 체중', [
      ['최근', wVals.length ? `${wVals[wVals.length - 1].toFixed(1)} kg` : '-'],
      ['기간 변화', wVals.length >= 2 ? `${(wVals[wVals.length - 1] - wVals[0]) > 0 ? '+' : ''}${(wVals[wVals.length - 1] - wVals[0]).toFixed(1)} kg` : '-'],
      ['7일 평균', avg7.filter((v) => v != null).slice(-1)[0]?.toFixed(1) ?? '-'],
    ], lineChart({ labels, series: [
      { values: weight, color: '#F5C2CC', width: 1.5, dots: true },
      { values: avg7, color: '#F07A8F', width: 3 },
    ], markers: injMarkers }), '연한 선: 일별 · 진한 선: 7일 평균 · 점선: 투약일'),

    hasComp && chartCard('📋 체성분 (인바디)', [
      ['골격근량', muscle.filter((v) => v != null).slice(-1)[0] != null ? `${muscle.filter((v) => v != null).slice(-1)[0]} kg` : '-'],
      ['체지방률', fatPct.filter((v) => v != null).slice(-1)[0] != null ? `${fatPct.filter((v) => v != null).slice(-1)[0]} %` : '-'],
    ], lineChart({ labels, series: [
      { values: muscle, color: '#6CC3A5', width: 2.5, dots: true },
      { values: fatPct, color: '#F5B84D', width: 2.5, dots: true },
    ] }), '초록: 골격근량(kg) · 노랑: 체지방률(%)'),

    chartCard('🔥 에너지', [
      ['평균 섭취', avg(intake) ? `${Math.round(avg(intake))} kcal` : '-'],
      ['평균 소모', avg(expend) ? `${Math.round(avg(expend))} kcal` : '-'],
      ['평균 밸런스', avg(intake) && avg(expend) ? `${Math.round(avg(intake) - avg(expend)) > 0 ? '+' : ''}${Math.round(avg(intake) - avg(expend))}` : '-'],
    ], lineChart({ labels, series: [
      { values: expend, color: '#6CC3A5', width: 2, dash: '5 4' },
      { values: intake, color: '#F5B84D', width: 2.5, area: true },
    ], yMinZero: true }), '노란 선: 섭취 · 초록 점선: 총 소모(안정시+활동)'),

    chartCard('🌙 수면', [
      ['평균', avg(sleepH) ? `${avg(sleepH).toFixed(1)} 시간` : '-'],
      ['기록 일수', `${sleepH.filter((v) => v != null).length}일`],
    ], barChart({ labels, values: sleepH, color: (v) => (v < 6 ? '#F5B84D' : '#A58CE0'), hline: { value: 7, label: '7시간', color: '#A58CE0' }, unitMax: 9 })),

    chartCard('🏃 운동', [
      ['총 시간', `${exMin.reduce((a, b) => a + (b ?? 0), 0)} 분`],
      ['운동한 날', `${exMin.filter((v) => v).length}일`],
    ], barChart({ labels, values: exMin, color: '#6CC3A5' })),

    chartCard('💧 물', [
      ['평균', avg(water) ? `${Math.round(avg(water))} ml` : '-'],
      ['목표 달성', `${water.filter((v) => v >= m.settings.waterGoalMl).length}일`],
    ], barChart({ labels, values: water, color: (v) => (v >= m.settings.waterGoalMl ? '#6FA8DC' : '#B9D6EE'), hline: { value: m.settings.waterGoalMl, label: '목표', color: '#6FA8DC' } })),
  );
}

function chartCard(title, stats, chart, caption) {
  return h('div', { class: 'card chart-card' },
    h('h3', null, title),
    h('div', { class: 'chart-stats' }, stats.map(([k, v]) => h('span', null, `${k} `, h('b', null, v)))),
    h('div', { class: 'chart' }, chart),
    caption && h('div', { class: 'muted small', style: 'margin-top:6px' }, caption));
}
