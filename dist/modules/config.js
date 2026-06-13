// TESSERACT - Shared Configuration
// Single source of truth for all configurable values.
// Content scripts use Tesseract.API instead (state-manager.js).
// Page scripts (popup, login, dashboard, admin) and service worker (background.js)
// should reference this file for consistent values.

var TESSERACT_CONFIG = {
  API: 'https://tesseract-jblo.onrender.com',
  APP_NAME: 'TESSERACT',
  APP_VERSION: '24.0',
  ALLOWED_DOMAIN: 'talkytimes.com',
  SYNC_TIMEOUT: 15000,
  API_TIMEOUT: 20000
};

// Backward-compatible aliases
var TESSERACT_API = TESSERACT_CONFIG.API;
