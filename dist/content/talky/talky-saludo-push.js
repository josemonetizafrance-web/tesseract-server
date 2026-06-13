// TESSERACT v24.0 - Saludo Push Module
// Barrido de saludos sobre la bandeja de contactos (pestaña Active)

const SP_STORAGE_KEY = 'tess_saludo_push_config';
const SP_CONTACTED_KEY = 'tess_sp_contacted';

let spConfig = {
  template1: '',
  template2: '',
  template3: '',
  template4: '',
  template5: '',
  maxDaily: 30,
  sentToday: 0,
  onlineOnly: false,
  modoSeguimiento: false,
  traducir: true
};
let spActive = false;
let spProcessedIds = new Set();

async function loadSPConfig() {
  try {
    const r = await chrome.storage.local.get([SP_STORAGE_KEY]);
    if (r[SP_STORAGE_KEY]) spConfig = { ...spConfig, ...r[SP_STORAGE_KEY] };
  } catch (e) {}
}

async function saveSPConfig() {
  try {
    await chrome.storage.local.set({ [SP_STORAGE_KEY]: spConfig });
  } catch (e) {}
}

function getSPMessages() {
  return [
    spConfig.template1 || 'Hola! Vi tu perfil y me pareciste interesante. Te gustaria conversar?',
    spConfig.template2 || 'Como estas? Espero que tengas un lindo dia!',
    spConfig.template3 || 'Aun sigo interesado en conocerte, te gustaria charlar un rato?',
    spConfig.template4 || 'Perdon si insisto, pero realmente me gustaria hablar contigo. Espero tu respuesta!',
    spConfig.template5 || 'Perdon por insistir tanto, solo quiero saber si te interesa conocerme.'
  ];
}

function spFindChatInput() {
  return document.querySelector(TALK_Y.CHAT_TEXTAREA_SP) || document.querySelector(TALK_Y.CHAT_TEXTAREA) || document.querySelector(TALK_Y.CHAT_INPUT_ID) || document.querySelector(TALK_Y.ANY_TEXTAREA);
}

function spFindSendBtn() {
  return document.querySelector(TALK_Y.SEND_BTN_SP) || document.querySelector(TALK_Y.SEND_BTN_CLASS) || document.querySelector(TALK_Y.SEND_BTN_ID) || document.querySelector(TALK_Y.SEND_BTN_ARIA);
}

async function spTranslate(text) {
  try {
    var token = await new Promise(function (r) { chrome.storage.local.get('tess_jwt', function (d) { r(d.tess_jwt); }); });
    if (!token) return text;
    var resp = await fetch((window.TESSERACT_API || 'https://tesseract-jblo.onrender.com') + '/api/openai/translate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({ text: text, targetLang: 'en', targetName: 'English' })
    });
    var data = await resp.json();
    if (data.success && data.data?.translations?.[0]?.text) return data.data.translations[0].text;
    if (data.translatedText) return data.translatedText;
  } catch (e) { console.warn('[SP] Translation error:', e.message); }
  return text;
}

async function spTypeAndSend(text, translated) {
  var input = spFindChatInput();
  if (!input) return false;
  input.removeAttribute('disabled');
  input.disabled = false;
  input.value = text;
  input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
  await sleep(600);
  var form = input.closest('form');
  if (form) {
    try { form.requestSubmit(); return true; } catch (e) {}
  }
  var sendBtn = spFindSendBtn();
  if (sendBtn) {
    sendBtn.removeAttribute('disabled');
    sendBtn.disabled = false;
    sendBtn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
    sendBtn.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true }));
    sendBtn.click();
    return true;
  }
  return false;
}

function spConversationDepth() {
  return document.querySelectorAll('.tu-message-wrapper.dialog-message').length;
}

function spMessageAlreadySent(text) {
  var msgs = document.querySelectorAll('.tu-message-wrapper.dialog-message');
  for (var i = 0; i < msgs.length; i++) {
    var content = (msgs[i].textContent || '').trim().toLowerCase();
    if (content.indexOf(text.toLowerCase()) !== -1) return true;
  }
  return false;
}

async function spWaitForInput(timeoutMs) {
  var start = Date.now();
  while (Date.now() - start < timeoutMs) {
    var input = spFindChatInput();
    if (input && !input.disabled) return input;
    await sleep(300);
  }
  var input = spFindChatInput();
  if (input) {
    input.removeAttribute('disabled');
    input.disabled = false;
  }
  return input || null;
}

async function spGetMsgCount() {
  try {
    var el = document.querySelector('.counter span.counter-success, [data-type="Chat"] span.counter-success, .counter span');
    if (el) {
      var n = parseInt((el.textContent || '').trim(), 10);
      if (!isNaN(n)) return n;
    }
  } catch (e) {}
  return 0;
}

