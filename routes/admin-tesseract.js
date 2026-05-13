/**
 * ROUTES/ADMIN-TESSERACT - Premium, ban, developer, actividad y métricas globales
 */
const { Router } = require('express');
const bcrypt = require('bcryptjs');
const { findUserByEmail, findUserById, updateUserPremium, setUserBan, setUserDeveloper, updateUserPassword, setUserCustomPlan, logActivity, getRecentActivity, getMetricsOverview, createUser, updateUserOffice, getUsersByOffice, getMetricsByOffice, getActivityByOffice, getAllUsers, createOffice, getAllOffices, deleteOffice, setUserOfficeAdmin, deleteUser, query } = require('../db/tesseract.js');
const { validateToken, requireTesseractAdmin, requireMasterAdmin } = require('../middleware/auth-tesseract.js');

const router = Router();
const PREMIUM_MS = (parseInt(process.env.TESS_PREMIUM_DAYS) || 90) * 86400000;

router.use('/api/tess/admin', validateToken);

// Rutas de oficinas (cualquier admin)
router.post('/api/tess/admin/create-office', requireTesseractAdmin, async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Nombre de oficina requerido' });
    console.log('[CREATE-OFFICE] user:', req.user.email, 'id:', req.user.id);
    const id = await createOffice(name, req.user.id);
    if (!id) return res.status(400).json({ error: 'La oficina ya existe' });
    await logActivity(req.user.id, req.user.email, `Oficina creada: ${name}`);
    res.json({ success: true, officeId: id });
  } catch (err) {
    console.error('[CREATE-OFFICE] Error:', err);
    res.status(500).json({ error: 'Error interno: ' + err.message });
  }
});

router.get('/api/tess/admin/offices', requireTesseractAdmin, async (req, res) => {
  const offices = await getAllOffices();
  res.json({ offices });
});

router.delete('/api/tess/admin/offices/:name', requireMasterAdmin, async (req, res) => {
  await deleteOffice(req.params.name);
  await logActivity(req.user.id, req.user.email, `Oficina eliminada: ${req.params.name}`);
  res.json({ success: true });
});

router.post('/api/tess/admin/set-office-admin', requireTesseractAdmin, async (req, res) => {
  const { email, isAdmin } = req.body;
  if (!email) return res.status(400).json({ error: 'Email requerido' });
  const user = await findUserByEmail(email);
  if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
  await setUserOfficeAdmin(user._id, isAdmin);
  await logActivity(req.user.id, req.user.email, `${email} ahora es admin de oficina: ${isAdmin}`);
  res.json({ success: true });
});

// Crear nuevo usuario
router.post('/api/tess/admin/create-user', requireTesseractAdmin, async (req, res) => {
  try {
    const { email, password, office, userType } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email y contraseña requeridos' });
    if (!email.endsWith('@tesseract.com')) return res.status(400).json({ error: 'Solo correos @tesseract.com' });
    if (!password.endsWith('*+')) return res.status(400).json({ error: 'La contraseña debe terminar en *+' });
    
    const existing = await findUserByEmail(email);
    if (existing) return res.status(400).json({ error: 'El usuario ya existe' });
    
    const hash = bcrypt.hashSync(password, 12);
    const now = Date.now();
    const demoExpiry = now + (parseInt(process.env.TESS_DEMO_HOURS) || 24) * 3600000;
    const userId = await createUser(email, hash, demoExpiry);
    
    if (office) {
      await updateUserOffice(userId, office);
    }
    
    if (userType === 'admin') {
      await setUserOfficeAdmin(userId, true);
    }
    
    const typeLabel = userType === 'admin' ? 'ADMIN DE OFICINA' : 'OPERADOR';
    await logActivity(req.user.id, req.user.email, `Usuario creado: ${email} (${typeLabel})${office ? ' - ' + office : ''}`);
    res.json({ success: true, userId });
  } catch (err) {
    console.error('[CREATE-USER] Error:', err);
    res.status(500).json({ error: 'Error interno: ' + err.message });
  }
});

