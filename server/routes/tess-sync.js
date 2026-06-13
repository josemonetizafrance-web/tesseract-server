const TessHistory = require('../models/TessHistory');
const TessConfig = require('../models/TessConfig');
const TessActivityLog = require('../models/TessActivityLog');

async function handleHistoryBatch(email, profileIds) {
  if (!profileIds || !Array.isArray(profileIds) || profileIds.length === 0) return;
  await TessHistory.updateOne(
    { email },
    {
      $addToSet: { profileIds: { $each: profileIds } },
      $set: { updatedAt: new Date() }
    },
    { upsert: true }
  );
}

async function handleConfigSync(email, configKey, configData) {
  if (!configKey) return;
  await TessConfig.updateOne(
    { email, configKey },
    {
      $set: { configData: configData || {}, updatedAt: new Date() }
    },
    { upsert: true }
  );
}

async function handleActivityLog(email, entry) {
  if (!entry) return;
  await TessActivityLog.updateOne(
    { email },
    {
      $push: {
        entries: {
          $each: [entry],
          $slice: -5000
        }
      },
      $set: { updatedAt: new Date() }
    },
    { upsert: true }
  );
}

module.exports = function (router, authMiddleware) {
  // Extiende el POST existente
  const originalPostHandler = router.stack.find(
    (layer) => layer.route && layer.route.path === '/api/tess/metrics/sync' && layer.route.methods.post
  );
  if (originalPostHandler) {
    const existingHandler = originalPostHandler.route.stack[originalPostHandler.route.stack.length - 1];
    const existingFn = existingHandler.handle;
    existingHandler.handle = async function (req, res, next) {
      try {
        const { action, historyBatch, configKey, configData, logEntry, historyBatch: batchFromField } = req.body;
        const email = req.user?.email;
        if (email) {
          if (action === 'HISTORY_BATCH' && historyBatch) {
            await handleHistoryBatch(email, historyBatch);
          } else if (action === 'CONFIG_SYNC' && configKey) {
            await handleConfigSync(email, configKey, configData);
          } else if (action === 'ACTIVITY_LOG' && logEntry) {
            await handleActivityLog(email, logEntry);
          } else if (historyBatch && historyBatch.length > 0) {
            await handleHistoryBatch(email, historyBatch);
          }
        }
      } catch (e) {
        console.error('[SYNC-EXT] Error processing sync extensions:', e.message);
      }
      return existingFn(req, res, next);
    };
    return;
  }

  router.post('/api/tess/metrics/sync', authMiddleware, async (req, res) => {
    try {
      const email = req.user?.email;
      if (!email) return res.status(401).json({ error: 'Unauthorized' });

      const { action, historyBatch, configKey, configData, logEntry } = req.body;

      if (action === 'HISTORY_BATCH' && Array.isArray(historyBatch)) {
        await handleHistoryBatch(email, historyBatch);
      } else if (action === 'CONFIG_SYNC' && configKey) {
        await handleConfigSync(email, configKey, configData);
      } else if (action === 'ACTIVITY_LOG' && logEntry) {
        await handleActivityLog(email, logEntry);
      }

      res.json({ ok: true });
    } catch (e) {
      console.error('[SYNC-EXT] POST error:', e.message);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  router.get('/api/tess/metrics/sync', authMiddleware, async (req, res) => {
    try {
      const email = req.user?.email;
      if (!email) return res.status(401).json({ error: 'Unauthorized' });

      const { mode, key } = req.query;

      if (mode === 'history') {
        const doc = await TessHistory.findOne({ email }).lean();
        return res.json({ history: doc ? doc.profileIds : [] });
      }

      if (mode === 'config' && key) {
        const doc = await TessConfig.findOne({ email, configKey: key }).lean();
        return res.json({ config: doc ? doc.configData : null });
      }

      return res.json({ ok: true });
    } catch (e) {
      console.error('[SYNC-EXT] GET error:', e.message);
      res.status(500).json({ error: 'Internal server error' });
    }
  });
};
