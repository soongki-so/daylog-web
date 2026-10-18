// 도트 캐릭터: 40×42 픽셀 격자를 코드로 찍는다. 몸 수치(체중·체지방·근육)에 따라 몸통·팔·볼살이 칸 단위로 바뀐다.
// masters.avatar = { sex, hair, hairColor, skin, shirt, hat, face, outfit, prop, bg }
// settings: heightCm, startWeightKg, goalWeightKg, avatarExaggerate(과장 배수 1~3)
// 해금 조건은 기록에서 셀 수 있는 것만: 연속 기록, 수업 회차, 고리 꽉 채운 날, 목표 진행률, 만보 날, 물 목표 날, 인바디 횟수
import { getAllDays } from './store.js';
import { completeness } from './complete.js';
import { classIdOf, allClasses } from './classes.js';
import { todayKey, addDays } from './date.js';

export const W = 40, H = 42, CX = 20;
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const even = (n) => { n = Math.round(n); return n % 2 ? n + 1 : n; };
const shade = (hex, k) => {
  const n = parseInt(hex.slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  const f = (c) => Math.round(clamp(c * k, 0, 255)).toString(16).padStart(2, '0');
  return '#' + f(r) + f(g) + f(b);
};
export const SKINS = [['#F6D3B8', '#E2B193'], ['#E8BF9F', '#CFA07E'], ['#C98F67', '#A8714F']];
export const HAIR_COLORS = [['#3B2A24', '진갈색'], ['#1E1A1A', '검정'], ['#8A5A3C', '밝은 갈색'], ['#C98A4B', '금발'], ['#B86C8C', '분홍'], ['#6E7FC9', '보라']];
export const SHIRT_COLORS = [['#F07A8F', '분홍'], ['#6FA8DC', '하늘'], ['#5FB899', '민트'], ['#F2B544', '노랑'], ['#A58CE0', '라벤더'], ['#5C554D', '차콜']];
export const HAIRS = { f: [['bob', '단발'], ['long', '긴 머리'], ['pony', '포니테일'], ['bun', '똥머리']], m: [['short', '짧은 머리'], ['part', '가르마'], ['buzz', '반삭'], ['long', '긴 머리']] };
const GOLD = '#F2B544', GOLD_S = '#D6952A', WHITE = '#FFFFFF', DARK = '#2B2622', SPARK = '#FFE39A';

export const DEFAULT_AVATAR = { sex: 'f', hair: 'bob', hairColor: '#3B2A24', skin: 0, shirt: '#F07A8F', hat: null, face: null, outfit: 'tee', prop: null, bg: null };

// ---------- 픽셀 격자 ----------
export function sprite(p) {
  const g = Array.from({ length: H }, () => new Array(W).fill(null));
  const put = (x, y, c) => { if (x >= 0 && x < W && y >= 0 && y < H) g[y][x] = c; };
  const at = (x, y) => (x >= 0 && x < W && y >= 0 && y < H ? g[y][x] : null);
  const span = (row, width, c, cs) => {
    width = even(width); const x0 = CX - width / 2;
    for (let x = x0; x < x0 + width; x++) put(x, row, cs && width >= 6 && x >= x0 + width - 2 ? cs : c);
    return [x0, x0 + width - 1];
  };
  const F = p.sex !== 'm';
  const bulk = clamp(p.bulk ?? 0.5), tone = clamp(p.tone ?? 0.5);
  const [SKIN, SKIN_S] = SKINS[p.skin ?? 0] ?? SKINS[0];
  const hairC = p.hairColor ?? '#3B2A24', hair = hairC, hairS = shade(hairC, 0.7);
  const outfit = p.outfit ?? 'tee';
  const shirtC = p.shirt ?? '#F07A8F';
  const shirt = outfit === 'tie' ? '#F7F4EE' : shirtC, shirtS = outfit === 'tie' ? '#DDD6CB' : shade(shirtC, 0.78);
  const pants = '#4A4F6A', pantsS = '#3A3E55', shoe = '#2B2622', eye = '#2B2622', mouth = '#B0524F', blush = '#F4A3AE';
  const mood = p.mood ?? 'neutral';

  // 뒤쪽 레이어 (몸통이 덮도록 먼저)
  if (p.hair === 'long') for (let r = 7; r <= 21; r++) { put(CX - 7, r, hair); put(CX - 8, r, hairS); put(CX + 6, r, hairS); put(CX + 7, r, hairS); }
  if (p.hair === 'pony') { for (let r = 5; r <= 8; r++) { put(CX + 6, r, hair); put(CX + 7, r, hairS); } for (let r = 9; r <= 18; r++) { put(CX + 7, r, hair); put(CX + 8, r, hairS); } put(CX + 8, 19, hairS); }
  if (outfit === 'hoodie') for (let r = 14; r <= 18; r++) { put(CX - 8, r, shirtS); put(CX - 7, r, shirt); put(CX + 6, r, shirt); put(CX + 7, r, shirtS); }

  // 머리
  const cheek = bulk > 0.35 ? 2 : 0, chin = bulk > 0.7;
  const headW = (r) => (r === 5 ? 8 : r === 6 ? 10 : r === 15 ? (chin ? 10 : 8) : r === 14 ? 10 + cheek : 12 + (r >= 9 && r <= 13 ? cheek : 0));
  for (let r = 5; r <= 15; r++) span(r, headW(r), SKIN, SKIN_S);
  if (chin) span(16, 8, SKIN_S); else span(16, 4, SKIN, SKIN_S);
  const hs = p.hair ?? 'short';
  if (hs === 'buzz') { span(4, 10, hairS); span(5, 12, hairS); span(6, 12, hairS); }
  else {
    if (hs === 'bun') { span(1, 4, hair); span(2, 6, hair, hairS); span(3, 4, hair); }
    span(3, 8, hair); span(4, 10, hair, hairS); span(5, 12, hair, hairS); span(6, 12, hair, hairS);
    if (hs === 'part') { for (let x = CX - 6; x <= CX - 3; x++) put(x, 7, hair); for (let x = CX + 1; x <= CX + 5; x++) put(x, 7, hair); put(CX - 6, 8, hair); put(CX + 5, 8, hair); }
    else { for (let x = CX - 6; x <= CX - 1; x++) put(x, 7, hair); put(CX - 6, 8, hair); put(CX + 5, 7, hair); put(CX + 5, 8, hair); }
    if (hs === 'bob') { for (let r = 7; r <= 13; r++) { put(CX - 7, r, hair); put(CX + 6, r, hairS); } put(CX - 6, 13, hair); put(CX + 5, 13, hairS); put(CX - 7, 14, hairS); put(CX + 6, 14, hairS); }
  }

  // 몸통 rows 17..28
  const ws = (F ? 10 : 12) + Math.round(tone * 6) + Math.round(bulk * 4);
  const ww = Math.max(6, (F ? 6 : 8) + Math.round(bulk * 14) - (tone > 0.5 ? 2 : 0));
  const wh = (F ? 12 : 10) + Math.round(bulk * 10);
  const torsoW = (r) => {
    let w = r <= 22 ? lerp(ws, ww, (r - 18) / 4) : lerp(ww, wh, (r - 22) / 6);
    if (r >= 22 && r <= 27) w += bulk * 6 * Math.sin(Math.PI * (r - 21) / 7);
    if (r === 17) w = ws - 2;
    return Math.min(even(w), 28);
  };
  let shoulder = [CX - 5, CX + 4];
  for (let r = 17; r <= 28; r++) {
    const w = torsoW(r);
    const belt = r === 28 && outfit !== 'dress';
    const [x0, x1] = span(r, w, belt ? pants : shirt, belt ? pantsS : shirtS);
    if (r === 18) shoulder = [x0, x1];
    if (outfit === 'tank' && r <= 18) { for (let i = 0; i < 3; i++) { put(x0 + i, r, i === 2 ? SKIN_S : SKIN); put(x1 - i, r, SKIN_S); } }
  }
  put(CX - 1, 17, SKIN); put(CX, 17, SKIN);
  if (outfit === 'tie') { put(CX - 2, 17, shirtS); put(CX + 1, 17, shirtS); for (let r = 18; r <= 23; r++) { put(CX - 1, r, '#B03A3A'); put(CX, r, '#B03A3A'); } put(CX - 1, 24, '#8F2E2E'); put(CX, 24, '#8F2E2E'); }
  if (outfit === 'hoodie') { for (let x = CX - 3; x <= CX + 2; x++) { put(x, 24, shirtS); put(x, 25, shirtS); put(x, 26, shirtS); } put(CX - 1, 18, WHITE); put(CX - 1, 19, WHITE); put(CX, 18, WHITE); put(CX, 19, WHITE); }
  if (outfit === 'jersey') { for (let x = CX - 1; x <= CX + 1; x++) put(x, 20, WHITE); put(CX + 1, 21, WHITE); put(CX, 22, WHITE); put(CX, 23, WHITE); put(CX - 1, 24, WHITE); }
  // 팔 rows 18..27
  const t = 2 + Math.round(tone * 2) + Math.round(bulk);
  const sleeveless = outfit === 'tank' || outfit === 'dress';
  for (let r = 18; r <= 27; r++) {
    const bump = r >= 20 && r <= 22 ? (tone > 0.85 ? 2 : tone > 0.55 ? 1 : 0) : 0;
    const sleeve = r <= 20 && !sleeveless;
    const c = sleeve ? shirt : SKIN, cs = sleeve ? shirtS : SKIN_S;
    for (let i = 0; i < t + bump; i++) { put(shoulder[0] - 1 - i, r, i === t + bump - 1 ? cs : c); put(shoulder[1] + 1 + i, r, i === t + bump - 1 ? cs : c); }
  }
  const armL = shoulder[0] - t, armR = shoulder[1] + t;
  // 다리·치마
  const lw = (F ? 2 : 3) + Math.round(bulk * 4) + Math.round(tone);
  if (outfit === 'dress') {
    for (let r = 29; r <= 33; r++) span(r, Math.min(wh + 2 + (r - 29) * 2, 30), shirt, shirtS);
    const l2 = Math.max(2, lw - 1);
    for (let r = 34; r <= 36; r++) for (let i = 0; i < l2; i++) { put(CX - 2 - i, r, SKIN); put(CX + 1 + i, r, i === l2 - 1 ? SKIN_S : SKIN); }
  } else {
    for (let r = 29; r <= 36; r++) {
      const c = r === 36 ? pantsS : pants;
      for (let i = 0; i < lw; i++) { put(CX - 2 - i, r, c); put(CX + 1 + i, r, i === lw - 1 ? pantsS : c); }
      if (outfit === 'track' && r <= 35) { put(CX - 1 - lw, r, WHITE); put(CX + lw, r, WHITE); }
    }
  }
  for (let r = 37; r <= 38; r++) for (let i = 0; i <= lw; i++) { put(CX - 2 - i, r, shoe); put(CX + 1 + i, r, shoe); }

  // 눈·입
  const ex = [CX - 4, CX + 3];
  if (mood === 'star') ex.forEach((x) => { put(x, 10, GOLD); put(x - 1, 10, GOLD); put(x + 1, 10, GOLD); put(x, 9, GOLD); put(x, 11, GOLD); });
  else if (mood === 'happy') ex.forEach((x) => { put(x, 10, eye); put(x - 1, 11, eye); put(x + 1, 11, eye); });
  else ex.forEach((x) => { put(x, 10, eye); put(x, 11, eye); });
  if (F && mood !== 'star') { put(CX - 5, 10, eye); put(CX + 4, 10, eye); }
  if (mood === 'neutral') { put(CX - 1, 13, mouth); put(CX, 13, mouth); }
  else { for (let x = CX - 2; x <= CX + 1; x++) put(x, 13, mouth); put(CX - 3, 12, mouth); put(CX + 2, 12, mouth); put(CX - 5, 12, blush); put(CX + 4, 12, blush); }
  // 얼굴 소품
  const skinish = (c) => !c || c === SKIN || c === SKIN_S || c === hair || c === hairS;
  if (p.face === 'glasses') { const fr = '#3A3330'; const box = (x0) => { for (let x = x0; x <= x0 + 4; x++) { if (skinish(at(x, 9))) put(x, 9, fr); if (skinish(at(x, 11))) put(x, 11, fr); } put(x0, 10, fr); put(x0 + 4, 10, fr); }; box(CX - 6); box(CX + 1); put(CX - 1, 10, fr); put(CX, 10, fr); }
  if (p.face === 'round') { const fr = '#C9962A'; const ring = (x0) => { for (let x = x0 + 1; x <= x0 + 3; x++) { if (skinish(at(x, 9))) put(x, 9, fr); if (skinish(at(x, 11))) put(x, 11, fr); } put(x0, 10, fr); put(x0 + 4, 10, fr); }; ring(CX - 6); ring(CX + 1); put(CX - 1, 10, fr); put(CX, 10, fr); }
  if (p.face === 'sun') { for (let r = 9; r <= 11; r++) { for (let x = CX - 6; x <= CX - 2; x++) put(x, r, DARK); for (let x = CX + 1; x <= CX + 5; x++) put(x, r, DARK); } put(CX - 1, 10, DARK); put(CX, 10, DARK); put(CX - 5, 9, '#6E6A66'); put(CX + 2, 9, '#6E6A66'); }
  // 머리 위
  const hat = p.hat;
  if (hat === 'cap') { const c = '#3F6FA8', cs = '#2F557F'; span(2, 8, c); span(3, 12, c, cs); span(4, 12, c, cs); for (let x = CX + 6; x <= CX + 8; x++) put(x, 4, cs); }
  if (hat === 'beanie') { const c = '#C95C6E', cs = '#A3465A'; span(0, 2, '#FFF4F6'); span(1, 6, c); span(2, 10, c, cs); span(3, 12, c, cs); span(4, 12, c, cs); span(5, 12, cs); }
  if (hat === 'band') span(5, 12, GOLD);
  if (hat === 'ribbon') { const c = '#E0506A', cs = '#B23B52'; [CX + 2, CX + 3, CX + 6, CX + 7].forEach((x) => put(x, 2, c)); for (let x = CX + 2; x <= CX + 7; x++) put(x, 3, c); put(CX + 4, 3, cs); put(CX + 5, 3, cs); [CX + 2, CX + 3, CX + 6, CX + 7].forEach((x) => put(x, 4, cs)); }
  if (hat === 'crown') { span(3, 10, GOLD, GOLD_S); [CX - 5, CX - 2, CX + 1, CX + 4].forEach((x) => put(x, 2, GOLD)); put(CX - 5, 1, GOLD); put(CX + 4, 1, GOLD); put(CX - 2, 1, '#E0506A'); put(CX + 1, 1, '#6FA8DC'); put(CX - 1, 3, '#E0506A'); put(CX, 3, '#6FA8DC'); }
  if (hat === 'straw') { const c = '#E9C77A', cs = '#C9A251'; span(2, 8, c); span(3, 10, c, cs); span(4, 10, '#B0423F'); span(5, 22, c, cs); }
  if (hat === 'catears') { const i = '#F4A3AE'; [[CX - 6, 2], [CX - 7, 3], [CX - 6, 3], [CX - 5, 3], [CX - 7, 4], [CX - 4, 4], [CX + 5, 2], [CX + 4, 3], [CX + 5, 3], [CX + 6, 3], [CX + 3, 4], [CX + 6, 4]].forEach(([x, y]) => put(x, y, hair)); put(CX - 6, 4, i); put(CX - 5, 4, i); put(CX + 4, 4, i); put(CX + 5, 4, i); }
  if (hat === 'phones') { const c = '#3A3330', cs = '#6E6A66'; span(3, 14, c); put(CX - 7, 4, c); put(CX + 6, 4, c); for (let r = 8; r <= 11; r++) { put(CX - 8, r, c); put(CX - 7, r, r === 9 || r === 10 ? '#E0506A' : c); put(CX + 6, r, r === 9 || r === 10 ? '#E0506A' : c); put(CX + 7, r, c); } put(CX - 8, 7, cs); put(CX + 7, 7, cs); }
  // 소품
  const prop = p.prop;
  if (prop === 'dumbbell') { const c = '#3A3330'; for (let r = 25; r <= 29; r++) { put(armR + 2, r, c); put(armR + 6, r, c); } for (let x = armR + 3; x <= armR + 5; x++) put(x, 27, '#8A8A8A'); }
  if (prop === 'bottle') { for (let r = 24; r <= 28; r++) { put(armL - 3, r, '#7CC4F5'); put(armL - 2, r, '#4FA3E0'); } put(armL - 3, 23, WHITE); put(armL - 2, 23, WHITE); }
  if (prop === 'shaker') { for (let r = 23; r <= 28; r++) { put(armL - 4, r, '#F7A8B8'); put(armL - 3, r, r === 25 ? WHITE : '#F7A8B8'); put(armL - 2, r, r === 25 ? WHITE : '#D97A8E'); } for (let x = armL - 4; x <= armL - 2; x++) put(x, 22, DARK); }
  if (prop === 'cat') { const c = '#E3A25A', cs = '#C4853F'; for (let r = 34; r <= 38; r++) for (let x = 3; x <= 9; x++) put(x, r, x > 7 ? cs : c); for (let r = 31; r <= 34; r++) for (let x = 2; x <= 7; x++) put(x, r, c); put(2, 30, c); put(6, 30, c); put(3, 32, DARK); put(6, 32, DARK); put(4, 33, '#E0506A'); put(10, 36, cs); put(11, 35, cs); put(11, 34, cs); put(10, 33, cs); put(2, 38, WHITE); put(5, 38, WHITE); }
  if (prop === 'dog') { const c = '#A5744B', cs = '#86592F', x0 = W - 11; for (let r = 34; r <= 38; r++) for (let x = x0; x <= x0 + 7; x++) put(x, r, x < x0 + 2 ? cs : c); for (let r = 31; r <= 34; r++) for (let x = x0 + 3; x <= x0 + 8; x++) put(x, r, c); put(x0 + 8, 31, cs); put(x0 + 8, 32, cs); put(x0 + 8, 33, cs); put(x0 + 3, 32, cs); put(x0 + 4, 32, DARK); put(x0 + 7, 32, DARK); put(x0 + 6, 33, DARK); put(x0 - 1, 33, cs); put(x0 - 2, 32, cs); put(x0 + 3, 38, WHITE); put(x0 + 6, 38, WHITE); put(x0 + 5, 35, '#E0506A'); }
  if (prop === 'plant') { const c = '#B86B45', l = '#5FA85F', ld = '#3E8A3E'; for (let r = 36; r <= 38; r++) for (let x = 3; x <= 7; x++) put(x, r, r === 36 ? '#D08A5E' : c); put(5, 35, ld); put(5, 34, ld); put(4, 34, l); put(3, 33, l); put(6, 33, l); put(7, 32, l); put(5, 32, l); }
  // 땀·반짝
  if (p.sweat) { put(CX + 8, 6, '#7CC4F5'); put(CX + 8, 7, '#7CC4F5'); put(CX + 7, 8, '#7CC4F5'); put(CX + 8, 8, '#4FA3E0'); put(CX + 9, 8, '#7CC4F5'); put(CX + 8, 9, '#4FA3E0'); }
  if (mood === 'star') [[CX - 12, 5], [CX + 11, 3], [CX - 11, 15], [CX + 12, 13]].forEach(([x, y]) => { put(x, y, GOLD); put(x - 1, y, SPARK); put(x + 1, y, SPARK); put(x, y - 1, SPARK); put(x, y + 1, SPARK); });
  // 외곽선
  const out = '#3A2E28';
  const solid = g.map((row) => row.map((c) => !!c && c !== SPARK && c !== GOLD));
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (g[y][x]) continue;
    if ((y > 0 && solid[y - 1][x]) || (y < H - 1 && solid[y + 1][x]) || (x > 0 && solid[y][x - 1]) || (x < W - 1 && solid[y][x + 1])) g[y][x] = out;
  }
  return g;
}

