const MAILING_STORAGE_KEY = 'tess_mailing_config';
const ML_CONTACTED_HISTORY_KEY = 'tess_ml_contacted_history';
var TESSERACT_API = window.TESSERACT_API || 'https://tesseract-jblo.onrender.com';

// Silenciar error de MessagePort cerrado por wake-up del service worker
window.addEventListener('unhandledrejection', function(e) {
  var msg = e.reason ? (e.reason.message || e.reason) : '';
  if (msg && typeof msg === 'string' && msg.toLowerCase().includes('message port closed')) {
    e.preventDefault();
  }
});

let mlBlacklist = [];
let mlBlacklistLoaded = false;
let mlBlacklistLoadPromise = null;
let scrapedContactIds = [];

async function loadMLBlacklist(retries) {
  if (retries === undefined) retries = 2;
  if (mlBlacklistLoadPromise) return mlBlacklistLoadPromise;
  mlBlacklistLoadPromise = (async () => {
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const stored = await chrome.storage.local.get(['tess_jwt']);
        if (!stored.tess_jwt) { mlBlacklistLoadPromise = null; return; }
        const ac = new AbortController();
        const timeoutId = setTimeout(function() { ac.abort(); }, 5000);
        const res = await fetch(`${TESSERACT_API}/api/tess/blacklist`, {
          headers: { 'Authorization': 'Bearer ' + stored.tess_jwt },
          signal: ac.signal
        });
        clearTimeout(timeoutId);
        if (!res.ok && attempt < retries) { await sleep(1000); continue; }
        if (res.ok) {
          const data = await res.json();
          mlBlacklist = (data.blacklist || []).map(String);
          mlBlacklistLoaded = true;
        }
        break;
      } catch (e) {
        if (attempt >= retries) break;
        await sleep(1000);
      }
    }
    mlBlacklistLoadPromise = null;
  })();
  return mlBlacklistLoadPromise;
}

async function reloadMLBlacklist() {
  console.log('[ML] reloadMLBlacklist start, current:', mlBlacklist.length);
  mlBlacklist = []; mlBlacklistLoaded = false; mlBlacklistLoadPromise = null;
  await loadMLBlacklist();
  console.log('[ML] reloadMLBlacklist done, loaded:', mlBlacklist.length, 'ok:', mlBlacklistLoaded);
}

function isInMLBlacklist(contactId) {
  if (!contactId) return true;
  return mlBlacklist.includes(String(contactId));
}

async function isContactAlreadyContactedML(profileId) {
  try {
    const data = await chrome.storage.local.get([ML_CONTACTED_HISTORY_KEY]);
    const history = data[ML_CONTACTED_HISTORY_KEY] || {};
    return history[String(profileId)] === true;
  } catch (e) { return false; }
}

async function markContactAsContactedML(profileId) {
  try {
    const data = await chrome.storage.local.get([ML_CONTACTED_HISTORY_KEY, 'tess_aa_contacted_history']);
    const mlHistory = data[ML_CONTACTED_HISTORY_KEY] || {};
    const aaHistory = data['tess_aa_contacted_history'] || {};
    mlHistory[String(profileId)] = true;
    aaHistory[String(profileId)] = true;
    await chrome.storage.local.set({ 'tess_aa_contacted_history': aaHistory, [ML_CONTACTED_HISTORY_KEY]: mlHistory });
    if (typeof window._tessServerSync !== 'undefined') window._tessServerSync.history(profileId);
  } catch (e) { logError('ml-mark-contacted', e); }
}

const DEFAULT_MAILING_CONFIG = {
  enabled: false,
  maxDaily: 30,
  sentToday: 0,
  lastResetDate: '',
  delay: { min: 1500, max: 4000 },
  messageTemplate: 'Hola! Me encantaría conocerte mejor. ¿Te gustaría conversar un rato?',
  workingHours: { start: 8, end: 22 },
  respectQuietHours: true,
  skipPinned: true,
  stopOnBlacklistHit: false,
  scheduleEnabled: false,
  scheduleStartDate: '',
  scheduleFrequency: 'daily',
  scheduleCycles: 30,
  scheduleRemaining: 30,
  templatesNew: 'Hola! Vi tu perfil y me pareciste interesante. ¿Te gustaría conversar?',
  blockActiveDialogue: true,
  activeDialogueHours: 48,
  multiProfileEnabled: false,
  currentProfile: '',
  maxLetterCount: 2
};

let mailingConfig = null;
let mailingActive = false;
let mailingAbort = false;
let lastScrapedCount = 0;

