function showMLSavedFeedback() {
  const btn = document.getElementById('mlSaveBtn');
  if (btn) {
    const original = btn.textContent;
    btn.textContent = 'GUARDADO';
    btn.style.background = '#4CAF50';
    btn.style.borderColor = '#4CAF50';
    btn.style.color = '#fff';
    setTimeout(() => {
      btn.textContent = original;
      btn.style.background = '';
      btn.style.borderColor = '';
      btn.style.color = '';
    }, 2000);
  }
}

function createMailingPanel() {
  if (document.getElementById('mailingModal')) return;

  const m = document.createElement('div');
  m.id = 'mailingModal';
  m.innerHTML = `
<style>
#mailingModal{position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:9999999;display:none;width:560px;max-height:90vh;background:#0a0a0a;border:2px solid #8b5cf6;border-radius:12px;box-shadow:0 0 40px rgba(139,92,246,0.5);color:#e0e0e0;font-family:'Orbitron','Segoe UI',sans-serif;overflow:hidden;display:flex;flex-direction:column;}
.ml-hdr{background:linear-gradient(135deg,#1e1b4b,#8b5cf6,#1e1b4b);padding:12px 16px;font-weight:bold;letter-spacing:2px;display:flex;justify-content:space-between;border-bottom:2px solid #8b5cf6;color:#e0e0e0;font-size:13px;cursor:default;}
.ml-hdr span{cursor:pointer;font-size:18px;}
.ml-body{padding:16px;overflow-y:auto;flex:1;}
.ml-body::-webkit-scrollbar{width:4px;}
.ml-body::-webkit-scrollbar-track{background:#0a0a0a;}
.ml-body::-webkit-scrollbar-thumb{background:#8b5cf6;border-radius:2px;}
.ml-section{margin-bottom:12px;padding:10px;background:rgba(30,27,75,0.3);border:1px solid rgba(139,92,246,0.2);border-radius:8px;}
.ml-section h4{font-size:10px;letter-spacing:1px;margin:0 0 8px 0;color:#e0e0e0;text-transform:uppercase;}
.ml-section label{display:flex;align-items:center;gap:8px;font-size:10px;color:#ccc;margin:4px 0;cursor:pointer;}
.ml-section input[type="checkbox"]{accent-color:#8b5cf6;width:14px;height:14px;cursor:pointer;}
.ml-section input[type="number"]{width:60px;padding:4px 6px;background:#000;border:1px solid #8b5cf6;border-radius:4px;color:#e0e0e0;font-family:'Share Tech Mono',monospace;font-size:10px;}
.ml-section input[type="text"]{width:100%;padding:6px;background:#000;border:1px solid #8b5cf6;border-radius:4px;color:#e0e0e0;font-family:'Share Tech Mono',monospace;font-size:10px;box-sizing:border-box;}
.ml-section input[type="date"]{padding:5px;background:#000;border:1px solid #8b5cf6;border-radius:4px;color:#e0e0e0;font-family:'Share Tech Mono',monospace;font-size:10px;}
.ml-section select{background:#000;border:1px solid #8b5cf6;border-radius:4px;color:#e0e0e0;font-family:'Share Tech Mono',monospace;font-size:10px;padding:4px;}
.ml-section textarea{width:100%;padding:6px;background:#000;border:1px solid #8b5cf6;border-radius:4px;color:#e0e0e0;font-family:Arial;font-size:11px;box-sizing:border-box;height:50px;resize:vertical;}
.ml-section textarea:focus{outline:none;border-color:#7c3aed;}
.ml-hour-row{display:flex;gap:12px;align-items:center;flex-wrap:wrap;}
.ml-hour-row label{font-size:9px;}
.ml-hour-row input{width:40px;}
.ml-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:6px 0;}
.ml-stat-card{text-align:center;padding:8px;background:rgba(0,0,0,0.4);border:1px solid rgba(139,92,246,0.2);border-radius:6px;}
.ml-stat-card .val{display:block;font-size:18px;font-weight:900;color:#ffffff;text-shadow:0 0 10px #8b5cf6;}
.ml-stat-card .lbl{font-size:7px;letter-spacing:1px;color:#888;text-transform:uppercase;}
.ml-error{color:#dc2626;font-size:9px;margin:4px 0;padding:6px 10px;background:rgba(220,38,38,0.1);border:1px solid #dc2626;border-radius:4px;display:none;}
.ml-info{color:#4CAF50;font-size:9px;margin:4px 0;padding:6px 10px;background:rgba(76,175,80,0.1);border:1px solid #4CAF50;border-radius:4px;display:none;}
.ml-grid-2{display:grid;grid-template-columns:1fr 1fr;gap:10px;}
.ml-foot{padding:12px;border-top:1px solid #8b5cf6;text-align:right;display:flex;justify-content:space-between;align-items:center;background:rgba(0,0,0,0.3);}
.ml-foot .ml-status{font-size:9px;letter-spacing:1px;}
.ml-foot .ml-status .dot{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:4px;}
.ml-foot .ml-status .dot.on{background:#4CAF50;box-shadow:0 0 8px #4CAF50;}
.ml-foot .ml-status .dot.off{background:#666;}
.ml-foot button{padding:8px 16px;border:1px solid #8b5cf6;border-radius:6px;background:rgba(30,27,75,0.7);color:#e0e0e0;cursor:pointer;font-family:'Orbitron',sans-serif;font-size:9px;letter-spacing:1px;margin-left:6px;transition:all 0.3s;}
.ml-foot button:hover{background:#7c3aed;color:#fff;}
.ml-foot button.primary{background:#8b5cf6;color:#000;}
.ml-foot button.primary:hover{background:#7c3aed;color:#fff;}
.ml-foot button.danger{background:rgba(239,68,68,0.2);border-color:#ef4444;color:#ef4444;}
.ml-foot button.danger:hover{background:#ef4444;color:#fff;}
.ml-blacklist-warn{font-size:8px;color:#ef4444;margin-top:4px;}
</style>
<div class="ml-box">
<div class="ml-hdr"><span>MULTIMAILING</span><span id="mlCloseBtn">&times;</span></div>
<div class="ml-body">

  <div class="ml-grid-2">
    <div class="ml-section">
      <h4>CONFIGURACION GENERAL</h4>
      <label><input type="checkbox" id="mlEnabledToggle"> Multimailing Activado</label>
      <div class="ml-hour-row" style="margin-top:6px;">
        <label><input type="number" id="mlMaxDaily" value="30" min="0" style="width:50px;"> max/dia</label>
        <label>Delay: <input type="number" id="mlDelayMin" value="3" min="0" style="width:40px;">s - <input type="number" id="mlDelayMax" value="7" min="0" style="width:40px;">s</label>
      </div>
    </div>
    <div class="ml-section">
      <h4>HORARIO LABORAL</h4>
      <label><input type="checkbox" id="mlRespectHours" checked> Respetar horario</label>
      <div class="ml-hour-row">
        <label>Desde <input type="number" id="mlHourStart" value="8" min="0" max="23">:00</label>
        <label>Hasta <input type="number" id="mlHourEnd" value="22" min="0" max="23">:00</label>
      </div>
      <label style="margin-top:4px;"><input type="checkbox" id="mlSkipPinned" checked> Saltar contactos fijados</label>
    </div>
  </div>

  <div class="ml-section">
    <h4>PROGRAMACION (CHATSPACE STYLE)</h4>
    <div class="ml-hour-row">
      <label><input type="checkbox" id="mlScheduleToggle"> Activar programacion</label>
      <label>Inicio: <input type="date" id="mlScheduleStart"></label>
      <label>Frecuencia:
        <select id="mlScheduleFreq">
          <option value="daily">Diario</option>
          <option value="weekly">Semanal</option>
          <option value="monthly">Mensual</option>
        </select>
      </label>
      <label>Ciclos: <input type="number" id="mlScheduleCycles" value="30" min="1" style="width:50px;"></label>
    </div>
    <p style="font-size:8px;color:#666;margin-top:4px;">Programa el envio de cartas por dias, semanas o meses. Se ejecutara automaticamente segun la frecuencia.</p>
  </div>

  <div class="ml-section">
    <h4>PLANTILLA DE CARTA</h4>
    <textarea id="mlTemplateNew" placeholder="Escribe la carta que se enviara a todos los contactos..." style="height:70px;">Hola! Vi tu perfil y me pareciste interesante. ¿Te gustaría conversar?</textarea>
  </div>

  <div class="ml-section">
    <h4>BLOQUEO POR DIALOGO ACTIVO</h4>
    <label><input type="checkbox" id="mlBlockDialogue" checked> Bloquear mailing si hay dialogo activo</label>
    <div class="ml-hour-row">
      <label>Silencio maximo: <input type="number" id="mlDialogueHours" value="48" min="1" style="width:50px;"> horas sin respuesta</label>
    </div>
    <p style="font-size:8px;color:#666;margin-top:4px;">Si el contacto ha respondido recientemente, no se enviaran mas cartas automaticas.</p>
  </div>

  <div class="ml-section">
    <h4>BLACKLIST</h4>
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:6px 0;">
      <div class="ml-stat-card"><span class="val" id="mlBlacklistCount">0</span>BLOQUEADOS</div>
      <div class="ml-stat-card"><span class="val" id="mlBlacklistStatus">--</span>ESTADO</div>
      <div class="ml-stat-card"><span class="val" id="mlScheduleStatus">--</span>PROGRAMACION</div>
      <div class="ml-stat-card"><span class="val" id="mlBlockStatus">--</span>BLOQUEO DIAL.</div>
    </div>
    <p class="ml-blacklist-warn">CONDICION PRINCIPAL: Ningun contacto en blacklist recibira mensajes.</p>
  </div>

  <div class="ml-section">
    <h4>ESTADISTICAS</h4>
    <div class="ml-stats">
      <div class="ml-stat-card"><span class="val" id="mlSentTodayVal">0</span>ENVIADOS HOY</div>
      <div class="ml-stat-card"><span class="val" id="mlDailyLimitVal">30</span>LIMITE</div>
      <div class="ml-stat-card"><span class="val" id="mlScrapedVal">0</span>EN PAGINA</div>
    </div>
    <div id="mlErrorMsg" class="ml-error"></div>
    <div id="mlInfoMsg" class="ml-info"></div>
  </div>

</div>
<div class="ml-foot">
  <div class="ml-status"><span class="dot off" id="mlStatusDot"></span><span id="mlStatusText">INACTIVO</span></div>
  <div>
    <button id="mlScrapeBtn" style="background:rgba(139,92,246,0.2);">RASTREAR</button>
    <button id="mlAbortBtn" class="danger" style="display:none;">ABORTAR</button>
    <button id="mlSaveBtn" class="primary">GUARDAR</button>
    <button id="mlCloseBtn2">CERRAR</button>
  </div>
</div>
</div>`;
  document.body.appendChild(m);

  document.getElementById('mlCloseBtn').addEventListener('click', () => mlModal(false));
  document.getElementById('mlCloseBtn2').addEventListener('click', () => mlModal(false));
  document.getElementById('mlSaveBtn').addEventListener('click', saveMLPanelConfigWrapper);
  document.getElementById('mlAbortBtn').addEventListener('click', abortMailingFromPanel);
  document.getElementById('mlScrapeBtn').addEventListener('click', scrapeFromPanel);
}

