// TESSERACT v24.0 - Core State (uses Tesseract state-manager)
const ALLOWED_DOMAIN = 'talkytimes.com';

const RESPONSE_ALERT_SECONDS = 90;
const TIMER_DISPLAY_SECONDS = 120;

// Blacklist local cache (synced with state-manager and server)
let blacklist = [];

// ============ CROSS-TAB UI SYNC ============
function _tessSyncEaterUI() {
  var ea = Tesseract.get('eaterActive');
  const btn = document.getElementById('btnEaterToggle');
  if (btn) {
    btn.textContent = '🧠 EATER: ' + (ea ? 'ON' : 'OFF');
    btn.className = 'eater-btn' + (ea ? ' on' : '');
  }
  const sug = document.getElementById('eaterSuggestions');
  if (sug) sug.style.display = ea ? 'block' : 'none';
}

function _tessSyncCloneUI() {
  var ca = Tesseract.get('clonacionActiva');
  const btn = document.getElementById('btnStopClone');
  if (!btn) return;
  if (ca) {
    btn.innerHTML = '⏹ CLONACIÓN: ACTIVA';
    btn.style.borderColor = '#ef4444';
    btn.style.background = 'rgba(239,68,68,0.15)';
    btn.style.color = '#ef4444';
  } else {
    btn.innerHTML = '▶ CLONACIÓN: DETENIDA';
    btn.style.borderColor = '#22c55e';
    btn.style.background = 'rgba(34,197,94,0.15)';
    btn.style.color = '#22c55e';
  }
}

window._tessSyncUI = function () {
  _tessSyncEaterUI();
  _tessSyncCloneUI();
};

// Sync event listeners from state-manager
Tesseract.on('eaterActiveChanged', _tessSyncEaterUI);
Tesseract.on('clonacionChanged', _tessSyncCloneUI);

// ============ BLACKLIST ============
async function loadBlacklist(retries) {
  if (retries === undefined) retries = 2;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const stored = await chrome.storage.local.get(['tess_jwt']);
      if (stored.tess_jwt) {
        const res = await fetch(Tesseract.API + '/api/tess/blacklist', {
          headers: { 'Authorization': 'Bearer ' + stored.tess_jwt }
        });
        if (!res.ok && attempt < retries) continue;
        const data = await res.json();
        blacklist = data.blacklist || [];
        console.log('[BLACKLIST] Cargada:', blacklist.length, 'contactos');
      }
      return;
    } catch (e) {
      console.log('[BLACKLIST] Error (intento ' + (attempt + 1) + '/' + (retries + 1) + '):', e.message);
      if (attempt >= retries) return;
    }
  }
}

function isBlacklisted(contactId) {
  if (!contactId) return false;
  return blacklist.indexOf(contactId) !== -1 || Tesseract.isBlacklisted(contactId);
}

async function saveBlacklist() {
  if (typeof window._addToMLBlacklist === 'function') {
    blacklist.forEach(function (id) { window._addToMLBlacklist(id); });
  }
  if (typeof window._addToAABlacklist === 'function') {
    blacklist.forEach(function (id) { window._addToAABlacklist(id); });
  }
  if (typeof window._addToLFPBlacklist === 'function') {
    blacklist.forEach(function (id) { window._addToLFPBlacklist(id); });
  }

  try {
    const stored = await chrome.storage.local.get(['tess_jwt']);
    if (stored.tess_jwt) {
      const res = await fetch(Tesseract.API + '/api/tess/blacklist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + stored.tess_jwt },
        body: JSON.stringify({ blacklist })
      });
      if (!res.ok) {
        const errText = await res.text();
        logError('blacklist', 'POST status: ' + res.status + ' - ' + errText, 'warn');
        return;
      }
      console.log('[BLACKLIST] POST OK, enviados:', blacklist.length);
      const data = await res.json();
      if (data.blacklist) blacklist = data.blacklist;
      if (typeof reloadMLBlacklist === 'function') await reloadMLBlacklist();
      if (typeof loadAABlacklist === 'function') await loadAABlacklist();
      if (typeof reloadLFPBlacklist === 'function') await reloadLFPBlacklist();
      if (typeof populateMLPanel === 'function') populateMLPanel();
    }
  } catch (e) {
    logError('blacklist', e);
  }
}

