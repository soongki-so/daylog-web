// 설정: 프리셋 / 약·영양제 / 특이사항 태그 / 목표 / 데이터 백업
import { h, openSheet, toast, numOr, field, input, select, inbodyCsvPicker, healthImportAction } from '../ui.js';
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
  const ptTotal = input({ type: 'number', inputmode: 'numeric', value: s.ptTotal ?? 30 });
  const ptDone = input({ type: 'number', inputmode: 'numeric', value: s.ptDone ?? 0 });
  return h('div', { class: 'card' },
    h('div', { class: 'card-title' }, h('span', null, '🎯 목표 · 기본값')),
    h('div', { class: 'grid2' }, field('물 목표 (ml)', water), field('물 빠른 버튼', quick)),
    field('안정시 에너지 (kcal/일)', resting),
    h('div', { class: 'muted small', style: 'margin:-6px 0 12px' }, '가만히 있어도 쓰는 에너지. 건강 앱 "안정시 에너지" 값을 넣으면 정확해요.'),
    h('div', { class: 'grid2' }, field('투약 약 이름', injName), field('기본 용량 (mg)', injMg)),
    h('div', { class: 'grid2' }, field('PT 총 횟수 (회)', ptTotal), field('앱 쓰기 전 완료한 PT (회)', ptDone)),
    h('div', { class: 'muted small', style: 'margin:-6px 0 12px' }, '운동 기록에서 "PT 수업"을 고르면 회차가 자동으로 이어져요.'),
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
        mm.settings.ptTotal = numOr(ptTotal.value, 30);
        mm.settings.ptDone = numOr(ptDone.value, 0);
      });
      toast('저장했어요');
    } }, '저장'));
}

// ---------- 아이폰 건강 앱 연동 (단축어) ----------
function healthCard() {
  let guideOpen = false;
  const paste = h('textarea', { class: 'input', id: 'health-paste', placeholder: '클립보드 버튼이 안 되면 단축어 결과를 여기에 붙여넣고 아래 버튼', style: 'min-height:90px;font-size:13px' });
  const card = h('div', { class: 'card' });
  const render = () => card.replaceChildren(
    h('div', { class: 'card-title' }, h('span', null, '🍎 아이폰 건강 앱 연동')),
    h('div', { class: 'muted small', style: 'margin-bottom:10px' }, '아이폰 "단축어" 앱으로 건강 앱의 걸음·활동/안정시 에너지·수면·운동·체중을 복사한 뒤, 여기서 가져와요. 직접 입력한 값은 그대로 두고 빈 값만 채웁니다. 오늘 화면의 🍎 버튼도 같은 기능이에요.'),
    h('button', { class: 'btn block', style: 'margin-bottom:8px', onclick: () => healthImportAction() }, '🍎 클립보드에서 건강 데이터 가져오기'),
    paste,
    h('button', { class: 'btn secondary block', style: 'margin:8px 0 12px', onclick: async () => {
      try {
        const { parseHealthText, importHealthDays } = await import('../health.js');
        const rows = parseHealthText(paste.value); if (!rows.length) throw new Error('가져올 값이 없어요.');
        const r = await importHealthDays(rows); paste.value = ''; toast(`건강 데이터 ${r.count}일치 가져왔어요`);
      } catch (err) { alert(err.message); }
    } }, '붙여넣은 내용 가져오기'),
    h('button', { class: 'btn ghost block', onclick: () => { guideOpen = !guideOpen; render(); } }, guideOpen ? '▲ 단축어 만드는 방법 접기' : '▼ 단축어 만드는 방법 보기'),
    guideOpen && guide());
  render();
  return card;
}