async function spScrollAndCollect(list) {
  var all = [];
  var seen = new Set();
  for (var pg = 0; pg < 20; pg++) {
    var items = list.querySelectorAll(TALK_Y.DIALOG_LISTITEM);
    for (var ii = 0; ii < items.length; ii++) {
      var id = (items[ii].querySelector(TALK_Y.DIALOG_AVATAR) || {}).id;
      if (id && !seen.has(id)) { seen.add(id); all.push(items[ii]); }
    }
    if (items.length < 200) {
      list.scrollTop = list.scrollHeight;
      await sleep(800);
      var newItems = list.querySelectorAll(TALK_Y.DIALOG_LISTITEM);
      if (newItems.length === items.length) break;
    } else break;
  }
  return all;
}

async function spIsProfileContacted(profileId) {
  try {
    var data = await chrome.storage.local.get([SP_CONTACTED_KEY]);
    var history = data[SP_CONTACTED_KEY] || {};
    return !!history[String(profileId)];
  } catch (e) { return false; }
}

async function spMarkProfileContacted(profileId, templateIdx) {
  try {
    var data = await chrome.storage.local.get([SP_CONTACTED_KEY]);
    var history = data[SP_CONTACTED_KEY] || {};
    var key = String(profileId);
    if (!history[key]) history[key] = [];
    if (history[key].indexOf(templateIdx) === -1) history[key].push(templateIdx);
    await chrome.storage.local.set({ [SP_CONTACTED_KEY]: history });
  } catch (e) {}
}

async function spGetSentTemplates(profileId) {
  try {
    var data = await chrome.storage.local.get([SP_CONTACTED_KEY]);
    var history = data[SP_CONTACTED_KEY] || {};
    return history[String(profileId)] || [];
  } catch (e) { return []; }
}

async function executeSaludoPush() {
  if (spActive) return;
  spActive = true;
  spProcessedIds = new Set();
  updateSPUI();

  await loadSPConfig();

  if (spConfig.maxDaily > 0 && spConfig.sentToday >= spConfig.maxDaily) {
    console.log('[SP] Limite diario alcanzado');
    spActive = false;
    updateSPUI();
    showTessToast('Limite diario de saludos alcanzado (' + spConfig.maxDaily + ')', 'warning');
    return;
  }

  var activeTab = document.querySelector(TALK_Y.DIALOG_TAB_BY_ID('active'));
  if (activeTab && activeTab.getAttribute('data-isselected') !== 'true') {
    activeTab.click();
    await sleep(1000);
  }

  if (spConfig.onlineOnly) {
    var onlineToggle = document.querySelector(TALK_Y.DIALOG_ONLINE_TOGGLE);
    if (onlineToggle && !onlineToggle.checked) {
      onlineToggle.click();
      await sleep(500);
    }
  }

  var list = document.querySelector(TALK_Y.DIALOG_LIST);
  if (!list) {
    console.log('[SP] No se encontro la lista de dialogos');
    spActive = false;
    updateSPUI();
    showTessToast('No se encontro la lista de contactos. Abre la pagina de mensajes.', 'error');
    return;
  }

  var items = await spScrollAndCollect(list);
  if (items.length === 0) {
    console.log('[SP] No hay contactos en la lista');
    spActive = false;
    updateSPUI();
    showTessToast('No hay contactos visibles en la lista', 'warning');
    return;
  }

  var sent = 0;
  var messages = getSPMessages();
  var prevInput = null;

  for (var i = 0; i < items.length; i++) {
    if (!spActive) break;
    if (spConfig.maxDaily > 0 && spConfig.sentToday >= spConfig.maxDaily) break;

    var item = items[i];
    var avatar = item.querySelector(TALK_Y.DIALOG_AVATAR);
    if (!avatar) continue;
    var profileId = avatar.id;
    if (!profileId || !/^\d{6,15}$/.test(profileId)) continue;
    if (spProcessedIds.has(profileId)) continue;
    spProcessedIds.add(profileId);

    if (typeof isBlacklisted === 'function' && isBlacklisted(profileId)) {
      console.log('[SP] Saltado (blacklist):', profileId);
      continue;
    }

    if (typeof isPinnedOrSaved === 'function' && isPinnedOrSaved(item)) {
      console.log('[SP] Saltado (pinned/saved):', profileId);
      continue;
    }

    if (await spIsProfileContacted(profileId)) {
      console.log('[SP] Ya contactado previamente, saltando:', profileId);
      continue;
    }

    var clickTarget = item.querySelector(TALK_Y.DIALOG_GO_TO_CHAT);
    if (!clickTarget) continue;
    clickTarget.click();
    await sleep(1500);

    var input = await spWaitForInput(5000);
    if (!input) {
      console.log('[SP] No se encontro input de chat para:', profileId);
      continue;
    }

    if (input === prevInput) {
      console.log('[SP] Chat no cambio - navegacion fallida, saltando:', profileId);
      continue;
    }
    prevInput = input;

    var depth = spConversationDepth();
    if (spConfig.modoSeguimiento) {
      if (depth <= 2) {
        console.log('[SP] Seguimiento activo - pocos mensajes (' + depth + '), saltando:', profileId);
        continue;
      }
    } else {
      if (depth > 2) {
        console.log('[SP] Conversacion con', depth, 'mensajes - saltando:', profileId);
        continue;
      }
    }

    var maxMsg = 10;
    var curMsg = await spGetMsgCount();
    var room = Math.max(0, maxMsg - curMsg);
    if (room <= 0) {
      console.log('[SP] Contacto sin espacio (' + curMsg + '/' + maxMsg + '), saltando:', profileId);
      if (input && input.value) { input.value = ''; input.dispatchEvent(new Event('input', { bubbles: true })); }
      continue;
    }

    var sentTemplates = await spGetSentTemplates(profileId);
    var ok = true;
    var msgsToSend = Math.min(messages.length, room);
    for (var mi = 0; mi < msgsToSend; mi++) {
      if (!spActive) break;
      if (spConfig.maxDaily > 0 && spConfig.sentToday >= spConfig.maxDaily) break;

      if (sentTemplates.indexOf(mi) !== -1) {
        console.log('[SP] Mensaje ' + (mi + 1) + ' ya enviado antes a', profileId);
        continue;
      }

      if (spMessageAlreadySent(messages[mi])) {
        console.log('[SP] Mensaje ' + (mi + 1) + ' detectado en conversacion, saltando:', profileId);
        await spMarkProfileContacted(profileId, mi);
        continue;
      }

      await sleep(800 + Math.random() * 400);
      var msgText = spConfig.traducir ? await spTranslate(messages[mi]) : messages[mi];
      ok = await spTypeAndSend(msgText);
      if (!ok) {
        console.log('[SP] Error al enviar mensaje ' + (mi + 1) + ' para:', profileId);
        break;
      }
      await sleep(1200 + Math.random() * 800);

      spConfig.sentToday++;
      sent++;
      await spMarkProfileContacted(profileId, mi);
      await saveSPConfig();
      updateSPUI();
    }
    if (input && input.value) { input.value = ''; input.dispatchEvent(new Event('input', { bubbles: true })); }

    await sleep(1000 + Math.random() * 1000);
  }

  console.log('[SP] Barrido completado. Enviados:', sent);
  if (sent > 0) {
    showTessToast('Saludo Push completado: ' + sent + ' mensajes enviados', 'success');
  } else {
    showTessToast('No se enviaron saludos. Verifica blacklist y limites.', 'warning');
  }
  spActive = false;
  updateSPUI();
}

