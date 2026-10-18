// 하루 기록 완성도: 그날 어떤 항목을 채웠는지 세어서 달력 날짜에 동그라미(고리)로 보여 준다
// 항목: 식사 · 물 · 운동(또는 걸음) · 수면 · 체중 · 하루평가 · 약(세트가 등록돼 있을 때만)
import { slotGroups } from './meds.js';

const anyMedTaken = (doc) => Object.values(doc?.meds ?? {}).some((bySlot) => Object.values(bySlot ?? {}).some((s) => s?.taken?.length));

export function completeness(doc, m) {
  const d = doc ?? {};
  const items = [
    { key: 'meals', icon: '🍽️', label: '식사', ok: (d.meals?.length ?? 0) > 0 },
    { key: 'water', icon: '💧', label: '물', ok: (d.water?.length ?? 0) > 0 },
    { key: 'exercise', icon: '🏃', label: '운동', ok: (d.exercise?.length ?? 0) > 0 || (d.steps ?? 0) > 0 },
    { key: 'sleep', icon: '🌙', label: '수면', ok: !!d.sleep },
    { key: 'weight', icon: '⚖️', label: '체중', ok: !!d.weight?.kg },
    { key: 'rating', icon: '🌈', label: '하루평가', ok: !!d.rating },
  ];
  if (m && slotGroups(m).length) items.push({ key: 'meds', icon: '💊', label: '약·영양제', ok: anyMedTaken(d) });
  const filled = items.filter((x) => x.ok).length;
  return { items, filled, total: items.length, ratio: items.length ? filled / items.length : 0, full: filled === items.length };
}

// 달력 칸 툴팁·일정 시트용 한 줄: "기록 4/6 · 빠짐: 수면, 체중"
export function completenessText(c) {
  const missing = c.items.filter((x) => !x.ok).map((x) => x.label);
  return `기록 ${c.filled}/${c.total}` + (missing.length ? ` · 빠짐: ${missing.join(', ')}` : ' · 다 채웠어요');
}
