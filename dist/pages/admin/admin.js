// admin.js - TESSERACT v24.0
var TESSERACT_API = 'https://tesseract-jblo.onrender.com';

let currentToken = '';
let currentAdminEmail = '';
let userOffice = '';
let isOfficeAdmin = false;
let isMasterAdmin = false;
let metricsErrorCount = 0;
let refreshIntervalId = null;

// ── Tab switching ──
function initTabs() {
  document.querySelectorAll('.tab-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var tabName = this.dataset.tab;
      document.querySelectorAll('.tab-btn').forEach(function (b) { b.classList.remove('active'); });
      document.querySelectorAll('.tab-content').forEach(function (c) { c.classList.remove('active'); });
      this.classList.add('active');
      var tabEl = document.getElementById('tab' + tabName.charAt(0).toUpperCase() + tabName.slice(1));
      if (tabEl) tabEl.classList.add('active');
      var office = isOfficeAdmin && !isMasterAdmin ? userOffice : document.getElementById('office-filter').value;
      if (tabName === 'dashboard') loadUserStatus(office);
      if (tabName === 'users') loadUserList(office);
      if (tabName === 'activity') loadActivityLog(office);
      if (tabName === 'offices') { loadOffices(); loadOfficesList(); }
      if (tabName === 'calendar') loadCalendar();
    });
  });
}

// ── Cursor Tesseract ──
function initCursorTesseract() {
  var el = document.getElementById('cursor-tesseract');
  if (!el) return;
  var mx = window.innerWidth / 2, my = window.innerHeight / 2;
  var cx = mx, cy = my;

  document.addEventListener('mousemove', function (e) {
    mx = e.clientX;
    my = e.clientY;
  });

  function tick() {
    cx += (mx - cx) * 0.08;
    cy += (my - cy) * 0.08;
    el.style.left = (cx - 32) + 'px';
    el.style.top = (cy - 32) + 'px';
    requestAnimationFrame(tick);
  }
  tick();
}

function apiFetch(endpoint, options = {}) {
  const method = options.method || 'GET';
  const headers = {
    'Authorization': `Bearer ${currentToken}`,
    'Content-Type': 'application/json'
  };
  const fetchOptions = { method, headers, signal: AbortSignal.timeout(15000) };
  if (options.body) {
    fetchOptions.body = typeof options.body === 'string' ? options.body : JSON.stringify(options.body);
  }
  
  return fetch(`${TESSERACT_API}${endpoint}`, fetchOptions).then(async res => {
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `Error ${res.status}`);
    }
    return res.json();
  }).catch(e => {
    if (e.name === 'TimeoutError' || e.name === 'AbortError') {
      throw new Error('Timeout: el servidor no responde. Puede estar iniciándose.');
    }
    console.error('[ADMIN] API Error:', e.message);
    throw e;
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  const urlParams = new URLSearchParams(window.location.search);
  const encodedToken = urlParams.get('token');
  currentToken = encodedToken ? decodeURIComponent(encodedToken) : '';
  
  if (!currentToken) {
    window.location.href = chrome.runtime.getURL('dist/pages/login/login.html');
    return;
  }
  
  try {
    await initAdminPanel();
  } catch(e) {
    console.error('[ADMIN] Init error:', e);
    document.body.innerHTML = `<div style="padding:40px;color:#ef4444;font-family:monospace;background:#0a0a0f;min-height:100vh;">Error: ${e.message}</div>`;
  }
});

