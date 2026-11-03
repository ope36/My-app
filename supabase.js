// ═══════════════════════════════
// HUSH — Supabase Client (FINAL v7.7)
// FakeClient + getMyProfile fix
// ═══════════════════════════════

const SUPABASE_URL = "https://qebtxezcitzjeximzsuu.supabase.co";
const SUPABASE_KEY = "sb_publishable_2HWG7Fv7Bv3TEBRTNGpDIg_GM4yxVZO";

// ═══════════════════════════════
// Storage helpers
// ═══════════════════════════════

function getStoredAuth() {
  const raw = localStorage.getItem('hush-auth');
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

function setStoredAuth(data) {
  if (!data) { localStorage.removeItem('hush-auth'); return; }
  localStorage.setItem('hush-auth', JSON.stringify(data));
}

function clearStoredAuth() {
  localStorage.removeItem('hush-auth');
}

// ═══════════════════════════════
// Smart Refresh
// ═══════════════════════════════

let refreshPromise = null;
let lastRefreshAttempt = 0;

async function ensureFreshToken() {
  const auth = getStoredAuth();
  if (!auth?.access_token) return false;

  try {
    const payload = JSON.parse(atob(auth.access_token.split('.')[1]));
    const nowSec = Math.floor(Date.now() / 1000);
    const timeLeft = payload.exp - nowSec;

    if (timeLeft > 300) return true;
    if (Date.now() - lastRefreshAttempt < 30000) return true;
    if (refreshPromise) { await refreshPromise; return true; }

    lastRefreshAttempt = Date.now();
    console.log('[Auth] Token expiring (' + timeLeft + 's) — refreshing...');

    refreshPromise = (async () => {
      try {
        if (!auth.refresh_token) return false;
        const res = await fetch(SUPABASE_URL + '/auth/v1/token?grant_type=refresh_token', {
          method: 'POST',
          headers: { 'apikey': SUPABASE_KEY, 'Content-Type': 'application/json' },
          body: JSON.stringify({ refresh_token: auth.refresh_token })
        });
        const data = await res.json();
        if (!res.ok) return false;
        setStoredAuth({
          access_token: data.access_token,
          refresh_token: data.refresh_token,
          expires_at: Math.floor(Date.now() / 1000) + (data.expires_in || 3600),
          token_type: data.token_type,
          user: data.user || auth.user
        });
        console.log('[Auth] ✅ Token refreshed');
        return true;
      } catch (e) { return false; } 
      finally { refreshPromise = null; }
    })();

    await refreshPromise;
    return true;
  } catch (err) { return false; }
}

// ═══════════════════════════════
// REST & RPC helpers
// ═══════════════════════════════

async function restFetch(path, options = {}) {
  await ensureFreshToken();
  const auth = getStoredAuth();
  const token = auth?.access_token;
  const headers = { 'apikey': SUPABASE_KEY, 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (token) headers['Authorization'] = 'Bearer ' + token;

  const res = await fetch(SUPABASE_URL + '/rest/v1/' + path, {
    method: options.method || 'GET', headers, body: options.body ? JSON.stringify(options.body) : undefined
  });
  const text = await res.text();
  if (!res.ok) throw new Error(text || 'HTTP ' + res.status);
  return text ? JSON.parse(text) : null;
}

async function rpcFetch(fnName, params = {}) {
  await ensureFreshToken();
  const auth = getStoredAuth();
  const token = auth?.access_token;
  const headers = { 'apikey': SUPABASE_KEY, 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = 'Bearer ' + token;

  const res = await fetch(SUPABASE_URL + '/rest/v1/rpc/' + fnName, {
    method: 'POST', headers, body: JSON.stringify(params)
  });
  const text = await res.text();
  if (!res.ok) throw new Error(text || 'HTTP ' + res.status);
  return text ? JSON.parse(text) : null;
}

// ═══════════════════════════════
// Query Builder
// ═══════════════════════════════

function createQueryBuilder(table, initialParams = []) {
  const params = [...initialParams];
  let method = 'GET'; let body = null; let prefer = '';

  const builder = {
    select: (cols) => {
      const safeCols = cols || '*';
      const processed = safeCols.replace(/(?<!:)\b(profiles|likes|comments|follows|rooms|room_members|room_messages)\(([^)]+)\)/g, (m, tbl, col) => `${tbl}:${tbl}(${col})`);
      params.push('select=' + encodeURIComponent(processed)); return builder;
    },
    eq: (col, val) => { params.push(col + '=eq.' + encodeURIComponent(val)); return builder; },
    or: (cond) => { params.push('or=(' + cond + ')'); return builder; },
    order: (col, opts = {}) => { params.push('order=' + col + '.' + (opts.ascending ? 'asc' : 'desc')); return builder; },
    limit: (n) => { params.push('limit=' + n); return builder; },
    single: async () => { try { const res = await restFetch(table + '?' + params.join('&'), { method, body, headers: prefer ? { Prefer: prefer } : undefined }); return { data: Array.isArray(res) ? res[0] : res, error: null }; } catch (err) { return { data: null, error: { message: err.message } }; } },
    maybeSingle: async () => { try { const res = await restFetch(table + '?' + params.join('&'), { method, body, headers: prefer ? { Prefer: prefer } : undefined }); return { data: Array.isArray(res) ? (res[0] || null) : res, error: null }; } catch (err) { return { data: null, error: { message: err.message } }; } },
    insert: (data) => { method = 'POST'; body = data; prefer = 'return=representation'; return builder; },
    update: (data) => { method = 'PATCH'; body = data; prefer = 'return=representation'; return builder; },
    delete: () => { method = 'DELETE'; return builder; },
    then: (resolve) => {
      (async () => {
        try { const res = await restFetch(table + '?' + params.join('&'), { method, body, headers: prefer ? { Prefer: prefer } : undefined }); resolve({ data: res, error: null }); } 
        catch (err) { resolve({ data: null, error: { message: err.message } }); }
      })();
    }
  };
  return builder;
}

// ═══════════════════════════════
// Fake Supabase Client
// ═══════════════════════════════

const supabaseClient = {
  auth: {
    getSession: async () => {
      const auth = getStoredAuth();
      if (!auth?.access_token) return { data: { session: null }, error: null };
      return { data: { session: { access_token: auth.access_token, refresh_token: auth.refresh_token, user: auth.user, expires_at: auth.expires_at } }, error: null };
    },
    signInWithPassword: async ({ email, password }) => {
      try {
        const res = await fetch(SUPABASE_URL + '/auth/v1/token?grant_type=password', {
          method: 'POST', headers: { 'apikey': SUPABASE_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password })
        });
        const data = await res.json();
        if (!res.ok) return { data: { session: null }, error: { message: data.error_description || 'Login failed' } };
        setStoredAuth({ access_token: data.access_token, refresh_token: data.refresh_token, expires_at: Math.floor(Date.now() / 1000) + (data.expires_in || 3600), user: data.user });
        return { data: { session: { access_token: data.access_token, user: data.user } }, error: null };
      } catch (err) { return { data: { session: null }, error: { message: err.message } }; }
    },
    signUp: async ({ email, password }) => {
      try {
        const res = await fetch(SUPABASE_URL + '/auth/v1/signup', {
          method: 'POST', headers: { 'apikey': SUPABASE_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password })
        });
        const data = await res.json();
        if (!res.ok) return { data: null, error: { message: data.error_description || 'Signup failed' } };
        if (data.access_token) setStoredAuth({ access_token: data.access_token, refresh_token: data.refresh_token, expires_at: Math.floor(Date.now() / 1000) + (data.expires_in || 3600), user: data.user });
        return { data, error: null };
      } catch (err) { return { data: null, error: { message: err.message } }; }
    },
    signOut: async () => {
      const auth = getStoredAuth();
      if (auth?.access_token) {
        try { await fetch(SUPABASE_URL + '/auth/v1/logout', { method: 'POST', headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + auth.access_token } }); } catch (e) {}
      }
      clearStoredAuth(); return { error: null };
    },
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } })
  },
  from: (table) => createQueryBuilder(table),
  rpc: async (fnName, params) => {
    try { const data = await rpcFetch(fnName, params); return { data, error: null }; } 
    catch (err) { return { data: null, error: { message: err.message } }; }
  }
};

