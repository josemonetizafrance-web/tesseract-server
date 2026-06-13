// TESSERACT v24 - Mail CRIBS Module
// Captura estilo de cartas enviadas (🎭 en mensajes salientes)
// Genera respuestas con IA para cartas recibidas (🤖 en mensajes entrantes)
// Los íconos van dentro de .message-text .observer

let mailCribsConfig = { enabled: false };
let mailCribsObserver = null;
let mailCribsProcessed = new Set();
let mailCribsLetterStyleEnabled = true;
let capturedLetterCache = new Set();

const MAIL_MSG_SEL = '[data-test-id*="mail-history-item"], [data-test-id*="message-text"]';

// ============ CONFIG ============
async function loadMailCribsConfig() {
  try {
    const r = await chrome.storage.local.get(['tess_mail_cribs']);
    if (r.tess_mail_cribs) mailCribsConfig = Object.assign({ enabled: false }, r.tess_mail_cribs);
  } catch (e) {}
}

async function saveMailCribsConfig() {
  await chrome.storage.local.set({ tess_mail_cribs: mailCribsConfig });
}

async function setMailCribsEnabled(enabled) {
  await loadMailCribsConfig();
  mailCribsConfig.enabled = enabled;
  await saveMailCribsConfig();
  if (enabled) startMailCribsObserver();
  else stopMailCribsObserver();
}

// ============ MESSAGE TEXT OBSERVER ============
function startMailCribsObserver() {
  stopMailCribsObserver();
  const container = document.querySelector(TALK_Y.MAIL_HISTORY_CONTAINER) || document.querySelector(TALK_Y.SECTION_INBOX) || document.body;
  mailCribsObserver = new MutationObserver((mutations) => {
    if (!mailCribsConfig.enabled) return;
    for (const mutation of mutations) {
      if (mutation.type !== 'childList') continue;
      for (const node of mutation.addedNodes) {
        if (node.nodeType !== 1) continue;
        if (node.matches && node.matches(MAIL_MSG_SEL)) {
          processMessageText(node);
        } else {
          const sub = node.querySelector && node.querySelector(MAIL_MSG_SEL);
          if (sub) processMessageText(sub);
        }
      }
    }
    scanExistingMessageTexts();
  });
  mailCribsObserver.observe(container, { childList: true, subtree: true });
  setTimeout(scanExistingMessageTexts, 1500);
  console.log('[MAIL-CRIBS] Observer started');
}

function stopMailCribsObserver() {
  if (mailCribsObserver) { mailCribsObserver.disconnect(); mailCribsObserver = null; }
}

function scanExistingMessageTexts() {
  if (!mailCribsConfig.enabled) return;
  document.querySelectorAll(MAIL_MSG_SEL).forEach(el => processMessageText(el));
}

function processMessageText(msgText) {
  if (!msgText || !mailCribsConfig.enabled) { console.log('[MAIL-CRIBS] processMessageText: disabled or null'); return; }
  if (mailCribsProcessed.has(msgText)) { console.log('[MAIL-CRIBS] processMessageText: already processed'); return; }
  console.log('[MAIL-CRIBS] processMessageText:', msgText.className);

  let observer = msgText.querySelector('.observer');
  if (!observer) {
    console.log('[MAIL-CRIBS] no .observer inside msgText, injecting in msgText');
    observer = msgText;
  } else {
    console.log('[MAIL-CRIBS] found .observer');
  }

  // Find the preceding mail-header sibling to determine direction
  const header = findPrecedingMailHeader(msgText);
  if (!header) { console.log('[MAIL-CRIBS] no preceding mail-header found'); return; }
  console.log('[MAIL-CRIBS] found header');

  let nameEl = header.querySelector(TALK_Y.MAIL_HEADER_NAME);
  if (!nameEl || !(nameEl.textContent || '').trim()) {
    nameEl = header.querySelector(TALK_Y.MAIL_HEADER_NAME_FALLBACK);
  }
  if (!nameEl) { console.log('[MAIL-CRIBS] no nameEl found'); return; }
  const senderName = (nameEl.textContent || '').trim();
  if (!senderName) { console.log('[MAIL-CRIBS] empty senderName'); return; }
  console.log('[MAIL-CRIBS] senderName:', senderName);

  // Dedup by element reference only (msgText is a new DOM node each navigation)
  mailCribsProcessed.add(msgText);
  if (mailCribsProcessed.size > 200) {
    const first = Array.from(mailCribsProcessed).slice(0, 50);
    first.forEach(k => mailCribsProcessed.delete(k));
  }

  const isMe = senderName === TALK_Y.MAIL_OPERATOR_NAME;
  console.log('[MAIL-CRIBS] isMe:', isMe);

  if (isMe) {
    if (mailCribsLetterStyleEnabled) injectCaptureButton(observer, msgText, header);
  } else {
    console.log('[MAIL-CRIBS] Incoming mail from', senderName);
    injectResponseButton(observer, msgText, header, senderName);
    if (typeof showTessToast === 'function') showTessToast('📬 Carta de ' + senderName + ' detectada', 'info');
  }
  // Show CRIBS overlay for the CLIENT (sender for incoming, recipient for outgoing)
  showCribsForMailContact(isMe, msgText, header, senderName);
}