async function initAdminPanel() {
  try {
    const data = await apiFetch('/api/tess/auth/verify');
    if (!data || (!data.isAdmin && !data.isDeveloper && !data.isOfficeAdmin)) {
      document.body.innerHTML = `
        <div style="padding:40px;text-align:center;color:#ef4444;font-family:monospace;background:#0a0a0f;min-height:100vh;">
          <h1>⛔ SIN ACCESO</h1>
          <p style="color:#888;margin:20px 0;">No tienes permisos de administrador.</p>
        </div>
      `;
      return;
    }

    currentAdminEmail = data.email;
    userOffice = data.office;
    isOfficeAdmin = data.isOfficeAdmin;
    isMasterAdmin = data.isDeveloper === true || data.isAdmin === true;
    
    document.getElementById('admin-email').textContent = data.email + (userOffice ? ` — ${userOffice}` : '');
    
    // --- Office admin: vista restringida a su oficina ---
    if (isOfficeAdmin && !isMasterAdmin) {
      const officeTab = document.querySelector('.tab-btn[data-tab="offices"]');
      if (officeTab) officeTab.style.display = 'none';
      const adminTab = document.querySelector('.tab-btn[data-tab="admin"]');
      if (adminTab) adminTab.style.display = 'none';
      
      document.getElementById('office-filter').style.display = 'none';
      
      const officeInput = document.getElementById('new-user-office');
      if (officeInput) {
        officeInput.value = userOffice;
        officeInput.disabled = true;
        officeInput.placeholder = userOffice;
        officeInput.style.display = 'none';
      }
      const typeSelect = document.getElementById('new-user-type');
      if (typeSelect) {
        typeSelect.innerHTML = '<option value="operador">Operador</option>';
        typeSelect.value = 'operador';
        typeSelect.style.display = 'none';
      }
      const userTypeLabel = document.querySelector('label[for="new-user-type"]');
      if (userTypeLabel) userTypeLabel.style.display = 'none';
      
      const userTitle = document.querySelector('#user-management-section .panel-title');
      if (userTitle) userTitle.textContent = `GESTIÓN DE OPERADORES — ${userOffice}`;
      
      const actionsPanel = document.getElementById('admin-actions-panel');
      if (actionsPanel) actionsPanel.style.display = 'none';
      
      const calFilter = document.getElementById('calendar-office-filter');
      if (calFilter) {
        calFilter.innerHTML = `<option value="${userOffice}">${userOffice}</option>`;
        calFilter.disabled = true;
      }
    } else {
      if (!isMasterAdmin) {
        const adminTab = document.querySelector('.tab-btn[data-tab="admin"]');
        if (adminTab) adminTab.style.display = 'none';
      }
    }
    
    await loadOffices();
    await loadOfficesList();
    await populateCalendarOfficeFilter();
    
    if (!isOfficeAdmin || isMasterAdmin) {
      document.getElementById('office-filter').addEventListener('change', async () => {
        const office = document.getElementById('office-filter').value;
        await loadMetrics(office);
        await loadUserList(office);
        await loadActivityLog(office);
        await loadUserStatus(office);
      });
    }
    
    document.getElementById('btn-refresh').addEventListener('click', async () => { 
      const office = isOfficeAdmin && !isMasterAdmin ? userOffice : document.getElementById('office-filter').value;
      await loadMetrics(office); await loadUserList(office); await loadActivityLog(office); await loadBotActions(); await loadUserStatus(office); await loadDeveloperList();
    });
    document.getElementById('btn-logout').addEventListener('click', async () => {
      await chrome.storage.local.clear();
      window.location.href = chrome.runtime.getURL('dist/pages/login/login.html');
    });
    document.getElementById('btn-activate-premium').addEventListener('click', activatePremium);
    document.getElementById('btn-ban-user').addEventListener('click', banUser);
    document.getElementById('btn-unban-user').addEventListener('click', unbanUser);
    document.getElementById('btn-change-password').addEventListener('click', changePassword);
    document.getElementById('btn-add-dev').addEventListener('click', addDeveloper);
    document.getElementById('btn-dump-storage').addEventListener('click', dumpStorage);
    document.getElementById('btn-test-write').addEventListener('click', testWriteToStorage);
    document.getElementById('btn-clear-debug').addEventListener('click', () => {
      document.getElementById('storage-debug-container').textContent = 'Haz clic en DUMP STORAGE';
    });
    document.getElementById('btn-create-user').addEventListener('click', createUser);
    document.getElementById('btn-create-office').addEventListener('click', createOffice);
    document.getElementById('btn-load-calendar').addEventListener('click', loadCalendar);
    document.getElementById('btnResetLog').addEventListener('click', resetActivityLog);
    
    initTabs();
    initCursorTesseract();
    
    const initialOffice = isOfficeAdmin && !isMasterAdmin ? userOffice : 'all';
    await loadMetrics(initialOffice);
    await loadUserList(initialOffice);
    await loadDeveloperList();
    await loadActivityLog(initialOffice);
    await loadBotActions();
    await loadUserStatus(initialOffice);
    if (refreshIntervalId) clearInterval(refreshIntervalId);
    refreshIntervalId = setInterval(() => { 
      const office = isOfficeAdmin && !isMasterAdmin ? userOffice : document.getElementById('office-filter').value;
      loadMetrics(office); loadActivityLog(office); loadBotActions(); loadUserStatus(office);
    }, 5000);
    
    apiFetch('/api/tess/admin/heartbeat', { method: 'POST' }).catch(function(){});
    setInterval(function() {
      apiFetch('/api/tess/admin/heartbeat', { method: 'POST' }).catch(function(){});
    }, 120000);

  } catch (e) {
    console.error('[ADMIN] initAdminPanel Error:', e);
    document.body.innerHTML = `
      <div id="error-container" style="padding:40px;color:#ef4444;font-family:monospace;background:#0a0a0f;min-height:100vh;">
        <h2 style="color:#ef4444;">ERROR EN ADMIN PANEL</h2>
        <p style="color:#fca5a5;margin:16px 0;">${e.message}</p>
        <p style="color:#888;font-size:12px;margin-top:20px;">Revisa la consola (F12) para más detalles.</p>
        <button id="btn-error-login" style="margin-top:20px;padding:10px 20px;background:#8b5cf6;border:none;border-radius:4px;color:#fff;cursor:pointer;">IR AL LOGIN</button>
      </div>`;
    document.getElementById('btn-error-login').addEventListener('click', () => {
      window.location.href = chrome.runtime.getURL('dist/pages/login/login.html');
    });
  }
}

