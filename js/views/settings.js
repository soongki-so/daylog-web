// 설정: 프리셋 / 약·영양제 / 특이사항 태그 / 목표 / 데이터 백업
import { h, openSheet, toast, numOr, field, input, select, inbodyCsvPicker } from '../ui.js';
import { getMasters, updateMasters, exportAll, importAll, resetAll, uid } from '../store.js';
import { MEAL_TYPES, MED_SLOTS } from '../defaults.js';

export async function renderSettings(root, ctx) {
  const m = await getMasters();
  root.replaceChildren(
    h('div', { class: 'cal-head' },
      h('button', { class: 'icon-btn', onclick: () => ctx.goTab('today') }, '‹'),
      h('h1', null, '설정'),
      h('span', { style: 'width:36px' })),

    section('🍽️ 식사 프리셋', '자주 먹는 식사를 등록해 두면 한 번에 기록', m.presets.sort((a, b) => a.order - b.order).map((p) =>
      item(`${p.favorite ? '★ ' : ''}${p.name}`, [p.kcal ? `${p.kcal} kcal` : null, p.items].filter(Boolean).join(' · '), () => presetSheet(m, p))),
      () => presetSheet(m, null)),

    section('💊 약 · 영양제 세트', '세트마다 동그라미 하나. 항목을 다 먹으면 꽉 차요', (m.medSets ?? []).slice().sort((a, b) => a.order - b.order).map((x) =>
      item(`${x.kind === 'medication' ? '🔴' : '🟢'} ${x.name}`, `${(x.items ?? []).map((i) => i.name).join(', ')} · ${(x.slots?.length ? x.slots : ['breakfast']).map((k) => MED_SLOTS.find((s) => s.key === k)?.label ?? k).join('/')}${x.active === false ? ' · 숨김' : ''}`, () => setSheet(m, x))),
      () => setSheet(m, null)),

    section('🏷️ 특이사항 태그', '', m.tags.sort((a, b) => a.order - b.order).map((t) =>
      item(`${t.icon} ${t.name}`, t.active ? '' : '숨김', () => tagSheet(m, t))),
      () => tagSheet(m, null)),

    goalsCard(m),
    ...dataCard(),
    h('div', { class: 'muted small', style: 'text-align:center;margin-top:8px' }, 'DayLog · 1단계 (이 기기에만 저장)'),
  );
}

function section(title, sub, items, onAdd) {
  return h('div', { class: 'card settings-list' },
    h('div', { class: 'card-title' }, h('span', null, title), h('button', { class: 'link', onclick: onAdd }, '+ 추가')),
    sub && h('div', { class: 'muted small', style: 'margin:-6px 0 8px' }, sub),
    items.length ? items : h('div', { class: 'empty' }, '없음'));
}

function item(title, sub, onclick) {
  return h('div', { class: 'list-item', onclick },
    h('div', { class: 'grow' }, title, sub ? h('div', { class: 'sub' }, sub) : null),
    h('span', { class: 'muted' }, '›'));
}

