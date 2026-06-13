// TESSERACT v24.0 - CRIBS Profile Scraper + Overlay (extraído de talky-bot-panel.js)

function cribScrapeViaRouter(profileId, entryId, jwt) {
  console.log('[CRIBS] Obteniendo datos via API /platform/connections/profiles');
  window.fetch('https://talkytimes.com/platform/connections/profiles', {
    method: 'POST',
    headers: { 'accept': 'application/json', 'content-type': 'application/json', 'x-requested-with': '2424' },
    credentials: 'include',
    body: JSON.stringify({ ids: [Number(profileId)], withoutTranslation: false })
  }).then(function (r) { return r.json(); }).then(function (data) {
    console.log('[CRIBS] API response:', JSON.stringify(data).slice(0, 3000));
    var profile = null;
    if (data.data && data.data.profiles && Array.isArray(data.data.profiles)) profile = data.data.profiles[0];
    else if (Array.isArray(data)) profile = data[0];
    else if (data.profiles && Array.isArray(data.profiles)) profile = data.profiles[0];
    else profile = data;
    if (!profile) { console.log('[CRIBS] No se encontró perfil en respuesta'); return; }
    var name = profile.name || profile.displayName || profile.username || profile.fullName || profile.nickname || profile.firstName || '';
    if (name && profile.lastName) name = name + ' ' + profile.lastName;
    var personal = profile.personal || profile.profile || {};
    var country = profile.country || profile.location || profile.country_name || profile.countryName || '';
    if (!country && personal.country) country = personal.country;
    var age = profile.age || personal.age || null;
    if (!age && personal.birthDate) { var bd = new Date(personal.birthDate); if (!isNaN(bd)) age = new Date().getFullYear() - bd.getFullYear(); }
    if (!age && personal.birthday) { var bd2 = new Date(personal.birthday); if (!isNaN(bd2)) age = new Date().getFullYear() - bd2.getFullYear(); }
    var interests = '', bio = '';
    var interestsSource = profile.interests || personal.interests || profile.hobbies || personal.hobbies || profile.tags || personal.tags;
    if (interestsSource) interests = Array.isArray(interestsSource) ? interestsSource.join(', ') : String(interestsSource);
    if (!interests && profile.preferences) {
      if (profile.preferences.pref_personality_type) interests = profile.preferences.pref_personality_type;
    }
    bio = personal.about_me || personal.bio || personal.description || personal.about || '';
    if (!interests && bio) {
      var kw = { viajes: ['viaje','viajar','travel','playa'], mÃºsica: ['mÃºsica','music','bailar','cantar'], deportes: ['deporte','gym','gimnasio','fÃºtbol'], lectura: ['libro','leer','lectura'], cine: ['pelÃ­cula','cine','movie','series'], cocina: ['cocina','cocinar','food','comida'] };
      var t = bio.toLowerCase();
      var found = []; for (var k in kw) { if (kw[k].some(function (w) { return t.includes(w); })) found.push(k); }
      if (found.length) interests = found.join(', ');
    }
    var arrToStr = function (a) { return Array.isArray(a) ? a.join(', ') : String(a || ''); };
    var city = personal.city || '';
    var work = personal.field_of_work || '';
    var marital_status = personal.marital_status || '';
    var traits = arrToStr(personal.traits);
    var movie_genres = arrToStr(personal.movie_genres);
    var music_genres = arrToStr(personal.music_genres);
    var goal = arrToStr(personal.goal);
    var languages = arrToStr(personal.other_languages);
    var education = personal.education || '';
    var looking_for = personal.looking_for || '';
    var body_type = personal.body_type || '';
    var extra = { city: city, work: work, marital_status: marital_status, traits: traits, movie_genres: movie_genres, music_genres: music_genres, goal: goal, languages: languages, education: education, looking_for: looking_for, body_type: body_type };
    console.log('[CRIBS] Datos extraÃ­dos:', JSON.stringify({ name: name, country: country, age: age, interests: interests, bio: bio, ...extra }));
    if (name) {
      var headers = { 'Content-Type': 'application/json' };
      if (jwt) headers['Authorization'] = 'Bearer ' + jwt;
      var body = { profile_name: name };
      if (country) body.country = country;
      if (age) body.age = age;
      if (interests) body.interests = interests;
      Object.keys(extra).forEach(function (k) { if (extra[k]) body[k] = extra[k]; });
      fetch(TESSERACT_API + '/api/tess/cribs/' + entryId + '/bulk', { method: 'PUT', headers: headers, body: JSON.stringify(body) }).then(function (r) {
        if (!r.ok) { console.log('[CRIBS] Bulk PUT error status:', r.status); return r.text().then(function (t) { console.log('[CRIBS] Bulk PUT response:', t); }); }
        console.log('[CRIBS] Bulk PUT exitoso');
        try { chrome.runtime.sendMessage({action: 'CRIBS_REFRESH'}); } catch (e) { console.log('[CRIBS] sendMessage error:', e.message); }
        try {
          var rawScrapedId = String(profileId).replace(/^0+/, '');
          if (window._lastCribsPid === rawScrapedId) { fetchCribsForProfile(rawScrapedId); }
        } catch (e) { console.log('[CRIBS] overlay refresh error:', e.message); }
      }).catch(function (e) { console.log('[CRIBS] Bulk PUT network error:', e.message); });
      console.log('[CRIBS] Perfil actualizado:', name, country, age, interests, JSON.stringify(extra));
    } else {
      console.log('[CRIBS] No se encontrÃ³ nombre, respuesta completa:', JSON.stringify(profile).slice(0, 300));
    }
  }).catch(function (e) {
    console.log('[CRIBS] Error en fetch API:', e.message);
  });
}

chrome.runtime.onMessage.addListener((req, sender, res) => {
  if (req.action === 'toggle_eater') { toggleEater(); res({ success: true }); }
  if (req.action === 'TESSERACT_TRACK_ACTION') {
    const typeMap = { likes: 'Like', follows: 'Follow', cartas: 'Cartas' };
    const cat = typeMap[req.type];
    if (cat && req.clientId) {
      const registered = registerIdInStarTools(String(req.clientId), cat);
      if (registered) {
        console.log('[STAR-TOOLS] ðŸ”— ID del bot real registrado:', req.clientId, 'â†’', cat);
      }
    }
    res && res({ success: true });
  }
  if (req.action === 'SCRAPE_PROFILE') {
    const profileId = req.profileId, entryId = req.entryId, jwt = req.jwt;
    console.log('[CRIBS] SCRAPE_PROFILE recibido:', profileId, 'entryId:', entryId);
    if (!profileId) { res({ error: 'profileId required' }); return; }
    _tessJwtCache = jwt || '';
    cribScrapeViaRouter(profileId, entryId, jwt);
    res({ success: true });
    return true;
  }
  return true;
});