function mlModal(show) {
  const el = document.getElementById('mailingModal');
  if (el) el.style.display = show ? 'block' : 'none';
}

let mlCfgCache = null;

async function openMLPanel() {
  createMailingPanel();
  mlModal(true);
  mlCfgCache = await _loadMLCfg();
  populateMLPanel();
  updateMLScrapedCount();
}

async function _loadMLCfg() {
  try {
    if (typeof window._getMailingConfigDirect === 'function') {
      const cfg = window._getMailingConfigDirect();
      if (cfg) return cfg;
    }
    if (typeof window._loadMailingConfigDirect === 'function') {
      await window._loadMailingConfigDirect();
      return window._getMailingConfigDirect ? window._getMailingConfigDirect() : null;
    }
    const r = await chrome.storage.local.get(['tess_mailing_config']);
    return r.tess_mailing_config || null;
  } catch (e) { return null; }
}

function populateMLPanel() {
  const cfg = mlCfgCache || getDefaultMailingConfig();

  document.getElementById('mlEnabledToggle').checked = !!cfg.enabled;
  document.getElementById('mlMaxDaily').value = cfg.maxDaily || 30;
  document.getElementById('mlDelayMin').value = Math.floor((cfg.delay?.min || 3000) / 1000);
  document.getElementById('mlDelayMax').value = Math.floor((cfg.delay?.max || 7000) / 1000);
  document.getElementById('mlRespectHours').checked = cfg.respectQuietHours !== false;
  document.getElementById('mlHourStart').value = cfg.workingHours?.start ?? 8;
  document.getElementById('mlHourEnd').value = cfg.workingHours?.end ?? 22;
  document.getElementById('mlSkipPinned').checked = cfg.skipPinned !== false;
  document.getElementById('mlScheduleToggle').checked = !!cfg.scheduleEnabled;
  document.getElementById('mlScheduleStart').value = cfg.scheduleStartDate || '';
  document.getElementById('mlScheduleFreq').value = cfg.scheduleFrequency || 'daily';
  document.getElementById('mlScheduleCycles').value = cfg.scheduleCycles || 30;
  document.getElementById('mlTemplateNew').value = cfg.templatesNew || cfg.messageTemplate || '';
  document.getElementById('mlBlockDialogue').checked = cfg.blockActiveDialogue !== false;
  document.getElementById('mlDialogueHours').value = cfg.activeDialogueHours || 48;
  document.getElementById('mlSentTodayVal').textContent = cfg.sentToday || 0;
  document.getElementById('mlDailyLimitVal').textContent = cfg.maxDaily || 30;

  const stats = typeof window._getMailingStats === 'function' ? window._getMailingStats() : null;
  document.getElementById('mlBlacklistCount').textContent = stats?.blacklistSize || 0;
  document.getElementById('mlBlacklistStatus').textContent = stats?.blacklistLoaded ? 'OK' : '--';
  document.getElementById('mlScheduleStatus').textContent = stats?.scheduleEnabled ? (stats.scheduleRemaining + '/' + stats.scheduleCycles) : '--';
  document.getElementById('mlBlockStatus').textContent = stats?.blockActiveDialogue ? 'ACTIVO' : '--';

  updateMLStatusBar(cfg.enabled);
}