// ---------- 프리셋 ----------
function presetSheet(m, p) {
  const name = input({ type: 'text', value: p?.name ?? '', placeholder: '예: 아침 쉐이크' });
  const items = input({ type: 'text', value: p?.items ?? '', placeholder: '구성 (선택) 예: 쉐이크, 바나나' });
  const kcal = input({ type: 'number', inputmode: 'numeric', value: p?.kcal ?? '', placeholder: '기본 열량' });
  const mealType = select([{ value: '', label: '지정 안 함' }, ...MEAL_TYPES.map((t) => ({ value: t.key, label: t.label }))], p?.mealType ?? '');
  const fav = h('input', { type: 'checkbox', checked: !!p?.favorite });
  openSheet({
    title: p ? '프리셋 수정' : '프리셋 추가',
    render: (sh) => h('div', null,
      field('이름', name), field('구성', items),
      h('div', { class: 'grid2' }, field('기본 열량 (kcal)', kcal), field('기본 끼니', mealType)),
      h('label', { class: 'row', style: 'margin-bottom:14px' }, fav, ' 즐겨찾기 (맨 앞에 표시)'),
      h('div', { class: 'row' },
        p && h('button', { class: 'btn danger', onclick: async () => { if (!confirm('삭제할까요?')) return; await updateMasters((mm) => { mm.presets = mm.presets.filter((x) => x.id !== p.id); }); sh.close(); } }, '삭제'),
        h('button', { class: 'btn grow', onclick: async () => {
          if (!name.value.trim()) return toast('이름을 입력하세요');
          const rec = { id: p?.id ?? uid(), name: name.value.trim(), items: items.value.trim(), kcal: numOr(kcal.value), mealType: mealType.value || null, favorite: fav.checked, order: p?.order ?? (m.presets.length + 1) };
          await updateMasters((mm) => { const i = mm.presets.findIndex((x) => x.id === rec.id); if (i >= 0) mm.presets[i] = rec; else mm.presets.push(rec); });
          sh.close();
        } }, '저장'))),
  });
}

// ---------- 약·영양제 세트 ----------
function setSheet(m, x) {
  const name = input({ type: 'text', value: x?.name ?? '', placeholder: '예: 아침약, 영양제' });
  const kind = select([{ value: 'medication', label: '약 (빨강)' }, { value: 'supplement', label: '영양제 (초록)' }], x?.kind ?? 'medication');
  const active = h('input', { type: 'checkbox', checked: x ? x.active !== false : true });
  const cur = new Set(x?.slots?.length ? x.slots : ['breakfast']);
  const slotBoxes = MED_SLOTS.map((sl) => ({ key: sl.key, box: h('input', { type: 'checkbox', checked: cur.has(sl.key) }), label: `${sl.icon} ${sl.label}` }));
  let items = (x?.items ?? []).map((i) => ({ ...i }));
  if (!items.length) items.push({ id: uid(), name: '', dose: null });
  openSheet({
    title: x ? '세트 수정' : '세트 추가',
    render: (sh) => h('div', null,
      field('세트 이름', name),
      h('div', { class: 'grid2' }, field('종류', kind)),
      h('div', { class: 'field' }, h('label', null, '먹는 때 (여러 개 가능)'),
        h('div', { class: 'chips' }, slotBoxes.map((b) => h('label', { class: 'chip' }, b.box, ' ', b.label)))),
      h('div', { class: 'field' }, h('label', null, '구성 항목'),
        items.map((it, idx) => h('div', { class: 'row', style: 'margin-bottom:6px' },
          input({ type: 'text', value: it.name, placeholder: `항목 ${idx + 1} 이름`, oninput: (e) => { it.name = e.target.value; } }),
          h('div', { style: 'width:90px' }, input({ type: 'text', value: it.dose ?? '', placeholder: '용량', oninput: (e) => { it.dose = e.target.value.trim() || null; } })),
          h('button', { class: 'icon-btn plain', onclick: () => { items = items.filter((y) => y !== it); if (!items.length) items.push({ id: uid(), name: '', dose: null }); sh.refresh(); } }, '🗑️'))),
        h('button', { class: 'btn secondary sm', onclick: () => { items.push({ id: uid(), name: '', dose: null }); sh.refresh(); } }, '+ 항목 추가')),
      h('label', { class: 'row', style: 'margin-bottom:14px' }, active, ' 오늘 화면에 표시'),
      h('div', { class: 'row' },
        x && h('button', { class: 'btn danger', onclick: async () => { if (!confirm('세트를 삭제할까요? 과거 체크 기록은 남습니다.')) return; await updateMasters((mm) => { mm.medSets = (mm.medSets ?? []).filter((y) => y.id !== x.id); }); sh.close(); } }, '삭제'),
        h('button', { class: 'btn grow', onclick: async () => {
          if (!name.value.trim()) return toast('세트 이름을 입력하세요');
          const slots = slotBoxes.filter((b) => b.box.checked).map((b) => b.key);
          if (!slots.length) return toast('먹는 때를 하나 이상 고르세요');
          const cleanItems = items.filter((i) => i.name.trim()).map((i) => ({ id: i.id, name: i.name.trim(), dose: i.dose || null }));
          if (!cleanItems.length) return toast('항목을 하나 이상 넣으세요');
          const rec = { id: x?.id ?? uid(), name: name.value.trim(), kind: kind.value, slots, items: cleanItems, active: active.checked, order: x?.order ?? ((m.medSets?.length ?? 0) + 1) };
          await updateMasters((mm) => { mm.medSets = mm.medSets ?? []; const i = mm.medSets.findIndex((y) => y.id === rec.id); if (i >= 0) mm.medSets[i] = rec; else mm.medSets.push(rec); });
          sh.close();
        } }, '저장'))),
  });
}