chrome.storage.onChanged.addListener(function (changes, namespace) {
  if (namespace !== 'local') return;
  if (changes._tess_pending_scrape && changes._tess_pending_scrape.newValue) {
    var scrape = changes._tess_pending_scrape.newValue;
    console.log('[CRIBS-STORAGE] Pending scrape detected:', scrape.profileId, 'entryId:', scrape.entryId);
    chrome.storage.local.remove('_tess_pending_scrape');
    cribScrapeViaRouter(scrape.profileId, scrape.entryId, scrape.jwt);
  }
});

(function checkPendingScrapes() {
  chrome.storage.local.get('_tess_pending_scrape', function (data) {
    if (data._tess_pending_scrape) {
      var scrape = data._tess_pending_scrape;
      if (Date.now() - scrape.timestamp < 30000) {
        console.log('[CRIBS-STORAGE] Pending scrape al iniciar:', scrape.profileId);
        chrome.storage.local.remove('_tess_pending_scrape');
        cribScrapeViaRouter(scrape.profileId, scrape.entryId, scrape.jwt);
      } else {
        chrome.storage.local.remove('_tess_pending_scrape');
      }
    }
  });
})();

function domScrapeProfile(profileId) {
  console.log('[CRIBS-DOM] Extrayendo perfil', profileId, 'desde la pÃ¡gina');
  var rawTarget = String(profileId).replace(/^0+/, '');
  var result = null;

  try {
    var stateKeys = ['__INITIAL_STATE__', '__DATA__', '__USER__', '__PROFILE__', '__NEXT_DATA__', 'store', '__store__', '__PRELOADED_STATE__'];
    for (var si = 0; si < stateKeys.length; si++) {
      var source = window[stateKeys[si]];
      if (!source || typeof source !== 'object') continue;
      var found = deepFindProfile(source, rawTarget, 0);
      if (found && found.profile_name) {
        console.log('[CRIBS-DOM] Datos extraÃ­dos por navegaciÃ³n de', stateKeys[si], JSON.stringify(found));
        return found;
      }
    }
    for (var si2 = 0; si2 < stateKeys.length; si2++) {
      var src2 = window[stateKeys[si2]];
      if (!src2 || typeof src2 !== 'object') continue;
      var str = JSON.stringify(src2);
      if (str.indexOf(rawTarget) === -1) continue;
      var parsed = jsonScanProfile(str, rawTarget);
      if (parsed && parsed.profile_name) {
        console.log('[CRIBS-DOM] Datos extraÃ­dos por jsonScan de', stateKeys[si2], JSON.stringify(parsed));
        return parsed;
      }
    }
  } catch (e) { console.log('[CRIBS-DOM] Error en estado global:', e.message); }

  result = scrapeProfileFromDOM();
  if (result && result.profile_name) {
    console.log('[CRIBS-DOM] Datos extraÃ­dos del DOM completo:', JSON.stringify(result));
    return result;
  }

  var nameSelectors = [
    '[class*="username"]', '[class*="display-name"]', '[class*="profile-name"]',
    '[class*="user-name"]', '[class*="member-name"]', '[class*="nickname"]',
    '[class*="conversation"] [class*="name"]', '[class*="chat-header"] [class*="name"]',
    '[class*="chat"] [class*="name"]', '[class*="dialog"] [class*="name"]',
    '[class*="contact"] [class*="name"]', '[class*="active"] [class*="name"]',
    '[class*="selected"] [class*="name"]', '[class*="header"] [class*="name"]',
    '[class*="top"] [class*="heading"]', 'h1', 'h2', '[class*="title"]'
  ];
  for (var ns = 0; ns < nameSelectors.length; ns++) {
    var el = document.querySelector(nameSelectors[ns]);
    if (el) {
      var t = el.textContent.trim();
      if (t && t.length > 1 && t.length < 50 && !t.includes('@') && !t.includes('http') && !t.match(/^(Chat|Profile|Home|Settings|Search|\d)/i)) {
        var cleaned = cleanExtractedName(t);
        if (cleaned) {
          console.log('[CRIBS-DOM] Solo nombre extraÃ­do del DOM:', cleaned, '(original:', t + ')');
          return { profile_name: cleaned };
        }
      }
    }
  }

  try {
    var titleText = document.title.replace(/[-|].*$/, '').trim();
    if (titleText && titleText.toLowerCase() !== 'talkytimes' && titleText.length < 40) {
      console.log('[CRIBS-DOM] Nombre desde title:', titleText);
      return { profile_name: titleText };
    }
  } catch (e) {}

  try {
    var metaTitle = document.querySelector(TALK_Y.META_TITLE);
    if (metaTitle) {
      var mt = metaTitle.getAttribute('content');
      if (mt && mt.length > 1 && mt.length < 50) {
        console.log('[CRIBS-DOM] Nombre desde meta tag:', mt);
        return { profile_name: mt };
      }
    }
  } catch (e) {}

  console.log('[CRIBS-DOM] No se pudo extraer datos');
  return null;
}