async function loadOffices() {
  if (isOfficeAdmin && !isMasterAdmin) return; // Office admin no necesita cargar oficinas
  try {
    const data = await apiFetch('/api/tess/admin/offices');
    const select = document.getElementById('office-filter');
    select.innerHTML = '<option value="all">Todas las oficinas</option>';
    if (data.offices && data.offices.length > 0) {
      data.offices.forEach(office => {
        const name = office.name || office;
        select.innerHTML += `<option value="${name}">${name}</option>`;
      });
      console.log('[ADMIN] Oficinas cargadas:', data.offices.length);
    } else {
      console.warn('[ADMIN] No hay oficinas registradas en el servidor');
    }
  } catch (e) { 
    console.error('[ADMIN] Error al cargar oficinas:', e.message);
  }
}

async function loadOfficesList() {
  if (isOfficeAdmin && !isMasterAdmin) return; // Office admin no ve la lista de oficinas
  try {
    const data = await apiFetch('/api/tess/admin/offices');
    const container = document.getElementById('offices-list');
    if (!container) return;
    if (!data.offices || !data.offices.length) {
      container.innerHTML = '<div style="padding:20px;text-align:center;color:#555;">Sin oficinas registradas</div>';
      return;
    }
    container.innerHTML = data.offices.map(o => {
      const name = o.name || o;
      return '<div style="display:flex;flex-direction:column;gap:6px;background:rgba(245,158,11,0.08);border:1px solid #f59e0b;border-radius:8px;padding:12px 16px;text-align:center;font-family:inherit;color:#f59e0b;font-size:14px;font-weight:700;">' +
        '<span>' + name + '</span>' +
        '<button class="btn-del-office" data-office="' + name + '" style="padding:4px 8px;background:transparent;border:1px solid #ef4444;color:#ef4444;border-radius:4px;cursor:pointer;font-size:10px;font-weight:600;">✕ ELIMINAR</button>' +
        '</div>';
    }).join('');

    container.querySelectorAll('.btn-del-office').forEach(function (btn) {
      btn.addEventListener('click', async function (e) {
        e.stopPropagation();
        const name = btn.dataset.office;
        if (!confirm('¿Eliminar la oficina "' + name + '"? Los usuarios no se borrarán, solo la oficina.')) return;
        try {
          await apiFetch('/api/tess/admin/offices/' + encodeURIComponent(name), { method: 'DELETE' });
          await loadOfficesList();
        } catch (e) { alert('Error: ' + e.message); }
      });
    });
  } catch (e) { console.warn('[ADMIN] loadOfficesList:', e); }
}

async function loadMetrics(office = 'all') {
  try {
    const query = office && office !== 'all' ? `?office=${encodeURIComponent(office)}` : '';
    const data = await apiFetch(`/api/tess/admin/metrics${query}`);
    if (!data) return;
    metricsErrorCount = 0;
    document.getElementById('metric-active-users').textContent = data.users?.active || 0;
    document.getElementById('metric-demo-users').textContent = data.users?.demo || 0;
    document.getElementById('metric-premium-users').textContent = data.users?.premium || 0;
    document.getElementById('metric-developer-users').textContent = data.users?.developers || 0;
    document.getElementById('metric-today-sessions').textContent = data.users?.active || 0;
  } catch (e) {
    metricsErrorCount++;
    if (metricsErrorCount <= 3) console.error('[ADMIN] loadMetrics:', e);
  }
}

