// TESSERACT v24 - Auto-Answer Panel UI
// Fixado: guardado de configuración con feedback visual

function showAASavedFeedback() {
  const btn = document.getElementById('aaSaveBtn');
  if (btn) {
    const original = btn.textContent;
    btn.textContent = '✅ ¡GUARDADO!';
    btn.style.background = '#4CAF50';
    btn.style.borderColor = '#4CAF50';
    btn.style.color = '#fff';
    setTimeout(() => {
      btn.textContent = original;
      btn.className = 'primary';
      btn.style.background = '';
      btn.style.borderColor = '';
      btn.style.color = '';
    }, 2000);
  }
}

function getAAConfigSafe() {
  return window._getAAConfigDirect ? window._getAAConfigDirect() : null;
}

// ============ CREATE AUTO-ANSWER MODAL ============
function createAutoAnswerPanel() {
  if (document.getElementById('aaModal')) return;

  const m = document.createElement('div');
  m.id = 'aaModal';
  m.innerHTML = `
<style>
#aaModal{position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:9999999;display:none;}
.aa-box{width:520px;max-height:80vh;background:#0a0a0a;border:2px solid #8b5cf6;border-radius:12px;box-shadow:0 0 40px rgba(139,92,246,0.5);color:#e0e0e0;font-family:'Orbitron','Segoe UI',sans-serif;overflow:hidden;display:flex;flex-direction:column;}
.aa-hdr{background:linear-gradient(135deg,#1e1b4b,#8b5cf6,#1e1b4b);padding:12px 16px;font-weight:bold;letter-spacing:2px;display:flex;justify-content:space-between;border-bottom:2px solid #8b5cf6;color:#e0e0e0;font-size:13px;}
.aa-hdr span{cursor:pointer;font-size:18px;}
.aa-body{padding:16px;overflow-y:auto;flex:1;}
.aa-body::-webkit-scrollbar{width:4px;}
.aa-body::-webkit-scrollbar-track{background:#0a0a0a;}
.aa-body::-webkit-scrollbar-thumb{background:#8b5cf6;border-radius:2px;}

.aa-section{margin-bottom:14px;padding:10px;background:rgba(30,27,75,0.3);border:1px solid rgba(139,92,246,0.2);border-radius:8px;}
.aa-section h4{font-size:10px;letter-spacing:1px;margin:0 0 8px 0;color:#e0e0e0;text-transform:uppercase;display:flex;align-items:center;gap:6px;}
.aa-section label{display:flex;align-items:center;gap:8px;font-size:10px;letter-spacing:0.5px;color:#ccc;margin:4px 0;cursor:pointer;}
.aa-section input[type="checkbox"]{accent-color:#8b5cf6;width:14px;height:14px;cursor:pointer;}
.aa-section input[type="number"]{width:60px;padding:4px 6px;background:#000;border:1px solid #8b5cf6;border-radius:4px;color:#e0e0e0;font-family:'Share Tech Mono',monospace;font-size:10px;}
.aa-section input[type="text"], .aa-section textarea{width:100%;padding:6px;background:#000;border:1px solid #8b5cf6;border-radius:4px;color:#e0e0e0;font-family:Arial;font-size:11px;box-sizing:border-box;}
.aa-section textarea{height:50px;resize:vertical;}
.aa-section textarea:focus, .aa-section input:focus{outline:none;border-color:#7c3aed;}

.aa-ev-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;}
.aa-ev-card{padding:10px;background:rgba(0,0,0,0.4);border:1px solid rgba(139,92,246,0.3);border-radius:6px;}
.aa-ev-card h5{font-size:9px;letter-spacing:1px;margin:0 0 5px 0;text-transform:uppercase;}
.aa-ev-card .aa-ev-toggle{display:flex;align-items:center;gap:6px;margin-bottom:4px;}
.aa-ev-card textarea{height:36px;font-size:10px;}

.aa-delay-row{display:flex;gap:12px;align-items:center;}
.aa-delay-row label{font-size:9px;}
.aa-delay-row input{width:50px;}

.aa-foot{padding:12px;border-top:1px solid #8b5cf6;text-align:right;display:flex;justify-content:space-between;align-items:center;background:rgba(0,0,0,0.3);}
.aa-foot .aa-status{font-size:9px;letter-spacing:1px;}
.aa-foot .aa-status .dot{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:4px;}
.aa-foot .aa-status .dot.on{background:#4CAF50;box-shadow:0 0 8px #4CAF50;}
.aa-foot .aa-status .dot.off{background:#666;}
.aa-foot button{padding:8px 16px;border:1px solid #8b5cf6;border-radius:6px;background:rgba(30,27,75,0.7);color:#e0e0e0;cursor:pointer;font-family:'Orbitron',sans-serif;font-size:9px;letter-spacing:1px;margin-left:6px;transition:all 0.3s;}
.aa-foot button:hover{background:#7c3aed;color:#fff;}
.aa-foot button.primary{background:#8b5cf6;color:#000;}
.aa-foot button.primary:hover{background:#7c3aed;color:#fff;}

.aa-error{color:#dc2626;font-size:9px;margin:4px 0;padding:4px 8px;background:rgba(220,38,38,0.1);border:1px solid #dc2626;border-radius:4px;display:none;}
</style>
<div class="aa-box">
<div class="aa-hdr"><span>🤖 AUTO-ANSWER</span><span id="aaCloseBtn">&times;</span></div>
<div class="aa-body">
  <div class="aa-section">
    <h4>⚙ General</h4>
    <label style="display:flex;align-items:center;gap:8px;"><input type="checkbox" id="aaEnabledToggle"> Auto-Answer Activado</label>
    <label style="display:flex;align-items:center;gap:8px;"><input type="checkbox" id="aaUseAIToggle"> Usar AI para respuestas inteligentes (Groq)</label>
    <div style="margin-top:6px;display:flex;gap:12px;align-items:center;">
      <label style="font-size:9px;">Límite diario: <input type="number" id="aaMaxDaily" value="50" min="0" style="width:50px;"></label>
    </div>
  </div>

  <div class="aa-section">
    <h4>⏱ Delay entre respuesta y envío</h4>
    <div class="aa-delay-row">
      <label>Min: <input type="number" id="aaDelayMin" value="2" min="0"> seg</label>
      <label>Max: <input type="number" id="aaDelayMax" value="5" min="0"> seg</label>
    </div>
  </div>

  <div class="aa-section">
    <h4>🏷 Fuentes de rastreo (barridos de saludos)</h4>
    <div class="ml-dom-sources">
      <label style="display:flex;align-items:center;gap:8px;"><input type="checkbox" id="aaSrcMessages" checked> Messages Active</label>
      <label style="display:flex;align-items:center;gap:8px;"><input type="checkbox" id="aaSrcContactList"> Contact List (todo el DOM)</label>
    </div>
    <p style="font-size:7px;color:#666;margin:4px 0 0 0;">Localiza contactos activos en la página al hacer barridos de saludos.</p>
  </div>

  <div class="aa-section">
    <h4>📋 Eventos y Plantillas</h4>
    <div class="aa-ev-grid">
      <div class="aa-ev-card">
        <h5>❤️ Like</h5>
        <div class="aa-ev-toggle"><input type="checkbox" id="aaEvLike"> <span>Activo</span></div>
        <textarea id="aaEvLikeTmpl" placeholder="Plantilla de respuesta para Like..."></textarea>
      </div>
      <div class="aa-ev-card">
        <h5>😉 Wink</h5>
        <div class="aa-ev-toggle"><input type="checkbox" id="aaEvWink"> <span>Activo</span></div>
        <textarea id="aaEvWinkTmpl" placeholder="Plantilla de respuesta para Wink..."></textarea>
      </div>
      <div class="aa-ev-card">
        <h5>💬 Comment</h5>
        <div class="aa-ev-toggle"><input type="checkbox" id="aaEvComment"> <span>Activo</span></div>
        <textarea id="aaEvCommentTmpl" placeholder="Plantilla de respuesta para Comment..."></textarea>
      </div>
      <div class="aa-ev-card">
        <h5>🎁 Gift</h5>
        <div class="aa-ev-toggle"><input type="checkbox" id="aaEvGift"> <span>Activo</span></div>
        <textarea id="aaEvGiftTmpl" placeholder="Plantilla de respuesta para Gift..."></textarea>
      </div>
      <div class="aa-ev-card">
        <h5>👋 Greeting</h5>
        <div class="aa-ev-toggle"><input type="checkbox" id="aaEvGreeting"> <span>Activo</span></div>
        <textarea id="aaEvGreetingTmpl" placeholder="Plantilla de saludo para barrido..."></textarea>
      </div>
    </div>
  </div>

  <div class="aa-section">
    <h4>🔄 System Message Auto-Respond</h4>
    <label style="display:flex;align-items:center;gap:8px;"><input type="checkbox" id="aaWeBelieveToggle"> Responder automáticamente a mensaje "We Believe"</label>
    <textarea id="aaWeBelieveResponse" placeholder="Mensaje de respuesta cuando aparece 'We believe people come here...'" style="margin-top:6px;">Hello! How are you?</textarea>
  </div>

  <div class="aa-section">
    <h4>📊 Estadísticas del Día</h4>
    <div class="stats-row">
      <div class="stat-mini"><span class="val" id="aaTodayResp">0</span>HOY</div>
      <div class="stat-mini"><span class="val" id="aaDailyLimit">50</span>LÍMITE</div>
    </div>
    <div id="aaErrorMsg" class="aa-error"></div>
  </div>
</div>
<div class="aa-foot">
  <div class="aa-status" id="aaStatusBar"><span class="dot off" id="aaStatusDot"></span><span id="aaStatusText">INACTIVO</span></div>
  <div>
    <button id="aaSaveBtn" class="primary">💾 GUARDAR</button>
    <button id="aaCloseBtn2">CERRAR</button>
  </div>
</div>
</div>`;
  document.body.appendChild(m);

  // Event listeners
  document.getElementById('aaCloseBtn').addEventListener('click', () => {
    document.getElementById('aaModal').style.display = 'none';
  });
  document.getElementById('aaCloseBtn2').addEventListener('click', () => {
    document.getElementById('aaModal').style.display = 'none';
  });

  // Fix: Guardado robusto con feedback visual
  document.getElementById('aaSaveBtn').addEventListener('click', async function() {
    try {
      await saveAAPanelConfig();
      showAASavedFeedback();
      updateAATabUI();
      document.getElementById('aaErrorMsg').style.display = 'none';
    } catch (err) {
      console.error('[AA-PANEL] Save error:', err);
      const errEl = document.getElementById('aaErrorMsg');
      errEl.textContent = '❌ Error al guardar: ' + (err.message || 'Error desconocido');
      errEl.style.display = 'block';
    }
  });

  console.log('[AA-PANEL] Panel created');
}