function scrapeProfileFromDOM() {
  var r = {};
  console.log('[CRIBS-DOM] Iniciando escaneo completo del DOM');

  var nameEl = document.querySelector(TALK_Y.PT_NAME);
  if (nameEl) {
    var nameText = nameEl.textContent.trim();
    if (nameText && nameText.length < 50) {
      r.profile_name = cleanExtractedName(nameText);
    }
  }
  if (!r.profile_name) {
    var fallbackName = document.querySelector(TALK_Y.FALLBACK_NAME);
    if (fallbackName) {
      var ft = fallbackName.textContent.trim();
      if (ft && ft.length > 1 && ft.length < 50) r.profile_name = cleanExtractedName(ft);
    }
  }

  var countryEl = document.querySelector(TALK_Y.PT_COUNTRY);
  if (countryEl) r.country = countryEl.textContent.trim();

  var birthdayEl = document.querySelector(TALK_Y.PT_BIRTHDAY);
  if (birthdayEl) {
    var birthdayText = birthdayEl.textContent.trim();
    var age = parseAgeFromDate(birthdayText);
    if (age != null) r.age = age;
  }

  var maritalEl = document.querySelector(TALK_Y.PT_MARITAL);
  if (maritalEl) r.marital_status = maritalEl.textContent.trim();

  var hobbiesBlock = document.querySelector(TALK_Y.PT_HOBBIES);
  if (hobbiesBlock) {
    var hobbyTags = hobbiesBlock.querySelectorAll(TALK_Y.TAG_LABEL);
    var hobbies = [];
    for (var hi = 0; hi < hobbyTags.length; hi++) {
      var ht = hobbyTags[hi].textContent.trim();
      if (ht && ht.length > 1 && ht.length < 40) hobbies.push(ht);
    }
    if (hobbies.length > 0) r.interests = hobbies.join(', ');
  }

  var lookingBlock = document.querySelector(TALK_Y.PT_LOOKING_FOR);
  if (lookingBlock) {
    var lookingTags = lookingBlock.querySelectorAll(TALK_Y.TAG_LABEL);
    var lookings = [];
    for (var li = 0; li < lookingTags.length; li++) {
      var lt = lookingTags[li].textContent.trim();
      if (lt && lt.length > 1 && lt.length < 100) lookings.push(lt);
    }
    if (lookings.length > 0) r.looking_for = lookings.join(', ');
  }

  var aboutBlock = document.querySelector(TALK_Y.PT_ABOUT_ME);
  if (aboutBlock) {
    var aboutTags = aboutBlock.querySelectorAll(TALK_Y.TAG_LABEL);
    var abouts = [];
    for (var ai = 0; ai < aboutTags.length; ai++) {
      var at = aboutTags[ai].textContent.trim();
      if (at && at.length > 1 && at.length < 100) abouts.push(at);
    }
    if (abouts.length > 0) {
      r.traits = abouts.join(', ');
      r.bio = abouts.join(', ');
    }
  }

  if (!r.bio) {
    var bioSelectors = [
      '[data-test-id="op-about__block-about-me"]',
      '[class*="about"]', '[class*="bio"]', '[class*="description"]',
      '[class*="profile-text"]', '[class*="profile-bio"]'
    ];
    for (var bi = 0; bi < bioSelectors.length; bi++) {
      var bioEl = document.querySelector(bioSelectors[bi]);
      if (bioEl) {
        var bioText = bioEl.textContent.trim();
        if (bioText && bioText.length > 10 && bioText.length < 2000) {
          r.bio = bioText;
          break;
        }
      }
    }
  }

  var cityEl = document.querySelector(TALK_Y.PT_CITY);
  if (cityEl) r.city = cityEl.textContent.trim();

  var workEl = document.querySelector(TALK_Y.PT_WORK);
  if (workEl) r.work = workEl.textContent.trim();

  var eduEl = document.querySelector(TALK_Y.PT_EDUCATION);
  if (eduEl) r.education = eduEl.textContent.trim();

  var langEl = document.querySelector(TALK_Y.PT_LANGUAGES);
  if (langEl) r.languages = langEl.textContent.trim();

  var bodyEl = document.querySelector(TALK_Y.PT_BODY_TYPE);
  if (bodyEl) r.body_type = bodyEl.textContent.trim();

  var smokeEl = document.querySelector(TALK_Y.PT_SMOKING);
  if (smokeEl) r.smoking = smokeEl.textContent.trim();

  var drinkEl = document.querySelector(TALK_Y.PT_DRINKING);
  if (drinkEl) r.drinking = drinkEl.textContent.trim();

  var childEl = document.querySelector(TALK_Y.PT_CHILDREN);
  if (childEl) r.children = childEl.textContent.trim();

  var religEl = document.querySelector(TALK_Y.PT_RELIGION);
  if (religEl) r.religion = religEl.textContent.trim();

  var ethEl = document.querySelector(TALK_Y.PT_ETHNICITY);
  if (ethEl) r.ethnicity = ethEl.textContent.trim();

  var heightEl = document.querySelector(TALK_Y.PT_HEIGHT);
  if (heightEl) r.height = heightEl.textContent.trim();

  var movieBlock = document.querySelector(TALK_Y.PT_MOVIE_GENRES);
  if (movieBlock) {
    var movieTags = movieBlock.querySelectorAll(TALK_Y.TAG_LABEL);
    var movies = [];
    for (var mvi = 0; mvi < movieTags.length; mvi++) {
      var mvt = movieTags[mvi].textContent.trim();
      if (mvt && mvt.length > 1 && mvt.length < 40) movies.push(mvt);
    }
    if (movies.length > 0) r.movie_genres = movies.join(', ');
  }

  var musicBlock = document.querySelector(TALK_Y.PT_MUSIC_GENRES);
  if (musicBlock) {
    var musicTags = musicBlock.querySelectorAll(TALK_Y.TAG_LABEL);
    var music = [];
    for (var mui = 0; mui < musicTags.length; mui++) {
      var mut = musicTags[mui].textContent.trim();
      if (mut && mut.length > 1 && mut.length < 40) music.push(mut);
    }
    if (music.length > 0) r.music_genres = music.join(', ');
  }

  var goalBlock = document.querySelector(TALK_Y.PT_GOAL);
  if (goalBlock) {
    var goalTags = goalBlock.querySelectorAll(TALK_Y.TAG_LABEL);
    var goals = [];
    for (var goi = 0; goi < goalTags.length; goi++) {
      var got = goalTags[goi].textContent.trim();
      if (got && got.length > 1 && got.length < 100) goals.push(got);
    }
    if (goals.length > 0) r.goal = goals.join(', ');
  }

  console.log('[CRIBS-DOM] Campos extraÃ­dos del DOM:', Object.keys(r).length, 'campos:', JSON.stringify(r));
  return r.profile_name ? r : null;
}

function scrapeProfileWithRetry(profileId, attempts, delay, callback) {
  var attempt = 0;
  function tryScrape() {
    attempt++;
    var result = scrapeProfileFromDOM();
    if (result && result.profile_name) {
      console.log('[CRIBS-DOM] Scrape exitoso en intento', attempt, ':', JSON.stringify(result));
      callback(result);
    } else if (attempt < attempts) {
      console.log('[CRIBS-DOM] Intento', attempt, 'fallido, reintentando en', delay, 'ms...');
      setTimeout(tryScrape, delay);
    } else {
      console.log('[CRIBS-DOM] Todos los', attempts, 'intentos fallidos');
      callback(null);
    }
  }
  tryScrape();
}

