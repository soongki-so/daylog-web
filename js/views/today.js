// 오늘 화면: 통합 대시보드 → 식사 → 약·영양제 → 특이사항 → 하루평가 (투약은 달력에서)
import { h, openSheet, toast, ring, fmtKcal, numOr, field, input, select } from '../ui.js';
import { getDay, updateDay, getMasters, getDaysInRange, uid } from '../store.js';
import { fmtKey, addDays, todayKey, nowHM, minutesToText, sleepMinutes } from '../date.js';
import { MEAL_TYPES, SATIETY, RATINGS, EXERCISE_TYPES, MED_SLOTS } from '../defaults.js';
import { searchFoods } from '../foods.js';
import { getAllDays } from '../store.js';

export async function renderToday(root, ctx) {
  const [doc, m] = await Promise.all([getDay(ctx.day), getMasters()]);
  const prevWeight = await findPrevWeight(ctx.day);
  root.replaceChildren(
    header(ctx, m),
    dashboard(doc, m, ctx, prevWeight),
    mealsSection(doc, m, ctx),
    medsSection(doc, m, ctx),
    tagsSection(doc, m, ctx),
    ratingSection(doc, ctx),
  );
}

async function findPrevWeight(day) {
  const days = await getDaysInRange(addDays(day, -60), addDays(day, -1));
  const withW = days.filter((d) => d.weight?.kg).sort((a, b) => (a.day < b.day ? 1 : -1));
  return withW[0] ?? null;
}

// ---------- 헤더 ----------
function header(ctx, m) {
  const today = todayKey(m.settings.dayBoundaryHour);
  const isToday = ctx.day === today;
  return h('div', { class: 'day-header' },
    h('div', null,
      h('h1', null, isToday ? '오늘' : fmtKey(ctx.day)),
      h('div', { class: 'sub' }, isToday ? fmtKey(ctx.day, { year: true }) : (ctx.day < today ? '지난 기록' : '미래 날짜'))),
    h('div', { class: 'day-nav' },
      h('button', { class: 'icon-btn', onclick: () => { ctx.setDay(addDays(ctx.day, -1)); ctx.goTab('today'); }, 'aria-label': '이전 날' }, '‹'),
      !isToday && h('button', { class: 'btn sm secondary', onclick: () => { ctx.setDay(today); ctx.goTab('today'); } }, '오늘'),
      h('button', { class: 'icon-btn', onclick: () => { ctx.setDay(addDays(ctx.day, 1)); ctx.goTab('today'); }, 'aria-label': '다음 날' }, '›'),
      h('button', { class: 'icon-btn', onclick: () => ctx.goTab('settings'), 'aria-label': '설정' }, '⚙️')));
}

// ---------- 통합 대시보드 ----------
export function energyOf(doc, settings) {
  const intake = doc.meals.reduce((a, x) => a + (x.kcal ?? 0), 0);
  const resting = doc.energy?.resting ?? settings.restingEnergy;
  const active = doc.energy?.active ?? doc.exercise.reduce((a, x) => a + (x.kcal ?? 0), 0);
  const expenditure = resting + active;
  return { intake, resting, active, expenditure, balance: intake - expenditure };
}