async function openAAPanel() {
  createAutoAnswerPanel();
  const modal = document.getElementById('aaModal');
  if (!modal) return;

  await loadAAPanelState();
  modal.style.display = 'block';
}

async function loadAAPanelState() {
  // Usar accessor global o cargar desde storage
  let config = getAAConfigSafe();
  if (!config) {
    await window._loadAAConfigDirect();
    config = getAAConfigSafe();
  }
  if (!config) config = { enabled: false, delay: { min: 2000, max: 5000 }, events: {}, maxDaily: 50, respondedToday: 0, useAI: false, scanSources: ['messages-active'] };

  document.getElementById('aaEnabledToggle').checked = config.enabled || false;
  document.getElementById('aaUseAIToggle').checked = config.useAI || false;
  document.getElementById('aaMaxDaily').value = config.maxDaily || 50;
  document.getElementById('aaDelayMin').value = Math.floor((config.delay?.min || 2000) / 1000);
  document.getElementById('aaDelayMax').value = Math.floor((config.delay?.max || 5000) / 1000);

  // Eventos
  const evts = ['like', 'wink', 'comment', 'gift', 'greeting'];
  evts.forEach(ev => {
    const key = 'aaEv' + ev.charAt(0).toUpperCase() + ev.slice(1);
    const checkedEl = document.getElementById(key);
    const tmplEl = document.getElementById(key + 'Tmpl');
    if (checkedEl && config.events) checkedEl.checked = !!config.events[ev]?.enabled;
    if (tmplEl && config.events) tmplEl.value = config.events[ev]?.template || '';
  });

  // We Believe
  document.getElementById('aaWeBelieveToggle').checked = config.weBelieve?.enabled || false;
  document.getElementById('aaWeBelieveResponse').value = config.weBelieve?.response || 'Hello! How are you?';

  // Fuentes de rastreo
  document.getElementById('aaSrcMessages').checked = !(config.scanSources || []).includes('messages-active') ? false : true;
  document.getElementById('aaSrcContactList').checked = (config.scanSources || []).includes('contact-list');

  // Stats
  document.getElementById('aaTodayResp').textContent = config.respondedToday || 0;
  document.getElementById('aaDailyLimit').textContent = config.maxDaily || 50;

  updateAATabUI();
}