// ---------- 배경 ----------
export function scene(ctx, s, kind) {
  const px = (x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(x * s, y * s, w * s, h * s); };
  if (kind === 'room') { px(0, 0, W, 38, '#F3E6D2'); px(0, 38, W, 4, '#C9A57C'); px(0, 38, W, 1, '#B08C64'); px(3, 4, 9, 9, '#BFE0F5'); px(7, 4, 1, 9, WHITE); px(3, 8, 9, 1, WHITE); px(2, 3, 11, 1, '#A77C55'); px(2, 13, 11, 1, '#A77C55'); px(30, 24, 8, 14, '#D8B98E'); px(30, 24, 8, 1, '#B08C64'); px(31, 20, 3, 4, '#5FA85F'); px(31, 23, 3, 1, '#B86B45'); }
  if (kind === 'park') { px(0, 0, W, 36, '#CFE8F7'); px(0, 36, W, 6, '#7FC27E'); px(0, 36, W, 1, '#5FA85F'); px(32, 3, 4, 4, '#FFD66B'); px(31, 4, 6, 2, '#FFD66B'); px(33, 2, 2, 6, '#FFD66B'); px(5, 6, 6, 2, WHITE); px(6, 5, 4, 1, WHITE); px(3, 22, 2, 14, '#8A5A3C'); px(0, 14, 8, 9, '#5FA85F'); px(1, 12, 6, 3, '#5FA85F'); }
  if (kind === 'gym') { px(0, 0, W, 38, '#DFDAD3'); px(0, 38, W, 4, '#5C554D'); px(0, 38, W, 1, '#3F3A35'); px(1, 33, 2, 4, '#3F3A35'); px(3, 34, 4, 2, '#8A8A8A'); px(7, 33, 2, 4, '#3F3A35'); px(30, 6, 9, 5, '#3F3A35'); px(31, 7, 7, 3, '#9ADBB0'); px(0, 16, W, 1, '#C9C2B8'); px(33, 28, 6, 10, '#8A8A8A'); px(34, 29, 4, 8, '#B8B8B8'); }
  if (kind === 'beach') { px(0, 0, W, 24, '#CFE8F7'); px(0, 24, W, 10, '#5FB2E0'); px(0, 24, W, 1, '#8ED0F0'); px(0, 34, W, 8, '#F2DDA8'); px(0, 34, W, 1, '#FFF1C8'); px(6, 3, 4, 4, '#FFD66B'); px(5, 4, 6, 2, '#FFD66B'); px(7, 2, 2, 6, '#FFD66B'); px(28, 7, 6, 2, WHITE); px(33, 14, 2, 12, '#B86B45'); px(30, 10, 8, 5, '#5FA85F'); px(10, 27, 3, 1, WHITE); px(22, 30, 4, 1, WHITE); }
  if (kind === 'night') { px(0, 0, W, 38, '#1E2A4A'); px(0, 38, W, 4, '#2A2F45'); px(0, 38, W, 1, '#3C4466'); px(31, 4, 5, 5, '#FFF1B8'); px(33, 5, 5, 5, '#1E2A4A'); [[4, 5], [10, 12], [16, 4], [24, 9], [36, 16], [8, 20], [2, 14], [28, 2]].forEach(([x, y]) => px(x, y, 1, 1, '#FFF8D6')); px(5, 4, 1, 3, '#FFF8D6'); px(4, 5, 3, 1, '#FFF8D6'); }
  if (kind === 'sakura') { px(0, 0, W, 38, '#FBE9EE'); px(0, 38, W, 4, '#A9C98C'); px(0, 38, W, 1, '#8CB36E'); px(3, 20, 2, 18, '#8A5A3C'); px(0, 8, 12, 12, '#F6B7C8'); px(2, 6, 7, 3, '#F6B7C8'); px(1, 10, 4, 4, '#F08FA9'); px(6, 13, 4, 3, '#F08FA9'); [[18, 6], [26, 11], [34, 5], [30, 22], [14, 16], [37, 30]].forEach(([x, y]) => { px(x, y, 1, 1, '#F08FA9'); px(x + 1, y + 1, 1, 1, '#F6B7C8'); }); }
}