function dashboard(doc, m, ctx, prevWeight) {
  const s = m.settings;
  const e = energyOf(doc, s);
  const waterMl = doc.water.reduce((a, x) => a + x.ml, 0);
  const exMin = doc.exercise.reduce((a, x) => a + (x.minutes ?? 0), 0);
  const exKcal = doc.exercise.reduce((a, x) => a + (x.kcal ?? 0), 0);

  const weightDelta = doc.weight?.kg && prevWeight ? doc.weight.kg - prevWeight.weight.kg : null;

  const ringCell = h('div', { class: 'ring-cell', onclick: () => energySheet(doc, m, ctx) },
    h('div', { class: 'ring-wrap' },
      ring({ value: e.intake, max: e.expenditure, color: e.balance > 0 ? 'var(--accent)' : 'var(--mint)' }),
      h('div', { class: 'ring-center' },
        h('div', { class: 'big' }, (e.balance > 0 ? '+' : '') + fmtKcal(e.balance)),
        h('div', { class: 'lbl' }, '에너지 밸런스'))),
    h('div', { class: 'ring-legend' },
      h('span', null, '섭취 ', h('b', null, fmtKcal(e.intake))),
      h('span', null, '소모 ', h('b', null, fmtKcal(e.expenditure)))));

  const weightCell = h('div', { class: 'stat', onclick: () => weightSheet(doc, ctx) },
    h('div', { class: 'k' }, '⚖️ 체중'),
    h('div', { class: 'v' }, doc.weight?.kg ? [doc.weight.kg.toFixed(1), h('small', null, 'kg')] : h('span', { class: 'muted' }, '입력')),
    weightDelta != null
      ? h('div', { class: 'd ' + (weightDelta > 0 ? 'up' : weightDelta < 0 ? 'down' : '') }, `${weightDelta > 0 ? '▲' : weightDelta < 0 ? '▼' : '–'} ${Math.abs(weightDelta).toFixed(1)}kg`)
      : h('div', { class: 'd' }, prevWeight ? `이전 ${prevWeight.weight.kg.toFixed(1)}kg` : ''));

  const sleepCell = h('div', { class: 'stat', onclick: () => sleepSheet(doc, ctx) },
    h('div', { class: 'k' }, '🌙 수면'),
    h('div', { class: 'v' }, doc.sleep ? minutesToText(doc.sleep.minutes) : h('span', { class: 'muted' }, '입력')),
    h('div', { class: 'd' }, doc.sleep ? `${doc.sleep.start} → ${doc.sleep.end}` : ''));

  const waterCell = h('div', { class: 'stat', onclick: () => waterSheet(doc, m, ctx) },
    h('div', { class: 'k' }, '💧 물 ', h('span', { class: 'grow' }), h('span', null, `${waterMl} / ${s.waterGoalMl}ml`)),
    h('div', { class: 'water-bar' }, h('div', { style: `width:${Math.min(100, (waterMl / s.waterGoalMl) * 100)}%` })),
    h('div', { class: 'quick', onclick: (ev) => ev.stopPropagation() },
      s.waterQuick.map((ml) => h('button', { onclick: () => addWater(ctx.day, ml) }, `+${ml}`))));

  const exCell = h('div', { class: 'stat', onclick: () => exerciseSheet(doc, ctx) },
    h('div', { class: 'k' }, '🏃 운동'),
    h('div', { class: 'v' }, exMin ? [minutesToText(exMin)] : h('span', { class: 'muted' }, '입력')),
    h('div', { class: 'd' }, exKcal ? `${fmtKcal(exKcal)} kcal · ${doc.exercise.map((x) => x.type).join(', ')}` : ''));

  return h('div', { class: 'card' },
    h('div', { class: 'dash' }, ringCell, weightCell, sleepCell, h('div', { class: 'dash-bottom' }, waterCell, exCell)));
}

async function addWater(day, ml) {
  await updateDay(day, (d) => d.water.push({ id: uid(), at: nowHM(), ml, source: 'manual' }));
  toast(`물 ${ml}ml 기록`);
}

// 사진을 작게 줄여 JPEG dataURL로 (백업 JSON에 그대로 포함되도록)
function shrinkImage(file, max = 1400) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const r = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * r); c.height = Math.round(img.height * r);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(img.src);
      resolve(c.toDataURL('image/jpeg', 0.82));
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

function photoViewer(src) {
  openSheet({ title: '인바디 결과지', render: () => h('img', { src, style: 'width:100%;border-radius:12px' }) });
}

