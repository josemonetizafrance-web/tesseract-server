const { Router } = require('express');
const { validateToken } = require('../middleware/auth-tesseract.js');
const {
  getCribs, addCribEntry, updateCribField, deleteCribEntry, findCribByProfileId, bulkUpdateCrib
} = require('../db/tesseract.js');

const router = Router();

router.get('/api/tess/cribs', validateToken, async (req, res) => {
  try {
    const userId = req.user._id.toString();
    const cribs = await getCribs(userId);
    return res.json({ cribs });
  } catch (err) {
    console.error('[CRIBS GET ERROR]', err);
    return res.status(500).json({ error: 'Error al obtener cribs' });
  }
});

router.post('/api/tess/cribs', validateToken, async (req, res) => {
  try {
    const { profile_id } = req.body;
    if (!profile_id) return res.status(400).json({ error: 'profile_id requerido' });

    const userId = req.user._id.toString();
    const existing = await findCribByProfileId(userId, profile_id);
    if (existing) return res.status(409).json({ error: 'Este ID ya existe en tus CRIBS' });

    const entryId = await addCribEntry(userId, profile_id);
    const entry = await getCribs(userId);
    return res.json({ success: true, entry_id: String(entryId), cribs: entry });
  } catch (err) {
    console.error('[CRIBS CREATE ERROR]', err);
    return res.status(500).json({ error: 'Error al agregar a CRIBS' });
  }
});

router.put('/api/tess/cribs/:id', validateToken, async (req, res) => {
  try {
    const userId = req.user._id.toString();
    const { field, value } = req.body;
    if (!field) return res.status(400).json({ error: 'field requerido' });

    const updated = await updateCribField(req.params.id, userId, field, value);
    if (!updated) return res.status(404).json({ error: 'Entrada no encontrada' });
    return res.json({ success: true });
  } catch (err) {
    console.error('[CRIBS UPDATE ERROR]', err);
    return res.status(500).json({ error: 'Error al actualizar' });
  }
});

router.put('/api/tess/cribs/:id/bulk', validateToken, async (req, res) => {
  try {
    const userId = req.user._id.toString();
    const data = req.body;
    if (!data || typeof data !== 'object' || Object.keys(data).length === 0) {
      return res.status(400).json({ error: 'Se requieren campos a actualizar' });
    }
    const updated = await bulkUpdateCrib(req.params.id, userId, data);
    if (updated === null) return res.status(404).json({ error: 'Entrada no encontrada o sin campos válidos' });
    return res.json({ success: true, updated: updated });
  } catch (err) {
    console.error('[CRIBS BULK UPDATE ERROR]', err);
    return res.status(500).json({ error: 'Error al actualizar' });
  }
});

router.delete('/api/tess/cribs/:id', validateToken, async (req, res) => {
  try {
    const userId = req.user._id.toString();
    const deleted = await deleteCribEntry(req.params.id, userId);
    if (!deleted) return res.status(404).json({ error: 'Entrada no encontrada' });
    return res.json({ success: true });
  } catch (err) {
    console.error('[CRIBS DELETE ERROR]', err);
    return res.status(500).json({ error: 'Error al eliminar' });
  }
});

module.exports = router;
