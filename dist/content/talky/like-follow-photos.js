// TESSERACT v24 - L+F+P (Like + Follow + Photos) Module
// Simplified approach: history.back() always, no queue forward, robust photo likes

// Exports to both local scope (shared content script world) and window (page)
var executeLFP, lfpTogglePause, lfpActive = false;
var lfpPaused = false;
var lfpStats = { likes: 0, follows: 0, photoLikes: 0, processed: 0 };
var lfpVisited = [];
var lfpBlacklist = [];
var lfpBlacklistLoaded = false;
var lfpBlacklistLoadPromise = null;
var lfpSearchUrl = '';

async function lfpLoadBlacklist() {
  if (lfpBlacklistLoadPromise) return lfpBlacklistLoadPromise;
  lfpBlacklistLoadPromise = (async () => {
    for (var attempt = 0; attempt <= 2; attempt++) {
      try {
        var stored = await chrome.storage.local.get(['tess_jwt']);
        if (!stored.tess_jwt) { lfpBlacklistLoadPromise = null; return; }
        var res = await fetch(`${TESSERACT_API}/api/tess/blacklist`, {
          headers: { 'Authorization': 'Bearer ' + stored.tess_jwt }
        });
        if (!res.ok && attempt < 2) { await lfpSleep(1000); continue; }
        if (res.ok) {
          var data = await res.json();
          lfpBlacklist = (data.blacklist || []).map(String);
          lfpBlacklistLoaded = true;
        }
        break;
      } catch (e) {
        if (attempt >= 2) break;
        await lfpSleep(1000);
      }
    }
    lfpBlacklistLoadPromise = null;
  })();
  return lfpBlacklistLoadPromise;
}

function lfpIsBlacklisted(id) {
  return id && lfpBlacklist.indexOf(String(id)) !== -1;
}

async function reloadLFPBlacklist() {
  lfpBlacklist = []; lfpBlacklistLoaded = false; lfpBlacklistLoadPromise = null;
  await lfpLoadBlacklist();
}

function lfpSleep(ms) {
  if (!lfpActive) return Promise.resolve();
  if (document.hidden) return Promise.resolve();
  var start = Date.now();
  return new Promise(function (r) {
    var step = 100;
    var t = setInterval(function () {
      if (!lfpActive || Date.now() - start >= ms) { clearInterval(t); r(); }
    }, step);
  });
}

function lfpToast(msg, type) {
  if (typeof showInPageToast === 'function') { showInPageToast(msg, type); return; }
  var el = document.getElementById('tess-toast');
  if (!el) { el = document.createElement('div'); el.id = 'tess-toast';
    el.style.cssText = 'position:fixed;bottom:80px;right:20px;z-index:99999;padding:10px 18px;border-radius:8px;font-family:Orbitron,sans-serif;font-size:12px;font-weight:700;letter-spacing:1px;color:#fff;box-shadow:0 4px 20px rgba(0,0,0,0.5);border:1px solid rgba(255,255,255,0.1);transition:opacity 0.3s;';
    document.body.appendChild(el);
  }
  el.style.background = type === 'error' ? 'linear-gradient(135deg,#ef4444,#b91c1c)' : type === 'success' ? 'linear-gradient(135deg,#10b981,#059669)' : 'linear-gradient(135deg,#3b82f6,#2563eb)';
  el.textContent = msg; el.style.opacity = '1';
  if (window.__tt) clearTimeout(window.__tt);
  window.__tt = setTimeout(function () { el.style.opacity = '0'; }, 2500);
}

function lfpIsBlocked() {
  var p = [/blocked you/i, /has blocked you/i, /can't view their profile/i, /te ha bloqueado/i, /no puedes ver su perfil/i, /has blocked/i, /user has blocked/i];
  function tm(el) { return el && el.textContent && p.some(function (x) { return x.test(el.textContent); }); }
  if (tm(document.body)) return true;
  try { var w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false); var n; while ((n = w.nextNode())) { if (n.textContent && p.some(function (x) { return x.test(n.textContent); })) return true; } } catch (e) {}
  return false;
}