// Actualizar oficina de usuario
router.post('/api/tess/admin/set-office', requireTesseractAdmin, async (req, res) => {
  const { email, office } = req.body;
  if (!email || office === undefined) return res.status(400).json({ error: 'Email y oficina requeridos' });
  const user = await findUserByEmail(email);
  if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
  await updateUserOffice(user._id, office || null);
  await logActivity(req.user.id, req.user.email, `Oficina de ${email} cambiada a: ${office || 'sin oficina'}`);
  res.json({ success: true });
});

// Obtener usuarios (con filtro opcional por oficina)
router.get('/api/tess/admin/users', requireTesseractAdmin, async (req, res) => {
  const office = req.query.office;
  const users = office ? await getUsersByOffice(office) : await getAllUsers();
  res.json({ users });
});

// Obtener métricas por oficina
router.get('/api/tess/admin/metrics', requireTesseractAdmin, async (req, res) => {
  try {
    const office = req.query.office;
    if (office && office !== 'all') {
      res.json(await getMetricsByOffice(office));
    } else {
      res.json(await getMetricsOverview());
    }
  } catch (err) {
    console.error('[METRICS] Error:', err);
    res.status(500).json({ error: 'Error interno: ' + err.message });
  }
});

// Obtener actividad por oficina
router.get('/api/tess/admin/activity-log', requireTesseractAdmin, async (req, res) => {
  const office = req.query.office;
  const limit = parseInt(req.query.limit) || 100;
  const logs = (office && office !== 'all') ? await getActivityByOffice(office, limit) : await getRecentActivity(limit);
  res.json({ logs });
});

// Obtener métricas diarias por oficina (calendario) - simplificado para MongoDB
router.get('/api/tess/admin/metrics-daily', requireTesseractAdmin, async (req, res) => {
  try {
    const office = req.query.office;
    const days = parseInt(req.query.days) || 30;
    
    let users = [];
    if (office && office !== 'all') {
      users = await getUsersByOffice(office);
    } else {
      users = await getAllUsers();
    }
    
    if (!users || users.length === 0) {
      return res.json({ dailyMetrics: [] });
    }
    
    const userIds = users.map(u => u._id);
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    const startDateStr = startDate.toISOString().slice(0, 10);
    
    // Aggregation simplified
    const dailyMetrics = []; // MongoDB aggregation would go here
    
    res.json({ dailyMetrics, userCount: users.length, startDate: startDateStr });
  } catch (err) {
    console.error('[METRICS-DAILY] Error:', err);
    res.status(500).json({ error: 'Error: ' + err.message });
  }
});
  try {
    const office = req.query.office;
    const days = parseInt(req.query.days) || 30;
    
    let users = [];
    if (office && office !== 'all') {
      users = query('SELECT id FROM tess_users WHERE office=?', [office]).map(u => u.id);
    } else {
      users = query('SELECT id FROM tess_users WHERE office IS NOT NULL AND office != ""').map(u => u.id);
    }
    
    if (users.length === 0) {
      return res.json({ dailyMetrics: [] });
    }
    
    const userIds = users.join(',');
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    const startDateStr = startDate.toISOString().slice(0, 10);
    
    const metrics = query(`
      SELECT date, SUM(icebreakers) as saludos, SUM(likes) as likes, SUM(follows) as follows, SUM(cartas) as cartas
      FROM tess_metrics_daily 
      WHERE user_id IN (${userIds}) AND date >= ?
      GROUP BY date
      ORDER BY date DESC
    `, [startDateStr]);
    
    res.json({ dailyMetrics: metrics, userCount: users.length, startDate: startDateStr });
  } catch (err) {
    console.error('[METRICS-DAILY] Error:', err);
    res.status(500).json({ error: 'Error: ' + err.message });
  }
});

