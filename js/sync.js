// 기기 간 동기화 (Supabase REST API를 fetch로 직접 호출, 외부 라이브러리 없음)
// - 로그인: 이메일 + 비밀번호
// - 올리기: 기기에서 바뀐 날짜/설정만 모아서 1.5초 뒤 한꺼번에 upsert
// - 받기: 앱을 열 때, 화면으로 돌아올 때, 1분마다 서버에서 바뀐 것만 받아 옴 (synced_at 기준)
// - 충돌: 같은 날짜를 두 기기에서 고치면 나중에 고친 쪽(updatedAt)이 이김
import { SUPABASE_URL, SUPABASE_KEY } from './config.js';
import { setSyncHook, applyRemoteDay, applyRemoteMasters, getAllDays, getDayRaw, getMasters } from './store.js';

const K = { session: 'daylog.session', dirty: 'daylog.dirty', pulled: 'daylog.pulledAt', last: 'daylog.lastSync' };
const ls = {
  get(k, d = null) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* 저장 불가 환경 */ } },
  del(k) { try { localStorage.removeItem(k); } catch { /* 무시 */ } },
};

export const syncEnabled = () => !!(SUPABASE_URL && SUPABASE_KEY);
export const getSession = () => ls.get(K.session);
export const lastSyncAt = () => ls.get(K.last);

// ---- 상태 알림 ----
const bus = new EventTarget();
export const onSyncStatus = (fn) => bus.addEventListener('status', fn);
let status = { state: 'idle', message: '' };
export const getStatus = () => status;
function setStatus(state, message = '') {
  status = { state, message };
  bus.dispatchEvent(new Event('status'));
}

// ---- 로그인 ----
function authMessage(j, fallback) {
  const m = j?.error_description || j?.msg || j?.message || j?.error || fallback;
  if (/invalid login|invalid_credentials/i.test(m)) return '이메일 또는 비밀번호가 맞지 않아요.';
  if (/already registered|already exists/i.test(m)) return '이미 가입된 이메일이에요. "로그인"을 눌러 주세요.';
  if (/password should be|weak_password/i.test(m)) return '비밀번호는 6자 이상이어야 해요.';
  if (/email not confirmed/i.test(m)) return '이메일 확인이 필요해요. 메일함의 확인 링크를 누른 뒤 다시 로그인해 주세요.';
  if (/rate limit/i.test(m)) return '잠시 후 다시 시도해 주세요. (요청이 너무 잦아요)';
  return m;
}