function lfpPhotoViewerOpen() {
  return !!(document.querySelector(TALK_Y.PHOTO_VIEWER));
}

function lfpFindNextPage() {
  var cp = parseInt(localStorage.getItem('tessSearchPage') || '1');
  var np = cp + 1;
  if (np > 25) return null;
  var btn = document.querySelector('[data-test-id="cmp:ui-button click:change-page-n ' + np + '"]');
  if (btn) return btn;
  btn = document.querySelector('button:has(svg[data-icon="chevron-right"]), button:has(svg[id="ArrowRight"])');
  if (btn) return btn;
  btn = Array.from(document.querySelectorAll('a, button')).find(function (el) { var t = el.textContent && el.textContent.trim(); return t === 'Next' || t === 'Siguiente'; });
  if (btn) return btn;
  // Fallback: buscar cualquier botón de paginación numérica o el botón "Next"
  var allBtns = document.querySelectorAll(TALK_Y.NEXT_PAGE_BTNS);
  for (var i = 0; i < allBtns.length; i++) {
    var match = allBtns[i].getAttribute('data-test-id').match(/change-page-n\s+(\d+)/);
    if (match && parseInt(match[1]) === np) return allBtns[i];
    if (allBtns[i].getAttribute('data-test-id').indexOf('next') !== -1) return allBtns[i];
  }
  return null;
}

// Navigate back to search preserving filters
// Visible tab: history.back() (fast SPA nav)
// Hidden tab: direct navigation (page reload via lfpSearchUrl)
async function lfpGoBack() {
  if (window.location.href.includes('/search')) { console.log('[LFP] back: already on search'); return; }
  // If tab is hidden, skip history.back() and use direct navigation
  if (document.hidden) {
    console.log('[LFP] back: hidden, direct nav to', lfpSearchUrl);
    try {
      localStorage.setItem('lfpSweepActive', '1');
      localStorage.setItem('lfpVisited', JSON.stringify(lfpVisited));
      localStorage.setItem('lfpStats', JSON.stringify(lfpStats));
      localStorage.setItem('lfpPage', localStorage.getItem('tessSearchPage') || '1');
    } catch (e) {}
    window.location.href = lfpSearchUrl || '/search/all';
    return;
  }
  try { window.history.back(); } catch (e) {}
  for (var w = 0; w < 100 && lfpActive; w++) {
    if (document.querySelectorAll(TALK_Y.PERSON_CARD).length > 0) return;
    await lfpSleep(100);
  }
  // Fallback: save state then navigate directly
  try {
    localStorage.setItem('lfpSweepActive', '1');
    localStorage.setItem('lfpVisited', JSON.stringify(lfpVisited));
    localStorage.setItem('lfpStats', JSON.stringify(lfpStats));
    localStorage.setItem('lfpPage', localStorage.getItem('tessSearchPage') || '1');
  } catch (e) {}
  window.location.href = lfpSearchUrl || '/search/all';
}