function renderBlacklistTab() {
  const listEl = document.getElementById('blList');
  const countEl = document.getElementById('blCount');
  if (!listEl) return;
  if (countEl) countEl.textContent = blacklist.length + ' contactos';

  if (blacklist.length === 0) {
    listEl.innerHTML = '<p style="color:#666;text-align:center;">No hay contactos bloqueados</p>';
    return;
  }

  listEl.innerHTML = blacklist.map(function (id, i) {
    return '<div style="display:flex;align-items:center;gap:8px;padding:6px 4px;border-bottom:1px solid rgba(139,92,246,0.15);">' +
      '<span style="color:#888;font-size:9px;width:20px;">' + (i + 1) + '</span>' +
      '<span style="flex:1;font-size:12px;font-weight:bold;letter-spacing:1px;color:#ef4444;">' + id + '</span>' +
      '<button class="bl-remove" data-idx="' + i + '" style="background:rgba(239,68,68,0.2);border:1px solid #ef4444;color:#ef4444;padding:2px 8px;border-radius:4px;cursor:pointer;font-size:9px;">✕</button>' +
      '</div>';
  }).join('');

  listEl.querySelectorAll('.bl-remove').forEach(function (btn) {
    btn.addEventListener('click', function () {
      const idx = parseInt(btn.dataset.idx);
      blacklist.splice(idx, 1);
      saveBlacklist();
      renderBlacklistTab();
    });
  });
}

loadBlacklist();

// ============ ICEBREAKERS IA ============
window._ibMessages = [];
window._ibMode = 'idle';

