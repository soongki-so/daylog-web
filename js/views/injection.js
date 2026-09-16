// 투약(마운자로 등 주 1회 주사) 기록 시트 — 달력에서 사용
import { h, openSheet, toast, numOr, field, input } from '../ui.js';
import { getDay, updateDay, updateMasters, getDaysInRange } from '../store.js';
import { nowHM, addDays, fmtKey } from '../date.js';

export function injectionSheet(m, day, existing, onDone) {
  const date = input({ type: 'date', value: day });
  const dose = input({ type: 'number', step: '0.5', inputmode: 'decimal', value: existing?.doseMg ?? m.settings.injectionDefaultMg });
  const at = input({ type: 'time', value: existing?.at ?? nowHM() });
  const note = input({ type: 'text', value: existing?.note ?? '', placeholder: '부위, 증상 등 (선택)' });
  openSheet({
    title: `💉 ${m.settings.injectionName} 투약`,
    render: (sh) => h('div', null,
      field('날짜', date),
      h('div', { class: 'grid2' }, field('용량 (mg)', dose), field('시각', at)),
      field('메모', note),
      h('div', { class: 'row' },
        existing && h('button', { class: 'btn danger', onclick: async () => {
          await updateDay(day, (d) => { d.injection = null; });
          sh.close(); onDone?.();
        } }, '삭제'),
        h('button', { class: 'btn grow', onclick: async () => {
          const v = numOr(dose.value); if (!v) return toast('용량을 입력하세요');
          const target = date.value || day;
          if (existing && target !== day) await updateDay(day, (d) => { d.injection = null; });
          await updateDay(target, (d) => { d.injection = { doseMg: v, at: at.value, note: note.value.trim() || null }; });
          if (m.settings.injectionDefaultMg !== v) await updateMasters((mm) => { mm.settings.injectionDefaultMg = v; });
          sh.close(); onDone?.(); toast(`${fmtKey(target)} 투약 기록`);
        } }, '저장'))),
  });
}

// 마지막 투약일과 다음 예정일(+7일)
export async function injectionStatus(today) {
  const days = await getDaysInRange(addDays(today, -60), addDays(today, 7));
  const inj = days.filter((d) => d.injection).sort((a, b) => (a.day < b.day ? 1 : -1));
  const last = inj[0] ?? null;
  const next = last ? addDays(last.day, 7) : null;
  return { last, next };
}

export { getDay };
