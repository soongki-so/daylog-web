// 캐릭터 탭: 시작·지금·목표 세 모습, 기록 통계, 꾸미기, 해금 선반, 몸 정보(키·시작·목표 체중) 시트
import { h, openSheet, toast, field, input, select, numOr } from '../ui.js';
import { getMasters, updateMasters } from '../store.js';
import { fmtKey } from '../date.js';
import { W, H, drawAvatar, scene, ITEMS, KINDS, HAIRS, HAIR_COLORS, SHIRT_COLORS, SKINS, avatarScene, unlockState, lookOf } from '../avatar.js';

export async function renderAvatar(root, ctx) {
  const m = await getMasters();
  const sc = await avatarScene(m);
  root.replaceChildren(
    h('div', { class: 'cal-head' },
      h('button', { class: 'icon-btn', onclick: () => ctx.goTab('today'), 'aria-label': '오늘로' }, '‹'),
      h('h1', null, '내 캐릭터'),
      h('button', { class: 'icon-btn', onclick: () => bodySheet(m, sc), 'aria-label': '몸 정보', title: '키 · 시작 · 목표 체중' }, '📏')),
    stageCard(sc, m),
    statsCard(sc),
    styleCard(sc),
    shelfCard(sc),
  );
}

const kgText = (v) => (v != null ? `${Number(v).toFixed(1)}kg` : '—');
const mkCanvas = (scale) => h('canvas', { width: W * scale, height: H * scale });

// ---------- 무대 ----------
function stageCard(sc, m) {
  const look = sc.look;
  const cvStart = mkCanvas(3), cvNow = mkCanvas(6), cvGoal = mkCanvas(3);
  drawAvatar(cvNow, { ...look, ...sc.b.now, mood: sc.mood, sweat: sc.sweat }, look.bg);
  drawAvatar(cvStart, { ...look, hat: null, face: null, prop: null, ...sc.b.start, mood: 'neutral' });
  drawAvatar(cvGoal, { ...look, prop: null, ...sc.b.goal, mood: 'star' });
  const wrap = h('div', { class: 'av-anim' }, cvNow);
  const jump = () => { wrap.classList.remove('jump'); void wrap.offsetWidth; wrap.classList.add('jump'); setTimeout(() => wrap.classList.remove('jump'), 650); };
  const pct = Math.round(sc.b.prog * 100);
  const lost = sc.b.lost ?? 0;
  const progressBlock = sc.goal != null && sc.hasBody
    ? h('div', { class: 'av-progress' },
        h('div', { class: 'bar' }, h('div', { style: `width:${pct}%` })),
        h('div', { class: 'lbl' }, h('span', null, '시작에서 목표까지'),
          h('span', null, sc.b.prog >= 1 ? `목표 도착! ${Math.abs(lost).toFixed(1)}kg ${lost >= 0 ? '감량' : '증량'}` : `${pct}% · ${Math.abs(lost).toFixed(1)}kg ${lost >= 0 ? '감량' : '증량'} · 목표까지 ${Math.abs(sc.now - sc.goal).toFixed(1)}kg`)))
    : h('button', { class: 'btn secondary block', style: 'margin-top:10px', onclick: () => bodySheet(m, sc) },
        sc.hasBody ? '🎯 키·목표 체중을 넣으면 변화가 보여요' : '⚖️ 오늘 화면에서 체중을 기록하고, 키·목표 체중을 넣어 주세요');
  return h('div', { class: 'card av-stage' },
    h('div', { class: 'av-bubble' }, sc.bubble),
    h('div', { class: 'av-trio' },
      h('div', { class: 'av-fig side start' }, cvStart, h('div', { class: 'cap' }, 'START', h('b', null, kgText(sc.start)))),
      h('div', { class: 'av-fig now', onclick: jump }, wrap, h('div', { class: 'cap' }, 'NOW', h('b', null, kgText(sc.now)))),
      h('div', { class: 'av-fig side goal' }, cvGoal, h('div', { class: 'cap' }, 'GOAL', h('b', null, sc.goal != null ? kgText(sc.goal) : '?')))),
    progressBlock,
    h('div', { class: 'muted small', style: 'text-align:center;margin-top:8px' }, '캐릭터를 누르면 폴짝. 체중·인바디를 저장할 때마다 몸이 바뀌어요.'));
}

