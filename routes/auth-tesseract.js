/**
 * ROUTES/AUTH-TESSERACT - Login, Sign Up, verificación y listado de usuarios (MongoDB)
 */
const { Router } = require('express');
const bcrypt = require('bcryptjs');
const { findUserByEmail, createUser, createUserPending, updateLoginStats, updateLastActivity, getAllUsers, logActivity, findUserById, updateUserApproved, storeRefreshToken, revokeRefreshToken } = require('../db/tesseract.js');
const { generateToken, generateRefreshToken, hashRefreshToken, validateToken, requireTesseractAdmin } = require('../middleware/auth-tesseract.js');

const router = Router();
const DEMO_MS = (parseInt(process.env.TESS_DEMO_HOURS) || 24) * 3600000;
const ACTIVITY_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 horas de actividad

// POST /api/tess/auth/signup - Login o crear admin automáticamente
router.post('/api/tess/auth/signup', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email y contraseña requeridos' });
    if (!password.endsWith('*+')) return res.status(400).json({ error: 'La contraseña debe terminar en *+' });
    if (!email.toLowerCase().endsWith('@tesseract.com')) return res.status(400).json({ error: 'Solo correos @tesseract.com' });

    const adminEmail = process.env.TESS_ADMIN_EMAIL || 'adminchevy@tesseract.com';
    let user = await findUserByEmail(email);
    
    // Si es el admin y no existe, crearlo automáticamente
    if (!user && email.toLowerCase() === adminEmail.toLowerCase()) {
      const { getDb } = require('../db/tesseract.js');
      const db = getDb();
      const passwordHash = bcrypt.hashSync(password, 12);
      const now = Date.now();
      const result = await db.collection('tess_users').insertOne({
        email: email.toLowerCase(),
        password_hash: passwordHash,
        role: 'developer',
        is_admin: 1,
        is_developer: 1,
        is_banned: 0,
        is_approved: 1,
        is_premium: 1,
        demo_expiry: null,
        premium_expiry: null,
        login_count: 1,
        last_login: now,
        last_activity: now,
        office: null,
        is_office_admin: 0,
        created_at: now,
        blacklist: []
      });
      console.log('✅ Admin creado automáticamente:', email);
      user = await findUserById(result.insertedId);
    }
    
    if (!user) {
      const passwordHash = bcrypt.hashSync(password, 12);
      const now = Date.now();
      const demoExpiry = now + (parseInt(process.env.TESS_DEMO_HOURS) || 24) * 3600000;
      const userId = await createUser(email, passwordHash, demoExpiry);
      
      await logActivity(userId, email, 'Registro automático');
      
      // Re-obtener el usuario creado para continuar el login
      user = await findUserById(userId);
      if (!user) {
        return res.status(500).json({ error: 'Error al crear usuario' });
      }
    }
    if (user.is_banned) return res.status(403).json({ error: 'Usuario baneado' });
    
    // Verificar contraseña
    if (!bcrypt.compareSync(password, user.password_hash)) {
      return res.status(401).json({ error: 'Contraseña incorrecta' });
    }
    
    // Login normal
    const now = Date.now();
    await updateLoginStats(user._id);
    await updateLastActivity(user._id, now);
    const sub = computeSub(user, now);
    const token = generateToken(user._id.toString());
    const refreshToken = generateRefreshToken();
    await storeRefreshToken(user._id.toString(), hashRefreshToken(refreshToken), Date.now() + 30 * 24 * 3600000);
    await logActivity(user._id, email, 'Inicio de sesión');
    
    return res.json({ 
      token,
      refreshToken,
      user: { 
        email: user.email, 
        role: sub.status, 
        isAdmin: !!user.is_admin, 
        isDeveloper: !!user.is_developer,
        isOfficeAdmin: !!user.is_office_admin,
        office: user.office || null,
        isApproved: !!user.is_approved,
        subscription: sub 
      } 
    });
  } catch (err) {
    console.error('[AUTH ERROR]', err);
    return res.status(500).json({ error: 'Error: ' + err.message });
  }
});

