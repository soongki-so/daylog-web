// 일정: 회식·약속·운동 수업 등을 미리 넣고, 달력에 글자로 보여 주고, 전후 식사 안내를 만든다
// 하루 기록: doc.events = [{ id, kind, classId?, title, at('HH:MM'|null), note, status('planned'|'done'|'skipped') }]
//   kind: party/lunch/dinner/drink/other, 또는 'class'(운동 수업, classId 필수). 예전 'pt'는 classId 'c_pt'로 취급
import { h, openSheet, toast, field, input } from './ui.js';
import { getDay, updateDay, uid, getDaysInRange, getMasters } from './store.js';
import { fmtKey, addDays, nowHM } from './date.js';
import { activeClasses, classById, classIdOf } from './classes.js';

export const EVENT_KINDS = [
  { key: 'party', label: '회식', icon: '🍻', food: true },
  { key: 'lunch', label: '점심 약속', icon: '🍽️', food: true },
  { key: 'dinner', label: '저녁 약속', icon: '🍽️', food: true },
  { key: 'drink', label: '술 약속', icon: '🍺', food: true },
  { key: 'other', label: '기타', icon: '📌', food: false },
];
const OTHER = EVENT_KINDS[4];

// 일정의 수업 id (예전 'pt' 호환)
export const eventClassId = (ev) => (ev?.kind === 'class' ? ev.classId : ev?.kind === 'pt' ? 'c_pt' : null);

// 종류 정보: 정적 종류 또는 수업(마스터에서 이름·아이콘)
export function kindOf(k, m = null, ev = null) {
  const cid = ev ? eventClassId(ev) : (k === 'pt' ? 'c_pt' : null);
  if (cid) {
    const c = m ? classById(m, cid) : null;
    return { key: 'class', label: c?.name ?? '수업', icon: c?.icon ?? '🏋️', food: false, cls: c ?? { id: cid, name: '수업', icon: '🏋️' } };
  }
  return EVENT_KINDS.find((x) => x.key === k) ?? OTHER;
}
export const eventsOf = (doc) => (Array.isArray(doc?.events) ? doc.events : []);
const STATUS = { planned: '예정', done: '완료', skipped: '취소' };

// 달력 칸 툴팁용: "19:00 회식"
export function shortLabel(ev) {
  const t = ev.at ? ev.at.replace(/^0/, '') : '';
  return `${t ? t + ' ' : ''}${ev.title}`;
}

// 수업 일정을 '참석'으로 바꾸면 그날 운동 기록에 그 수업이 없을 때 넣어 준다 (회차 자동 증가)
async function ensureClassExercise(day, ev, cls) {
  await updateDay(day, (d) => {
    if (d.exercise.some((x) => classIdOf(x) === cls.id)) return;
    d.exercise.push({ id: uid(), at: ev.at ?? nowHM(), type: cls.name, kind: 'class', classId: cls.id, minutes: 50, kcal: null, note: ev.note || null, source: 'event' });
  });
}