function deepFindProfile(obj, targetId, depth) {
  if (depth > 6 || !obj || typeof obj !== 'object') return null;
  var rawTarget = String(targetId).replace(/^0+/, '');
  var result = null;

  var objId = '';
  try { if (obj.id != null) objId = String(obj.id); } catch (e) {}
  if (!objId) try { if (obj.userId != null) objId = String(obj.userId); } catch (e) {}
  if (!objId) try { if (obj.profileId != null) objId = String(obj.profileId); } catch (e) {}
  if (!objId) try { if (obj.memberId != null) objId = String(obj.memberId); } catch (e) {}
  if (!objId) try { if (obj.uid != null) objId = String(obj.uid); } catch (e) {}

  if (objId) {
    var cleanId = objId.replace(/^0+/, '');
    if (cleanId === rawTarget) {
      result = {};
      if (obj.name || obj.displayName || obj.username || obj.fullName || obj.nickname || obj.firstName) {
        result.profile_name = obj.name || obj.displayName || obj.username || obj.fullName || obj.nickname || obj.firstName;
        if (result.profile_name && obj.lastName) result.profile_name += ' ' + obj.lastName;
      }
      if (obj.country || obj.location || obj.country_name) result.country = obj.country || obj.location || obj.country_name;
      if (obj.age != null) result.age = obj.age;
      if (obj.interests || obj.hobbies || obj.tags) {
        var isrc = obj.interests || obj.hobbies || obj.tags;
        result.interests = Array.isArray(isrc) ? isrc.join(', ') : String(isrc);
      }
      if (obj.city) result.city = obj.city;
      if (obj.field_of_work || obj.work) result.work = obj.field_of_work || obj.work;
      if (obj.marital_status) result.marital_status = obj.marital_status;
      if (obj.bio || obj.about_me || obj.description || obj.about) result.bio = obj.bio || obj.about_me || obj.description || obj.about;

      var personal = obj.personal || obj.profile || {};
      if (!result.country && personal.country) result.country = personal.country;
      if (result.age == null && personal.age != null) result.age = personal.age;
      if (!result.interests && (personal.interests || personal.hobbies || personal.tags)) {
        var psrc = personal.interests || personal.hobbies || personal.tags;
        result.interests = Array.isArray(psrc) ? psrc.join(', ') : String(psrc);
      }
      if (!result.city && personal.city) result.city = personal.city;
      if (!result.work && personal.field_of_work) result.work = personal.field_of_work;
      if (!result.marital_status && personal.marital_status) result.marital_status = personal.marital_status;
      if (personal.traits) result.traits = Array.isArray(personal.traits) ? personal.traits.join(', ') : String(personal.traits);
      if (personal.movie_genres) result.movie_genres = Array.isArray(personal.movie_genres) ? personal.movie_genres.join(', ') : String(personal.movie_genres);
      if (personal.music_genres) result.music_genres = Array.isArray(personal.music_genres) ? personal.music_genres.join(', ') : String(personal.music_genres);
      if (personal.goal) result.goal = Array.isArray(personal.goal) ? personal.goal.join(', ') : String(personal.goal);
      if (personal.other_languages) result.languages = Array.isArray(personal.other_languages) ? personal.other_languages.join(', ') : String(personal.other_languages);
      if (personal.education) result.education = personal.education;
      if (personal.looking_for) result.looking_for = personal.looking_for;
      if (personal.body_type) result.body_type = personal.body_type;

      if (result.profile_name) return result;
    }
  }

  var keys = Object.keys(obj);
  for (var ki = 0; ki < keys.length; ki++) {
    try {
      var val = obj[keys[ki]];
      if (val && typeof val === 'object') {
        var sub = deepFindProfile(val, targetId, depth + 1);
        if (sub) return sub;
      }
    } catch (e) {}
  }
  return null;
}

function jsonScanProfile(str, targetId) {
  var r = {};
  var idRegex = new RegExp('"((?:id|userId|profileId|memberId))"\\s*:\\s*"?\\s*' + targetId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*"?', 'i');
  var idMatch = idRegex.exec(str);
  if (!idMatch) return null;
  var ctxStart = Math.max(0, idMatch.index - 800);
  var ctxEnd = Math.min(str.length, idMatch.index + 800);
  var ctx = str.substring(ctxStart, ctxEnd);

  var fieldPatterns = {
    profile_name: [/"name"\s*:\s*"([^"\\]{2,40})"/, /"displayName"\s*:\s*"([^"\\]{2,40})"/, /"username"\s*:\s*"([^"\\]{2,40})"/, /"fullName"\s*:\s*"([^"\\]{2,40})"/],
    country: [/"country"\s*:\s*"([^"\\]+)"/, /"location"\s*:\s*"([^"\\]+)"/],
    age: [/"age"\s*:\s*(\d{1,3})\b/],
    city: [/"city"\s*:\s*"([^"\\]+)"/],
    work: [/"field_of_work"\s*:\s*"([^"\\]+)"/, /"work"\s*:\s*"([^"\\]+)"/],
    marital_status: [/"marital_status"\s*:\s*"([^"\\]+)"/],
    education: [/"education"\s*:\s*"([^"\\]+)"/],
    looking_for: [/"looking_for"\s*:\s*"([^"\\]+)"/],
    body_type: [/"body_type"\s*:\s*"([^"\\]+)"/]
  };

  for (var field in fieldPatterns) {
    for (var pi = 0; pi < fieldPatterns[field].length; pi++) {
      var m = ctx.match(fieldPatterns[field][pi]);
      if (m) {
        r[field] = field === 'age' ? parseInt(m[1]) : m[1];
        break;
      }
    }
  }

  var arrFieldMap = { interests: [/"(?:interests|hobbies|tags)"\s*:\s*\[([^\]]{2,300})\]/], traits: [/"(?:traits|characteristics)"\s*:\s*\[([^\]]{2,300})\]/], movie_genres: [/"movie_genres"\s*:\s*\[([^\]]{2,300})\]/], music_genres: [/"music_genres"\s*:\s*\[([^\]]{2,300})\]/], goal: [/"goal"\s*:\s*\[([^\]]{2,300})\]/], languages: [/"other_languages"\s*:\s*\[([^\]]{2,300})\]/] };
  for (var af in arrFieldMap) {
    for (var api = 0; api < arrFieldMap[af].length; api++) {
      var am = ctx.match(arrFieldMap[af][api]);
      if (am) { r[af] = am[1].replace(/"/g, '').replace(/\s*,\s*/g, ', '); break; }
    }
  }

  var bioM = ctx.match(/"(?:about_me|bio|description)"\s*:\s*"([^"\\]{10,200})"/);
  if (bioM) r.bio = bioM[1];

  if (!r.profile_name) {
    var fn = ctx.match(/"firstName"\s*:\s*"([^"\\]{2,40})"/);
    var ln = ctx.match(/"lastName"\s*:\s*"([^"\\]{2,40})"/);
    if (fn) r.profile_name = fn[1] + (ln ? ' ' + ln[1] : '');
  }

  return r.profile_name ? r : null;
}