// POST /api/tess/auth/login - Login (para usuarios ya aprobados)
router.post('/api/tess/auth/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email y contraseña requeridos' });
  if (!password.endsWith('*+')) return res.status(400).json({ error: 'La contraseña debe terminar en *+' });

  const now = Date.now();
  let user = await findUserByEmail(email);

  if (!user) {
    return res.status(404).json({ error: 'Usuario no encontrado. Regístrate primero.' });
  }

  if (user.is_banned) return res.status(403).json({ error: 'Usuario baneado' });

  // Verificar si está aprobado
  if (!user.is_approved) {
    return res.status(403).json({ 
      error: 'Tu cuenta está pendiente de aprobación. Contacta al administrador.',
      needsApproval: true 
    });
  }

  if (!bcrypt.compareSync(password, user.password_hash)) return res.status(401).json({ error: 'Contraseña incorrecta' });

  // Verificar expiry de actividad para no premium
  if (!user.is_premium && user.last_activity) {
    const timeSinceActivity = now - user.last_activity;
    if (timeSinceActivity > ACTIVITY_EXPIRY_MS) {
      return res.status(403).json({ 
        error: 'Tu sesión ha expirado. Solicita re-activación al administrador.',
        expired: true 
      });
    }
  }

  await updateLoginStats(user._id);
  await updateLastActivity(user._id, now);
  const sub = computeSub(user, now);
  const token = generateToken(user._id.toString());
  const refreshToken = generateRefreshToken();
  await storeRefreshToken(user._id.toString(), hashRefreshToken(refreshToken), Date.now() + 30 * 24 * 3600000);
  await logActivity(user._id, email, 'Inicio de sesión');
  
  res.json({ token, refreshToken, user: { 
    email: user.email, 
    role: sub.status, 
    isAdmin: !!user.is_admin, 
    isDeveloper: !!user.is_developer,
    isOfficeAdmin: !!user.is_office_admin,
    office: user.office || null,
    isApproved: !!user.is_approved,
    subscription: sub 
  } });
});

// GET /api/tess/auth/verify
router.get('/api/tess/auth/verify', validateToken, (req, res) => {
  const sub = computeSub(req.user, Date.now());
  res.json({ 
    valid: true, 
    email: req.user.email, 
    role: sub.status, 
    isAdmin: !!req.user.is_admin, 
    isDeveloper: !!req.user.is_developer,
    isOfficeAdmin: !!req.user.is_office_admin,
    office: req.user.office || null,
    isApproved: !!req.user.is_approved,
    subscription: sub 
  });
});

// POST /api/tess/auth/refresh
router.post('/api/tess/auth/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) return res.status(400).json({ error: 'Refresh token requerido' });

    const hash = hashRefreshToken(refreshToken);
    const { getDb } = require('../db/tesseract.js');
    const db = getDb();
    const user = await db.collection('tess_users').findOne({ refresh_token_hash: hash });

    if (!user) return res.status(401).json({ error: 'Refresh token inválido', code: 'TOKEN_EXPIRED' });
    if (user.refresh_token_expiry < Date.now()) {
      await revokeRefreshToken(user._id.toString());
      return res.status(401).json({ error: 'Refresh token expirado', code: 'TOKEN_EXPIRED' });
    }

    const newToken = generateToken(user._id.toString());
    const newRefreshToken = generateRefreshToken();
    await storeRefreshToken(user._id.toString(), hashRefreshToken(newRefreshToken), Date.now() + 30 * 24 * 3600000);
    await logActivity(user._id, user.email, 'Token refrescado');

    res.json({ token: newToken, refreshToken: newRefreshToken });
  } catch (err) {
    console.error('[REFRESH ERROR]', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/tess/auth/users
router.get('/api/tess/auth/users', validateToken, requireTesseractAdmin, async (req, res) => {
  const users = await getAllUsers();
  res.json({ users });
});

// Endpoint para que el admin apruebe usuarios
router.post('/api/tess/admin/approve-user', requireTesseractAdmin, async (req, res) => {
  try {
    const { email, approved } = req.body;
    if (!email) return res.status(400).json({ error: 'Email requerido' });
    
    await updateUserApproved(email, approved);
    await logActivity(req.user._id, req.user.email, approved ? `Usuario aprobado: ${email}` : `Usuario desaprobado: ${email}`);
    
    res.json({ success: true, message: approved ? 'Usuario aprobado' : 'Usuario desaprobado' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

function computeSub(user, now) {
  if (user.role === 'developer') return { status: 'developer', isPremium: true, timeRemaining: 999999999999999 };
  if (user.premium_expiry && user.premium_expiry > now) return { status: 'premium', isPremium: true, timeRemaining: user.premium_expiry - now };
  if (user.demo_expiry && user.demo_expiry > now) return { status: 'demo', isPremium: false, timeRemaining: user.demo_expiry - now };
  return { status: 'expired', isPremium: false, timeRemaining: 0 };
}

module.exports = router;