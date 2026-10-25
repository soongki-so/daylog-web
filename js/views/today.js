// 오늘 화면: 통합 대시보드 → 식사 → 약·영양제 → 특이사항 → 하루평가 (투약은 달력에서)
import { h, openSheet, toast, rings, fmtKcal, numOr, field, input, select, inbodyCsvPicker, healthImportAction } from '../ui.js';
import { getDay, updateDay, getMasters, getDaysInRange, uid } from '../store.js';
import { fmtKey, addDays, todayKey, nowHM, minutesToText, sleepMinutes } from '../date.js';
import { MEAL_TYPES, SATIETY, RATINGS, EXERCISE_TYPES } from '../defaults.js';
import { slotGroups, setsForSlot, pieFor, setRow, medsSheet } from '../meds.js';
import { searchFoods, loadOfficialFoods, foodIcon } from '../foods.js';
import { getAllDays } from '../store.js';
import { completeness, completenessText, goalProgress, goalText } from '../complete.js';
import { syncEnabled, getSession, getStatus, syncNow } from '../sync.js';
import { guidanceFor, daySheet, plannedClassEvents, ensureClassExercise, setEventStatus, markClassEventDone } from '../events.js';
import { activeClasses, classById, classIdOf, classProgress, progressText } from '../classes.js';

// 수량 표시: 1 → "1", 0.5 → "½", 2/3 → "⅔", 1.5 → "1½", 1.2 → "1.2"
const FRACS = { '1/2': '½', '1/3': '⅓', '2/3': '⅔', '1/4': '¼', '3/4': '¾' };
const fmtQty = (q) => {
  if (Number.isInteger(q)) return String(q);
  const whole = Math.floor(q), rest = q - whole;
  for (const d of [2, 3, 4]) {
    const k = Math.round(rest * d);
    if (k > 0 && k < d && Math.abs(rest - k / d) < 0.005) return (whole || '') + FRACS[`${k}/${d}`];
  }
  return String(Math.round(q * 100) / 100);
};
// 수량 읽기: "2/3", "1 1/2", "⅔", "1½", "0.5" 모두
const GLYPHS = Object.fromEntries(Object.entries(FRACS).map(([k, v]) => [v, k]));
export function parseQty(v) {
  let t = String(v ?? '').trim().replace(/[½⅓⅔¼¾]/g, (g) => ` ${GLYPHS[g]}`).trim();
  const m = t.match(/^(?:(\d+(?:\.\d+)?)\s+)?(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)$/);
  const n = m ? (m[1] ? +m[1] : 0) + (+m[3] ? +m[2] / +m[3] : NaN) : parseFloat(t);
  return Number.isFinite(n) && n > 0 ? n : null;
}
// 식사 항목 이름 + 수량 ("삶은계란 ×3")
const mealLabel = (x) => `${x.name}${x.qty && x.qty !== 1 ? ` ×${fmtQty(x.qty)}` : ''}`;
// 1개(1인분) 기준 칼로리 (수량 기능 전 기록은 전체 kcal을 그대로)
const unitKcalOf = (x) => x.unitKcal ?? (x.qty && x.qty !== 1 && x.kcal ? Math.round(x.kcal / x.qty) : x.kcal);

// 오늘 화면 머리의 로그인·동기화 상태 (누르면 바로 동기화, 로그인 전이면 설정으로)
export function syncBadge(ctx) {
  if (!syncEnabled()) return null;
  const s = getSession();
  const st = getStatus();
  const state = !s ? 'off' : st.state === 'error' ? 'err' : st.state === 'syncing' ? 'busy' : 'on';
  const label = { off: '로그인 안 됨 (눌러서 로그인)', err: `동기화 오류: ${st.message}`, busy: '동기화 중', on: `${s?.email ?? ''} 동기화됨` }[state];
  return h('button', {
    id: 'sync-badge', class: `sync-badge ${state}`, title: label, 'aria-label': label,
    onclick: async () => {
      if (!s) { ctx.goTab('settings'); return; }
      try {
        const r = await syncNow();
        const parts = [r.uploaded ? `${r.uploaded}일치 올림` : null, r.changed ? `${r.changed}건 받음` : null].filter(Boolean);
        toast(parts.length ? `동기화 완료: ${parts.join(', ')}` : '이미 최신 상태예요');
      } catch (err) { alert('동기화 실패: ' + err.message); }
    },
  }, '☁️', h('span', { class: 'dot' }));
}

