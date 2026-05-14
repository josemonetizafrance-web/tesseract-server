/**
 * MIDDLEWARE/AUTH-TESSERACT - JWT, bcrypt y control de roles
 */
const jwt = require('jsonwebtoken');
const { findUserById } = require('../db/tesseract.js');

const JWT_SECRET = process.env.TESS_JWT_SECRET;
const TOKEN_EXPIRY = '7d';

function generateToken(userId) {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: TOKEN_EXPIRY });
}

async function validateToken(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token requerido', code: 'TOKEN_MISSING' });
  }

  const token = header.split(' ')[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await findUserById(decoded.userId);
    if (!user) return res.status(401).json({ error: 'Usuario no encontrado', code: 'USER_NOT_FOUND' });
    if (user.is_banned) return res.status(403).json({ error: 'Usuario baneado', code: 'USER_BANNED' });
    req.user = user;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expirado', code: 'TOKEN_EXPIRED' });
    }
    return res.status(401).json({ error: 'Token inválido', code: 'TOKEN_INVALID' });
  }
}

function requireTesseractAdmin(req, res, next) {
  if (!req.user || (!req.user.is_admin && !req.user.is_developer)) {
    return res.status(403).json({ error: 'Se requieren permisos de administrador', code: 'FORBIDDEN' });
  }
  next();
}

function requireMasterAdmin(req, res, next) {
  const masterEmail = process.env.TESS_ADMIN_EMAIL || 'adminchevy@tesseract.com';
  if (!req.user || req.user.email !== masterEmail) {
    return res.status(403).json({ error: 'Solo el administrador maestro', code: 'MASTER_ONLY' });
  }
  next();
}

function checkSubscription(req, res, next) {
  const now = Date.now();
  const user = req.user;
  if (user.role === 'developer') {
    req.subscription = { status: 'developer', isPremium: true, timeRemaining: Infinity };
    return next();
  }
  let status = 'expired', isPremium = false, timeRemaining = 0;
  if (user.premium_expiry && user.premium_expiry > now) {
    status = 'premium'; isPremium = true; timeRemaining = user.premium_expiry - now;
  } else if (user.demo_expiry && user.demo_expiry > now) {
    status = 'demo'; timeRemaining = user.demo_expiry - now;
  }
  req.subscription = { status, isPremium, timeRemaining };
  next();
}

module.exports = { generateToken, validateToken, requireTesseractAdmin, requireMasterAdmin, checkSubscription };