function findCribsByName(name, cb) {
  if (typeof _cribsLocalCache !== 'undefined' && _cribsLocalCache) {
    for (var ci = 0; ci < _cribsLocalCache.length; ci++) {
      if (_cribsLocalCache[ci].profile_name === name) {
        var fp = String(_cribsLocalCache[ci].profile_id).replace(/^0+/, '');
        console.log('[MAIL-CRIBS] Found by name:', name, '->', fp);
        if (cb) { try { cb(fp); } catch (e) { console.log('[MAIL-CRIBS] Error in callback:', e); } }
        return true;
      }
    }
  }
  return false;
}

function showCribsForMailContact(isMe, msgText, header, senderName) {
  if (typeof fetchCribsForProfile !== 'function') return;
  // Clear overlay to prevent stale data from previous client
  fetchCribsForProfile(null);
  // 1. Try numeric ID from DOM
  var pid = extractProfileIdFromMail(msgText, header, false);
  if (pid) { setTimeout(function () { fetchCribsForProfile(pid); }, 300); return; }
  // 2. For incoming: search CRIBS cache by sender name
  if (!isMe) {
    if (findCribsByName(senderName, function (fp) { fetchCribsForProfile(fp); })) return;
    if (typeof cribLoadOrRefresh === 'function') {
      cribLoadOrRefresh(false).then(function () {
        if (findCribsByName(senderName, function (fp) { fetchCribsForProfile(fp); })) {
          console.log('[MAIL-CRIBS] Sender found in CRIBS after refresh');
        } else {
          console.log('[MAIL-CRIBS] Not in CRIBS:', senderName);
        }
      });
    }
    return;
  }
  // 3. For outgoing: try Eater's client ID from chat context
  if (window._lastCribsPid) { fetchCribsForProfile(window._lastCribsPid); return; }
  if (window._cribsChatIds && window._cribsChatIds.length > 1) { fetchCribsForProfile(window._cribsChatIds[1]); return; }
  // 4. For outgoing: extract recipient name from send-wrap
  var recipientEl = document.querySelector('.send-title .name.text, [data-test-id*="send-title"] .name, .send-wrap .name');
  if (recipientEl) {
    var recipientName = (recipientEl.textContent || '').trim();
    console.log('[MAIL-CRIBS] Outgoing mail recipient:', recipientName);
    if (recipientName) {
      console.log('[MAIL-CRIBS] About to search CRIBS by name:', recipientName);
      if (findCribsByName(recipientName, function (fp) { fetchCribsForProfile(fp); })) { console.log('[MAIL-CRIBS] findCribsByName returned true'); return; }
      if (typeof cribLoadOrRefresh === 'function') {
        cribLoadOrRefresh(false).then(function () {
          if (findCribsByName(recipientName, function (fp) { fetchCribsForProfile(fp); })) {
            console.log('[MAIL-CRIBS] Recipient found in CRIBS after refresh');
          } else {
            console.log('[MAIL-CRIBS] Recipient not in CRIBS:', recipientName);
          }
        });
      }
      return;
    }
    console.log('[MAIL-CRIBS] No recipient element found for outgoing mail');
  }
  console.log('[MAIL-CRIBS] No client ID available for outgoing mail');
}

