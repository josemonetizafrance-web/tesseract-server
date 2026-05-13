/**
 * ROUTES/MAILING-TESSERACT - Programación y configuración de Smart Mailing
 * Nota: Los datos se guardan en chrome.storage.local de la extensión, no en servidor
 */
const { Router } = require('express');
const { validateToken } = require('../middleware/auth-tesseract.js');

const router = Router();
router.use('/api/tess/mailing', validateToken);

// GET /api/tess/mailing/config - Datos guardados localmente en extensión
router.get('/api/tess/mailing/config', (req, res) => {
  res.json({ config: null, schedules: [] });
});

// POST /api/tess/mailing/config - Datos guardados localmente en extensión
router.post('/api/tess/mailing/config', (req, res) => {
  res.json({ success: true, message: 'Guardado en chrome.storage.local' });
});

// POST /api/tess/mailing/increment - Datos guardados localmente en extensión
router.post('/api/tess/mailing/increment', (req, res) => {
  res.json({ success: true, count: 0 });
});

// GET /api/tess/mailing/stats - Datos guardados localmente en extensión
router.get('/api/tess/mailing/stats', (req, res) => {
  res.json({ sentToday: 0, monthlyHistory: [] });
});

module.exports = router;