// ============ PHOTO LIKES ============
async function lfpDoPhotos() {
  if (!lfpActive) return;
  if (document.hidden) return;
  var lfpProfileId = (window.location.href.match(/(\d{6,15})(?:[/?#]|$)/) || [])[1];
  if (lfpProfileId && lfpIsBlacklisted(lfpProfileId)) return;
  await lfpSleep(200);
  var fp = document.querySelector(TALK_Y.PHOTO_IMAGE);
  if (!fp) return;
  try { (fp.tagName === 'A' ? fp : (fp.closest('a') || fp)).click(); } catch (e) { try { fp.click(); } catch (e2) {} }
  await lfpSleep(1200);
  if (!lfpPhotoViewerOpen()) return;

  var limit = Date.now() + 8000;
  var idx = 0;
  while (idx < 5 && lfpActive && Date.now() < limit) {
    var btn = document.querySelector('button.gallery-footer__like_narrow') || document.querySelector('button[data-test-id*="set-like"]') || document.querySelector('button:has(svg[id="ThumbUp"])') || document.querySelector(TALK_Y.LIKE_BTN) || document.querySelector('.gallery-footer button:not([aria-label*="Next"]):not([aria-label*="next"]):not([aria-label*="Close"]):not([aria-label*="close"])') || (function() { var s = document.querySelector('svg[id="ThumbUp"]'); return s ? s.closest('button') : null; })() || (function() { var s = document.querySelector('svg[id="Heart"]'); return s ? s.closest('button') : null; })() || (function() { return Array.from(document.querySelectorAll('button, [role="button"]')).find(function(b) { return /\bLike\b/i.test(b.textContent) && !/\bNext\b/i.test(b.textContent) && !/\bClose\b/i.test(b.textContent); }); })();
    if (btn && btn.getAttribute('aria-pressed') !== 'true' && !btn.matches('[data-type="filled"],[data-type="solid"]')) {
      try { btn.click(); lfpStats.photoLikes++; } catch (e) {}
      await lfpSleep(200);
    }
    await lfpSleep(400);
    if (!lfpPhotoViewerOpen()) break;
    var nx = document.querySelector(TALK_Y.NEXT_PHOTO_BTN);
    if (nx && !nx.disabled) { try { nx.click(); await lfpSleep(600); idx++; } catch (e) { break; } } else break;
  }
  var cl = document.querySelector(TALK_Y.CLOSE_BTN);
  if (cl) { try { cl.click(); } catch (e) { try { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true })); } catch (e2) {} } }
  else { try { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true })); } catch (e) {} }
  await lfpSleep(500);
}

// ============ PROCESS PROFILE ============
async function lfpProcessOne() {
  if (!lfpActive) return;
  await lfpSleep(400);

  for (var a = 0; a < 30 && lfpActive; a++) {
    if (lfpIsBlocked()) {
      lfpToast('\u23ED\uFE0F Bloqueado', 'info');
      return;
    }
    if (document.querySelectorAll(TALK_Y.LIKE_FOLLOW_BTN).length > 0) break;
    var bt = Array.from(document.querySelectorAll('button, a[role="button"]')).find(function (el) { var t = (el.textContent || '') + (el.getAttribute('aria-label') || ''); return /like|follow|wink/i.test(t); });
    if (bt) break;
    await lfpSleep(150);
  }
  if (!lfpActive) return;
  lfpStats.processed++;
  if (typeof updateStats === 'function') updateStats();

  // Like
  var lb = document.querySelector('button[data-test-id*="on-like"]');
  if (lb) {
    var svg = lb.querySelector('svg');
    if ((svg && svg.id === 'HeartOutline') || lb.getAttribute('data-selected') === 'false') {
      try { lb.scrollIntoView({ block: 'center' }); await lfpSleep(80); lb.click(); lfpStats.likes++; if (typeof botStats !== 'undefined') { botStats.likesGiven++; botStats.contactsProcessed++; } } catch (e) {}
      if (typeof updateStats === 'function') updateStats();
      await lfpSleep(120);
    }
  }
  if (!lfpActive) return;

  // Follow
  var fb = document.querySelector(TALK_Y.FOLLOW_BTN);
  if (fb) {
    var ft = (fb.textContent || '').toLowerCase() + (fb.getAttribute('aria-label') || '').toLowerCase();
    if (!/\b(following|siguiendo|unfollow)\b/.test(ft) && !fb.querySelector('svg[id*="Check"]')) {
      try { fb.scrollIntoView({ block: 'center' }); await lfpSleep(80); fb.click(); lfpStats.follows++; if (typeof botStats !== 'undefined') botStats.followsGiven++; } catch (e) {}
      await lfpSleep(120);
    }
  }
  if (!lfpActive) return;

  // Photos (with timeout)
  var hasPhoto = document.querySelector('[data-test-id*="photo-view"]') || document.querySelector('.profile-photo-wrap img');
  if (hasPhoto && lfpActive) {
    try { await Promise.race([lfpDoPhotos(), new Promise(function (r) { setTimeout(r, 12000); })]); } catch (e) {}
  } else { await lfpSleep(100); }
  if (!lfpActive) return;

  if (typeof updateStats === 'function') updateStats();
}