// ---------- 기록 통계 (해금 조건이 되는 숫자들) ----------
function statsCard(sc) {
  const s = sc.stats;
  const stat = (k, v, d) => h('div', { class: 'stat' }, h('div', { class: 'k' }, k), h('div', { class: 'v' }, v), d ? h('div', { class: 'd' }, d) : null);
  return h('div', { class: 'card' },
    h('div', { class: 'av-stats' },
      stat('🔥 연속 기록', `${s.streak}일`, s.streak ? '오늘도 이어가요' : '오늘 기록하면 1일'),
      stat('🏋️ 수업', `${s.classCount}회`, 'PT·필라테스 등'),
      stat('◎ 꽉 채운 날', `${s.fullDays}일`, '달력 초록 고리'),
      stat('🎯 목표', sc.goal != null ? `${s.progressPct}%` : '—', sc.goal != null ? '시작→목표' : '목표 체중 미설정')));
}

// ---------- 꾸미기 ----------
function styleCard(sc) {
  const look = sc.look;
  const set = (patch) => updateMasters((mm) => { mm.avatar = { ...lookOf(mm), ...patch }; });
  const chips = (list, cur, onPick) => h('div', { class: 'chips' }, list.map(([v, label]) => h('button', { class: 'chip' + (cur === v ? ' on' : ''), onclick: () => onPick(v) }, label)));
  const swatches = (list, cur, onPick, bgOf = (v) => v) => h('div', { class: 'chips' }, list.map(([v, label]) =>
    h('button', { class: 'av-sw' + (String(cur) === String(v) ? ' on' : ''), style: `background:${bgOf(v)}`, 'aria-label': label, title: label, onclick: () => onPick(v) })));
  const opt = (k, body) => h('div', { class: 'field', style: 'margin-bottom:10px' }, h('label', null, k), body);
  return h('div', { class: 'card' },
    h('div', { class: 'card-title' }, h('span', null, '🎨 꾸미기')),
    opt('성별', chips([['f', '여'], ['m', '남']], look.sex, (v) => set({ sex: v, hair: HAIRS[v][0][0], outfit: v === 'm' && look.outfit === 'dress' ? 'tee' : look.outfit, shirt: v === 'f' ? '#F07A8F' : '#6FA8DC' }))),
    opt('머리', chips(HAIRS[look.sex] ?? HAIRS.f, look.hair, (v) => set({ hair: v }))),
    opt('머리색', swatches(HAIR_COLORS, look.hairColor, (v) => set({ hairColor: v }))),
    opt('피부', swatches(SKINS.map((s, i) => [i, ['밝은 피부', '중간 피부', '어두운 피부'][i]]), look.skin, (v) => set({ skin: v }), (v) => SKINS[v][0])),
    opt('옷 색', swatches(SHIRT_COLORS, look.shirt, (v) => set({ shirt: v }))),
    h('div', { class: 'muted small' }, '모자·옷·소품·배경은 아래 선반에서 눌러 입혀요. 같은 걸 다시 누르면 벗어요.'));
}