async function loadUserStatus(office) {
  try {
    const query = office && office !== 'all' ? `?office=${encodeURIComponent(office)}` : '';
    const data = await apiFetch(`/api/tess/admin/users${query}`);
    if (!data?.users) return;
    const grid = document.getElementById('user-status-grid');
    if (!grid) return;

    const now = Date.now();
    const FIVE_MIN = 300000;
    let html = '';
    data.users.forEach(function (u) {
      const lastAct = u.last_activity ? new Date(u.last_activity).getTime() : 0;
      const isOnline = (now - lastAct) < FIVE_MIN;
      const statusColor = isOnline ? '#22c55e' : '#ef4444';
      const statusText = isOnline ? 'CONECTADO' : 'OFFLINE';
      const officeLabel = u.office || '—';
      const emailParts = u.email.split('@');
      const displayName = emailParts[0];

      html += '<div class="status-card">';
      html += '<div style="font-size:10px;color:#888;margin-bottom:4px;">' + officeLabel + '</div>';
      html += '<div style="font-size:12px;font-weight:700;color:#1a1a2e;margin-bottom:8px;word-break:break-all;">' + displayName + '</div>';
      html += '<button class="status-btn" style="width:100%;padding:8px 0;border:none;border-radius:6px;background:' + statusColor + ';color:#fff;cursor:default;font-weight:700;font-size:10px;letter-spacing:0.5px;" disabled>' + statusText + '</button>';
      html += '</div>';
    });
    grid.innerHTML = html || '<div style="color:#888;text-align:center;padding:20px;">Sin usuarios</div>';
  } catch (e) {
    console.error('[ADMIN] loadUserStatus:', e);
  }
}

async function loadUserList(office = 'all') {
  try {
    const query = office && office !== 'all' ? `?office=${encodeURIComponent(office)}` : '';
    const data = await apiFetch(`/api/tess/admin/users-with-metrics${query}`);
    if (!data?.users) {
      console.warn('[ADMIN] No se recibieron usuarios del servidor');
      return;
    }
    const tbody = document.getElementById('user-table-body');
    tbody.innerHTML = '';

    if (!data.users.length) {
      tbody.innerHTML = '<tr><td colspan="11" class="empty-msg">Sin usuarios</td></tr>';
      return;
    }

    data.users.forEach(function (u) {
      var isMaster = u.is_developer === 1 || u.is_developer === true;
      var statusText = u.role, statusClass = 'status-demo';
      if (isMaster || u.is_developer) { statusText = 'DESARROLLADOR'; statusClass = 'status-premium'; }
      else if (u.role === 'premium') { statusText = 'PREMIUM'; statusClass = 'status-premium'; }
      else if (u.is_banned) { statusText = 'BANEADO'; statusClass = 'status-banned'; }
      else if (u.role === 'expired') { statusText = 'EXPIRADO'; statusClass = 'status-expired'; }

      var officeLabel = u.office || '—';
      var activeLabel = (u.is_banned || u.role === 'expired') ? 'INACTIVO' : 'ACTIVO';
      var activeColor = (u.is_banned || u.role === 'expired') ? '#ef4444' : '#22c55e';
      var m = u.metrics_today || {};
      var likes = m.likes || 0;
      var follows = m.follows || 0;
      var autoResp = m.auto_response || 0;
      var mailing = m.mailing || 0;

      var row = document.createElement('tr');
      row.innerHTML =
        '<td><span style="color:#f59e0b;font-weight:600;">' + officeLabel + '</span><br><small style="color:' + activeColor + ';font-size:9px;">' + activeLabel + '</small></td>' +
        '<td style="font-weight:500;">' + u.email + '</td>' +
        '<td><span class="status-badge ' + statusClass + '">' + statusText + '</span></td>' +
        '<td>' + (u.login_count || 0) + '</td>' +
        '<td><span class="metric-badge likes">' + likes + '</span></td>' +
        '<td><span class="metric-badge follows">' + follows + '</span></td>' +
        '<td><span class="metric-badge auto-resp">' + autoResp + '</span></td>' +
        '<td><span class="metric-badge mailing">' + mailing + '</span></td>' +
        '<td>' + (!isMaster ? '<button class="action-btn premium btn-premium" data-email="' + u.email + '">PREMIUM</button>' : '') + '</td>' +
        '<td><input type="text" class="input-field plan-input" data-email="' + u.email + '" placeholder="plan..." style="width:70px;padding:4px 8px;font-size:10px;min-width:0;">' +
            '<button class="action-btn btn-set-plan" data-email="' + u.email + '" style="padding:4px 8px;margin-left:4px;">SET</button></td>' +
        '<td>' + (!isMaster ? '<button class="action-btn btn-danger btn-delete-user" data-email="' + u.email + '" style="padding:4px 8px;">✕</button>' : '') + '</td>';
      tbody.appendChild(row);
    });

    tbody.addEventListener('click', async function (e) {
      var target = e.target.closest('button');
      if (!target) return;
      var email = target.dataset.email;
      if (!email) return;
      if (target.classList.contains('btn-premium')) {
        await apiFetch('/api/tess/admin/premium', { method: 'POST', body: { email } });
        await loadMetrics(isOfficeAdmin && !isMasterAdmin ? userOffice : 'all'); await loadUserList(isOfficeAdmin && !isMasterAdmin ? userOffice : 'all');
      }
      if (target.classList.contains('btn-set-plan')) {
        var plan = target.closest('tr').querySelector('.plan-input').value.trim().toLowerCase();
        if (!plan) return;
        await apiFetch('/api/tess/admin/set-plan', { method: 'POST', body: { email, plan } });
        await loadUserList(isOfficeAdmin && !isMasterAdmin ? userOffice : 'all');
      }
      if (target.classList.contains('btn-delete-user')) {
        if (!confirm('¿Eliminar usuario ' + email + '?')) return;
        try {
          await apiFetch('/api/tess/admin/users/' + encodeURIComponent(email), { method: 'DELETE' });
          await loadUserList(isOfficeAdmin && !isMasterAdmin ? userOffice : 'all');
        } catch (err) { alert('Error: ' + err.message); }
      }
    });
  } catch (e) { console.error('[ADMIN] loadUserList:', e); }
}

