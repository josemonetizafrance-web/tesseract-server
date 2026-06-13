/**
 * ROUTES/METRICS-TESSERACT - Sincronización de métricas del bot (MongoDB)
 */
const { Router } = require('express');
const { upsertDailyMetric, upsertMonthlyMetric, insertCollectedId, logActivity, getMyMetrics, updateHistoryBatch, updateConfigSync, appendActivityLog, getHistory, getConfig } = require('../db/tesseract.js');
const { validateToken } = require('../middleware/auth-tesseract.js');

const router = Router();
router.use('/api/tess/metrics', validateToken);

router.post('/api/tess/metrics/sync', async (req, res) => {
  const { stats, collectedIds, action, count, office, historyBatch, configKey, configData, logEntry } = req.body;
  const now = Date.now();
  const date = new Date().toISOString().slice(0, 10);
  const month = new Date().toISOString().slice(0, 7);
  
  // Usar oficina del body o del usuario
  const userOffice = office || req.user.office || null;

  // Procesar sync extensions (history, config, activity log)
  const email = req.user.email;
  if (email) {
    if (action === 'HISTORY_BATCH' && Array.isArray(historyBatch)) {
      await updateHistoryBatch(email, historyBatch);
    } else if (action === 'CONFIG_SYNC' && configKey) {
      await updateConfigSync(email, configKey, configData);
    } else if (action === 'ACTIVITY_LOG' && logEntry) {
      await appendActivityLog(email, logEntry);
    } else if (Array.isArray(historyBatch) && historyBatch.length > 0) {
      await updateHistoryBatch(email, historyBatch);
    }
  }

  // Guardar métricas diarias incluyendo oficina
  await upsertDailyMetric(req.user._id.toString(), date, stats || {}, now, userOffice);
  await upsertMonthlyMetric(req.user._id.toString(), month, stats || {}, now);

  if (collectedIds) {
    for (const cat of ['Like', 'Follow', 'Cartas']) {
      if (Array.isArray(collectedIds[cat])) {
        for (const id of collectedIds[cat]) {
          await insertCollectedId(req.user._id.toString(), id, cat, now);
        }
      }
    }
  }

  if (action) await logActivity(req.user._id.toString(), req.user.email, action, count ? `${count} procesados` : null, `oficina: ${req.user.office || 'sin oficina'}`);

  res.json({ success: true });
});

router.get('/api/tess/metrics/sync', async (req, res) => {
  const { mode, key } = req.query;
  const email = req.user.email;

  if (mode === 'history') {
    const history = await getHistory(email);
    return res.json({ history });
  }

  if (mode === 'config' && key) {
    const config = await getConfig(email, key);
    return res.json({ config });
  }

  res.json({ ok: true });
});

router.get('/api/tess/metrics/my', async (req, res) => {
  const metrics = await getMyMetrics(req.user._id.toString());
  res.json(metrics);
});

module.exports = router;