function guide() {
  const step = (n, t, sub) => h('div', { class: 'list-item', style: 'align-items:flex-start' },
    h('b', { style: 'min-width:22px;color:var(--accent)' }, n), h('div', { class: 'grow' }, t, sub && h('div', { class: 'muted small' }, sub)));
  const code = (t) => h('pre', { style: 'background:#F4F0EA;border-radius:10px;padding:10px;font-size:12px;white-space:pre-wrap;margin:6px 0 0' }, t);
  return h('div', { style: 'margin-top:10px' },
    h('div', { class: 'muted small', style: 'margin-bottom:6px' }, '한 번만 만들면 됩니다. 아이폰 "단축어" 앱 → 오른쪽 위 + → 이름 "DayLog 건강". 아래 동작을 순서대로 추가하세요 (검색창에 동작 이름을 치면 나와요).'),
    h('b', null, '① 기본 (걸음·에너지·체중)'),
    step('1', '"건강 샘플 찾기" → 유형: 걸음 수 → "필터 추가": 시작 날짜 · 오늘.'),
    step('2', '"통계 계산" → 합계 · 입력: 바로 위 건강 샘플.', '이 결과가 [걸음]'),
    step('3', '1~2를 두 번 더: 유형 "활동 에너지" → [활동], 유형 "안정 시 에너지" → [안정].'),
    step('4', '"건강 샘플 찾기" → 유형: 체중 → 정렬: 시작 날짜 · 최신순 → 제한: 1개.', '이 결과가 [체중]'),
    h('b', { style: 'display:block;margin-top:8px' }, '② 수면'),
    step('5', '"건강 샘플 찾기" → 유형: 수면 분석 → 필터: 종료 날짜 · 오늘 → 정렬: 시작 날짜 · 오래된순.'),
    step('6', '"목록에서 항목 가져오기" → 첫 번째 항목 → "건강 샘플 세부사항 가져오기" → 시작 날짜.', '이 결과가 [취침]'),
    step('7', '"목록에서 항목 가져오기" → 마지막 항목 (입력: 5번 결과) → "건강 샘플 세부사항 가져오기" → 종료 날짜.', '이 결과가 [기상]. 수면 시간은 앱이 계산해요.'),
    h('b', { style: 'display:block;margin-top:8px' }, '③ 운동'),
    step('8', '"운동 찾기" → 필터: 시작 날짜 · 오늘.'),
    step('9', '"각 항목 반복" (입력: 8번 결과) → 반복 안에 "텍스트" 추가하고 아래처럼 씁니다.', '[ ] 자리는 "반복 항목"을 넣고 톡 눌러 속성을 고르세요'),
    code('workout: [반복 항목 › 운동 유형] | [반복 항목 › 시작 날짜] | [반복 항목 › 지속 시간] | [반복 항목 › 활동 에너지]'),
    step('10', '반복 끝난 뒤 "텍스트 결합" → 입력: 반복 결과 · 구분: 새 줄.', '이 결과가 [운동목록]'),
    h('b', { style: 'display:block;margin-top:8px' }, '④ 마무리'),
    step('11', '"텍스트" 동작에 아래처럼 쓰고 [ ] 자리에 위 결과들을 넣습니다. [현재 날짜]는 "날짜" 동작(현재 날짜).'),
    code(`DAYLOG-HEALTH
date: [현재 날짜]
steps: [걸음]
active: [활동]
resting: [안정]
sleep_start: [취침]
sleep_end: [기상]
weight: [체중]
[운동목록]`),
    step('12', '"클립보드에 복사" 동작을 마지막에 추가하고 완료.'),
    step('13', '쓰는 법: 단축어 실행(또는 "시리야, DayLog 건강") → DayLog 열고 🍎 → 화면에 뜨는 "붙여넣기" 허용.', '단축어 앱 "자동화" 탭에서 "매일 07:30 · DayLog 건강 실행 · 확인 없이"로 걸어 두면 아침마다 준비돼요.'),
    h('div', { class: 'muted small', style: 'margin-top:8px' }, '②③은 나중에 붙여도 됩니다. 값이 없는 줄은 비워 둬도 돼요. 날짜·시간은 아이폰 표기(2026. 9. 16. 오후 11:40) 그대로, 지속 시간은 "55분 24초"나 "1:05:30" 그대로 넣어도 읽어요.'));
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
  return [healthCard(), h('div', { class: 'card' },
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