export async function renderToday(root, ctx) {
  const [doc, m] = await Promise.all([getDay(ctx.day), getMasters()]);
  const prevWeight = await findPrevWeight(ctx.day);
  const ptInfo = await classBadges(doc, m, ctx.day);
  const guide = await guidanceFor(ctx.day);
  root.replaceChildren(...[
    header(ctx, m),
    guide.length ? h('div', { class: 'card guide', onclick: () => daySheet(ctx, ctx.day) },
      guide.map((g) => h('div', { class: 'guide-line' }, h('span', { class: 'guide-icon' }, g.icon), h('span', null, g.text)))) : null,
    dashboard(doc, m, ctx, prevWeight, ptInfo),
    mealsSection(doc, m, ctx),
    medsSection(doc, m, ctx),
    tagsSection(doc, m, ctx),
    ratingSection(doc, ctx),
  ].filter(Boolean)); // 안내가 없을 때 'null' 글자가 찍히던 문제 방지
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
      syncBadge(ctx),
      h('button', { class: 'icon-btn', onclick: () => healthImportAction(ctx), 'aria-label': '건강 앱 데이터 가져오기', title: '건강 앱 데이터 가져오기 (클립보드)' }, '🍎'),
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

function dashboard(doc, m, ctx, prevWeight, ptInfo) {
  const s = m.settings;
  const e = energyOf(doc, s);
  const waterMl = doc.water.reduce((a, x) => a + x.ml, 0);
  const exMin = doc.exercise.reduce((a, x) => a + (x.minutes ?? 0), 0);
  const exKcal = doc.exercise.reduce((a, x) => a + (x.kcal ?? 0), 0);

  const weightDelta = doc.weight?.kg && prevWeight ? doc.weight.kg - prevWeight.weight.kg : null;

  // 고리 3겹: 바깥 초록 = 기록했나, 가운데 파랑 = 목표 달성 (달력과 같은 기준), 안쪽 = 섭취 / 소모
  const comp = completeness(doc, m), goal = goalProgress(doc, m);
  const ringCell = h('div', { class: 'ring-cell', onclick: () => energySheet(doc, m, ctx) },
    h('div', { class: 'ring-wrap' },
      rings([
        { ratio: comp.ratio, color: 'var(--mint)' },
        { ratio: goal.ratio, color: 'var(--sky)' },
        { ratio: e.expenditure > 0 ? e.intake / e.expenditure : 0, color: e.balance > 0 ? 'var(--accent)' : '#F5B84D' },
      ]),
      h('div', { class: 'ring-center' },
        h('div', { class: 'big' }, (e.balance > 0 ? '+' : '') + fmtKcal(e.balance)),
        h('div', { class: 'lbl' }, '에너지 밸런스'))),
    h('div', { class: 'ring-legend' },
      h('span', null, '섭취 ', h('b', null, fmtKcal(e.intake))),
      h('span', null, '소모 ', h('b', null, fmtKcal(e.expenditure)))),
    h('div', { class: 'ring-legend', title: completenessText(comp) + '\n' + goalText(goal) },
      h('span', null, h('span', { class: 'legend-ring' }), ' 기록 ', h('b', null, `${comp.filled}/${comp.total}`)),
      h('span', null, h('span', { class: 'legend-ring goal' }), ' 목표 ', h('b', null, `${goal.pct}%`))));

  const weightCell = h('div', { class: 'stat', onclick: () => weightSheet(doc, ctx) },
    h('div', { class: 'k' }, '⚖️ 체중'),
    h('div', { class: 'v' }, doc.weight?.kg ? [doc.weight.kg.toFixed(1), h('small', null, 'kg')] : h('span', { class: 'muted' }, '입력')),
    weightDelta != null
      ? h('div', { class: 'd ' + (weightDelta > 0 ? 'up' : weightDelta < 0 ? 'down' : '') }, `${weightDelta > 0 ? '▲' : weightDelta < 0 ? '▼' : '–'} ${Math.abs(weightDelta).toFixed(1)}kg`)
      : h('div', { class: 'd' }, prevWeight ? `이전 ${prevWeight.weight.kg.toFixed(1)}kg` : ''));

  const sleepCell = h('div', { class: 'stat', onclick: () => sleepSheet(doc, ctx) },
    h('div', { class: 'k' }, '🌙 수면'),
    h('div', { class: 'v' }, doc.sleep ? minutesToText(doc.sleep.minutes) : h('span', { class: 'muted' }, '입력')),
    h('div', { class: 'd' }, doc.sleep ? `${doc.sleep.start ?? '?'} → ${doc.sleep.end ?? '?'}${doc.sleep.source === 'health' ? ' · 건강앱' : ''}` : ''));

  const waterCell = h('div', { class: 'stat', onclick: () => waterSheet(doc, m, ctx) },
    h('div', { class: 'k' }, '💧 물 ', h('span', { class: 'grow' }), h('span', null, `${waterMl} / ${s.waterGoalMl}ml`)),
    h('div', { class: 'water-bar' }, h('div', { style: `width:${Math.min(100, (waterMl / s.waterGoalMl) * 100)}%` })),
    h('div', { class: 'quick', onclick: (ev) => ev.stopPropagation() },
      s.waterQuick.map((ml) => h('button', { onclick: () => addWater(ctx.day, ml) }, `+${ml}`))));

  // 미리 넣어 둔 수업 일정이 있으면 운동 칸에서 바로 참석/불참 체크 (새로 입력할 필요 없음)
  const planned = plannedClassEvents(doc, m);
  const exCell = h('div', { class: 'stat', onclick: () => exerciseSheet(doc, m, ctx) },
    h('div', { class: 'k' }, '🏃 운동', ptInfo?.length ? h('span', { class: 'pt-badge', style: 'margin-left:auto' }, ptInfo.map((b) => `${b.cls.name} ${progressText(b.p)}`).join(' · ')) : null),
    h('div', { class: 'v' }, exMin ? [minutesToText(exMin)] : h('span', { class: 'muted' }, '입력')),
    h('div', { class: 'd' }, [exKcal ? `${fmtKcal(exKcal)} kcal · ${doc.exercise.map((x) => x.type).join(', ')}` : (exMin ? doc.exercise.map((x) => x.type).join(', ') : ''), doc.steps ? `걸음 ${Math.round(doc.steps).toLocaleString('ko-KR')}` : ''].filter(Boolean).join(' · ')),
    planned.length ? h('div', { class: 'ev-check', onclick: (ev) => ev.stopPropagation() },
      planned.map(({ ev, cls }) => h('div', { class: 'row', style: 'gap:4px' },
        h('span', { class: 'grow small', style: 'white-space:nowrap;overflow:hidden;text-overflow:ellipsis' }, `${cls.icon} ${cls.name}${ev.at ? ' ' + ev.at : ''} 예정`),
        h('button', { class: 'ev-btn ok', onclick: () => attendClass(ctx.day, ev, cls) }, '참석 ✓'),
        h('button', { class: 'ev-btn', onclick: async () => { await setEventStatus(ctx.day, ev.id, 'skipped'); toast(`${cls.name} 불참으로 표시했어요`); } }, '불참')))) : null);

  return h('div', { class: 'card' },
    h('div', { class: 'dash' }, ringCell, weightCell, sleepCell, h('div', { class: 'dash-bottom' }, waterCell, exCell)));
}

async function addWater(day, ml) {
  await updateDay(day, (d) => d.water.push({ id: uid(), at: nowHM(), ml, source: 'manual' }));
  toast(`물 ${ml}ml 기록`);
}

// 일정의 수업을 '참석'으로: 일정은 완료, 운동 기록에 그 수업이 들어가고 회차가 올라간다
async function attendClass(day, ev, cls) {
  await setEventStatus(day, ev.id, 'done');
  await ensureClassExercise(day, ev, cls);
  const p = await classProgress(day, cls);
  toast(`${cls.icon} ${cls.name} ${progressText(p)} 참석 기록 (50분, 운동 칸에서 수정 가능)`);
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

function photoViewer(src, title = '인바디 결과지') {
  openSheet({ title, render: () => h('img', { src, style: 'width:100%;border-radius:12px' }) });
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
  let sheetApi = null;
  const csv = inbodyCsvPicker(() => sheetApi?.close());

  openSheet({
    title: '⚖️ 체중 · 인바디',
    render: (sh) => {
      sheetApi = sh;
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
          h('div', { class: 'muted small', style: 'margin:-6px 0 12px' }, '인바디 앱 결과 화면을 캡처하거나 결과지를 찍어 붙여 두면 달력에서 다시 볼 수 있어요.'),
          (w.bmi || w.visceral || w.whr) && h('div', { class: 'muted small', style: 'margin:-6px 0 12px' },
            ['BMI ' + (w.bmi ?? '-'), '내장지방레벨 ' + (w.visceral ?? '-'), '복부지방률 ' + (w.whr ?? '-'), w.device ? 'InBody' + w.device : null].filter(Boolean).join(' · ')),
          h('button', { class: 'btn secondary block', style: 'margin-bottom:12px', onclick: csv.open }, '📋 인바디 앱 CSV 가져오기 (전체 기록)'),
          csv.input),
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

// 오늘 기록된 수업들의 회차 배지 (운동 칸·운동 시트 공용)
export async function classBadges(doc, m, day) {
  const out = [];
  for (const cls of activeClasses(m)) {
    if (!doc.exercise.some((x) => classIdOf(x) === cls.id)) continue;
    const p = await classProgress(day, cls);
    out.push({ cls, p, text: `${cls.icon} ${cls.name} ${progressText(p)}` });
  }
  return out;
}

function exerciseSheet(doc, m, ctx) {
  const classes = activeClasses(m);
  // 오늘 예정된 수업 일정이 있으면 그 수업을 미리 골라 둔다 (일정 → 기록 연결)
  let pick = plannedClassEvents(doc, m)[0]?.cls.id ?? 'personal'; // 'personal' 또는 수업 id
  const type = select(EXERCISE_TYPES, '걷기');
  const minutes = input({ type: 'number', inputmode: 'numeric', placeholder: '분' });
  const kcal = input({ type: 'number', inputmode: 'numeric', placeholder: '선택' });
  const note = input({ type: 'text', placeholder: '메모 (선택) 예: 하체, 선생님 코멘트' });
  openSheet({
    title: '🏃 운동',
    render: async (sh) => {
      const cls = classes.find((c) => c.id === pick) ?? null;
      const prog = {};
      for (const c of classes) prog[c.id] = await classProgress(ctx.day, c);
      const seq = Object.fromEntries(classes.map((c) => [c.id, prog[c.id].before])); // 목록 회차 번호
      const p = cls ? prog[cls.id] : null;
      const nextLabel = cls ? `${cls.icon} ${cls.name} ${p.upTo + 1}${p.total ? '/' + p.total : ''}회차 기록` : '추가';
      const plannedEv = cls ? plannedClassEvents(doc, m).find((x) => x.cls.id === cls.id)?.ev ?? null : null;
      minutes.placeholder = cls ? '분 (비우면 50분)' : '분';
      const body = h('div', null,
        h('div', { class: 'field' }, h('label', null, '구분'),
          h('div', { class: 'chips' },
            h('button', { class: 'chip' + (pick === 'personal' ? ' on' : ''), onclick: () => { pick = 'personal'; sh.refresh(); } }, '🏃 개인 운동'),
            classes.map((c) => h('button', { class: 'chip' + (pick === c.id ? ' on' : ''), onclick: () => { pick = c.id; sh.refresh(); } }, `${c.icon} ${c.name}`)),
            h('button', { class: 'chip', style: 'opacity:.7', onclick: () => { sh.close(); ctx.goTab('settings'); } }, '＋ 수업 등록'))),
        cls && h('div', { class: 'muted small', style: 'margin:-6px 0 12px' },
          p.total ? `이번이 ${p.upTo + 1}회차예요 (등록 ${p.total}회, 이번 포함 남은 수업 ${Math.max(0, p.total - p.upTo)}회)` : `이번이 ${p.upTo + 1}회차예요`),
        plannedEv && h('div', { class: 'row', style: 'margin:-4px 0 12px;padding:8px 10px;border-radius:12px;background:var(--lav-soft);font-size:13px' },
          h('span', { class: 'grow' }, `📅 오늘 ${plannedEv.at ? plannedEv.at + ' ' : ''}${cls.name} 일정이 있어요. 기록하면 일정도 '완료'가 돼요.`),
          h('button', { class: 'ev-btn', onclick: async () => { await setEventStatus(ctx.day, plannedEv.id, 'skipped'); doc = await getDay(ctx.day); toast(`${cls.name} 불참으로 표시했어요`); sh.refresh(); } }, '불참')),
        !cls && field('종류', type),
        h('div', { class: 'grid2' }, field('시간 (분)', minutes), field('소모 칼로리', kcal)),
        field('메모', note),
        h('button', { class: 'btn block', style: 'margin-bottom:12px', onclick: async () => {
          const mnt = numOr(minutes.value) ?? (cls ? 50 : null); if (!mnt) return toast('시간을 입력하세요');
          const rec = cls
            ? { id: uid(), at: plannedEv?.at ?? nowHM(), type: cls.name, kind: 'class', classId: cls.id, minutes: mnt, kcal: numOr(kcal.value), note: note.value.trim() || null, source: 'manual' }
            : { id: uid(), at: nowHM(), type: type.value, kind: 'personal', minutes: mnt, kcal: numOr(kcal.value), note: note.value.trim() || null, source: 'manual' };
          await updateDay(ctx.day, (d) => d.exercise.push(rec));
          if (cls) await markClassEventDone(ctx.day, cls.id); // 같은 수업의 '예정' 일정은 완료로
          doc = await getDay(ctx.day); minutes.value = ''; kcal.value = ''; note.value = ''; sh.refresh();
          toast(cls ? `${cls.name} ${p.upTo + 1}회차 기록${plannedEv ? ' · 일정 완료' : ''}` : '운동 기록');
        } }, nextLabel),
        doc.exercise.length ? doc.exercise.map((x) => {
          const xc = classes.find((c) => c.id === classIdOf(x)) ?? (classIdOf(x) ? classById(m, classIdOf(x)) : null);
          if (xc) seq[xc.id] = (seq[xc.id] ?? (xc.done ?? 0)) + 1;
          return h('div', { class: 'list-item' },
            h('span', { class: 'grow' },
              xc ? h('span', { class: 'pt-badge' }, `${xc.icon} ${xc.name} ${seq[xc.id]}${xc.total ? '/' + xc.total : ''}회`) : null,
              xc ? ' ' : '',
              `${x.type} · ${minutesToText(x.minutes)}`,
              x.kcal ? h('span', { class: 'muted small' }, ` · ${x.kcal}kcal`) : null,
              x.source === 'health' ? h('span', { class: 'muted small' }, ' · 건강앱') : null,
              x.note ? h('div', { class: 'muted small' }, x.note) : null),
            h('button', { class: 'icon-btn plain', onclick: async () => { await updateDay(ctx.day, (d) => { d.exercise = d.exercise.filter((y) => y.id !== x.id); }); doc = await getDay(ctx.day); sh.refresh(); } }, '🗑️'));
        }) : h('div', { class: 'empty' }, '아직 기록이 없어요'));
      return body;
    },
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
      h('div', { class: 'muted small', style: 'margin-bottom:10px' }, '총 소모 = 안정시 + 활동. 🍎 버튼으로 건강 앱에서 가져오면 자동으로 채워져요. 여기서 고치면 오늘만 덮어써요 (다음에 가져오면 건강 앱 값으로 바뀜).'),
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
        const faceOf = (x) => (x.satiety ? SATIETY.find((s) => s.v === x.satiety)?.face ?? '' : '');
        const slotSets = setsForSlot(m, t.key);
        return h('div', { class: 'meal-slot' + (entries.length ? ' filled' : ''), onclick: () => mealSheet(doc, m, ctx, t) },
          h('div', { class: 't' }, `${t.icon} ${t.label}`),
          entries.length
            ? [h('div', { class: 'n' }, entries.map((x, i) => [i ? ', ' : '', foodIcon(x.name) + ' ', mealLabel(x), faceOf(x) ? h('span', { class: 'sat-face' }, ' ' + faceOf(x)) : null])),
               h('div', { class: 'k' }, kcal ? `${fmtKcal(kcal)} kcal` : ''),
               entries.some((x) => x.photo) && h('div', { class: 'thumbs' }, entries.filter((x) => x.photo).slice(0, 3).map((x) => h('img', { src: x.photo, class: 'thumb' })))]
            : h('div', { class: 'add' }, '+'),
          // 약·영양제는 칸 아래쪽 한 줄에 따로 (글자와 섞이지 않게)
          slotSets.length ? h('div', { class: 'slot-meds' }, slotSets.map((set) => pieFor(doc, set, t.key, 14))) : null);
      })));
}

// 내가 전에 기록한 음식(칼로리 있는 것) — 최근 것 우선, 이름당 1개
let historyCache = null;
async function foodHistory() {
  if (historyCache) return historyCache;
  const days = (await getAllDays()).sort((a, b) => (a.day < b.day ? 1 : -1));
  const seen = new Map();
  // 1개(1인분) 기준 칼로리로 저장해 두면, 다음에 골랐을 때 수량만 바꾸면 된다
  for (const d of days) for (const x of d.meals) if (x.kcal && !seen.has(x.name)) seen.set(x.name, { name: x.name, kcal: unitKcalOf(x), serving: x.serving ?? null });
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
  let picked = null; // 후보에서 고른 음식 (탄단지 저장용)

  // ---- 수량: 1개(1인분) 칼로리 × 수량 = 기록 칼로리. kcal 칸에는 항상 합계가 보인다 ----
  let qty = 1, unitKcal = null, serving = null;
  // 숫자 전용 칸은 "2/3"을 못 받아서 글자 칸으로 (분수는 아래 버튼으로도)
  const qtyIn = input({ type: 'text', inputmode: 'text', autocomplete: 'off', value: 1, class: 'input qty-in', 'aria-label': '수량 (2/3처럼 분수도 돼요)' });
  const qtyHint = h('span', { class: 'muted small grow' });
  const updateHint = () => {
    if (unitKcal == null) { qtyHint.textContent = '칼로리를 넣으면 수량에 따라 계산돼요'; return; }
    const unit = serving ? (serving.endsWith('당') ? serving : serving + '당') : '1개(1인분)당';
    qtyHint.textContent = `${unit} ${Math.round(unitKcal)}kcal${qty !== 1 ? ` × ${fmtQty(qty)} = ${Math.round(unitKcal * qty)}kcal` : ''}`;
  };
  const applyQty = () => { if (unitKcal != null) kcal.value = Math.round(unitKcal * qty); qtyIn.value = fmtQty(qty); updateHint(); };
  // 후보·프리셋에서 고르면 그 값이 1개 기준이 되고 수량은 1로
  const setUnit = (k, s) => { unitKcal = k ?? null; serving = s ?? null; qty = 1; applyQty(); };
  qtyIn.addEventListener('input', () => { const v = parseQty(qtyIn.value); if (v != null) { qty = v; if (unitKcal != null) kcal.value = Math.round(unitKcal * qty); updateHint(); } });
  qtyIn.addEventListener('blur', () => { qtyIn.value = fmtQty(qty); });
  // 칼로리를 직접 고치면 그 값을 현재 수량 기준으로 다시 1개 칼로리를 잡는다
  kcal.addEventListener('input', () => { const v = numOr(kcal.value); unitKcal = v != null && qty > 0 ? v / qty : null; updateHint(); });
  updateHint();

  foodHistory().then((hh) => { history = hh; });
  loadOfficialFoods().then(() => { if (document.activeElement === name && name.value.trim()) showSuggest(); });
  let sTimer;
  const showSuggest = () => {
    const list = searchFoods(name.value, history);
    suggest.replaceChildren(...list.map((f) => h('button', { class: 'suggest-item', onpointerdown: (e) => e.preventDefault(), onclick: () => {
      name.value = f.name; setUnit(f.kcal, f.serving === '내 기록' ? null : f.serving); picked = f; suggest.replaceChildren(); suggest.hidden = true;
      qtyIn.focus(); qtyIn.select();
    } },
      h('span', { class: 'grow' }, f.mine ? '★ ' : '', h('span', { class: 'food-ic' }, foodIcon(f.name)), f.name,
        f.src === 'official' ? h('span', { class: 'src-tag' }, '식약처') : null),
      h('span', { class: 'muted small' }, f.serving ?? ''),
      h('b', null, `${f.kcal}`))));
    suggest.hidden = list.length === 0;
  };
  name.addEventListener('input', () => {
    clearTimeout(sTimer); sTimer = setTimeout(showSuggest, 120);
    const b = document.getElementById('meal-save-btn'); if (b && !editing) b.textContent = name.value.trim() ? '기록' : '닫기';
  });
  name.addEventListener('focus', showSuggest);
  name.addEventListener('blur', () => setTimeout(() => {
    // 이름만 치고 넘어가면 정확히 같은 이름의 칼로리를 채워 줌
    if (!kcal.value && name.value.trim()) {
      const exact = searchFoods(name.value, history, 1)[0];
      if (exact && exact.name.replace(/\s+/g, '') === name.value.trim().replace(/\s+/g, '')) setUnit(exact.kcal, exact.serving === '내 기록' ? null : exact.serving);
    }
    suggest.replaceChildren(); suggest.hidden = true;
  }, 150));
  const note = input({ type: 'text', placeholder: '메모 (선택)' });
  let satiety = null, presetId = null, photo = null;
  const photoIn = h('input', { type: 'file', accept: 'image/*', style: 'display:none' });

  const presets = [...m.presets].sort((a, b) => (b.favorite - a.favorite) || (a.order - b.order));

  const resetForm = () => { editing = null; name.value = ''; kcal.value = ''; note.value = ''; satiety = null; presetId = null; photo = null; picked = null; qty = 1; unitKcal = null; serving = null; qtyIn.value = 1; updateHint(); };
  const loadForm = (x) => {
    editing = x; name.value = x.name; kcal.value = x.kcal ?? ''; note.value = x.note ?? ''; satiety = x.satiety ?? null; presetId = x.presetId ?? null; photo = x.photo ?? null; picked = null;
    qty = x.qty && x.qty > 0 ? x.qty : 1; unitKcal = x.unitKcal ?? (x.kcal != null ? x.kcal / qty : null); serving = x.serving ?? null; qtyIn.value = fmtQty(qty); updateHint();
  };

  openSheet({
    title: `${type.icon} ${type.label}`,
    render: (sh) => {
      const entries = doc.meals.filter((x) => x.type === type.key);
      photoIn.onchange = async (e) => {
        const f = e.target.files[0]; if (!f) return;
        try { photo = await shrinkImage(f, 1000); sh.refresh(); } catch { toast('사진을 읽지 못했어요'); }
        e.target.value = '';
      };
      const satRow = h('div', { class: 'faces' },
        SATIETY.map((s) => h('button', { class: 'face sm' + (satiety === s.v ? ' on' : ''), onclick: () => { satiety = satiety === s.v ? null : s.v; sh.refresh(); } }, s.face, h('span', null, s.label))));
      return h('div', null,
        entries.length ? h('div', { style: 'margin-bottom:12px' }, entries.map((x) => h('div', { class: 'list-item' },
          x.photo && h('img', { src: x.photo, class: 'thumb lg', onclick: () => photoViewer(x.photo, x.name) }),
          h('div', { class: 'grow', onclick: () => { loadForm(x); sh.refresh(); } },
            h('div', null, h('span', { class: 'food-ic' }, foodIcon(x.name)), ' ', mealLabel(x), ' ', x.satiety ? SATIETY.find((s) => s.v === x.satiety)?.face : ''),
            h('div', { class: 'muted small' }, [x.kcal ? `${x.kcal} kcal${x.qty && x.qty !== 1 && x.unitKcal ? ` (${Math.round(x.unitKcal)}×${fmtQty(x.qty)})` : ''}` : null, x.at, x.note].filter(Boolean).join(' · '))),
          h('button', { class: 'icon-btn plain', onclick: async () => {
            await updateDay(ctx.day, (d) => { d.meals = d.meals.filter((y) => y.id !== x.id); });
            doc = await getDay(ctx.day); if (editing?.id === x.id) resetForm(); sh.refresh();
          } }, '🗑️')))) : null,
        mealMedsRow(doc, m, ctx, type.key, async () => { doc = await getDay(ctx.day); sh.refresh(); }),
        h('div', { class: 'muted small', style: 'margin-bottom:6px' }, editing ? '수정 중' : '프리셋에서 고르거나 직접 입력'),
        h('div', { class: 'chips', style: 'margin-bottom:12px' },
          presets.map((p) => h('button', { class: 'chip' + (presetId === p.id ? ' on' : ''), onclick: () => {
            presetId = p.id; name.value = p.name; setUnit(p.kcal ?? null, '1인분'); if (p.kcal == null) kcal.value = ''; sh.refresh();
          } }, p.favorite ? '★ ' : '', p.name, p.kcal ? h('span', { class: 'muted' }, ` ${p.kcal}`) : null))),
        h('div', { class: 'row', style: 'margin-bottom:4px' }, name, h('div', { style: 'width:100px' }, kcal)),
        suggest,
        h('div', { class: 'qty-row' },
          h('span', { class: 'muted small' }, '수량'),
          h('button', { class: 'qty-btn', 'aria-label': '수량 줄이기', onclick: () => { qty = Math.max(0.25, Math.round((qty - 0.5) * 1e6) / 1e6); applyQty(); } }, '−'),
          qtyIn,
          h('button', { class: 'qty-btn', 'aria-label': '수량 늘리기', onclick: () => { qty = Math.round((qty + 0.5) * 1e6) / 1e6; applyQty(); } }, '+'),
          qtyHint),
        h('div', { class: 'qty-fracs' },
          [['¼', 1 / 4], ['⅓', 1 / 3], ['½', 1 / 2], ['⅔', 2 / 3], ['¾', 3 / 4], ['1', 1]].map(([t, v]) =>
            h('button', { class: 'chip sm', onclick: () => { qty = v; applyQty(); } }, t))),
        h('div', { class: 'muted small', style: 'margin-bottom:10px' }, '이름을 치면 칼로리 후보가 떠요. ★는 내가 전에 기록한 것. 계란 반 개는 0.5, 세 개는 3'),
        h('div', { class: 'field' }, h('label', null, '포만감'), satRow),
        field('메모', note),
        h('div', { class: 'row', style: 'margin-bottom:12px' },
          photo
            ? [h('img', { src: photo, class: 'thumb lg', onclick: () => photoViewer(photo) }),
               h('button', { class: 'btn secondary sm', onclick: () => photoIn.click() }, '사진 바꾸기'),
               h('button', { class: 'btn danger sm', onclick: () => { photo = null; sh.refresh(); } }, '지우기')]
            : h('button', { class: 'btn secondary sm', onclick: () => photoIn.click() }, '📷 사진 붙이기 (선택)'),
          photoIn),
        h('div', { class: 'row' },
          editing && h('button', { class: 'btn secondary', onclick: () => { resetForm(); sh.refresh(); } }, '취소'),
          h('button', { class: 'btn grow', id: 'meal-save-btn', onclick: async () => {
            if (!name.value.trim()) { sh.close(); return; }
            const fromPick = picked && picked.name === name.value.trim() && picked.src === 'official';
            const sc = (v) => (v == null ? null : Math.round(v * qty * 10) / 10); // 탄단지도 수량만큼
            const rec = { id: editing?.id ?? uid(), at: editing?.at ?? nowHM(), type: type.key, presetId, name: name.value.trim(), kcal: numOr(kcal.value),
              qty, unitKcal: unitKcal != null ? Math.round(unitKcal * 10) / 10 : null, serving,
              satiety, note: note.value.trim() || null, photo, source: 'manual',
              ...(fromPick ? { carb: sc(picked.carb), protein: sc(picked.protein), fat: sc(picked.fat), foodSrc: 'mfds' }
                : editing?.foodSrc ? { carb: editing.carb ?? null, protein: editing.protein ?? null, fat: editing.fat ?? null, foodSrc: editing.foodSrc } : {}) };
            picked = null;
            await updateDay(ctx.day, (d) => { const i = d.meals.findIndex((y) => y.id === rec.id); if (i >= 0) d.meals[i] = rec; else d.meals.push(rec); });
            doc = await getDay(ctx.day); historyCache = null; foodHistory().then((hh) => { history = hh; }); resetForm(); sh.refresh(); toast('저장했어요');
          } }, editing ? '수정 저장' : (name.value.trim() ? '기록' : '닫기'))),
        h('div', { class: 'muted small', style: 'margin-top:8px;text-align:center' }, '약·영양제 칩은 누르는 즉시 저장돼요. 음식 없이 닫아도 됩니다.'));
    },
  });
}

// ---------- 약 · 영양제 (세트) ----------
function medsSection(doc, m, ctx) {
  const groups = slotGroups(m);
  if (!groups.length) return h('div', { class: 'card compact', onclick: () => ctx.goTab('settings') },
    h('span', null, '💊 약 · 영양제'), h('span', { class: 'muted small grow', style: 'text-align:right' }, '설정에서 세트 등록 ›'));
  return h('div', { class: 'card compact', onclick: () => medsSheet(doc, m, ctx) },
    h('span', null, '💊 약 · 영양제'),
    h('span', { class: 'grow row', style: 'justify-content:flex-end;gap:10px;flex-wrap:wrap' },
      groups.map((g) => h('span', { class: 'med-dots' }, h('span', { class: 'muted small' }, g.icon), g.sets.map((set) => pieFor(doc, set, g.key, 16))))),
    h('span', { class: 'muted' }, '›'));
}

// 식사 시트 안: 이 끼니의 세트들
function mealMedsRow(doc, m, ctx, slot, onToggle) {
  const sets = setsForSlot(m, slot);
  if (!sets.length) return null;
  return h('div', { class: 'field' },
    h('label', null, '💊 이 끼니와 함께'),
    sets.map((set) => setRow(doc, ctx, set, slot, onToggle)));
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
// 메모는 칸을 벗어날 때(또는 앱이 뒤로 갈 때) 저장한다.
// 치는 중에 저장하면 화면 전체가 다시 그려져 키보드가 닫히기 때문
let flushNote = null;
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushNote?.(); });
function ratingSection(doc, ctx) {
  const day = ctx.day;
  const save = () => {
    flushNote = null;
    const v = note.value;
    if (v !== (doc.note ?? '')) updateDay(day, (d) => { d.note = v; });
  };
  const note = h('textarea', { class: 'input', placeholder: '한 줄 메모 (선택)',
    oninput: () => { flushNote = save; },
    onblur: save,
  }, doc.note ?? '');
  return h('div', { class: 'card' },
    h('div', { class: 'card-title' }, h('span', null, '🌈 오늘은 어땠나요?')),
    h('div', { class: 'faces', style: 'margin-bottom:10px' },
      RATINGS.map((r) => h('button', { class: 'face' + (doc.rating === r.v ? ' on' : ''), onclick: () => updateDay(ctx.day, (d) => { d.rating = d.rating === r.v ? null : r.v; }) }, r.face, h('span', null, r.label)))),
    note);
}
