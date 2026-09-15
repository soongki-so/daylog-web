// 의존성 없는 간단한 SVG 차트 (선/막대). 화면 폭에 맞춰 크기를 정해 글씨가 읽히게 한다.
import { svg } from './ui.js';

function dims() {
  const view = document.getElementById('view');
  const W = Math.max(300, Math.min((view?.clientWidth ?? 400) - 64, 720));
  const H = Math.round(Math.max(180, Math.min(W * 0.55, 260)));
  return { W, H, PAD: { l: 40, r: 10, t: 14, b: 26 } };
}

function scale(min, max, lo, hi) {
  const span = max - min || 1;
  return (v) => lo + ((v - min) / span) * (hi - lo);
}

function niceTicks(min, max, n = 4) {
  if (max === min) max = min + 1;
  const raw = (max - min) / n;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  const start = Math.floor(min / step) * step, end = Math.ceil(max / step) * step;
  const ticks = [];
  for (let v = start; v <= end + 1e-9; v += step) ticks.push(+v.toFixed(6));
  return { ticks, min: start, max: end };
}

const fmt = (v) => (Math.abs(v) >= 1000 ? (v / 1000).toFixed(v % 1000 ? 1 : 0) + 'k' : String(v));

function frame(d, labels, yTicks, sy, sx) {
  const g = svg('g');
  yTicks.forEach((t) => {
    const y = sy(t);
    g.append(svg('line', { x1: d.PAD.l, x2: d.W - d.PAD.r, y1: y, y2: y, stroke: '#EFE9E2', 'stroke-width': 1 }));
    g.append(svg('text', { x: d.PAD.l - 6, y: y + 4, 'text-anchor': 'end', 'font-size': 10, fill: '#8A8580' }, fmt(t)));
  });
  const n = labels.length;
  const every = Math.max(1, Math.ceil(n / Math.max(3, Math.floor(d.W / 70))));
  labels.forEach((lab, i) => {
    if (i % every !== 0 && i !== n - 1) return;
    if (i !== n - 1 && n - 1 - i < every / 2) return; // 마지막 라벨과 겹침 방지
    g.append(svg('text', { x: sx(i), y: d.H - 8, 'text-anchor': 'middle', 'font-size': 10, fill: '#8A8580' }, lab));
  });
  return g;
}