export function drawAvatar(canvas, p, bg = null, alpha = 1) {
  const s = canvas.width / W;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (bg) scene(ctx, s, bg);
  ctx.globalAlpha = alpha;
  const g = sprite(p);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (g[y][x]) { ctx.fillStyle = g[y][x]; ctx.fillRect(x * s, y * s, s, s); }
  ctx.globalAlpha = 1;
}

// 얼굴만 (오늘 화면 머리의 작은 버튼용): 가로 20칸 × 세로 20칸을 잘라 그린다
export function drawFace(canvas, p) {
  const s = canvas.width / 20;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const g = sprite({ ...p, prop: null, bulk: p.bulk ?? 0.45 });
  for (let y = 0; y < 20; y++) for (let x = 0; x < 20; x++) { const c = g[y][CX - 10 + x]; if (c) { ctx.fillStyle = c; ctx.fillRect(x * s, y * s, s, s); } }
}

// ---------- 아이템과 해금 조건 ----------
// cond: { type: 'streak'|'classes'|'full'|'progress'|'steps'|'water'|'inbody', n }
export const KINDS = [['hat', '머리 위'], ['face', '얼굴'], ['outfit', '옷'], ['prop', '소품'], ['bg', '배경']];
export const ITEMS = [
  { kind: 'hat', v: 'cap', name: '캡모자' }, { kind: 'hat', v: 'band', name: '헤어밴드', cond: { type: 'classes', n: 5 } },
  { kind: 'hat', v: 'beanie', name: '비니', cond: { type: 'streak', n: 7 } }, { kind: 'hat', v: 'ribbon', name: '리본', cond: { type: 'progress', n: 100 } },
  { kind: 'hat', v: 'straw', name: '밀짚모자', cond: { type: 'steps', n: 5 } }, { kind: 'hat', v: 'phones', name: '헤드폰', cond: { type: 'streak', n: 14 } },
  { kind: 'hat', v: 'catears', name: '고양이 귀', cond: { type: 'progress', n: 75 } }, { kind: 'hat', v: 'crown', name: '왕관', cond: { type: 'streak', n: 30 } },
  { kind: 'face', v: 'glasses', name: '안경' }, { kind: 'face', v: 'round', name: '동그란 안경', cond: { type: 'inbody', n: 3 } }, { kind: 'face', v: 'sun', name: '선글라스', cond: { type: 'progress', n: 50 } },
  { kind: 'outfit', v: 'tee', name: '티셔츠' }, { kind: 'outfit', v: 'hoodie', name: '후드티', cond: { type: 'streak', n: 7 } }, { kind: 'outfit', v: 'track', name: '트레이닝복', cond: { type: 'progress', n: 25 } },
  { kind: 'outfit', v: 'tank', name: '운동 나시', cond: { type: 'classes', n: 20 } }, { kind: 'outfit', v: 'jersey', name: '7번 저지', cond: { type: 'classes', n: 30 } },
  { kind: 'outfit', v: 'dress', name: '원피스', cond: { type: 'progress', n: 75 } }, { kind: 'outfit', v: 'tie', name: '셔츠·넥타이', cond: { type: 'progress', n: 75 } },
  { kind: 'prop', v: 'bottle', name: '물병', cond: { type: 'streak', n: 3 } }, { kind: 'prop', v: 'dumbbell', name: '아령', cond: { type: 'classes', n: 5 } }, { kind: 'prop', v: 'shaker', name: '셰이커', cond: { type: 'water', n: 7 } },
  { kind: 'prop', v: 'plant', name: '새싹 화분', cond: { type: 'full', n: 5 } }, { kind: 'prop', v: 'cat', name: '고양이', cond: { type: 'full', n: 10 } }, { kind: 'prop', v: 'dog', name: '강아지', cond: { type: 'progress', n: 100 } },
  { kind: 'bg', v: 'room', name: '내 방' }, { kind: 'bg', v: 'park', name: '공원' }, { kind: 'bg', v: 'gym', name: '헬스장', cond: { type: 'progress', n: 50 } },
  { kind: 'bg', v: 'beach', name: '해변', cond: { type: 'steps', n: 5 } }, { kind: 'bg', v: 'sakura', name: '벚꽃길', cond: { type: 'progress', n: 75 } }, { kind: 'bg', v: 'night', name: '밤하늘', cond: { type: 'progress', n: 100 } },
];
const COND_LABEL = { streak: (n) => `연속 ${n}일 기록`, classes: (n) => `수업 ${n}회`, full: (n) => `고리 꽉 채운 날 ${n}일`, progress: (n) => `목표 ${n}%`, steps: (n) => `만보 ${n}일`, water: (n) => `물 목표 ${n}일`, inbody: (n) => `인바디 ${n}회` };
export const condLabel = (cond) => (cond ? COND_LABEL[cond.type](cond.n) : '처음부터');
const STAT_OF = { streak: 'streak', classes: 'classCount', full: 'fullDays', progress: 'progressPct', steps: 'stepsDays', water: 'waterDays', inbody: 'inbodyCount' };
// { ok, have, need, label }
export function unlockState(item, stats) {
  if (!item.cond) return { ok: true, have: null, need: null, label: '처음부터' };
  const have = stats[STAT_OF[item.cond.type]] ?? 0;
  return { ok: have >= item.cond.n, have, need: item.cond.n, label: condLabel(item.cond) };
}