var cribsOverlayState = { visible: false, dragged: false, profileId: null };
var cribsOverlayData = null;
var cribsOverlayTab = 'datos';

function triggerScrapeAndSave(profileId) {
  if (!profileId) { console.log('[CRIBS-SCRAPE] No hay profileId'); return; }

  var body = document.getElementById('tess-cribs-body');
  if (body) body.innerHTML = '<div class="tess-cribs-msg">Extrayendo datos del perfil...</div>';

  var scrapeBtn = document.getElementById('tess-cribs-scrape');
  if (scrapeBtn) { scrapeBtn.textContent = '\u23F3 ...'; scrapeBtn.disabled = true; }

  scrapeProfileWithRetry(profileId, 5, 800, function (domData) {
    if (!domData || !domData.profile_name) {
      if (body) body.innerHTML = '<div class="tess-cribs-msg">No se encontraron datos. Visita la p\u00e1gina de perfil del usuario.</div>';
      if (scrapeBtn) { scrapeBtn.textContent = '\u2B07 SCRAPE'; scrapeBtn.disabled = false; }
      return;
    }

    chrome.storage.local.get(['tess_jwt'], function (storageData) {
      if (!storageData.tess_jwt) {
        if (scrapeBtn) { scrapeBtn.textContent = '\u2B07 SCRAPE'; scrapeBtn.disabled = false; }
        return;
      }

      var headers = { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + storageData.tess_jwt };

      fetch(TESSERACT_API + '/api/tess/cribs', { headers: headers })
        .then(function (r) { return r.json(); })
        .then(function (resp) {
          if (!resp.cribs || !Array.isArray(resp.cribs)) {
            if (body) body.innerHTML = '<div class="tess-cribs-msg">Perfil no encontrado en Cribs. Agr\u00e9galo desde el dashboard primero.</div>';
            if (scrapeBtn) { scrapeBtn.textContent = '\u2B07 SCRAPE'; scrapeBtn.disabled = false; }
            return;
          }

          var rawTarget = String(profileId).replace(/^0+/, '');
          var entry = null;
          for (var i = 0; i < resp.cribs.length; i++) {
            var c = resp.cribs[i];
            var storedId = String(c.profile_id).replace(/^0+/, '');
            if (storedId === rawTarget) { entry = c; break; }
          }

          if (!entry) {
            if (body) body.innerHTML = '<div class="tess-cribs-msg">Perfil no en Cribs. Agr\u00e9galo desde el dashboard primero.</div>';
            if (scrapeBtn) { scrapeBtn.textContent = '\u2B07 SCRAPE'; scrapeBtn.disabled = false; }
            return;
          }

          var bodyData = { profile_name: domData.profile_name };
          if (domData.country) bodyData.country = domData.country;
          if (domData.age != null) bodyData.age = domData.age;
          if (domData.interests) bodyData.interests = domData.interests;
          if (domData.city) bodyData.city = domData.city;
          if (domData.work) bodyData.work = domData.work;
          if (domData.marital_status) bodyData.marital_status = domData.marital_status;
          if (domData.traits) bodyData.traits = domData.traits;
          if (domData.movie_genres) bodyData.movie_genres = domData.movie_genres;
          if (domData.music_genres) bodyData.music_genres = domData.music_genres;
          if (domData.goal) bodyData.goal = domData.goal;
          if (domData.languages) bodyData.languages = domData.languages;
          if (domData.education) bodyData.education = domData.education;
          if (domData.looking_for) bodyData.looking_for = domData.looking_for;
          if (domData.body_type) bodyData.body_type = domData.body_type;
          if (domData.bio) bodyData.bio = domData.bio;

          fetch(TESSERACT_API + '/api/tess/cribs/' + entry._id + '/bulk', {
            method: 'PUT',
            headers: headers,
            body: JSON.stringify(bodyData)
          }).then(function (r) {
            if (r.ok) {
              renderCribsOverlay(domData);
              try { chrome.runtime.sendMessage({action: 'CRIBS_REFRESH'}); } catch (e) {}
              if (scrapeBtn) { scrapeBtn.textContent = '\u2714 DONE'; setTimeout(function () { if (scrapeBtn) { scrapeBtn.textContent = '\u2B07 SCRAPE'; scrapeBtn.disabled = false; } }, 2000); }
            } else {
              if (body) body.innerHTML = '<div class="tess-cribs-msg">Error al guardar datos</div>';
              if (scrapeBtn) { scrapeBtn.textContent = '\u2B07 SCRAPE'; scrapeBtn.disabled = false; }
            }
          }).catch(function (e) {
            if (body) body.innerHTML = '<div class="tess-cribs-msg">Error de conexi\u00f3n</div>';
            if (scrapeBtn) { scrapeBtn.textContent = '\u2B07 SCRAPE'; scrapeBtn.disabled = false; }
          });
        })
        .catch(function (e) {
          if (body) body.innerHTML = '<div class="tess-cribs-msg">Error de conexi\u00f3n</div>';
          if (scrapeBtn) { scrapeBtn.textContent = '\u2B07 SCRAPE'; scrapeBtn.disabled = false; }
        });
    });
  });
}

function positionOverlayNearToggle(overlay, toggle) {
  var tr = toggle.getBoundingClientRect();
  var oh = overlay.offsetHeight || parseInt(getComputedStyle(overlay).maxHeight) || 400;
  overlay.style.left = tr.left + 'px';
  overlay.style.top = Math.max(5, tr.top - oh - 5) + 'px';
  overlay.style.setProperty('bottom', 'auto', 'important');
  overlay.style.setProperty('right', 'auto', 'important');
}