function findPrecedingMailHeader(msgText) {
  console.log('[MAIL-CRIBS] findPrecedingMailHeader for', msgText.className);
  // Only search within mail context (max 2 levels up)
  // 1. Previous sibling
  let prev = msgText.previousElementSibling;
  if (prev && prev.matches && prev.matches(TALK_Y.MAIL_HEADER)) { console.log('[MAIL-CRIBS] found as prev sibling'); return prev; }
  // 2. Inside previous sibling
  if (prev) {
    var inner = prev.querySelector(TALK_Y.MAIL_HEADER);
    if (inner) { console.log('[MAIL-CRIBS] found inside prev sibling'); return inner; }
  }
  // 3. Parent's other children (siblings within same parent)
  const parent = msgText.parentElement;
  if (parent) {
    const kids = Array.from(parent.children);
    const idx = kids.indexOf(msgText);
    for (let i = idx - 1; i >= 0; i--) {
      if (kids[i].matches && kids[i].matches(TALK_Y.MAIL_HEADER)) { console.log('[MAIL-CRIBS] found as parent child'); return kids[i]; }
    }
    // Also check inside parent siblings
    for (let i = idx - 1; i >= 0; i--) {
      var inner2 = kids[i].querySelector(TALK_Y.MAIL_HEADER);
      if (inner2) { console.log('[MAIL-CRIBS] found inside parent sibling'); return inner2; }
    }
  }
  // 4. Grandparent's children — only if gp contains a mail-header
  const gp = parent ? parent.parentElement : null;
  if (gp && gp.querySelector(TALK_Y.MAIL_HEADER)) {
    const gpKids = Array.from(gp.children);
    const pIdx = gpKids.indexOf(parent);
    for (let i = pIdx - 1; i >= 0; i--) {
      if (gpKids[i].matches && gpKids[i].matches(TALK_Y.MAIL_HEADER)) { console.log('[MAIL-CRIBS] found as gp child'); return gpKids[i]; }
      var inner3 = gpKids[i].querySelector(TALK_Y.MAIL_HEADER);
      if (inner3) { console.log('[MAIL-CRIBS] found inside gp sibling'); return inner3; }
    }
  }
  console.log('[MAIL-CRIBS] NO mail-header found for message-text');
  return null;
}

