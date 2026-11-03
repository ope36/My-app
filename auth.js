// ==========================================
// HUSH — Auth & Profile Management (FINAL v15)
// ==========================================

const authSection = document.getElementById('auth');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const signInBtn = document.getElementById('signInBtn');
const signUpBtn = document.getElementById('signUpBtn');
const authMessage = document.getElementById('authMessage');

let authInitialized = false;
let uiReady = false;
let authBusy = false;
let booting = true;

// ═══════════════════════════════
// Core Auth Actions
// ═══════════════════════════════

async function signIn(email, password) {
  if (typeof fetchSignIn !== 'function') return { success: false, error: 'System error: auth-fetch.js not loaded' };
  const res = await fetchSignIn(email, password);
  if (!res.success) return { success: false, error: res.error };
  return { success: true, data: res.data };
}

async function signUp(email, password) {
  if (typeof fetchSignUp !== 'function') return { success: false, error: 'System error: auth-fetch.js not loaded' };
  const res = await fetchSignUp(email, password);
  if (!res.success) return { success: false, error: res.error };
  return { success: true, data: res.data };
}

async function signOut() {
  if (typeof fetchSignOut === 'function') await fetchSignOut();
  return true;
}

// ═══════════════════════════════
// UI Helpers
// ═══════════════════════════════

function showMessage(text, type = 'info') {
  if (authMessage) {
    authMessage.textContent = text;
    authMessage.className = 'auth-message ' + type;
  }
}

function generateUsername() {
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const numbers = '0123456789';
  let username = '';
  for (let i = 0; i < 3; i++) username += letters[Math.floor(Math.random() * letters.length)];
  username += '_';
  for (let i = 0; i < 3; i++) username += numbers[Math.floor(Math.random() * numbers.length)];
  return username;
}

function hideLoading() {
  const el = document.getElementById('loading');
  if (el) el.hidden = true;
}

function showAuthScreen() {
  if (authSection) authSection.hidden = false;
  ['feed', 'write', 'profile', 'userProfile', 'rooms', 'roomChat', 'nav'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.hidden = true;
  });
  const fab = document.getElementById('fabWrite');
  if (fab) fab.hidden = true;
}

function showAppScreen() {
  if (authSection) authSection.hidden = true;
  const nav = document.getElementById('nav');
  if (nav) nav.hidden = false;
}

// ═══════════════════════════════
// UI Init
// ═══════════════════════════════

async function runAppInit() {
  if (uiReady) return;
  uiReady = true;

  showAppScreen();

  if (typeof handleRoute === 'function') {
    try { await handleRoute(); } catch (err) { console.error('[runAppInit] handleRoute:', err); }
  }
  if (typeof loadProfile === 'function') {
    try { loadProfile(); } catch (err) { console.error(err); }
  }
  if (typeof updateBlueDot === 'function') {
    try { updateBlueDot(); } catch (err) { console.error(err); }
  }
}

// ═══════════════════════════════
// Profile (FIXED - الاسم يثبت)
// ═══════════════════════════════

async function loadProfile() {
  const myId = getCachedUserId();
  if (!myId) return;

  const el = document.getElementById('profileUsername');
  if (!el) return;

  let username = null;
  let createdAt = null;

  // 1. أول شي، نجرب نجيب الاسم من الداتا بيز (المصدر الموثوق)
  const { data, error } = await supabaseClient
    .from('profiles')
    .select('username, created_at')
    .eq('id', myId)
    .maybeSingle();

  if (data && data.username) {
    username = data.username;
    createdAt = data.created_at;
  }

  // 2. إذا ما لقينا اسم بالداتا بيز (يعني حساب جديد)، منعمل اسم ومنحفظو
  if (!username) {
    username = generateUsername();
    const { error: insertErr } = await supabaseClient
      .from('profiles')
      .insert([{ id: myId, username }]);

    if (insertErr) {
      // إذا صار خطأ (يعني مستخدم تاني عمل نفس الحساب بنفس اللحظة)، منقرأ الاسم الموجود
      const { data: retry } = await supabaseClient
        .from('profiles')
        .select('username, created_at')
        .eq('id', myId)
        .maybeSingle();
      if (retry && retry.username) {
        username = retry.username;
        createdAt = retry.created_at;
      }
    } else {
      createdAt = new Date().toISOString();
    }
  }

  // 3. نحفظ الاسم في المتصفح (كاش) عشان ما يتغير كل ما نعمل تحديث
  if (username) {
    localStorage.setItem('hush_username_' + myId, username);
  }

  // 4. نعرض الاسم
  el.textContent = username || 'Anonymous';

  const joinedEl = document.getElementById('profileJoined');
  if (joinedEl && createdAt) {
    const date = new Date(createdAt);
    joinedEl.textContent = 'Joined ' + date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  }

  const avatarEl = document.querySelector('#profile .profile-avatar');
  if (avatarEl && typeof getAvatarData === 'function') {
    const avatar = getAvatarData(myId, username || 'Anonymous');
    avatarEl.style.background = avatar.color;
    avatarEl.textContent = avatar.letter;
  }

  // 5. نكمل تحميل الإحصائيات والهمسات
  loadStats(myId);
  loadMyWhispers(myId);
}