function ensureCribsElements() {
  var hasToggle = document.getElementById('tess-cribs-toggle');
  var hasOverlay = document.getElementById('tess-cribs-overlay');
  if (!hasToggle || !hasOverlay) {
    if (hasToggle) hasToggle.remove();
    if (hasOverlay) hasOverlay.remove();
    createCribsOverlay();
  }
}

function createCribsOverlay() {
  try {
  if (document.getElementById('tess-cribs-overlay')) return;
  var css = document.createElement('style');
  css.textContent = `
    #tess-cribs-toggle { position:fixed !important; left:10px !important; bottom:50px !important; z-index:2147483647 !important; background:#6d28d9; color:#fff; border:none; border-radius:50%; width:44px; height:44px; font-size:20px; cursor:grab; box-shadow:0 2px 12px rgba(109,40,217,0.5); display:flex !important; align-items:center; justify-content:center; opacity:0.85; user-select:none; visibility:visible !important; }
    #tess-cribs-toggle:active { cursor:grabbing; }
    #tess-cribs-toggle:hover { opacity:1; }
    #tess-cribs-overlay { position:fixed; left:10px; bottom:95px; width:300px; max-height:420px; background:#13131a; border:1px solid #2d2d3f; border-radius:8px; box-shadow:0 4px 24px rgba(0,0,0,0.6); z-index:2147483646; font:13px/1.5 -apple-system,BlinkMacSystemFont,sans-serif; color:#ddd; overflow:hidden; display:none; flex-direction:column; }
    #tess-cribs-overlay.visible { display:flex; }
    #tess-cribs-header { display:flex; align-items:center; justify-content:space-between; padding:8px 12px; background:#1a1a24; cursor:grab; border-bottom:1px solid #2d2d3f; user-select:none; }
    #tess-cribs-title { font-weight:600; font-size:14px; color:#c4b5fd; }
    #tess-cribs-header:active { cursor:grabbing; }
    #tess-cribs-actions { display:flex; gap:4px; }
    #tess-cribs-scrape { background:#22c55e; border:none; color:#fff; font-size:11px; font-weight:600; cursor:pointer; padding:3px 8px; border-radius:4px; }
    #tess-cribs-scrape:hover { background:#16a34a; }
    #tess-cribs-close { background:none; border:none; color:#666; font-size:14px; cursor:pointer; padding:0 2px; }
    #tess-cribs-close:hover { color:#fff; }
    #tess-cribs-body { padding:8px 10px; overflow-y:auto; flex:1; }
    #tess-cribs-body .cr-row { display:flex; padding:2px 0; border-bottom:1px solid #1f1f2a; }
    #tess-cribs-body .cr-label { width:85px; flex-shrink:0; color:#888; font-size:12px; }
    #tess-cribs-body .cr-value { flex:1; color:#e0e0e0; word-break:break-word; font-size:12px; }
    #tess-cribs-body .cr-empty { color:#555; font-style:italic; }
    .tess-cribs-msg { text-align:center; padding:20px; color:#666; font-size:12px; }
    .tess-cribs-tabs { display:flex; gap:0; border-bottom:1px solid #2d2d3f; background:#1a1a24; }
    .tess-cribs-tab { flex:1; padding:6px 8px; text-align:center; font-size:11px; cursor:pointer; color:#888; border:none; background:none; font-family:inherit; transition:all 0.2s; }
    .tess-cribs-tab:hover { color:#e0e0e0; background:rgba(139,92,246,0.1); }
    .tess-cribs-tab.active { color:#c4b5fd; border-bottom:2px solid #8b5cf6; background:rgba(139,92,246,0.05); }
    .tess-cribs-style-list { padding:4px 0; max-height:320px; overflow-y:auto; }
    .tess-cribs-style-item { padding:6px 8px; margin:2px 0; background:rgba(139,92,246,0.08); border-left:2px solid #8b5cf6; border-radius:3px; font-size:11px; line-height:1.4; color:#d0d0e0; word-break:break-word; }
    .tess-cribs-letter-item { border-left-color:#22c55e !important; background:rgba(34,197,94,0.06) !important; }
    .tess-cribs-toggle { display:flex; align-items:center; gap:6px; padding:4px 8px; cursor:pointer; font-size:11px; color:#ccc; }
    .tess-cribs-toggle input[type="checkbox"] { accent-color:#22c55e; width:14px; height:14px; cursor:pointer; }
  `;
  document.head.appendChild(css);

  var toggle = document.createElement('div');
  toggle.id = 'tess-cribs-toggle';
  toggle.textContent = '\u{1F4CB}';
  toggle.title = 'Mostrar Cribs del perfil';
  toggle.addEventListener('click', function () {
    cribsOverlayState.visible = !cribsOverlayState.visible;
    var ov = document.getElementById('tess-cribs-overlay');
    if (cribsOverlayState.visible && ov) { positionOverlayNearToggle(ov, this); }
    if (ov) ov.classList.toggle('visible', cribsOverlayState.visible);
  });
  document.body.appendChild(toggle);

  var overlay = document.createElement('div');
  overlay.id = 'tess-cribs-overlay';
  overlay.innerHTML = '<div id="tess-cribs-header"><span id="tess-cribs-title">📋 CRIBS</span><div id="tess-cribs-actions"><button id="tess-cribs-scrape" title="Extraer datos del perfil">⬇ SCRAPE</button><button id="tess-cribs-close">✕</button></div></div><div class="tess-cribs-tabs"><button class="tess-cribs-tab active" data-tab="datos">📋 Datos</button><button class="tess-cribs-tab" data-tab="estilo">🎭 Estilo</button><button class="tess-cribs-tab" data-tab="cartas">📬 Cartas</button></div><div id="tess-cribs-body"><div class="tess-cribs-msg">Cargando...</div></div>';
  document.body.appendChild(overlay);

  document.getElementById('tess-cribs-close').addEventListener('click', function () { cribsOverlayState.visible = false; overlay.classList.remove('visible'); });
  document.getElementById('tess-cribs-scrape').addEventListener('click', function () { triggerScrapeAndSave(cribsOverlayState.profileId); });
  overlay.querySelectorAll('.tess-cribs-tab').forEach(function (tab) {
    tab.addEventListener('click', function () {
      cribsOverlayTab = this.dataset.tab;
      overlay.querySelectorAll('.tess-cribs-tab').forEach(function (t) { t.classList.remove('active'); });
      this.classList.add('active');
      if (cribsOverlayData) renderCribsOverlay(cribsOverlayData);
    });
  });

  function makeCribsDraggable(el, fromOverlay) {
    var startX, startY, stL, stT, soL, soT;
    el.addEventListener('mousedown', function (e) {
      if (e.target.tagName === 'BUTTON') return;
      e.preventDefault();
      startX = e.clientX; startY = e.clientY;
      stL = parseFloat(toggle.style.left) || toggle.getBoundingClientRect().left;
      stT = parseFloat(toggle.style.top) || toggle.getBoundingClientRect().top;
      soL = parseFloat(overlay.style.left) || overlay.getBoundingClientRect().left;
      soT = parseFloat(overlay.style.top) || overlay.getBoundingClientRect().top;
      // Remove !important constraints on toggle so inline styles take effect
      toggle.style.setProperty('left', stL + 'px', 'important');
      toggle.style.setProperty('top', stT + 'px', 'important');
      toggle.style.setProperty('bottom', 'auto', 'important');
      toggle.style.setProperty('right', 'auto', 'important');
      overlay.style.setProperty('bottom', 'auto', 'important');
      overlay.style.setProperty('right', 'auto', 'important');
      function onMove(ev) {
        var dx = ev.clientX - startX, dy = ev.clientY - startY;
        var newL = stL + dx, newT = stT + dy;
        var vw = window.innerWidth, vh = window.innerHeight;
        if (newL < 0) newL = 10;
        if (newL > vw - 50) newL = vw - 50;
        if (newT < 0) newT = 10;
        if (newT > vh - 50) newT = vh - 50;
        toggle.style.setProperty('left', newL + 'px', 'important');
        toggle.style.setProperty('top', newT + 'px', 'important');
        overlay.style.left = (soL + dx) + 'px';
        overlay.style.top = (soT + dy) + 'px';
      }
      function onUp() { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); }
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
  }
  makeCribsDraggable(toggle, false);
  makeCribsDraggable(document.getElementById('tess-cribs-header'), true);
  } catch (e) { console.warn('[CRIBS-OVERLAY] Error:', e.message); }
}

if (!document.getElementById('tess-cribs-toggle')) {
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    setTimeout(function () { try { createCribsOverlay(); } catch (e) {} }, 2000);
  } else {
    document.addEventListener('DOMContentLoaded', function () {
      setTimeout(function () { try { createCribsOverlay(); } catch (e) {} }, 2000);
    });
  }
}