// ============ 🎭 CAPTURE BUTTON (OUTGOING) ============
function injectCaptureButton(observer, msgText, header) {
  if (observer.querySelector('.tess-mail-capture-trigger')) return;

  var capturedText = extractMailText(msgText);
  var alreadyCaptured = capturedText && capturedLetterCache.has(capturedText.trim().slice(0, 300));

  const trigger = document.createElement('span');
  trigger.className = 'tess-mail-capture-trigger';
  trigger.textContent = alreadyCaptured ? '✅' : '🎭';
  trigger.title = alreadyCaptured ? 'Estilo ya capturado' : 'Capturar estilo de carta';
  Object.assign(trigger.style, {
    cursor: 'pointer',
    fontSize: '14px',
    marginLeft: '6px',
    display: 'inline-block',
    opacity: '0.5',
    transition: 'opacity 0.2s',
    verticalAlign: 'middle'
  });
  trigger.onmouseenter = function () { this.style.opacity = '1'; };
  trigger.onmouseleave = function () { this.style.opacity = '0.5'; };
  trigger.onclick = function (e) {
    e.stopPropagation();
    if (this._processing) return;
    if (alreadyCaptured) { showTessToast('📬 Estilo ya capturado anteriormente', 'info'); return; }
    if (!capturedText) { showTessToast('⚠ No se encontró texto de la carta', 'warning'); return; }
    this._processing = true;
    this.style.opacity = '0.3';
    // Determine the client profile (recipient for outgoing, sender for incoming)
    var profileId = null;
    var profileName = '';
    var senderName = (header.querySelector(TALK_Y.MAIL_HEADER_NAME) || {}).textContent || '';
    if (senderName.trim() === TALK_Y.MAIL_OPERATOR_NAME) {
      // Outgoing mail → capture to RECIPIENT's CRIBS entry
      var recipientEl = document.querySelector('.send-title .name.text, [data-test-id*="send-title"] .name, .send-wrap .name');
      if (recipientEl) profileName = (recipientEl.textContent || '').trim();
      if (profileName && typeof _cribsLocalCache !== 'undefined' && _cribsLocalCache) {
        for (var ci = 0; ci < _cribsLocalCache.length; ci++) {
          if (_cribsLocalCache[ci].profile_name === profileName) {
            profileId = String(_cribsLocalCache[ci].profile_id).replace(/^0+/, '');
            break;
          }
        }
      }
    }
    if (!profileId) {
      profileId = extractProfileIdFromMail(msgText, header, true);
    }
    if (!profileId) { showTessToast('⚠ No se pudo identificar el perfil', 'warning'); this._processing = false; this.style.opacity = '0.5'; return; }
    if (!profileName) {
      var avatar = header.querySelector('img[alt]:not([alt=""])');
      if (avatar) profileName = (avatar.alt || '').trim();
      if (!profileName) {
        var nameEl = header.querySelector(TALK_Y.MAIL_HEADER_NAME);
        if (nameEl) profileName = (nameEl.textContent || '').trim();
      }
      if (profileName === TALK_Y.MAIL_OPERATOR_NAME) profileName = '';
    }
    sendLetterStyleToCribs(profileId, capturedText, profileName).then(function () {
      trigger._processing = false;
      trigger.style.opacity = '0.5';
      capturedLetterCache.add(capturedText.trim().slice(0, 300));
      trigger.textContent = '✅';
      trigger.title = 'Estilo ya capturado';
    });
  };

  observer.appendChild(trigger);
  console.log('[MAIL-CRIBS] ' + (alreadyCaptured ? '✅' : '🎭') + ' button added' + (alreadyCaptured ? ' (already captured)' : ''));
}

// ============ 🤖 RESPONSE BUTTON (INCOMING) ============
function injectResponseButton(observer, msgText, header, senderName) {
  if (observer.querySelector('.tess-mail-gen-trigger')) return;

  const trigger = document.createElement('span');
  trigger.className = 'tess-mail-gen-trigger';
  trigger.textContent = '🤖';
  trigger.title = 'Generar respuesta con IA';
  Object.assign(trigger.style, {
    cursor: 'pointer',
    fontSize: '14px',
    marginLeft: '6px',
    display: 'inline-block',
    opacity: '0.5',
    transition: 'opacity 0.2s',
    verticalAlign: 'middle'
  });
  trigger.onmouseenter = function () { this.style.opacity = '1'; };
  trigger.onmouseleave = function () { this.style.opacity = '0.5'; };
  trigger.onclick = function (e) {
    e.stopPropagation();
    var profileId = extractProfileIdFromMail(msgText, header, false);
    if (!profileId) { showTessToast('⚠ No se pudo identificar el perfil', 'warning'); return; }
    this.textContent = '⏳';
    trigger.style.opacity = '1';
    generateMailResponse(msgText, observer, profileId, senderName).then(function () {
      trigger.textContent = '✓';
      setTimeout(function () { trigger.textContent = '🤖'; }, 2000);
    });
  };

  observer.appendChild(trigger);
  console.log('[MAIL-CRIBS] 🤖 button added for', senderName);
}

