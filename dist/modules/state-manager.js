var Tesseract = (function () {
  var API = typeof TESSERACT_CONFIG !== 'undefined' ? TESSERACT_CONFIG.API : 'https://tesseract-jblo.onrender.com';

  var state = {
    isAuthenticated: false,
    currentUser: null,
    currentClientName: 'Cliente',
    currentTab: 'main',
    currentStarFilter: 'all',

    eaterActive: false,
    clonacionActiva: true,
    eaterResponse: '',
    isUsingAI: false,
    _processedTexts: new Set(),
    _responseTimers: new Map(),

    likesActive: false,
    followsActive: false,
    likeFollowActive: false,
    cartasActive: false,

    lfpActive: false,
    lfpPaused: false,

    isEnglishMode: false,
    selectedLangCode: 'en',
    clientDetectedLang: null,

    translateLanguages: [
      { code: 'en', label: 'EN', name: 'English' },
      { code: 'fr', label: 'FR', name: 'Français' },
      { code: 'pt', label: 'PT', name: 'Português' },
      { code: 'de', label: 'DE', name: 'Deutsch' },
      { code: 'it', label: 'IT', name: 'Italiano' },
      { code: 'nl', label: 'NL', name: 'Nederlands' },
      { code: 'es', label: 'ES', name: 'Español' }
    ],

    lastGeneratedMessage: '',
    cartaMessages: [
      'Querido/a amigo/a,\n\nTe escribo porque tu perfil me pareció muy interesante y me encantaría tener la oportunidad de conocerte mejor. Creo que podríamos tener una linda amistad.\n\nEspero tu respuesta con ansias.\n\nUn abrazo.',
      'Hola,\n\nHe visto tu perfil y me ha parecido fascinante. Me encantaría saber más sobre ti y lo que te apasiona.\n\nOjalá podamos conectar y compartir buenos momentos.\n\nCon cariño.',
      '¡Saludos!\n\nNo pude evitar escribirte al ver lo especial que parece tu perfil. Me gustaría mucho tener la oportunidad de conocerte y ver si hay química entre nosotros.\n\nEspero tener noticias tuyas pronto.\n\nUn beso.'
    ],

    collectedIds: { Like: [], Follow: [], LFP: [], Cartas: [] },
    botStats: { likesGiven: 0, followsGiven: 0, cartasSent: 0, contactsProcessed: 0, repliesReceived: 0, repliesResponded: 0, icebreakersSent: 0, mailingSent: 0, autoResponse: 0 },

    blacklist: [],

    _tessSyncQueue: [],
    _tessSyncFlushTimer: null,
  };

  var _tabId = Date.now() + '_' + Math.random().toString(36).slice(2, 8);
  var _channel = new BroadcastChannel('tesseract-sync');

  _channel.onmessage = function (event) {
    var msg = event.data;
    if (!msg || msg.source !== 'tesseract' || msg.tabId === _tabId) return;
    if (msg.type === 'STATE_SYNC' && msg.data) {
      syncFromBroadcast(msg.data);
    }
  };

  function broadcast(type, data) {
    _channel.postMessage({ type: type, data: data, source: 'tesseract', tabId: _tabId });
  }

  function syncFromBroadcast(data) {
    if (data.eaterActive !== undefined && data.eaterActive !== state.eaterActive) {
      state.eaterActive = data.eaterActive;
      emit('eaterActiveChanged', state.eaterActive);
    }
    if (data.clonacionActiva !== undefined && data.clonacionActiva !== state.clonacionActiva) {
      state.clonacionActiva = data.clonacionActiva;
      emit('clonacionChanged', state.clonacionActiva);
    }
    if (data.isAuthenticated !== undefined) {
      if (data.isAuthenticated && !state.isAuthenticated && data.currentUser) {
        state.isAuthenticated = true;
        state.currentUser = data.currentUser;
        emit('authChanged', true);
      } else if (!data.isAuthenticated && state.isAuthenticated) {
        state.isAuthenticated = false;
        state.currentUser = null;
        emit('authChanged', false);
      }
    }
    if (data.collectedIds) state.collectedIds = data.collectedIds;
    if (data.botStats) state.botStats = data.botStats;
  }

  var _listeners = {};

  function on(event, fn) {
    (_listeners[event] = _listeners[event] || []).push(fn);
  }

  function off(event, fn) {
    var list = _listeners[event];
    if (!list) return;
    _listeners[event] = list.filter(function (f) { return f !== fn; });
  }

  function emit(event, data) {
    var list = _listeners[event];
    if (!list) return;
    for (var i = 0; i < list.length; i++) {
      try { list[i](data); } catch (e) {}
    }
  }

  function get(key) {
    return state[key];
  }

  function set(key, value) {
    state[key] = value;
    emit(key + 'Changed', value);
    return value;
  }

  function getState() { return state; }

  function registerId(category, id) {
    if (!id) return false;
    var ids = state.collectedIds[category];
    if (!ids) return false;
    if (ids.indexOf(id) === -1) {
      ids.push(id);
      emit('collectedIdsChanged', { category: category, id: id });
      return true;
    }
    return false;
  }

  function clearIds() {
    state.collectedIds = { Like: [], Follow: [], LFP: [], Cartas: [] };
    emit('collectedIdsChanged', null);
  }

  function getCollectedIds(filter) {
    var ids = [];
    if (filter === 'all' || !filter) {
      Object.keys(state.collectedIds).forEach(function (t) {
        (state.collectedIds[t] || []).forEach(function (id) { ids.push({ id: id, type: t }); });
      });
    } else if (filter === 'L+F') {
      ['Like', 'Follow', 'LFP'].forEach(function (t) {
        (state.collectedIds[t] || []).forEach(function (id) { ids.push({ id: id, type: t }); });
      });
    } else {
      (state.collectedIds[filter] || []).forEach(function (id) { ids.push({ id: id, type: filter }); });
    }
    return ids;
  }

  function blacklistAdd(id) {
    if (!id) return;
    if (state.blacklist.indexOf(id) === -1) {
      state.blacklist.push(id);
      emit('blacklistChanged', state.blacklist);
    }
  }

  function blacklistRemove(id) {
    var idx = state.blacklist.indexOf(id);
    if (idx !== -1) {
      state.blacklist.splice(idx, 1);
      emit('blacklistChanged', state.blacklist);
    }
  }

  function isBlacklisted(id) {
    if (!id) return false;
    return state.blacklist.indexOf(id) !== -1;
  }

  function queueSync(profileId) {
    state._tessSyncQueue.push(String(profileId));
    if (!state._tessSyncFlushTimer) {
      state._tessSyncFlushTimer = setTimeout(flushSyncQueue, 5000);
    }
  }

  function flushSyncQueue() {
    state._tessSyncFlushTimer = null;
    var batch = state._tessSyncQueue.slice();
    state._tessSyncQueue = [];
    chrome.storage.local.get('tess_jwt', function (d) {
      var token = d.tess_jwt;
      if (!token) return;
      var ctrl = new AbortController();
      var to = setTimeout(function () { ctrl.abort(); }, 20000);
      fetch(API + '/api/tess/metrics/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
        body: JSON.stringify({ action: 'HISTORY_BATCH', historyBatch: batch }),
        signal: ctrl.signal
      }).then(function (r) {
        clearTimeout(to);
      }).catch(function () { clearTimeout(to); });
    });
  }

  return {
    API: API,
    get: get,
    set: set,
    getState: getState,
    on: on,
    off: off,
    emit: emit,
    broadcast: broadcast,
    registerId: registerId,
    clearIds: clearIds,
    getCollectedIds: getCollectedIds,
    blacklistAdd: blacklistAdd,
    blacklistRemove: blacklistRemove,
    isBlacklisted: isBlacklisted,
    queueSync: queueSync,
    flushSyncQueue: flushSyncQueue
  };
})();

