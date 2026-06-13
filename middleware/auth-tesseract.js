/**
 * MIDDLEWARE/AUTH-TESSERACT - JWT, bcrypt y control de roles
 */
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { findUserById } = require('../db/tesseract.js');

const JWT_SECRET = process.env.TESS_JWT_SECRET;
const TOKEN_EXPIRY = '7d';
const REFRESH_TOKEN_DAYS = 30;

function generateToken(userId) {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: TOKEN_EXPIRY });
}

function generateRefreshToken() {
  return crypto.randomBytes(32).toString('hex');
}

function hashRefreshToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
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
  if (!req.user || (!req.user.is_admin && !req.user.is_developer && !req.user.is_office_admin)) {
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

// Middleware que fuerza el filtro de oficina para office admins
function enforceOfficeFilter(req, res, next) {
  if (req.user && req.user.is_office_admin && !req.user.is_developer && !req.user.is_admin) {
    req.query.office = req.user.office || 'none';
  }
  next();
}

// Middleware que valida que un office admin solo pueda actuar sobre usuarios de su oficina
// Se usa en rutas que reciben un email en el body (ban, premium, set-password, etc.)
function requireOfficeScoped(req, res, next) {
  const user = req.user;
  // Master admin y global admins pueden actuar sobre cualquier usuario
  if (user.is_developer || user.is_admin) return next();
  // Office admin: validar que el usuario objetivo esté en su oficina
  if (user.is_office_admin) {
    const { findUserByEmail } = require('../db/tesseract.js');
    const targetEmail = req.body.email || req.params.email;
    if (!targetEmail) return res.status(400).json({ error: 'Email requerido' });
    return findUserByEmail(targetEmail).then(target => {
      if (!target) return res.status(404).json({ error: 'Usuario no encontrado' });
      if (target.office !== user.office) {
        return res.status(403).json({ error: 'No tienes permiso para actuar sobre usuarios de otra oficina', code: 'OFFICE_MISMATCH' });
      }
      // No permitir que un office admin modifique a otro admin o developer
      if (target.is_admin || target.is_developer) {
        return res.status(403).json({ error: 'No puedes modificar a un administrador', code: 'FORBIDDEN' });
      }
      next();
    }).catch(err => res.status(500).json({ error: err.message }));
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

module.exports = { generateToken, generateRefreshToken, hashRefreshToken, validateToken, requireTesseractAdmin, requireMasterAdmin, enforceOfficeFilter, requireOfficeScoped, checkSubscription };
