(function () {
  var TESSERACT_API = 'https://tesseract-jblo.onrender.com';
  var storedToken = '';

  function formatTime(ms) {
    if (ms <= 0 || ms === Infinity) return ms === Infinity ? 'Unlimited' : 'Expired';
    var d = Math.floor(ms / 86400000);
    var h = Math.floor((ms % 86400000) / 3600000);
    var m = Math.floor((ms % 3600000) / 60000);
    if (d > 0) return d + 'd ' + h + 'h';
    if (h > 0) return h + 'h ' + m + 'm';
    return m + 'm';
  }

  function renderLoggedOut(section) {
    section.innerHTML =
      '<p style="font-size:11px;color:#8888a0;margin-bottom:12px;text-align:center;">No has iniciado sesi\u00f3n</p>' +
      '<button class="btn btn-primary" id="btn-login">INICIAR SESI\u00d3N</button>';
    document.getElementById('btn-login').addEventListener('click', function () {
      window.open(chrome.runtime.getURL('dist/pages/login/login.html'), '_blank');
    });
  }

  chrome.storage.local.get(['tess_jwt', 'user_email'], function (data) {
    var section = document.getElementById('auth-section');
    if (!section) return;
    if (!data.tess_jwt || !data.user_email) return renderLoggedOut(section);
    
    storedToken = data.tess_jwt;

    fetch(TESSERACT_API + '/api/tess/auth/verify', {
      headers: { 'Authorization': 'Bearer ' + data.tess_jwt }
    }).then(function (r) {
      if (!r.ok) throw new Error('Unauthorized');
      return r.json();
    }).then(function (a) {
      var s = a.subscription || {};
      var cls = 'status-' + s.status;
      var html =
        '<div class="status-bar"><span>Estado:</span><span class="status-badge ' + cls + '">' + (s.status || '').toUpperCase() + '</span></div>' +
        '<div class="email-display">' + a.email + '</div>' +
        (s.timeRemaining > 0 && s.timeRemaining !== Infinity
          ? '<div class="time-remaining">Tiempo restante: ' + formatTime(s.timeRemaining) + '</div>'
          : s.timeRemaining === Infinity
            ? '<div class="time-remaining">Acceso ilimitado</div>'
            : '<div class="time-remaining" style="color:#ef4444;">Expirado</div>') +
        '<button class="btn btn-primary" id="btn-dashboard">ABRIR DASHBOARD</button>' +
        (a.isAdmin || a.isDeveloper ? '<button class="btn btn-secondary" id="btn-admin">ADMIN PANEL</button>' : '') +
        '<button class="btn btn-danger" id="btn-logout">CERRAR SESI\u00d3N</button>';
      section.innerHTML = html;

      document.getElementById('btn-dashboard').addEventListener('click', function () {
        window.open(chrome.runtime.getURL('dist/pages/dashboard/dashboard.html'), '_blank');
      });
      var adminBtn = document.getElementById('btn-admin');
      if (adminBtn) adminBtn.addEventListener('click', function () {
        var url = chrome.runtime.getURL('dist/pages/admin/admin.html');
        if (storedToken) url += '?token=' + encodeURIComponent(storedToken);
        window.open(url, '_blank');
      });
      document.getElementById('btn-logout').addEventListener('click', function () {
        chrome.storage.local.clear();
        window.close();
      });
    }).catch(function () {
      renderLoggedOut(section);
    });
  });
})();

