/**
 * ROUTES/ADMIN-TESSERACT - Premium, ban, developer, actividad y métricas globales
 */
const { Router } = require('express');
const bcrypt = require('bcryptjs');
const { findUserByEmail, findUserById, updateUserPremium, setUserBan, setUserDeveloper, updateUserPassword, setUserCustomPlan, logActivity, getRecentActivity, getRecentBotActions, getMetricsOverview, createUser, updateUserOffice, getUsersByOffice, getMetricsByOffice, getActivityByOffice, clearActivityLog, clearActivityLogByOffice, getAllUsers, createOffice, getAllOffices, deleteOffice, setUserOfficeAdmin, deleteUser, updateLastActivity, getUsersWithMetrics } = require('../db/tesseract.js');
const { validateToken, requireTesseractAdmin, requireMasterAdmin, enforceOfficeFilter, requireOfficeScoped } = require('../middleware/auth-tesseract.js');

const router = Router();
const PREMIUM_MS = (parseInt(process.env.TESS_PREMIUM_DAYS) || 30) * 86400000;

router.use('/api/tess/admin', validateToken);

// Heartbeat: cualquier usuario autenticado actualiza su last_activity
router.post('/api/tess/admin/heartbeat', async (req, res) => {
  try {
    await updateLastActivity(req.user._id, Date.now());
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Rutas de oficinas (solo admin maestro o global admin)
router.post('/api/tess/admin/create-office', requireMasterAdmin, async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Nombre de oficina requerido' });
    console.log('[CREATE-OFFICE] user:', req.user.email, 'id:', req.user._id.toString());
    const id = await createOffice(name, req.user._id.toString());
    if (!id) return res.status(400).json({ error: 'La oficina ya existe' });
    await logActivity(req.user._id.toString(), req.user.email, `Oficina creada: ${name}`);
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
  await logActivity(req.user._id.toString(), req.user.email, `Oficina eliminada: ${req.params.name}`);
  res.json({ success: true });
});

router.post('/api/tess/admin/set-office-admin', requireMasterAdmin, async (req, res) => {
  const { email, isAdmin } = req.body;
  if (!email) return res.status(400).json({ error: 'Email requerido' });
  const user = await findUserByEmail(email);
  if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
  await setUserOfficeAdmin(user._id, isAdmin);
  await logActivity(req.user._id.toString(), req.user.email, `${email} ahora es admin de oficina: ${isAdmin}`);
  res.json({ success: true });
});

// Crear nuevo usuario (office admin solo puede crear operadores para su oficina)
router.post('/api/tess/admin/create-user', requireTesseractAdmin, async (req, res) => {
  try {
    const { email, password, office, userType } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email y contraseña requeridos' });
    if (!password.endsWith('*+')) return res.status(400).json({ error: 'La contraseña debe terminar en *+' });
    
    const existing = await findUserByEmail(email);
    if (existing) return res.status(400).json({ error: 'El usuario ya existe' });
    
    // Office admin: forzar oficina propia y solo puede crear operadores
    let finalOffice = office;
    let finalUserType = userType;
    if (req.user.is_office_admin && !req.user.is_developer && !req.user.is_admin) {
      finalOffice = req.user.office;
      finalUserType = 'operador';
    }
    
    const hash = bcrypt.hashSync(password, 12);
    const now = Date.now();
    const demoExpiry = now + (parseInt(process.env.TESS_DEMO_HOURS) || 24) * 3600000;
    const userId = await createUser(email, hash, demoExpiry);
    
    if (finalOffice) {
      await updateUserOffice(userId, finalOffice);
    }
    
    if (finalUserType === 'admin') {
      await setUserOfficeAdmin(userId, true);
    }
    
    const typeLabel = finalUserType === 'admin' ? 'ADMIN DE OFICINA' : 'OPERADOR';
    await logActivity(req.user._id.toString(), req.user.email, `Usuario creado: ${email} (${typeLabel})${finalOffice ? ' - ' + finalOffice : ''}`);
    res.json({ success: true, userId });
  } catch (err) {
    console.error('[CREATE-USER] Error:', err);
    res.status(500).json({ error: 'Error interno: ' + err.message });
  }
});

// Actualizar oficina de usuario (solo admin maestro)
router.post('/api/tess/admin/set-office', requireMasterAdmin, async (req, res) => {
  const { email, office } = req.body;
  if (!email || office === undefined) return res.status(400).json({ error: 'Email y oficina requeridos' });
  const user = await findUserByEmail(email);
  if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
  await updateUserOffice(user._id, office || null);
  await logActivity(req.user._id.toString(), req.user.email, `Oficina de ${email} cambiada a: ${office || 'sin oficina'}`);
  res.json({ success: true });
});

// Obtener usuarios (con filtro opcional por oficina)
router.get('/api/tess/admin/users', requireTesseractAdmin, enforceOfficeFilter, async (req, res) => {
  const office = req.query.office;
  const users = office ? await getUsersByOffice(office) : await getAllUsers();
  res.json({ users });
});

// Obtener usuarios con métricas del día
router.get('/api/tess/admin/users-with-metrics', requireTesseractAdmin, enforceOfficeFilter, async (req, res) => {
  const office = req.query.office;
  const users = await getUsersWithMetrics(office);
  res.json({ users });
});

// Obtener métricas por oficina
router.get('/api/tess/admin/metrics', requireTesseractAdmin, enforceOfficeFilter, async (req, res) => {
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
router.get('/api/tess/admin/activity-log', requireTesseractAdmin, enforceOfficeFilter, async (req, res) => {
  const office = req.query.office;
  const limit = parseInt(req.query.limit) || 100;
  const logs = (office && office !== 'all') ? await getActivityByOffice(office, limit) : await getRecentActivity(limit);
  res.json({ logs });
});

router.get('/api/tess/admin/bot-actions', requireTesseractAdmin, async (req, res) => {
  const limit = parseInt(req.query.limit) || 50;
  const actions = await getRecentBotActions(limit);
  res.json({ actions });
});

// DELETE /api/tess/admin/activity-log - Resetear registro de actividad
router.delete('/api/tess/admin/activity-log', requireTesseractAdmin, enforceOfficeFilter, async (req, res) => {
  try {
    const office = req.query.office;
    const user = req.user;
    let result;
    if (user.is_admin || user.is_developer) {
      result = await clearActivityLog(user._id.toString(), true);
    } else if (user.is_office_admin && user.office) {
      result = await clearActivityLogByOffice(user.office);
    } else {
      result = await clearActivityLog(user._id.toString(), false);
    }
    
    await logActivity(req.user._id.toString(), req.user.email, 'Registro de actividad limpiado', null, office ? `oficina: ${office}` : 'global');
    res.json({ success: true, deletedCount: result.deletedCount, message: 'Registro de actividad eliminado' });
  } catch (err) {
    console.error('[ADMIN] clear activity log error:', err);
    res.status(500).json({ error: 'Error al limpiar registro de actividad' });
  }
});

// Obtener métricas diarias por oficina (calendario)
router.get('/api/tess/admin/metrics-daily', requireTesseractAdmin, enforceOfficeFilter, async (req, res) => {
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
    
    // Agregar pipeline para obtener métricas diarias por fecha
    const db = req.app.locals.db;
    const metricsCollection = db.collection('tess_metrics_daily');
    
    const pipeline = [
      {
        $match: {
          user_id: { $in: userIds },
          date: { $gte: startDateStr }
        }
      },
      {
        $group: {
          _id: '$date',
          likes: { $sum: '$likes' },
          follows: { $sum: '$follows' },
          auto_response: { $sum: '$auto_response' },
          mailing: { $sum: '$mailing' }
        }
      },
      { $sort: { _id: 1 } }
    ];
    
    const results = await metricsCollection.aggregate(pipeline).toArray();
    
    // Formatear resultado
    const dailyMetrics = results.map(r => ({
      date: r._id,
      likes: r.likes || 0,
      follows: r.follows || 0,
      auto_response: r.auto_response || 0,
      mailing: r.mailing || 0
    }));
    
    res.json({ dailyMetrics, userCount: users.length, startDate: startDateStr });
  } catch (err) {
    console.error('[METRICS-DAILY] Error:', err);
    res.status(500).json({ error: 'Error: ' + err.message });
  }
});

// Obtener métricas por usuario específico
router.get('/api/tess/admin/metrics-by-user', requireTesseractAdmin, enforceOfficeFilter, async (req, res) => {
  const email = req.query.email;
  if (!email) return res.status(400).json({ error: 'Email requerido' });
  
  const user = await findUserByEmail(email);
  if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
  
  // Office admin: verificar que el usuario esté en su oficina
  if (req.user.is_office_admin && !req.user.is_developer && !req.user.is_admin) {
    if (user.office !== req.user.office) {
      return res.status(403).json({ error: 'No tienes permiso para ver métricas de usuarios de otra oficina' });
    }
  }
  
  const days = parseInt(req.query.days) || 30;
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  const startDateStr = startDate.toISOString().slice(0, 10);
  
  const { getMyMetrics } = require('../db/tesseract.js');
  const userMetrics = await getMyMetrics(user._id);
  
  res.json({ userMetrics });
});

router.post('/api/tess/admin/premium', requireTesseractAdmin, requireOfficeScoped, async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email requerido' });
  const user = await findUserByEmail(email);
  if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
  const now = Date.now();
  await updateUserPremium(user._id, now + PREMIUM_MS);
  await logActivity(req.user._id.toString(), req.user.email, `Premium activado para ${email} (30 dias)`);
  res.json({ success: true });
});

router.post('/api/tess/admin/ban', requireTesseractAdmin, requireOfficeScoped, async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email requerido' });
  const masterEmail = process.env.TESS_ADMIN_EMAIL || 'adminchevy@tesseract.com';
  if (email.toLowerCase() === masterEmail) return res.status(403).json({ error: 'No puedes banear al admin maestro' });
  const user = await findUserByEmail(email);
  if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
  await setUserBan(user._id, true);
  await logActivity(req.user._id.toString(), req.user.email, `Usuario baneado: ${email}`);
  res.json({ success: true });
});

router.post('/api/tess/admin/unban', requireTesseractAdmin, requireOfficeScoped, async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email requerido' });
  const user = await findUserByEmail(email);
  if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
  await setUserBan(user._id, false);
  await logActivity(req.user._id.toString(), req.user.email, `Usuario desbaneado: ${email}`);
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
    await logActivity(req.user._id.toString(), req.user.email, `Developer agregado: ${email}`);
  } else {
    if (user && email.toLowerCase() !== (process.env.TESS_ADMIN_EMAIL || 'adminchevy@tesseract.com')) await setUserDeveloper(user._id, false);
    await logActivity(req.user._id.toString(), req.user.email, `Developer removido: ${email}`);
  }
  res.json({ success: true });
});