function weightSheet(doc, ctx) {
  const w = doc.weight ?? {};
  const kg = input({ type: 'number', step: '0.1', inputmode: 'decimal', value: w.kg ?? '', placeholder: '예: 62.3', autofocus: !w.kg });
  const muscle = input({ type: 'number', step: '0.1', inputmode: 'decimal', value: w.muscle ?? '', placeholder: 'kg' });
  const fat = input({ type: 'number', step: '0.1', inputmode: 'decimal', value: w.bodyFat ?? '', placeholder: '%' });
  const fatKg = input({ type: 'number', step: '0.1', inputmode: 'decimal', value: w.fatKg ?? '', placeholder: 'kg' });
  const bmr = input({ type: 'number', inputmode: 'numeric', value: w.bmr ?? '', placeholder: 'kcal' });
  const score = input({ type: 'number', inputmode: 'numeric', value: w.score ?? '', placeholder: '점' });
  const useBmr = h('input', { type: 'checkbox', checked: true });
  let photo = w.photo ?? null;
  let inbodyOpen = !!(w.muscle || w.bodyFat || w.bmr || w.photo);
  const fileIn = h('input', { type: 'file', accept: 'image/*', style: 'display:none' });

  openSheet({
    title: '⚖️ 체중 · 인바디',
    render: (sh) => {
      fileIn.onchange = async (e) => {
        const f = e.target.files[0]; if (!f) return;
        try { photo = await shrinkImage(f); inbodyOpen = true; sh.refresh(); toast('사진을 붙였어요'); }
        catch { toast('사진을 읽지 못했어요'); }
        e.target.value = '';
      };
      return h('div', null,
        field('체중 (kg)', kg),
        h('button', { class: 'btn secondary block', style: 'margin-bottom:12px', onclick: () => { inbodyOpen = !inbodyOpen; sh.refresh(); } },
          inbodyOpen ? '▲ 인바디 항목 접기' : '▼ 인바디 결과 입력 (골격근량·체지방·기초대사량·사진)'),
        inbodyOpen && h('div', null,
          h('div', { class: 'grid2' }, field('골격근량 (kg)', muscle), field('체지방률 (%)', fat)),
          h('div', { class: 'grid2' }, field('체지방량 (kg)', fatKg), field('인바디 점수', score)),
          field('기초대사량 (kcal)', bmr),
          h('label', { class: 'row small', style: 'margin:-6px 0 12px' }, useBmr, ' 기초대사량을 "안정시 에너지" 기본값으로 쓰기'),
          h('div', { class: 'field' },
            h('label', null, '결과지 사진'),
            photo
              ? h('div', { class: 'row' },
                  h('img', { src: photo, style: 'width:72px;height:72px;object-fit:cover;border-radius:10px', onclick: () => photoViewer(photo) }),
                  h('button', { class: 'btn secondary sm', onclick: () => fileIn.click() }, '바꾸기'),
                  h('button', { class: 'btn danger sm', onclick: () => { photo = null; sh.refresh(); } }, '지우기'))
              : h('button', { class: 'btn secondary block', onclick: () => fileIn.click() }, '📷 인바디 결과지 사진 붙이기'),
            fileIn),
          h('div', { class: 'muted small', style: 'margin:-6px 0 12px' }, '인바디 앱 결과 화면을 캡처하거나 결과지를 찍어 붙여 두면 달력에서 다시 볼 수 있어요.')),
        h('div', { class: 'row' },
          doc.weight && h('button', { class: 'btn danger', onclick: async () => { await updateDay(ctx.day, (d) => { d.weight = null; }); sh.close(); } }, '삭제'),
          h('button', { class: 'btn grow', onclick: async () => {
            const v = numOr(kg.value);
            if (!v) return toast('체중을 입력하세요');
            const rec = { kg: v, muscle: numOr(muscle.value), bodyFat: numOr(fat.value), fatKg: numOr(fatKg.value), bmr: numOr(bmr.value), score: numOr(score.value), photo, source: (numOr(muscle.value) || numOr(fat.value) || photo) ? 'inbody' : 'manual', at: w.at ?? nowHM() };
            await updateDay(ctx.day, (d) => { d.weight = rec; });
            if (rec.bmr && useBmr.checked) {
              const { updateMasters } = await import('../store.js');
              await updateMasters((mm) => { mm.settings.restingEnergy = rec.bmr; });
            }
            sh.close();
          } }, '저장')));
    },
  });
}