// ---------- 수치 → 몸 ----------
// 몸집은 "시작→목표 진행률"이 주로 정한다 (조금만 빠져도 티가 나게). 체지방률은 살집, 골격근량은 어깨·팔. k = 과장 배수
export function bodies({ h, start, now, goal, fat, mus, sex, k }) {
  const F = sex !== 'm';
  k = k ?? 2;
  const bmi = (kg) => (h ? kg / ((h / 100) ** 2) : 22 + (kg - (goal ?? start ?? kg)) * 0.35);
  const base = (kg) => 0.55 + ((bmi(kg) - 22) / 10) * 0.5;
  const fatV = fat ?? (F ? 28 : 20), musV = mus ?? (F ? 23 : 31);
  const fatAdj = ((fatV - (F ? 28 : 20)) / 16) * 0.2;
  const toneOf = (m) => clamp(0.5 + ((m - (F ? 23 : 31)) / 8) * 0.5 * k);
  if (start == null && now == null) return { prog: 0, bmi: null, start: { bulk: 0.6, tone: 0.5 }, now: { bulk: 0.5, tone: toneOf(musV) }, goal: { bulk: 0.3, tone: 0.6 }, lost: 0 };
  const s = start ?? now, n = now ?? start;
  const bStart = clamp(0.5 + (base(s) + fatAdj - 0.5) * k);
  const bGoal = goal != null ? clamp(0.5 + (base(goal) + fatAdj * 0.5 - 0.5) * k - 0.12) : clamp(bStart - 0.4);
  const spanW = goal != null ? s - goal : null;
  const prog = spanW == null ? 0 : Math.abs(spanW) < 0.01 ? 1 : clamp((s - n) / spanW);
  const bNow = goal != null ? lerp(bStart, bGoal, prog) : clamp(0.5 + (base(n) + fatAdj - 0.5) * k);
  return { prog, bmi: h ? bmi(n) : null, lost: s - n, start: { bulk: bStart, tone: toneOf(musV - 1.5) }, now: { bulk: bNow, tone: toneOf(musV) }, goal: { bulk: bGoal, tone: toneOf(musV + 2) } };
}

