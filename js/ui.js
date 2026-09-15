// 작은 UI 도우미: DOM 생성, 시트(하단 모달), 토스트, 링 게이지

export function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'html') el.innerHTML = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'value') el.value = v;
      else if (k === 'checked') el.checked = !!v;
      else el.setAttribute(k, v === true ? '' : v);
    }
  }
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return el;
}

export function svg(tag, attrs, ...children) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k, v] of Object.entries(attrs ?? {})) if (v != null) el.setAttribute(k, v);
  for (const c of children.flat(Infinity)) if (c != null) el.append(c.nodeType ? c : document.createTextNode(String(c)));
  return el;
}

let sheetCount = 0;
export function openSheet({ title, render, onClose }) {
  const root = document.getElementById('sheet-root');
  const body = h('div', { class: 'sheet-body' });
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    overlay.remove();
    sheetCount--;
    if (sheetCount === 0) document.body.style.overflow = '';
    onClose?.();
  };
  const overlay = h('div', { class: 'sheet-overlay', onclick: (e) => { if (e.target === overlay) close(); } },
    h('div', { class: 'sheet', role: 'dialog', 'aria-label': title },
      h('div', { class: 'sheet-grab' }),
      h('div', { class: 'sheet-head' },
        h('h2', null, title),
        h('button', { class: 'icon-btn plain', onclick: close, 'aria-label': '닫기' }, '✕')),
      body));
  const api = { close, refresh: () => { body.replaceChildren(); const r = render(api); if (r) body.append(r); } };
  api.refresh();
  root.append(overlay);
  sheetCount++;
  document.body.style.overflow = 'hidden';
  return api;
}

let toastTimer;
export function toast(msg) {
  const root = document.getElementById('toast-root');
  root.replaceChildren(h('div', { class: 'toast' }, msg));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => root.replaceChildren(), 1800);
}

export function ring({ value, max, color = 'var(--accent)', track = '#F1ECE5', stroke = 12 }) {
  const size = 132, r = (size - stroke) / 2, c = 2 * Math.PI * r;
  const ratio = max > 0 ? Math.min(value / max, 1) : 0;
  return svg('svg', { viewBox: `0 0 ${size} ${size}` },
    svg('circle', { cx: size / 2, cy: size / 2, r, fill: 'none', stroke: track, 'stroke-width': stroke }),
    svg('circle', { cx: size / 2, cy: size / 2, r, fill: 'none', stroke: color, 'stroke-width': stroke,
      'stroke-linecap': 'round', 'stroke-dasharray': c, 'stroke-dashoffset': c * (1 - ratio) }));
}

export const fmtKcal = (n) => (n == null ? '-' : Math.round(n).toLocaleString('ko-KR'));
export const numOr = (v, fallback = null) => { const n = parseFloat(v); return Number.isFinite(n) ? n : fallback; };

export function field(label, input) {
  return h('div', { class: 'field' }, h('label', null, label), input);
}

export function input(attrs) {
  return h('input', { class: 'input', ...attrs });
}

export function select(options, value, attrs = {}) {
  const el = h('select', { class: 'input', ...attrs },
    options.map((o) => h('option', { value: o.value ?? o, selected: (o.value ?? o) === value }, o.label ?? o)));
  return el;
}