function sleepSheet(doc, ctx) {
  const start = input({ type: 'time', value: doc.sleep?.start ?? '23:30' });
  const end = input({ type: 'time', value: doc.sleep?.end ?? '07:00' });
  const preview = h('div', { class: 'muted small', style: 'margin-bottom:12px' });
  const update = () => { preview.textContent = start.value && end.value ? `총 수면 ${minutesToText(sleepMinutes(start.value, end.value))}` : ''; };
  start.oninput = end.oninput = update; update();
  openSheet({
    title: '수면',
    render: (sh) => h('div', null,
      h('div', { class: 'grid2' }, field('취침 시각', start), field('기상 시각', end)),
      preview,
      h('div', { class: 'row' },
        doc.sleep && h('button', { class: 'btn danger', onclick: async () => { await updateDay(ctx.day, (d) => { d.sleep = null; }); sh.close(); } }, '삭제'),
        h('button', { class: 'btn grow', onclick: async () => {
          if (!start.value || !end.value) return toast('시각을 입력하세요');
          await updateDay(ctx.day, (d) => { d.sleep = { start: start.value, end: end.value, minutes: sleepMinutes(start.value, end.value), source: 'manual' }; });
          sh.close();
        } }, '저장'))),
  });
}

function waterSheet(doc, m, ctx) {
  const custom = input({ type: 'number', inputmode: 'numeric', placeholder: 'ml 직접 입력' });
  openSheet({
    title: '물 섭취',
    render: (sh) => {
      const cur = doc;
      const total = cur.water.reduce((a, x) => a + x.ml, 0);
      return h('div', null,
        h('div', { class: 'muted small', style: 'margin-bottom:8px' }, `오늘 ${total}ml / 목표 ${m.settings.waterGoalMl}ml`),
        h('div', { class: 'row', style: 'margin-bottom:12px' },
          custom,
          h('button', { class: 'btn', onclick: async () => {
            const v = numOr(custom.value); if (!v) return;
            await addWater(ctx.day, v); doc = await getDay(ctx.day); custom.value = ''; sh.refresh();
          } }, '추가')),
        h('div', { class: 'quick', style: 'margin-bottom:12px' },
          m.settings.waterQuick.map((ml) => h('button', { onclick: async () => { await addWater(ctx.day, ml); doc = await getDay(ctx.day); sh.refresh(); } }, `+${ml}`))),
        cur.water.length ? cur.water.map((w) => h('div', { class: 'list-item' },
          h('span', { class: 'muted small' }, w.at), h('span', { class: 'grow' }, `${w.ml}ml`),
          h('button', { class: 'icon-btn plain', onclick: async () => { await updateDay(ctx.day, (d) => { d.water = d.water.filter((x) => x.id !== w.id); }); doc = await getDay(ctx.day); sh.refresh(); } }, '🗑️')))
          : h('div', { class: 'empty' }, '아직 기록이 없어요'));
    },
  });
}

function exerciseSheet(doc, ctx) {
  const type = select(EXERCISE_TYPES, '걷기');
  const minutes = input({ type: 'number', inputmode: 'numeric', placeholder: '분' });
  const kcal = input({ type: 'number', inputmode: 'numeric', placeholder: '선택' });
  openSheet({
    title: '운동',
    render: (sh) => h('div', null,
      field('종류', type),
      h('div', { class: 'grid2' }, field('시간 (분)', minutes), field('소모 칼로리', kcal)),
      h('button', { class: 'btn block', style: 'margin-bottom:12px', onclick: async () => {
        const mnt = numOr(minutes.value); if (!mnt) return toast('시간을 입력하세요');
        await updateDay(ctx.day, (d) => d.exercise.push({ id: uid(), at: nowHM(), type: type.value, minutes: mnt, kcal: numOr(kcal.value), source: 'manual' }));
        doc = await getDay(ctx.day); minutes.value = ''; kcal.value = ''; sh.refresh();
      } }, '추가'),
      doc.exercise.length ? doc.exercise.map((x) => h('div', { class: 'list-item' },
        h('span', { class: 'grow' }, `${x.type} · ${minutesToText(x.minutes)}`, x.kcal ? h('span', { class: 'muted small' }, ` · ${x.kcal}kcal`) : null),
        h('button', { class: 'icon-btn plain', onclick: async () => { await updateDay(ctx.day, (d) => { d.exercise = d.exercise.filter((y) => y.id !== x.id); }); doc = await getDay(ctx.day); sh.refresh(); } }, '🗑️')))
        : h('div', { class: 'empty' }, '아직 기록이 없어요')),
  });
}