async function saveAAPanelConfig() {
  const enabled = document.getElementById('aaEnabledToggle').checked;
  const useAI = document.getElementById('aaUseAIToggle').checked;
  const maxDaily = parseInt(document.getElementById('aaMaxDaily').value) || 50;
  const delayMin = (parseInt(document.getElementById('aaDelayMin').value) || 2) * 1000;
  const delayMax = (parseInt(document.getElementById('aaDelayMax').value) || 5) * 1000;

  const scanSources = [];
  if (document.getElementById('aaSrcMessages').checked) scanSources.push('messages-active');
  if (document.getElementById('aaSrcContactList').checked) scanSources.push('contact-list');

  const events = {};
  const evts = ['like', 'wink', 'comment', 'gift', 'greeting'];
  for (const ev of evts) {
    const key = 'aaEv' + ev.charAt(0).toUpperCase() + ev.slice(1);
    const checkedEl = document.getElementById(key);
    const tmplEl = document.getElementById(key + 'Tmpl');
    if (checkedEl && tmplEl) {
      events[ev] = {
        enabled: checkedEl.checked,
        template: tmplEl.value
      };
    }
  }

  const weBelieveEnabled = document.getElementById('aaWeBelieveToggle').checked;
  const weBelieveResponse = document.getElementById('aaWeBelieveResponse').value;

  await window._updateAAConfigBulk({
    enabled: enabled,
    useAI: useAI,
    maxDaily: maxDaily,
    delay: { min: delayMin, max: delayMax },
    scanSources: scanSources,
    events: events,
    weBelieve: { enabled: weBelieveEnabled, response: weBelieveResponse }
  });

  await window._setAAState(enabled);
  if (enabled) await window._updateAAWeBelieve({ enabled: weBelieveEnabled });

  console.log('[AA-PANEL] Config saved');
}

function updateAATabUI() {
  // Sincroniza el estado del popup AA en la pestaña del panel principal
  const cfg = getAAConfigSafe();
  if (!cfg) return;
  document.getElementById('aaStatusInline').textContent = cfg.enabled ? 'ACTIVO' : 'INACTIVO';
  document.getElementById('aaStatusInline').style.color = cfg.enabled ? '#4CAF50' : '#666';

  const evts = ['like', 'wink', 'comment', 'gift'];
  evts.forEach(ev => {
    const el = document.getElementById('aa' + ev.charAt(0).toUpperCase() + ev.slice(1) + 'Status');
    if (el) {
      const enabled = cfg.events?.[ev]?.enabled;
      el.textContent = enabled ? 'ACTIVO' : 'DESACTIVADO';
      el.style.color = enabled ? '#4CAF50' : '#666';
    }
  });

  document.getElementById('aaTodayResp').textContent = cfg.respondedToday || 0;
  document.getElementById('aaDailyLimit').textContent = cfg.maxDaily || 50;

  // Sync main panel toggle switch
  const toggle = document.getElementById('btnToggleAA');
  if (toggle) toggle.checked = cfg.enabled || false;
}