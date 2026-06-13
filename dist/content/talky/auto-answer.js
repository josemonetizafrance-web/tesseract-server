// TESSERACT v24 - Auto-Answer Module
// Detecta eventos (likes, winks, comments, gifts) y responde automáticamente
// Usa DOM Contact Finder para contexto adicional de contactos
// La generación de respuestas con IA se hace a través del servidor (Groq API Key)
// NO se procesan contactos Pinneados o Guardados ni contactos en Blacklist

const AUTO_ANSWER_STORAGE_KEY = 'tess_auto_answer_config';
const AA_CONTACTED_HISTORY_KEY = 'tess_aa_contacted_history';
var TESSERACT_API = 'https://tesseract-jblo.onrender.com';

// Variables blacklist
let aaBlacklist = [];

// Cargar blacklist (con reintentos)
async function loadAABlacklist(retries) {
  if (retries === undefined) retries = 2;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const stored = await chrome.storage.local.get(['tess_jwt']);
      if (!stored.tess_jwt) return;
      const res = await fetch(`${TESSERACT_API}/api/tess/blacklist`, {
        headers: { 'Authorization': 'Bearer ' + stored.tess_jwt }
      });
      if (!res.ok && attempt < retries) { await new Promise(r => setTimeout(r, 1000)); continue; }
      const data = await res.json();
      aaBlacklist = (data.blacklist || []).map(String);
      return;
    } catch (e) {
      if (attempt >= retries) return;
      await new Promise(r => setTimeout(r, 1000));
    }
  }
}

// Verificar blacklist
function isInAABlacklist(contactId) {
  if (!contactId) return false;
  return aaBlacklist.includes(String(contactId));
}

// Iniciar carga
loadAABlacklist();

async function isContactAlreadyContacted(profileId) {
  try {
    const data = await chrome.storage.local.get([AA_CONTACTED_HISTORY_KEY]);
    const history = data[AA_CONTACTED_HISTORY_KEY] || {};
    return history[profileId] === true;
  } catch (e) { return false; }
}

async function markContactAsContacted(profileId) {
  try {
    const data = await chrome.storage.local.get([AA_CONTACTED_HISTORY_KEY]);
    const history = data[AA_CONTACTED_HISTORY_KEY] || {};
    history[profileId] = true;
    await chrome.storage.local.set({ [AA_CONTACTED_HISTORY_KEY]: history });
  } catch (e) { console.error('[AA] Error guardando historial:', e); }
}

async function clearAAHistory() {
  try {
    await chrome.storage.local.remove(AA_CONTACTED_HISTORY_KEY);
    console.log('[AA] Historial limpiado');
  } catch (e) {}
}

function isContactPinnedOrSavedAA(contactEl) {
  try {
    const text = contactEl.textContent.toLowerCase();
    if (text.includes('pin') || text.includes('saved') || text.includes('fijado') || text.includes('guardado')) return true;
    if (contactEl.querySelector(TALK_Y.PINNED_INDICATORS)) return true;
    return false;
  } catch (e) { return false; }
}

const DEFAULT_AA_CONFIG = {
  enabled: false,
  events: {
    like: { enabled: true, template: '' },
    wink: { enabled: true, template: '' },
    comment: { enabled: true, template: '' },
    gift: { enabled: true, template: '' },
    greeting: { enabled: true, template: '' } // Saludo desde MENSAJES ACTIVE
  },
  delay: { min: 2000, max: 5000 },
  useAI: false,
  maxDaily: 50,
  respondedToday: 0,
  lastResetDate: '',
  scanSources: ['messages-active', 'contact-list'], // Para barridos de saludos
  weBelieve: { enabled: false, response: 'Hello! How are you?' }
};

let aaConfig = null;
let aaObserver = null;
let aaDailyCount = 0;
let aaActiveDate = '';
let aaLastProfileId = '';
let aaProfileCooldowns = {};
let aaPendingSave = false;
let aaSaveTimer = null;
let weBelieveObserver = null;
let weBelieveRespondedKeys = new Set();