// ============ MAIN SWEEP ============
executeLFP = window.executeLFP = async function () {
  if (lfpActive) {
    lfpActive = false; lfpPaused = false;
    // Clear saved sweep state on toggle-off
    try { localStorage.removeItem('lfpSweepActive'); localStorage.removeItem('lfpVisited'); localStorage.removeItem('lfpStats'); localStorage.removeItem('lfpPage'); } catch (e) {}
    if (typeof updateStats === 'function') updateStats();
    lfpUpdateUI();
    if (typeof saveAllStates === 'function') saveAllStates();
    return;
  }

  if (typeof likesActive !== 'undefined') { likesActive = Tesseract.set('likesActive', false); followsActive = Tesseract.set('followsActive', false); likeFollowActive = Tesseract.set('likeFollowActive', false); }

  lfpActive = true; lfpPaused = false;
  lfpStats.likes = 0; lfpStats.follows = 0; lfpStats.photoLikes = 0; lfpStats.processed = 0;
  lfpVisited = []; window.lfpStats = lfpStats;
  lfpUpdateUI();
  if (typeof saveAllStates === 'function') saveAllStates();

  await lfpLoadBlacklist();

  try { var m = window.location.href.match(/[?&]page=(\d+)/); localStorage.setItem('tessSearchPage', m ? m[1] : '1'); if (window.location.href.includes('/search')) { lfpSearchUrl = window.location.href; localStorage.setItem('lfpSearchUrl', lfpSearchUrl); } } catch (e) {}
  if (window.location.href.includes('/mails/')) { lfpToast('\u26A0\uFE0F Est\u00E1s en Mail. Usa Search.', 'error'); lfpActive = false; lfpUpdateUI(); return; }

  // Restore sweep state after hard reload
  var resumed = false;
  try {
    if (localStorage.getItem('lfpSweepActive') === '1') {
      var savedVisited = JSON.parse(localStorage.getItem('lfpVisited') || '[]');
      var savedStats = JSON.parse(localStorage.getItem('lfpStats') || '{}');
      if (Array.isArray(savedVisited) && savedVisited.length > 0) {
        lfpVisited = savedVisited;
        if (savedStats.likes != null) { lfpStats.likes = savedStats.likes; lfpStats.follows = savedStats.follows; lfpStats.photoLikes = savedStats.photoLikes; lfpStats.processed = savedStats.processed; }
        var savedPage = localStorage.getItem('lfpPage');
        if (savedPage) localStorage.setItem('tessSearchPage', savedPage);
        resumed = true;
        lfpSearchUrl = localStorage.getItem('lfpSearchUrl') || '';
        lfpToast('\uD83D\uDD04 Reanudando L+F+P (' + lfpStats.processed + ' procesados)...', 'success');
      }
      localStorage.removeItem('lfpSweepActive');
    }
  } catch (e) {}

  // If on a profile page (from reload in background), process it first
  if (!window.location.href.includes('/search')) {
    var recId = (window.location.href.match(/\/(\d{6,15})(?:[/?#]|$)/) || [])[1];
    // Wait for like/follow buttons up to 15s (SPA may be loading in background)
    var isP = document.querySelectorAll(TALK_Y.LIKE_FOLLOW_BTN).length > 0;
    if (!isP && recId) {
      var btnWaitStart = Date.now();
      while (!isP && (Date.now() - btnWaitStart) < 15000 && lfpActive) {
        await new Promise(function(r) { setTimeout(r, 500); });
        isP = document.querySelectorAll(TALK_Y.LIKE_FOLLOW_BTN).length > 0;
      }
    }
    console.log('[LFP] profile page check: url=', window.location.href, 'recId=', recId, 'buttons=', document.querySelectorAll(TALK_Y.LIKE_FOLLOW_BTN).length);
    if (isP) {
      lfpToast('\uD83D\uDD04 Recuperando perfil...', 'success');
      // Restore state if we arrived from background navigation
      if (!resumed) {
        try {
          var savedVisited2 = JSON.parse(localStorage.getItem('lfpVisited') || '[]');
          var savedStats2 = JSON.parse(localStorage.getItem('lfpStats') || '{}');
          if (Array.isArray(savedVisited2)) lfpVisited = savedVisited2;
          if (savedStats2.likes != null) Object.assign(lfpStats, savedStats2);
          lfpSearchUrl = localStorage.getItem('lfpSearchUrl') || '';
        } catch (e) {}
      }
      await lfpProcessOne();
      if (recId) {
        lfpVisited.push(recId);
        if (typeof registerIdInStarTools === 'function') registerIdInStarTools(recId, 'LFP');
      }
      if (typeof renderStarIds === 'function') renderStarIds();
      if (typeof saveAllStates === 'function') saveAllStates();
      await lfpGoBack();
      await lfpSleep(1000);
    } else {
      console.log('[LFP] profile page: no like/follow buttons found, navigating back');
      await lfpGoBack();
    }
  }

  if (!resumed) lfpToast('\u26A1 L+F+P Iniciado', 'success');
  var maxPages = 25;

  while (lfpActive) {
    var hasC = document.querySelectorAll(TALK_Y.PERSON_CARD).length > 0;
    if (!hasC) {
      // Wait up to 20s for the SPA to render cards (uses setTimeout, not lfpSleep,
      // so it works even in background where lfpSleep resolves immediately)
      var waitStart = Date.now();
      while (!hasC && (Date.now() - waitStart) < 20000 && lfpActive) {
        await new Promise(function(r) { setTimeout(r, 500); });
        hasC = document.querySelectorAll(TALK_Y.PERSON_CARD).length > 0;
      }
      if (!hasC || !lfpActive) {
        var pg = lfpFindNextPage();
        if (pg) { try { pg.click(); } catch (e) {} var nextCp = parseInt(localStorage.getItem('tessSearchPage') || '1') + 1; localStorage.setItem('tessSearchPage', String(nextCp)); await lfpSleep(1600); continue; }
        lfpToast('No hay perfiles. Fin.', 'info');
        break;
      }
    }
    var cards = Array.from(document.querySelectorAll(TALK_Y.PERSON_CARD));
    if (cards.length === 0) {
      var pg = lfpFindNextPage();
      if (pg) { try { pg.click(); } catch (e) {} var nextCp2 = parseInt(localStorage.getItem('tessSearchPage') || '1') + 1; localStorage.setItem('tessSearchPage', String(nextCp2)); await lfpSleep(2000); continue; }
      lfpToast('No m\u00E1s p\u00E1ginas. Fin.', 'info');
      break;
    }
    var toProcess = null;
    for (var ii = 0; ii < cards.length; ii++) {
      var card = cards[ii];
      var a = card.tagName === 'A' ? card : card.querySelector('a[href*="/profile"], a[href*="/user"]');
      var pid = a ? (a.href.match(/\/(\d{6,15})(?:[/?#]|$)/) || [])[1] : (card.dataset.userId || null);
      if (!pid || lfpVisited.indexOf(pid) !== -1) continue;
      toProcess = a || card; break;
    }
    if (!toProcess) {
      var pg = lfpFindNextPage();
      if (pg) { try { pg.click(); } catch (e) {} var nextCp2 = parseInt(localStorage.getItem('tessSearchPage') || '1') + 1; localStorage.setItem('tessSearchPage', String(nextCp2)); await lfpSleep(2000); continue; }
      lfpToast('No m\u00E1s p\u00E1ginas. Fin.', 'info');
      break;
    }
    var profileId = (function () { var lm = toProcess.href ? toProcess.href.match(/\/(\d{6,15})(?:[/?#]|$)/) : null; return lm ? lm[1] : (toProcess.dataset.userId || null); })();
    if (!lfpActive) break;
    if (profileId && lfpIsBlacklisted(profileId)) { lfpVisited.push(profileId); lfpToast('\u26D4 Blacklist: ' + profileId, 'error'); await lfpSleep(300); continue; }
    if (document.hidden) {
      // Background tab: navigate directly to profile URL (full reload)
      console.log('[LFP] hidden: direct nav to profile', profileId, toProcess.href);
      try { localStorage.setItem('lfpSweepActive', '1'); localStorage.setItem('lfpVisited', JSON.stringify(lfpVisited)); localStorage.setItem('lfpStats', JSON.stringify(lfpStats)); localStorage.setItem('lfpPage', localStorage.getItem('tessSearchPage') || '1'); } catch (e) {}
      window.location.href = toProcess.href || '/user/' + profileId;
      return;
    }
    toProcess.scrollIntoView({ behavior: 'auto', block: 'center' });
    await lfpSleep(100);
    try { toProcess.click(); } catch (e) { var cd = toProcess.closest('.search-profile-card, .person-card, [data-test-id*="person-card"], [data-test-id*="search-item"], a[href*="/profile"], a[href*="/user"]'); if (cd) { try { cd.click(); } catch (e2) {} } }
    await lfpSleep(300);
    if (!lfpActive) break;
    // Extract numeric ID from profile URL after navigation (more reliable than card data)
    var urlId = (window.location.href.match(/\/(\d{6,15})(?:[/?#]|$)/) || [])[1];
    if (urlId) profileId = urlId;
    try { await Promise.race([lfpProcessOne(), new Promise(function (_, rj) { setTimeout(function () { rj(new Error('T')); }, 35000); })]); } catch (e) { lfpToast('\u23ED\uFE0F Timeout', 'info'); }
    if (!lfpActive) break;
    lfpVisited.push(profileId);
    if (typeof registerIdInStarTools === 'function') registerIdInStarTools(profileId, 'LFP');
    if (typeof renderStarIds === 'function') renderStarIds();
    if (typeof saveAllStates === 'function') saveAllStates();
    await lfpGoBack();
    await lfpSleep(600);
  }
  lfpActive = false; lfpPaused = false;
  try { localStorage.removeItem('lfpSweepActive'); localStorage.removeItem('lfpVisited'); localStorage.removeItem('lfpStats'); localStorage.removeItem('lfpPage'); } catch (e) {}
  lfpUpdateUI();
  if (typeof saveAllStates === 'function') saveAllStates();
  if (typeof syncMetricsToStorage === 'function') syncMetricsToStorage('LFP', lfpStats.processed);
  lfpToast('\u2705 L+F+P completado: ' + lfpStats.processed + ' contactos', 'success');
};

function lfpUpdateUI() {
  var btn = document.getElementById('btnLFPToggle');
  var st = document.getElementById('lfpStatus');
  if (btn) { btn.textContent = lfpActive ? (lfpPaused ? '\u25B6 L+F+P' : '\u23F8 L+F+P') : '\u25B6 L+F+P'; btn.className = lfpActive ? 'on' : ''; }
  if (st) { st.textContent = lfpActive ? (lfpPaused ? 'PAUSADO' : 'ACTIVO') : 'INACTIVO'; st.style.color = lfpActive ? (lfpPaused ? '#f59e0b' : '#4CAF50') : '#ffffff'; }
  if (typeof updateStats === 'function') updateStats();
}

lfpTogglePause = window.lfpTogglePause = function () { if (!lfpActive) return; lfpPaused = !lfpPaused; lfpUpdateUI(); if (typeof saveAllStates === 'function') saveAllStates(); };
window.lfpActive = false;
window._addToLFPBlacklist = function(id) { if (id && !lfpBlacklist.includes(String(id))) { lfpBlacklist.push(String(id)); console.log('[LFP] Added to blacklist:', id); } };
window.lfpStats = lfpStats;

// Pause LFP timers when tab is hidden, resume when visible
document.addEventListener('visibilitychange', function () {
  if (document.hidden && lfpActive) {
    try {
      localStorage.setItem('lfpSweepActive', '1');
      localStorage.setItem('lfpVisited', JSON.stringify(lfpVisited));
      localStorage.setItem('lfpStats', JSON.stringify(lfpStats));
      localStorage.setItem('lfpPage', localStorage.getItem('tessSearchPage') || '1');
    } catch (e) {}
  }
});

// Auto-resume LFP after page reload if state was saved
(function autoResumeLFP() {
  if (localStorage.getItem('lfpSweepActive') === '1' && typeof executeLFP === 'function') {
    console.log('[LFP] Auto-resume detected, starting in 2.5s');
    setTimeout(executeLFP, 2500);
  }
})();