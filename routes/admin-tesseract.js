/**
 * ROUTES/ADMIN-TESSERACT - Premium, ban, developer, actividad y métricas globales
 */
const { Router } = require('express');
const bcrypt = require('bcryptjs');
const { findUserByEmail, updateUserPremium, setUserBan, setUserDeveloper, updateUserPassword, setUserCustomPlan, logActivity, getRecentActivity, getMetricsOverview, createUser } = require('../db/tesseract.js');
const { validateToken, requireTesseractAdmin, requireMasterAdmin } = require('../middleware/auth-tesseract.js');

const router = Router();
const PREMIUM_MS = (parseInt(process.env.TESS_PREMIUM_DAYS) || 90) * 86400000;

router.use('/api/tess/admin', validateToken);

router.post('/api/tess/admin/premium', requireTesseractAdmin, (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email requerido' });
  const user = findUserByEmail(email);
  if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
  const now = Date.now();
  updateUserPremium(user.id, now + PREMIUM_MS);
  logActivity(req.user.id, req.user.email, `Premium activado para ${email} (3 meses)`);
  res.json({ success: true });
});

router.post('/api/tess/admin/ban', requireTesseractAdmin, (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email requerido' });
  const masterEmail = process.env.TESS_ADMIN_EMAIL || 'adminchevy@tesseract.com';
  if (email.toLowerCase() === masterEmail) return res.status(403).json({ error: 'No puedes banear al admin maestro' });
  const user = findUserByEmail(email);
  if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
  setUserBan(user.id, true);
  logActivity(req.user.id, req.user.email, `Usuario baneado: ${email}`);
  res.json({ success: true });
});

router.post('/api/tess/admin/unban', requireTesseractAdmin, (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email requerido' });
  const user = findUserByEmail(email);
  if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
  setUserBan(user.id, false);
  logActivity(req.user.id, req.user.email, `Usuario desbaneado: ${email}`);
  res.json({ success: true });
});

router.post('/api/tess/admin/developer', requireMasterAdmin, (req, res) => {
  const { email, action } = req.body;
  if (!email || !action) return res.status(400).json({ error: 'Email y acción requeridos' });
  if (!['add', 'remove'].includes(action)) return res.status(400).json({ error: 'Acción: add o remove' });
  const user = findUserByEmail(email);
  if (action === 'add') {
    if (!user) {
      const hash = bcrypt.hashSync('tesseract*+', 12);
      const id = createUser(email, hash, 0);
      setUserDeveloper(id, true);
    } else setUserDeveloper(user.id, true);
    logActivity(req.user.id, req.user.email, `Developer agregado: ${email}`);
  } else {
    if (user && email.toLowerCase() !== (process.env.TESS_ADMIN_EMAIL || 'adminchevy@tesseract.com')) setUserDeveloper(user.id, false);
    logActivity(req.user.id, req.user.email, `Developer removido: ${email}`);
  }
  res.json({ success: true });
});

router.post('/api/tess/admin/set-password', requireTesseractAdmin, (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email y contraseña requeridos' });
  const user = findUserByEmail(email);
  if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
  updateUserPassword(user.id, bcrypt.hashSync(password, 12));
  logActivity(req.user.id, req.user.email, `Contraseña cambiada para: ${email}`);
  res.json({ success: true });
});

router.post('/api/tess/admin/set-plan', requireTesseractAdmin, (req, res) => {
  const { email, plan } = req.body;
  if (!email || !plan) return res.status(400).json({ error: 'Email y plan requeridos' });
  const user = findUserByEmail(email);
  if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
  setUserCustomPlan(user.id, plan);
  logActivity(req.user.id, req.user.email, `Plan "${plan}" asignado a ${email}`);
  res.json({ success: true });
});

router.get('/api/tess/admin/activity-log', requireTesseractAdmin, (req, res) => {
  res.json({ logs: getRecentActivity(parseInt(req.query.limit) || 100) });
});

router.get('/api/tess/admin/metrics', requireTesseractAdmin, (req, res) => {
  res.json(getMetricsOverview());
});

module.exports = router;