function cloneAAConfig(cfg) {
  return JSON.parse(JSON.stringify(cfg || DEFAULT_AA_CONFIG));
}

async function loadAAConfig() {
  try {
    const r = await chrome.storage.local.get([AUTO_ANSWER_STORAGE_KEY]);
    if (r[AUTO_ANSWER_STORAGE_KEY]) {
      aaConfig = Object.assign({}, DEFAULT_AA_CONFIG, r[AUTO_ANSWER_STORAGE_KEY]);
    } else {
      aaConfig = cloneAAConfig(DEFAULT_AA_CONFIG);
    }
  } catch (e) {
    aaConfig = cloneAAConfig(DEFAULT_AA_CONFIG);
  }
  resetDailyCounter();
  return aaConfig;
}

async function saveAAConfig() {
  try {
    await chrome.storage.local.set({ [AUTO_ANSWER_STORAGE_KEY]: aaConfig });
    console.log('[AA] Config guardada OK');
  } catch (e) {
    console.error('[AA] Error saving config:', e);
  }
}

function resetDailyCounter() {
  const today = new Date().toISOString().slice(0, 10);
  if (aaConfig.lastResetDate !== today) {
    aaConfig.respondedToday = 0;
    aaConfig.lastResetDate = today;
    saveAAConfig();
  }
  aaDailyCount = aaConfig.respondedToday || 0;
  aaActiveDate = today;
}

// Genera respuesta AI a través del backend (Groq API Key en servidor Render)
async function getAIResponse(eventType, contextText) {
  try {
    const token = await new Promise(r => chrome.storage.local.get('tess_jwt', d => r(d.tess_jwt)));
    if (!token) return null;

    const systemMsg = `Eres un asistente de citas. Genera una respuesta natural, breve y amigable para un ${eventType} recibido en una app de citas. No incluyas explicaciones ni marcas.`;
    const userMsg = contextText || `Usuario ha enviado un ${eventType}. Responde de forma cálida y conversacional.`;

    const res = await fetch('https://tesseract-jblo.onrender.com/api/chatgpt/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        messages: [
          { role: 'system', content: systemMsg },
          { role: 'user', content: userMsg }
        ],
        max_tokens: 150,
        temperature: 0.7
      })
    });

    if (!res.ok) {
      console.warn('[AA-AI] Backend error:', res.status);
      return null;
    }

    const data = await res.json();
    return data.choices?.[0]?.message?.content || null;
  } catch (e) {
    console.error('[AA-AI] Error:', e.message);
    return null;
  }
}

// Intenta obtener respuesta mediante backend AI, fallback a template local
async function getAAResponse(eventType, contextText) {
  const evtCfg = aaConfig.events[eventType];
  if (!evtCfg || !evtCfg.enabled) return null;

  if (aaConfig.maxDaily > 0 && aaDailyCount >= aaConfig.maxDaily) {
    console.log('[AA] Daily limit reached:', aaDailyCount);
    return null;
  }

  let responseText = '';

  if (aaConfig.useAI) {
    const aiResponse = await getAIResponse(eventType, contextText);
    responseText = aiResponse || evtCfg.template || getDefaultResponse(eventType);
  } else {
    responseText = evtCfg.template || getDefaultResponse(eventType);
  }

  return responseText;
}

// ============ DOM CONTACT FINDER (integrado) ============
function _extractIdFromTextAA(text) {
  if (!text) return null;
  const match = text.trim().match(/\b(\d{6,15})\b/);
  return match ? match[1] : null;
}