// ============ AI RESPONSE GENERATION ============
async function generateMailResponse(msgText, observer, profileId, senderName) {
  const receivedText = extractMailText(msgText);
  if (!receivedText || receivedText.length < 5) {
    if (typeof showTessToast === 'function') showTessToast('⚠ No se encontró el texto de la carta', 'warning');
    return;
  }

  await cribLoadOrRefresh(false);
  const entry = cribFindEntry(profileId);
  if (!entry || !entry._id) {
    if (typeof showTessToast === 'function') showTessToast('⚠ Perfil no encontrado en CRIBS', 'warning');
    return;
  }

  const token = await new Promise(function (r) { chrome.storage.local.get('tess_jwt', function (d) { r(d.tess_jwt); }); });
  if (!token) { showTessToast('⚠ No hay sesión activa', 'warning'); return; }

  const profileInfo = [
    entry.profile_name ? 'Nombre: ' + entry.profile_name : '',
    entry.country ? 'País: ' + entry.country : '',
    entry.age ? 'Edad: ' + entry.age : '',
    entry.interests ? 'Intereses: ' + entry.interests : '',
    entry.bio ? 'Bio: ' + entry.bio : ''
  ].filter(Boolean).join('\n');

  const letterStyle = entry.letter_style || '';
  var styleHint = '';
  if (letterStyle) {
    var styleLines = letterStyle.split('\n').filter(function (l) { return l.trim(); });
    if (styleLines.length > 0) {
      styleHint = '\n\nEste es tu estilo de escritura en cartas anteriores (emula exactamente este tono, formato y manera de expresarte):\n' + styleLines.slice(-3).join('\n');
    }
  }

  const systemMsg = 'Eres un asistente de cartas para una plataforma de citas. Responde a la carta recibida de forma personal, cálida y natural. '
    + 'Usa el mismo tono y estilo que el operador usa en sus cartas (se proporciona abajo). '
    + 'La carta debe tener al menos 5000 caracteres. Responde solo con el mensaje, sin explicaciones ni introducciones.'
    + styleHint;

  const userMsg = 'Perfil del destinatario:\n' + profileInfo + '\n\nCarta recibida:\n' + receivedText.slice(0, 1500)
    + '\n\nGenera una respuesta personal a esta carta usando el estilo del operador.';

  try {
    const res = await fetch(TESSERACT_API + '/api/chatgpt/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({
        messages: [{ role: 'system', content: systemMsg }, { role: 'user', content: userMsg }],
        max_tokens: 2000,
        temperature: 0.7
      })
    });
    if (!res.ok) { showTessToast('⚠ Error de API (' + res.status + ')', 'error'); return; }
    const data = await res.json();
    const response = data.choices?.[0]?.message?.content;
    if (!response) { showTessToast('⚠ No se pudo generar respuesta', 'warning'); return; }

    // Inject into compose area
    var input = (typeof findEmailInput === 'function' ? findEmailInput() : null)
      || (typeof findChatInput === 'function' ? findChatInput() : null)
      || document.querySelector(TALK_Y.EMAIL_TEXTAREA)
      || document.querySelector(TALK_Y.CHAT_TEXTAREA)
      || document.querySelector('textarea');
    if (input) {
      if (typeof typeIntoEmailInput === 'function') {
        typeIntoEmailInput(input, response);
      } else {
        input.value = response;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }
      showTessToast('✉ Respuesta generada en el editor', 'success');
    } else {
      showTessToast('⚠ No se encontró el editor de carta', 'warning');
    }
  } catch (e) {
    console.log('[MAIL-CRIBS] Error generating response:', e.message);
    showTessToast('⚠ Error de conexión', 'error');
  }
}

// ============ TEXT EXTRACTION ============
function extractMailText(msgText) {
  var clone = msgText.cloneNode(true);
  var triggers = clone.querySelectorAll('.tess-mail-capture-trigger, .tess-mail-gen-trigger');
  for (var i = 0; i < triggers.length; i++) { triggers[i].remove(); }
  var fullText = (clone.textContent || '').trim();
  if (fullText.length > 10) return fullText;
  var obs2 = clone.querySelector('.observer');
  if (obs2) {
    var t2 = (obs2.textContent || '').trim();
    if (t2.length > 10) return t2;
  }
  var ptags = clone.querySelectorAll('p');
  for (var j = 0; j < ptags.length; j++) {
    var tp = (ptags[j].textContent || '').trim();
    if (tp.length > 10) return tp;
  }
  return fullText.length > 5 ? fullText : null;
}