async function loadActivityLog(office = 'all') {
  try {
    const container = document.getElementById('log-container');
    if (!container) return;
    
    const query = office && office !== 'all' ? `&office=${encodeURIComponent(office)}` : '';
    const data = await apiFetch(`/api/tess/admin/activity-log?limit=50${query}`);
    
    container.innerHTML = '';
    if (!data?.logs?.length) {
      container.innerHTML = '<div style="padding:20px;text-align:center;color:#555;">Sin actividad</div>';
      return;
    }
    
    let html = '<div style="display:grid;grid-template-columns:100px 1fr 100px 120px;gap:4px;font-size:10px;color:#8b5cf6;padding:6px 8px;border-bottom:1px solid #333;font-weight:bold;text-transform:uppercase;letter-spacing:0.5px;"><span>OFICINA</span><span>OPERADOR / ACCIÓN</span><span>FECHA</span><span>HORA</span></div>';
    
    data.logs.forEach(entry => {
      const ts = entry.created_at ? new Date(entry.created_at) : new Date();
      const dateStr = ts.toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit' });
      const timeStr = ts.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      const officeName = entry.office || '—';
      const operator = entry.email || '—';
      const action = entry.action || '';
      const actionType = entry.action_type ? ` (${entry.action_type})` : '';
      
      html += `<div style="display:grid;grid-template-columns:100px 1fr 100px 120px;gap:4px;padding:8px;border-bottom:1px solid #222;font-size:11px;color:#aaa;align-items:start;">
        <span style="color:#f59e0b;font-weight:500;">${officeName}</span>
        <div><span style="color:#fff;">${operator}</span><br><span style="color:#ccc;font-size:10px;">${action}${actionType}</span></div>
        <span style="color:#888;">${dateStr}</span>
        <span style="color:#8b5cf6;">${timeStr}</span>
      </div>`;
    });
    container.innerHTML = html;
  } catch (e) { 
    const container = document.getElementById('log-container');
    if (container) container.innerHTML = '<div style="padding:20px;color:#ef4444;">Error: ' + e.message + '</div>';
  }
}

