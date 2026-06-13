// TESSERACT - Centralized DOM Selectors
// All talkytimes.com selectors in one place.
// Tiered: PRIMARY (exact data-test-id) -> secondary (specific class) -> fallback (wildcard)
// Import this file FIRST in content_scripts (after state-manager.js & error-handler.js)

var TALK_Y = {
  // ─── LINKS & ANCHORS ───
  ALL_LINKS: 'a[href]',
  LINKS_WITH_PROFILE: 'a[href*="/profile/"], a[href*="/user/"], a[href*="/member/"]',
  PROFILE_LINK: 'a[href*="/profile/"], a[href*="/user/"]',

  // ─── DATA ATTRIBUTES ───
  DATA_ANY_ID: '[data-id], [data-user-id], [data-contact-id], [data-member-id], [data-profile-id]',
  DATA_UID: '[data-test-uid]',

  // ─── CHAT INPUT ───
  CHAT_TEXTAREA_SP: 'textarea#form-textarea[data-test-id="cmp:ui-textarea message type-your-message"]',
  CHAT_TEXTAREA: 'textarea[data-test-id*="type-your-message"], textarea[class*="chat"], textarea[class*="message"], textarea[placeholder*="message"], textarea[placeholder*="escribe"]',
  CHAT_INPUT_ID: '#chatInput, #messageInput, #msgInput',

  // ─── SEND BUTTONS ───
  SEND_BTN_SP: 'button.send-button[data-test-id="cmp:ui-button click:send-message send"]',
  SEND_BTN_CLASS: 'button[data-test-id*="send"], button[class*="send"], [class*="send-btn"], [class*="btn-send"]',
  SEND_BTN_ARIA: 'button[aria-label*="send"], button[aria-label*="enviar"]',
  SEND_BTN_ID: '#sendButton, #btnSend, #chatSend',
  SEND_BTN_ALT_FALLBACK: '[class*="send"]:not(button), [class*="submit"]:not(button)',
  ALL_BUTTONS: 'button, [role="button"]',

  // ─── EMAIL / LETTER ───
  EMAIL_TEXTAREA: 'textarea[data-test-id*="letter"], textarea[data-test-id*="email"], textarea[class*="carta"], textarea[class*="letter"], textarea[class*="email"], textarea[class*="mail"]',
  EMAIL_SEND_BTN_DATA_TEST: '[data-test-id*="send-mail"]',
  EMAIL_SEND_BTN: 'button[data-test-id*="send-letter"], button[data-test-id*="send-mail"], button[class*="send-letter"], button[class*="send-email"], button[aria-label*="send letter"], button[aria-label*="enviar carta"]',
  EMAIL_SEND_BTN_CLASS: 'button.send-button',
  EMAIL_SEND_BTN_ID: '#sendLetterBtn, #sendEmailBtn',

  // ─── CONVERSATION / DIALOG ───
  DIALOG_ITEM_CONTENT: '[data-test-id*="dialog-item"], [class*="dialog-item-content"]',
  DIALOG_ITEMS: '[data-test-id*="dialog-item"], [class*="dialog-item-content"], [class*="dialog-item"], [class*="conversation-item"]',
  DIALOG_ITEM_NAME: '[data-test-id*="dialog-name"], .dialog-item__name, [class*="dialog-item__name"]',
  DIALOG_NAME_WRAPPER: '[class*="name-wrapper"], [class*="name-row"]',
  TIMER_ELEMENT: '.tess-resp-timer',

  // ─── CONTACT LISTS ───
  CONTACT_LIST_PRIMARY: '[data-test-id*="contact-list"], [class*="contact-list"], [class*="chat-list"], [class*="dialog"], [class*="messages"]',
  CONTACT_LIST_INBOX: '[data-test-id*="inbox"], [class*="inbox"], [class*="mail-list"], [class*="letter-list"]',
  CONTACT_ITEMS: '[data-test-id*="contact-item"], [class*="contact"], [class*="user"], [class*="item"], [class*="dialog-item"], li',
  CONTACT_ITEMS_SHORT: '[class*="contact"], [class*="user"], [class*="dialog-item"], li',

  // ─── SECTIONS ───
  SECTION_MAIL_BOX_ITEM: '[data-test-id*="mail-box-item"], [class*="mail-box-item"], [class*="mail-item"]',
  SECTION_INBOX: '[data-test-id*="inbox"], [class*="inbox"], [class*="mail-box"], [class*="letter-wrap"]',

  // ─── PAGE CHAT ───
  PAGE_MESSAGES: '[data-test-id*="chat"], [data-test-id*="message"], [class*="chat"], [class*="message"], [class*="dialog"], [class*="msg-area"]',
  PAGE_CHAT_BODY: '[data-test-id*="message-list"], [data-test-id*="chat-body"], [class*="messages"], [class*="chat-body"], [class*="conversation-content"], [class*="msg-container"]',

  // ─── PAGE TYPE ───
  PAGE_SEARCH: '[data-test-id*="search-result"], [class*="search-result"], [class*="profile-card"]',
  PAGE_CONTACT_LIST: '[data-test-id*="contact-list"], [class*="contact-list"], [class*="chat-list"]',
  PAGE_MAIL_LIST: '[data-test-id*="mail-list"], [class*="mail-list"], [class*="inbox-list"]',
  PAGE_CHAT: '[data-test-id*="chat"]',
  PAGE_TITLE: 'title',

  // ─── NOTIFICATIONS ───
  NOTIFICATION_CONTAINER: '[data-test-id*="notification"], [class*="notification"], [class*="toast"]',
  MESSAGE_AREAS: '[data-test-id*="message"], [data-test-id*="inbox"], [class*="message"], [class*="conversation"], [class*="inbox"]',

  // ─── PROFILE ───
  PROFILE_DETAIL: '[data-test-id*="profile-detail"], [class*="profile-detail"], [class*="user-profile"]',
  PROFILE_BIO: '[data-test-id*="about-me"], [class*="bio"], [class*="about"]',
  PROFILE_NAME: '[data-test-id*="profile-name"], [class*="name"]',
  PROFILE_LOCATION: '[data-test-id*="location"], [class*="location"], [class*="city"]',

  // ─── PROFILE DATA-TEST-ID SELECTORS (PRIMARY) ───
  PT_NAME: '[data-test-id="file:user-profile-title-name"]',
  PT_COUNTRY: '[data-test-id="about country"]',
  PT_BIRTHDAY: '[data-test-id="about birthday"]',
  PT_MARITAL: '[data-test-id="about maritalStatus"]',
  PT_HOBBIES: '[data-test-id="op-about__block-hobbies"]',
  PT_LOOKING_FOR: '[data-test-id="op-about__block-looking-for"]',
  PT_ABOUT_ME: '[data-test-id="op-about__block-about-me"]',
  PT_CITY: '[data-test-id="about city"], [data-test-id="about location"]',
  PT_WORK: '[data-test-id="about work"], [data-test-id="about occupation"]',
  PT_EDUCATION: '[data-test-id="about education"]',
  PT_LANGUAGES: '[data-test-id="about languages"]',
  PT_BODY_TYPE: '[data-test-id="about bodyType"], [data-test-id="about body-type"]',
  PT_SMOKING: '[data-test-id="about smoking"]',
  PT_DRINKING: '[data-test-id="about drinking"]',
  PT_CHILDREN: '[data-test-id="about children"]',
  PT_RELIGION: '[data-test-id="about religion"]',
  PT_ETHNICITY: '[data-test-id="about ethnicity"]',
  PT_HEIGHT: '[data-test-id="about height"]',
  PT_MOVIE_GENRES: '[data-test-id="op-about__block-movieGenres"], [data-test-id="op-about__block-movie-genres"]',
  PT_MUSIC_GENRES: '[data-test-id="op-about__block-musicGenres"], [data-test-id="op-about__block-music-genres"]',
  PT_GOAL: '[data-test-id="op-about__block-goal"]',

  // ─── NAME DETECTION ───
  FALLBACK_NAME: '[data-test-id*="user-name"], [class*="username"], [class*="display-name"], h1, h2',
  META_TITLE: 'meta[property="og:title"], meta[name="twitter:title"]',

  // ─── PHOTO / GALLERY ───
  PHOTO_VIEWER: '[data-test-id*="photo-view"], .photo-viewer, [role="dialog"], [class*="gallery"]',
  PHOTO_IMAGE: '[data-test-id="file:media click:photo-view"], [data-test-id*="photo-view"], [class*="profile"] img[src*="photo"]',
  LIKE_BTN: 'button[data-test-id*="on-like"], button.gallery-footer__like_narrow, button[data-test-id*="set-like"], button:has(svg[id="ThumbUp"])',
  NEXT_PHOTO_BTN: 'button[data-test-id*="next"], button[aria-label*="Next"]',
  CLOSE_BTN: 'button[aria-label="Close"], [aria-label*="close"]',
  LIKE_FOLLOW_BTN: 'button[data-test-id*="on-like"], button[data-test-id*="like-profile"], button[data-test-id*="on-follow"]',
  FOLLOW_BTN: 'button[data-test-id*="on-follow"], button[aria-label*="follow"]',
  PERSON_CARD: '[data-test-id*="person-card"], .person-card, .search-profile-card, [data-test-id*="search-item"]',
  CARD_HEART: 'button[data-test-id*="like-profile"]',

  // ─── PAGINATION ───
  NEXT_PAGE_BTN_NEXT: 'button[data-test-id*="change-page-options-current-page"][data-test-id*="next"]',
  NEXT_PAGE_BTNS: 'button[data-test-id*="change-page"]',
  PAGE_BUTTONS: 'button.page-button:not([disabled])',

  // ─── PINNED / SAVED DETECTION ───
  PINNED_INDICATORS: 'button[data-test-id*="pin"], [class*="pin"], [class*="saved"], [data-pin], [data-saved]',

  // ─── MAIL HISTORY ───
  MAIL_HISTORY_CONTAINER: '[data-test-id*="mail-history"], [class*="mail-history"], [class*="thread-view"]',
  MAIL_HEADER: '[class*="mail-header"]',
  MAIL_HEADER_NAME: '[class*="name"]',
  MAIL_HEADER_NAME_FALLBACK: '[class*="name"]:not([class*="avatar"])',
  MAIL_OPERATOR_NAME: 'Me',
  MAIL_BOX_ITEM: '[data-test-id="mail-box-item-root"], [class*="mail-box-item"]',
  MAIL_BOX_OPEN_THREAD: '[data-test-id="file:mail-box-item click:open-thread"]',

  // ─── TIME ───
  TIME_ELEMENT: '[data-test-id*="time"], [class*="time"], [class*="date"], time',

  // ─── SYSTEM MESSAGE ───
  SYSTEM_MSG: '[data-test-id*="system-msg"]',
  SYSTEM_MSG_TEXT: 'We believe people come here',

  // ─── LANGUAGE SELECT ───
  LANGUAGE_SELECT: 'select[data-test-id*="lang"], select[class*="lang"], select[name*="lang"]',

  // ─── DIALOG LIST (Messages Page) ───
  DIALOG_LIST: 'div.dialogs__scroll-infinite-list',
  DIALOG_LISTITEM: '[role="listitem"]',
  DIALOG_AVATAR: '.ui-avatar',
  DIALOG_GO_TO_CHAT: '[data-test-id="file:source-list-item click:go-to-chat"]',
  DIALOG_ONLINE_TOGGLE: '.online .switch input[type="checkbox"]',
  DIALOG_TAB_BY_ID: function (id) { return '.in-page-tab-wrapper[id="' + id + '"]'; },

  // ─── ICEBREAKERS ───
  ICEBREAKER_SIDEBAR_LINK: 'a[data-test-id="file:statistics item-navigation-to Icebreakers"]',
  ICEBREAKER_CREATE_NEW: 'label.chip-root[data-test-id*="create-icebreaker"]',
  ICEBREAKER_TEXTAREA: 'textarea[placeholder="Type your message here"][maxlength="300"]',
  ICEBREAKER_TEXTAREA_MAIL: 'textarea[placeholder="Type your message here"][maxlength="1000"]',
  ICEBREAKER_MOOD: function (mood) { return '.mood-chip[data-mood="' + mood + '"]'; },
  ICEBREAKER_RADIO_MAIL: 'input[data-test-id="cmp:ui-radio item change:form-fields-type-on-change mail"]',
  ICEBREAKER_SEND_MODERATION: 'button[data-test-id*="send-to-moderation"], button[data-test-id*="send-moderation"]',

  // ─── RESOLVE HELPER: tries each selector in order ───
  // Usage: TALK_Y.resolve('PAGE_MESSAGES', [TALK_Y.PAGE_MESSAGES, '.fallback-class'])
  resolve: function (name, fallbacks) {
    var el = document.querySelector(this[name]);
    if (el) return el;
    if (fallbacks) {
      for (var i = 0; i < fallbacks.length; i++) {
        el = document.querySelector(fallbacks[i]);
        if (el) return el;
      }
    }
    return null;
  }
};