router.post('/api/tess/admin/set-password', requireTesseractAdmin, requireOfficeScoped, async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email y contraseña requeridos' });
  const user = await findUserByEmail(email);
  if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
  await updateUserPassword(user._id, bcrypt.hashSync(password, 12));
  await logActivity(req.user._id.toString(), req.user.email, `Contraseña cambiada para: ${email}`);
  res.json({ success: true });
});

router.post('/api/tess/admin/set-plan', requireTesseractAdmin, requireOfficeScoped, async (req, res) => {
  const { email, plan } = req.body;
  if (!email || !plan) return res.status(400).json({ error: 'Email y plan requeridos' });
  const user = await findUserByEmail(email);
  if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
  await setUserCustomPlan(user._id, plan);
  await logActivity(req.user._id.toString(), req.user.email, `Plan "${plan}" asignado a ${email}`);
  res.json({ success: true });
});

router.delete('/api/tess/admin/users/:email', requireTesseractAdmin, requireOfficeScoped, async (req, res) => {
  const email = req.params.email;
  if (!email) return res.status(400).json({ error: 'Email requerido' });
  const masterEmail = process.env.TESS_ADMIN_EMAIL || 'adminchevy@tesseract.com';
  if (email.toLowerCase() === masterEmail) return res.status(403).json({ error: 'No puedes eliminar al admin maestro' });
  const user = await findUserByEmail(email);
  if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
  await deleteUser(user._id);
  await logActivity(req.user._id.toString(), req.user.email, `Usuario eliminado: ${email}`);
  res.json({ success: true, message: `Usuario ${email} eliminado` });
});

module.exports = router;