// ---------- 기록에서 통계 (해금·몸 수치) ----------
export async function avatarStats(m) {
  const today = todayKey(m.settings.dayBoundaryHour);
  const days = (await getAllDays()).filter((d) => d.day <= today).sort((a, b) => (a.day < b.day ? -1 : 1));
  const s = m.settings;
  const logged = new Set();
  let fullDays = 0, classCount = 0, stepsDays = 0, waterDays = 0, inbodyCount = 0;
  let latest = null, latestBody = null, first = null;
  for (const d of days) {
    const c = completeness(d, m);
    if (c.filled) logged.add(d.day);
    if (c.full) fullDays++;
    classCount += (d.exercise ?? []).filter((x) => classIdOf(x)).length;
    if ((d.steps ?? 0) >= (s.stepsGoal ?? 8000)) stepsDays++;
    if ((d.water ?? []).reduce((a, x) => a + (x.ml ?? 0), 0) >= (s.waterGoalMl ?? 2000)) waterDays++;
    const w = d.weight;
    if (w?.kg) {
      if (!first) first = { kg: w.kg, day: d.day };
      latest = { kg: w.kg, day: d.day };
      if (w.muscle || w.bodyFat || w.source === 'inbody') { inbodyCount++; latestBody = { fat: w.bodyFat ?? latestBody?.fat ?? null, mus: w.muscle ?? latestBody?.mus ?? null, day: d.day }; }
    }
  }
  classCount += allClasses(m).reduce((a, c) => a + (c.done ?? 0), 0); // 앱 쓰기 전에 한 수업
  // 연속 기록: 오늘(오늘 기록이 없으면 어제)부터 거꾸로
  let streak = 0, k = logged.has(today) ? today : addDays(today, -1);
  while (logged.has(k)) { streak++; k = addDays(k, -1); }
  const todayDoc = days.find((d) => d.day === today) ?? null;
  const todayComp = todayDoc ? completeness(todayDoc, m) : null;
  return {
    today, streak, fullDays, classCount, stepsDays, waterDays, inbodyCount, loggedDays: logged.size,
    latest, latestBody, first,
    todayFull: !!todayComp?.full,
    todayClass: !!todayDoc?.exercise?.some((x) => classIdOf(x)),
  };
}