// ═══════════════════════════════
// Session helpers
// ═══════════════════════════════

let cachedSession = null;
let sessionInitialized = false;

async function initGlobalSession() {
  if (sessionInitialized) return cachedSession;
  try {
    const { data: { session } } = await supabaseClient.auth.getSession();
    cachedSession = session;
    sessionInitialized = true;
    return cachedSession;
  } catch (err) { sessionInitialized = true; return null; }
}

function getCachedSession() { return cachedSession; }
function getCachedUserId() { return cachedSession?.user?.id || null; }
function clearCachedSession() { cachedSession = null; sessionInitialized = false; }
function idsMatch(a, b) { return String(a) === String(b); }

// ═══════════════════════════════
// WHISPERS
// ═══════════════════════════════

async function getWhispers() {
  const myId = getCachedUserId();
  let followingIds = [], myLikes = [];
  if (myId) {
    try {
      const [f, l] = await Promise.all([
        supabaseClient.from("follows").select("following_id").eq("follower_id", myId),
        supabaseClient.from("likes").select("whisper_id").eq("user_id", myId)
      ]);
      followingIds = f.data?.map(x => x.following_id) || [];
      myLikes = l.data?.map(x => x.whisper_id) || [];
    } catch (err) {}
  }
  try {
    const { data, error } = await supabaseClient.from("whispers").select("*, profiles(username)").or("expires_at.is.null,expires_at.gt." + new Date().toISOString()).order("created_at", { ascending: false }).limit(50);
    if (error) throw new Error(error.message);
    return (data || []).map(w => ({ ...w, isFollowing: followingIds.some(id => idsMatch(id, w.user_id)), isLikedByMe: myLikes.some(id => idsMatch(id, w.id)) }));
  } catch (err) { return []; }
}