// ============ STYLE CAPTURE ============
async function sendLetterStyleToCribs(profileId, text, profileName) {
  if (!_tessJwtCache) {
    await new Promise(function (r) { chrome.storage.local.get('tess_jwt', function (d) { _tessJwtCache = d.tess_jwt || ''; r(); }); });
  }
  if (!_tessJwtCache) { showTessToast('⚠ No hay sesión activa', 'warning'); return; }

  // 1. Fetch cribs list directly from API (bypass local cache to avoid stale data)
  var entry = await fetchCribEntryFromApi(profileId);
  if (!entry) {
    console.log('[MAIL-CRIBS] Profile not in CRIBS on server, cannot save letter style');
    if (typeof showTessToast === 'function') showTessToast('⚠ Perfil no encontrado en CRIBS. Agrégalo desde el dashboard.', 'warning');
    return;
  }

  // 2. Check if text already saved (server-side dedup)
  const existing = entry.letter_style || '';
  const lines = existing ? existing.split('\n').filter(function (l) { return l.trim(); }) : [];
  var textTrimmed = text.trim();
  var alreadyExists = false;
  for (var li = 0; li < lines.length; li++) {
    if (lines[li] === textTrimmed || lines[li].indexOf(textTrimmed.slice(0, 200)) === 0) { alreadyExists = true; break; }
  }
  if (alreadyExists) {
    console.log('[MAIL-CRIBS] Text already exists in letter_style, skipping');
    showTessToast('📬 Texto ya capturado anteriormente', 'info');
    return;
  }

  // 3. Save letter_style
  lines.push(textTrimmed);
  if (lines.length > 50) lines = lines.slice(-50);
  const newStyle = lines.join('\n');
  const headers = { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + _tessJwtCache };
  try {
    console.log('[MAIL-CRIBS] Saving letter_style to', entry._id, '(' + text.trim().length + ' chars)');
    const res = await fetch(TESSERACT_API + '/api/tess/cribs/' + entry._id + '/bulk', {
      method: 'PUT',
      headers: headers,
      body: JSON.stringify({ letter_style: newStyle })
    });
    if (res.ok) {
      // Update local cache for overlay
      entry.letter_style = newStyle;
      if (typeof cribFindEntry === 'function' && typeof cribLoadOrRefresh === 'function') {
        await cribLoadOrRefresh(true);
      }
      if (typeof cribsOverlayData !== 'undefined' && cribsOverlayData) {
        if (cribsOverlayData._id === entry._id) cribsOverlayData.letter_style = newStyle;
        else cribsOverlayData = entry;
        if (typeof renderCribsOverlay === 'function') renderCribsOverlay(cribsOverlayData);
      }
      console.log('[MAIL-CRIBS] Letter style saved for', profileId, '(' + lines.length + '/50)');
      showTessToast('📬 Estilo de carta capturado', 'success');
    } else {
      var errText = await res.text().catch(function () { return 'Unknown error'; });
      console.log('[MAIL-CRIBS] Bulk PUT error:', res.status, errText);
      showTessToast('⚠ Error al guardar estilo (' + res.status + ')', 'error');
    }
  } catch (e) {
    console.log('[MAIL-CRIBS] Error saving letter style:', e.message);
    showTessToast('⚠ Error de conexión al guardar', 'error');
  }
}

