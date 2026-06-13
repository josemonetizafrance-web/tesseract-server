// TESSERACT v24 - DOM Contact Finder
// Utilities para localizar contactos en secciones específicas del DOM de Talkytimes

// ============ EXTRAER IDs DESDE ACTIVE LIMITS (MAIL) ============
function getIdsFromActiveLimits() {
  const ids = new Set();

  // Intentar selectores de Active Limits en sección MAIL
  // Talkytimes muestra listas de contactos con links a perfiles
  const selectors = [
    '.active-limits a[href]',        // clase directa
    '[class*="active"][class*="limit"] a[href]',
    '[class*="active-limit"] a[href]',
    '[class*="mail"] [class*="active"] a[href]',
    '.ml-contact-list a[href]',
    '.contact-item a[href]',
    '.ml-user-list a[href]',
    '.limited-user a[href]',
    'td a[href]',                    // tablas de mailing
    'tr a[href]',                    // filas de tabla
    '[class*="user-link"] a[href]',
    'a[class*="profile-link"][href]',
  ];

  for (const sel of selectors) {
    try {
      const links = document.querySelectorAll(sel);
      for (const link of links) {
        const href = link.href || link.getAttribute('href') || '';
        const match = href.match(/\/(\d{6,15})(?:[/?#]|$)/);
        if (match) {
          ids.add(match[1]);
        }
        // También intentar texto del enlace
        const textId = extractIdFromText(link.textContent || '');
        if (textId) ids.add(textId);
      }
    } catch (e) {}
  }

  // Fallback: buscar cualquier contenedor que diga "ACTIVE" o "LIMITS"
  try {
    const activeSections = document.querySelectorAll(TALK_Y.ACTIVE_SECTION);
    for (const section of activeSections) {
      const sectionText = (section.textContent || '').toLowerCase();
      if (sectionText.includes('active') || sectionText.includes('limit')) {
        const links = section.querySelectorAll(TALK_Y.ALL_LINKS);
        for (const link of links) {
          const href = link.href || '';
          const match = href.match(/\/(\d{6,15})(?:[/?#]|$)/);
          if (match) ids.add(match[1]);
          const textId = extractIdFromText(link.textContent || '');
          if (textId) ids.add(textId);
        }
      }
    }
  } catch (e) {}

  // Fallback ultimo: buscar TODOS los links con IDs numéricos de 6-15 dígitos
  if (ids.size === 0) {
    try {
      const allLinks = document.querySelectorAll(TALK_Y.ALL_LINKS);
      for (const link of allLinks) {
        const href = link.href || '';
        const match = href.match(/\/(\d{6,15})(?:[/?#]|$)/);
        if (match) ids.add(match[1]);
      }
    } catch (e) {}
  }

  console.log('[DOM-FINDER] Active Limits IDs encontrados:', ids.size, [...ids]);
  return Array.from(ids);
}

// ============ EXTRAER IDs DESDE MENSAJES ACTIVE ============
function getIdsFromMessagesActive() {
  const ids = new Set();

  // Selectores para sección MENSAJES
  const selectors = [
    '.message-contact-list a[href]',
    '.mailbox-contact a[href]',
    '.conversation-list a[href]',
    '.msg-contact a[href]',
    '[class*="message"] [class*="list"] a[href]',
    '[class*="msg"] [class*="user"] a[href]',
    '[class*="chat-list"] a[href]',
    '[class*="inbox"] a[href]',
    '.inbox-contact a[href]',
    '.mail-user a[href]',
  ];

  for (const sel of selectors) {
    try {
      const links = document.querySelectorAll(sel);
      for (const link of links) {
        const href = link.href || link.getAttribute('href') || '';
        const match = href.match(/\/(\d{6,15})(?:[/?#]|$)/);
        if (match) ids.add(match[1]);
        const textId = extractIdFromText(link.textContent || '');
        if (textId) ids.add(textId);
      }
    } catch (e) {}
  }

  // Fallback: buscar secciones que contengan "message" o "mailbox"
  try {
    const containers = document.querySelectorAll('[class*="message"], [id*="message"], [class*="mailbox"], [class*="inbox"]');
    for (const container of containers) {
      const links = container.querySelectorAll(TALK_Y.ALL_LINKS);
      for (const link of links) {
        const href = link.href || '';
        const match = href.match(/\/(\d{6,15})(?:[/?#]|$)/);
        if (match) ids.add(match[1]);
      }
    }
  } catch (e) {}

  // Fallback: TODO a la página
  if (ids.size === 0) {
    try {
      const allLinks = document.querySelectorAll(TALK_Y.ALL_LINKS);
      for (const link of allLinks) {
        const href = link.href || '';
        const match = href.match(/\/(\d{6,15})(?:[/?#]|$)/);
        if (match) ids.add(match[1]);
      }
    } catch (e) {}
  }

  console.log('[DOM-FINDER] Messages Active IDs encontrados:', ids.size, [...ids]);
  return Array.from(ids);
}

// Extraer ID numérico de texto
function extractIdFromText(text) {
  const match = text.match(/\b(\d{6,15})\b/);
  return match ? match[1] : null;
}

// ============ EXTRAER IDs DESDE CUALQUIER LISTA DE CONTACTOS ============
function getIdsFromContactList() {
  const ids = new Set();

  // Buscar IDs en atributos data
  const dataSelectors = [
    '[data-user-id]', '[data-contact-id]', '[data-member-id]',
    '[data-profile-id]', '[data-id]'
  ];
  for (const sel of dataSelectors) {
    try {
      const elements = document.querySelectorAll(sel);
      for (const el of elements) {
        const val = el.getAttribute(sel.replace('[', '').replace(']', '')) ||
                    el.getAttribute('data-id') ||
                    el.getAttribute('data-user-id') ||
                    el.getAttribute('data-contact-id') ||
                    el.getAttribute('data-member-id') ||
                    el.getAttribute('data-profile-id');
        if (val && /^\d{6,15}$/.test(val.trim())) {
          ids.add(val.trim());
        }
      }
    } catch (e) {}
  }

  // Buscar IDs en hrefs de enlaces a perfiles
  try {
    const profileLinks = document.querySelectorAll('a[href*="/member/"], a[href*="/user/"], a[href*="/profile/"]');
    for (const link of profileLinks) {
      const href = link.href || '';
      const match = href.match(/\/(\d{6,15})(?:[/?#]|$)/);
      if (match) ids.add(match[1]);
    }
  } catch (e) {}

  // Buscar IDs en elementos de lista
  try {
    const listItems = document.querySelectorAll(TALK_Y.CONTACT_ITEMS);
    for (const item of listItems) {
      const idsInItem = (item.textContent || '').match(/\b\d{6,15}\b/g);
      if (idsInItem) idsInItem.forEach(id => ids.add(id));

      // también verificar atributos
      for (const attr of ['data-id', 'data-uid', 'data-user', 'data-contact']) {
        const val = item.getAttribute(attr);
        if (val && /^\d{6,15}$/.test(val.trim())) ids.add(val.trim());
      }
    }
  } catch (e) {}

  console.log('[DOM-FINDER] Contact List IDs encontrados:', ids.size, [...ids]);
  return Array.from(ids);
}

// ============ FUNCIÓN PRINCIPAL: Obtener IDs según fuente ============
function collectIDsFromDOM(source) {
  switch (source) {
    case 'active-limits':
      return getIdsFromActiveLimits();
    case 'messages-active':
      return getIdsFromMessagesActive();
    case 'contact-list':
      return getIdsFromContactList();
    default:
      // Intentar todos
      const all = new Set([
        ...getIdsFromActiveLimits(),
        ...getIdsFromMessagesActive(),
        ...getIdsFromContactList()
      ]);
      return Array.from(all);
  }
}