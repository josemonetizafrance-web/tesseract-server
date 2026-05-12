/**
 * MIDDLEWARE/INDEX - Seguridad, logging, rate limiting y error handler
 */
const rateLimitEnabled = process.env.RATE_LIMIT_ENABLED === '1';
const rateLimitWindowMs = 60 * 1000;
const rateLimitMax = 200;
const rateLimitStore = new Map();

// Headers de seguridad
function securityHeaders(req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  next();
}

// Logging
function requestLogger(req, res, next) {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl} ${res.statusCode} ${duration}ms`);
  });
  next();
}

// Rate limiting
function rateLimitMiddleware(req, res, next) {
  if (!rateLimitEnabled) return next();
  const ip = req.ip || req.connection?.remoteAddress || 'unknown';
  const now = Date.now();
  let entry = rateLimitStore.get(ip);
  if (!entry) { entry = { count: 0, resetAt: now + rateLimitWindowMs }; rateLimitStore.set(ip, entry); }
  if (now > entry.resetAt) { entry.count = 0; entry.resetAt = now + rateLimitWindowMs; }
  entry.count++;
  if (entry.count > rateLimitMax) {
    return res.status(429).json({ error: 'Demasiadas solicitudes. Intenta en 1 minuto.' });
  }
  next();
}

// Error handler global
function globalErrorHandler(err, req, res, next) {
  if (err.message === 'Not allowed by CORS') {
    return res.status(403).json({ error: 'CORS policy violation' });
  }
  console.error('Error:', err);
  res.status(500).json({
    error: 'Error interno del servidor',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
}

module.exports = { securityHeaders, requestLogger, rateLimitMiddleware, globalErrorHandler };