function energySheet(doc, m, ctx) {
  const e = energyOf(doc, m.settings);
  const resting = input({ type: 'number', inputmode: 'numeric', value: doc.energy?.resting ?? '', placeholder: `기본 ${m.settings.restingEnergy}` });
  const active = input({ type: 'number', inputmode: 'numeric', value: doc.energy?.active ?? '', placeholder: '비우면 운동 기록 합계 사용' });
  openSheet({
    title: '에너지 밸런스',
    render: (sh) => h('div', null,
      h('div', { class: 'card', style: 'background:#FBF8F4;box-shadow:none' },
        h('div', { class: 'row' }, h('span', { class: 'grow' }, '섭취 (식사 합계)'), h('b', null, `${fmtKcal(e.intake)} kcal`)),
        h('div', { class: 'row' }, h('span', { class: 'grow' }, '안정시 에너지'), h('b', null, `${fmtKcal(e.resting)} kcal`)),
        h('div', { class: 'row' }, h('span', { class: 'grow' }, '활동 에너지'), h('b', null, `${fmtKcal(e.active)} kcal`)),
        h('hr', { class: 'sep' }),
        h('div', { class: 'row' }, h('span', { class: 'grow' }, '순 차이 (섭취 − 총 소모)'), h('b', { style: e.balance > 0 ? 'color:var(--danger)' : 'color:var(--mint)' }, `${e.balance > 0 ? '+' : ''}${fmtKcal(e.balance)} kcal`))),
      h('div', { class: 'muted small', style: 'margin-bottom:10px' }, '총 소모 = 안정시 + 활동. 건강 앱 값을 알면 오늘만 덮어쓸 수 있어요. (나중에 단축어로 자동 입력 예정)'),
      h('div', { class: 'grid2' }, field('안정시 (오늘만)', resting), field('활동 (오늘만)', active)),
      h('button', { class: 'btn block', onclick: async () => {
        const r = numOr(resting.value), a = numOr(active.value);
        await updateDay(ctx.day, (d) => { d.energy = (r == null && a == null) ? null : { resting: r, active: a, source: 'manual' }; });
        sh.close();
      } }, '저장')),
  });
}

// ---------- 식사 ----------
function mealsSection(doc, m, ctx) {
  const total = doc.meals.reduce((a, x) => a + (x.kcal ?? 0), 0);
  return h('div', { class: 'card' },
    h('div', { class: 'card-title' }, h('span', null, '🍽️ 식사 · 간식'), h('span', null, total ? `${fmtKcal(total)} kcal` : '')),
    h('div', { class: 'meals' },
      MEAL_TYPES.map((t) => {
        const entries = doc.meals.filter((x) => x.type === t.key);
        const kcal = entries.reduce((a, x) => a + (x.kcal ?? 0), 0);
        const sat = entries.map((x) => x.satiety).filter(Boolean);
        const satFace = sat.length ? SATIETY.find((s) => s.v === Math.round(sat.reduce((a, b) => a + b, 0) / sat.length))?.face : '';
        const slotMeds = m.medications.filter((x) => x.active && medSlotsOf(x).includes(t.key));
        const slotTaken = slotMeds.filter((x) => isTaken(doc, x.id, t.key)).length;
        return h('div', { class: 'meal-slot' + (entries.length ? ' filled' : ''), onclick: () => mealSheet(doc, m, ctx, t) },
          h('div', { class: 't' }, `${t.icon} ${t.label}`, slotMeds.length ? h('span', { class: 'med-badge' + (slotTaken === slotMeds.length ? ' done' : '') }, `💊${slotTaken}/${slotMeds.length}`) : null),
          entries.length
            ? [h('div', { class: 'n' }, entries.map((x) => x.name).join(', ')),
               h('div', { class: 'k' }, `${kcal ? fmtKcal(kcal) + ' kcal ' : ''}${satFace}`)]
            : h('div', { class: 'add' }, '+'));
      })));
}

