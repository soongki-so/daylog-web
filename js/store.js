// 데이터 접근 계층. 화면은 이 파일만 사용한다.
// 기기 안(IndexedDB)이 화면의 기준이고, 로그인하면 sync.js가 서버(Supabase)와 맞춘다.
import * as db from './db.js';
import { DEFAULT_MASTERS } from './defaults.js';

const bus = new EventTarget();
export const onChange = (fn) => bus.addEventListener('change', fn);
const emit = () => bus.dispatchEvent(new Event('change'));
let emitTimer;
const emitSoon = () => { clearTimeout(emitTimer); emitTimer = setTimeout(emit, 50); };

// sync.js가 등록: 로컬 변경이 생기면 ('day', key) 또는 ('masters') 로 알려 준다
let syncHook = null;
export const setSyncHook = (fn) => { syncHook = fn; };
const notifySync = (kind, key) => { try { syncHook?.(kind, key); } catch { /* 동기화 실패는 기록 저장을 막지 않음 */ } };

export const uid = () => Math.random().toString(36).slice(2, 8) + Date.now().toString(36);

export function emptyDay(day) {
  return {
    day,
    rating: null,
    note: '',
    weight: null,        // { kg, bodyFat, muscle, source, at }
    sleep: null,         // { start, end, minutes, source }
    water: [],           // [{ id, at, ml, source }]
    exercise: [],        // [{ id, at, type, kind, minutes, kcal, source }]
    energy: null,        // { resting, active, source }
    steps: null,         // 걸음 수 (건강 앱)
    meals: [],           // [{ id, at, type, presetId, name, kcal, satiety, note, photo, source }]
    meds: {},            // { [setId]: { [slot]: { taken: [itemId], at } } }
    injection: null,     // { doseMg, at, note }
    tags: [],            // [{ tagId, note }]
    events: [],          // [{ id, kind, title, at, note, status }] 미리 넣는 일정
    updatedAt: null,
  };
}

export async function getDay(day) {
  const d = await db.get('days', day);
  return d ? { ...emptyDay(day), ...d } : emptyDay(day);
}

// 동기화용: 저장된 그대로 (없으면 null)
export const getDayRaw = (day) => db.get('days', day);

export async function saveDay(doc) {
  doc.updatedAt = new Date().toISOString();
  await db.put('days', doc);
  emit();
  notifySync('day', doc.day);
  return doc;
}

// 같은 날짜에 빠르게 연속 저장해도 서로 덮어쓰지 않도록 순서대로 처리
let chain = Promise.resolve();
function queue(fn) {
  const run = chain.then(fn);
  chain = run.catch(() => {});
  return run;
}

export function updateDay(day, mutate) {
  return queue(async () => {
    const doc = await getDay(day);
    mutate(doc);
    return saveDay(doc);
  });
}

export const getDaysInRange = (lo, hi) => db.getRange('days', lo, hi);
export const getAllDays = () => db.getAll('days');

let mastersCache = null;

// 예전 개별 약 목록 → 약 1개짜리 세트로 변환 (처음 설치면 기본 세트)
function migrateSets(meds) {
  // 비어 있거나 처음 깔릴 때 들어간 샘플(종합비타민·오메가3) 그대로면 새 기본 세트로
  if (!Array.isArray(meds) || !meds.length || meds.every((x) => ['m_vita', 'm_omega'].includes(x.id))) return structuredClone(DEFAULT_MASTERS.medSets);
  return meds.map((x, i) => ({ id: x.id, name: x.name, kind: x.kind ?? 'supplement', slots: x.slots?.length ? x.slots : ['breakfast'],
    active: x.active !== false, order: x.order ?? i + 1, items: [{ id: x.id + '_i', name: x.name, dose: x.dose ?? null }] }));
}

function mergeDefaults(m) {
  return {
    id: 'main',
    presets: m.presets ?? structuredClone(DEFAULT_MASTERS.presets),
    medications: m.medications ?? [],
    medSets: m.medSets ?? migrateSets(m.medications),
    tags: m.tags ?? structuredClone(DEFAULT_MASTERS.tags),
    classes: Array.isArray(m.classes) ? m.classes : undefined, // 없으면 예전 PT 설정으로 대신 (classes.js)
    settings: { ...DEFAULT_MASTERS.settings, ...(m.settings ?? {}) },
    updatedAt: m.updatedAt ?? null,
  };
}

export async function getMasters() {
  if (mastersCache) return mastersCache;
  const m = await db.get('masters', 'main');
  mastersCache = mergeDefaults(m ?? {});
  if (!m) await db.put('masters', mastersCache);
  return mastersCache;
}

export async function saveMasters(m) {
  mastersCache = mergeDefaults({ ...m, updatedAt: new Date().toISOString() });
  await db.put('masters', mastersCache);
  emit();
  notifySync('masters');
  return mastersCache;
}

export function updateMasters(mutate) {
  return queue(async () => {
    const m = await getMasters();
    mutate(m);
    return saveMasters(m);
  });
}

// ---- 서버에서 받은 값 반영 (동기화 표시는 하지 않음) ----
// 서버 쪽이 더 최근이면 덮어쓰고 true. 기기 쪽이 더 최근이면 다시 올리도록 알림.
export function applyRemoteDay(data, remoteUpdatedAt) {
  return queue(async () => {
    if (!data?.day) return false;
    const local = await db.get('days', data.day);
    const r = data.updatedAt ?? remoteUpdatedAt ?? '';
    const l = local?.updatedAt ?? '';
    if (!local || l < r) { await db.put('days', data); emitSoon(); return true; }
    if (l > r) notifySync('day', data.day);
    return false;
  });
}

export function applyRemoteMasters(data, remoteUpdatedAt) {
  return queue(async () => {
    if (!data) return false;
    const local = await db.get('masters', 'main');
    const r = data.updatedAt ?? remoteUpdatedAt ?? '';
    const l = local?.updatedAt ?? '';
    if (!local || l < r) {
      mastersCache = mergeDefaults({ ...data, updatedAt: r });
      await db.put('masters', mastersCache);
      emitSoon();
      return true;
    }
    if (l > r) notifySync('masters');
    return false;
  });
}

// ---- 백업 ----
export async function exportAll() {
  const [days, masters] = await Promise.all([db.getAll('days'), getMasters()]);
  return { app: 'daylog', version: 1, exportedAt: new Date().toISOString(), masters, days };
}

export async function importAll(data, { replace = false } = {}) {
  if (!data || data.app !== 'daylog' || !Array.isArray(data.days)) throw new Error('DayLog 백업 파일이 아닙니다.');
  if (replace) await db.clear('days');
  const stamp = new Date().toISOString();
  const days = data.days.map((d) => ({ ...d, updatedAt: d.updatedAt ?? stamp }));
  await db.putMany('days', days);
  if (data.masters) await saveMasters(data.masters);
  days.forEach((d) => notifySync('day', d.day));
  emit();
  return days.length;
}

export async function resetAll() {
  await db.clear('days');
  await db.clear('masters');
  mastersCache = null;
  emit();
}