// ---------- 태그 ----------
function tagSheet(m, t) {
  const name = input({ type: 'text', value: t?.name ?? '', placeholder: '예: 야근' });
  const icon = input({ type: 'text', value: t?.icon ?? '', placeholder: '이모지 1개 예: 🌙', maxlength: 4 });
  const active = h('input', { type: 'checkbox', checked: t ? t.active : true });
  openSheet({
    title: t ? '태그 수정' : '태그 추가',
    render: (sh) => h('div', null,
      h('div', { class: 'grid2' }, field('이름', name), field('아이콘', icon)),
      h('label', { class: 'row', style: 'margin-bottom:14px' }, active, ' 오늘 화면에 표시'),
      h('div', { class: 'row' },
        t && h('button', { class: 'btn danger', onclick: async () => { if (!confirm('삭제할까요?')) return; await updateMasters((mm) => { mm.tags = mm.tags.filter((y) => y.id !== t.id); }); sh.close(); } }, '삭제'),
        h('button', { class: 'btn grow', onclick: async () => {
          if (!name.value.trim()) return toast('이름을 입력하세요');
          const rec = { id: t?.id ?? uid(), name: name.value.trim(), icon: icon.value.trim() || '🏷️', active: active.checked, order: t?.order ?? (m.tags.length + 1) };
          await updateMasters((mm) => { const i = mm.tags.findIndex((y) => y.id === rec.id); if (i >= 0) mm.tags[i] = rec; else mm.tags.push(rec); });
          sh.close();
        } }, '저장'))),
  });
}

// ---------- 목표 / 기본값 ----------
function goalsCard(m) {
  const s = m.settings;
  const water = input({ type: 'number', inputmode: 'numeric', value: s.waterGoalMl });
  const quick = input({ type: 'text', value: s.waterQuick.join(', '), placeholder: '예: 200, 300, 500' });
  const resting = input({ type: 'number', inputmode: 'numeric', value: s.restingEnergy });
  const injName = input({ type: 'text', value: s.injectionName });
  const injMg = input({ type: 'number', step: '0.5', inputmode: 'decimal', value: s.injectionDefaultMg });
  const boundary = select([0, 2, 3, 4, 5].map((hh) => ({ value: String(hh), label: hh === 0 ? '자정 (00:00)' : `새벽 ${hh}시` })), String(s.dayBoundaryHour));
  return h('div', { class: 'card' },
    h('div', { class: 'card-title' }, h('span', null, '🎯 목표 · 기본값')),
    h('div', { class: 'grid2' }, field('물 목표 (ml)', water), field('물 빠른 버튼', quick)),
    field('안정시 에너지 (kcal/일)', resting),
    h('div', { class: 'muted small', style: 'margin:-6px 0 12px' }, '가만히 있어도 쓰는 에너지. 건강 앱 "안정시 에너지" 값을 넣으면 정확해요.'),
    h('div', { class: 'grid2' }, field('투약 약 이름', injName), field('기본 용량 (mg)', injMg)),
    field('하루 시작 시각', boundary),
    h('div', { class: 'muted small', style: 'margin:-6px 0 12px' }, '새벽 야식을 전날로 치고 싶으면 새벽 시각으로.'),
    h('button', { class: 'btn block', onclick: async () => {
      await updateMasters((mm) => {
        mm.settings.waterGoalMl = numOr(water.value, 2000);
        mm.settings.waterQuick = quick.value.split(',').map((x) => numOr(x.trim())).filter(Boolean).slice(0, 4);
        if (!mm.settings.waterQuick.length) mm.settings.waterQuick = [200, 300, 500];
        mm.settings.restingEnergy = numOr(resting.value, 1300);
        mm.settings.injectionName = injName.value.trim() || '마운자로';
        mm.settings.injectionDefaultMg = numOr(injMg.value, 2.5);
        mm.settings.dayBoundaryHour = numOr(boundary.value, 0);
      });
      toast('저장했어요');
    } }, '저장'));
}