async function fetchCribEntryFromApi(profileId) {
  var rawTarget = String(profileId).replace(/^0+/, '');
  console.log('[MAIL-CRIBS] fetchCribEntryFromApi for', rawTarget);
  var retried = false;
  function doFetch(token) {
    return fetch(TESSERACT_API + '/api/tess/cribs', {
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token }
    }).then(function (r) {
      if (r.status === 401 && !retried) {
        retried = true;
        return new Promise(function (resolve) {
          chrome.storage.local.get('tess_jwt', function (d) { _tessJwtCache = d.tess_jwt || ''; resolve(doFetch(_tessJwtCache)); });
        });
      }
      return r.json();
    }).then(function (resp) {
      console.log('[MAIL-CRIBS] Cribs API response keys:', resp ? Object.keys(resp).join(',') : 'null');
      if (resp && resp.cribs && Array.isArray(resp.cribs)) {
        console.log('[MAIL-CRIBS] Total cribs:', resp.cribs.length);
        var debugIds = resp.cribs.map(function (c) { return JSON.stringify({_id:c._id, pid:c.profile_id, type:typeof c.profile_id, name:c.profile_name}); });
        console.log('[MAIL-CRIBS] Cribs in API:', JSON.stringify(debugIds));
        for (var i = 0; i < resp.cribs.length; i++) {
          var storedId = String(resp.cribs[i].profile_id).replace(/^0+/, '');
          if (storedId === rawTarget) {
            console.log('[MAIL-CRIBS] Found matching entry:', resp.cribs[i]._id);
            return resp.cribs[i];
          }
        }
        console.log('[MAIL-CRIBS] Profile', rawTarget, 'not found in cribs list');
      } else {
        console.log('[MAIL-CRIBS] Invalid API response - no cribs array');
      }
      return null;
    });
  }
  try {
    return await doFetch(_tessJwtCache);
  } catch (e) {
    console.log('[MAIL-CRIBS] Error fetching cribs:', e.message);
    return null;
  }
}