async function saveMLPanelConfigWrapper() {
  const errEl = document.getElementById('mlErrorMsg');
  errEl.style.display = 'none';
  try {
    const cfg = mlCfgCache || {};
    cfg.enabled = !!document.getElementById('mlEnabledToggle').checked;
    cfg.maxDaily = parseInt(document.getElementById('mlMaxDaily').value) || 30;
    cfg.delay = { min: (parseInt(document.getElementById('mlDelayMin').value) || 3) * 1000, max: (parseInt(document.getElementById('mlDelayMax').value) || 7) * 1000 };
    cfg.respectQuietHours = !!document.getElementById('mlRespectHours').checked;
    cfg.workingHours = { start: parseInt(document.getElementById('mlHourStart').value) || 8, end: parseInt(document.getElementById('mlHourEnd').value) || 22 };
    cfg.skipPinned = !!document.getElementById('mlSkipPinned').checked;
    cfg.scheduleEnabled = !!document.getElementById('mlScheduleToggle').checked;
    cfg.scheduleStartDate = document.getElementById('mlScheduleStart').value || '';
    cfg.scheduleFrequency = document.getElementById('mlScheduleFreq').value || 'daily';
    cfg.scheduleCycles = parseInt(document.getElementById('mlScheduleCycles').value) || 30;
    cfg.scheduleRemaining = parseInt(document.getElementById('mlScheduleCycles').value) || 30;
    cfg.templatesNew = document.getElementById('mlTemplateNew').value;
    cfg.messageTemplate = document.getElementById('mlTemplateNew').value;
    cfg.blockActiveDialogue = !!document.getElementById('mlBlockDialogue').checked;
    cfg.activeDialogueHours = parseInt(document.getElementById('mlDialogueHours').value) || 48;

    if (typeof window._saveMailingConfigDirect === 'function') {
      mlCfgCache = cfg;
      if (typeof window._getMailingConfigDirect === 'function') {
        Object.assign(window._getMailingConfigDirect(), cfg);
      }
      await window._saveMailingConfigDirect();
    } else {
      await chrome.storage.local.set({ tess_mailing_config: cfg });
    }

    if (typeof window._tessServerSync !== 'undefined') window._tessServerSync.config('tess_mailing_config', cfg);
    showMLSavedFeedback();
    updateMLStatusBar(cfg.enabled);
  } catch (e) {
    errEl.textContent = 'Error: ' + (e.message || 'desconocido');
    errEl.style.display = 'block';
  }
}

