const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || process.env.TESS_JWT_SECRET;

module.exports = function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }
  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = { email: decoded.email || decoded.uid };
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
};
