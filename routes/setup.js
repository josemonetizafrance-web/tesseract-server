// Setup endpoint - ejecutar una vez para crear admin (sin auth requerida)
const { Router } = require('express');
const bcrypt = require('bcryptjs');

const router = Router();

router.get('/api/tess/setup/init', async (req, res) => {
  // Usar la db directamente
  const db = req.app.locals.db;
  
  if (!db) {
    return res.status(500).json({ error: 'DB no disponible' });
  }
  
  const adminEmail = process.env.TESS_ADMIN_EMAIL || 'adminchevy@tesseract.com';
  const adminPassword = process.env.TESS_ADMIN_PASSWORD || 'AdminSegura2026*+';
  const passwordHash = bcrypt.hashSync(adminPassword, 12);
  
  try {
    const existing = await db.collection('tess_users').findOne({ email: adminEmail.toLowerCase() });
    
    if (existing) {
      return res.json({ message: 'Admin ya existe', email: adminEmail });
    }
    
    const now = Date.now();
    await db.collection('tess_users').insertOne({
      email: adminEmail.toLowerCase(),
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
    
    console.log('✅ Admin creado:', adminEmail);
    return res.json({ message: 'Admin creado', email: adminEmail });
  } catch (e) {
    console.error('Setup error:', e);
    return res.status(500).json({ error: e.message });
  }
});

module.exports = router;