function abortSaludoPush() {
  spActive = false;
  updateSPUI();
  showTessToast('Saludo Push detenido', 'warning');
}

function updateSPUI() {
  var btn = document.getElementById('btnSPToggle');
  if (btn) {
    if (spActive) {
      btn.textContent = 'DETENER';
      btn.style.background = '#ef4444';
      btn.style.borderColor = '#ef4444';
    } else {
      btn.textContent = 'SALUDO PUSH';
      btn.style.background = 'linear-gradient(135deg,#10b981,#059669)';
      btn.style.borderColor = '#10b981';
    }
  }
  var status = document.getElementById('spStatus');
  if (status) {
    status.textContent = spActive ? 'ACTIVO' : 'INACTIVO';
    status.style.color = spActive ? '#10b981' : '#888';
  }
  var sentEl = document.getElementById('spSentToday');
  if (sentEl) sentEl.textContent = spConfig.sentToday || 0;
}

function populateSPPanel() {
  var msgs = getSPMessages();
  document.getElementById('spTemplate1').value = msgs[0];
  document.getElementById('spTemplate2').value = msgs[1];
  document.getElementById('spTemplate3').value = msgs[2];
  document.getElementById('spTemplate4').value = msgs[3];
  document.getElementById('spTemplate5').value = msgs[4];
  document.getElementById('spMaxDaily').value = spConfig.maxDaily || 30;
  document.getElementById('spOnlineOnly').checked = spConfig.onlineOnly !== false;
  document.getElementById('spSeguimiento').checked = spConfig.modoSeguimiento === true;
  document.getElementById('spTraducir').checked = spConfig.traducir !== false;
  document.getElementById('spSentToday').textContent = spConfig.sentToday || 0;
  updateSPUI();
}

async function openSPPanel() {
  await loadSPConfig();
  populateSPPanel();
}

async function saveSPPanelConfig() {
  spConfig.template1 = document.getElementById('spTemplate1').value;
  spConfig.template2 = document.getElementById('spTemplate2').value;
  spConfig.template3 = document.getElementById('spTemplate3').value;
  spConfig.template4 = document.getElementById('spTemplate4').value;
  spConfig.template5 = document.getElementById('spTemplate5').value;
  spConfig.maxDaily = parseInt(document.getElementById('spMaxDaily').value) || 30;
  spConfig.onlineOnly = document.getElementById('spOnlineOnly').checked;
  spConfig.modoSeguimiento = document.getElementById('spSeguimiento').checked;
  spConfig.traducir = document.getElementById('spTraducir').checked;
  await saveSPConfig();
  showMLSavedFeedback();
}

window._executeSaludoPush = executeSaludoPush;
window._abortSaludoPush = abortSaludoPush;
window._openSPPanel = openSPPanel;
window._saveSPPanelConfig = saveSPPanelConfig;
window._updateSPUI = updateSPUI;