// Obtener IDs desde Active Limits (MAIL) - reutiliza la lógica del dom-contact-finder - excluye pinneados/guardados
function getIdsFromActiveLimitsDOM() {
  const ids = new Set();
  try {
    const allAnchors = document.querySelectorAll(TALK_Y.ALL_LINKS);
    allAnchors.forEach(a => {
      const href = a.href || a.getAttribute('href') || '';
      const match = href.match(/\/(\d{6,15})(?:[/?#]|$)/);
      if (match) {
        const parent = a.closest('[class*="active"], [class*="limit"], [class*="Active"], [id*="active"]');
        if (parent && !isContactPinnedOrSavedAA(parent)) ids.add(match[1]);
      }
      const textId = _extractIdFromTextAA(a.textContent || '');
      if (textId) ids.add(textId);
    });
  } catch (e) {}
  console.log('[AA] Active Limits IDs:', ids.size);
  return Array.from(ids);
}

// Obtener IDs desde Messages Active - excluye pinneados/guardados
function getIdsFromMessagesActiveDOM() {
  const ids = new Set();
  try {
    const msgAreas = document.querySelectorAll(TALK_Y.MESSAGE_AREAS);
    for (const area of msgAreas) {
      if (isContactPinnedOrSavedAA(area)) continue;
      const links = area.querySelectorAll(TALK_Y.ALL_LINKS);
      for (const link of links) {
        const href = link.href || '';
        const match = href.match(/\/(\d{6,15})(?:[/?#]|$)/);
        if (match) ids.add(match[1]);
      }
    }
  } catch (e) {}
  console.log('[AA] Messages Active IDs:', ids.size);
  return Array.from(ids);
}

// Obtener IDs desde Contact List general - excluye pinneados/guardados
function getIdsFromAllContactsDOM() {
  const ids = new Set();
  try {
    const allLinks = document.querySelectorAll(TALK_Y.ALL_LINKS);
    for (const link of allLinks) {
      const parent = link.closest('[class*="contact"], [class*="member"], [class*="profile"], [class*="item"]');
      if (parent && isContactPinnedOrSavedAA(parent)) continue;
      const href = link.href || '';
      const match = href.match(/\/(\d{6,15})(?:[/?#]|$)/);
      if (match) ids.add(match[1]);
    }
  } catch (e) {}
  console.log('[AA] All Contacts IDs:', ids.size);
  return Array.from(ids);
}

// Recolectar IDs según las fuentes configuradas
function collectIDsForGreeting() {
  const sources = aaConfig.scanSources || ['messages-active', 'contact-list'];
  const ids = new Set();

  for (const src of sources) {
    switch (src) {
      case 'active-limits':
        getIdsFromActiveLimitsDOM().forEach(id => ids.add(id));
        break;
      case 'messages-active':
        getIdsFromMessagesActiveDOM().forEach(id => ids.add(id));
        break;
      case 'contact-list':
        getIdsFromAllContactsDOM().forEach(id => ids.add(id));
        break;
    }
  }
  return Array.from(ids);
}

// ============ BARRIDO DE SALUDOS USANDO DOM ============
async function executeGreetingSweep() {
  if (!aaConfig.events.greeting?.enabled) {
    console.log('[AA] Greeting sweep desactivado');
    return;
  }

  const ids = collectIDsForGreeting();
  if (ids.length === 0) {
    console.log('[AA] No se encontraron IDs para saludos');
    return;
  }

  console.log('[AA] 🚀 Iniciando barrido de saludos con', ids.length, 'IDs');

  const processedIds = new Set();
  let sent = 0;

  for (let i = 0; i < ids.length; i++) {
    if (!aaConfig.enabled) break;
    if (aaConfig.maxDaily > 0 && aaDailyCount >= aaConfig.maxDaily) {
      console.log('[AA] Límite diario alcanzado');
      break;
    }
    if (!aaConfig.events.greeting?.enabled) break;

    const profileId = ids[i];
    if (processedIds.has(profileId)) continue;
    
    if (await isContactAlreadyContacted(profileId)) {
      console.log('[AA] Saltando ID ya contactado:', profileId);
      continue;
    }
    processedIds.add(profileId);

    // Abrir chat del perfil
    const opened = await openProfileChat(profileId);
    if (!opened) {
      console.log('[AA] No se pudo abrir chat para:', profileId);
      continue;
    }

    // Obtener contexto del perfil para personalizar
    const profileContext = getProfileContext(profileId);

    // Generar respuesta
    const response = aaConfig.useAI
      ? (await getAIResponse('greeting', profileContext)) || aaConfig.events.greeting?.template || getDefaultResponse('greeting')
      : aaConfig.events.greeting?.template || getDefaultResponse('greeting');

    // Enviar
    await sendResponse(response);
    await markContactAsContacted(profileId);
    sent++;

    await sleep(getRandomDelay(aaConfig.delay.min, aaConfig.delay.max));
  }

  console.log('[AA] ✅ Barrido de saludos completado. Enviados:', sent);
  saveAAConfig();
}

// Obtener contexto de un perfil del DOM
function getProfileContext(profileId) {
  let context = '';
  const profileSelectors = [
    '[class*="profile-detail"]', '[class*="user-profile"]',
    '[class*="member-info"]', '[class*="contact-info"]',
    '.profile-info', '.user-detail'
  ];

  for (const sel of profileSelectors) {
    const el = document.querySelector(sel);
    if (el) {
      const bio = el.querySelector('[class*="bio"], [class*="about"], [class*="description"]');
      const name = el.querySelector(TALK_Y.PROFILE_NAME);
      const loc = el.querySelector(TALK_Y.PROFILE_LOCATION);

      if (name) context += ' Nombre: ' + (name.textContent || '').trim();
      if (bio) context += ' Bio: ' + (bio.textContent || '').trim();
      if (loc) context += ' Ubicación: ' + (loc.textContent || '').trim();
      break;
    }
  }

  return context || `Perfil ${profileId}`;
}

function getCurrentChatProfileId() {
  const selectors = [
    '[class*="chat-header"] [data-id]',
    '[class*="profile-header"] [data-id]',
    '[class*="conversation-header"] [data-id]',
    '[class*="member-info"] [data-id]',
    '[id*="chat-profile"] [data-id]',
    '[class*="active-chat"] [data-id]',
    '[class*="chat-header"] a[href]',
    '[class*="profile-header"] a[href]',
    '[class*="conversation-header"] a[href]'
  ];
  
  for (const sel of selectors) {
    try {
      const el = document.querySelector(sel);
      if (el) {
        const dataId = el.getAttribute('data-id');
        if (dataId && /^\d{6,15}$/.test(dataId)) return dataId;
        
        const href = el.href || el.getAttribute('href');
        if (href) {
          const match = href.match(/\/(\d{6,15})(?:[/?#]|$)/);
          if (match) return match[1];
        }
      }
    } catch (e) {}
  }
  
  const urlMatch = window.location.href.match(/\/chat\/(\d{6,15})/);
  if (urlMatch) return urlMatch[1];
  
  return null;
}

// Buscar enlace de perfil por ID
function findProfileLink(profileId) {
  // Intentar enlaces directos
  try {
    const allLinks = document.querySelectorAll(TALK_Y.ALL_LINKS);
    for (const link of allLinks) {
      const href = link.href || '';
      if (href.includes(profileId)) return link;
    }
  } catch (e) {}

  // Intentar datos en atributos
  try {
    const elements = document.querySelectorAll(`[data-id="${profileId}"], [data-user-id="${profileId}"], [data-contact-id="${profileId}"]`);
    if (elements.length > 0) {
      const link = elements[0].querySelector(TALK_Y.ALL_LINKS) || elements[0];
      return link;
    }
  } catch (e) {}

  return null;
}

async function openProfileChat(profileId) {
  const link = findProfileLink(profileId);
  if (link) {
    link.click();
    await sleep(2000);
    return true;
  }
  return false;
}

function getDefaultResponse(eventType) {
  const defaults = {
    like: '¡Gracias por el like! Me alegra que te guste mi perfil. 😊 ¿Cómo estás?',
    wink: '¡Hola! Recibí tu guiño. Me encantaría conocerte mejor.',
    comment: '¡Gracias por tu comentario! Me gusta tu estilo. ¿Quieres conversar?',
    gift: '¡Wow, gracias por el regalo! Eres muy generos@. 😊 ¿Cómo estás?',
    greeting: '¡Hola! Vi tu perfil y me pareciste interesante. ¿Cómo estás?'
  };
  return defaults[eventType] || '¡Hola! Gracias por tu interés. ¿Cómo estás?';
}

function findChatInput() {
  const activeChatSelectors = [
    '[class*="active-chat"] textarea', '[class*="active-chat"] input',
    '[class*="current-chat"] textarea', '[class*="current-chat"] input',
    '[class*="conversation-active"] textarea', '[class*="conversation-active"] input',
    '[class*="chat-active"] textarea', '[class*="chat-active"] input'
  ];
  
  for (const sel of activeChatSelectors) {
    const container = document.querySelector(sel.replace(/textarea|input/, '').trim());
    if (container) {
      const input = container.querySelector('textarea, input');
      if (input && input.offsetParent !== null) return input;
    }
  }
  
  const selectors = [
    'textarea[class*="chat"]', 'textarea[class*="message"]', 'textarea[placeholder*="message"]',
    'textarea[placeholder*="escribe"]', 'textarea[placeholder*="type"]',
    'div[contenteditable="true"][class*="chat"]', 'div[contenteditable="true"][class*="message"]',
    'input[class*="chat"]', 'input[class*="message"]',
    '#chatInput', '#messageInput', '#msgInput', 'textarea.chat-input',
    '[class*="chat-input"] textarea', '[class*="chat-input"] input',
    '[class*="message-input"] textarea', '[class*="message-input"] input'
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
    '#sendButton', '#btnSend', '#chatSend'
  ];
  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (el) return el;
  }
  const allButtons = document.querySelectorAll(TALK_Y.ALL_BUTTONS);
  for (const btn of allButtons) {
    const text = (btn.textContent || '').toLowerCase().trim();
    if (text === 'send' || text === 'enviar' || text === '\u2192' || text === '\u25b6') {
      if (btn.offsetParent !== null) return btn;
    }
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
  } catch (e) {
    console.error('[AA] Error typing:', e);
    return false;
  }
}

async function sendResponse(text) {
  const chatProfileId = getCurrentChatProfileId();
  if (!chatProfileId) {
    console.warn('[AA] No se detectó perfil de chat activo');
  }
  
  const input = findChatInput();
  if (!input) {
    console.warn('[AA] No chat input found');
    return false;
  }
  const sendBtn = findSendButton();
  if (!sendBtn) {
    console.warn('[AA] No send button found');
    return false;
  }

  if (!typeIntoInput(input, text)) return false;

  const inputValueBefore = input.value || input.textContent || '';
  await sleep(getRandomDelay(aaConfig.delay.min, aaConfig.delay.max));

  sendBtn.click();
  await sleep(1500);

  const inputValueAfter = input.value || input.textContent || '';
  if (inputValueAfter === inputValueBefore && inputValueBefore !== '') {
    console.warn('[AA] Mensaje no se envió - input sin cambios');
    const altBtn = document.querySelector(TALK_Y.SEND_BTN_ALT_FALLBACK);
    if (altBtn) altBtn.click();
    await sleep(1500);
    const inputValueAfter2 = input.value || input.textContent || '';
    if (inputValueAfter2 === inputValueBefore) {
      return false;
    }
  }

  aaDailyCount++;
  if (typeof botStats !== 'undefined') { botStats.autoResponse = (botStats.autoResponse || 0) + 1; botStats.repliesResponded = (botStats.repliesResponded || 0) + 1; }
  if (aaConfig) {
    aaConfig.respondedToday = aaDailyCount;
    if (!aaPendingSave) {
      aaPendingSave = true;
      clearTimeout(aaSaveTimer);
      aaSaveTimer = setTimeout(async () => {
        aaPendingSave = false;
        await saveAAConfig();
      }, 5000);
    }
  }

  console.log('[AA] ✅ Response sent:', text.slice(0, 50) + '...');
  return true;
}

function getRandomDelay(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============ EVENT DETECTION (MutationObserver) ============
// Detecta eventos REALES (like, wink, gift, comment, greeting) y responde SOLO al emisor
function startAAObserver() {
  if (aaObserver) aaObserver.disconnect();

  // Observar solo contenedores de notificaciones, no todo el body
  const targetNode = document.querySelector(TALK_Y.NOTIFICATION_CONTAINER) || document.body;
  if (!targetNode) return;

  let debounceTimer = null;

  aaObserver = new MutationObserver((mutations) => {
    if (!aaConfig || !aaConfig.enabled) return;
    if (debounceTimer) return;

    debounceTimer = setTimeout(async () => {
      debounceTimer = null;

      const today = new Date().toISOString().slice(0, 10);
      if (aaActiveDate !== today) resetDailyCounter();

      if (aaConfig.maxDaily > 0 && aaDailyCount >= aaConfig.maxDaily) return;

      const detections = [];

      for (const mutation of mutations) {
        if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
          for (const node of mutation.addedNodes) {
            if (node.nodeType !== 1) continue;
            const html = (node.outerHTML || node.textContent || '').toLowerCase();

            // Detectar tipo de evento Y extraer ID del emisor
            let eventType = null;
            let senderId = null;

            // Extraer ID del emisor del elemento de notificación
            senderId = extractSenderFromNode(node);

            if (/like|heart|favorite/.test(html) && /received|new|notification|te/.test(html)) {
              eventType = 'like';
            } else if (/wink|guiño/.test(html)) {
              eventType = 'wink';
            } else if (/comment|comentario/.test(html) && /received|new|notification|te/.test(html)) {
              eventType = 'comment';
            } else if (/gift|regalo/.test(html) && /received|new|notification|te/.test(html)) {
              eventType = 'gift';
            } else if (/message|mensaje|nuevo mensaje|new message|te escribió|wrote to you/.test(html)) {
              eventType = 'greeting';
            }

            if (eventType && senderId) {
              detections.push({ eventType, senderId });
            }
          }
        }
      }

      // Procesar detecciones
      for (const detection of detections) {
        const { eventType, senderId } = detection;

        // Verificar si el evento está habilitado
        if (!aaConfig.events[eventType]?.enabled) continue;

        // Verificar blacklist
        if (isInAABlacklist(senderId)) {
          console.log('[AA] ⛔ Skip (blacklist):', senderId);
          continue;
        }

        // Verificar cooldown por perfil
        if (aaProfileCooldowns[senderId] && (Date.now() - aaProfileCooldowns[senderId]) < 30000) {
          console.log('[AA] Cooldown activo para:', senderId);
          continue;
        }

        // Verificar historial (no responder al mismo usuario dos veces)
        if (await isContactAlreadyContacted(senderId)) {
          console.log('[AA] Ya respondido a:', senderId);
          continue;
        }

        aaLastProfileId = senderId;
        aaProfileCooldowns[senderId] = Date.now();
        setTimeout(() => { delete aaProfileCooldowns[senderId]; }, 30000);

        // Abrir chat del emisor
        const opened = await openProfileChat(senderId);
        if (!opened) {
          console.log('[AA] No se pudo abrir chat para:', senderId);
          continue;
        }

        // Obtener contexto y generar respuesta
        const profileContext = getProfileContext(senderId);
        const response = await getAAResponse(eventType, profileContext);
        if (response) {
          await sendResponse(response);
          await markContactAsContacted(senderId);
          console.log('[AA] ✅ Respuesta enviada a', senderId, 'por', eventType);
        }
      }
    }, 1500);
  });

  aaObserver.observe(targetNode, { childList: true, subtree: true });
  console.log('[AA] Observer started - solo responde a eventos reales');
}

// Extraer ID del emisor desde un nodo de notificación
function extractSenderFromNode(node) {
  if (!node || node.nodeType !== 1) return null;

  // Buscar en atributos data-*
  const dataId = node.getAttribute('data-id') || node.getAttribute('data-user-id') || node.getAttribute('data-member-id');
  if (dataId && /^\d{6,15}$/.test(dataId)) return dataId;

  // Buscar en hijos
  const childWithDataId = node.querySelector('[data-id], [data-user-id], [data-member-id]');
  if (childWithDataId) {
    const id = childWithDataId.getAttribute('data-id') || childWithDataId.getAttribute('data-user-id') || childWithDataId.getAttribute('data-member-id');
    if (id && /^\d{6,15}$/.test(id)) return id;
  }

  // Buscar en hrefs
  const links = node.querySelectorAll(TALK_Y.ALL_LINKS);
  for (const link of links) {
    const href = link.href || link.getAttribute('href') || '';
    const match = href.match(/\/(\d{6,15})(?:[/?#]|$)/);
    if (match) return match[1];
  }

  // Buscar en el href del propio nodo si es un enlace
  if (node.tagName === 'A') {
    const href = node.href || node.getAttribute('href') || '';
    const match = href.match(/\/(\d{6,15})(?:[/?#]|$)/);
    if (match) return match[1];
  }

  // Buscar ID numérico en el texto
  const text = node.textContent || '';
  const textMatch = text.match(/\b(\d{6,15})\b/);
  if (textMatch) return textMatch[1];

  return null;
}

function stopAAObserver() {
  if (aaObserver) {
    aaObserver.disconnect();
    aaObserver = null;
  }
}

// ============ WE BELIEVE SYSTEM MESSAGE DETECTION ============
function startWeBelieveObserver() {
  stopWeBelieveObserver();
  const chatArea = document.querySelector(TALK_Y.PAGE_CHAT_BODY);
  if (!chatArea) return;
  weBelieveObserver = new MutationObserver((mutations) => {
    if (!aaConfig || !aaConfig.weBelieve?.enabled) return;
    for (const mutation of mutations) {
      if (mutation.type !== 'childList') continue;
      for (const node of mutation.addedNodes) {
        if (node.nodeType !== 1) continue;
        const msgEl = node.matches(TALK_Y.SYSTEM_MSG) ? node : node.querySelector(TALK_Y.SYSTEM_MSG);
        if (!msgEl) continue;
        const text = (msgEl.textContent || '').trim();
        if (!text.toLowerCase().includes((TALK_Y.SYSTEM_MSG_TEXT || 'we believe').toLowerCase())) continue;
        const key = text.slice(0, 80);
        if (weBelieveRespondedKeys.has(key)) continue;
        weBelieveRespondedKeys.add(key);
        console.log('[AA] We Believe detected, responding...');
        sendWeBelieveResponse();
      }
    }
  });
  weBelieveObserver.observe(chatArea, { childList: true, subtree: true });
  console.log('[AA] We Believe observer started');
}

function stopWeBelieveObserver() {
  if (weBelieveObserver) {
    weBelieveObserver.disconnect();
    weBelieveObserver = null;
  }
}

async function sendWeBelieveResponse() {
  const input = document.querySelector(TALK_Y.CHAT_TEXTAREA) || document.querySelector(TALK_Y.CHAT_INPUT_ID) || document.querySelector(TALK_Y.ANY_TEXTAREA);
  const sendBtn = document.querySelector(TALK_Y.SEND_BTN_CLASS) || document.querySelector(TALK_Y.SEND_BTN_ID) || document.querySelector(TALK_Y.SEND_BTN_ARIA);
  if (!input || !sendBtn) return;
  const text = aaConfig?.weBelieve?.response || 'Hello! 😊';
  if (typeof sendChatMessage === 'function') {
    sendChatMessage(text);
    return;
  }
  input.value = text;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
  await sleep(1500 + getRandomDelay(aaConfig.delay.min, aaConfig.delay.max));
  sendBtn.click();
  console.log('[AA] We Believe response sent');
}

function isAActive() {
  return aaConfig && aaConfig.enabled;
}

async function setAAState(enabled) {
  await loadAAConfig();
  aaConfig.enabled = enabled;
  await saveAAConfig();
  if (enabled) startAAObserver();
  else stopAAObserver();
  if (enabled && aaConfig.weBelieve?.enabled) startWeBelieveObserver();
  else stopWeBelieveObserver();
}

function getAAConfig() {
  return aaConfig;
}

// ============ CONFIG UPDATES (atomic save) ============
async function updateAAConfigBulk(configObj) {
  await loadAAConfig();
  Object.assign(aaConfig, configObj);
  await saveAAConfig();
}

async function updateAAEventConfig(eventType, updates) {
  await loadAAConfig();
  if (aaConfig.events[eventType]) {
    Object.assign(aaConfig.events[eventType], updates);
  }
  await saveAAConfig();
}

async function updateAADelay(min, max) {
  await loadAAConfig();
  aaConfig.delay.min = min;
  aaConfig.delay.max = max;
  await saveAAConfig();
}

async function updateAAUseAI(useAI) {
  await loadAAConfig();
  aaConfig.useAI = useAI;
  await saveAAConfig();
}

async function updateAAMaxDaily(max) {
  await loadAAConfig();
  aaConfig.maxDaily = max;
  await saveAAConfig();
}

async function updateAAScanSources(sources) {
  await loadAAConfig();
  aaConfig.scanSources = sources;
  await saveAAConfig();
}

async function updateAAWeBelieve(config) {
  await loadAAConfig();
  aaConfig.weBelieve = Object.assign({}, aaConfig.weBelieve || { enabled: false, response: '' }, config);
  await saveAAConfig();
  if (config.enabled === true && aaConfig.enabled) startWeBelieveObserver();
  else if (config.enabled === false) stopWeBelieveObserver();
}

// ============ Init ============
async function initAutoAnswer() {
  await loadAAConfig();
  await initAAHistoryFromCollected();
  if (aaConfig.enabled) startAAObserver();
  if (aaConfig.enabled && aaConfig.weBelieve?.enabled) startWeBelieveObserver();
  console.log('[AA] Module initialized, enabled:', aaConfig.enabled);
}

async function initAAHistoryFromCollected() {
  try {
    const data = await chrome.storage.local.get(['tess_ids']);
    const ids = data.tess_ids || {};
    const historyData = await chrome.storage.local.get([AA_CONTACTED_HISTORY_KEY]);
    let history = historyData[AA_CONTACTED_HISTORY_KEY] || {};
    let added = 0;
    for (const cat of ['Like', 'Follow', 'Saludo', 'Cartas']) {
      if (Array.isArray(ids[cat])) {
        for (const id of ids[cat]) {
          if (id && !history[id]) {
            history[id] = true;
            added++;
          }
        }
      }
    }
    if (added > 0) {
      await chrome.storage.local.set({ [AA_CONTACTED_HISTORY_KEY]: history });
      console.log('[AA] Historial inicializado con', added, 'IDs de tess_ids');
    }
  } catch (e) { console.error('[AA] Error inicializando historial:', e); }
}

// ============ GLOBAL ACCESSORS (for panels) ============
window._saveAAConfigDirect = saveAAConfig;
window._getAAConfigDirect = () => aaConfig;
window._loadAAConfigDirect = loadAAConfig;
window._updateAAConfigBulk = updateAAConfigBulk;
window._updateAAEventConfig = updateAAEventConfig;
window._updateAADelay = updateAADelay;
window._updateAAUseAI = updateAAUseAI;
window._updateAAMaxDaily = updateAAMaxDaily;
window._updateAAScanSources = updateAAScanSources;
window._addToAABlacklist = function(id) { if (id && !aaBlacklist.includes(String(id))) { aaBlacklist.push(String(id)); console.log('[AA] Added to blacklist:', id); } };
window._setAAState = setAAState;
window._updateAAWeBelieve = updateAAWeBelieve;
window._startWeBelieveObserver = startWeBelieveObserver;
window._stopWeBelieveObserver = stopWeBelieveObserver;