function renderCribsOverlay(data) {
  ensureCribsElements();
  cribsOverlayData = data;
  var body = document.getElementById('tess-cribs-body');
  if (!body) return;
  if (!data) { body.innerHTML = '<div class="tess-cribs-msg">No hay datos en Cribs para este perfil</div>'; return; }

  if (cribsOverlayTab === 'estilo') {
    var styleText = data.voice_style || '';
    if (!styleText.trim()) {
      body.innerHTML = '<div class="tess-cribs-msg">🎭 No hay estilo capturado aún.<br>Haz click en 🎭 en un mensaje que hayas enviado a este cliente para capturar tu forma de escribir.</div>';
      return;
    }
    var lines = styleText.split('\n').filter(function (l) { return l.trim(); });
    if (lines.length === 0) {
      body.innerHTML = '<div class="tess-cribs-msg">🎭 No hay estilo capturado aún.</div>';
      return;
    }
    var html = '<div class="tess-cribs-style-list">';
    for (var i = lines.length - 1; i >= 0; i--) {
      html += '<div class="tess-cribs-style-item">' + escapeHtml(lines[i]) + '</div>';
    }
    body.innerHTML = html;
    return;
  }

  if (cribsOverlayTab === 'cartas') {
    var letterText = data.letter_style || '';
    if (!letterText.trim()) {
      body.innerHTML = '<div class="tess-cribs-msg">📬 No hay estilo de cartas capturado a\u00fan.<br>Las cartas que env\u00edes a este perfil se capturar\u00e1n autom\u00e1ticamente cuando el m\u00f3dulo Mail CRIBS est\u00e9 activo.</div>';
      return;
    }
    var letterLines = letterText.split('\n').filter(function (l) { return l.trim(); });
    if (letterLines.length === 0) {
      body.innerHTML = '<div class="tess-cribs-msg">📬 No hay estilo de cartas capturado a\u00fan.</div>';
      return;
    }
    var lhtml = '<div class="tess-cribs-style-list">';
    for (var li = letterLines.length - 1; li >= 0; li--) {
      lhtml += '<div class="tess-cribs-style-item tess-cribs-letter-item">' + escapeHtml(letterLines[li]) + '</div>';
    }
    body.innerHTML = lhtml;
    return;
  }

  var fields = [
    { label: 'ID Usuario', key: 'profile_id' },
    { label: 'Nombre', key: 'profile_name' },
    { label: 'Pa\u00eds', key: 'country' },
    { label: 'Edad', key: 'age' },
    { label: 'Intereses', key: 'interests' },
    { label: 'Ciudad', key: 'city' },
    { label: 'Trabajo', key: 'work' },
    { label: 'Estado Civil', key: 'marital_status' },
    { label: 'Rasgos', key: 'traits' },
    { label: 'G\u00e9neros Cine', key: 'movie_genres' },
    { label: 'G\u00e9neros M\u00fasica', key: 'music_genres' },
    { label: 'Objetivo', key: 'goal' },
    { label: 'Idiomas', key: 'languages' },
    { label: 'Educaci\u00f3n', key: 'education' },
    { label: 'Busca', key: 'looking_for' },
    { label: 'Complexi\u00f3n', key: 'body_type' },
    { label: 'Status', key: 'status' },
    { label: '\u00daltimo Contacto', key: 'last_contact' },
    { label: 'Plantilla Preferida', key: 'preferred_template' },
    { label: 'Notas R\u00e1pidas', key: 'quick_notes' },
    { label: 'Prioridad', key: 'priority' }
  ];
  var html = '';
  fields.forEach(function (f) {
    var val = data[f.key];
    if (val === null || val === undefined || val === '') val = null;
    var displayVal = val !== null ? String(val) : '\u2014';
    if (f.key === 'last_contact' && val) {
      try { displayVal = new Date(val).toLocaleDateString(); } catch (e) {}
    }
    if (f.key === 'profile_id' && val) {
      displayVal = '<span style="font-weight:600;color:#c4b5fd;">' + displayVal + '</span>';
    }
    html += '<div class="cr-row"><span class="cr-label">' + f.label + '</span><span class="cr-value' + (val === null ? ' cr-empty' : '') + '">' + displayVal + '</span></div>';
  });
  body.innerHTML = html;
}

