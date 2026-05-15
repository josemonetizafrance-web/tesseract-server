/**
 * ROUTES/BLACKLIST-TESSERACT - Gestión de lista negra de contactos
 */
const { Router } = require('express');
const { validateToken } = require('../middleware/auth-tesseract.js');
const { getBlacklist, addToBlacklist, removeFromBlacklist, isInBlacklist, findUserByEmail } = require('../db/tesseract.js');

const router = Router();

// GET /api/tess/blacklist - Obtener lista negra del usuario
router.get('/api/tess/blacklist', validateToken, async (req, res) => {
  try {
    const userId = req.userId;
    const blacklist = await getBlacklist(userId);
    return res.json({ blacklist });
  } catch (err) {
    console.error('[BLACKLIST GET ERROR]', err);
    return res.status(500).json({ error: 'Error al obtener blacklist' });
  }
});

// POST /api/tess/blacklist/add - Agregar contacto a lista negra
router.post('/api/tess/blacklist/add', validateToken, async (req, res) => {
  try {
    const { contactId } = req.body;
    if (!contactId) {
      return res.status(400).json({ error: 'contactId requerido' });
    }
    
    const userId = req.userId;
    await addToBlacklist(userId, contactId);
    
    return res.json({ success: true, message: 'Contacto agregado a blacklist' });
  } catch (err) {
    console.error('[BLACKLIST ADD ERROR]', err);
    return res.status(500).json({ error: 'Error al agregar a blacklist' });
  }
});

// POST /api/tess/blacklist/remove - Eliminar contacto de lista negra
router.post('/api/tess/blacklist/remove', validateToken, async (req, res) => {
  try {
    const { contactId } = req.body;
    if (!contactId) {
      return res.status(400).json({ error: 'contactId requerido' });
    }
    
    const userId = req.userId;
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
    
    const userId = req.userId;
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
    const userId = req.userId;
    const inBlacklist = await isInBlacklist(userId, contactId);
    return res.json({ inBlacklist });
  } catch (err) {
    console.error('[BLACKLIST CHECK ERROR]', err);
    return res.status(500).json({ error: 'Error al verificar blacklist' });
  }
});

module.exports = router;