// 내가 전에 기록한 음식(칼로리 있는 것) — 최근 것 우선, 이름당 1개
let historyCache = null;
async function foodHistory() {
  if (historyCache) return historyCache;
  const days = (await getAllDays()).sort((a, b) => (a.day < b.day ? 1 : -1));
  const seen = new Map();
  for (const d of days) for (const x of d.meals) if (x.kcal && !seen.has(x.name)) seen.set(x.name, { name: x.name, kcal: x.kcal });
  historyCache = [...seen.values()];
  setTimeout(() => { historyCache = null; }, 60_000);
  return historyCache;
}

function mealSheet(doc, m, ctx, type) {
  let editing = null; // 수정 중인 항목
  const name = input({ type: 'text', placeholder: '음식 이름 (예: 김밥, 라떼)', autocomplete: 'off' });
  const kcal = input({ type: 'number', inputmode: 'numeric', placeholder: 'kcal' });
  const suggest = h('div', { class: 'suggest', hidden: true });
  let history = [];
  foodHistory().then((hh) => { history = hh; });
  let sTimer;
  const showSuggest = () => {
    const list = searchFoods(name.value, history);
    suggest.replaceChildren(...list.map((f) => h('button', { class: 'suggest-item', onpointerdown: (e) => e.preventDefault(), onclick: () => {
      name.value = f.name; kcal.value = f.kcal; suggest.replaceChildren(); kcal.focus();
    } },
      h('span', { class: 'grow' }, f.mine ? '★ ' : '', f.name),
      h('span', { class: 'muted small' }, f.serving),
      h('b', null, `${f.kcal}`))));
    suggest.hidden = list.length === 0;
  };
  name.addEventListener('input', () => { clearTimeout(sTimer); sTimer = setTimeout(showSuggest, 120); });
  name.addEventListener('focus', showSuggest);
  name.addEventListener('blur', () => setTimeout(() => {
    // 이름만 치고 넘어가면 정확히 같은 이름의 칼로리를 채워 줌
    if (!kcal.value && name.value.trim()) {
      const exact = searchFoods(name.value, history, 1)[0];
      if (exact && exact.name.replace(/\s+/g, '') === name.value.trim().replace(/\s+/g, '')) kcal.value = exact.kcal;
    }
    suggest.replaceChildren(); suggest.hidden = true;
  }, 150));
  const note = input({ type: 'text', placeholder: '메모 (선택)' });
  let satiety = null, presetId = null;

  const presets = [...m.presets].sort((a, b) => (b.favorite - a.favorite) || (a.order - b.order));

  const resetForm = () => { editing = null; name.value = ''; kcal.value = ''; note.value = ''; satiety = null; presetId = null; };
  const loadForm = (x) => { editing = x; name.value = x.name; kcal.value = x.kcal ?? ''; note.value = x.note ?? ''; satiety = x.satiety ?? null; presetId = x.presetId ?? null; };

  openSheet({
    title: `${type.icon} ${type.label}`,
    render: (sh) => {
      const entries = doc.meals.filter((x) => x.type === type.key);
      const satRow = h('div', { class: 'faces' },
        SATIETY.map((s) => h('button', { class: 'face sm' + (satiety === s.v ? ' on' : ''), onclick: () => { satiety = satiety === s.v ? null : s.v; sh.refresh(); } }, s.face, h('span', null, s.label))));
      return h('div', null,
        entries.length ? h('div', { style: 'margin-bottom:12px' }, entries.map((x) => h('div', { class: 'list-item' },
          h('div', { class: 'grow', onclick: () => { loadForm(x); sh.refresh(); } },
            h('div', null, x.name, ' ', x.satiety ? SATIETY.find((s) => s.v === x.satiety)?.face : ''),
            h('div', { class: 'muted small' }, [x.kcal ? `${x.kcal} kcal` : null, x.at, x.note].filter(Boolean).join(' · '))),
          h('button', { class: 'icon-btn plain', onclick: async () => {
            await updateDay(ctx.day, (d) => { d.meals = d.meals.filter((y) => y.id !== x.id); });
            doc = await getDay(ctx.day); if (editing?.id === x.id) resetForm(); sh.refresh();
          } }, '🗑️')))) : null,
        mealMedsRow(doc, m, ctx, type.key, async () => { doc = await getDay(ctx.day); sh.refresh(); }),
        h('div', { class: 'muted small', style: 'margin-bottom:6px' }, editing ? '수정 중' : '프리셋에서 고르거나 직접 입력'),
        h('div', { class: 'chips', style: 'margin-bottom:12px' },
          presets.map((p) => h('button', { class: 'chip' + (presetId === p.id ? ' on' : ''), onclick: () => {
            presetId = p.id; name.value = p.name; kcal.value = p.kcal ?? ''; sh.refresh();
          } }, p.favorite ? '★ ' : '', p.name, p.kcal ? h('span', { class: 'muted' }, ` ${p.kcal}`) : null))),
        h('div', { class: 'row', style: 'margin-bottom:4px' }, name, h('div', { style: 'width:100px' }, kcal)),
        suggest,
        h('div', { class: 'muted small', style: 'margin-bottom:10px' }, '이름을 치면 칼로리 후보가 떠요. ★는 내가 전에 기록한 것'),
        h('div', { class: 'field' }, h('label', null, '포만감'), satRow),
        field('메모', note),
        h('div', { class: 'row' },
          editing && h('button', { class: 'btn secondary', onclick: () => { resetForm(); sh.refresh(); } }, '취소'),
          h('button', { class: 'btn grow', onclick: async () => {
            if (!name.value.trim()) return toast('음식 이름을 입력하세요');
            const rec = { id: editing?.id ?? uid(), at: editing?.at ?? nowHM(), type: type.key, presetId, name: name.value.trim(), kcal: numOr(kcal.value), satiety, note: note.value.trim() || null, source: 'manual' };
            await updateDay(ctx.day, (d) => { const i = d.meals.findIndex((y) => y.id === rec.id); if (i >= 0) d.meals[i] = rec; else d.meals.push(rec); });
            doc = await getDay(ctx.day); historyCache = null; foodHistory().then((hh) => { history = hh; }); resetForm(); sh.refresh(); toast('저장했어요');
          } }, editing ? '수정 저장' : '기록')));
    },
  });
}