var _cribsFetchTimer = null;
var _cribsHideTimer = null;
var _cribsRetryTimer = null;
var _tessJwtCache = '';
var _cribsLocalCache = null;
var _cribsCacheLastFetch = 0;

function cribFindEntry(profileId) {
  if (!_cribsLocalCache) return null;
  var searchId = String(profileId).replace(/^0+/, '');
  for (var i = 0; i < _cribsLocalCache.length; i++) {
    if (String(_cribsLocalCache[i].profile_id).replace(/^0+/, '') === searchId) return _cribsLocalCache[i];
  }
  if (window._cribsChatIds) {
    for (var ci = 0; ci < window._cribsChatIds.length; ci++) {
      var altId = String(window._cribsChatIds[ci]).replace(/^0+/, '');
      if (altId !== searchId) {
        for (var ci2 = 0; ci2 < _cribsLocalCache.length; ci2++) {
          if (String(_cribsLocalCache[ci2].profile_id).replace(/^0+/, '') === altId) {
            return _cribsLocalCache[ci2];
          }
        }
      }
    }
  }
  return null;
}

function cribLoadOrRefresh(fetchIfStale) {
  return new Promise(function (resolve) {
    if (_cribsLocalCache && Date.now() - _cribsCacheLastFetch < 60000 && !fetchIfStale) { resolve(); return; }
    var retried = false;
    function doFetch(token) {
      var headers = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = 'Bearer ' + token;
      var controller = new AbortController();
      var timeoutId = setTimeout(function () { controller.abort(); }, 10000);
      function handleResponse(r) {
        clearTimeout(timeoutId);
        if (r.status === 401 && !retried) {
          retried = true;
          _tessJwtCache = '';
          chrome.storage.local.get(['tess_jwt'], function (data) { _tessJwtCache = data.tess_jwt || ''; doFetch(_tessJwtCache); });
          return;
        }
        r.json().then(function (resp) {
          if (resp && resp.cribs && Array.isArray(resp.cribs)) {
            _cribsLocalCache = resp.cribs;
            _cribsCacheLastFetch = Date.now();
          }
          resolve();
        });
      }
      fetch(TESSERACT_API + '/api/tess/cribs', { headers: headers, signal: controller.signal })
        .then(handleResponse)
        .catch(function (e) { clearTimeout(timeoutId); console.log('[CRIBS] Error fetching cribs:', e && e.message ? e.message : e); resolve(); });
    }
    if (_tessJwtCache) { doFetch(_tessJwtCache); }
    else { chrome.storage.local.get(['tess_jwt'], function (data) { _tessJwtCache = data.tess_jwt || ''; doFetch(_tessJwtCache); }); }
  });
}

function fetchCribsForProfile(profileId) {
  if (!profileId) { console.log('[CRIBS] fetchCribsForProfile: sin profileId'); renderCribsOverlay(null); return; }
  console.log('[CRIBS] â–¶ fetchCribsForProfile:', profileId, '| _lastCribsPid:', window._lastCribsPid);
  if (_cribsFetchTimer) { clearTimeout(_cribsFetchTimer); _cribsFetchTimer = null; }
  if (_cribsHideTimer) { clearTimeout(_cribsHideTimer); _cribsHideTimer = null; }
  if (_cribsRetryTimer) { clearTimeout(_cribsRetryTimer); _cribsRetryTimer = null; }
  window._cribsScrapingPid = null;
  ensureCribsElements();
  var body = document.getElementById('tess-cribs-body');
  var cached = cribFindEntry(profileId);
  if (cached) {
    renderCribsOverlay(cached);
    cribsOverlayState.profileId = profileId;
    if (!cribsOverlayState.visible) {
      cribsOverlayState.visible = true;
      var el = document.getElementById('tess-cribs-overlay');
      var togg = document.getElementById('tess-cribs-toggle');
      if (el) { if (togg) positionOverlayNearToggle(el, togg); el.classList.add('visible'); }
    }
    cribLoadOrRefresh(false);
    return;
  }
  if (body) body.innerHTML = '<div class="tess-cribs-msg">Cargando datos...</div>';
  _cribsFetchTimer = setTimeout(function () {
    _cribsFetchTimer = null;
    cribLoadOrRefresh(true).then(function () {
      body = document.getElementById('tess-cribs-body');
      if (!body) return;
      var entry = cribFindEntry(profileId);
      if (entry) {
        renderCribsOverlay(entry);
        cribsOverlayState.profileId = profileId;
        if (!cribsOverlayState.visible) {
          cribsOverlayState.visible = true;
          var el = document.getElementById('tess-cribs-overlay');
          var togg = document.getElementById('tess-cribs-toggle');
          if (el) { if (togg) positionOverlayNearToggle(el, togg); el.classList.add('visible'); }
        }
      } else {
        renderCribsOverlay(null);
        cribsOverlayState.profileId = null;
        _cribsHideTimer = setTimeout(function () {
          _cribsHideTimer = null;
          if (!cribsOverlayState.profileId && cribsOverlayState.visible) {
            cribsOverlayState.visible = false;
            var el2 = document.getElementById('tess-cribs-overlay');
            if (el2) el2.classList.remove('visible');
          }
        }, 3000);
      }
    });
  }, 0);
}

(function setupBotEventListeners() {
  const typeMap = { 'nox:likeSent': 'Like', 'nox:followSent': 'Follow', 'nox:cartaSent': 'Cartas' };
  Object.entries(typeMap).forEach(([eventName, category]) => {
    window.addEventListener(eventName, (e) => {
      const clientId = (e.detail && (e.detail.clientId || e.detail.id)) || '';
      if (clientId) {
        const registered = registerIdInStarTools(String(clientId), category);
        if (registered) {
          console.log('[STAR-TOOLS] âš¡ Evento real capturado:', eventName, 'â†’ ID:', clientId);
          if (currentTab === 'star') renderStarIds();
        }
      }
    });
  });
  console.log('[STAR-TOOLS] âœ… Listeners de eventos del bot conectados');
})();