async function loadStats(myId) {
  try {
    const stats = await getMyStats(myId);
    const statWhispers = document.getElementById('statWhispers');
    const statHearts = document.getElementById('statHearts');
    const statFollowers = document.getElementById('statFollowers');
    const statFollowing = document.getElementById('statFollowing');
    if (statWhispers) statWhispers.textContent = stats.whispers;
    if (statHearts) statHearts.textContent = stats.hearts;
    if (statFollowers) statFollowers.textContent = stats.followers;
    if (statFollowing) statFollowing.textContent = stats.following;
  } catch (err) {
    console.error('[loadStats]', err);
  }
}

async function loadMyWhispers(myId) {
  try {
    const myWhispers = await getMyWhispers(myId);
    const container = document.getElementById('myWhispers');
    if (!container) return;

    container.innerHTML = '';
    if (myWhispers.length === 0) {
      container.innerHTML = '<p class="empty-feed">No whispers yet.</p>';
      return;
    }

    if (typeof createWhisperElement !== 'function' || typeof attachWhisperListeners !== 'function') return;

    myWhispers.forEach(w => {
      const article = createWhisperElement(w, myId);
      container.appendChild(article);
      attachWhisperListeners(article, w);
    });
  } catch (err) {
    console.error('[loadMyWhispers]', err);
  }
}

// ═══════════════════════════════
// Auth UI Events (FIXED - حماية من التحميل)
// ═══════════════════════════════

if (signInBtn) {
  signInBtn.addEventListener('click', async () => {
    if (authBusy) return;
    if (typeof fetchSignIn !== 'function') { showMessage('Please wait, app is loading...', 'error'); return; }
    
    const email = emailInput.value.trim();
    const password = passwordInput.value;
    if (!email || !password) { showMessage('Please fill all fields', 'error'); return; }

    authBusy = true;
    signInBtn.disabled = true;
    signUpBtn.disabled = true;
    showMessage('Loading...');

    const res = await signIn(email, password);

    if (res.success) {
      showMessage('Welcome back!', 'success');
      uiReady = false;
      await runAppInit();
    } else {
      showMessage(res.error, 'error');
    }

    authBusy = false;
    signInBtn.disabled = false;
    signUpBtn.disabled = false;
  });
}

if (signUpBtn) {
  signUpBtn.addEventListener('click', async () => {
    if (authBusy) return;
    if (typeof fetchSignUp !== 'function') { showMessage('Please wait, app is loading...', 'error'); return; }

    const email = emailInput.value.trim();
    const password = passwordInput.value;
    if (!email || !password) { showMessage('Please fill all fields', 'error'); return; }
    if (password.length < 8) { showMessage('Password must be 8+ characters', 'error'); return; }

    authBusy = true;
    signInBtn.disabled = true;
    signUpBtn.disabled = true;
    showMessage('Creating account...');

    const res = await signUp(email, password);

    if (res.success) {
      showMessage('Account created!', 'success');
      uiReady = false;
      await runAppInit();
    } else {
      showMessage(res.error, 'error');
    }

    authBusy = false;
    signInBtn.disabled = false;
    signUpBtn.disabled = false;
  });
}
// ═══════════════════════════════
// Sign Out (FIXED)
// ═══════════════════════════════

