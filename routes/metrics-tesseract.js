/**
 * ROUTES/METRICS-TESSERACT - Sincronización de métricas del bot
 */
const { Router } = require('express');
const { upsertDailyMetric, upsertMonthlyMetric, insertCollectedId, logActivity, getMyMetrics } = require('../db/tesseract.js');
const { validateToken } = require('../middleware/auth-tesseract.js');

const router = Router();
router.use('/api/tess/metrics', validateToken);

router.post('/api/tess/metrics/sync', (req, res) => {
  const { stats, collectedIds, action, count } = req.body;
  const now = Date.now();
  const date = new Date().toISOString().slice(0, 10);
  const month = new Date().toISOString().slice(0, 7);

  upsertDailyMetric(req.user.id, date, stats || {}, now);
  upsertMonthlyMetric(req.user.id, month, stats || {}, now);

  if (collectedIds) {
    ['Like', 'Follow', 'Saludo', 'Cartas'].forEach(cat => {
      if (Array.isArray(collectedIds[cat])) collectedIds[cat].forEach(id => insertCollectedId(req.user.id, id, cat, now));
    });
  }

  if (action) logActivity(req.user.id, req.user.email, action, count ? `${count} procesados` : null);

  res.json({ success: true });
});

router.get('/api/tess/metrics/my', (req, res) => {
  res.json(getMyMetrics(req.user.id));
});

module.exports = router;
