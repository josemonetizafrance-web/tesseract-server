require('dotenv').config({ path: '.env' });
const { MongoClient } = require('mongodb');
const bcrypt = require('bcryptjs');

async function createAdmin() {
  const client = new MongoClient(process.env.MONGODB_URI);
  
  try {
    await client.connect();
    const db = client.db();
    
    const adminEmail = process.env.TESS_ADMIN_EMAIL || 'adminchevy@tesseract.com';
    const adminPassword = process.env.TESS_ADMIN_PASSWORD || 'AdminSegura2026*+';
    const passwordHash = bcrypt.hashSync(adminPassword, 12);
    
    // Verificar si ya existe
    const existing = await db.collection('tess_users').findOne({ email: adminEmail.toLowerCase() });
    
    if (existing) {
      console.log('⚠️ Admin ya existe');
      
      // Verificar contraseña
      if (bcrypt.compareSync(adminPassword, existing.password_hash)) {
        console.log('✅ Contraseña correcta');
      } else {
        console.log('❌ Contraseña incorrecta, actualizando...');
        await db.collection('tess_users').updateOne(
          { email: adminEmail.toLowerCase() },
          { $set: { password_hash: passwordHash } }
        );
        console.log('✅ Contraseña actualizada');
      }
    } else {
      // Crear admin
      const now = Date.now();
      const result = await db.collection('tess_users').insertOne({
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
      
      console.log('✅ Admin creado:', result.insertedId);
    }
    
  } catch (e) {
    console.error('❌ Error:', e.message);
  } finally {
    await client.close();
  }
}

createAdmin();