function renderIBPreview() {
  var container = document.getElementById('ibPreview');
  if (!container) return;
  if (!window._ibMessages || window._ibMessages.length === 0) {
    container.innerHTML = '<div style="color:#666;font-size:10px;text-align:center;padding:8px;">Genera mensajes con el bot\u00f3n \ud83c\udfb2 GENERAR</div>';
    return;
  }
  var labels = { friendship: '\ud83d\udd35 Amistad', real_love: '\u2764\ufe0f Amor Real', hot_talks: '\ud83d\udd25 Charla Caliente', mail: '\ud83d\udcec Mail' };
  var colors = { friendship: '#8b5cf6', real_love: '#ef4444', hot_talks: '#f59e0b', mail: '#10b981' };
  container.innerHTML = window._ibMessages.map(function (m, i) {
    if (m.selected === undefined) m.selected = true;
    var cat = labels[m.category] || m.category;
    var col = colors[m.category] || '#8b5cf6';
    var txt = (m.text || m.message || m.content || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    var checked = m.selected ? 'checked' : '';
    return '<div style="margin-bottom:4px;"><label style="display:flex;align-items:center;gap:6px;font-size:9px;color:' + col + ';font-weight:bold;margin-bottom:1px;cursor:pointer;"><input type="checkbox" data-idx="' + i + '" ' + checked + ' style="accent-color:' + col + ';cursor:pointer;">' + cat + '</label><textarea data-idx="' + i + '" style="width:100%;padding:4px;background:#111;border:1px solid ' + col + ';border-radius:4px;color:#e0e0e0;font-size:10px;font-family:Arial;resize:vertical;box-sizing:border-box;min-height:36px;">' + txt + '</textarea></div>';
  }).join('');
  container.removeEventListener('input', ibEditHandler);
  container.addEventListener('input', ibEditHandler);
  container.removeEventListener('change', ibCheckHandler);
  container.addEventListener('change', ibCheckHandler);
}

function ibCheckHandler(e) {
  var cb = e.target;
  if (cb.tagName !== 'INPUT' || cb.type !== 'checkbox' || cb.dataset.idx === undefined) return;
  var idx = parseInt(cb.dataset.idx);
  if (window._ibMessages && window._ibMessages[idx]) {
    window._ibMessages[idx].selected = cb.checked;
  }
}

function ibEditHandler(e) {
  var ta = e.target;
  if (ta.tagName !== 'TEXTAREA' || ta.dataset.idx === undefined) return;
  var idx = parseInt(ta.dataset.idx);
  if (window._ibMessages && window._ibMessages[idx]) {
    window._ibMessages[idx].text = ta.value;
  }
}

async function generateIcebreakersFromAI() {
  try {
    window._ibMessages = [];
    window._ibMode = 'generating';
    updateIBUI();
    var token = await new Promise(function (r) { chrome.storage.local.get('tess_jwt', function (d) { r(d.tess_jwt); }); });
    if (!token) { showTessToast('No hay sesión activa. Inicia sesión primero.', 'error'); window._ibMode = 'idle'; updateIBUI(); return; }
    var systemPrompt = 'Tu tarea es generar mensajes únicos e interesantes para romper el hielo en una plataforma de citas. Todos reflejan la vida diaria de un hombre/mujer de 30 años o más, con temas maduros, cotidianos y un toque de humor cuando encaja.\n\nCUATRO CATEGORÍAS\nRH Amistad: Rompehielos relajados, neutros y amigables. Conexión tranquila, como si empezáramos una buena amistad que podría derivar en algo más. Tono cálido, cero presión romántica explícita.\nRH Amor Real: Rompehielos con intención emocional y romántica elegante, madura y respetuosa. Se nota interés genuino en conocer a la persona a fondo y ganas de algo serio cuando surja la química.\nRH Charla Caliente: Rompehielos juguetones, coquetos y ligeramente atrevidos, pero SIN cruzar nunca la línea: nada sexual explícito, nada de insinuaciones físicas directas ni doble sentido grosero. El caliente está solo en el tono pícaro, el humor sutil y la confianza atractiva de un hombre adulto.\nRH Mail: Mensajes más largos (4-8 líneas) ideales para primer contacto privado. NO dirigidos a nadie en concreto (sin Hola [Nombre], sin referencias a fotos/perfil). Genéricos pero muy personales y auténticos, escritos en primera persona. Estructura típica: anécdota o reflexión cotidiana → toque de humor o sinceridad → pregunta abierta potente que invite a una respuesta larga.\n\nREGLAS GENERALES (aplican a las 4 categorías)\n100 % español.\nTono maduro, respetuoso, fácil de responder.\nProhibido contenido sexual explícito, obscenidades, lenguaje abusivo, preguntas invasivas o datos de contacto.\nCada mensaje completo por sí mismo, lógico y único (nada de reutilizar ideas aunque cambien palabras o emojis).\nEmojis solo si son claros y neutros. Texto plano.\nTemas: rutinas matutinas, trabajo-vida, cocina, gimnasio, viajes, música/podcasts, desconexión, responsabilidades adultas, lugares favoritos, reflexiones con humor, etc.\nLÍMITES DE LONGITUD: Los mensajes friendship, real_love y hot_talks deben tener máximo 280 caracteres. Los mensajes mail deben tener 4-8 líneas.\n\nFORMATO DE RESPUESTA: Responde ÚNICAMENTE con un array JSON de 5 objetos. Cada objeto debe tener "text" (string, el mensaje) y "category" (string: "friendship", "real_love", "hot_talks" o "mail"). No agregues explicaciones, markdown ni nada fuera del JSON.';
    var res = await fetch(Tesseract.API + '/api/chatgpt/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({ messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: 'Genera 5 mensajes en formato JSON: 1 friendship, 1 real_love, 1 hot_talks, 2 mail.' }], max_tokens: 1500, temperature: 0.8 })
    });
    var data = await res.json();
    var content = data.choices?.[0]?.message?.content || '';
    console.log('[IB] Raw AI response (first 500):', content.substring(0, 500));
    var jsonMatch = content.match(/```(?:json)?\s*(\[[\s\S]*?\])\s*```/);
    if (jsonMatch) jsonMatch = jsonMatch[1];
    else jsonMatch = content.match(/\[[\s\S]*\]/);
    if (!jsonMatch) { showTessToast('Error: la IA no devolvió JSON válido. Revisa la consola (F12).', 'error'); window._ibMode = 'idle'; updateIBUI(); return; }
    var parsed = JSON.parse(jsonMatch);
    if (!Array.isArray(parsed) || parsed.length < 5) { showTessToast('Error: la IA devolvió menos de 5 mensajes', 'error'); window._ibMode = 'idle'; updateIBUI(); return; }
    window._ibMessages = parsed.map(function(m) {
      if (!m) return null;
      if (!m.text) m.text = m.mensaje || m.message || m.content || m.texto || '';
      if (!m.category) m.category = m.categoria || m.type || m.tipo || 'friendship';
      m.category = m.category.toLowerCase();
      return m;
    }).filter(Boolean);
    window._ibMode = 'ready';
    renderIBPreview();
    updateIBUI();
    showTessToast('5 Icebreakers generados correctamente', 'success');
  } catch (e) {
    console.error('[IB] Error generando:', e);
    showTessToast('Error al generar Icebreakers: ' + e.message, 'error');
    window._ibMode = 'idle';
    updateIBUI();
  }
}