async function loadBotActions() {
  try {
    const container = document.getElementById('bot-actions-container');
    if (!container) return;
    const data = await apiFetch('/api/tess/admin/bot-actions?limit=50');
    container.innerHTML = '';
    if (!data?.actions?.length) {
      container.innerHTML = '<div style="padding:20px;text-align:center;color:#888;">Sin acciones de bot</div>';
      return;
    }
    let html = '<div style="display:grid;grid-template-columns:100px 1fr 120px;gap:4px;font-size:10px;color:#7c3aed;padding:6px 8px;border-bottom:1px solid #e0e0e8;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;"><span>USUARIO</span><span>ACCIÓN</span><span>HORA</span></div>';
    data.actions.forEach(function (a) {
      var ts = a.created_at ? new Date(a.created_at) : new Date();
      var timeStr = ts.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      var email = a.email || '—';
      var action = a.action || '';
      var detail = a.action_type || '';
      var actionLabel = action;
      if (action === 'LFP' || action === 'L+F+P' || action === 'LFP_UNIFICADO') actionLabel = '🔄 L+F+P';
      else if (action === 'SALUDOS') actionLabel = '👋 SALUDOS';
      else if (action === 'CARTAS') actionLabel = '📨 CARTAS';
      else if (action === 'MAILING') actionLabel = '📬 MAILING';
      else if (action === 'AUTO_ANSWER') actionLabel = '🤖 AUTO-RESP';
      else if (action === 'PERIODIC_SYNC') actionLabel = '⏳ SYNC';
      else if (action === 'BLACKLIST') actionLabel = '🚫 BLACKLIST';
      html += '<div style="display:grid;grid-template-columns:100px 1fr 120px;gap:4px;padding:8px;border-bottom:1px solid #f0f0f5;font-size:11px;color:#555;align-items:center;">';
      html += '<span style="color:#1a1a2e;font-weight:500;">' + email.split('@')[0] + '</span>';
      html += '<div><span style="color:#7c3aed;font-weight:600;">' + actionLabel + '</span>' + (detail ? ' <span style="color:#888;font-size:10px;">' + detail + '</span>' : '') + '</div>';
      html += '<span style="color:#aaa;font-size:10px;">' + timeStr + '</span>';
      html += '</div>';
    });
    container.innerHTML = html;
  } catch (e) {
    var container = document.getElementById('bot-actions-container');
    if (container) container.innerHTML = '<div style="padding:20px;color:#ef4444;">Error: ' + e.message + '</div>';
  }
}

async function resetActivityLog() {
  if (!confirm('¿Estás seguro de eliminar todo el registro de actividad?')) return;
  try {
    const office = isOfficeAdmin && !isMasterAdmin ? userOffice : document.getElementById('office-filter')?.value || 'all';
    const query = office && office !== 'all' ? `?office=${encodeURIComponent(office)}` : '';
    const data = await apiFetch(`/api/tess/admin/activity-log${query}`, { method: 'DELETE' });
    if (data.success) {
      await loadActivityLog(office);
    }
  } catch (e) {
    alert('Error al resetear log: ' + e.message);
  }
}

async function activatePremium() {
  const email = document.getElementById('input-email').value.trim().toLowerCase();
  if (!email) return;
  try {
    await apiFetch('/api/tess/admin/premium', { method: 'POST', body: { email } });
    document.getElementById('input-email').value = '';
    const office = isOfficeAdmin && !isMasterAdmin ? userOffice : 'all';
    await loadMetrics(office); await loadUserList(office);
  } catch (e) { alert('Error: ' + e.message); }
}

async function banUser() {
  const email = document.getElementById('input-email').value.trim().toLowerCase();
  if (!email) return;
  try {
    await apiFetch('/api/tess/admin/ban', { method: 'POST', body: { email } });
    document.getElementById('input-email').value = '';
    await loadUserList(isOfficeAdmin && !isMasterAdmin ? userOffice : 'all');
  } catch (e) { alert(e.message); }
}

async function unbanUser() {
  const email = document.getElementById('input-email').value.trim().toLowerCase();
  if (!email) return;
  try {
    await apiFetch('/api/tess/admin/unban', { method: 'POST', body: { email } });
    document.getElementById('input-email').value = '';
    await loadUserList(isOfficeAdmin && !isMasterAdmin ? userOffice : 'all');
  } catch (e) { alert(e.message); }
}

async function changePassword() {
  const email = document.getElementById('input-email').value.trim().toLowerCase();
  const password = document.getElementById('new-password-input').value.trim();
  if (!email) return alert('Ingresa el email');
  if (!password) return alert('Ingresa la nueva contraseña');
  if (!password.endsWith('*+')) return alert('La contraseña debe terminar en *+');
  try {
    await apiFetch('/api/tess/admin/set-password', { method: 'POST', body: { email, password } });
    document.getElementById('input-email').value = '';
    document.getElementById('new-password-input').value = '';
    alert('Contraseña actualizada correctamente');
  } catch (e) { alert(e.message); }
}

