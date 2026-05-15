require('dotenv').config();
const { MongoClient } = require('mongodb');
const bcrypt = require('bcryptjs');

const MONGODB_URI = process.env.MONGODB_URI;

async function updateAdminPassword() {
  const client = new MongoClient(MONGODB_URI);
  try {
    await client.connect();
    const db = client.db('tesseract');
    
    const newPassword = 'AdminSegura2026*+';
    const hash = bcrypt.hashSync(newPassword, 12);
    
    const result = await db.collection('tess_users').updateOne(
      { email: 'adminchevy@tesseract.com' },
      { $set: { password_hash: hash, is_developer: 1, is_admin: 1 } }
    );
    
    console.log('✅ Admin actualizado:', result.modifiedCount, 'documento(s) modificado(s)');
  } catch (e) {
    console.error('❌ Error:', e.message);
  } finally {
    await client.close();
  }
}

updateAdminPassword();