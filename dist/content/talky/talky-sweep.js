// TESSERACT - Módulo SWEEPS (LFP context + Cartas + Star Tools)

// ============ DETECTAR CONTEXTO DE PÁGINA ============
function detectLFContext() {
  var url = location.href.toLowerCase();
  if (url.includes('/search') || url.includes('/browse') || url.includes('/find') || url.includes('/explore')) return 'search';
  if (url.includes('/message') || url.includes('/chat') || url.includes('/conversation') || url.includes('/dialog') || url.includes('/inbox') || url.includes('/list')) return 'messages';
  if (url.includes('/mail') || url.includes('/carta') || url.includes('/letter') || url.includes('/email')) return 'mail';
  if (document.querySelector(TALK_Y.PAGE_SEARCH)) return 'search';
  if (document.querySelector(TALK_Y.PAGE_CONTACT_LIST)) return 'messages';
  if (document.querySelector(TALK_Y.PAGE_MAIL_LIST)) return 'mail';
  if (document.querySelector('[class*="chat"]')) return 'messages';
  return 'search';
}

// ============ RECOLECTAR CONTACTOS SEGÚN CONTEXTO ============
function collectLFContacts(context) {
  var ids = [];
  if (context === 'search') {
    var container = document.querySelector(
      '[class*="search-result"], [class*="browse-result"], [class*="results"],' +
      '[class*="profile-list"], [class*="user-list"], [class*="member-list"],' +
      'main, [class*="content"]'
    ) || document.body;
    var anchors = container.querySelectorAll('a[href*="/profile/"], a[href*="/member/"], a[href*="/user/"]');
    anchors.forEach(function (a) {
      if (!a.offsetParent) return;
      if (a.closest('nav, header, [class*="nav"], [class*="header"], [class*="menu"], [class*="sidebar"], [class*="toolbar"], [class*="top-bar"]')) return;
      var m = a.href && a.href.match(/\/(\d{6,15})(\/|$)/);
      if (m && m[1] && m[1].length >= 6 && ids.indexOf(m[1]) === -1) ids.push(m[1]);
    });
    return ids.slice(0, 12);
  }
  if (context === 'messages') {
    var list = document.querySelector(TALK_Y.CONTACT_LIST_PRIMARY);
    if (!list) return ids;
    var items = list.querySelectorAll(TALK_Y.CONTACT_ITEMS_SHORT);
    items.forEach(function (item) {
      if (item.offsetParent === null || isPinnedOrSaved(item)) return;
      var id = extractId(item);
      if (id && ids.indexOf(id) === -1) ids.push(id);
    });
    return ids;
  }
  if (context === 'mail') {
    var list = document.querySelector(TALK_Y.CONTACT_LIST_INBOX);
    if (!list) return ids;
    var items = list.querySelectorAll('[class*="item"], [class*="mail"], [class*="letter"], li, [class*="row"], [class*="message"]');
    items.forEach(function (item) {
      if (item.offsetParent === null) return;
      var txt = item.textContent.toLowerCase();
      if (txt.includes('respondido') || txt.includes('replied') || txt.includes('enviado') || txt.includes('sent')) return;
      var id = extractId(item);
      if (id && ids.indexOf(id) === -1) ids.push(id);
    });
    return ids;
  }
  return ids;
}

// ============ NAVEGAR AL PERFIL DESDE CUALQUIER CONTEXTO ============
async function navigateToProfile(contactId, context) {
  if (!likeFollowActive) return false;
  if (!contactId || contactId.length < 6) return false;
  var link = document.querySelector('a[href*="/' + contactId + '"]');
  if (link && link.offsetParent) {
    link.click();
    await sweepSleep(1200);
    return likeFollowActive;
  }
  if (context === 'messages' || context === 'mail') {
    var list = document.querySelector(TALK_Y.CONTACT_LIST_PRIMARY);
    if (list) {
      var target = list.querySelector('a[href*="' + contactId + '"], [data-id="' + contactId + '"], [data-user-id="' + contactId + '"], [data-contact-id="' + contactId + '"]');
      if (target && target.offsetParent) {
        target.click();
        await sweepSleep(1200);
        if (!likeFollowActive) return false;
        var profileInView = document.querySelector('a[href*="/profile/"], a[href*="/member/"], a[href*="/user/"]');
        if (profileInView && profileInView.offsetParent && profileInView.href.includes(contactId)) {
          profileInView.click();
          await sweepSleep(1200);
          return likeFollowActive;
        }
        return true;
      }
    }
  }
  return false;
}

// ============ SLEEP INTERRUMPIBLE ============
function sweepSleep(ms) {
  if (!likeFollowActive) return Promise.resolve();
  return new Promise(function (resolve) {
    var step = 150;
    var timer = setInterval(function () {
      ms -= step;
      if (!likeFollowActive || ms <= 0) {
        clearInterval(timer);
        resolve();
      }
    }, step);
  });
}