// ---------- 약 · 영양제 (끼니별) ----------
// 기록 구조: doc.meds[medId][slot] = { taken, at }
export function medSlotsOf(x) { return x.slots?.length ? x.slots : ['breakfast']; }
export function isTaken(doc, medId, slot) { return !!doc.meds[medId]?.[slot]?.taken; }
export function toggleMed(day, medId, slot) {
  return updateDay(day, (d) => {
    const cur = d.meds[medId];
    const entry = (cur && typeof cur === 'object' && !('taken' in cur)) ? cur : {}; // 옛 형식(하루 1회 체크)은 버림
    entry[slot] = entry[slot]?.taken ? { taken: false } : { taken: true, at: nowHM() };
    d.meds[medId] = entry;
  });
}

function medRow(doc, ctx, x, slot) {
  const on = isTaken(doc, x.id, slot);
  const at = doc.meds[x.id]?.[slot]?.at;
  return h('div', { class: 'med-row', onclick: () => toggleMed(ctx.day, x.id, slot) },
    h('span', { class: 'check' + (on ? ' on' : '') }, on ? '✓' : ''),
    h('span', { class: 'grow' }, x.name, x.dose ? h('span', { class: 'muted small' }, ` ${x.dose}`) : null),
    on && at ? h('span', { class: 'muted small' }, at) : null);
}

