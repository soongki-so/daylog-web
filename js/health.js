// 아이폰 건강 앱 데이터 가져오기 (단축어가 만든 텍스트 → 하루 기록)
// 형식 (한 줄에 하나, 순서 무관, 여러 날은 date: 줄로 구분):
//   DAYLOG-HEALTH
//   date: 2026-09-16
//   steps: 8234
//   active: 420          활동 에너지 kcal
//   resting: 1380        안정시 에너지 kcal
//   sleep_start: 2026. 9. 15. 오후 11:40
//   sleep_end: 2026. 9. 16. 오전 6:50
//   sleep_minutes: 410
//   weight: 62.3
//   workout: 걷기 | 2026. 9. 16. 오후 6:00 | 40 | 180     (종류 | 시작 | 분 | kcal)
import { getDay, updateDay, uid } from './store.js';
import { keyOf, pad, sleepMinutes } from './date.js';

const num = (v) => { const n = parseFloat(String(v).replace(/,/g, '').match(/-?\d+(\.\d+)?/)?.[0] ?? ''); return Number.isFinite(n) ? n : null; };

// "55분 24초", "1시간 5분", "1:05:30", "55:24", "55.4 min", "3324초", "3324 s" → 분
export function parseMinutes(v) {
  if (v == null) return null;
  const t = String(v).trim();
  if (!t) return null;
  const colon = t.match(/^(\d+):(\d{1,2})(?::(\d{1,2}))?$/);
  if (colon) return colon[3] != null ? (+colon[1] * 60 + +colon[2] + +colon[3] / 60) : (+colon[1] + +colon[2] / 60);
  let total = 0, hit = false;
  const hr = t.match(/(\d+(?:\.\d+)?)\s*(시간|h|hr|hours?)/i); if (hr) { total += +hr[1] * 60; hit = true; }
  const mn = t.match(/(\d+(?:\.\d+)?)\s*(분|m|min)/i); if (mn) { total += +mn[1]; hit = true; }
  const sc = t.match(/(\d+(?:\.\d+)?)\s*(초|s|sec)/i); if (sc) { total += +sc[1] / 60; hit = true; }
  if (hit) return total;
  const n = num(t);
  if (n == null) return null;
  return n > 600 ? n / 60 : n; // 단위 없는 큰 수는 초로 간주
}

// "2026. 9. 16. 오후 11:40", "2026-09-16 23:40", "2026/09/16 11:40 PM" 등 → { day, hm }
export function parseDateTime(text) {
  if (!text) return null;
  const t = String(text).trim();
  const dm = t.match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})/);
  if (!dm) return null;
  const y = +dm[1], mo = +dm[2], d = +dm[3];
  let hm = null;
  const tm = t.match(/(\d{1,2}):(\d{2})/);
  if (tm) {
    let hh = +tm[1]; const mm = +tm[2];
    const pm = /오후|PM|pm/.test(t), am = /오전|AM|am/.test(t);
    if (pm && hh < 12) hh += 12;
    if (am && hh === 12) hh = 0;
    hm = `${pad(hh)}:${pad(mm)}`;
  }
  return { day: keyOf(new Date(y, mo - 1, d)), hm };
}

export function parseHealthText(text) {
  const lines = String(text).replace(/\r/g, '').split('\n').map((l) => l.trim()).filter(Boolean);
  if (!lines.some((l) => /^DAYLOG-HEALTH/i.test(l)) && !lines.some((l) => /^(date|steps|sleep_start|active|workout)\s*[:=]/i.test(l))) {
    throw new Error('DayLog 건강 데이터 형식이 아니에요. 단축어를 먼저 실행해 주세요.');
  }
  const days = [];
  let cur = null;
  const ensure = () => { if (!cur) { cur = { day: keyOf(new Date()), workouts: [] }; days.push(cur); } return cur; };
  for (const line of lines) {
    const m = line.match(/^([a-zA-Z_]+)\s*[:=]\s*(.*)$/);
    if (!m) continue;
    const key = m[1].toLowerCase(), val = m[2].trim();
    if (key === 'date') {
      const dt = parseDateTime(val);
      cur = { day: dt?.day ?? keyOf(new Date()), workouts: [] };
      days.push(cur);
      continue;
    }
    const c = ensure();
    if (key === 'steps') c.steps = num(val);
    else if (key === 'active') c.active = num(val);
    else if (key === 'resting') c.resting = num(val);
    else if (key === 'weight') c.weight = num(val);
    else if (key === 'sleep_minutes') c.sleepMinutes = parseMinutes(val);
    else if (key === 'sleep_start') c.sleepStart = parseDateTime(val);
    else if (key === 'sleep_end') c.sleepEnd = parseDateTime(val);
    else if (key === 'workout') {
      const parts = val.split('|').map((x) => x.trim());
      const [type, start, minutes, kcal] = parts;
      if (type) c.workouts.push({ type, start: parseDateTime(start), minutes: parseMinutes(minutes), kcal: num(kcal) });
    }
  }
  return days.filter((d) => d.steps != null || d.active != null || d.resting != null || d.weight != null || d.sleepMinutes != null || d.sleepStart || d.workouts.length);
}