async function getMyWhispers(myId) {
  const id = myId || getCachedUserId();
  if (!id) return [];
  try {
    const { data: likes } = await supabaseClient.from("likes").select("whisper_id").eq("user_id", id);
    const myLikes = likes?.map(l => l.whisper_id) || [];
    const { data, error } = await supabaseClient.from("whispers").select("*, profiles(username)").eq("user_id", id).or("expires_at.is.null,expires_at.gt." + new Date().toISOString()).order("created_at", { ascending: false });
    if (error) return [];
    return (data || []).map(w => ({ ...w, isLikedByMe: myLikes.some(lid => idsMatch(lid, w.id)) }));
  } catch (err) { return []; }
}

async function getUserWhispers(userId) {
  if (!userId) return [];
  const myId = getCachedUserId();
  let myLikes = [];
  try {
    if (myId) { const { data: likes } = await supabaseClient.from("likes").select("whisper_id").eq("user_id", myId); myLikes = likes?.map(l => l.whisper_id) || []; }
    const { data, error } = await supabaseClient.from("whispers").select("*, profiles(username)").eq("user_id", userId).or("expires_at.is.null,expires_at.gt." + new Date().toISOString()).order("created_at", { ascending: false });
    if (error) return [];
    return (data || []).map(w => ({ ...w, isLikedByMe: myLikes.some(lid => idsMatch(lid, w.id)) }));
  } catch (err) { return []; }
}