// Backward-compatible variable shims (all content scripts share this scope)
var isAuthenticated = Tesseract.get('isAuthenticated');
var eaterActive = Tesseract.get('eaterActive');
var clonacionActiva = Tesseract.get('clonacionActiva');
var eaterResponse = Tesseract.get('eaterResponse');
var isUsingAI = Tesseract.get('isUsingAI');
var _processedTexts = Tesseract.get('_processedTexts');
var _responseTimers = Tesseract.get('_responseTimers');
var currentClientName = Tesseract.get('currentClientName');
var currentUser = Tesseract.get('currentUser');
var clientDetectedLang = Tesseract.get('clientDetectedLang');
var selectedLangCode = Tesseract.get('selectedLangCode');
var translateLanguages = Tesseract.get('translateLanguages');
var botStats = Tesseract.get('botStats');
var collectedIds = Tesseract.get('collectedIds');
var currentTab = Tesseract.get('currentTab');
var currentStarFilter = Tesseract.get('currentStarFilter');
var likesActive = Tesseract.get('likesActive');
var followsActive = Tesseract.get('followsActive');
var likeFollowActive = Tesseract.get('likeFollowActive');
var cartasActive = Tesseract.get('cartasActive');
var lastGeneratedMessage = Tesseract.get('lastGeneratedMessage');
var isEnglishMode = Tesseract.get('isEnglishMode');
var cartaMessages = Tesseract.get('cartaMessages');
var TESSERACT_API = Tesseract.API;