async function sleep(ms) {
  return new Promise(function (r) { setTimeout(r, ms); });
}

async function translateTextToEnglish(text) {
  try {
    var token = await new Promise(function (r) { chrome.storage.local.get('tess_jwt', function (d) { r(d.tess_jwt); }); });
    var headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = 'Bearer ' + token;
    var resp = await fetch(Tesseract.API + '/api/openai/translate', {
      method: 'POST',
      headers: headers,
      body: JSON.stringify({ text: text, targetLang: 'en', targetName: 'English' })
    });
    var data = await resp.json();
    if (data.success && data.data?.translations?.[0]?.text) return data.data.translations[0].text;
    if (data.translatedText) return data.translatedText;
  } catch (e) { console.warn('[IB] Translation error:', e.message); }
  return text;
}

async function executeIcebreakerSweep() {
  if (!window._ibMessages || window._ibMessages.length < 5) {
    showTessToast('Primero genera los mensajes con 🎲 GENERAR', 'warning');
    return;
  }
  if (window._ibMode === 'sending') return;
  window._ibMode = 'sending';
  updateIBUI();
  var toSend = window._ibMessages.filter(function(m) { return m.selected !== false; });
  if (toSend.length === 0) {
    showTessToast('Selecciona al menos un Icebreaker para enviar', 'warning');
    window._ibMode = 'idle'; updateIBUI(); return;
  }
  document.getElementById('ibStatus').textContent = 'Traduciendo al ingl\u00e9s\u2026';
  var translated = [];
  for (var ti = 0; ti < toSend.length; ti++) {
    var tResult = await translateTextToEnglish(toSend[ti].text);
    translated.push({ category: toSend[ti].category, text: tResult || toSend[ti].text, selected: toSend[ti].selected });
  }
  window._ibMessages = toSend = translated;
  renderIBPreview();
  var total = toSend.length;
  document.getElementById('ibStatus').textContent = 'Enviando 1/' + total + '\u2026';
  try {
    var link = document.querySelector(TALK_Y.ICEBREAKER_SIDEBAR_LINK);
    if (link && !document.querySelector('.sidebar-statistics .accordion__header')?.classList.contains('active')) {
      link.click();
      await sleep(800);
    }
    for (var i = 0; i < toSend.length; i++) {
      if (window._ibMode !== 'sending') break;
      var msg = toSend[i];
      document.getElementById('ibStatus').textContent = 'Enviando ' + (i + 1) + '/' + total + '\u2026';
      var createBtn = document.evaluate('//label[.//p[contains(text(),"create new")]]', document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
      if (!createBtn) {
        createBtn = document.querySelector(TALK_Y.ICEBREAKER_CREATE_NEW);
      }
      if (!createBtn) { showTessToast('No se encontró el botón Create new en la página Icebreakers', 'error'); break; }
      createBtn.click();
      console.log('[IB] createBtn clicked for msg', i, 'category:', msg.category);
      await sleep(800);
      var textarea = null;
      for (var tw = 0; tw < 8; tw++) {
        textarea = document.querySelector(TALK_Y.ICEBREAKER_TEXTAREA) || document.querySelector('textarea[placeholder="Type your message here"]:not([maxlength="1000"])');
        if (textarea && !textarea.disabled) break;
        await sleep(200);
      }
      if (!textarea) { showTessToast('No se encontró el textarea', 'error'); break; }
      await sleep(300);
      textarea.removeAttribute('disabled');
      textarea.disabled = false;
      textarea.value = msg.text;
      textarea.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: msg.text }));
      textarea.dispatchEvent(new Event('change', { bubbles: true }));
      if (msg.category && msg.category.toLowerCase() === 'mail') {
        var radio = document.querySelector(TALK_Y.ICEBREAKER_RADIO_MAIL);
        if (radio) { (radio.closest('label') || radio).click(); await sleep(400); }
        var mailTextarea = document.querySelector(TALK_Y.ICEBREAKER_TEXTAREA_MAIL);
        if (mailTextarea && mailTextarea !== textarea) {
          mailTextarea.removeAttribute('disabled');
          mailTextarea.disabled = false;
          mailTextarea.value = msg.text;
          mailTextarea.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: msg.text }));
          mailTextarea.dispatchEvent(new Event('change', { bubbles: true }));
        }
      } else {
        var moodMap = { friendship: 'friendship', real_love: 'real_love', hot_talks: 'hot_talks' };
        var mood = moodMap[(msg.category || '').toLowerCase()] || 'friendship';
        console.log('[IB] mood selection: category=', msg.category, '→ mood=', mood);
        var moodEl = null;
        for (var mc = 0; mc < 10; mc++) {
          var allChips = document.querySelectorAll('.mood-chip');
          if (allChips.length) {
            moodEl = document.querySelector(TALK_Y.ICEBREAKER_MOOD(mood));
            if (!moodEl) {
              moodEl = Array.from(allChips).find(function(c) {
                return c.getAttribute('data-mood') === mood || c.textContent.trim().toLowerCase().replace(/\s/g, '_') === mood;
              });
            }
            if (moodEl) break;
          }
          await sleep(200);
        }
        console.log('[IB] moodEl found for', mood, moodEl ? '✓' : '✗');
        if (moodEl) {
          moodEl.click();
          console.log('[IB] mood clicked:', mood);
          await sleep(300);
        } else {
          console.log('[IB] mood element not found for:', mood);
        }
      }
      await sleep(300);
      var sendBtn = document.querySelector(TALK_Y.ICEBREAKER_SEND_MODERATION);
      if (!sendBtn) {
        sendBtn = Array.from(document.querySelectorAll('button')).find(function(b) {
          return /\bSend for Moderation\b/i.test(b.textContent);
        });
      }
      if (!sendBtn) { showTessToast('No se encontró el botón Send for Moderation', 'error'); break; }
      console.log('[IB] sending msg', i, 'category:', msg.category);
      sendBtn.click();
      window._ibSentCount = (window._ibSentCount || 0) + 1;
      var stats = Tesseract.get('botStats');
      stats.icebreakersSent = (stats.icebreakersSent || 0) + 1;
      Tesseract.set('botStats', stats);
      console.log('[IB] waiting after send for msg', i);
      for (var w = 0; w < 12; w++) {
        var remains = document.querySelector(TALK_Y.ICEBREAKER_TEXTAREA) || document.querySelector('textarea[placeholder="Type your message here"]');
        if (!remains) break;
        await sleep(300);
      }
    }
    document.getElementById('ibStatus').textContent = window._ibMode === 'sending' ? 'Completado' : 'Detenido';
    if (window._ibMode === 'sending') {
      showTessToast(toSend.length + ' Icebreakers enviados a moderaci\u00f3n', 'success');
    }
  } catch (e) {
    console.error('[IB] Error en sweep:', e);
    showTessToast('Error durante el env\u00edo: ' + e.message, 'error');
  }
  window._ibMode = 'idle';
  updateIBUI();
}