async function createWhisper(content) {
  const myId = getCachedUserId();
  if (!myId) return { blocked: false, data: null };
  
  try {
    // 1. ننشر الهمسة (الـ Webhook رح يشتغل بالخلفية)
    const { data, error } = await supabaseClient.from("whispers").insert([{ content, user_id: myId }]).select("*");
    
    if (error) return { blocked: false, data: null };
    
    // 2. نستنى ثانية ونص عشان الـ Webhook (OpenAI) يخلص
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    // 3. نتأكد إذا الهمسة لسا موجودة
    const whisperId = data[0].id;
    const { data: checkData } = await supabaseClient
      .from("whispers")
      .select("id")
      .eq("id", whisperId)
      .maybeSingle();
      
    // 4. إذا اختفت، يعني OpenAI مسحتها
    if (!checkData) {
      return { blocked: true, reason: "harmful_content", data: null };
    }
    
    // 5. إذا لسا موجودة، يعني سليمة
    return { blocked: false, data };
    
  } catch (err) {
    console.error("createWhisper error:", err);
    return { blocked: false, data: null };
  }
}
async function deleteWhisper(id) {
  try { const { error } = await supabaseClient.from("whispers").delete().eq("id", id); return !error; } catch (err) { return false; }
}

const pendingLikes = new Set();

async function toggleLike(whisperId) {
  const myId = getCachedUserId();
  if (!myId) return { success: false };
  if (pendingLikes.has(whisperId)) return { success: false, pending: true };
  pendingLikes.add(whisperId);
  try {
    const { data, error } = await supabaseClient.rpc('toggle_like', { p_whisper_id: whisperId });
    if (error || !data || data.length === 0) { pendingLikes.delete(whisperId); return { success: false }; }
    const { data: whisper } = await supabaseClient.from('whispers').select('likes_count').eq('id', whisperId).single();
    pendingLikes.delete(whisperId);
    return { success: true, newCount: whisper?.likes_count || 0, newIsLiked: data[0].liked };
  } catch (err) { pendingLikes.delete(whisperId); return { success: false }; }
}

async function getComments(whisperId) {
  try { const { data, error } = await supabaseClient.from("comments").select("*, profiles(username)").eq("whisper_id", whisperId).order("created_at", { ascending: true }); return error ? [] : data; } catch (err) { return []; }
}

async function createComment(whisperId, content, parentId = null) {
  const myId = getCachedUserId();
  if (!myId) return null;
  try {
    const { data, error } = await supabaseClient.from("comments").insert([{ whisper_id: whisperId, user_id: myId, content, parent_id: parentId }]).select("*");
    if (error) return null;
    return data;
  } catch (err) { return null; }
}

async function isFollowing(userId) {
  const myId = getCachedUserId();
  if (!myId || !userId) return false;
  try { const { data } = await supabaseClient.from("follows").select("id").eq("follower_id", myId).eq("following_id", userId).maybeSingle(); return !!data; } catch (err) { return false; }
}

async function toggleFollow(userId) {
  const myId = getCachedUserId();
  if (!myId || !userId || myId === userId) return null;
  try {
    const existing = await isFollowing(userId);
    if (existing) { await supabaseClient.from("follows").delete().eq("follower_id", myId).eq("following_id", userId); return { action: "unfollowed" }; } 
    else { await supabaseClient.from("follows").insert([{ follower_id: myId, following_id: userId }]); return { action: "followed" }; }
  } catch (err) { return null; }
}

async function getFollowersCount(userId) {
  if (!userId) return 0;
  try { const { data } = await supabaseClient.from("follows").select("*").eq("following_id", userId); return data?.length || 0; } catch (err) { return 0; }
}

async function getFollowingCount(userId) {
  if (!userId) return 0;
  try { const { data } = await supabaseClient.from("follows").select("*").eq("follower_id", userId); return data?.length || 0; } catch (err) { return 0; }
}

// ═══════════════════════════════
// PROFILES & STATS
// ═══════════════════════════════

async function getUserProfile(userId) {
  if (!userId) return null;
  try { const { data } = await supabaseClient.from("profiles").select("id, username, created_at").eq("id", userId).maybeSingle(); return data; } catch (err) { return null; }
}