// ============ PROFILE ID EXTRACTION ============
function extractProfileIdFromMail(msgText, header, preferOperator) {
  // 1. Check data attributes on header and its children
  let id = header.getAttribute('data-id') || header.getAttribute('data-user-id') || header.getAttribute('data-profile-id') || header.getAttribute('data-member-id');
  if (id && /^\d{6,15}$/.test(id)) return id.replace(/^0+/, '');
  const dataEl = header.querySelector('[data-id], [data-user-id], [data-member-id], [data-profile-id]');
  if (dataEl) {
    id = dataEl.getAttribute('data-id') || dataEl.getAttribute('data-user-id') || dataEl.getAttribute('data-member-id') || dataEl.getAttribute('data-profile-id');
    if (id && /^\d{6,15}$/.test(id)) return id.replace(/^0+/, '');
  }
  // 2. Check document.body / documentElement data attributes
  const bodyAttrs = ['data-user-id', 'data-profile-id', 'data-member-id', 'data-id', 'data-uid'];
  for (const a of bodyAttrs) {
    const v = document.body.getAttribute(a) || document.documentElement.getAttribute(a);
    if (v && /^\d{6,15}$/.test(v)) return v.replace(/^0+/, '');
  }
  // 3. Check for onClick/openProfile data on wrapper
  const wrapper = header.querySelector('[data-test-id*="user-page"], [onclick*="profile"], [onclick*="openProfile"]');
  if (wrapper) {
    const onclick = wrapper.getAttribute('onclick') || '';
    const match = onclick.match(/\b(\d{6,15})\b/);
    if (match) return match[1].replace(/^0+/, '');
  }
  // 4. Check header links to profile
  const links = header.querySelectorAll('a[href*="/profile/"], a[href*="/user/"], a[href*="/member/"]');
  for (const link of links) {
    const href = link.href || link.getAttribute('href') || '';
    const match = href.match(/\/(\d{6,15})(?:[/?#]|$)/);
    if (match) return match[1].replace(/^0+/, '');
  }
  // 5. Check avatar image src for numeric ID
  const imgs = header.querySelectorAll('img.avatar__photo, img[class*="avatar"], img[src*="gstatvb"]');
  for (const img of imgs) {
    const src = img.getAttribute('src') || '';
    var m = src.match(/[./](\d{6,15})[./]/);
    if (m) return m[1].replace(/^0+/, '');
    m = src.match(/[./](\d{6,15})\./);
    if (m) return m[1].replace(/^0+/, '');
  }
  // 6. Check msgText images
  const allImgs = msgText.querySelectorAll('img[src]');
  for (const img of allImgs) {
    const src = img.getAttribute('src') || '';
    var m2 = src.match(/[./](\d{6,15})[./]/);
    if (m2) return m2[1].replace(/^0+/, '');
  }
  // 7. Search whole page for profile links with numeric IDs
  const allProfileLinks = document.querySelectorAll('a[href*="/profile/"], a[href*="/user/"], a[href*="/member/"], [onclick*="profile"]');
  for (const link of allProfileLinks) {
    const href = link.href || link.getAttribute('onclick') || link.getAttribute('href') || '';
    var m3 = href.match(/\/(\d{6,15})(?:[/?#]|$)/);
    if (m3) return m3[1].replace(/^0+/, '');
  }
  // 8. URL patterns with two IDs: /chat/{op}_{client} or /mails/{op}_{client} etc.
  var pairMatch = location.href.match(/\/(?:chat|mail|mails|messages)\/(\d{6,15})_(\d{6,15})/);
  if (pairMatch) {
    console.log('[MAIL-CRIBS] URL pair match:', pairMatch[1], pairMatch[2]);
    return pairMatch[2].replace(/^0+/, '');
  }
  // 9. URL mail patterns
  var urlMatch = location.href.match(/\/mails?\/(\d{6,15})/);
  if (urlMatch) return urlMatch[1].replace(/^0+/, '');
  var urlMatch2 = location.href.match(/\/(?:profile|user|member|u|id)\/(\d{6,15})/i);
  if (urlMatch2) return urlMatch2[1].replace(/^0+/, '');
  var urlMatch3 = location.href.match(/\/(\d{6,15})(?:[/?#]|$)/);
  if (urlMatch3) return urlMatch3[1].replace(/^0+/, '');
  // 10. Use Eater's detected profile ID if available
  // For outgoing (🎭): prefer operator ID from chat context or storage
  if (preferOperator) {
    if (window._cribsChatIds && window._cribsChatIds[0]) {
      console.log('[MAIL-CRIBS] Using operator ID from chat:', window._cribsChatIds[0]);
      return window._cribsChatIds[0].replace(/^0+/, '');
    }
    if (window._tessOperatorId) {
      console.log('[MAIL-CRIBS] Using operator ID from window:', window._tessOperatorId);
      return String(window._tessOperatorId).replace(/^0+/, '');
    }
  }
  if (window._lastCribsPid) return window._lastCribsPid.replace(/^0+/, '');
  if (window._cribsChatIds && window._cribsChatIds.length > 1) return window._cribsChatIds[1].replace(/^0+/, '');
  console.log('[MAIL-CRIBS] Could not extract profileId');
  return null;
}

// ============ INIT ============
async function initMailCribs() {
  await loadMailCribsConfig();
  if (mailCribsConfig.enabled) startMailCribsObserver();
  console.log('[MAIL-CRIBS] Module initialized, enabled:', mailCribsConfig.enabled);
}

// ============ GLOBAL ACCESSORS ============
window._setMailCribsEnabled = setMailCribsEnabled;
window._getMailCribsConfig = () => mailCribsConfig;
window._initMailCribs = initMailCribs;
window._startMailCribsObserver = startMailCribsObserver;
window._stopMailCribsObserver = stopMailCribsObserver;
window._captureLetterStyle = sendLetterStyleToCribs;

// Auto-init on page load (no panel dependency)
(function autoInitMailCribs() {
  function init() {
    chrome.storage.local.get('tess_operator_id', function (d) { if (d.tess_operator_id) window._tessOperatorId = d.tess_operator_id; });
    loadMailCribsConfig().then(function () { if (mailCribsConfig.enabled) startMailCribsObserver(); console.log('[MAIL-CRIBS] Auto-init, enabled:', mailCribsConfig.enabled); });
  }
  if (document.readyState === 'complete' || document.readyState === 'interactive') { setTimeout(init, 1000); }
  else { document.addEventListener('DOMContentLoaded', function () { setTimeout(init, 1000); }); }
})();
