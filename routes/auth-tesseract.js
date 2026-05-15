/**
 * ROUTES/AUTH-TESSERACT - Login, Sign Up, verificación y listado de usuarios (MongoDB)
 */
const { Router } = require('express');
const bcrypt = require('bcryptjs');
const { findUserByEmail, createUser, createUserPending, updateLoginStats, updateLastActivity, getAllUsers, logActivity, findUserById, updateUserApproved } = require('../db/tesseract.js');
const { generateToken, validateToken, requireTesseractAdmin } = require('../middleware/auth-tesseract.js');

const router = Router();
const DEMO_MS = (parseInt(process.env.TESS_DEMO_HOURS) || 24) * 3600000;
const ACTIVITY_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 horas de actividad

// POST /api/tess/auth/signup - Solo permite registro si el usuario ya existe (para migración)
router.post('/api/tess/auth/signup', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email y contraseña requeridos' });
    if (!password.endsWith('*+')) return res.status(400).json({ error: 'La contraseña debe terminar en *+' });

    const user = await findUserByEmail(email);
    if (!user) {
      return res.status(404).json({ error: 'Usuario no registrado. Contacta al administrador para obtener acceso.' });
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
    await logActivity(user._id, email, 'Inicio de sesión');
    
    return res.json({ 
      token, 
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
  await logActivity(user._id, email, 'Inicio de sesión');
  
  res.json({ token, user: { 
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
    await logActivity(req.user.id, req.user.email, approved ? `Usuario aprobado: ${email}` : `Usuario desaprobado: ${email}`);
    
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