// Obtener métricas por usuario específico
router.get('/api/tess/admin/metrics-by-user', requireTesseractAdmin, async (req, res) => {
  const email = req.query.email;
  if (!email) return res.status(400).json({ error: 'Email requerido' });
  
  const user = await findUserByEmail(email);
  if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
  
  const days = parseInt(req.query.days) || 30;
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  const startDateStr = startDate.toISOString().slice(0, 10);
  
  const { getMyMetrics } = require('../db/tesseract.js');
  const userMetrics = await getMyMetrics(user._id);
  
  res.json({ userMetrics });
});

router.post('/api/tess/admin/premium', requireTesseractAdmin, async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email requerido' });
  const user = await findUserByEmail(email);
  if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
  const now = Date.now();
  await updateUserPremium(user._id, now + PREMIUM_MS);
  await logActivity(req.user.id, req.user.email, `Premium activado para ${email} (3 meses)`);
  res.json({ success: true });
});

router.post('/api/tess/admin/ban', requireTesseractAdmin, async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email requerido' });
  const masterEmail = process.env.TESS_ADMIN_EMAIL || 'adminchevy@tesseract.com';
  if (email.toLowerCase() === masterEmail) return res.status(403).json({ error: 'No puedes banear al admin maestro' });
  const user = await findUserByEmail(email);
  if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
  await setUserBan(user._id, true);
  await logActivity(req.user.id, req.user.email, `Usuario baneado: ${email}`);
  res.json({ success: true });
});

router.post('/api/tess/admin/unban', requireTesseractAdmin, async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email requerido' });
  const user = await findUserByEmail(email);
  if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
  await setUserBan(user._id, false);
  await logActivity(req.user.id, req.user.email, `Usuario desbaneado: ${email}`);
  res.json({ success: true });
});

router.post('/api/tess/admin/developer', requireMasterAdmin, async (req, res) => {
  const { email, action } = req.body;
  if (!email || !action) return res.status(400).json({ error: 'Email y acción requeridos' });
  if (!['add', 'remove'].includes(action)) return res.status(400).json({ error: 'Acción: add o remove' });
  const user = await findUserByEmail(email);
  if (action === 'add') {
    if (!user) {
      const hash = bcrypt.hashSync('tesseract*+', 12);
      const id = await createUser(email, hash, 0);
      await setUserDeveloper(id, true);
    } else await setUserDeveloper(user._id, true);
    await logActivity(req.user.id, req.user.email, `Developer agregado: ${email}`);
  } else {
    if (user && email.toLowerCase() !== (process.env.TESS_ADMIN_EMAIL || 'adminchevy@tesseract.com')) await setUserDeveloper(user._id, false);
    await logActivity(req.user.id, req.user.email, `Developer removido: ${email}`);
  }
  res.json({ success: true });
});

router.post('/api/tess/admin/set-password', requireTesseractAdmin, async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email y contraseña requeridos' });
  const user = await findUserByEmail(email);
  if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
  await updateUserPassword(user._id, bcrypt.hashSync(password, 12));
  await logActivity(req.user.id, req.user.email, `Contraseña cambiada para: ${email}`);
  res.json({ success: true });
});

router.post('/api/tess/admin/set-plan', requireTesseractAdmin, async (req, res) => {
  const { email, plan } = req.body;
  if (!email || !plan) return res.status(400).json({ error: 'Email y plan requeridos' });
  const user = await findUserByEmail(email);
  if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
  await setUserCustomPlan(user._id, plan);
  await logActivity(req.user.id, req.user.email, `Plan "${plan}" asignado a ${email}`);
  res.json({ success: true });
});

router.delete('/api/tess/admin/users/:email', requireTesseractAdmin, async (req, res) => {
  const email = req.params.email;
  if (!email) return res.status(400).json({ error: 'Email requerido' });
  const masterEmail = process.env.TESS_ADMIN_EMAIL || 'adminchevy@tesseract.com';
  if (email.toLowerCase() === masterEmail) return res.status(403).json({ error: 'No puedes eliminar al admin maestro' });
  const user = await findUserByEmail(email);
  if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
  await deleteUser(user._id);
  await logActivity(req.user.id, req.user.email, `Usuario eliminado: ${email}`);
  res.json({ success: true, message: `Usuario ${email} eliminado` });
});

module.exports = router;