// 🔥 الدالة الجديدة اللي طلبتها عشان نتأكد من الاسم
async function getMyProfile(myId) {
  if (!myId) return null;
  try {
    const { data, error } = await supabaseClient.from('profiles').select('username').eq('id', myId).maybeSingle();
    if (error) return null;
    return data;
  } catch (err) { return null; }
}

async function getUserStats(userId) {
  if (!userId) return { whispers: 0, hearts: 0, followers: 0, following: 0 };
  try {
    const [whispersRes, followersCount, followingCount] = await Promise.all([
      supabaseClient.from("whispers").select("id").eq("user_id", userId),
      getFollowersCount(userId),
      getFollowingCount(userId)
    ]);
    const myWhisperIds = whispersRes.data?.map(w => w.id) || [];
    let heartsCount = 0;
    for (const wid of myWhisperIds) {
      const { data: likesOnWhisper } = await supabaseClient.from("likes").select("id").eq("whisper_id", wid);
      heartsCount += likesOnWhisper?.length || 0;
    }
    return { whispers: whispersRes.data?.length || 0, hearts: heartsCount, followers: followersCount, following: followingCount };
  } catch (err) { return { whispers: 0, hearts: 0, followers: 0, following: 0 }; }
}

async function getMyStats(myId) { return getUserStats(myId || getCachedUserId()); }

async function findMentions(text) {
  try {
    const matches = text.match(/@([A-Z]{3}_\d{3})/g);
    if (!matches) return [];
    const usernames = matches.map(m => m.substring(1));
    const { data } = await supabaseClient.from("profiles").select("id, username").in("username", usernames);
    return data || [];
  } catch (err) { return []; }
}

async function moderateContent(text) {
  try {
    const auth = getStoredAuth();
    if (!auth?.access_token) return { level: 1 };

    // استدعاء الـ Edge Function (اللي على السيرفر الجديد)
    const res = await fetch(SUPABASE_URL + '/functions/v1/smart-api', {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': 'Bearer ' + auth.access_token,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ text: text })
    });

    // إذا فشل الطلب (مثلاً الـ Function مش منشورة)، نتجاوز عشان ما نعطل التطبيق
    if (!res.ok) {
      console.warn('[moderateContent] Function returned:', res.status);
      return { level: 1 };
    }
    
    const data = await res.json();
    return data; // بترجع { level: 3 } إذا ممنوع، أو { level: 1 } إذا سليم
  } catch (e) {
    console.error('[moderateContent]', e);
    return { level: 1 };
  }
}
async function deleteMyAccount() {
  try {
    const auth = getStoredAuth();
    if (!auth?.access_token) return { success: false, error: 'Not authenticated' };
    const res = await fetch(SUPABASE_URL + '/rest/v1/rpc/delete_my_account', {
      method: 'POST', headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + auth.access_token, 'Content-Type': 'application/json' }, body: JSON.stringify({})
    });
    if (!res.ok) { const err = await res.json(); return { success: false, error: err.message || 'Delete failed' }; }
    clearStoredAuth(); if (typeof cachedSession !== 'undefined') cachedSession = null; if (typeof sessionInitialized !== 'undefined') sessionInitialized = false;
    return { success: true };
  } catch (err) { return { success: false, error: err.message }; }
}

// ═══════════════════════════════
// ROOMS
// ═══════════════════════════════

async function getRooms() {
  try { const { data } = await supabaseClient.from("rooms").select("*, room_members(user_id)").eq("is_active", true).order("created_at", { ascending: false }); return (data || []).map(room => ({ ...room, membersCount: room.room_members?.length || 0 })); } catch (err) { return []; }
}

async function getMyCurrentRoom() {
  const myId = getCachedUserId();
  if (!myId) return null;
  try { const { data } = await supabaseClient.from("room_members").select("room_id, rooms(name)").eq("user_id", myId).maybeSingle(); return data ? { id: data.room_id, name: data.rooms?.name } : null; } catch (err) { return null; }
}