// 손으로 넣은 값은 유지, 건강 앱 값은 비어 있거나 이전 건강 앱 값일 때만 채움
export async function importHealthDays(rows) {
  let count = 0;
  const summary = [];
  for (const r of rows) {
    const cur = await getDay(r.day);
    await updateDay(r.day, (d) => {
      if (r.steps != null) d.steps = r.steps;
      if (r.active != null || r.resting != null) {
        if (!d.energy || d.energy.source === 'health') {
          d.energy = { resting: r.resting ?? d.energy?.resting ?? null, active: r.active ?? d.energy?.active ?? null, source: 'health' };
        }
      }
      if ((r.sleepStart?.hm && r.sleepEnd?.hm) || r.sleepMinutes) {
        if (!d.sleep || d.sleep.source === 'health') {
          const start = r.sleepStart?.hm ?? d.sleep?.start ?? null, end = r.sleepEnd?.hm ?? d.sleep?.end ?? null;
          const minutes = r.sleepMinutes ?? (start && end ? sleepMinutes(start, end) : null);
          if (minutes) d.sleep = { start, end, minutes: Math.round(minutes), source: 'health' };
        }
      }
      if (r.weight && !d.weight) d.weight = { kg: r.weight, source: 'health', at: '07:00' };
      for (const w of r.workouts) {
        if (!w.minutes) continue;
        const at = w.start?.hm ?? null;
        const dup = d.exercise.find((x) => x.source === 'health' && x.type === w.type && x.at === at);
        const rec = { id: dup?.id ?? uid(), at, type: w.type, minutes: Math.round(w.minutes), kcal: w.kcal != null ? Math.round(w.kcal) : null, source: 'health' };
        if (dup) Object.assign(dup, rec); else d.exercise.push(rec);
      }
    });
    count++;
    const parts = [];
    if (r.steps != null) parts.push(`걸음 ${Math.round(r.steps).toLocaleString('ko-KR')}`);
    if (r.sleepMinutes || (r.sleepStart && r.sleepEnd)) parts.push('수면');
    if (r.workouts.length) parts.push(`운동 ${r.workouts.length}건`);
    if (r.active != null) parts.push(`활동 ${Math.round(r.active)}kcal`);
    summary.push(`${r.day}: ${parts.join(', ') || '값 없음'}`);
    void cur;
  }
  return { count, summary };
}

// 클립보드 → 가져오기 (버튼 탭에서 호출해야 함)
export async function importFromClipboard() {
  let text = '';
  try { text = await navigator.clipboard.readText(); } catch { throw new Error('클립보드를 읽지 못했어요. 아래 칸에 붙여넣기 해 주세요.'); }
  if (!text.trim()) throw new Error('클립보드가 비어 있어요. 단축어를 먼저 실행해 주세요.');
  const rows = parseHealthText(text);
  if (!rows.length) throw new Error('가져올 값이 없어요.');
  return importHealthDays(rows);
}

export const SHORTCUT_TEMPLATE = `DAYLOG-HEALTH
date: [오늘 날짜]
steps: [걸음 수 합계]
active: [활동 에너지 합계]
resting: [안정시 에너지 합계]
sleep_start: [수면 첫 샘플 시작]
sleep_end: [수면 마지막 샘플 종료]
sleep_minutes: [수면 시간 합계(분)]
weight: [최근 체중]
workout: [운동 종류] | [시작 날짜] | [운동 시간(분)] | [활동 에너지]`;
