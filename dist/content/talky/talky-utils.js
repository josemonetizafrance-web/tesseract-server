// TESSERACT v24.0 - Utilidades compartidas (extraído de talky-bot-panel.js)

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function escapeHtml(str) {
  var div = document.createElement('div');
  div.appendChild(document.createTextNode(str));
  return div.innerHTML;
}

function extractId(el) {
  if (!el) return null;
  
  const selectors = [
    '[data-id]', '[data-user-id]', '[data-contact-id]', '[data-member-id]',
    '[data-profile-id]', '[id*="user"]', '[id*="member"]', '[id*="contact"]'
  ];
  
  for (const sel of selectors) {
    const found = el.querySelector(sel) || (el.matches && el.matches(sel) ? el : null);
    if (found) {
      const id = found.getAttribute('data-id') || found.getAttribute('data-user-id') || 
                 found.getAttribute('data-contact-id') || found.getAttribute('data-member-id') ||
                 found.getAttribute('data-profile-id') || found.id;
      if (id && /^\d{6,15}$/.test(id)) {
        return id;
      }
    }
  }
  
  const text = el.textContent || '';
  const match = text.match(/\b\d{6,15}\b/);
  if (match) return match[0];
  
  const links = el.querySelectorAll(TALK_Y.ALL_LINKS);
  for (const link of links) {
    const hrefMatch = link.href.match(/\/(\d{6,15})(?:[/?#]|$)/);
    if (hrefMatch) return hrefMatch[1];
  }
  
  return null;
}

function scanPageForIds() {
  const ids = new Set();
  
  const bodyText = document.body.innerText || '';
  const matches = bodyText.match(/\b\d{6,15}\b/g) || [];
  matches.forEach(id => ids.add(id));
  
  document.querySelectorAll('[data-id], [data-user-id], [data-contact-id], [data-member-id], [data-profile-id]').forEach(el => {
    const id = el.getAttribute('data-id') || el.getAttribute('data-user-id') || 
               el.getAttribute('data-contact-id') || el.getAttribute('data-member-id') ||
               el.getAttribute('data-profile-id');
    if (id && /^\d{6,15}$/.test(id)) ids.add(id);
  });
  
  document.querySelectorAll(TALK_Y.ALL_LINKS).forEach(a => {
    const m = a.href.match(/\/(\d{6,15})(?:[/?#]|$)/);
    if (m) ids.add(m[1]);
  });
  
  return Array.from(ids);
}

function findButton(labels) {
  const btns = document.querySelectorAll(TALK_Y.ACTION_BTN_WILDCARD);
  for (const b of btns) {
    const text = (b.textContent || '').toLowerCase();
    const title = (b.title || '').toLowerCase();
    if (labels.some(l => text.includes(l.toLowerCase()) || title.includes(l.toLowerCase()))) {
      if (b.offsetParent) return b;
    }
  }
  return null;
}

async function waitForChatInput(timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const input = findChatInput();
    if (input) return input;
    await sleep(200);
  }
  return null;
}

function findChatInput() {
  const selectors = [
    'textarea[placeholder*="mensaje"]', 'textarea[placeholder*="message"]',
    'textarea[placeholder*="escrib"]', 'textarea[class*="chat"]',
    '[contenteditable="true"][class*="chat"]', '.chat-input textarea'
  ];
  
  for (const s of selectors) {
    const el = document.querySelector(s);
    if (el && el.offsetParent) return el;
  }
  
  const allTextareas = document.querySelectorAll('textarea');
  for (const ta of allTextareas) {
    if (ta.offsetParent && !ta.placeholder?.toLowerCase().includes('search')) return ta;
  }
  
  return null;
}

function showTessToast(msg, type) {
  var el = document.createElement('div');
  el.style.cssText = 'position:fixed;bottom:20px;right:20px;z-index:999999;padding:10px 16px;border-radius:8px;font-size:12px;font-family:Segoe UI,sans-serif;box-shadow:0 4px 12px rgba(0,0,0,0.5);transition:opacity 0.3s;' +
    (type === 'success' ? 'background:#166534;border:1px solid #22c55e;color:#bbf7d0;' :
     type === 'warning' ? 'background:#713f12;border:1px solid #f59e0b;color:#fde68a;' :
     'background:#7f1d1d;border:1px solid #ef4444;color:#fecaca;');
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(function() { el.style.opacity = '0'; setTimeout(function() { el.remove(); }, 300); }, 3000);
}

function copyToChatInput(text) {
  const input = findChatInput();
  if (!input) return;
  
  if (input.isContentEditable || input.tagName === 'DIV') {
    input.innerHTML = text.replace(/\n/g, '<br>');
  } else {
    input.value = text;
  }
  input.focus();
  try { input.dispatchEvent(new Event('input', { bubbles: true })); } catch(e) {}
  try { input.dispatchEvent(new Event('keyup', { bubbles: true })); } catch(e) {}
  // Al copiar al chat, detener el timer de respuesta pendiente
  stopResponseTimer();
}

function findConversationItem(clientName) {
  const items = document.querySelectorAll(TALK_Y.DIALOG_ITEMS);
  for (const item of items) {
    const nameEl = item.querySelector(TALK_Y.DIALOG_ITEM_NAME);
    if (nameEl && nameEl.textContent.trim() === clientName) return item;
  }
  return null;
}

function isPinnedOrSaved(contactEl) {
  const text = contactEl.textContent.toLowerCase();
  if (text.includes('pin') || text.includes('saved') || text.includes('fijado') || text.includes('guardado')) return true;
  if (contactEl.querySelector('[class*="pin"], [class*="saved"], [class*="star"], [class*="fixed"], [src*="pin"], [src*="star"]')) return true;
  return false;
}

function cleanExtractedName(raw) {
  if (!raw) return '';
  var t = raw.trim();
  // Remover sufijos de edad: ", 53", " - 53", "(53)", "53"
  t = t.replace(/\s*[,–—-]\s*\d{1,3}\s*$/, '');
  t = t.replace(/\s*\(?\d{1,3}\)?\s*$/, '');
  t = t.replace(/\s*\d{1,3}\s*$/, '');
  // Remover texto después de paréntesis
  t = t.replace(/\s*\(.*$/, '');
  // Remover espacios múltiples
  t = t.replace(/\s{2,}/g, ' ').trim();
  return t.length > 1 ? t : '';
}

function parseAgeFromDate(dateStr) {
  if (!dateStr) return null;
  // Intentar parsear "January 01, 1973" o "01/01/1973" o "1973"
  var m = dateStr.match(/(\w+)\s+(\d{1,2}),?\s+(\d{4})/);
  if (m) {
    var months = { january:0, february:1, march:2, april:3, may:4, june:5, july:6, august:7, september:8, october:9, november:10, december:11 };
    var month = months[m[1].toLowerCase()];
    if (month !== undefined) {
      var year = parseInt(m[3]);
      var currentYear = new Date().getFullYear();
      var age = currentYear - year;
      if (age > 17 && age < 120) return age;
    }
  }
  // Intentar solo año
  var ym = dateStr.match(/(\d{4})/);
  if (ym) {
    var year2 = parseInt(ym[1]);
    var age2 = new Date().getFullYear() - year2;
    if (age2 > 17 && age2 < 120) return age2;
  }
  // Intentar número directo
  var nm = dateStr.match(/\b(\d{1,3})\b/);
  if (nm) {
    var num = parseInt(nm[1]);
    if (num > 17 && num < 120) return num;
  }
  return null;
}

function makeDraggable(panelId, headerSel) {
  const panel = document.getElementById(panelId);
  if (!panel) return;
  const header = panel.querySelector(headerSel);
  if (!header) return;
  let d = false, ix, iy;
  header.addEventListener('mousedown', e => {
    if (e.target.tagName === 'BUTTON' || e.target.tagName === 'INPUT') return;
    if (e.target.closest('.tess-resize')) return;
    d = true; ix = e.clientX - panel.offsetLeft; iy = e.clientY - panel.offsetTop;
  });
  document.addEventListener('mousemove', e => {
    if (!d) return;
    panel.style.left = (e.clientX - ix) + 'px'; panel.style.top = (e.clientY - iy) + 'px';
    panel.style.bottom = 'auto'; panel.style.right = 'auto';
    panel.style.transform = 'none'; // Evitar conflicto con translateX(-50%) del eater
  });
  document.addEventListener('mouseup', () => { d = false; });
  // Inicializar resize en las esquinas
  panel.querySelectorAll('.tess-resize').forEach(handle => {
    handle.addEventListener('mousedown', function(ev) {
      ev.stopPropagation();
      ev.preventDefault();
      const corner = this.className.includes('se') ? 'se' : this.className.includes('sw') ? 'sw' : this.className.includes('ne') ? 'ne' : 'nw';
      const startX = ev.clientX, startY = ev.clientY;
      const startW = panel.offsetWidth, startH = panel.offsetHeight;
      const startL = panel.offsetLeft, startT = panel.offsetTop;
      function doResize(me) {
        const dx = me.clientX - startX, dy = me.clientY - startY;
        if (corner === 'se') {
          panel.style.width = Math.max(280, startW + dx) + 'px';
          panel.style.height = Math.max(200, startH + dy) + 'px';
        } else if (corner === 'sw') {
          panel.style.width = Math.max(280, startW - dx) + 'px';
          panel.style.left = (startL + dx) + 'px';
          panel.style.height = Math.max(200, startH + dy) + 'px';
        } else if (corner === 'ne') {
          panel.style.width = Math.max(280, startW + dx) + 'px';
          panel.style.top = (startT + dy) + 'px';
          panel.style.height = Math.max(200, startH - dy) + 'px';
        } else if (corner === 'nw') {
          panel.style.width = Math.max(280, startW - dx) + 'px';
          panel.style.left = (startL + dx) + 'px';
          panel.style.top = (startT + dy) + 'px';
          panel.style.height = Math.max(200, startH - dy) + 'px';
        }
      }
      function stopResize() {
        document.removeEventListener('mousemove', doResize);
        document.removeEventListener('mouseup', stopResize);
      }
      document.addEventListener('mousemove', doResize);
      document.addEventListener('mouseup', stopResize);
    });
  });
}