async function createRoom(name) {
  const myId = getCachedUserId();
  if (!myId) return null;
  try {
    const current = await getMyCurrentRoom();
    if (current) return null;
    const { data } = await supabaseClient.from("rooms").insert([{ name, owner_id: myId, max_members: 5, is_active: true }]).select("*");
    return data ? data[0] : null;
  } catch (err) { return null; }
}

async function joinRoom(roomId) {
  const myId = getCachedUserId();
  if (!myId) return null;
  try {
    const { data: room } = await supabaseClient.from("rooms").select("max_members, room_members(user_id)").eq("id", roomId).maybeSingle();
    if (!room) return { error: "Room not found" };
    if ((room.room_members?.length || 0) >= room.max_members) return { error: "Room is full" };
    const { error } = await supabaseClient.from("room_members").insert([{ room_id: roomId, user_id: myId }]);
    return error ? { error: error.message } : { success: true };
  } catch (err) { return { error: "Connection error" }; }
}

async function leaveRoom(roomId) {
  const myId = getCachedUserId();
  if (!myId) return false;
  try {
    await supabaseClient.from("room_members").delete().eq("room_id", roomId).eq("user_id", myId);
    const { data: remaining } = await supabaseClient.from("room_members").select("id").eq("room_id", roomId);
    if (!remaining || remaining.length === 0) await supabaseClient.from("rooms").delete().eq("id", roomId);
    return true;
  } catch (err) { return false; }
}

async function getRoomMembers(roomId) {
  try { const { data } = await supabaseClient.from("room_members").select("user_id, profiles(username)").eq("room_id", roomId); return data || []; } catch (err) { return []; }
}

async function getRoomMessages(roomId) {
  try { const { data } = await supabaseClient.from("room_messages").select("*, profiles(username)").eq("room_id", roomId).order("created_at", { ascending: true }); return data || []; } catch (err) { return []; }
}

async function sendRoomMessage(roomId, content) {
  const myId = getCachedUserId();
  if (!myId) return null;
  try { const { data } = await supabaseClient.from("room_messages").insert([{ room_id: roomId, user_id: myId, content }]).select("*"); return data; } catch (err) { return null; }
}

async function amIMember(roomId) {
  const myId = getCachedUserId();
  if (!myId || !roomId) return false;
  try { const { data } = await supabaseClient.from("room_members").select("id").eq("room_id", roomId).eq("user_id", myId).maybeSingle(); return !!data; } catch (err) { return false; }
}

async function canCreateRoom(userId) {
  if (!userId) return { canCreate: false };
  try {
    const { data: member } = await supabaseClient.from("room_members").select("id").eq("user_id", userId).maybeSingle();
    if (member) return { canCreate: false, reason: "You are already in a room." };
    return { canCreate: true };
  } catch (err) { return { canCreate: false }; }
}
const HARD_BLOCK_WORDS = ["بنتحر", "منتحر", "انتحار", "أنتحر", "بقتلنفسي", "suicide", "killmyself", "kms", "kys"];
const SEXUAL_WORDS = ["sex", "nude", "nudes", "porn"];
const VIOLENCE_WORDS = ["بقتل", "رحأقتل", "رحاقتل", "اقتل", "أقتل"];

function containsHardBlock(text) {
  const lower = text.toLowerCase();
  const normalized = lower.replace(/[.\-_ـ\s\u200B\u200C\u200D]/g, "").replace(/[\u064B-\u0652]/g, "");
  const deLeet = normalized.replace(/0/g, "o").replace(/1/g, "i").replace(/3/g, "e").replace(/4/g, "a").replace(/5/g, "s").replace(/7/g, "t");
  const versions = [lower, normalized, deLeet];
  for (const v of versions) {
    for (const w of HARD_BLOCK_WORDS) if (v.includes(w)) return { blocked: true, reason: "self_harm" };
    for (const w of SEXUAL_WORDS) if (v.includes(w)) return { blocked: true, reason: "sexual" };
    for (const w of VIOLENCE_WORDS) if (v.includes(w)) return { blocked: true, reason: "violence" };
  }
  return { blocked: false };
}