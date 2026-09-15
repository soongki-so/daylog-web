// 날짜 유틸. 하루 키는 "YYYY-MM-DD" (기기 로컬 시간대 기준)
export const pad = (n) => String(n).padStart(2, '0');
export const keyOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export function todayKey(boundaryHour = 0) {
  const d = new Date();
  d.setHours(d.getHours() - boundaryHour);
  return keyOf(d);
}

export function parseKey(k) {
  const [y, m, d] = k.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(k, n) {
  const d = parseKey(k);
  d.setDate(d.getDate() + n);
  return keyOf(d);
}

export function diffDays(a, b) {
  return Math.round((parseKey(b) - parseKey(a)) / 86400000);
}

export const DOW = ['일', '월', '화', '수', '목', '금', '토'];

export function fmtKey(k, { year = false } = {}) {
  const d = parseKey(k);
  const base = `${d.getMonth() + 1}월 ${d.getDate()}일 (${DOW[d.getDay()]})`;
  return year ? `${d.getFullYear()}년 ${base}` : base;
}

export function fmtShort(k) {
  const d = parseKey(k);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

export function nowHM() {
  const d = new Date();
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function minutesToText(m) {
  if (m == null) return '-';
  const h = Math.floor(m / 60), mm = m % 60;
  return h ? `${h}시간 ${mm ? mm + '분' : ''}`.trim() : `${mm}분`;
}

// 취침 "23:30", 기상 "07:10" → 분. 취침이 기상보다 늦으면 전날 취침으로 본다.
export function sleepMinutes(start, end) {
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  let s = sh * 60 + sm, e = eh * 60 + em;
  if (e <= s) e += 24 * 60;
  return e - s;
}

// 해당 월의 달력 격자 (일요일 시작, 6주)
export function monthGrid(year, month /* 1-12 */) {
  const first = new Date(year, month - 1, 1);
  const startOffset = first.getDay();
  const cells = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(year, month - 1, 1 - startOffset + i);
    cells.push({ key: keyOf(d), day: d.getDate(), inMonth: d.getMonth() === month - 1 });
  }
  return cells;
}

export function monthRange(year, month) {
  const last = new Date(year, month, 0).getDate();
  return [`${year}-${pad(month)}-01`, `${year}-${pad(month)}-${pad(last)}`];
}