function medsSection(doc, m, ctx) {
  const meds = m.medications.filter((x) => x.active).sort((a, b) => a.order - b.order);
  const groups = MED_SLOTS.map((sl) => ({ ...sl, meds: meds.filter((x) => medSlotsOf(x).includes(sl.key)) })).filter((g) => g.meds.length);
  const total = groups.reduce((a, g) => a + g.meds.length, 0);
  const taken = groups.reduce((a, g) => a + g.meds.filter((x) => isTaken(doc, x.id, g.key)).length, 0);
  return h('div', { class: 'card' },
    h('div', { class: 'card-title' }, h('span', null, '💊 약 · 영양제'), h('span', null, total ? `${taken}/${total}` : '')),
    groups.length ? groups.map((g) => h('div', { class: 'med-group' },
      h('div', { class: 'med-group-title' }, `${g.icon} ${g.label}`),
      g.meds.map((x) => medRow(doc, ctx, x, g.key))))
      : h('div', { class: 'empty' }, '설정에서 매일 챙길 약·영양제와 먹는 때를 등록하세요'));
}

// 식사 시트 안: 이 끼니와 함께 먹는 약 칩
function mealMedsRow(doc, m, ctx, slot, onToggle) {
  const meds = m.medications.filter((x) => x.active && medSlotsOf(x).includes(slot)).sort((a, b) => a.order - b.order);
  if (!meds.length) return null;
  return h('div', { class: 'field' },
    h('label', null, '💊 이 끼니와 함께'),
    h('div', { class: 'chips' }, meds.map((x) => {
      const on = isTaken(doc, x.id, slot);
      return h('button', { class: 'chip' + (on ? ' on' : ''), onclick: async () => { await toggleMed(ctx.day, x.id, slot); onToggle?.(); } },
        on ? '✓ ' : '', x.name);
    })));
}

// ---------- 특이사항 ----------
function tagsSection(doc, m, ctx) {
  const tags = m.tags.filter((t) => t.active).sort((a, b) => a.order - b.order);
  const on = new Set(doc.tags.map((t) => t.tagId));
  return h('div', { class: 'card' },
    h('div', { class: 'card-title' }, h('span', null, '🏷️ 특이사항')),
    h('div', { class: 'chips' },
      tags.map((t) => h('button', { class: 'chip' + (on.has(t.id) ? ' on' : ''), onclick: () => updateDay(ctx.day, (d) => {
        d.tags = on.has(t.id) ? d.tags.filter((x) => x.tagId !== t.id) : [...d.tags, { tagId: t.id }];
      }) }, t.icon, ' ', t.name))));
}

// ---------- 하루평가 ----------
function ratingSection(doc, ctx) {
  let timer;
  const note = h('textarea', { class: 'input', placeholder: '한 줄 메모 (선택)', oninput: (e) => {
    clearTimeout(timer);
    timer = setTimeout(() => updateDay(ctx.day, (d) => { d.note = e.target.value; }), 600);
  } }, doc.note ?? '');
  return h('div', { class: 'card' },
    h('div', { class: 'card-title' }, h('span', null, '🌈 오늘은 어땠나요?')),
    h('div', { class: 'faces', style: 'margin-bottom:10px' },
      RATINGS.map((r) => h('button', { class: 'face' + (doc.rating === r.v ? ' on' : ''), onclick: () => updateDay(ctx.day, (d) => { d.rating = d.rating === r.v ? null : r.v; }) }, r.face, h('span', null, r.label)))),
    note);
}
