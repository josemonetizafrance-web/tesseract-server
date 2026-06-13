// background.js - TESSERACT v24.0 (Backend Integrado)
// API URL: defined in dist/modules/config.js, loaded via service worker registration
var TESSERACT_API = 'https://tesseract-jblo.onrender.com';

chrome.runtime.onInstalled.addListener(() => {
  console.log('TESSERACT v24.0 installed');
});

chrome.runtime.onStartup.addListener(() => {
  checkAuthStatus();
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'LOGIN_SUCCESS') {
    console.log('[BG] Login:', message.email);
    sendResponse({ success: true });
  } else if (message.action === 'LOGOUT') {
    chrome.storage.local.clear();
    sendResponse({ success: true });
  } else if (message.action === 'CHECK_AUTH') {
    (async () => { sendResponse(await checkAuthStatus()); })();
    return true;
  } else if (message.action === 'GET_SUBSCRIPTION') {
    (async () => { sendResponse(await getSubscriptionInfo()); })();
    return true;
  } else if (message.action === 'CRIBS_REFRESH') {
    // Reenviar a todas las extension pages (dashboard)
    chrome.runtime.sendMessage({ action: 'CRIBS_REFRESH' }, function () { if (chrome.runtime.lastError) { /* no hay p�ginas abiertas */ } });
    sendResponse({ success: true });
  }
  return true;
});

async function checkAuthStatus() {
  try {
    const data = await chrome.storage.local.get(['tess_jwt', 'tess_refresh', 'user_email']);
    if (!data.tess_jwt) return { loggedIn: false };

    const res = await fetch(`${TESSERACT_API}/api/tess/auth/verify`, {
      headers: { 'Authorization': `Bearer ${data.tess_jwt}` }
    });

    if (!res.ok) {
      if (res.status === 401 && data.tess_refresh) {
        const refreshRes = await fetch(`${TESSERACT_API}/api/tess/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken: data.tess_refresh })
        });
        if (refreshRes.ok) {
          const refreshData = await refreshRes.json();
          await chrome.storage.local.set({ tess_jwt: refreshData.token, tess_refresh: refreshData.refreshToken });
          return checkAuthStatus();
        }
      }
      await chrome.storage.local.remove(['tess_jwt', 'tess_refresh']);
      return { loggedIn: false };
    }

    const authData = await res.json();

    // Verificar si el usuario est� aprobado
    if (authData.isApproved === false) {
      return { loggedIn: false, needsApproval: true };
    }

    return {
      loggedIn: true,
      status: authData.subscription?.status || 'expired',
      isPremium: authData.subscription?.isPremium || false,
      timeRemaining: authData.subscription?.timeRemaining || 0,
      isApproved: authData.isApproved !== false
    };
  } catch (e) {
    return { loggedIn: false, error: e.message };
  }
}

async function getSubscriptionInfo() {
  try {
    const data = await chrome.storage.local.get(['tess_jwt']);
    if (!data.tess_jwt) return { status: 'none', isPremium: false, timeRemaining: 0 };

    const res = await fetch(`${TESSERACT_API}/api/tess/auth/verify`, {
      headers: { 'Authorization': `Bearer ${data.tess_jwt}` }
    });

    if (!res.ok) return { status: 'none', isPremium: false, timeRemaining: 0 };

    const authData = await res.json();
    return {
      status: authData.subscription?.status || 'none',
      isPremium: authData.subscription?.isPremium || false,
      timeRemaining: authData.subscription?.timeRemaining || 0
    };
  } catch (e) {
    return { status: 'none', isPremium: false, timeRemaining: 0 };
  }
}

chrome.webNavigation?.onCompleted.addListener(async (details) => {
  if (details.frameId !== 0) return;
  const dashboardUrl = chrome.runtime.getURL('dist/pages/dashboard/dashboard.html');
  if (details.url.includes(dashboardUrl)) {
    const auth = await checkAuthStatus();
    if (!auth.loggedIn || auth.status === 'expired' || auth.needsApproval) {
      chrome.tabs.update(details.tabId, {
        url: chrome.runtime.getURL('dist/pages/login/login.html')
      });
    }
  }
});

