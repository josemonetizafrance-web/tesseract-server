// auth.js - TESSERACT v24.0 (Backend Integrado)
// NOTA: Este archivo se carga como script normal (no ES module)
// Las funciones se exponen globalmente para uso desde otros scripts

var TESSERACT_API = 'https://tesseract-jblo.onrender.com';
var _refreshLock = false;

function getToken() {
  return new Promise(function (resolve) {
    try {
      chrome.storage.local.get(['tess_jwt'], function (r) { resolve(r.tess_jwt || null); });
    } catch (e) { resolve(null); }
  });
}

function getRefreshToken() {
  return new Promise(function (resolve) {
    try {
      chrome.storage.local.get(['tess_refresh'], function (r) { resolve(r.tess_refresh || null); });
    } catch (e) { resolve(null); }
  });
}

async function refreshAccessToken() {
  if (_refreshLock) return null;
  _refreshLock = true;
  try {
    var refreshToken = await getRefreshToken();
    if (!refreshToken) return null;

    var res = await fetch(TESSERACT_API + '/api/tess/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: refreshToken })
    });

    if (!res.ok) {
      chrome.storage.local.remove(['tess_jwt', 'tess_refresh']);
      try { chrome.runtime.sendMessage({ action: 'SESSION_EXPIRED' }); } catch (e) {}
      return null;
    }

    var data = await res.json();
    await chrome.storage.local.set({ tess_jwt: data.token, tess_refresh: data.refreshToken });
    return data.token;
  } catch (e) {
    console.warn('[AUTH] refresh error:', e.message);
    return null;
  } finally {
    _refreshLock = false;
  }
}

async function apiFetch(path, options) {
  if (!options) options = {};
  var token = await getToken();
  var headers = { 'Content-Type': 'application/json' };
  if (options.headers) Object.assign(headers, options.headers);

  if (token) {
    headers['Authorization'] = 'Bearer ' + token;
  }

  var controller = new AbortController();
  var timeoutId = setTimeout(function () { controller.abort(); }, 15000);
  var res;
  try {
    res = await fetch(TESSERACT_API + path, { ...options, headers: headers, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }

  if (res.status === 401 && token) {
    var newToken = await refreshAccessToken();
    if (newToken) {
      headers['Authorization'] = 'Bearer ' + newToken;
      try {
        res = await fetch(TESSERACT_API + path, { ...options, headers: headers });
      } catch (e) {}
      if (res.ok) return res.json();
    }
    chrome.storage.local.remove(['tess_jwt', 'tess_refresh']);
    try { chrome.runtime.sendMessage({ action: 'SESSION_EXPIRED' }); } catch (e) {}
    return null;
  }

  if (!res.ok) {
    var body = await res.json().catch(function () { return {}; });
    throw new Error(body.error || ('Error ' + res.status));
  }

  return res.json();
}

async function getCurrentUser() {
  var data = await apiFetch('/api/tess/auth/verify');
  if (!data) return null;

  return {
    email: data.email,
    uid: data.email,
    token: await getToken(),
    isAdmin: data.isAdmin,
    isDeveloper: data.isDeveloper,
    subscriptionStatus: data.subscription?.status || 'expired',
    isPremium: data.subscription?.isPremium || false,
    timeRemaining: data.subscription?.timeRemaining || 0
  };
}

async function isLoggedIn() {
  var user = await getCurrentUser();
  return user !== null && user.subscriptionStatus !== 'expired';
}

async function isAdmin() {
  var user = await getCurrentUser();
  return user?.isAdmin || false;
}

async function getSubscriptionStatus() {
  var data = await apiFetch('/api/tess/auth/verify');
  if (!data) return { status: 'none', isPremium: false, timeRemaining: 0 };

  return {
    status: data.subscription?.status || 'none',
    isPremium: data.subscription?.isPremium || false,
    timeRemaining: data.subscription?.timeRemaining || 0,
    expiry: 0
  };
}

async function logout() {
  await chrome.storage.local.clear();
  try {
    chrome.runtime.sendMessage({ action: 'LOGOUT' });
  } catch (e) {}
  window.location.href = chrome.runtime.getURL('dist/pages/login/login.html');
}

function formatTimeRemaining(ms) {
  if (ms <= 0 || ms === Infinity) return ms === Infinity ? 'Ilimitado' : 'Expired';
  var days = Math.floor(ms / (24 * 60 * 60 * 1000));
  var hours = Math.floor((ms % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
  var minutes = Math.floor((ms % (60 * 60 * 1000)) / (60 * 1000));
  if (days > 0) return days + 'd ' + hours + 'h';
  if (hours > 0) return hours + 'h ' + minutes + 'm';
  return minutes + 'm';
}

async function syncMetrics(stats, collectedIds, action, count) {
  try {
    await apiFetch('/api/tess/metrics/sync', {
      method: 'POST',
      body: JSON.stringify({ stats: stats, collectedIds: collectedIds, action: action, count: count })
    });
  } catch (e) {
    console.warn('[AUTH] syncMetrics error:', e.message);
  }
}