// series: [{ values: (number|null)[], color, width, dash, area, dots }]
// markers: [{ index, label, color }]  세로 점선 (예: 투약일)
// hline: { value, label, color }
export function lineChart({ labels, series, markers = [], hline = null, yMinZero = false }) {
  const d = dims();
  const all = series.flatMap((s) => s.values.filter((v) => v != null));
  if (hline) all.push(hline.value);
  if (!all.length) return empty(d);
  let lo = Math.min(...all), hi = Math.max(...all);
  if (yMinZero) lo = Math.min(0, lo);
  const padv = (hi - lo) * 0.1 || 1;
  const { ticks, min, max } = niceTicks(lo - padv, hi + padv);
  const sy = scale(min, max, d.H - d.PAD.b, d.PAD.t);
  const n = labels.length;
  const inner = d.W - d.PAD.l - d.PAD.r;
  const sx = (i) => d.PAD.l + (n > 1 ? (i / (n - 1)) * inner : inner / 2);
  const root = svg('svg', { viewBox: `0 0 ${d.W} ${d.H}`, width: d.W, height: d.H });
  root.append(frame(d, labels, ticks, sy, sx));
  markers.forEach((m) => {
    const x = sx(m.index);
    root.append(svg('line', { x1: x, x2: x, y1: d.PAD.t, y2: d.H - d.PAD.b, stroke: m.color ?? '#A58CE0', 'stroke-width': 1.5, 'stroke-dasharray': '4 3' }));
    if (m.label) root.append(svg('text', { x: x + 3, y: d.PAD.t + 9, 'font-size': 9, fill: m.color ?? '#A58CE0' }, m.label));
  });
  if (hline) {
    const y = sy(hline.value);
    root.append(svg('line', { x1: d.PAD.l, x2: d.W - d.PAD.r, y1: y, y2: y, stroke: hline.color ?? '#6FA8DC', 'stroke-width': 1.5, 'stroke-dasharray': '6 4' }));
    if (hline.label) root.append(svg('text', { x: d.W - d.PAD.r, y: y - 4, 'text-anchor': 'end', 'font-size': 9, fill: hline.color ?? '#6FA8DC' }, hline.label));
  }
  series.forEach((s) => {
    let path = '', open = false;
    const pts = [];
    s.values.forEach((v, i) => {
      if (v == null) { open = false; return; }
      const x = sx(i), y = sy(v);
      path += (open ? ' L' : ' M') + x.toFixed(1) + ' ' + y.toFixed(1);
      open = true;
      pts.push([x, y]);
    });
    if (s.area && pts.length > 1) {
      const first = pts[0], last = pts[pts.length - 1];
      root.append(svg('path', { d: `${path} L${last[0]} ${d.H - d.PAD.b} L${first[0]} ${d.H - d.PAD.b} Z`, fill: s.color, opacity: 0.08 }));
    }
    root.append(svg('path', { d: path, fill: 'none', stroke: s.color, 'stroke-width': s.width ?? 2.5, 'stroke-dasharray': s.dash ?? null, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
    if (s.dots) pts.forEach(([x, y]) => root.append(svg('circle', { cx: x, cy: y, r: 2.5, fill: s.color })));
  });
  return root;
}

// values: number[] (null → 0), color 단일 또는 함수
export function barChart({ labels, values, color = '#6FA8DC', hline = null, unitMax = null }) {
  const d = dims();
  const nums = values.map((v) => v ?? 0);
  if (!nums.some((v) => v > 0)) return empty(d);
  const hi = Math.max(...nums, hline?.value ?? 0, unitMax ?? 0);
  const { ticks, max } = niceTicks(0, hi || 1);
  const sy = scale(0, max, d.H - d.PAD.b, d.PAD.t);
  const n = labels.length;
  const inner = d.W - d.PAD.l - d.PAD.r;
  const slot = inner / n;
  const bw = Math.max(2, Math.min(slot * 0.7, 22));
  const sx = (i) => d.PAD.l + slot * i + slot / 2;
  const root = svg('svg', { viewBox: `0 0 ${d.W} ${d.H}`, width: d.W, height: d.H });
  root.append(frame(d, labels, ticks, sy, sx));
  nums.forEach((v, i) => {
    if (!v) return;
    const y = sy(v);
    const c = typeof color === 'function' ? color(v, i) : color;
    root.append(svg('rect', { x: sx(i) - bw / 2, y, width: bw, height: d.H - d.PAD.b - y, rx: Math.min(4, bw / 2), fill: c }));
  });
  if (hline) {
    const y = sy(hline.value);
    root.append(svg('line', { x1: d.PAD.l, x2: d.W - d.PAD.r, y1: y, y2: y, stroke: hline.color ?? '#F07A8F', 'stroke-width': 1.5, 'stroke-dasharray': '6 4' }));
    if (hline.label) root.append(svg('text', { x: d.W - d.PAD.r, y: y - 4, 'text-anchor': 'end', 'font-size': 9, fill: hline.color ?? '#F07A8F' }, hline.label));
  }
  return root;
}

function empty(d) {
  const root = svg('svg', { viewBox: `0 0 ${d.W} 70`, width: d.W, height: 70 });
  root.append(svg('text', { x: d.W / 2, y: 40, 'text-anchor': 'middle', 'font-size': 13, fill: '#8A8580' }, '아직 데이터가 없어요'));
  return root;
}

// 7일 이동평균 (값이 있는 날만 평균에 포함)
export function movingAverage(values, window = 7) {
  return values.map((_, i) => {
    const slice = values.slice(Math.max(0, i - window + 1), i + 1).filter((v) => v != null);
    return slice.length ? +(slice.reduce((a, b) => a + b, 0) / slice.length).toFixed(2) : null;
  });
}
