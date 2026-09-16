// 약·영양제 "세트" 모델과 공용 UI
// masters.medSets: [{ id, name, kind('medication'|'supplement'), slots[], items:[{id,name,dose?}], active, order }]
// 하루 기록: doc.meds[setId][slot] = { taken: [itemId...], at }
import { h, svg, openSheet } from './ui.js';
import { updateDay, getDay } from './store.js';
import { MED_SLOTS } from './defaults.js';
import { nowHM } from './date.js';

export const setSlotsOf = (s) => (s.slots?.length ? s.slots : ['breakfast']);
export const colorOf = (s) => (s.kind === 'medication' ? '#E05656' : '#3FA97B');
export const kindClass = (s) => (s.kind === 'medication' ? 'med' : 'sup');

export function takenOf(doc, setId, slot) {
  const e = doc.meds?.[setId]?.[slot];
  return Array.isArray(e?.taken) ? e.taken : [];
}
export function doneCount(doc, set, slot) {
  const taken = takenOf(doc, set.id, slot);
  return set.items.filter((i) => taken.includes(i.id)).length;
}

function bucket(d, setId) {
  const cur = d.meds[setId];
  return cur && typeof cur === 'object' && !('taken' in cur) ? cur : {};
}

export function toggleItem(day, setId, slot, itemId) {
  return updateDay(day, (d) => {
    const b = bucket(d, setId);
    const cur = Array.isArray(b[slot]?.taken) ? b[slot].taken : [];
    b[slot] = { taken: cur.includes(itemId) ? cur.filter((x) => x !== itemId) : [...cur, itemId], at: nowHM() };
    d.meds[setId] = b;
  });
}

export function setAllItems(day, set, slot, on) {
  return updateDay(day, (d) => {
    const b = bucket(d, set.id);
    b[slot] = { taken: on ? set.items.map((i) => i.id) : [], at: nowHM() };
    d.meds[set.id] = b;
  });
}

export const activeSets = (m) => (m.medSets ?? []).filter((s) => s.active !== false && s.items?.length).sort((a, b) => a.order - b.order);
export const setsForSlot = (m, slot) => activeSets(m).filter((s) => setSlotsOf(s).includes(slot));
export const slotGroups = (m) => MED_SLOTS.map((sl) => ({ ...sl, sets: setsForSlot(m, sl.key) })).filter((g) => g.sets.length);

// 파이 동그라미: done/total 만큼 채움. 다 먹으면 꽉 찬 원, 안 먹으면 테두리만.
export function medPie(set, done, total, size = 14) {
  const color = colorOf(set);
  const r = size / 2 - 1.5;
  const ratio = total ? Math.min(1, done / total) : 0;
  const el = svg('svg', { viewBox: `0 0 ${size} ${size}`, width: size, height: size, class: 'med-pie' });
  el.append(svg('circle', { cx: size / 2, cy: size / 2, r, fill: ratio >= 1 ? color : '#fff', stroke: color, 'stroke-width': 1.5 }));
  if (ratio > 0 && ratio < 1) {
    const rr = r / 2; // 반지름 절반의 원에 굵은 선을 그려 부채꼴로 채움
    el.append(svg('circle', { cx: size / 2, cy: size / 2, r: rr, fill: 'none', stroke: color, 'stroke-width': r,
      'stroke-dasharray': `${2 * Math.PI * rr * ratio} ${2 * Math.PI * rr}`, transform: `rotate(-90 ${size / 2} ${size / 2})` }));
  }
  return el;
}
export const pieFor = (doc, set, slot, size = 14) => medPie(set, doneCount(doc, set, slot), set.items.length, size);

// 세트 한 덩어리: 파이 + 이름 + 모두 버튼 + 항목 칩
export function setRow(doc, ctx, set, slot, onChange) {
  const taken = takenOf(doc, set.id, slot);
  const done = doneCount(doc, set, slot);
  const all = done === set.items.length;
  return h('div', { class: 'medset' },
    h('div', { class: 'row', style: 'margin-bottom:6px' },
      medPie(set, done, set.items.length, 20),
      h('b', { class: 'grow' }, set.name, h('span', { class: 'muted small', style: 'font-weight:500' }, ` ${done}/${set.items.length}`)),
      h('button', { class: 'btn sm ' + (all ? 'secondary' : ''), onclick: async (e) => { e.stopPropagation(); await setAllItems(ctx.day, set, slot, !all); onChange?.(); } }, all ? '모두 해제' : '모두 먹음')),
    h('div', { class: 'chips' }, set.items.map((it) => {
      const on = taken.includes(it.id);
      return h('button', { class: `chip pill ${kindClass(set)}${on ? ' on' : ''}`, onclick: async (e) => { e.stopPropagation(); await toggleItem(ctx.day, set.id, slot, it.id); onChange?.(); } },
        h('span', { class: `pill-dot ${kindClass(set)}${on ? ' on' : ''}` }), ' ', it.name, it.dose ? h('span', { class: 'muted small' }, ` ${it.dose}`) : null);
    })));
}

// 오늘 화면 약 카드 탭 → 세부 시트
export function medsSheet(doc, m, ctx) {
  openSheet({
    title: '💊 약 · 영양제',
    render: (sh) => {
      const refresh = async () => { doc = await getDay(ctx.day); sh.refresh(); };
      const groups = slotGroups(m);
      return h('div', null,
        h('div', { class: 'muted small', style: 'margin-bottom:8px' }, '빨강 = 약, 초록 = 영양제. 세트의 항목을 다 먹으면 동그라미가 꽉 차요.'),
        groups.map((g) => h('div', { class: 'med-group' },
          h('div', { class: 'med-group-title' }, `${g.icon} ${g.label}`),
          g.sets.map((set) => setRow(doc, ctx, set, g.key, refresh)))),
        h('button', { class: 'btn secondary block', style: 'margin-top:12px', onclick: () => { sh.close(); ctx.goTab('settings'); } }, '세트 구성 수정 (설정)'));
    },
  });
}