function getDefaultMailingConfig() {
  return {
    enabled: false, maxDaily: 30, sentToday: 0, messageTemplate: '',
    respectQuietHours: true, workingHours: { start: 8, end: 22 },
    delay: { min: 3000, max: 7000 }, skipPinned: true,
    scheduleEnabled: false, scheduleStartDate: '', scheduleFrequency: 'daily', scheduleCycles: 30, scheduleRemaining: 30,
    templatesNew: '', blockActiveDialogue: true, activeDialogueHours: 48
  };
}

function updateMLStatusBar(enabled) {
  const dot = document.getElementById('mlStatusDot');
  const text = document.getElementById('mlStatusText');
  if (dot) dot.className = 'dot ' + (enabled ? 'on' : 'off');
  if (text) text.textContent = enabled ? 'ACTIVO' : 'INACTIVO';
}

async function updateMLScrapedCount() {
  if (typeof window._scrapeActiveLimitsIds === 'function') {
    const ids = window._scrapeActiveLimitsIds();
    document.getElementById('mlScrapedVal').textContent = ids.length;
  }
}

async function scrapeFromPanel() {
  const infoEl = document.getElementById('mlInfoMsg');
  const errEl = document.getElementById('mlErrorMsg');
  errEl.style.display = 'none';
  infoEl.style.display = 'none';
  try {
    if (typeof window._scrapeActiveLimitsIds === 'function') {
      const ids = window._scrapeActiveLimitsIds();
      infoEl.textContent = 'Se encontraron ' + ids.length + ' contactos en la pagina';
      infoEl.style.display = 'block';
      document.getElementById('mlScrapedVal').textContent = ids.length;
    }
  } catch (e) {
    errEl.textContent = 'Error al rastrear: ' + e.message;
    errEl.style.display = 'block';
  }
}

async function abortMailingFromPanel() {
  if (typeof window._abortMailingRound === 'function') {
    window._abortMailingRound();
    const infoEl = document.getElementById('mlInfoMsg');
    infoEl.textContent = 'Abort solicitado...';
    infoEl.style.display = 'block';
  }
}
