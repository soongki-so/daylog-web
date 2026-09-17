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
  const api = { close, refresh: async () => { body.replaceChildren(); const r = await render(api); if (r) body.append(r); } };
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

// 인바디 앱 CSV 가져오기 (설정과 체중 시트에서 공용)
export function inbodyCsvPicker(onDone) {
  const fileIn = h('input', { type: 'file', accept: '.csv,text/csv,text/plain', style: 'display:none' });
  fileIn.onchange = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try {
      const { parseInBodyCsv, importInBodyRows } = await import('./inbody.js');
      const rows = parseInBodyCsv(await f.text());
      if (!rows.length) throw new Error('체중 값이 있는 줄이 없어요.');
      const first = rows[0].day, last = rows[rows.length - 1].day;
      if (!confirm(`인바디 기록 ${rows.length}건 (${first} ~ ${last})을 가져올까요?\n같은 날짜의 체중은 인바디 값으로 바뀝니다.`)) return;
      const r = await importInBodyRows(rows);
      if (r.latest?.bmr && confirm(`최근 기초대사량 ${r.latest.bmr}kcal을 "안정시 에너지" 기본값으로 쓸까요?`)) {
        const { updateMasters } = await import('./store.js');
        await updateMasters((mm) => { mm.settings.restingEnergy = r.latest.bmr; });
      }
      toast(`인바디 ${rows.length}건 가져왔어요`);
      onDone?.(r);
    } catch (err) { alert('가져오기 실패: ' + err.message); }
    e.target.value = '';
  };
  return { input: fileIn, open: () => fileIn.click() };
}

// 건강 앱 데이터 가져오기 (클립보드) — 오늘 화면 🍎 버튼과 설정에서 공용
export async function healthImportAction(ctx) {
  try {
    const { importFromClipboard } = await import('./health.js');
    const r = await importFromClipboard();
    toast(`건강 데이터 ${r.count}일치 가져왔어요`);
    return r;
  } catch (err) {
    const inArtifact = /claude\.ai/.test(location.hostname) || window.top !== window.self;
    alert((inArtifact ? '이 미리보기 페이지에서는 클립보드를 읽을 수 없어요. 정식 주소에서 눌러 주세요.\n\n' : '') + err.message
      + '\n\n아이폰에서는 🍎를 누른 직후 화면에 뜨는 "붙여넣기" 버튼을 눌러야 읽혀요. 안 되면 설정의 붙여넣기 칸을 쓰세요.');
    if (ctx?.goTab) { ctx.goTab('settings'); setTimeout(() => document.getElementById('health-paste')?.scrollIntoView({ block: 'center' }), 300); }
    return null;
  }
}
