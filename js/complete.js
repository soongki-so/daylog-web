// 달력 날짜 둘레의 고리 두 개
//  - 바깥(초록) completeness: 그날 "기록을 했느냐" — 식사 · 물 · 운동(또는 걸음) · 수면 · 하루평가 · 약(세트가 있을 때만). 체중은 매일 안 재도 되니 뺌
//  - 안쪽(파랑) goalProgress: "목표를 얼마나 채웠느냐" — 물 · 운동 · 수면 · 칼로리 · 약 각각 0~1, 평균이 고리 길이
import { slotGroups, activeSets, setSlotsOf, doneCount } from './meds.js';

// 설정에 값이 없을 때 쓰는 목표 (설정 → 목표 · 기본값에서 바꿀 수 있음)
const GOAL_DEFAULTS = { waterGoalMl: 2000, restingEnergy: 1300, kcalGoal: null, exerciseGoalMin: 30, sleepGoalHours: 7, stepsGoal: 8000 };

const anyMedTaken = (doc) => Object.values(doc?.meds ?? {}).some((bySlot) => Object.values(bySlot ?? {}).some((s) => s?.taken?.length));
const sum = (arr, f) => (arr ?? []).reduce((a, x) => a + (f(x) ?? 0), 0);
const clamp01 = (v) => (Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0);
const n = (v) => Math.round(v).toLocaleString('ko-KR');
const hours = (min) => (min / 60).toFixed(1).replace(/\.0$/, '');

// ---- 바깥 고리: 기록 여부 ----
export function completeness(doc, m) {
  const d = doc ?? {};
  const items = [
    { key: 'meals', icon: '🍽️', label: '식사', ok: (d.meals?.length ?? 0) > 0 },
    { key: 'water', icon: '💧', label: '물', ok: (d.water?.length ?? 0) > 0 },
    { key: 'exercise', icon: '🏃', label: '운동', ok: (d.exercise?.length ?? 0) > 0 || (d.steps ?? 0) > 0 },
    { key: 'sleep', icon: '🌙', label: '수면', ok: !!d.sleep },
    { key: 'rating', icon: '🌈', label: '하루평가', ok: !!d.rating },
  ];
  if (m && slotGroups(m).length) items.push({ key: 'meds', icon: '💊', label: '약·영양제', ok: anyMedTaken(d) });
  const filled = items.filter((x) => x.ok).length;
  return { items, filled, total: items.length, ratio: items.length ? filled / items.length : 0, full: filled === items.length };
}

// 달력 칸 툴팁·일정 시트용 한 줄: "기록 4/6 · 빠짐: 수면, 약·영양제"
export function completenessText(c) {
  const missing = c.items.filter((x) => !x.ok).map((x) => x.label);
  return `기록 ${c.filled}/${c.total}` + (missing.length ? ` · 빠짐: ${missing.join(', ')}` : ' · 다 채웠어요');
}

// ---- 안쪽 고리: 목표 달성 ----
export function goalProgress(doc, m) {
  const d = doc ?? {};
  const s = { ...GOAL_DEFAULTS, ...(m?.settings ?? {}) };
  const items = [];

  const waterMl = sum(d.water, (x) => x.ml);
  items.push({ key: 'water', icon: '💧', label: '물', ratio: clamp01(waterMl / s.waterGoalMl), text: `${n(waterMl)}/${n(s.waterGoalMl)}ml` });

  // 운동: 운동 시간 목표와 걸음 목표 중 더 많이 채운 쪽 (걸음은 건강 앱에서 들어온 날만 의미 있음)
  const exMin = sum(d.exercise, (x) => x.minutes);
  const rEx = s.exerciseGoalMin > 0 ? exMin / s.exerciseGoalMin : 0;
  const rSteps = d.steps > 0 && s.stepsGoal > 0 ? d.steps / s.stepsGoal : 0;
  items.push({ key: 'exercise', icon: '🏃', label: '운동', ratio: clamp01(Math.max(rEx, rSteps)),
    text: rSteps > rEx ? `${n(d.steps)}/${n(s.stepsGoal)}걸음` : `${exMin}/${s.exerciseGoalMin}분` });

  const sleepMin = d.sleep?.minutes ?? 0;
  const sleepGoalMin = (s.sleepGoalHours || 7) * 60;
  items.push({ key: 'sleep', icon: '🌙', label: '수면', ratio: clamp01(sleepMin / sleepGoalMin), text: `${hours(sleepMin)}/${s.sleepGoalHours}시간` });

  // 칼로리: 목표 이하면 달성(1), 넘으면 넘은 만큼 깎임(목표/섭취). 식사 기록이 없으면 0.
  // 목표는 설정의 '목표 섭취 kcal', 비어 있으면 그날 소모(안정시 + 활동)
  const intake = sum(d.meals, (x) => x.kcal);
  const active = d.energy?.active ?? sum(d.exercise, (x) => x.kcal);
  const target = s.kcalGoal > 0 ? s.kcalGoal : (d.energy?.resting ?? s.restingEnergy) + active;
  const rK = !(d.meals?.length) ? 0 : intake <= target ? 1 : target / intake;
  items.push({ key: 'kcal', icon: '🍽️', label: '칼로리', ratio: clamp01(rK), text: `${n(intake)}/${n(target)}kcal${s.kcalGoal > 0 ? '' : '(소모 기준)'}` });

  // 약·영양제: 세트가 있을 때만. 끼니별 항목 중 체크한 비율
  if (m && slotGroups(m).length) {
    let done = 0, total = 0;
    for (const set of activeSets(m)) for (const slot of setSlotsOf(set)) { total += set.items.length; done += doneCount(d, set, slot); }
    items.push({ key: 'meds', icon: '💊', label: '약·영양제', ratio: clamp01(total ? done / total : 0), text: `${done}/${total}개` });
  }

  const ratio = items.length ? items.reduce((a, x) => a + x.ratio, 0) / items.length : 0;
  return { items, ratio, pct: Math.round(ratio * 100), full: items.length > 0 && items.every((x) => x.ratio >= 1) };
}

// "목표 72% · 물 1,200/2,000ml, 운동 20/30분, 수면 6.5/7시간, 칼로리 1,900/2,100kcal(소모 기준), 약·영양제 2/3개"
export function goalText(g) {
  return `목표 ${g.pct}%` + (g.items.length ? ' · ' + g.items.map((x) => `${x.label} ${x.text}`).join(', ') : '');
}
