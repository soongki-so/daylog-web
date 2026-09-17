// 데이터 접근 계층. 화면은 이 파일만 사용한다.
// 1단계: IndexedDB. 2단계(Supabase)에서는 이 파일의 구현만 바꾼다.
import * as db from './db.js';
import { DEFAULT_MASTERS } from './defaults.js';

const bus = new EventTarget();
export const onChange = (fn) => bus.addEventListener('change', fn);
const emit = () => bus.dispatchEvent(new Event('change'));

export const uid = () => Math.random().toString(36).slice(2, 8) + Date.now().toString(36);

export function emptyDay(day) {
  return {
    day,
    rating: null,
    note: '',
    weight: null,        // { kg, bodyFat, muscle, source, at }
    sleep: null,         // { start, end, minutes, source }
    water: [],           // [{ id, at, ml, source }]
    exercise: [],        // [{ id, at, type, minutes, kcal, source }]
    energy: null,        // { resting, active, source }
    steps: null,         // 걸음 수 (건강 앱)
    meals: [],           // [{ id, at, type, presetId, name, kcal, satiety, note, source }]
    meds: {},            // { [medId]: { taken, at } }
    injection: null,     // { doseMg, at, note }
    tags: [],            // [{ tagId, note }]
    updatedAt: null,
  };
}

export async function getDay(day) {
  const d = await db.get('days', day);
  return d ? { ...emptyDay(day), ...d } : emptyDay(day);
}

export async function saveDay(doc) {
  doc.updatedAt = new Date().toISOString();
  await db.put('days', doc);
  emit();
  return doc;
}

// 같은 날짜에 빠르게 연속 저장해도 서로 덮어쓰지 않도록 순서대로 처리
let chain = Promise.resolve();
export function updateDay(day, mutate) {
  const run = chain.then(async () => {
    const doc = await getDay(day);
    mutate(doc);
    return saveDay(doc);
  });
  chain = run.catch(() => {});
  return run;
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
    settings: { ...DEFAULT_MASTERS.settings, ...(m.settings ?? {}) },
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
  mastersCache = mergeDefaults(m);
  await db.put('masters', mastersCache);
  emit();
  return mastersCache;
}

export function updateMasters(mutate) {
  const run = chain.then(async () => {
    const m = await getMasters();
    mutate(m);
    return saveMasters(m);
  });
  chain = run.catch(() => {});
  return run;
}

// ---- 백업 ----
export async function exportAll() {
  const [days, masters] = await Promise.all([db.getAll('days'), getMasters()]);
  return { app: 'daylog', version: 1, exportedAt: new Date().toISOString(), masters, days };
}

export async function importAll(data, { replace = false } = {}) {
  if (!data || data.app !== 'daylog' || !Array.isArray(data.days)) throw new Error('DayLog 백업 파일이 아닙니다.');
  if (replace) await db.clear('days');
  await db.putMany('days', data.days);
  if (data.masters) await saveMasters(data.masters);
  emit();
  return data.days.length;
}

export async function resetAll() {
  await db.clear('days');
  await db.clear('masters');
  mastersCache = null;
  emit();
}
