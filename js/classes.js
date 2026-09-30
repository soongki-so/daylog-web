// 운동 수업(PT·필라테스·요가 등): 사용자가 설정에서 등록하고, 운동 기록·일정에서 고르면 회차가 이어진다
// masters.classes: [{ id, name, icon, total(등록 횟수|null), done(앱 쓰기 전 완료), active, order }]
// 운동 기록: { kind: 'class', classId, type: 수업 이름 } (예전 { kind: 'pt' }는 'c_pt'로 취급)
import { getDaysInRange } from './store.js';

export const CLASS_ICONS = ['🏋️', '🧘', '🤸', '🏊', '🚴', '🥊', '⛳', '🎾', '💃', '🏃', '🧗', '⚽'];

// 예전 설정(ptTotal/ptDone)만 있는 사용자 → PT 수업 하나로
function legacyPt(m) {
  return { id: 'c_pt', name: 'PT', icon: '🏋️', total: m.settings?.ptTotal ?? 30, done: m.settings?.ptDone ?? 0, active: true, order: 1 };
}
export function allClasses(m) {
  return Array.isArray(m.classes) ? m.classes.slice().sort((a, b) => a.order - b.order) : [legacyPt(m)];
}
export const activeClasses = (m) => allClasses(m).filter((c) => c.active !== false);
export const classById = (m, id) => allClasses(m).find((c) => c.id === id) ?? null;

// 운동 기록이 어느 수업인지 (예전 kind:'pt' 호환)
export const classIdOf = (x) => x?.classId ?? (x?.kind === 'pt' ? 'c_pt' : null);

// 회차: 앱 쓰기 전 완료 + 이 날짜까지 기록된 수업 수
export async function classProgress(day, cls) {
  const days = await getDaysInRange('2000-01-01', day);
  let before = cls.done ?? 0, today = 0;
  for (const d of days) for (const x of d.exercise) if (classIdOf(x) === cls.id) { if (d.day < day) before++; else today++; }
  return { before, today, upTo: before + today, total: cls.total ?? null, left: cls.total ? Math.max(0, cls.total - before - today) : null };
}

export const progressText = (p) => (p.total ? `${p.upTo}/${p.total}회` : `${p.upTo}회`);
