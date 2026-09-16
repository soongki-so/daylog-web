// 인바디 앱 CSV 내보내기 파일 → 체중 기록
// 형식: 첫 줄 한글 헤더, 날짜는 yyyymmddHHMMSS, 없는 값은 '-'
import { updateDay, getDay } from './store.js';

const COLS = {
  kg: '체중(kg)', muscle: '골격근량(kg)', fatKg: '체지방량(kg)', bmi: 'BMI(kg/m²)', bodyFat: '체지방률(%)',
  bmr: '기초대사량(kcal)', score: '인바디점수', visceral: '내장지방레벨(Level)', whr: '복부지방률',
  water: '체수분(L)', protein: '단백질(kg)', mineral: '무기질(kg)', device: '측정장비',
};

function splitLine(line) {
  // 따옴표 안의 쉼표 처리
  const out = []; let cur = '', q = false;
  for (const ch of line) {
    if (ch === '"') q = !q;
    else if (ch === ',' && !q) { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

const num = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : null; };

export function parseInBodyCsv(text) {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) throw new Error('내용이 없는 파일이에요.');
  const header = splitLine(lines[0]).map((h) => h.replace(/\s/g, ''));
  const idx = (name) => header.findIndex((h) => h === name.replace(/\s/g, ''));
  const dateI = header.findIndex((h) => h.startsWith('날짜') || h.toLowerCase().startsWith('date'));
  if (dateI < 0 || idx(COLS.kg) < 0) throw new Error('인바디 앱에서 내보낸 CSV가 아닌 것 같아요. (날짜, 체중(kg) 열이 필요)');
  const map = Object.fromEntries(Object.entries(COLS).map(([k, name]) => [k, idx(name)]));
  const rows = [];
  for (const line of lines.slice(1)) {
    const c = splitLine(line);
    const d = (c[dateI] ?? '').replace(/\D/g, '');
    if (d.length < 8) continue;
    const day = `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
    const at = d.length >= 12 ? `${d.slice(8, 10)}:${d.slice(10, 12)}` : null;
    const get = (k) => (map[k] >= 0 ? c[map[k]] : null);
    const kg = num(get('kg'));
    if (!kg) continue;
    rows.push({
      day, at, kg,
      muscle: num(get('muscle')), fatKg: num(get('fatKg')), bmi: num(get('bmi')), bodyFat: num(get('bodyFat')),
      bmr: num(get('bmr')), score: num(get('score')), visceral: num(get('visceral')), whr: num(get('whr')),
      water: num(get('water')), protein: num(get('protein')), mineral: num(get('mineral')),
      device: get('device') || null,
    });
  }
  rows.sort((a, b) => (a.day < b.day ? -1 : 1));
  return rows;
}

// 같은 날 기록이 있으면: 인바디 기록은 덮어쓰고, 손으로 넣은 체중은 인바디 값으로 바꾸되 사진은 유지
export async function importInBodyRows(rows) {
  let added = 0, updated = 0;
  for (const r of rows) {
    const cur = await getDay(r.day);
    const prev = cur.weight;
    await updateDay(r.day, (d) => {
      d.weight = { ...r, photo: prev?.photo ?? null, source: 'inbody', at: r.at ?? prev?.at ?? '09:00' };
    });
    if (prev) updated++; else added++;
  }
  return { added, updated, latest: rows[rows.length - 1] ?? null };
}