async function addDeveloper() {
  const email = document.getElementById('input-dev-email').value.trim().toLowerCase();
  if (!email) return;
  try {
    await apiFetch('/api/tess/admin/developer', { method: 'POST', body: { email, action: 'add' } });
    document.getElementById('input-dev-email').value = '';
    await loadUserList(isOfficeAdmin && !isMasterAdmin ? userOffice : 'all');
    await loadDeveloperList();
  } catch (e) { alert(e.message); }
}

async function removeDeveloper(email) {
  if (!confirm('¿Eliminar desarrollador ' + email + '?')) return;
  try {
    await apiFetch('/api/tess/admin/developer', { method: 'POST', body: { email, action: 'remove' } });
    await loadUserList(isOfficeAdmin && !isMasterAdmin ? userOffice : 'all');
    await loadDeveloperList();
  } catch (e) { alert(e.message); }
}

async function loadDeveloperList() {
  const container = document.getElementById('dev-list-items');
  if (!container) return;
  try {
    const data = await apiFetch('/api/tess/admin/users-with-metrics');
    const devs = (data.users || []).filter(function (u) { return u.is_developer === 1 || u.is_developer === true; });
    if (!devs.length) { container.innerHTML = '<div style="color:#aaa;font-size:11px;">No hay desarrolladores</div>'; return; }
    container.innerHTML = devs.map(function (u) {
      var isMaster = u.email === 'adminchevy@tesseract.com';
      return '<div style="display:flex;align-items:center;justify-content:space-between;padding:8px 12px;background:#f8f8fc;border-radius:8px;border:1px solid #f0f0f5;">' +
        '<span style="font-size:12px;font-weight:500;color:#1a1a2e;">' + u.email + '</span>' +
        '<button class="action-btn btn-danger btn-remove-dev" data-email="' + u.email + '" style="padding:4px 12px;font-size:11px;' + (isMaster ? 'opacity:0.4;cursor:not-allowed;' : '') + '" ' + (isMaster ? 'disabled' : '') + '>✕ ELIMINAR</button>' +
        '</div>';
    }).join('');
    container.querySelectorAll('.btn-remove-dev').forEach(function (btn) {
      btn.addEventListener('click', function () { removeDeveloper(btn.dataset.email); });
    });
  } catch (e) { container.innerHTML = '<div style="color:#ef4444;font-size:11px;">Error: ' + e.message + '</div>'; }
}

async function testWriteToStorage() {
  const container = document.getElementById('storage-debug-container');
  try {
    const res = await fetch(`${TESSERACT_API}/api/health`);
    const data = await res.json();
    container.textContent = '✅ Servidor OK: ' + new Date().toLocaleTimeString() + '\n' + JSON.stringify(data, null, 2);
  } catch (e) { container.textContent = '❌ Error: ' + e.message; }
}

async function dumpStorage() {
  const container = document.getElementById('storage-debug-container');
  container.textContent = 'Cargando...';
  try {
    const allData = await chrome.storage.local.get(null);
    let output = '=== chrome.storage.local (' + Object.keys(allData).length + ' claves) ===\n\n';
    Object.keys(allData).sort().forEach(key => {
      let val = allData[key];
      let str = '';
      try {
        if (typeof val === 'object') str = JSON.stringify(val, null, 2);
        else if (typeof val === 'string' && val.length > 500) str = val.slice(0, 500) + '...';
        else str = String(val);
      } catch (e) { str = '[Error]'; }
      output += key + ':\n' + str + '\n\n';
    });
    container.textContent = output;
  } catch (e) { container.textContent = '❌ ' + e.message; }
}

async function createUser() {
  const email = document.getElementById('new-user-email')?.value?.trim().toLowerCase();
  const password = document.getElementById('new-user-password')?.value?.trim();
  const officeEl = document.getElementById('new-user-office');
  const office = officeEl?.disabled ? userOffice : officeEl?.value?.trim();
  const userType = document.getElementById('new-user-type')?.value || 'operador';
  
  if (!email) return alert('Ingresa el email');
  if (!password) return alert('Ingresa la contraseña');
  if (!email.endsWith('@tesseract.com')) return alert('Solo correos @tesseract.com');
  if (!password.endsWith('*+')) return alert('La contraseña debe terminar en *+');
  
  try {
    console.log('[ADMIN] Creando usuario:', email, 'oficina:', office, 'tipo:', userType);
    const result = await apiFetch('/api/tess/admin/create-user', {
      method: 'POST',
      body: { email, password, office, userType }
    });
    
    console.log('[ADMIN] Respuesta create-user:', result);
    alert(`Usuario ${userType === 'admin' ? 'ADMIN' : 'OPERADOR'} creado correctamente`);
    document.getElementById('new-user-email').value = '';
    document.getElementById('new-user-password').value = '';
    if (!officeEl?.disabled) document.getElementById('new-user-office').value = '';
    document.getElementById('new-user-type').value = 'operador';
    await loadUserList(isOfficeAdmin && !isMasterAdmin ? userOffice : 'all');
    await loadOffices();
  } catch (e) { 
    console.error('[ADMIN] Error al crear usuario:', e);
    alert('Error al crear usuario: ' + e.message); 
  }
}

