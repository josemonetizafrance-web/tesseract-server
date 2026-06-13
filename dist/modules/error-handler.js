// ───────────────────────────────────────────────
// TESSERACT - Unified Error Handler Module
// ───────────────────────────────────────────────
// Provides:
//   sleep(ms)       - Promise-based delay
//   retry(fn, opt)  - Async retry with exponential backoff
//   logError(ctx,e) - Structured error logging
//   showToast(msg,type,duration) - DOM toast notification
// ───────────────────────────────────────────────

(function () {
  var ERROR_PREFIX = '[TESSERACT]';

  // ─── sleep ───
  window.sleep = window.sleep || function sleep(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  };

  // ─── retry ───
  // fn:        async function to retry
  // options:   { maxRetries, baseDelay, maxDelay, onRetry }
  // Returns:   Promise resolving to fn() result
  // Does NOT retry on 4xx responses (client errors)
  window.retry = window.retry || function retry(fn, options) {
    options = options || {};
    var maxRetries = options.maxRetries || 3;
    var baseDelay = options.baseDelay || 1000;
    var maxDelay = options.maxDelay || 10000;
    var onRetry = options.onRetry || null;
    var attempt = 0;

    function backoff() {
      var delay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);
      var jitter = delay * (0.5 + Math.random() * 0.5);
      return jitter;
    }

    function isClientError(err) {
      if (err && err.status && err.status >= 400 && err.status < 500) return true;
      if (err && err.response && err.response.status >= 400 && err.response.status < 500) return true;
      return false;
    }

    return new Promise(function (resolve, reject) {
      function attemptFn() {
        Promise.resolve().then(function () {
          return fn(attempt + 1);
        }).then(function (result) {
          resolve(result);
        }).catch(function (err) {
          if (isClientError(err)) {
            logError('retry', 'Client error (4xx), not retrying: ' + (err.message || err));
            reject(err);
            return;
          }
          attempt++;
          if (attempt >= maxRetries) {
            logError('retry', 'All ' + maxRetries + ' attempts failed: ' + (err && err.message || err));
            reject(err);
            return;
          }
          var delay = backoff();
          if (onRetry) {
            try { onRetry(attempt, delay, err); } catch (e) {}
          }
          setTimeout(attemptFn, delay);
        });
      }
      attemptFn();
    });
  };

  // ─── logError ───
  // context:  string identifying the source (e.g. 'ml-send', 'auth-login')
  // error:    Error object or string
  // level:    'error' | 'warn' | 'info' (default: 'error')
  window.logError = window.logError || function logError(context, error, level) {
    level = level || 'error';
    var ts = new Date().toISOString();
    var msg = (error && error.message) ? error.message : (error || 'unknown error');
    var prefix = ERROR_PREFIX + ' [' + context + ']';

    switch (level) {
      case 'warn':
        console.warn(prefix, msg, error || '');
        break;
      case 'info':
        console.log(prefix, msg, error || '');
        break;
      default:
        console.error(prefix, msg, error || '');
    }
  };

  // ─── showToast ───
  // message:   string to display
  // type:      'success' | 'error' | 'warn' | 'info' (default: 'info')
  // duration:  ms before auto-dismiss (0 = persistent, default: 3000)
  window.showToast = window.showToast || function showToast(message, type, duration) {
    type = type || 'info';
    duration = (duration !== undefined) ? duration : 3000;

    var toast = document.createElement('div');
    toast.setAttribute('data-tess-toast', '');
    toast.textContent = message;

    var colors = {
      success: '#10b981',
      error: '#ef4444',
      warn: '#f59e0b',
      info: '#8b5cf6'
    };

    toast.style.cssText = [
      'position: fixed',
      'top: 20px',
      'right: 20px',
      'z-index: 2147483647',
      'padding: 12px 20px',
      'border-radius: 8px',
      'background: ' + (colors[type] || colors.info),
      'color: #fff',
      'font: 14px/1.4 sans-serif',
      'font-weight: 600',
      'box-shadow: 0 4px 20px rgba(0,0,0,0.3)',
      'opacity: 0',
      'transform: translateY(-10px)',
      'transition: opacity 0.3s, transform 0.3s',
      'pointer-events: none',
      'max-width: 400px',
      'word-wrap: break-word'
    ].join(';') + ';';

    document.body.appendChild(toast);

    requestAnimationFrame(function () {
      toast.style.opacity = '1';
      toast.style.transform = 'translateY(0)';
    });

    if (duration > 0) {
      setTimeout(function () {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(-10px)';
        setTimeout(function () { toast.remove(); }, 300);
      }, duration);
    }

    return toast;
  };
})();
