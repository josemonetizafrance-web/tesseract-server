// login.js - TESSERACT v24.0 (Login System)
var TESSERACT_API = 'https://tesseract-jblo.onrender.com';

const loginEmail = document.getElementById('login-email');
const loginPass = document.getElementById('login-password');
const btnDoLogin = document.getElementById('btn-do-login');
const loginForm = document.getElementById('login-form');
const errorMsg = document.getElementById('error-msg');
const successMsg = document.getElementById('success-msg');

function initBouncingLogo() {
  const src = document.getElementById('bouncing-logo');
  if (!src) return;
  const logos = [];
  const MAX_LOGOS = 20;

  function createLogo(x, y, vx, vy) {
    if (logos.length >= MAX_LOGOS) return;
    const img = document.createElement('img');
    img.src = src.src;
    img.className = 'bouncing-logo-instance';
    img.style.cssText = 'position:fixed;z-index:0;pointer-events:none;width:120px;height:auto;opacity:0.08;will-change:left,top;';
    document.body.appendChild(img);
    const h = img.naturalHeight * (120 / img.naturalWidth) || 120;
    logos.push({ el: img, x, y, vx, vy, w: 120, h });
  }

  src.onload = function () {
    const startH = src.naturalHeight * (120 / src.naturalWidth) || 120;
    let x = Math.random() * (window.innerWidth - 120);
    let y = Math.random() * (window.innerHeight - startH);
    let vx = (0.6 + Math.random()) * (Math.random() > 0.5 ? 1 : -1);
    let vy = (0.6 + Math.random()) * (Math.random() > 0.5 ? 1 : -1);
    src.style.display = 'none';
    logos.push({ el: src, x, y, vx, vy, w: 120, h: startH });

    function bounce() {
      const W = window.innerWidth;
      const H = window.innerHeight;
      for (let i = logos.length - 1; i >= 0; i--) {
        const L = logos[i];
        L.x += L.vx; L.y += L.vy;
        let bounced = false;
        if (L.x <= 0) { L.x = 0; L.vx = -L.vx; bounced = true; }
        if (L.x + L.w >= W) { L.x = W - L.w; L.vx = -L.vx; bounced = true; }
        if (L.y <= 0) { L.y = 0; L.vy = -L.vy; bounced = true; }
        if (L.y + L.h >= H) { L.y = H - L.h; L.vy = -L.vy; bounced = true; }
        if (bounced && logos.length < MAX_LOGOS) {
          createLogo(Math.random() * (W - 120), Math.random() * (H - 120),
            (0.6 + Math.random()) * (Math.random() > 0.5 ? 1 : -1),
            (0.6 + Math.random()) * (Math.random() > 0.5 ? 1 : -1));
        }
        L.el.style.left = L.x + 'px';
        L.el.style.top = L.y + 'px';
      }
      requestAnimationFrame(bounce);
    }
    bounce();
  };
  if (src.complete) src.onload();
}

function showLoginVersion() {
  try {
    const manifest = chrome.runtime?.getManifest();
    const el = document.getElementById('login-version');
    if (el) el.textContent = 'v' + (manifest?.version || '24.0');
  } catch (e) {}
}

function showError(msg) {
  errorMsg.innerText = "⚠️ " + msg;
  errorMsg.style.display = 'block';
  successMsg.style.display = 'none';
  setTimeout(() => { errorMsg.style.display = 'none'; }, 8000);
}

function showSuccess(msg) {
  successMsg.innerText = msg;
  successMsg.style.display = 'block';
  errorMsg.style.display = 'none';
}

function clearFeedback() {
  errorMsg.style.display = 'none';
  successMsg.style.display = 'none';
}

async function doLogin() {
  const email = loginEmail.value.trim().toLowerCase();
  const pass = loginPass.value.trim();
  clearFeedback();

  if (!email) return showError('Ingresa un correo electrónico.');
  if (!pass) return showError('Ingresa una contraseña.');
  if (pass.length < 6) return showError('Mínimo 6 caracteres.');
  if (!pass.endsWith('*+')) return showError('Debe terminar en *+.');

  btnDoLogin.innerText = 'VERIFICANDO...';
  btnDoLogin.disabled = true;

  try {
    const res = await fetch(`${TESSERACT_API}/api/tess/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: pass })
    });

    const data = await res.json();

    if (!res.ok) {
      btnDoLogin.innerText = 'INICIAR SESIÓN';
      btnDoLogin.disabled = false;
      return showError(data.error || 'Error al iniciar sesión.');
    }

    if (data.token) {
      var items = {
        tess_jwt: data.token,
        tess_refresh: data.refreshToken || '',
        tess_auth: true,
        tess_user: data.user.email,
        user_email: data.user.email,
        isAdmin: data.user.isAdmin,
        isDeveloper: data.user.isDeveloper,
        isOfficeAdmin: data.user.isOfficeAdmin,
        user_office: data.user.office || null,
        isApproved: data.user.isApproved,
        subscriptionStatus: data.user.role
      };
      await chrome.storage.local.set(items);
      
      try { chrome.runtime.sendMessage({ action: 'LOGIN_SUCCESS', email: data.user.email }); } catch (e) {}
      
      window.location.href = chrome.runtime.getURL('dist/pages/dashboard/dashboard.html');
    }
  } catch (error) {
    btnDoLogin.innerText = 'INICIAR SESIÓN';
    btnDoLogin.disabled = false;
    showError('Error de conexión: ' + error.message);
  }
}

if (loginForm) loginForm.addEventListener('submit', (e) => { e.preventDefault(); doLogin(); });
loginEmail?.addEventListener('keypress', (e) => { if (e.key === 'Enter') doLogin(); });
loginPass?.addEventListener('keypress', (e) => { if (e.key === 'Enter') doLogin(); });

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => { initBouncingLogo(); showLoginVersion(); });
} else {
  initBouncingLogo();
  showLoginVersion();
}

(async () => {
  try {
    const stored = await chrome.storage.local.get(['tess_jwt', 'user_email']);
    if (stored.tess_jwt && stored.user_email) {
      const res = await fetch(`${TESSERACT_API}/api/tess/auth/verify`, {
        headers: { 'Authorization': `Bearer ${stored.tess_jwt}` }
      });
      if (res.ok) {
        const data = await res.json();
        if (data.valid) {
          window.location.href = chrome.runtime.getURL('dist/pages/dashboard/dashboard.html');
        }
      }
    }
  } catch (e) {}
})();
