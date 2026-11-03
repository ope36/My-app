// ═══════════════════════════════
// HUSH — Auth via fetch (bypass SDK)
// ═══════════════════════════════

function getStoredAuth() {
  const raw = localStorage.getItem('hush-auth');
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

function setStoredAuth(data) {
  if (!data) {
    localStorage.removeItem('hush-auth');
    return;
  }
  localStorage.setItem('hush-auth', JSON.stringify(data));
}

function clearStoredAuth() {
  localStorage.removeItem('hush-auth');
}

// 🔥 signIn — fetch مباشر
async function fetchSignIn(email, password) {
  try {
    const res = await fetch(SUPABASE_URL + '/auth/v1/token?grant_type=password', {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ email, password })
    });
    
    const data = await res.json();
    
    if (!res.ok) {
      return { success: false, error: data.error_description || data.message || 'Login failed' };
    }
    
    setStoredAuth({
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: Math.floor(Date.now() / 1000) + (data.expires_in || 3600),
      token_type: data.token_type,
      user: data.user
    });
    
    if (typeof cachedSession !== 'undefined') {
      cachedSession = data;
    }
    
    return { success: true, data };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// 🔥 signUp — fetch مباشر
async function fetchSignUp(email, password) {
  try {
    const res = await fetch(SUPABASE_URL + '/auth/v1/signup', {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ email, password })
    });
    
    const data = await res.json();
    
    if (!res.ok) {
      return { success: false, error: data.error_description || data.message || 'Signup failed' };
    }
    
    if (data.access_token) {
      setStoredAuth({
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        expires_at: Math.floor(Date.now() / 1000) + (data.expires_in || 3600),
        token_type: data.token_type,
        user: data.user
      });
      
      if (typeof cachedSession !== 'undefined') {
        cachedSession = data;
      }
    }
    
    return { success: true, data };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// 🔥 signOut — fetch مباشر
async function fetchSignOut() {
  try {
    const auth = getStoredAuth();
    if (auth?.access_token) {
      await fetch(SUPABASE_URL + '/auth/v1/logout', {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': 'Bearer ' + auth.access_token,
          'Content-Type': 'application/json'
        }
      }).catch(() => {});
    }
  } catch (e) {}
  
  clearStoredAuth();
  if (typeof cachedSession !== 'undefined') {
    cachedSession = null;
  }
  if (typeof sessionInitialized !== 'undefined') {
    sessionInitialized = false;
  }
  return true;
}

// 🔥 refresh — fetch مباشر
async function fetchRefresh() {
  try {
    const auth = getStoredAuth();
    if (!auth?.refresh_token) return false;
    
    const res = await fetch(SUPABASE_URL + '/auth/v1/token?grant_type=refresh_token', {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ refresh_token: auth.refresh_token })
    });
    
    const data = await res.json();
    
    if (!res.ok) {
      console.warn('[fetchRefresh] failed:', data.error_description || data.message);
      return false;
    }
    
    setStoredAuth({
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: Math.floor(Date.now() / 1000) + (data.expires_in || 3600),
      token_type: data.token_type,
      user: data.user || auth.user
    });
    
    if (typeof cachedSession !== 'undefined') {
      cachedSession = data;
    }
    
    return true;
  } catch (err) {
    console.error('[fetchRefresh]', err);
    return false;
  }
}

window.fetchSignIn = fetchSignIn;
window.fetchSignUp = fetchSignUp;
window.fetchSignOut = fetchSignOut;
window.fetchRefresh = fetchRefresh;
window.getStoredAuth = getStoredAuth;
window.setStoredAuth = setStoredAuth;
window.clearStoredAuth = clearStoredAuth;

console.log('✅ auth-fetch.js loaded');