// ---------- 데이터 ----------
function dataCard() {
  const fileIn = h('input', { type: 'file', accept: 'application/json,.json', style: 'display:none', onchange: async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try {
      const data = JSON.parse(await f.text());
      const replace = confirm('기존 기록을 지우고 백업으로 바꿀까요?\n[확인] 바꾸기 / [취소] 합치기');
      const n = await importAll(data, { replace });
      toast(`${n}일치 기록을 가져왔어요`);
    } catch (err) { alert('가져오기 실패: ' + err.message); }
    e.target.value = '';
  } });
  const inbody = inbodyCsvPicker();
  return [h('div', { class: 'card' },
    h('div', { class: 'card-title' }, h('span', null, '📋 인바디 앱 연동')),
    h('div', { class: 'muted small', style: 'margin-bottom:10px' }, '인바디 앱 → 결과 화면 → 내보내기(CSV) → "파일에 저장" 한 뒤, 아래 버튼으로 그 파일을 고르면 측정 기록 전체가 체중 기록에 들어와요. 새로 측정할 때마다 다시 가져오면 됩니다.'),
    h('button', { class: 'btn secondary block', onclick: inbody.open }, '📋 인바디 CSV 파일 가져오기'),
    inbody.input),
  h('div', { class: 'card' },
    h('div', { class: 'card-title' }, h('span', null, '💾 데이터')),
    h('div', { class: 'muted small', style: 'margin-bottom:10px' }, '지금은 이 기기의 브라우저에만 저장돼요. 다른 기기로 옮기거나 백업하려면 내보내기를 쓰세요. (2단계에서 계정 동기화 예정)'),
    h('div', { class: 'grid2' },
      h('button', { class: 'btn secondary', onclick: async () => {
        const data = await exportAll();
        const text = JSON.stringify(data);
        const blob = new Blob([text], { type: 'application/json' });
        const name = `daylog-backup-${data.exportedAt.slice(0, 10)}.json`;
        if (navigator.share && navigator.canShare?.({ files: [new File([blob], name)] })) {
          try { await navigator.share({ files: [new File([blob], name, { type: 'application/json' })], title: 'DayLog 백업' }); return; } catch { /* 취소 */ }
        }
        const a = h('a', { href: URL.createObjectURL(blob), download: name }); document.body.append(a); a.click(); a.remove();
      } }, '내보내기'),
      h('button', { class: 'btn secondary', onclick: () => fileIn.click() }, '가져오기'),
    ),
    fileIn,
    h('hr', { class: 'sep' }),
    h('button', { class: 'btn danger block', onclick: async () => {
      if (!confirm('모든 기록과 설정을 지웁니다. 되돌릴 수 없어요. 계속할까요?')) return;
      if (!confirm('정말 지울까요?')) return;
      await resetAll(); toast('초기화했어요');
    } }, '모든 데이터 지우기'))];
}
