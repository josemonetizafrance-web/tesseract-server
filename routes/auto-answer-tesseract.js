/**
 * ROUTES/AUTO-ANSWER-TESSERACT - Plantillas y configuración de Auto-Answer
 * Nota: Los datos se guardan en chrome.storage.local de la extensión, no en servidor
 */
const { Router } = require('express');
const { validateToken } = require('../middleware/auth-tesseract.js');

const router = Router();
router.use('/api/tess/auto-answer', validateToken);

// GET /api/tess/auto-answer/templates - Datos guardados localmente en extensión
router.get('/api/tess/auto-answer/templates', (req, res) => {
  res.json({ message: 'Configuración guardada en chrome.storage.local de la extensión' });
});

// POST /api/tess/auto-answer/templates - Datos guardados localmente en extensión
router.post('/api/tess/auto-answer/templates', (req, res) => {
  res.json({ success: true, message: 'Guardado en chrome.storage.local' });
});

// POST /api/tess/auto-answer/config - Datos guardados localmente en extensión
router.post('/api/tess/auto-answer/config', (req, res) => {
  res.json({ success: true, message: 'Guardado en chrome.storage.local' });
});

// POST /api/tess/auto-answer/increment - Datos guardados localmente en extensión
router.post('/api/tess/auto-answer/increment', (req, res) => {
  res.json({ success: true, count: 0 });
});

module.exports = router;