// ---------- 해금 선반 ----------
function haveText(u, type) {
  if (u.have == null) return '';
  return type === 'progress' ? ` · 지금 ${u.have}%` : ` · 지금 ${u.have}`;
}
function shelfCard(sc) {
  const look = sc.look, stats = sc.stats;
  const set = (patch) => updateMasters((mm) => { mm.avatar = { ...lookOf(mm), ...patch }; });
  const open = ITEMS.filter((it) => unlockState(it, stats).ok).length;
  return h('div', { class: 'card' },
    h('div', { class: 'card-title' }, h('span', null, '🎁 해금 선반'), h('span', null, `${open}/${ITEMS.length} 열림`)),
    h('div', { class: 'muted small', style: 'margin:-4px 0 4px' }, '기록이 쌓이면 하나씩 열려요. 잠긴 걸 누르면 조건이 보여요.'),
    KINDS.map(([kind, label]) => [
      h('div', { class: 'av-kind' }, label),
      h('div', { class: 'av-shelf' }, ITEMS.filter((it) => it.kind === kind).map((it) => {
        const u = unlockState(it, stats);
        const on = look[kind] === it.v;
        const c = h('canvas', { width: W * 2, height: H * 2 });
        if (kind === 'bg') scene(c.getContext('2d'), 2, it.v);
        else drawAvatar(c, { ...look, hat: null, face: null, prop: null, outfit: 'tee', [kind]: it.v, bulk: 0.45, tone: 0.5, mood: 'happy' });
        return h('button', { class: 'av-item' + (on ? ' on' : '') + (u.ok ? '' : ' locked'), onclick: async () => {
          if (!u.ok) { toast(`🔒 ${u.label}${haveText(u, it.cond.type)}`); return; }
          await set({ [kind]: on ? (kind === 'outfit' ? 'tee' : null) : it.v });
          toast(on ? `${it.name} 벗었어요` : `${it.name} 착용!`);
        } }, c, h('span', null, it.name), h('span', { class: 'cond' }, u.ok ? (it.cond ? '열림 ✓' : '처음부터') : u.label));
      })),
    ]));
}

// ---------- 몸 정보 시트 ----------
function bodySheet(m, sc) {
  const s = m.settings;
  const hIn = input({ type: 'number', inputmode: 'decimal', value: s.heightCm ?? '', placeholder: '예: 165' });
  const startIn = input({ type: 'number', step: '0.1', inputmode: 'decimal', value: s.startWeightKg ?? '', placeholder: sc.stats.first ? `첫 기록 ${sc.stats.first.kg}` : '예: 78' });
  const goalIn = input({ type: 'number', step: '0.1', inputmode: 'decimal', value: s.goalWeightKg ?? '', placeholder: '예: 60' });
  const kSel = select([1, 1.5, 2, 2.5, 3].map((v) => ({ value: String(v), label: v === 1 ? 'x1 (실제 비율)' : v === 3 ? 'x3 (만화처럼)' : `x${v}` })), String(s.avatarExaggerate ?? 2));
  const info = [
    sc.now != null && sc.stats.latest ? `지금 체중 ${sc.now}kg (${fmtKey(sc.stats.latest.day)} 기록)` : '아직 체중 기록이 없어요. 오늘 화면 ⚖️ 체중에서 넣어 주세요.',
    sc.stats.latestBody ? `체지방 ${sc.stats.latestBody.fat ?? '-'}% · 골격근 ${sc.stats.latestBody.mus ?? '-'}kg (${fmtKey(sc.stats.latestBody.day)})` : '인바디(체지방·골격근)를 넣으면 살집과 어깨·팔이 더 정확해져요.',
  ];
  openSheet({
    title: '📏 내 몸 정보',
    render: (sh) => h('div', null,
      h('div', { class: 'muted small', style: 'margin-bottom:10px;line-height:1.5' }, info.map((t) => h('div', null, t))),
      h('div', { class: 'grid2' }, field('키 (cm)', hIn), field('변화 과장', kSel)),
      h('div', { class: 'grid2' }, field('시작 체중 (kg)', startIn), field('목표 체중 (kg)', goalIn)),
      h('div', { class: 'muted small', style: 'margin:-6px 0 12px' }, '시작 체중을 비우면 첫 체중 기록을 써요. 캐릭터 몸집은 "시작에서 목표까지 몇 % 왔나"로 정해져서 조금만 빠져도 티가 나요. 과장 x1은 실제 비율, x3은 만화처럼.'),
      h('button', { class: 'btn block', onclick: async () => {
        await updateMasters((mm) => {
          mm.settings.heightCm = numOr(hIn.value) || null;
          mm.settings.startWeightKg = numOr(startIn.value) || null;
          mm.settings.goalWeightKg = numOr(goalIn.value) || null;
          mm.settings.avatarExaggerate = numOr(kSel.value, 2);
        });
        toast('저장했어요'); sh.close();
      } }, '저장')),
  });
}