function abortIcebreakerSweep() {
  window._ibMode = 'idle';
  updateIBUI();
}

function updateIBUI() {
  var genBtn = document.getElementById('btnIBGenerate');
  var sendBtn = document.getElementById('btnIBSend');
  var status = document.getElementById('ibStatus');
  if (genBtn) genBtn.disabled = window._ibMode === 'sending' || window._ibMode === 'generating';
  if (sendBtn) sendBtn.disabled = window._ibMode !== 'ready';
  if (status) {
    var labels = { idle: 'Listo', generating: 'Generando\u2026', ready: 'Listo para enviar', sending: 'Enviando\u2026' };
    status.textContent = labels[window._ibMode] || 'Listo';
  }
}

window._generateIcebreakers = generateIcebreakersFromAI;
window._executeIcebreakerSweep = executeIcebreakerSweep;
window._abortIcebreakerSweep = abortIcebreakerSweep;
window._updateIBUI = updateIBUI;

// ============ LANGUAGE DETECTION ============
function detectLanguage(text) {
  if (!text) return null;
  var t = text.toLowerCase().trim();
  var words = t.split(/\s+/).filter(function (w) { return w.length > 2; });
  var scores = { en: 0, es: 0, fr: 0, pt: 0 };
  var dicts = {
    en: ['the', 'you', 'and', 'for', 'are', 'but', 'not', 'was', 'have', 'has', 'had', 'your', 'with', 'from', 'they', 'this', 'that', 'she', 'her', 'what', 'all', 'can'],
    es: ['que', 'las', 'los', 'por', 'para', 'con', 'del', 'como', 'mas', 'pero', 'esta', 'este', 'esto', 'muy', 'todo', 'bien', 'cuando', 'si', 'solo', 'cada'],
    fr: ['les', 'des', 'que', 'pas', 'pour', 'dans', 'avec', 'vous', 'elle', 'ils', 'sur', 'nous', 'plus', 'tout', 'mais', 'fait', 'faire'],
    pt: ['que', 'para', 'com', 'dos', 'das', 'mais', 'como', 'muito', 'isso', 'esta', 'este', 'aqui', 'tudo', 'bem', 'sua', 'seu', 'voce', 'ela']
  };
  for (var wi = 0; wi < words.length; wi++) {
    for (var lang in dicts) {
      if (dicts[lang].indexOf(words[wi]) !== -1) scores[lang]++;
    }
  }
  if (scores.en > scores.es && scores.en >= 1) return 'en';
  if (scores.fr > scores.es && scores.fr >= 1) return 'fr';
  if (scores.pt > scores.es && scores.pt >= 1) return 'pt';
  return null;
}