async function createOffice() {
  const name = document.getElementById('new-office-name')?.value?.trim();
  if (!name) return alert('Ingresa el nombre de la oficina');
  
  try {
    console.log('[ADMIN] Creando oficina:', name);
    const result = await apiFetch('/api/tess/admin/create-office', {
      method: 'POST',
      body: { name }
    });
    console.log('[ADMIN] Respuesta create-office:', result);
    alert('Oficina creada correctamente');
    document.getElementById('new-office-name').value = '';
    await loadOffices();
    await loadOfficesList();
  } catch (e) { 
    console.error('[ADMIN] Error al crear oficina:', e);
    alert('Error al crear oficina: ' + e.message); 
  }
}

async function loadCalendar() {
  const office = isOfficeAdmin && !isMasterAdmin ? userOffice : document.getElementById('calendar-office-filter').value;
  const days = document.getElementById('calendar-days').value;
  const grid = document.getElementById('calendar-grid');
  
  grid.innerHTML = '<div class="calendar-row" style="justify-content:center;padding:30px;color:#555;">Cargando...</div>';
  
  try {
    const query = office && office !== 'all' ? `?office=${encodeURIComponent(office)}&days=${days}` : `?days=${days}`;
    const data = await apiFetch(`/api/tess/admin/metrics-daily${query}`);
    
    if (!data?.dailyMetrics?.length) {
      grid.innerHTML = `
        <div class="calendar-row header-row">
          <div class="calendar-cell date-cell">FECHA</div>
          <div class="calendar-cell metric-cell">LIKES</div>
          <div class="calendar-cell metric-cell">FOLLOWS</div>
          <div class="calendar-cell metric-cell">AUTO-RESP</div>
          <div class="calendar-cell metric-cell">MAILING</div>
          <div class="calendar-cell total-cell">TOTAL</div>
        </div>
        <div class="calendar-row empty-row">No hay datos para el período seleccionado</div>`;
      return;
    }
    
    grid.innerHTML = `
      <div class="calendar-row header-row">
        <div class="calendar-cell date-cell">FECHA</div>
        <div class="calendar-cell metric-cell">LIKES</div>
        <div class="calendar-cell metric-cell">FOLLOWS</div>
        <div class="calendar-cell metric-cell">AUTO-RESP</div>
        <div class="calendar-cell metric-cell">MAILING</div>
        <div class="calendar-cell total-cell">TOTAL</div>
      </div>
      ${data.dailyMetrics.map(m => {
        const total = (m.likes || 0) + (m.follows || 0) + (m.auto_response || 0) + (m.mailing || 0);
        return `
          <div class="calendar-row">
            <div class="calendar-cell date-cell">${m.date}</div>
            <div class="calendar-cell metric-cell likes">${m.likes || 0}</div>
            <div class="calendar-cell metric-cell follows">${m.follows || 0}</div>
            <div class="calendar-cell metric-cell auto_response">${m.auto_response || 0}</div>
            <div class="calendar-cell metric-cell mailing">${m.mailing || 0}</div>
            <div class="calendar-cell total-cell">${total}</div>
          </div>
        `;
      }).join('')}`;
    
  } catch (e) {
    grid.innerHTML = `<div class="calendar-row empty-row">Error: ${e.message}</div>`;
  }
}

async function populateCalendarOfficeFilter() {
  if (isOfficeAdmin && !isMasterAdmin) return; // Office admin ya tiene su oficina fija
  try {
    const data = await apiFetch('/api/tess/admin/offices');
    const select = document.getElementById('calendar-office-filter');
    select.innerHTML = '<option value="all">Todas las oficinas</option>';
    if (data.offices) {
      data.offices.forEach(office => {
        const name = office.name || office;
        select.innerHTML += `<option value="${name}">${name}</option>`;
      });
    }
  } catch (e) { console.warn('[ADMIN] populateCalendarOfficeFilter:', e); }
}

// ============ SOLICITUDES PENDIENTES ============


