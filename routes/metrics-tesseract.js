/**
 * ROUTES/METRICS-TESSERACT - Sincronización de métricas del bot (MongoDB)
 */
const { Router } = require('express');
const { upsertDailyMetric, upsertMonthlyMetric, insertCollectedId, logActivity, getMyMetrics } = require('../db/tesseract.js');
const { validateToken } = require('../middleware/auth-tesseract.js');

const router = Router();
router.use('/api/tess/metrics', validateToken);

router.post('/api/tess/metrics/sync', async (req, res) => {
  const { stats, collectedIds, action, count } = req.body;
  const now = Date.now();
  const date = new Date().toISOString().slice(0, 10);
  const month = new Date().toISOString().slice(0, 7);

  await upsertDailyMetric(req.user.id, date, stats || {}, now);
  await upsertMonthlyMetric(req.user.id, month, stats || {}, now);

  if (collectedIds) {
    ['Like', 'Follow', 'Saludo', 'Cartas'].forEach(cat => {
      if (Array.isArray(collectedIds[cat])) collectedIds[cat].forEach(async (id) => {
        await insertCollectedId(req.user.id, id, cat, now);
      });
    });
  }

  if (action) await logActivity(req.user.id, req.user.email, action, count ? `${count} procesados` : null, `oficina: ${req.user.office || 'sin oficina'}`);

  res.json({ success: true });
});

router.get('/api/tess/metrics/my', async (req, res) => {
  const metrics = await getMyMetrics(req.user.id);
  res.json(metrics);
});

module.exports = router;