// ============ SERVER SYNC (delegates to state-manager) ============
window._tessServerSync = {
  history: function (profileId) { Tesseract.queueSync(profileId); },
  config: async function (configKey, configData) {
    var token = await new Promise(function (r) { chrome.storage.local.get('tess_jwt', function (d) { r(d.tess_jwt); }); });
    if (!token) return;
    try {
      var ctrl = new AbortController(); var to = setTimeout(function () { ctrl.abort(); }, 15000);
      var res = await fetch(Tesseract.API + '/api/tess/metrics/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
        body: JSON.stringify({ action: 'CONFIG_SYNC', configKey: configKey, configData: configData }),
        signal: ctrl.signal
      });
      clearTimeout(to);
      if (res.status === 404) console.log('[SYNC] Config endpoint not on server yet');
    } catch (e) { console.warn('[SYNC] config sync error:', e); }
  },
  loadHistory: async function () {
    var token = await new Promise(function (r) { chrome.storage.local.get('tess_jwt', function (d) { r(d.tess_jwt); }); });
    if (!token) return null;
    try {
      var ctrl = new AbortController(); var to = setTimeout(function () { ctrl.abort(); }, 15000);
      var res = await fetch(Tesseract.API + '/api/tess/metrics/sync?mode=history', {
        headers: { 'Authorization': 'Bearer ' + token },
        signal: ctrl.signal
      });
      clearTimeout(to);
      if (!res.ok) return null;
      var data = await res.json();
      return data.history || null;
    } catch (e) { console.warn('[SYNC] load history error:', e); return null; }
  },
  loadConfig: async function (configKey) {
    var token = await new Promise(function (r) { chrome.storage.local.get('tess_jwt', function (d) { r(d.tess_jwt); }); });
    if (!token) return null;
    try {
      var ctrl = new AbortController(); var to = setTimeout(function () { ctrl.abort(); }, 15000);
      var res = await fetch(Tesseract.API + '/api/tess/metrics/sync?mode=config&key=' + encodeURIComponent(configKey), {
        headers: { 'Authorization': 'Bearer ' + token },
        signal: ctrl.signal
      });
      clearTimeout(to);
      if (!res.ok) return null;
      var data = await res.json();
      return data.config || null;
    } catch (e) { console.warn('[SYNC] load config error:', e); return null; }
  },
  activityLog: async function (entry) {
    var token = await new Promise(function (r) { chrome.storage.local.get('tess_jwt', function (d) { r(d.tess_jwt); }); });
    if (!token) return;
    try {
      var ctrl = new AbortController(); var to = setTimeout(function () { ctrl.abort(); }, 15000);
      await fetch(Tesseract.API + '/api/tess/metrics/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
        body: JSON.stringify({ action: 'ACTIVITY_LOG', logEntry: entry }),
        signal: ctrl.signal
      });
      clearTimeout(to);
    } catch (e) { console.warn('[SYNC] activity log error:', e); }
  }
};
