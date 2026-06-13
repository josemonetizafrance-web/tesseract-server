/**
 * ROUTES/BLACKLIST-TESSERACT - Gestión de lista negra de contactos
 */
const { Router } = require('express');
const { validateToken } = require('../middleware/auth-tesseract.js');
const { getBlacklist, addToBlacklist, removeFromBlacklist, isInBlacklist, syncBlacklist, findUserByEmail, logActivity } = require('../db/tesseract.js');

const router = Router();

// GET /api/tess/blacklist - Obtener lista negra del usuario
router.get('/api/tess/blacklist', validateToken, async (req, res) => {
  try {
    const userId = req.user._id.toString();
    const blacklist = await getBlacklist(userId);
    return res.json({ blacklist });
  } catch (err) {
    console.error('[BLACKLIST GET ERROR]', err);
    return res.status(500).json({ error: 'Error al obtener blacklist', detail: err.message });
  }
});

// POST /api/tess/blacklist - Sincronizar lista negra completa (reemplaza todo el array)
router.post('/api/tess/blacklist', validateToken, async (req, res) => {
  try {
    console.log('[BLACKLIST POST] body type:', typeof req.body, 'raw:', JSON.stringify(req.body).substring(0, 200));
    const { blacklist } = req.body || {};
    if (!Array.isArray(blacklist)) {
      return res.status(400).json({ error: 'blacklist debe ser un array, recibido:', type: typeof req.body, body: req.body ? Object.keys(req.body) : null });
    }
    
    const userId = req.user._id.toString();
    console.log('[BLACKLIST POST] saving for user:', userId, 'count:', blacklist.length);
    const syncResult = await syncBlacklist(userId, blacklist);
    console.log('[BLACKLIST POST] sync result:', syncResult);
    
    const updated = await getBlacklist(userId);
    console.log('[BLACKLIST POST] get result:', updated.length);
    return res.json({ success: true, count: updated.length, blacklist: updated, message: 'Blacklist sincronizada' });
  } catch (err) {
    console.error('[BLACKLIST SYNC ERROR]', err);
    return res.status(500).json({ error: 'Error al sincronizar blacklist', detail: err.message, stack: err.stack });
  }
});

// POST /api/tess/blacklist/add - Agregar contacto a lista negra
router.post('/api/tess/blacklist/add', validateToken, async (req, res) => {
  try {
    const { contactId } = req.body;
    if (!contactId) {
      return res.status(400).json({ error: 'contactId requerido' });
    }
    
    const userId = req.user._id.toString();
    await addToBlacklist(userId, String(contactId).trim());
    await logActivity(userId, req.user.email, 'BLACKLIST', `añadió ${contactId}`);
    
    return res.json({ success: true, message: 'Contacto agregado a blacklist' });
  } catch (err) {
    console.error('[BLACKLIST ADD ERROR]', err);
    return res.status(500).json({ error: 'Error al agregar a blacklist' });
  }
});

router.post('/api/tess/blacklist/remove', validateToken, async (req, res) => {
  try {
    const { contactId } = req.body;
    if (!contactId) {
      return res.status(400).json({ error: 'contactId requerido' });
    }
    
    const userId = req.user._id.toString();
    await removeFromBlacklist(userId, contactId);
    await logActivity(userId, req.user.email, 'BLACKLIST', `eliminó ${contactId}`);
    
    return res.json({ success: true, message: 'Contacto eliminado de blacklist' });
  } catch (err) {
    console.error('[BLACKLIST REMOVE ERROR]', err);
    return res.status(500).json({ error: 'Error al eliminar de blacklist' });
  }
});

// POST /api/tess/blacklist/remove - Eliminar contacto de lista negra
router.post('/api/tess/blacklist/remove', validateToken, async (req, res) => {
  try {
    const { contactId } = req.body;
    if (!contactId) {
      return res.status(400).json({ error: 'contactId requerido' });
    }
    
    const userId = req.user._id.toString();
    await removeFromBlacklist(userId, contactId);
    
    return res.json({ success: true, message: 'Contacto eliminado de blacklist' });
  } catch (err) {
    console.error('[BLACKLIST REMOVE ERROR]', err);
    return res.status(500).json({ error: 'Error al eliminar de blacklist' });
  }
});

// POST /api/tess/blacklist/check - Verificar si un contacto está en blacklist
router.post('/api/tess/blacklist/check', validateToken, async (req, res) => {
  try {
    const { contactId } = req.body;
    if (!contactId) {
      return res.status(400).json({ error: 'contactId requerido' });
    }
    
    const userId = req.user._id.toString();
    const inBlacklist = await isInBlacklist(userId, contactId);
    
    return res.json({ inBlacklist });
  } catch (err) {
    console.error('[BLACKLIST CHECK ERROR]', err);
    return res.status(500).json({ error: 'Error al verificar blacklist' });
  }
});

// GET /api/tess/blacklist/check/:contactId - Verificar si está en blacklist (para Auto Answer)
router.get('/api/tess/blacklist/check/:contactId', validateToken, async (req, res) => {
  try {
    const { contactId } = req.params;
    const userId = req.user._id.toString();
    const inBlacklist = await isInBlacklist(userId, contactId);
    return res.json({ inBlacklist });
  } catch (err) {
    console.error('[BLACKLIST CHECK ERROR]', err);
    return res.status(500).json({ error: 'Error al verificar blacklist' });
  }
});

module.exports = router;