// ============ DETECTAR CONTACTOS CON INTERÉS RECIENTE ============
function isRecentlyEngaged(contactEl) {
  if (contactEl.querySelector('[class*="pin"], [class*="saved"], [class*="bookmark"], [class*="starred"]')) {
    return false;
  }
  
  const text = (contactEl.textContent || '').toLowerCase();
  
  const exploredSignals = [
    'visitó', 'visited', 'visto', 'viewed', 'vió tu perfil', 'saw your profile',
    'vió tu foto', 'saw your photo', 'ha visto', 'has viewed', 'recently visited',
    'vió tu', 'watching', 'watching you', 'visitó tu'
  ];
  
  const messageSignals = [
    'envió', 'sent', 'mensaje', 'message', 'te escribió', 'wrote to you',
    'respondió', 'replied', 'dijo', 'said', 'te dijo', 'te envió', 'sent you',
    'nuevo mensaje', 'new message', 'te ha escrito', 'has written'
  ];
  
  const cartaSignals = [
    'carta', 'letter', 'envió una carta', 'sent a letter', 'te envió una carta',
    'carta recibida', 'letter received', 'nueva carta', 'new letter'
  ];
  
  const recentTimeSignals = [
    'ahora', 'now', 'justo', 'just now', 'minuto', 'minute', 'min',
    'hace', 'ago', 'hore', 'hour', 'hoy', 'today'
  ];
  
  const hasExplored = exploredSignals.some(s => text.includes(s));
  const hasMessages = messageSignals.some(s => text.includes(s));
  const hasCartas = cartaSignals.some(s => text.includes(s));
  const hasRecentActivity = recentTimeSignals.some(s => text.includes(s));
  
  let hasRecentTimestamp = false;
  const timeEl = contactEl.querySelector(TALK_Y.TIME_ELEMENT);
  if (timeEl) {
    const timeText = (timeEl.textContent || '').toLowerCase();
    if (timeText.match(/\d+\s*(m|min|minute|h|hr|hour)/) || timeText.includes('now') || timeText.includes('ahora') || timeText.includes('hoy') || timeText.includes('today')) {
      hasRecentTimestamp = true;
    }
  }
  
  return (hasExplored || hasMessages || hasCartas || hasRecentActivity || hasRecentTimestamp);
}



// ============ EJECUTAR CARTAS (CAPTURA IDs) ============
async function executeCartas() {
  console.log('[CARTAS] 🚀 Iniciando barrido...');
  
  let list = document.querySelector('[class*="contact-list"], [class*="chat-list"], [class*="conversation"], [class*="thread-list"], [class*="dialog-list"], [class*="inbox"], [class*="message-list"]');
  
  if (!list) {
    console.log('[CARTAS] ❌ Lista no encontrada con selectores específicos. Buscando lista genérica...');
    const altList = document.querySelector(TALK_Y.CONTACT_LIST_ALT2);
    if (!altList) {
      console.log('[CARTAS] ❌ No se encontró ninguna lista en la página');
      console.log('[CARTAS] DEBUG - Cuerpo:', document.body.innerHTML.substring(0, 500));
      cartasActive = Tesseract.set('cartasActive', false);
      updateModUI('cartas', false);
      return;
    }
    console.log('[CARTAS] Usando lista alternativa:', altList.className || altList.tagName, '| hijos:', altList.children.length);
    await doCartasSweep(altList);
    return;
  }
  
  console.log('[CARTAS] Lista encontrada:', list.className || list.tagName, '| hijos:', list.children.length);
  await doCartasSweep(list);
}

async function doCartasSweep(list) {
  const processedIds = new Set();
  scanPageForIds().forEach(id => registerIdInStarTools(id, 'Cartas'));
  
  let sent = 0;
  let skipped = 0;
  let maxIterations = 200;
  let iter = 0;
  
  while (cartasActive && iter < maxIterations) {
    iter++;
    const contacts = Array.from(list.querySelectorAll('[class*="contact"], [class*="user"], [class*="item"], [class*="dialog-item"], [class*="thread"], [class*="conversation"], li, [class*="row"], [class*="member"]'));
    const activeContact = contacts.find(c => {
      if (c.offsetParent === null || isPinnedOrSaved(c)) return false;
      const cid = extractId(c);
      if (cid && isBlacklisted(cid)) return false;
      return !cid || !processedIds.has(cid);
    });
    if (!activeContact) break;
    
    activeContact.click();
    await sleep(2000);
    
    const input = await waitForChatInput(5000);
    if (!input) {
      const cid = extractId(activeContact);
      if (cid) processedIds.add(cid);
      skipped++;
      continue;
    }
    
    const carta = cartaMessages[Math.floor(Math.random() * cartaMessages.length)];
    const shortCarta = carta.replace(/\n{2,}/g, ' ').substring(0, 200);
    copyToChatInput(shortCarta);
    await sleep(800);
    sendChatMessage();
    if (typeof window.onOperatorResponded === 'function') { await sleep(500); window.onOperatorResponded(); }
    await sleep(1500);
    
    const id = extractId(activeContact);
    if (id) {
      processedIds.add(id);
      registerIdInStarTools(id, 'Cartas');
    }
    
    scanPageForIds().forEach(newId => registerIdInStarTools(newId, 'Cartas'));
    
    sent++;
    botStats.cartasSent++;
    updateStats();
    await sleep(2000);
  }
  
  scanPageForIds().forEach(id => registerIdInStarTools(id, 'Cartas'));
  
  await syncMetricsToStorage('CARTAS', sent);
  cartasActive = Tesseract.set('cartasActive', false);
  updateModUI('cartas', false);
  saveAllStates();
  console.log('[CARTAS] ✅ Completado. Enviados:', sent, '| Saltados:', skipped, '| Total IDs Cartas:', collectedIds.Cartas.length);
}