// ---- 날짜 일정 시트 (달력에서 날짜를 누르면) ----
export function daySheet(ctx, day, onDone) {
  let editing = null;
  let pick = 'party'; // 정적 종류 key 또는 'class:<id>'
  const title = input({ type: 'text', placeholder: '제목 (예: 팀 회식)' });
  const at = input({ type: 'time' });
  const note = input({ type: 'text', placeholder: '장소·메모 (선택)' });
  const reset = () => { editing = null; pick = 'party'; title.value = ''; at.value = ''; note.value = ''; };
  const load = (ev) => { editing = ev; const cid = eventClassId(ev); pick = cid ? `class:${cid}` : ev.kind; title.value = ev.title; at.value = ev.at ?? ''; note.value = ev.note ?? ''; };

  openSheet({
    title: `📅 ${fmtKey(day)}`,
    render: async (sh) => {
      const [doc, m] = await Promise.all([getDay(day), getMasters()]);
      const classes = activeClasses(m);
      const choices = [
        ...EVENT_KINDS.filter((k) => k.key !== 'other').map((k) => ({ key: k.key, label: k.label, icon: k.icon })),
        ...classes.map((c) => ({ key: `class:${c.id}`, label: c.name, icon: c.icon, cls: c })),
        { key: 'other', label: OTHER.label, icon: OTHER.icon },
      ];
      const chosen = choices.find((c) => c.key === pick) ?? choices[0];
      const evs = eventsOf(doc).slice().sort((a, b) => (a.at ?? '99') < (b.at ?? '99') ? -1 : 1);
      const refresh = async () => { await sh.refresh(); onDone?.(); };
      return h('div', null,
        h('div', { class: 'row', style: 'margin-bottom:12px' },
          h('button', { class: 'btn secondary grow', onclick: () => { sh.close(); ctx.setDay(day); ctx.goTab('today'); } }, '이날 기록 열기 ›')),
        evs.length ? h('div', { style: 'margin-bottom:12px' }, evs.map((ev) => {
          const k = kindOf(ev.kind, m, ev);
          const isClass = !!k.cls;
          return h('div', { class: 'list-item' },
            h('div', { class: 'grow', onclick: () => { load(ev); sh.refresh(); } },
              h('div', null, `${k.icon} `, h('b', null, ev.title), ev.at ? h('span', { class: 'muted small' }, ` ${ev.at}`) : null,
                h('span', { class: `ev-status ${ev.status}` }, STATUS[ev.status] ?? '예정')),
              ev.note ? h('div', { class: 'muted small' }, ev.note) : null),
            isClass || ev.status !== 'planned'
              ? h('div', { class: 'row', style: 'gap:4px' },
                  ev.status !== 'done' && h('button', { class: 'btn sm', onclick: async () => {
                    await updateDay(day, (d) => { const e = eventsOf(d).find((x) => x.id === ev.id); if (e) e.status = 'done'; });
                    if (isClass) await ensureClassExercise(day, ev, k.cls);
                    toast(isClass ? `${k.cls.name} 참석으로 기록했어요` : '완료로 표시했어요'); refresh();
                  } }, isClass ? '참석' : '완료'),
                  ev.status !== 'skipped' && h('button', { class: 'btn sm secondary', onclick: async () => {
                    await updateDay(day, (d) => { const e = eventsOf(d).find((x) => x.id === ev.id); if (e) e.status = 'skipped'; });
                    refresh();
                  } }, isClass ? '불참' : '취소'))
              : null,
            h('button', { class: 'icon-btn plain', onclick: async () => {
              await updateDay(day, (d) => { d.events = eventsOf(d).filter((x) => x.id !== ev.id); });
              if (editing?.id === ev.id) reset();
              refresh();
            } }, '🗑️'));
        })) : h('div', { class: 'empty' }, '이날 일정이 없어요'),
        h('div', { class: 'muted small', style: 'margin-bottom:6px' }, editing ? '일정 수정' : '새 일정'),
        h('div', { class: 'chips', style: 'margin-bottom:10px' }, choices.map((c) => h('button', { class: 'chip' + (pick === c.key ? ' on' : ''), onclick: () => {
          const wasDefault = !title.value.trim() || choices.some((x) => x.label === title.value.trim());
          pick = c.key; if (wasDefault) title.value = c.label; sh.refresh();
        } }, c.icon, ' ', c.label))),
        h('div', { class: 'grid2' }, field('제목', title), field('시간', at)),
        field('메모', note),
        h('div', { class: 'row' },
          editing && h('button', { class: 'btn secondary', onclick: () => { reset(); sh.refresh(); } }, '취소'),
          h('button', { class: 'btn grow', onclick: async () => {
            const t = title.value.trim() || chosen.label;
            const base = { id: editing?.id ?? uid(), title: t, at: at.value || null, note: note.value.trim() || null, status: editing?.status ?? 'planned' };
            const rec = chosen.cls ? { ...base, kind: 'class', classId: chosen.cls.id } : { ...base, kind: chosen.key };
            await updateDay(day, (d) => { const list = eventsOf(d); const i = list.findIndex((x) => x.id === rec.id); if (i >= 0) list[i] = rec; else list.push(rec); d.events = list; });
            reset(); toast('일정을 저장했어요'); refresh();
          } }, editing ? '수정 저장' : '일정 추가')));
    },
  });
}

// ---- 오늘 화면 안내: 어제·오늘·내일 일정으로 한두 줄 ----
export async function guidanceFor(today) {
  const [days, m] = await Promise.all([getDaysInRange(addDays(today, -1), addDays(today, 1)), getMasters()]);
  const byKey = Object.fromEntries(days.map((d) => [d.day, d]));
  const evs = (k) => eventsOf(byKey[k]).filter((e) => e.status !== 'skipped');
  const lines = [];
  const now = nowHM();
  const when = (e) => (e.at ? e.at + ' ' : '');
  for (const e of evs(today)) {
    const k = kindOf(e.kind, m, e);
    if (k.cls) lines.push({ icon: k.icon, text: `오늘 ${when(e)}${k.cls.name} 수업이 있어요. 1~2시간 전에 가볍게 먹고, 물을 챙기세요.` });
    else if (k.food) {
      const upcoming = !e.at || e.at > now;
      lines.push({ icon: k.icon, text: upcoming
        ? `오늘 ${when(e)}${e.title}. 그 전 끼니는 단백질·채소 위주로 가볍게, 굶지는 마세요. 자리에서는 천천히, 물을 사이사이에.`
        : `오늘 ${e.title}이 있었어요. 남은 시간은 물을 충분히, 야식은 건너뛰어요.` });
    }
  }
  for (const e of evs(addDays(today, 1))) {
    const k = kindOf(e.kind, m, e);
    if (k.food) lines.push({ icon: k.icon, text: `내일 ${when(e)}${e.title}이 있어요. 오늘은 평소대로 먹고 물을 충분히. 내일 아침·점심은 조금 가볍게 준비하면 좋아요.` });
    if (k.cls) lines.push({ icon: k.icon, text: `내일 ${when(e)}${k.cls.name} 수업. 오늘은 무리하지 말고 잘 자요.` });
  }
  for (const e of evs(addDays(today, -1))) {
    const k = kindOf(e.kind, m, e);
    if (k.food) lines.push({ icon: '🌿', text: `어제 ${e.title}이 있었죠. 오늘은 평소 식사로 돌아오고, 물 많이, 가볍게 걷기. 보상으로 굶는 건 금지예요.` });
  }
  return lines.slice(0, 3);
}
