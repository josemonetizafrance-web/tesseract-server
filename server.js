/**
 * SERVER.JS - TESSERACT Backend Integrado
 * 
 * Variables de entorno (.env):
 *   PORT, TESS_JWT_SECRET, TESS_ADMIN_EMAIL, TESS_ADMIN_PASSWORD
 *   TESS_DEMO_HOURS, TESS_PREMIUM_DAYS
 */
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

// Validar JWT_SECRET
if (!process.env.TESS_JWT_SECRET || process.env.TESS_JWT_SECRET === 'cambia_esto_por_una_clave_generada_con_npm_run_keygen') {
  console.error('❌ Configura TESS_JWT_SECRET en .env');
  console.error('   Ejecuta: npm run keygen');
  console.error('   Y pega el resultado en .env como TESS_JWT_SECRET=el_valor');
  process.exit(1);
}

// Middleware
const { securityHeaders, requestLogger, rateLimitMiddleware, globalErrorHandler } = require('./middleware/index.js');
const { validateToken, requireTesseractAdmin, requireMasterAdmin, checkSubscription } = require('./middleware/auth-tesseract.js');

// Rutas TESSERACT
const authRoutes = require('./routes/auth-tesseract.js');
const adminRoutes = require('./routes/admin-tesseract.js');
const metricsRoutes = require('./routes/metrics-tesseract.js');

// Inicializar DB
const { initDb } = require('./db/tesseract.js');

const app = express();
const PORT = process.env.PORT || 3000;

// --- Middleware global ---
app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    const allowed = [
      /^chrome-extension:\/\//,
      /^moz-extension:\/\//,
      /^edge-extension:\/\//,
      /^http:\/\/localhost:/,
      /^https:\/\/(.*\.)?talkytimes\.com$/,
      /^https:\/\/(.*\.)?amolatina\.com$/,
      /^https:\/\/(.*\.)?dating\.com$/,
      /^https:\/\/(.*\.)?yourtravelmates\.com$/,
      /^https:\/\/(.*\.)?arabiandate\.com$/,
      /^https:\/\/(.*\.)?luxee\.io$/
    ];
    if (allowed.some(r => r.test(origin))) return callback(null, true);
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true
}));
app.use(express.json({ limit: '5mb' }));
app.use(securityHeaders);
app.use(requestLogger);
app.use(rateLimitMiddleware);

// --- Rutas ---
app.use(authRoutes);
app.use(adminRoutes);
app.use(metricsRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', version: '2.0.0', timestamp: Date.now() });
});

app.get('/', (req, res) => {
  res.json({
    message: 'TESSERACT Server',
    version: '2.0.0',
    endpoints: [
      'POST /api/tess/auth/login',
      'GET  /api/tess/auth/verify',
      'GET  /api/tess/auth/users',
      'POST /api/tess/admin/premium',
      'POST /api/tess/admin/ban',
      'POST /api/tess/admin/unban',
      'POST /api/tess/admin/developer',
      'POST /api/tess/admin/set-password',
      'POST /api/tess/admin/set-plan',
      'GET  /api/tess/admin/activity-log',
      'GET  /api/tess/admin/metrics',
      'POST /api/tess/metrics/sync',
      'GET  /api/tess/metrics/my',
      'GET  /api/health'
    ]
  });
});

// --- Error handler ---
app.use(globalErrorHandler);

// --- Iniciar ---
(async () => {
  await initDb();
  app.listen(PORT, () => {
    console.log(`🚀 TESSERACT Server corriendo en http://localhost:${PORT}`);
    console.log(`🔐 Admin: ${process.env.TESS_ADMIN_EMAIL || 'adminchevy@tesseract.com'}`);
  });
})();