async function authPost(path, body) {
  let res;
  try {
    res = await fetch(`${SUPABASE_URL}/auth/v1/${path}`, {
      method: 'POST',
      headers: { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch { throw new Error('서버에 연결하지 못했어요. 인터넷 연결을 확인해 주세요.'); }
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(authMessage(j, `로그인 서버 오류 (${res.status})`));
  return j;
}

function saveSession(j, prev) {
  const s = {
    access_token: j.access_token,
    refresh_token: j.refresh_token,
    expires_at: Date.now() + (j.expires_in ?? 3600) * 1000,
    email: j.user?.email ?? prev?.email ?? null,
    user_id: j.user?.id ?? prev?.user_id ?? null,
  };
  ls.set(K.session, s);
  return s;
}

export async function signUp(email, password) {
  const j = await authPost('signup', { email, password });
  if (!j.access_token) throw new Error('가입은 됐어요. 메일함의 확인 링크를 누른 뒤 "로그인"을 눌러 주세요.');
  saveSession(j);
  return firstSync();
}

export async function signIn(email, password) {
  const j = await authPost('token?grant_type=password', { email, password });
  saveSession(j);
  return firstSync();
}

export function signOut() {
  ls.del(K.session);
  ls.del(K.pulled);
  setStatus('idle', '로그아웃했어요');
}

async function accessToken() {
  const s = getSession();
  if (!s) return null;
  if (Date.now() < s.expires_at - 60_000) return s.access_token;
  try {
    const j = await authPost('token?grant_type=refresh_token', { refresh_token: s.refresh_token });
    return saveSession(j, s).access_token;
  } catch (e) {
    if (/연결하지 못했어요/.test(e.message)) throw e; // 오프라인이면 세션 유지
    signOut();
    throw new Error('로그인이 만료됐어요. 다시 로그인해 주세요.');
  }
}

// ---- 서버 데이터 ----
async function rest(path, { method = 'GET', body, prefer } = {}) {
  const t = await accessToken();
  if (!t) throw new Error('로그인이 필요해요.');
  const headers = { apikey: SUPABASE_KEY, Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' };
  if (prefer) headers.Prefer = prefer;
  let res;
  try {
    res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  } catch { throw new Error('서버에 연결하지 못했어요. 인터넷 연결을 확인해 주세요.'); }
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    if (j.code === '42501' || /permission denied/i.test(j.message ?? '')) throw new Error('서버 권한 설정이 아직 안 됐어요. Supabase SQL Editor에서 grant 세 줄을 실행해 주세요.');
    if (j.code === '42P01' || j.code === 'PGRST205') throw new Error('서버에 기록용 표가 없어요. Supabase SQL Editor에서 표 만드는 SQL을 실행해 주세요.');
    if (res.status === 401 || /JWT|jwt/.test(j.message ?? '')) throw new Error('로그인이 만료됐거나 올바르지 않아요. 로그아웃 후 다시 로그인해 주세요.');
    throw new Error(`${j.message || '동기화 서버 오류'} (${res.status}${j.code ? ' ' + j.code : ''})`);
  }
  if (res.status === 204) return null;
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

// ---- 바뀐 것 목록 (기기에 저장, 앱을 껐다 켜도 남음) ----
// { days: { [day]: 표시한 시각 }, masters: 표시한 시각 | null }
const readDirty = () => ls.get(K.dirty, { days: {}, masters: null });

function markDirty(kind, key) {
  const d = readDirty();
  const stamp = Date.now();
  if (kind === 'day') d.days[key] = stamp; else d.masters = stamp;
  ls.set(K.dirty, d);
  if (getSession()) schedulePush();
}
export const pendingCount = () => { const d = readDirty(); return Object.keys(d.days).length + (d.masters ? 1 : 0); };

let pushTimer;
function schedulePush(delay = 1500) {
  clearTimeout(pushTimer);
  pushTimer = setTimeout(() => { push().catch(() => {}); }, delay);
}

let pushing = null;
export function push() {
  if (!syncEnabled() || !getSession()) return Promise.resolve();
  if (pushing) return pushing.then(() => push());
  pushing = (async () => {
    const d = readDirty();
    const dayKeys = Object.keys(d.days);
    if (!dayKeys.length && !d.masters) return;
    setStatus('syncing', '올리는 중…');
    try {
      const uidv = getSession().user_id;
      const rows = [];
      for (const key of dayKeys) {
        const doc = await getDayRaw(key);
        if (doc) rows.push({ user_id: uidv, day: key, data: doc, updated_at: doc.updatedAt ?? new Date().toISOString() });
      }
      // 사진이 들어간 날은 크기가 커서 10개씩 나눠 보냄
      for (let i = 0; i < rows.length; i += 10) {
        await rest('days?on_conflict=user_id,day', { method: 'POST', body: rows.slice(i, i + 10), prefer: 'resolution=merge-duplicates,return=minimal' });
      }
      if (d.masters) {
        const m = await getMasters();
        await rest('masters?on_conflict=user_id', { method: 'POST', body: [{ user_id: uidv, data: m, updated_at: m.updatedAt ?? new Date().toISOString() }], prefer: 'resolution=merge-duplicates,return=minimal' });
      }
      // 올리는 동안 또 바뀐 항목은 남겨 둠
      const now = readDirty();
      for (const key of dayKeys) if (now.days[key] === d.days[key]) delete now.days[key];
      if (d.masters && now.masters === d.masters) now.masters = null;
      ls.set(K.dirty, now);
      ls.set(K.last, new Date().toISOString());
      setStatus('ok', '동기화됨');
    } catch (e) {
      setStatus('error', e.message);
      throw e;
    }
  })().finally(() => { pushing = null; });
  return pushing;
}

let pulling = null;
export function pull({ full = false } = {}) {
  if (!syncEnabled() || !getSession()) return Promise.resolve({ changed: 0, remoteDays: null, hadMasters: true });
  if (pulling) return pulling;
  pulling = (async () => {
    setStatus('syncing', '받는 중…');
    try {
      const since = full ? null : ls.get(K.pulled);
      let q = 'days?select=day,data,updated_at,synced_at&order=synced_at.asc';
      if (since) q += `&synced_at=gt.${encodeURIComponent(since)}`;
      const rows = (await rest(q)) ?? [];
      let changed = 0;
      let maxAt = since;
      const remoteDays = {};
      for (const r of rows) {
        remoteDays[r.day] = r.data?.updatedAt ?? r.updated_at;
        if (await applyRemoteDay(r.data, r.updated_at)) changed++;
        if (!maxAt || r.synced_at > maxAt) maxAt = r.synced_at;
      }
      const ms = (await rest('masters?select=data,updated_at')) ?? [];
      if (ms[0] && await applyRemoteMasters(ms[0].data, ms[0].updated_at)) changed++;
      if (maxAt) ls.set(K.pulled, maxAt);
      ls.set(K.last, new Date().toISOString());
      setStatus('ok', '동기화됨');
      return { changed, remoteDays, hadMasters: ms.length > 0 };
    } catch (e) {
      setStatus('error', e.message);
      throw e;
    }
  })().finally(() => { pulling = null; });
  return pulling;
}

// 처음 로그인했을 때: 서버 것 전부 받고, 이 기기에만 있거나 더 최신인 기록은 올림
async function firstSync() {
  const { remoteDays, hadMasters } = await pull({ full: true });
  const local = await getAllDays();
  const d = readDirty();
  for (const doc of local) {
    const r = remoteDays?.[doc.day];
    if (!r || (doc.updatedAt ?? '') > r) d.days[doc.day] = Date.now();
  }
  if (!hadMasters) d.masters = Date.now();
  ls.set(K.dirty, d);
  await push();
  return { uploaded: Object.keys(d.days).length };
}

export async function syncNow() {
  await push();
  return pull();
}

// ---- 시작 ----
let started = false;
export function startSync() {
  if (started) return;
  started = true;
  setSyncHook(markDirty);
  if (!syncEnabled()) return;
  const tick = () => {
    if (!getSession() || document.visibilityState !== 'visible') return;
    push().catch(() => {}).finally(() => pull().catch(() => {}));
  };
  document.addEventListener('visibilitychange', tick);
  window.addEventListener('online', tick);
  setInterval(tick, 60_000);
  tick();
}