export const lookOf = (m) => ({ ...DEFAULT_AVATAR, ...(m.avatar ?? {}) });

// 화면에 필요한 것 한 번에: 통계 + 몸 세 개 + 기분 + 진행률
export async function avatarScene(m) {
  const stats = await avatarStats(m);
  const s = m.settings, look = lookOf(m);
  const start = s.startWeightKg ?? stats.first?.kg ?? null;
  const now = stats.latest?.kg ?? null;
  const goal = s.goalWeightKg ?? null;
  const b = bodies({ h: s.heightCm ?? null, start, now, goal, fat: stats.latestBody?.fat ?? null, mus: stats.latestBody?.mus ?? null, sex: look.sex, k: s.avatarExaggerate ?? 2 });
  stats.progressPct = goal != null ? Math.round(b.prog * 100) : 0;
  const lost = b.lost ?? 0;
  const mood = goal != null && b.prog >= 1 ? 'star' : (stats.todayFull || lost > 0) ? 'happy' : 'neutral';
  const bubble = goal == null ? '목표 체중을 정해 주면 목표 모습도 보여 줄게요'
    : b.prog >= 1 ? '해냈다! 이제 유지 모드로 가요'
    : stats.todayClass ? '오늘 수업 다녀왔네요. 단백질 챙겨 먹어요'
    : stats.todayFull ? '오늘 기록 꽉 채웠네요, 최고!'
    : lost > 0 ? `시작보다 ${lost.toFixed(1)}kg 가벼워졌어요`
    : stats.streak >= 3 ? `${stats.streak}일 연속 기록 중! 오늘도 가볍게` : '오늘도 기록 고마워요!';
  return { stats, look, b, start, now, goal, mood, bubble, sweat: stats.todayClass, hasBody: now != null || start != null };
}