const signOutBtn = document.getElementById('signOutBtn');
const signOutModal = document.getElementById('signOutModal');
const cancelSignOut = document.getElementById('cancelSignOut');
const confirmSignOut = document.getElementById('confirmSignOut');

if (signOutBtn) signOutBtn.addEventListener('click', () => { if (signOutModal) signOutModal.hidden = false; });
if (cancelSignOut) cancelSignOut.addEventListener('click', () => { if (signOutModal) signOutModal.hidden = true; });

if (confirmSignOut) {
  confirmSignOut.addEventListener('click', async () => {
    confirmSignOut.disabled = true;
    
    // 1. نسجل خروج من السيرفر
    try { await signOut(); } catch (e) {}
    
    // 2. نمسح الجلسة من الذاكرة والمتصفح
    if (typeof clearCachedSession === 'function') clearCachedSession();
    localStorage.removeItem('hush-auth'); // مسح التوكن الفعلي
    sessionStorage.clear();
    
    // 3. نصفر المتغيرات
    uiReady = false;
    authInitialized = false;
    booting = true;
    
    // 4. نعمل Reload
    location.hash = '';
    location.reload();
  });
}

// ═══════════════════════════════
// Delete Account
// ═══════════════════════════════

const deleteAccountBtn = document.getElementById('deleteAccountBtn');
const deleteAccountModal = document.getElementById('deleteAccountModal');
const deleteConfirmInput = document.getElementById('deleteConfirmInput');
const deleteErrorMsg = document.getElementById('deleteErrorMsg');
const cancelDeleteAccount = document.getElementById('cancelDeleteAccount');
const confirmDeleteAccount = document.getElementById('confirmDeleteAccount');

if (deleteAccountBtn) {
  deleteAccountBtn.addEventListener('click', () => {
    if (deleteConfirmInput) deleteConfirmInput.value = '';
    if (deleteErrorMsg) deleteErrorMsg.textContent = '';
    if (deleteAccountModal) deleteAccountModal.hidden = false;
    if (deleteConfirmInput) deleteConfirmInput.focus();
  });
}

if (cancelDeleteAccount) {
  cancelDeleteAccount.addEventListener('click', () => {
    if (deleteAccountModal) deleteAccountModal.hidden = true;
  });
}

if (confirmDeleteAccount) {
  confirmDeleteAccount.addEventListener('click', async () => {
    const typed = (deleteConfirmInput?.value || '').trim().toUpperCase();
    if (typed !== 'DELETE') {
      if (deleteErrorMsg) deleteErrorMsg.textContent = '❌ Type DELETE exactly to confirm';
      return;
    }
    confirmDeleteAccount.disabled = true;
    confirmDeleteAccount.textContent = 'Deleting...';
    
    const res = await deleteMyAccount();
    
    if (res.success) {
      if (deleteAccountModal) deleteAccountModal.hidden = true;
      if (typeof clearCachedSession === 'function') clearCachedSession();
      localStorage.clear();
      location.reload();
    } else {
      confirmDeleteAccount.disabled = false;
      confirmDeleteAccount.textContent = 'Delete';
      if (deleteErrorMsg) deleteErrorMsg.textContent = '❌ Delete failed: ' + res.error;
    }
  });
}

// ═══════════════════════════════
// Boot (FIXED - بيستنى الملفات تحمل)
// ═══════════════════════════════

async function initAuth() {
  try {
    // 🔥 نستنى لحد ما supabase.js يحمل بالكامل
    let waitCount = 0;
    while (typeof initGlobalSession !== 'function' && waitCount < 50) {
      await new Promise(r => setTimeout(r, 100));
      waitCount++;
    }

    if (typeof initGlobalSession !== 'function') {
      throw new Error("supabase.js did not load in time. Please refresh.");
    }

    const session = await initGlobalSession();
    hideLoading();
    authInitialized = true;

    if (session) {
      await runAppInit();
    } else {
      showAuthScreen();
    }
  } catch (err) {
    console.error('Auth init error:', err);
    hideLoading();
    showAuthScreen();
  } finally {
    booting = false;
  }
}

initAuth();