function cloneMailingConfig(cfg) {
  return JSON.parse(JSON.stringify(cfg || DEFAULT_MAILING_CONFIG));
}

async function loadMailingConfig() {
  try {
    const r = await chrome.storage.local.get([MAILING_STORAGE_KEY]);
    if (r[MAILING_STORAGE_KEY]) {
      mailingConfig = Object.assign({}, DEFAULT_MAILING_CONFIG, r[MAILING_STORAGE_KEY]);
    } else {
      mailingConfig = cloneMailingConfig(DEFAULT_MAILING_CONFIG);
    }
  } catch (e) {
    mailingConfig = cloneMailingConfig(DEFAULT_MAILING_CONFIG);
  }
  resetMailingDailyCounter();
  return mailingConfig;
}

async function saveMailingConfig() {
  try {
    await chrome.storage.local.set({ [MAILING_STORAGE_KEY]: mailingConfig });
  } catch (e) { logError('ml-save-config', e); }
}

function resetMailingDailyCounter() {
  const today = new Date().toISOString().slice(0, 10);
  if (mailingConfig.lastResetDate !== today) {
    mailingConfig.sentToday = 0;
    mailingConfig.lastResetDate = today;
    saveMailingConfig();
  }
}

function isWithinWorkingHours() {
  if (!mailingConfig.respectQuietHours) return true;
  const hour = new Date().getHours();
  return hour >= mailingConfig.workingHours.start && hour < mailingConfig.workingHours.end;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function isScheduleActive() {
  if (!mailingConfig.scheduleEnabled) return true;
  if (mailingConfig.scheduleRemaining <= 0) return false;
  if (mailingConfig.scheduleStartDate) {
    const start = new Date(mailingConfig.scheduleStartDate);
    if (start > new Date()) return false;
  }
  return true;
}

function consumeScheduleCycle() {
  if (!mailingConfig.scheduleEnabled) return;
  mailingConfig.scheduleRemaining = Math.max(0, (mailingConfig.scheduleRemaining || 0) - 1);
  saveMailingConfig();
}

function hasActiveDialogue(contactEl) {
  if (!mailingConfig.blockActiveDialogue) return false;
  try {
    const text = contactEl.textContent.toLowerCase();

    // Señales de conversación activa (chat y email)
    const signals = [
      'respondió', 'respondio', 'replied', 'contestó', 'contesto',
      'te escribió', 'wrote to you', 'te ha escrito', 'has written',
      'respondiste', 'you replied', 'nuevo mensaje', 'new message',
      'conversación activa', 'active conversation', 'chat activo', 'active chat',
      'respondio a tu carta', 'replied to your letter', 'respondió a tu carta',
      'te respondió', 'has responded', 'nueva carta', 'new letter',
      'intercambio de cartas', 'letter exchange'
    ];
    for (const s of signals) {
      if (text.includes(s)) return true;
    }

    // Verificar si hay indicador de tiempo reciente (minutos/horas)
    const timeEl = contactEl.querySelector(TALK_Y.TIME_ELEMENT);
    if (timeEl) {
      const timeText = timeEl.textContent.toLowerCase();
      if (timeText.includes('min') || timeText.includes('hour') || timeText.includes('hora') || timeText.includes('minuto')) return true;
    }

    // Verificar atributos data que indiquen estado activo
    const activeAttr = contactEl.getAttribute('data-active') || contactEl.getAttribute('data-status') || '';
    if (activeAttr.includes('active') || activeAttr.includes('responded') || activeAttr.includes('replied')) return true;

    // Verificar si tiene clase que indique conversación activa
    if (contactEl.className && typeof contactEl.className === 'string') {
      if (/active|responded|replied|unread/i.test(contactEl.className)) return true;
    }

    return false;
  } catch (e) { return false; }
}

function detectContactType(contactEl, contactId) {
  if (hasActiveDialogue(contactEl)) return 'active';
  return 'new';
}

async function getMessageForContact() {
  return mailingConfig.messageTemplate || mailingConfig.templatesNew || 'Hola! Vi tu perfil y me pareciste interesante. ¿Te gustaría conversar?';
}

function extractIdFromHref(href) {
  if (!href) return null;
  href = String(href);
  var viewMatch = href.match(/\/view\/(\d{5,15})_(\d{5,15})(?:[/?#]|$)/);
  if (viewMatch) return viewMatch[2];
  var match = href.match(/\/(\d{5,15})(?:[/?#_&]|$)/);
  return match ? match[1] : null;
}

function extractIdFromText(text) {
  if (!text) return null;
  const match = text.match(/\b(\d{6,15})\b/);
  return match ? match[1] : null;
}

var _mlCachedUserId = null;

function mlGetUserId() {
  if (_mlCachedUserId) return _mlCachedUserId;
  try { var idEl = document.getElementById('profileId'); if (idEl) { var text = idEl.textContent || ''; var m = text.match(/(\d{5,15})/); if (m) { _mlCachedUserId = m[1]; return _mlCachedUserId; } } } catch (e) {}
  return null;
}

function scrapeActiveLimitsIds() {
  const ids = [];
  const seen = new Set();

  function tryAddFromLink(link, source) {
    try {
      var href = link.href || link.getAttribute('href') || '';
      var id = extractIdFromHref(href);
      if (id && !seen.has(id)) {
        seen.add(id);
        var parent = link.closest('[class*="contact"], [class*="user"], [class*="member"], [class*="profile"], [class*="item"], [class*="row"], tr, li, [class*="mail"], [class*="conversation"], [class*="thread"], [class*="inbox"]');
        var contactType = 'new';
        if (parent) {
          contactType = detectContactType(parent, id);
        }
        ids.push({ id: id, element: link, source: source, contactType: contactType });
      }
    } catch (e) {}
  }

  function tryAddId(id, el, source) {
    if (id && !seen.has(id)) {
      seen.add(id);
      var contactType = detectContactType(el, id);
      ids.push({ id: id, element: el, source: source, contactType: contactType });
    }
  }

  // 1. Extraer IDs de data-test-uid (formato: id1_id2)
  try {
    var uidElements = document.querySelectorAll(TALK_Y.DATA_UID);
    var selfId = mlGetUserId();
    if (!selfId && uidElements.length >= 2) {
      var freq = {};
      for (var uiTmp = 0; uiTmp < uidElements.length; uiTmp++) {
        var uidTmp = uidElements[uiTmp].getAttribute('data-test-uid') || '';
        var partsTmp = String(uidTmp).split('_');
        for (var pt = 0; pt < partsTmp.length; pt++) {
          if (partsTmp[pt] && partsTmp[pt].match(/^\d{5,15}$/)) freq[partsTmp[pt]] = (freq[partsTmp[pt]] || 0) + 1;
        }
      }
      for (var id in freq) {
        if (freq[id] === uidElements.length) selfId = id;
      }
    }
    for (var ui = 0; ui < uidElements.length; ui++) {
      var uid = uidElements[ui].getAttribute('data-test-uid') || '';
      var parts = String(uid).split('_');
      var contactEl = uidElements[ui].querySelector(TALK_Y.MAIL_BOX_OPEN_THREAD) || uidElements[ui];
      for (var pi = 0; pi < parts.length; pi++) {
        if (parts[pi] && parts[pi].match(/^\d{5,15}$/) && parts[pi] !== selfId) {
          var cType = detectContactType(uidElements[ui], parts[pi]);
          if (!seen.has(parts[pi])) {
            seen.add(parts[pi]);
            ids.push({ id: parts[pi], element: contactEl, source: 'data-test-uid', contactType: cType });
          }
        }
      }
    }
  } catch (e) {}

  // 2. Buscar en elementos mail-box-item
  try {
    var mailItems = document.querySelectorAll(TALK_Y.SECTION_MAIL_BOX_ITEM);
    for (var mi = 0; mi < mailItems.length; mi++) {
      var innerLinks = mailItems[mi].querySelectorAll(TALK_Y.ALL_LINKS);
      for (var il = 0; il < innerLinks.length; il++) {
        tryAddFromLink(innerLinks[il], 'mail-box-item-links');
      }
    }
  } catch (e) {}

  // 3. Secciones de lista con links
  var sectionSelectors = [
    '[class*="active-limit"]', '[class*="activeLimit"]', '[class*="ActiveLimit"]',
    '[class*="active"][class*="limit"]', '[id*="active-limit"]', '[id*="activeLimit"]',
    'table[class*="mail"]', 'table[class*="message"]', '[class*="mail-list"]', '[class*="message-list"]',
    '[class*="contact-list"]', '[class*="user-list"]',
    'section', 'div[class*="list"]', 'div[class*="table"]',
    '[class*="inbox"]', '[class*="conversation"]', '[class*="thread"]', '[class*="mail-item"]',
    '[class*="msg-list"]', '[class*="chat-list"]', '[class*="feed"]',
    '[class*="letter-wrap"]', '[class*="mail-box"]',
  ];
  for (var si = 0; si < sectionSelectors.length; si++) {
    try {
      var sections = document.querySelectorAll(sectionSelectors[si]);
      for (var sj = 0; sj < sections.length; sj++) {
        var links = sections[sj].querySelectorAll(TALK_Y.ALL_LINKS);
        for (var sk = 0; sk < links.length; sk++) {
          tryAddFromLink(links[sk], sectionSelectors[si]);
        }
      }
    } catch (e) {}
  }

  // 4. Links con /profile/ en la URL
  try {
    var allLinks = document.querySelectorAll(TALK_Y.LINKS_WITH_PROFILE);
    for (var li = 0; li < allLinks.length; li++) {
      tryAddFromLink(allLinks[li], 'profile-link');
    }
  } catch (e) {}

  // 5. Fallback: cualquier link con ID numérico
  try {
    var allLinks2 = document.querySelectorAll(TALK_Y.ALL_LINKS);
    for (var li2 = 0; li2 < allLinks2.length; li2++) {
      tryAddFromLink(allLinks2[li2], 'global-fallback');
    }
  } catch (e) {}

  // 6. Email section fallback
  try {
    var emailContainer = document.querySelector('[class*="active-limit"] table, [class*="active-limit"] [class*="list"], [class*="active-limit"] [class*="table"], [class*="active-limit"] tbody');
    if (emailContainer) {
      var dataEls = emailContainer.querySelectorAll('[data-id], [data-user-id], [data-contact-id], [data-member-id], [data-profile-id], [data-test-id]');
      for (var de = 0; de < dataEls.length; de++) {
        var dataId = dataEls[de].getAttribute('data-id') || dataEls[de].getAttribute('data-user-id') || dataEls[de].getAttribute('data-contact-id') || dataEls[de].getAttribute('data-member-id') || dataEls[de].getAttribute('data-profile-id') || '';
        if (dataId && dataId.match(/^\d{5,15}$/)) tryAddId(dataId, dataEls[de], 'email-data-fallback');
        var testId = dataEls[de].getAttribute('data-test-id') || '';
          var idMatch = testId.match(/\/(\d{5,15})/);
          if (idMatch) tryAddId(idMatch[1], dataEls[de], 'email-data-test-id-fallback');
        }
        var allRows = emailContainer.querySelectorAll('tr, [class*="row"], [class*="item"]');
        for (var rr = 0; rr < allRows.length; rr++) {
          var rowText = allRows[rr].textContent || '';
          var idFound = rowText.match(/\b(\d{6,15})\b/);
          if (idFound && !seen.has(idFound[1])) {
            seen.add(idFound[1]);
            tryAddId(idFound[1], allRows[rr], 'email-text-fallback');
          }
        }
      }
    } catch (e) {}

  // 7. Busqueda en toda la pagina si hay paginacion visible
  try {
      if (document.querySelector(TALK_Y.NEXT_PAGE_BTNS) || document.querySelector('[class*="page-buttons"]')) {
        var anyBtns = document.querySelectorAll('button, a, [role="button"]');
        for (var ab = 0; ab < anyBtns.length; ab++) {
          var text = (anyBtns[ab].textContent || '').trim();
          var idCandidate = anyBtns[ab].getAttribute('data-id') || anyBtns[ab].getAttribute('href') || '';
          var extr = extractIdFromHref(idCandidate) || extractIdFromText(text + ' ' + (anyBtns[ab].getAttribute('data-user-id') || ''));
          if (extr && !seen.has(extr)) {
            seen.add(extr);
            tryAddId(extr, anyBtns[ab], 'page-wide-fallback');
          }
        }
      }
    } catch (e) {}

  lastScrapedCount = ids.length;
  scrapedContactIds = ids;
  return ids;
}

function findChatInput() {
  const selectors = [
    'textarea[class*="chat"]', 'textarea[class*="message"]', 'textarea[placeholder*="message"]',
    'textarea[placeholder*="escribe"]', 'textarea[placeholder*="type"]', 'textarea[placeholder*="Write"]',
    'div[contenteditable="true"][class*="chat"]', 'div[contenteditable="true"][class*="message"]',
    'input[class*="chat"]', 'input[class*="message"]',
    '#chatInput', '#messageInput', '#msgInput', 'textarea.chat-input',
    '[class*="chat-input"] textarea', '[class*="chat-input"] input',
    '[class*="message-input"] textarea', '[class*="message-input"] input',
    'textarea',
  ];
  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (el && el.offsetParent !== null) return el;
  }
  return null;
}

function findSendButton() {
  const selectors = [
    'button[class*="send"]', '[class*="send-btn"]', '[class*="btn-send"]',
    '[type="submit"][class*="chat"]', '[type="submit"][class*="message"]',
    'button[aria-label*="send"]', 'button[aria-label*="enviar"]',
    '#sendButton', '#btnSend', '#chatSend',
  ];
  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (el && el.offsetParent !== null) return el;
  }
  const allButtons = document.querySelectorAll(TALK_Y.ALL_BUTTONS);
  for (const btn of allButtons) {
    const text = (btn.textContent || '').toLowerCase().trim();
    if ((text === 'send' || text === 'enviar' || text === '\u2192' || text === '\u25b6') && btn.offsetParent !== null) return btn;
  }
  return null;
}

function typeIntoInput(input, text) {
  if (!input) return false;
  try {
    if (input.tagName === 'TEXTAREA' || input.tagName === 'INPUT') {
      input.value = text;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    } else if (input.isContentEditable) {
      input.textContent = text;
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
    return true;
  } catch (e) { return false; }
}

function findProfileLink(profileId) {
  try {
    const allLinks = document.querySelectorAll(TALK_Y.ALL_LINKS);
    var mailLink = null, profileLink = null;
    for (const link of allLinks) {
      var href = link.href || '';
      if (href.includes('/mails/view/') && (href.includes(profileId) || href.endsWith(profileId))) { mailLink = link; break; }
      if (href.includes(profileId)) { profileLink = link; }
    }
    if (mailLink) return mailLink;
    if (profileLink) return profileLink;
  } catch (e) {}
  try {
    const elements = document.querySelectorAll(`[data-id="${profileId}"], [data-user-id="${profileId}"], [data-contact-id="${profileId}"]`);
    if (elements.length > 0) return elements[0].querySelector(TALK_Y.ALL_LINKS) || elements[0];
  } catch (e) {}
  return null;
}

async function openProfileChat(profileId) {
  const link = findProfileLink(profileId);
  if (link) { link.click(); await sleep(2000); return true; }
  return false;
}

function findEmailInput() {
  try {
    const el = document.querySelector(TALK_Y.EMAIL_TEXTAREA) || document.querySelector(TALK_Y.EMAIL_CONTENTEDITABLE) || document.querySelector(TALK_Y.EMAIL_COMPOSE) || document.querySelector(TALK_Y.EMAIL_BODY) || document.querySelector(TALK_Y.EMAIL_LETTER_CONTENT);
    return el && el.offsetParent !== null ? el : null;
  } catch (e) { return null; }
}

function findEmailSendButton() {
  try {
    var btn = document.querySelector('button.send-button[data-test-id*="send-mail"][data-test-id*="send"]');
    if (btn && btn.offsetParent !== null) return btn;
    btn = document.querySelector(TALK_Y.EMAIL_SEND_BTN);
    if (btn && btn.offsetParent !== null) return btn;
    btn = document.querySelector(TALK_Y.EMAIL_SEND_BTN_DATA_TEST);
    if (btn && btn.offsetParent !== null) return btn;
    btn = document.querySelector(TALK_Y.EMAIL_SEND_BTN_CLASS);
    if (btn && btn.offsetParent !== null) return btn;
    btn = document.querySelector(TALK_Y.EMAIL_SEND_BTN_ID);
    if (btn && btn.offsetParent !== null) return btn;
  } catch (e) {}
  return null;
}

function waitForElement(sel, maxMs) {
  if (maxMs === undefined) maxMs = 4000;
  var start = Date.now();
  return new Promise(function(resolve) {
    function check() {
      var el = document.querySelector(sel);
      if (el && el.offsetParent !== null) { resolve(el); return; }
      if (Date.now() - start >= maxMs) { resolve(null); return; }
      setTimeout(check, 200);
    }
    check();
  });
}

function findAnyInput() {
  var emailInput = findEmailInput();
  if (emailInput) return emailInput;
  var chatInput = findChatInput();
  if (chatInput) return chatInput;
  var allTextareas = document.querySelectorAll('textarea');
  for (var ti = 0; ti < allTextareas.length; ti++) {
    if (allTextareas[ti].offsetParent !== null) return allTextareas[ti];
  }
  var allContentEditables = document.querySelectorAll('div[contenteditable="true"]');
  for (var ci = 0; ci < allContentEditables.length; ci++) {
    if (allContentEditables[ci].offsetParent !== null) return allContentEditables[ci];
  }
  return null;
}

function findAnySendBtn(inputEl) {
  var btn = findEmailSendButton();
  if (btn) return btn;
  btn = findSendButton();
  if (btn) return btn;
  if (inputEl) {
    var parent = inputEl.closest('form, div[class*="input"], div[class*="compose"], div[class*="reply"], div[class*="write"], div[class*="message"], section, .mail-compose, [class*="thread"]');
    if (parent) {
      btn = parent.querySelector('button[type="submit"]');
      if (btn && btn.offsetParent !== null) return btn;
      btn = parent.querySelector('button:not([type="reset"]):not([type="button"])');
      if (btn && btn.offsetParent !== null) return btn;
    }
  }
  var exactTexts = ['send letter', 'enviar carta', 'send', 'enviar', 'reply', 'responder'];
  var allButtons = document.querySelectorAll('button, input[type="submit"], [role="button"]');
  for (var ebi = 0; ebi < allButtons.length; ebi++) {
    var txt = (allButtons[ebi].textContent || allButtons[ebi].value || '').toLowerCase().trim();
    for (var ei = 0; ei < exactTexts.length; ei++) {
      if (txt === exactTexts[ei]) { if (allButtons[ebi].offsetParent !== null) return allButtons[ebi]; }
    }
  }
  return null;
}

async function sendMailingMessage(text, profileId, contactEl) {
  if (contactEl) {
    contactEl.click();
    await sleep(2000);
    var maxLc = mailingConfig.maxLetterCount || 2;
    if (maxLc > 0) {
      var lc = pageLetterCount();
      if (lc > maxLc) {
        console.log('[ML] Skipped (letters: ' + lc + ' > ' + maxLc + ')');
        goBackToInbox();
        return false;
      }
    }
  } else if (profileId) {
    const opened = await openProfileChat(profileId);
    if (!opened) return false;
  }
  var emailInput = null, emailSendBtn = null;
  for (var sw = 0; sw < 15; sw++) {
    emailInput = findAnyInput();
    emailSendBtn = findAnySendBtn(emailInput);
    if (emailInput && emailSendBtn) break;
    await sleep(400);
  }
  if (!emailInput || !emailSendBtn) return false;
  if (!typeIntoInput(emailInput, text)) return false;
  const beforeVal = emailInput.value || emailInput.textContent || '';
  await sleep(1500);
  emailSendBtn.click();
  await sleep(1500);
  const afterVal = emailInput.value || emailInput.textContent || '';
  if (afterVal === beforeVal && beforeVal !== '') {
    var altBtn = findEmailSendButton() || findSendButton();
    if (altBtn && altBtn !== emailSendBtn) { altBtn.click(); await sleep(1500); }
    else return false;
  }
  if (contactEl) {
    goBackToInbox();
    var foundList = false;
    for (var bw = 0; bw < 30; bw++) {
      if (document.querySelector(TALK_Y.MAIL_BOX_ITEM) || document.querySelector('[data-test-uid]')) { foundList = true; break; }
      await sleep(300);
    }
    if (!foundList) return false;
  }
  return true;
}

function goBackToInbox() {
  history.back();
}

function getLetterCount(container) {
  if (!container) return 0;
  try {
    var els = container.querySelectorAll('span, div, [class*="typography"]');
    for (var ei = 0; ei < els.length; ei++) {
      var text = (els[ei].textContent || '').trim();
      var match = text.match(/^(\d+)\s+letter\s+total/i);
      if (match) return parseInt(match[1], 10);
    }
  } catch (e) {}
  return 0;
}

function pageLetterCount() {
  try {
    var els = document.querySelectorAll('span, div, [class*="typography"]');
    for (var ei = 0; ei < els.length; ei++) {
      var text = (els[ei].textContent || '').trim();
      var match = text.match(/^(\d+)\s+letter\s+total/i);
      if (match) return parseInt(match[1], 10);
    }
  } catch (e) {}
  return 0;
}

async function executeMailingRound() {
  if (!mailingConfig || !mailingConfig.enabled) return { sent: 0, skipped: 0, blacklisted: 0, total: 0 };
  if (mailingActive) return { sent: 0, skipped: 0, blacklisted: 0, total: 0 };
  if (!isScheduleActive()) return { sent: 0, skipped: 0, blacklisted: 0, total: 0 };

  mailingActive = true;
  mailingAbort = false;
  resetMailingDailyCounter();

  if (mailingConfig.maxDaily > 0 && mailingConfig.sentToday >= mailingConfig.maxDaily) {
    mailingActive = false; return { sent: 0, skipped: 0, blacklisted: 0, total: 0 };
  }
  if (!isWithinWorkingHours()) { mailingActive = false; return { sent: 0, skipped: 0, blacklisted: 0, total: 0 }; }
  if (!mlBlacklistLoaded) await loadMLBlacklist();

  let sent = 0, skipped = 0, blacklisted = 0, alreadyContacted = 0, activeSkipped = 0, totalScanned = 0;
  var processedIds = new Set();
  var currentPage = 1;

  try {
    var stuckCount = 0;
    while (mailingConfig.enabled && !mailingAbort) {
      if (mailingConfig.maxDaily > 0 && mailingConfig.sentToday >= mailingConfig.maxDaily) break;
      if (!isWithinWorkingHours()) break;
      if (currentPage > 100 || stuckCount > 5) break;

      var contacts = scrapeActiveLimitsIds();
      totalScanned += contacts.length;

      var contact = null;
      for (var ci = 0; ci < contacts.length; ci++) {
        var cid = contacts[ci].id || contacts[ci];
        if (processedIds.has(cid)) continue;
        var cType = contacts[ci].contactType || 'new';

        if (contacts[ci].element) {
          var container = contacts[ci].element.closest
            ? contacts[ci].element.closest('[class*="mail-box-item"], [class*="mail-item"], [class*="item"], [class*="row"], li, tr, [class*="contact"], [class*="user"], [class*="member"], [class*="thread"], [class*="conversation"], [class*="dialog"]')
            : null;
        } else if (mailingConfig.blockActiveDialogue && cType === 'active') {
          activeSkipped++; skipped++; processedIds.add(cid); continue;
        }
        if (isInMLBlacklist(cid)) { blacklisted++; processedIds.add(cid); if (mailingConfig.stopOnBlacklistHit) { mailingActive = false; return { sent, skipped, blacklisted, alreadyContacted, activeSkipped, total: totalScanned }; } continue; }
        if (await isContactAlreadyContactedML(cid)) { alreadyContacted++; skipped++; processedIds.add(cid); continue; }

        contact = contacts[ci];
        break;
      }

      if (!contact) {
        var nextBtn = document.querySelector(TALK_Y.NEXT_PAGE_BTN_NEXT + ':not([disabled])');
        if (!nextBtn) {
          var pBtns = document.querySelectorAll(TALK_Y.PAGE_BUTTONS);
          for (var pb = 0; pb < pBtns.length; pb++) {
            if (parseInt((pBtns[pb].textContent || '').trim(), 10) === currentPage + 1) { nextBtn = pBtns[pb]; break; }
          }
        }
        if (!nextBtn) break;
        nextBtn.click();
        currentPage++;
        await sleep(2000);
        stuckCount++;
        continue;
      }

      var contactId = contact.id || contact;
      processedIds.add(contactId);

      const message = await getMessageForContact();
      if (!message) { skipped++; continue; }

      const success = await sendMailingMessage(message, contactId, contact.element);
      if (success) {
        await markContactAsContactedML(contactId);
        mailingConfig.sentToday++;
        await saveMailingConfig();
        sent++;
        if (typeof botStats !== 'undefined') botStats.mailingSent = (botStats.mailingSent || 0) + 1;
        if (typeof window._updateMLTabUI === 'function') window._updateMLTabUI();
      } else { skipped++; }

      const delayMs = (mailingConfig.delay?.min || 3000) + Math.random() * ((mailingConfig.delay?.max || 7000) - (mailingConfig.delay?.min || 3000));
      await sleep(delayMs);
    }
  } finally {
    mailingActive = false;
  }

  if (sent > 0) consumeScheduleCycle();
  return { sent, skipped, blacklisted, alreadyContacted, activeSkipped, total: totalScanned };
}

function abortMailingRound() { mailingAbort = true; }

async function setMailingState(enabled) {
  await loadMailingConfig();
  mailingConfig.enabled = enabled;
  await saveMailingConfig();
  if (enabled) { console.log('[ML] Activado'); }
  else { mailingAbort = true; mailingActive = false; }
}

async function updateMailingMessageTemplate(template) { await loadMailingConfig(); mailingConfig.messageTemplate = template; await saveMailingConfig(); }
async function updateMailingMaxDaily(max) { await loadMailingConfig(); mailingConfig.maxDaily = max; await saveMailingConfig(); }
async function updateMailingDelay(min, max) { await loadMailingConfig(); mailingConfig.delay = { min, max }; await saveMailingConfig(); }
async function updateMailingWorkingHours(start, end) { await loadMailingConfig(); mailingConfig.workingHours = { start, end }; await saveMailingConfig(); }
async function updateMailingRespectQuietHours(respect) { await loadMailingConfig(); mailingConfig.respectQuietHours = respect; await saveMailingConfig(); }
async function updateMailingSkipPinned(skip) { await loadMailingConfig(); mailingConfig.skipPinned = skip; await saveMailingConfig(); }
async function updateMailingStopOnBlacklist(stop) { await loadMailingConfig(); mailingConfig.stopOnBlacklistHit = stop; await saveMailingConfig(); }
async function updateMailingSchedule(enabled, startDate, frequency, cycles) {
  await loadMailingConfig();
  mailingConfig.scheduleEnabled = enabled;
  mailingConfig.scheduleStartDate = startDate || '';
  mailingConfig.scheduleFrequency = frequency || 'daily';
  mailingConfig.scheduleCycles = cycles || 30;
  mailingConfig.scheduleRemaining = cycles || 30;
  await saveMailingConfig();
}
async function updateMailingTemplates(newTmpl) {
  await loadMailingConfig();
  if (newTmpl !== undefined) mailingConfig.templatesNew = newTmpl;
  mailingConfig.messageTemplate = newTmpl || mailingConfig.messageTemplate;
  await saveMailingConfig();
}
async function updateMailingBlockActiveDialogue(block, hours) {
  await loadMailingConfig();
  mailingConfig.blockActiveDialogue = block;
  mailingConfig.activeDialogueHours = hours || 48;
  await saveMailingConfig();
}

function getMailingConfig() { return mailingConfig; }

function getMailingStats() {
  return {
    active: mailingActive,
    sentToday: mailingConfig?.sentToday || 0,
    maxDaily: mailingConfig?.maxDaily || 0,
    blacklistSize: mlBlacklist.length,
    blacklistLoaded: mlBlacklistLoaded,
    lastScrapedCount,
    scheduleEnabled: mailingConfig?.scheduleEnabled || false,
    scheduleRemaining: mailingConfig?.scheduleRemaining || 0,
    scheduleCycles: mailingConfig?.scheduleCycles || 0,
    blockActiveDialogue: mailingConfig?.blockActiveDialogue || false
  };
}

async function initSmartMailing() {
  await loadMailingConfig();
  await loadMLBlacklist();
  console.log('[ML] Module initialized, enabled:', mailingConfig.enabled, '| Blacklist:', mlBlacklist.length, 'contactos');
  if (mailingConfig.scheduleEnabled && mailingConfig.scheduleRemaining > 0) {
    console.log('[ML] Schedule: ' + mailingConfig.scheduleRemaining + '/' + mailingConfig.scheduleCycles + ' ciclos restantes (' + mailingConfig.scheduleFrequency + ')');
  }
}

window._saveMailingConfigDirect = saveMailingConfig;
window._getMailingConfigDirect = () => mailingConfig;
window._loadMailingConfigDirect = loadMailingConfig;
window._updateMailingMessageTemplate = updateMailingMessageTemplate;
window._updateMailingMaxDaily = updateMailingMaxDaily;
window._updateMailingDelay = updateMailingDelay;
window._updateMailingWorkingHours = updateMailingWorkingHours;
window._updateMailingRespectQuietHours = updateMailingRespectQuietHours;
window._updateMailingSkipPinned = updateMailingSkipPinned;
window._updateMailingStopOnBlacklist = updateMailingStopOnBlacklist;
window._updateMailingSchedule = updateMailingSchedule;
window._updateMailingTemplates = updateMailingTemplates;
window._updateMailingBlockActiveDialogue = updateMailingBlockActiveDialogue;
window._setMailingState = setMailingState;
window._executeMailingRound = executeMailingRound;
window._abortMailingRound = abortMailingRound;
window._isInMLBlacklist = isInMLBlacklist;
window._reloadMLBlacklist = reloadMLBlacklist;
window._addToMLBlacklist = function(id) {
  if (id && !mlBlacklist.includes(String(id))) {
    mlBlacklist.push(String(id));
    console.log('[ML] Added to blacklist:', id, 'total:', mlBlacklist.length);
  }
};
window._removeFromMLBlacklist = function(id) {
  if (!id) return;
  const s = String(id);
  const idx = mlBlacklist.indexOf(s);
  if (idx !== -1) {
    mlBlacklist.splice(idx, 1);
    console.log('[ML] Removed from blacklist:', id);
  }
};
window._getMailingAbortState = function() { return mailingAbort; };
window._getMailingStats = getMailingStats;
window._scrapeActiveLimitsIds = scrapeActiveLimitsIds;
