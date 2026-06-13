(function () {
  var TESSERACT_API = 'https://tesseract-jblo.onrender.com';
  var currentJwt = null;

  function formatTime(ms) {
    if (ms <= 0 || ms === Infinity) return ms === Infinity ? 'Ilimitado' : 'Expirado';
    var d = Math.floor(ms / 86400000);
    var h = Math.floor((ms % 86400000) / 3600000);
    return d > 0 ? d + ' d\u00edas ' + h + ' horas' : h + ' horas';
  }

  function showNotification(msg, type) {
    var el = document.getElementById('notification');
    el.textContent = msg;
    el.className = 'notification notification-' + type + ' show';
    setTimeout(function () { el.classList.remove('show'); }, 3000);
  }

  function notesApi(path, options) {
    return fetch(TESSERACT_API + path, {
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + currentJwt },
      ...options
    });
  }

  function escapeHtml(str) {
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function switchView(viewName) {
    document.querySelectorAll('.view').forEach(function (v) { v.classList.remove('active'); });
    document.querySelectorAll('.nav-item').forEach(function (n) { n.classList.remove('active'); });
    var targetView = document.getElementById('view-' + viewName);
    if (targetView) targetView.classList.add('active');
    var navItem = document.querySelector('.nav-item[data-view="' + viewName + '"]');
    if (navItem) navItem.classList.add('active');
    if (viewName === 'notes') renderMyNotes();
    if (viewName === 'cribs') { renderCribs(); initCribsTabs(); }
  }

  function renderMyNotes() {
    var list = document.getElementById('my-notes-list');
    list.innerHTML = '<p class="note-empty">Cargando notas...</p>';
    notesApi('/api/tess/notes').then(function (r) { return r.json(); }).then(function (data) {
      if (!data.notes || !data.notes.length) {
        list.innerHTML = '<p class="note-empty">No tienes notas todavia. Crea una arriba.</p>';
        return;
      }
      list.innerHTML = data.notes.map(function (n) {
        var sharedCount = (n.shared_with || []).length;
        var sharedBadge = sharedCount > 0 ? '<span class="note-shared-badge">Compartida (' + sharedCount + ')</span>' : '';
        return '<div class="note-card" data-id="' + n._id + '">' +
          '<div class="note-card-header">' +
            '<div>' +
              '<div class="note-card-title">' + escapeHtml(n.client_name || 'Sin nombre') + ' <span style="color:#666;font-weight:400;">#' + escapeHtml(n.client_id || '') + '</span></div>' +
              '<div class="note-card-sub">' + escapeHtml(n.profile_name || 'Sin perfil') + '</div>' +
            '</div>' +
            '<div>' + sharedBadge + '</div>' +
          '</div>' +
          '<div class="note-card-text">' + escapeHtml(n.note_text) + '</div>' +
          '<div class="note-card-actions">' +
            '<button class="btn-notes btn-notes-outline btn-notes-sm btn-edit-note" data-id="' + n._id + '">EDITAR</button>' +
            '<button class="btn-notes btn-notes-success btn-notes-sm btn-share-note" data-id="' + n._id + '">COMPARTIR</button>' +
            '<button class="btn-notes btn-notes-danger btn-notes-sm btn-delete-note" data-id="' + n._id + '">ELIMINAR</button>' +
          '</div>' +
          '<div class="note-card-meta">' + new Date(n.created_at).toLocaleString() + '</div>' +
        '</div>';
      });
      attachNoteActions();
    }).catch(function () {
      list.innerHTML = '<p class="note-empty" style="color:#ef4444;">Error al cargar notas</p>';
    });
  }

  function renderSharedNotes() {
    var list = document.getElementById('shared-notes-list');
    list.innerHTML = '<p class="note-empty">Cargando notas compartidas...</p>';
    notesApi('/api/tess/notes/shared').then(function (r) { return r.json(); }).then(function (data) {
      if (!data.notes || !data.notes.length) {
        list.innerHTML = '<p class="note-empty">No hay notas compartidas contigo</p>';
        return;
      }
      list.innerHTML = data.notes.map(function (n) {
        return '<div class="note-card">' +
          '<div class="note-card-header">' +
            '<div>' +
              '<div class="note-card-title">' + escapeHtml(n.client_name || 'Sin nombre') + ' <span style="color:#666;font-weight:400;">#' + escapeHtml(n.client_id || '') + '</span></div>' +
              '<div class="note-card-sub">' + escapeHtml(n.profile_name || 'Sin perfil') + '</div>' +
            '</div>' +
            '<div><span class="note-shared-badge">COMPARTIDA</span></div>' +
          '</div>' +
          '<div class="note-card-text">' + escapeHtml(n.note_text) + '</div>' +
          '<div class="note-card-meta">' + new Date(n.created_at).toLocaleString() + '</div>' +
        '</div>';
      });
    }).catch(function () {
      list.innerHTML = '<p class="note-empty" style="color:#ef4444;">Error al cargar notas compartidas</p>';
    });
  }

  function attachNoteActions() {
    document.querySelectorAll('.btn-edit-note').forEach(function (btn) {
      btn.addEventListener('click', function () { openEditModal(this.dataset.id); });
    });
    document.querySelectorAll('.btn-share-note').forEach(function (btn) {
      btn.addEventListener('click', function () { openShareModal(this.dataset.id); });
    });
    document.querySelectorAll('.btn-delete-note').forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (confirm('Eliminar esta nota?')) {
          notesApi('/api/tess/notes/' + this.dataset.id, { method: 'DELETE' }).then(function (r) { return r.json(); }).then(function (d) {
            if (d.success) { showNotification('Nota eliminada', 'success'); renderMyNotes(); }
            else { showNotification('Error al eliminar', 'error'); }
          }).catch(function () { showNotification('Error de conexion', 'error'); });
        }
      });
    });
  }

  var editingNoteId = null;
  function openEditModal(noteId) {
    editingNoteId = noteId;
    notesApi('/api/tess/notes').then(function (r) { return r.json(); }).then(function (data) {
      var note = data.notes.find(function (n) { return n._id === noteId; });
      if (!note) return;
      document.getElementById('edit-profile-name').value = note.profile_name || '';
      document.getElementById('edit-client-name').value = note.client_name || '';
      document.getElementById('edit-client-id').value = note.client_id || '';
      document.getElementById('edit-note-text').value = note.note_text || '';
      document.getElementById('edit-modal').style.display = 'flex';
    });
  }

  var sharingNoteId = null;
  function openShareModal(noteId) {
    sharingNoteId = noteId;
    var select = document.getElementById('share-user-select');
    select.innerHTML = '<option value="">Cargando usuarios...</option>';
    document.getElementById('share-modal').style.display = 'flex';
    notesApi('/api/tess/notes/users').then(function (r) { return r.json(); }).then(function (data) {
      if (!data.users || !data.users.length) {
        select.innerHTML = '<option value="">No hay otros usuarios disponibles</option>';
        return;
      }
      select.innerHTML = '<option value="">Selecciona un usuario...</option>' +
        data.users.map(function (u) { return '<option value="' + escapeHtml(u.email) + '">' + escapeHtml(u.email) + (u.office ? ' (' + escapeHtml(u.office) + ')' : '') + '</option>'; }).join('');
    }).catch(function () {
      select.innerHTML = '<option value="">Error al cargar usuarios</option>';
    });
  }

  // ====== CRIBS ======
  var cribsData = [];
  var cribSortField = 'updated_at';
  var cribSortDir = -1;

  function cribsApi(path, options) {
    return fetch(TESSERACT_API + path, {
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + currentJwt },
      ...options
    });
  }

  function renderCribs() {
    cribsApi('/api/tess/cribs').then(function (r) { return r.json(); }).then(function (data) {
      cribsData = data.cribs || [];
      applyCribFilters();
    }).catch(function () {
      document.getElementById('crib-table-placeholder').innerHTML = '<p style="color:#ef4444;">Error al cargar CRIBS</p>';
    });
  }

  function initCribsTabs() {
    document.querySelectorAll('.cribs-tab').forEach(function (tab) {
      tab.addEventListener('click', function () {
        document.querySelectorAll('.cribs-tab').forEach(function (t) { t.classList.remove('active'); });
        this.classList.add('active');
        applyCribFilters();
      });
    });
  }

  function applyCribFilters() {
    var activeTab = document.querySelector('.cribs-tab.active');
    var isCartasTab = activeTab && activeTab.dataset.cribsTab === 'cartas';
    var search = (document.getElementById('crib-search').value || '').toLowerCase();
    var statusFilter = document.getElementById('crib-filter-status').value;
    var priorityFilter = document.getElementById('crib-filter-priority').value;

    var filtered = cribsData.filter(function (e) {
      if (isCartasTab && !e.letter_style) return false;
      if (statusFilter && e.status !== statusFilter) return false;
      if (priorityFilter && e.priority !== priorityFilter) return false;
      if (search) {
        var text = (e.profile_id + ' ' + e.profile_name + ' ' + e.country + ' ' + e.city + ' ' + e.interests + ' ' + e.traits + ' ' + e.work + ' ' + e.marital_status + ' ' + e.movie_genres + ' ' + e.music_genres + ' ' + e.goal + ' ' + e.languages + ' ' + e.education + ' ' + e.looking_for + ' ' + e.body_type + ' ' + e.quick_notes).toLowerCase();
        if (isCartasTab) text += ' ' + (e.letter_style || '').toLowerCase();
        if (text.indexOf(search) === -1) return false;
      }
      return true;
    });

    // Sort
    filtered.sort(function (a, b) {
      var va = a[cribSortField], vb = b[cribSortField];
      if (va == null) va = '';
      if (vb == null) vb = '';
      if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * cribSortDir;
      return String(va).localeCompare(String(vb)) * cribSortDir;
    });

    renderCribsTable(filtered);
  }

  function renderCribsTable(list) {
    var container = document.getElementById('crib-table-container');
    var activeTab = document.querySelector('.cribs-tab.active');
    var isCartasTab = activeTab && activeTab.dataset.cribsTab === 'cartas';
    var countEl = document.getElementById('crib-count');
    countEl.textContent = list.length + ' / ' + cribsData.length + ' registros';

    if (isCartasTab) {
      if (!list.length) {
        container.innerHTML = '<div style="text-align:center;padding:30px;color:#555570;font-size:11px;">' +
          (cribsData.length ? 'Ning\u00fan perfil tiene estilo de cartas capturado a\u00fan.' : 'No hay registros en CRIBS.') + '</div>';
        return;
      }
      var cartasHtml = '<table class="cartas-table"><thead><tr><th>ID Usuario</th><th>Nombre</th><th>Estilo de Cartas</th><th style="width:50px;"></th></tr></thead><tbody>';
      list.forEach(function (entry) {
        var letterLines = (entry.letter_style || '').split('\n').filter(function (l) { return l.trim(); });
        var contentHtml = letterLines.map(function (l) { return '<div>' + escapeHtml(l) + '</div>'; }).join('');
        cartasHtml += '<tr>' +
          '<td><span style="font-weight:600;color:#c4b5fd;">' + escapeHtml(entry.profile_id) + '</span></td>' +
          '<td>' + escapeHtml(entry.profile_name || '') + '</td>' +
          '<td><div class="cartas-content">' + contentHtml + '</div></td>' +
          '<td><button class="btn-crib-chat" data-profile-id="' + escapeHtml(entry.profile_id) + '" title="Abrir chat">\uD83D\uDCAC</button></td>' +
          '</tr>';
      });
      cartasHtml += '</tbody></table>';
      container.innerHTML = cartasHtml;
      // Attach chat button
      container.addEventListener('click', function (e) {
        var chatBtn = e.target.closest('.btn-crib-chat');
        if (chatBtn && chatBtn.dataset.profileId) { window._cribChat(chatBtn.dataset.profileId); }
      });
      return;
    }

    if (!list.length) {
      container.innerHTML = '<div style="text-align:center;padding:30px;color:#555570;font-size:11px;">' +
        (cribsData.length ? 'Sin resultados' : 'No hay registros en CRIBS. Agrega un ID arriba.') + '</div>';
      return;
    }

    var fields = [
      { key: 'profile_id', label: 'ID Usuario', editable: false },
      { key: 'profile_name', label: 'Nombre', editable: true },
      { key: 'country', label: 'Pa\u00eds', editable: true, type: 'select', options: ['','USA','UK','Canada','Australia','Espa\u00f1a','M\u00e9xico','Colombia','Argentina','Chile','Per\u00fa','Brasil','Alemania','Francia','Italia','Otro'] },
      { key: 'age', label: 'Edad', editable: true, type: 'number' },
      { key: 'interests', label: 'Intereses', editable: true },
      { key: 'city', label: 'Ciudad', editable: true },
      { key: 'work', label: 'Trabajo', editable: true },
      { key: 'marital_status', label: 'Estado Civil', editable: true },
      { key: 'traits', label: 'Rasgos', editable: true },
      { key: 'movie_genres', label: 'Géneros Cine', editable: true },
      { key: 'music_genres', label: 'Géneros Música', editable: true },
      { key: 'goal', label: 'Objetivo', editable: true },
      { key: 'languages', label: 'Idiomas', editable: true },
      { key: 'education', label: 'Educación', editable: true },
      { key: 'looking_for', label: 'Busca', editable: true },
      { key: 'body_type', label: 'Complexión', editable: true },
      { key: 'status', label: 'Status', editable: true, type: 'select', options: ['Nuevo','Activo','VIP','Fr\u00edo','Inactivo'] },
      { key: 'last_contact', label: '\u00daltimo Contacto', editable: false },
      { key: 'preferred_template', label: 'Plantilla Preferida', editable: true, type: 'select', options: ['default','romantica','amistad','negocios','calida','divertida'] },
      { key: 'quick_notes', label: 'Notas R\u00e1pidas', editable: true },
      { key: 'voice_style', label: 'Estilo del Operador', editable: true },
      { key: 'priority', label: 'Prioridad', editable: true, type: 'select', options: ['Alta','Media','Baja'] }
    ];

    var html = '<table class="crib-table"><thead><tr>';
    fields.forEach(function (f) {
      var arrow = '';
      if (cribSortField === f.key) arrow = cribSortDir === 1 ? ' ▲' : ' ▼';
      html += '<th data-sort="' + f.key + '">' + f.label + '<span class="sort-arrow">' + arrow + '</span></th>';
    });
    html += '<th style="width:60px;">ACCI\u00d3N</th></tr></thead><tbody>';

    list.forEach(function (entry) {
      var prioClass = '';
      if (entry.priority === 'Alta') prioClass = 'prio-alta';
      else if (entry.priority === 'Media') prioClass = 'prio-media';
      else if (entry.priority === 'Baja') prioClass = 'prio-baja';

      var statusClass = '';
      if (entry.status === 'VIP') statusClass = 'status-vip';
      else if (entry.status === 'Activo') statusClass = 'status-activo';
      else if (entry.status === 'Nuevo') statusClass = 'status-nuevo';
      else if (entry.status === 'Fr\u00edo') statusClass = 'status-frio';
      else if (entry.status === 'Inactivo') statusClass = 'status-inactivo';

      html += '<tr>';
      fields.forEach(function (f) {
        var val = entry[f.key] || '';
        html += '<td>';
        if (!f.editable) {
          if (f.key === 'profile_id') html += '<span style="font-weight:600;color:#c4b5fd;">' + escapeHtml(val) + '</span>';
          else if (f.key === 'last_contact') html += val ? new Date(val).toLocaleDateString() : '<span style="color:#555;">—</span>';
          else html += escapeHtml(val);
        } else if (f.type === 'select') {
          var cls = f.key === 'priority' ? prioClass : (f.key === 'status' ? statusClass : '');
          html += '<select class="cell-select ' + cls + '" data-id="' + entry._id + '" data-field="' + f.key + '">';
          f.options.forEach(function (o) {
            html += '<option value="' + escapeHtml(o) + '"' + (val === o ? ' selected' : '') + '>' + escapeHtml(o || '—') + '</option>';
          });
          html += '</select>';
        } else if (f.type === 'number') {
          html += '<span class="cell-editable" contenteditable="true" data-id="' + entry._id + '" data-field="' + f.key + '" data-type="number" role="textbox">' + escapeHtml(val) + '</span>';
        } else {
          var extraCls = f.key === 'voice_style' ? ' cell-voice' : '';
          html += '<span class="cell-editable' + extraCls + '" contenteditable="true" data-id="' + entry._id + '" data-field="' + f.key + '" role="textbox">' + escapeHtml(val) + '</span>';
        }
        html += '</td>';
      });
      html += '<td style="white-space:nowrap;">' +
        '<button class="btn-crib-chat" data-profile-id="' + escapeHtml(entry.profile_id) + '" title="Abrir chat">\uD83D\uDCAC</button>' +
        '<button class="btn-crib-del" data-id="' + entry._id + '" title="Eliminar">✕</button>' +
        '</td>';
      html += '</tr>';
    });

    html += '</tbody></table>';
    container.innerHTML = html;

    // Event delegation for sortable headers, selects, and action buttons
    var table = container.querySelector('table.crib-table');
    if (table) {
      table.addEventListener('click', function (e) {
        var th = e.target.closest('th[data-sort]');
        if (th) { window._cribSort(th.dataset.sort); return; }
        var chatBtn = e.target.closest('.btn-crib-chat');
        if (chatBtn && chatBtn.dataset.profileId) { window._cribChat(chatBtn.dataset.profileId); return; }
        var delBtn = e.target.closest('.btn-crib-del');
        if (delBtn && delBtn.dataset.id) { window._cribDelete(delBtn.dataset.id); return; }
      });
      table.addEventListener('change', function (e) {
        var sel = e.target.closest('select.cell-select[data-id][data-field]');
        if (sel) { window._cribUpdate(sel.dataset.id, sel.dataset.field, sel.value); }
      });
    }

    // Attach contenteditable blur listeners
    container.querySelectorAll('.cell-editable').forEach(function (el) {
      el.addEventListener('blur', function () {
        var val = this.textContent.trim();
        var original = '';
        var entry = cribsData.find(function (e) { return e._id === this.dataset.id; }.bind(this));
        if (entry) original = String(entry[this.dataset.field] || '');
        if (val === original) return;
        if (this.dataset.type === 'number') val = val ? parseInt(val) || 0 : null;
        window._cribUpdate(this.dataset.id, this.dataset.field, val);
      });
      el.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { e.preventDefault(); this.blur(); }
      });
    });
  }

  // ====== CRIBS OVERLAY: historial por cliente en tarjetas individuales ======
  function openCribsTable() {
    var overlay = document.getElementById('cribs-overlay');
    var body = document.getElementById('cribs-overlay-body');
    if (!overlay || !body) return;

    overlay.classList.add('show');
    body.innerHTML = '<div style="text-align:center;padding:40px;color:#aaa;grid-column:1/-1;">Cargando historial...</div>';

    // Fetch cribs + notes en paralelo
    Promise.all([
      cribsApi('/api/tess/cribs').then(function (r) { return r.json(); }),
      cribsApi('/api/tess/notes').then(function (r) { return r.json(); }).catch(function () { return { notes: [] }; })
    ]).then(function (results) {
      var cribs = (results[0].cribs || []);
      var notes = (results[1].notes || []);

      if (!cribs.length) {
        body.innerHTML = '<div style="text-align:center;padding:40px;color:#555570;font-size:12px;grid-column:1/-1;">No hay registros en CRIBS. Agrega un ID arriba.</div>';
        return;
      }

      // Indexar notas por client_id
        var notesByClient = {};
        notes.forEach(function (n) {
          var cid = n.client_id || '';
          if (!notesByClient[cid]) notesByClient[cid] = [];
          notesByClient[cid].push(n);
        });

        var html = '';
        cribs.forEach(function (entry) {
        var pid = entry.profile_id || '';
        var clientNotes = notesByClient[pid] || [];

        var prioClass = '', prioLabel = entry.priority || '';
        if (prioLabel === 'Alta') prioClass = 'prio-alta';
        else if (prioLabel === 'Media') prioClass = 'prio-media';
        else if (prioLabel === 'Baja') prioClass = 'prio-baja';

        var statusClass = '', statusLabel = entry.status || 'Nuevo';
        if (statusLabel === 'VIP') statusClass = 'status-vip';
        else if (statusLabel === 'Activo') statusClass = 'status-activo';
        else if (statusLabel === 'Nuevo') statusClass = 'status-nuevo';
        else if (statusLabel === 'Fr\u00edo') statusClass = 'status-frio';
        else if (statusLabel === 'Inactivo') statusClass = 'status-inactivo';

        var lastContact = entry.last_contact ? new Date(entry.last_contact).toLocaleDateString() : '—';
        var ageStr = entry.age ? entry.age + ' a\u00f1os' : '—';
        var countryStr = entry.country || '—';
        var cityStr = entry.city || '';
        var locStr = cityStr ? cityStr + (countryStr !== '—' ? ', ' + countryStr : '') : countryStr;

        html += '<div class="crib-client-card">';

        // Header: nombre + ID + badges
        html += '<div class="cc-header">';
        html += '<span class="cc-name">' + escapeHtml(entry.profile_name || 'Sin nombre') + '</span>';
        html += '<span class="cc-id">#' + escapeHtml(pid) + '</span>';
        if (prioLabel) html += '<span class="cc-priority ' + prioClass + '">' + escapeHtml(prioLabel) + '</span>';
        if (statusLabel) html += '<span class="cc-status ' + statusClass + '">' + escapeHtml(statusLabel) + '</span>';
        html += '</div>';

        // Details grid
        html += '<div class="cc-details">';
        html += '<div><span class="label">Edad:</span> <span class="cc-value">' + ageStr + '</span></div>';
        html += '<div><span class="label">Ubicaci\u00f3n:</span> <span class="cc-value">' + escapeHtml(locStr) + '</span></div>';
        if (entry.interests) html += '<div style="grid-column:1/-1;"><span class="label">Intereses:</span> <span class="cc-value">' + escapeHtml(entry.interests) + '</span></div>';
        if (entry.work) html += '<div><span class="label">Trabajo:</span> <span class="cc-value">' + escapeHtml(entry.work) + '</span></div>';
        if (entry.education) html += '<div><span class="label">Educaci\u00f3n:</span> <span class="cc-value">' + escapeHtml(entry.education) + '</span></div>';
        if (entry.traits) html += '<div style="grid-column:1/-1;"><span class="label">Rasgos:</span> <span class="cc-value">' + escapeHtml(entry.traits) + '</span></div>';
        if (entry.looking_for) html += '<div style="grid-column:1/-1;"><span class="label">Busca:</span> <span class="cc-value">' + escapeHtml(entry.looking_for) + '</span></div>';
        if (entry.movie_genres) html += '<div><span class="label">Cine:</span> <span class="cc-value">' + escapeHtml(entry.movie_genres) + '</span></div>';
        if (entry.music_genres) html += '<div><span class="label">M\u00fasica:</span> <span class="cc-value">' + escapeHtml(entry.music_genres) + '</span></div>';
        if (entry.languages) html += '<div><span class="label">Idiomas:</span> <span class="cc-value">' + escapeHtml(entry.languages) + '</span></div>';
        if (entry.goal) html += '<div><span class="label">Objetivo:</span> <span class="cc-value">' + escapeHtml(entry.goal) + '</span></div>';
        if (entry.preferred_template) html += '<div><span class="label">Plantilla:</span> <span class="cc-value">' + escapeHtml(entry.preferred_template) + '</span></div>';
        html += '</div>';

        // Último contacto
        html += '<div class="cc-last-contact">\u00daltimo contacto: ' + lastContact + '</div>';

        // Quick notes
        if (entry.quick_notes) {
          html += '<div class="cc-quick-notes">\u{1F4DD} ' + escapeHtml(entry.quick_notes) + '</div>';
        }

        // Estilo del operador capturado
        if (entry.voice_style) {
          var styleMsgs = entry.voice_style.split('\n').filter(function (l) { return l.trim(); });
          html += '<div class="cc-voice-style" style="margin-top:6px;border-left:2px solid #8b5cf6;border-radius:4px;font-size:10px;line-height:1.4;">\u{1F3AD} <strong>Estilo (' + styleMsgs.length + ' capturas)</strong>';
          html += '<div style="max-height:120px;overflow-y:auto;padding:6px 8px;background:rgba(139,92,246,0.1);border-radius:0 0 4px 4px;margin-top:4px;">';
          for (var si = styleMsgs.length - 1; si >= 0; si--) {
            var snum = styleMsgs.length - si;
            html += '<div style="margin-top:4px;padding-top:4px;border-top:1px solid rgba(139,92,246,0.15);">';
            html += '<span style="color:#8b5cf6;font-weight:600;font-size:9px;">' + snum + '.</span> ';
            html += '<span>' + escapeHtml(styleMsgs[si]) + '</span>';
            html += '</div>';
          }
          html += '</div></div>';
        }

        // Estilo de cartas capturado
        if (entry.letter_style) {
          var letterMsgs = entry.letter_style.split('\n').filter(function (l) { return l.trim(); });
          html += '<div class="cc-letter-style" style="margin-top:6px;border-left:2px solid #f59e0b;border-radius:4px;font-size:10px;line-height:1.4;">\u{1F4EC} <strong>Cartas (' + letterMsgs.length + ' capturas)</strong>';
          html += '<div style="max-height:120px;overflow-y:auto;padding:6px 8px;background:rgba(245,158,11,0.1);border-radius:0 0 4px 4px;margin-top:4px;">';
          for (var li = letterMsgs.length - 1; li >= 0; li--) {
            var lnum = letterMsgs.length - li;
            html += '<div style="margin-top:4px;padding-top:4px;border-top:1px solid rgba(245,158,11,0.15);display:flex;gap:4px;align-items:flex-start;">';
            html += '<span style="color:#f59e0b;font-weight:600;font-size:9px;flex-shrink:0;">' + lnum + '.</span> ';
            html += '<span style="flex:1;">' + escapeHtml(letterMsgs[li]) + '</span>';
            html += '<button class="btn-del-letter-line" data-entry-id="' + entry._id + '" data-line-idx="' + li + '" title="Eliminar esta captura" style="flex-shrink:0;background:none;border:none;color:#ef4444;cursor:pointer;font-size:12px;padding:0 2px;line-height:1;">✕</button>';
            html += '</div>';
          }
          html += '</div></div>';
        }

        // Notas del sistema de notas
        if (clientNotes.length > 0) {
          html += '<div class="cc-notes-title">\u{1F4CB} Notas (' + clientNotes.length + ')</div>';
          clientNotes.slice(0, 5).forEach(function (note) {
            var dateStr = note.created_at ? new Date(note.created_at).toLocaleDateString() : '';
            html += '<div class="cc-note"><strong>' + escapeHtml(dateStr) + '</strong> — ' + escapeHtml(note.note_text || '') + '</div>';
          });
          if (clientNotes.length > 5) {
            html += '<div style="font-size:9px;color:#888;">... y ' + (clientNotes.length - 5) + ' nota(s) m\u00e1s</div>';
          }
        } else {
          html += '<div class="cc-empty">Sin notas registradas</div>';
        }

        // Actions
        html += '<div class="cc-actions">';
        html += '<button class="btn-chat" data-profile-id="' + escapeHtml(pid) + '">\uD83D\uDCAC Abrir Chat</button>';
        html += '</div>';

        html += '</div>'; // end card
      });

      body.innerHTML = html;

      // Attach chat buttons
      body.querySelectorAll('.btn-chat').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var pid = this.dataset.profileId;
          if (pid) window._cribChat(pid);
        });
      });

      // Attach delete letter line buttons
      body.querySelectorAll('.btn-del-letter-line').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var entryId = this.dataset.entryId;
          var lineIdx = parseInt(this.dataset.lineIdx, 10);
          if (!entryId || isNaN(lineIdx)) return;
          if (!confirm('Eliminar esta captura de carta?')) return;
          window._deleteLetterLine(entryId, lineIdx);
        });
      });
    }).catch(function () {
      body.innerHTML = '<div style="text-align:center;padding:40px;color:#ef4444;font-size:12px;grid-column:1/-1;">Error al cargar datos. Verifica la conexi\u00f3n.</div>';
    });
  }

  window._cribSort = function (field) {
    if (cribSortField === field) cribSortDir *= -1;
    else { cribSortField = field; cribSortDir = 1; }
    applyCribFilters();
  };

  window._cribUpdate = function (id, field, value) {
    cribsApi('/api/tess/cribs/' + id, {
      method: 'PUT',
      body: JSON.stringify({ field: field, value: value })
    }).then(function (r) { return r.json(); }).then(function (d) {
      if (d.success) {
        var entry = cribsData.find(function (e) { return e._id === id; });
        if (entry) entry[field] = value;
      } else {
        showNotification('Error al actualizar ' + field, 'error');
      }
    }).catch(function () { showNotification('Error de conexión al actualizar', 'error'); });
  };

  window._cribChat = function (profileId) {
    chrome.storage.local.get('tess_operator_id', function (data) {
      if (data.tess_operator_id) {
        chrome.tabs.create({ url: 'https://talkytimes.com/chat/' + data.tess_operator_id + '_' + profileId, active: true });
      } else {
        chrome.tabs.create({ url: 'https://talkytimes.com/member/' + profileId, active: true });
      }
    });
  };

  window._deleteLetterLine = function (entryId, lineIdx) {
    var entry = cribsData.find(function (e) { return e._id === entryId; });
    if (!entry || !entry.letter_style) return;
    var lines = entry.letter_style.split('\n').filter(function (l) { return l.trim(); });
    if (lineIdx < 0 || lineIdx >= lines.length) return;
    lines.splice(lineIdx, 1);
    var newStyle = lines.join('\n');
    cribsApi('/api/tess/cribs/' + entryId + '/bulk', {
      method: 'PUT',
      body: JSON.stringify({ letter_style: newStyle })
    }).then(function (r) { return r.json(); }).then(function (d) {
      if (d.success) {
        entry.letter_style = newStyle;
        openCribsTable(); // refresh overlay
        showNotification('Captura de carta eliminada', 'success');
      } else {
        showNotification('Error al eliminar captura', 'error');
      }
    }).catch(function () { showNotification('Error de conexi\u00f3n', 'error'); });
  };

  window._cribDelete = function (id) {
    if (!confirm('Eliminar este registro de CRIBS?')) return;
    cribsApi('/api/tess/cribs/' + id, { method: 'DELETE' }).then(function (r) { return r.json(); }).then(function (d) {
      if (d.success) {
        cribsData = cribsData.filter(function (e) { return e._id !== id; });
        applyCribFilters();
        showNotification('Registro eliminado', 'success');
      } else {
        showNotification('Error al eliminar', 'error');
      }
    }).catch(function () { showNotification('Error de conexión al eliminar', 'error'); });
  };

  function saveCribFilterState() {
    chrome.storage.local.set({
      crib_search: document.getElementById('crib-search').value,
      crib_status: document.getElementById('crib-filter-status').value,
      crib_priority: document.getElementById('crib-filter-priority').value,
      crib_sort_field: cribSortField,
      crib_sort_dir: cribSortDir
    });
  }

  function restoreCribFilterState() {
    chrome.storage.local.get(['crib_search', 'crib_status', 'crib_priority', 'crib_sort_field', 'crib_sort_dir'], function (data) {
      if (data.crib_search) document.getElementById('crib-search').value = data.crib_search;
      if (data.crib_status) document.getElementById('crib-filter-status').value = data.crib_status;
      if (data.crib_priority) document.getElementById('crib-filter-priority').value = data.crib_priority;
      if (data.crib_sort_field) cribSortField = data.crib_sort_field;
      if (data.crib_sort_dir) cribSortDir = data.crib_sort_dir;
    });
  }

  function initCribs() {
    restoreCribFilterState();
    document.getElementById('btn-back-dash-cribs').addEventListener('click', function () {
      switchView('dashboard');
    });

    document.getElementById('btn-crib-add').addEventListener('click', function () {
      var id = document.getElementById('crib-add-id').value.trim();
      if (!id) return;
      cribsApi('/api/tess/cribs', {
        method: 'POST',
        body: JSON.stringify({ profile_id: id })
      }).then(function (r) { return r.json(); }).then(function (d) {
        if (d.success) {
          document.getElementById('crib-add-id').value = '';
          cribsData = d.cribs || [];
          applyCribFilters();
          var entryId = d.entry_id;
          if (entryId) {
            // Guardar en storage para que el content script lo detecte (más fiable que tabs.sendMessage)
            chrome.storage.local.set({ _tess_pending_scrape: { profileId: id, entryId: entryId, jwt: currentJwt, timestamp: Date.now() } }, function () {
              console.log('[CRIBS] Scrape request stored for profile', id);
            });
            // Intentar también enviar mensaje directo como fallback
            chrome.tabs.query({ url: ['*://talkytimes.com/*', '*://www.talkytimes.com/*'] }, function (tabs) {
              if (tabs && tabs.length > 0) {
                chrome.tabs.sendMessage(tabs[0].id, { action: 'SCRAPE_PROFILE', profileId: id, entryId: entryId, jwt: currentJwt }, function () {
                  if (chrome.runtime.lastError) {
                    console.log('[CRIBS] tabs.sendMessage falló, usando storage fallback:', chrome.runtime.lastError.message);
                  } else {
                    console.log('[CRIBS] SCRAPE_PROFILE enviado exitosamente');
                  }
                });
              }
            });
          }
        } else {
          alert(d.error || 'Error al agregar');
        }
      }).catch(function () { alert('Error de conexion'); });
    });

    document.getElementById('crib-add-id').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') document.getElementById('btn-crib-add').click();
    });

    chrome.runtime.onMessage.addListener(function (req) {
      if (req.action === 'CRIBS_REFRESH') { renderCribs(); }
    });

    document.getElementById('btn-crib-open-table').addEventListener('click', function () {
      openCribsTable();
    });

    // Cerrar overlay
    document.getElementById('btn-cribs-overlay-close').addEventListener('click', function () {
      document.getElementById('cribs-overlay').classList.remove('show');
    });
    document.getElementById('cribs-overlay').addEventListener('click', function (e) {
      if (e.target === this) this.classList.remove('show');
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') document.getElementById('cribs-overlay').classList.remove('show');
    });

    document.getElementById('crib-search').addEventListener('input', function () {
      saveCribFilterState();
      applyCribFilters();
    });

    document.getElementById('crib-filter-status').addEventListener('change', function () {
      saveCribFilterState();
      applyCribFilters();
    });

    document.getElementById('crib-filter-priority').addEventListener('change', function () {
      saveCribFilterState();
      applyCribFilters();
    });
  }

  function initNotes() {
    document.querySelectorAll('.nav-item[data-view]').forEach(function (item) {
      item.addEventListener('click', function () { switchView(this.dataset.view); });
    });

    document.getElementById('btn-back-dash').addEventListener('click', function () {
      switchView('dashboard');
    });

    document.querySelectorAll('.notes-tab').forEach(function (tab) {
      tab.addEventListener('click', function () {
        document.querySelectorAll('.notes-tab').forEach(function (t) { t.classList.remove('active'); });
        document.querySelectorAll('.notes-tab-content').forEach(function (c) { c.classList.remove('active'); });
        this.classList.add('active');
        var target = document.getElementById('tab-' + this.dataset.tab);
        if (target) {
          target.classList.add('active');
          if (this.dataset.tab === 'shared-notes') renderSharedNotes();
        }
      });
    });

    document.getElementById('btn-save-note').addEventListener('click', function () {
      var profileName = document.getElementById('note-profile-name').value.trim();
      var clientName = document.getElementById('note-client-name').value.trim();
      var clientId = document.getElementById('note-client-id').value.trim();
      var noteText = document.getElementById('note-text').value.trim();
      if (!noteText) { showNotification('Escribe el texto de la nota', 'error'); return; }
      notesApi('/api/tess/notes', {
        method: 'POST',
        body: JSON.stringify({ profile_name: profileName, client_name: clientName, client_id: clientId, note_text: noteText })
      }).then(function (r) { return r.json(); }).then(function (d) {
        if (d.success) {
          showNotification('Nota guardada', 'success');
          document.getElementById('note-profile-name').value = '';
          document.getElementById('note-client-name').value = '';
          document.getElementById('note-client-id').value = '';
          document.getElementById('note-text').value = '';
          switchView('dashboard');
        } else { showNotification('Error al guardar', 'error'); }
      }).catch(function () { showNotification('Error de conexion', 'error'); });
    });

    document.getElementById('btn-cancel-share').addEventListener('click', function () {
      document.getElementById('share-modal').style.display = 'none';
    });
    document.getElementById('btn-confirm-share').addEventListener('click', function () {
      var email = document.getElementById('share-user-select').value;
      if (!email) { showNotification('Selecciona un usuario', 'error'); return; }
      notesApi('/api/tess/notes/' + sharingNoteId + '/share', {
        method: 'POST',
        body: JSON.stringify({ target_email: email })
      }).then(function (r) { return r.json(); }).then(function (d) {
        if (d.success) {
          showNotification('Nota compartida con ' + email, 'success');
          document.getElementById('share-modal').style.display = 'none';
          renderMyNotes();
        } else { showNotification(d.error || 'Error al compartir', 'error'); }
      }).catch(function () { showNotification('Error de conexion', 'error'); });
    });

    document.getElementById('btn-cancel-edit').addEventListener('click', function () {
      document.getElementById('edit-modal').style.display = 'none';
      editingNoteId = null;
    });
    document.getElementById('btn-confirm-edit').addEventListener('click', function () {
      if (!editingNoteId) return;
      var profileName = document.getElementById('edit-profile-name').value.trim();
      var clientName = document.getElementById('edit-client-name').value.trim();
      var clientId = document.getElementById('edit-client-id').value.trim();
      var noteText = document.getElementById('edit-note-text').value.trim();
      if (!noteText) { showNotification('Escribe el texto de la nota', 'error'); return; }
      notesApi('/api/tess/notes/' + editingNoteId, {
        method: 'PUT',
        body: JSON.stringify({ profile_name: profileName, client_name: clientName, client_id: clientId, note_text: noteText })
      }).then(function (r) { return r.json(); }).then(function (d) {
        if (d.success) {
          showNotification('Nota actualizada', 'success');
          document.getElementById('edit-modal').style.display = 'none';
          editingNoteId = null;
          renderMyNotes();
        } else { showNotification('Error al actualizar', 'error'); }
      }).catch(function () { showNotification('Error de conexion', 'error'); });
    });

    document.getElementById('share-modal').addEventListener('click', function (e) {
      if (e.target === this) this.style.display = 'none';
    });
    document.getElementById('edit-modal').addEventListener('click', function (e) {
      if (e.target === this) this.style.display = 'none';
    });
  }

  chrome.storage.local.get(['tess_jwt', 'tess_refresh', 'user_email'], async function (data) {
    if (!data.tess_jwt || !data.user_email) {
      window.location.href = chrome.runtime.getURL('dist/pages/login/login.html');
      return;
    }
    currentJwt = data.tess_jwt;

    try {
      const res = await fetch(TESSERACT_API + '/api/tess/auth/verify', {
        headers: { 'Authorization': 'Bearer ' + data.tess_jwt }
      });
      if (!res.ok) {
        if (res.status === 401 && data.tess_refresh) {
          const refreshRes = await fetch(TESSERACT_API + '/api/tess/auth/refresh', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refreshToken: data.tess_refresh })
          });
          if (refreshRes.ok) {
            const refreshData = await refreshRes.json();
            await chrome.storage.local.set({ tess_jwt: refreshData.token, tess_refresh: refreshData.refreshToken });
            window.location.reload();
            return;
          }
        }
        await chrome.storage.local.remove(['tess_jwt', 'tess_refresh']);
        window.location.href = chrome.runtime.getURL('dist/pages/login/login.html');
        return;
      }
      const authData = await res.json();
      document.getElementById('user-info').textContent = authData.email;

      var status = authData.subscription?.status || 'expired';
      var remaining = authData.subscription?.timeRemaining || 0;

      var badge = document.getElementById('status-badge');
      badge.textContent = status.toUpperCase();
      badge.className = 'status-badge status-' + status;

      var timeEl = document.getElementById('time-remaining');
      if (remaining > 0 && remaining !== Infinity && remaining < 999999999999990) {
        timeEl.textContent = 'Tiempo restante: ' + formatTime(remaining);
      } else if (remaining === Infinity || remaining >= 999999999999990) {
        timeEl.textContent = 'Acceso ilimitado';
      } else {
        timeEl.textContent = 'Tu acceso ha expirado';
        timeEl.style.color = '#ef4444';
      }

      if (authData.isAdmin || authData.isDeveloper || authData.isOfficeAdmin) {
        document.getElementById('btn-admin').style.display = 'inline-block';
      }
    } catch (e) {
      document.getElementById('user-info').textContent = data.user_email + ' (sin conexi\u00f3n)';
    }

    document.getElementById('btn-open-bot').addEventListener('click', function () {
      chrome.tabs.create({ url: 'https://talkytimes.com/', active: true });
    });
    document.getElementById('btn-admin').addEventListener('click', function () {
      var token = data.tess_jwt;
      if (token) {
        window.open(chrome.runtime.getURL('dist/pages/admin/admin.html') + '?token=' + encodeURIComponent(token), '_blank');
      } else {
        window.open(chrome.runtime.getURL('dist/pages/admin/admin.html'), '_blank');
      }
    });
    document.getElementById('btn-logout').addEventListener('click', function () {
      chrome.storage.local.clear();
      window.location.href = chrome.runtime.getURL('dist/pages/login/login.html');
    });

    initNotes();
    initCribs();
  });
})();

