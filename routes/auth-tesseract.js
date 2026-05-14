/**
 * ROUTES/AUTH-TESSERACT - Login, verificación y listado de usuarios (MongoDB)
 */
const { Router } = require('express');
const bcrypt = require('bcryptjs');
const { findUserByEmail, createUser, updateLoginStats, getAllUsers, logActivity } = require('../db/tesseract.js');
const { generateToken, validateToken, requireTesseractAdmin } = require('../middleware/auth-tesseract.js');

const router = Router();
const DEMO_MS = (parseInt(process.env.TESS_DEMO_HOURS) || 24) * 3600000;

// POST /api/tess/auth/login
router.post('/api/tess/auth/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email y contraseña requeridos' });
  if (!email.endsWith('@tesseract.com')) return res.status(400).json({ error: 'Solo correos @tesseract.com' });
  if (!password.endsWith('*+')) return res.status(400).json({ error: 'La contraseña debe terminar en *+' });

  const now = Date.now();
  let user = await findUserByEmail(email);

  if (user && user.is_banned) return res.status(403).json({ error: 'Usuario baneado' });

  if (!user) {
    const hash = bcrypt.hashSync(password, 12);
    const userId = await createUser(email, hash, now + DEMO_MS);
    const token = generateToken(userId.toString());
    await logActivity(userId, email, 'Primer inicio (demo 24h)');
    return res.json({ token, user: { email: email.toLowerCase(), role: 'demo', isAdmin: false, isDeveloper: false, subscription: { status: 'demo', isPremium: false, timeRemaining: DEMO_MS } } });
  }

  if (!bcrypt.compareSync(password, user.password_hash)) return res.status(401).json({ error: 'Contraseña incorrecta' });

  await updateLoginStats(user._id);
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
    subscription: sub 
  });
});

// GET /api/tess/auth/users
router.get('/api/tess/auth/users', validateToken, requireTesseractAdmin, async (req, res) => {
  const users = await getAllUsers();
  res.json({ users });
});

function computeSub(user, now) {
  if (user.role === 'developer') return { status: 'developer', isPremium: true, timeRemaining: 999999999999999 };
  if (user.premium_expiry && user.premium_expiry > now) return { status: 'premium', isPremium: true, timeRemaining: user.premium_expiry - now };
  if (user.demo_expiry && user.demo_expiry > now) return { status: 'demo', isPremium: false, timeRemaining: user.demo_expiry - now };
  return { status: 'expired', isPremium: false, timeRemaining: 0 };
}

module.exports = router;