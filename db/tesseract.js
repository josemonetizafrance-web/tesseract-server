/**
 * TESSERACT Database - MongoDB Version
 * Replaces SQLite with MongoDB Atlas for persistence
 */
const { MongoClient, ObjectId } = require('mongodb');
const bcrypt = require('bcryptjs');

let db = null;
let client = null;

// NOTE: MONGODB_URI debe estar en .env - NO hardcodear credenciales aquí
const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error('❌ Error: Define MONGODB_URI en el archivo .env');
  console.error('   Ejemplo: mongodb+srv://usuario:password@cluster.mongodb.net/tesseract');
  process.exit(1);
}

async function connectMongo() {
  try {
    client = new MongoClient(MONGODB_URI, { maxPoolSize: 10, serverSelectionTimeoutMS: 5000 });
    await client.connect();
    db = client.db('tesseract');
    console.log('✅ Conectado a MongoDB Atlas');
    return db;
  } catch (err) {
    console.error('❌ Error conectando a MongoDB:', err.message);
    throw err;
  }
}

async function initDb() {
  await connectMongo();
  
  // Crear índices
  await db.collection('tess_users').createIndex({ email: 1 }, { unique: true });
  await db.collection('tess_offices').createIndex({ name: 1 }, { unique: true });
  await db.collection('tess_activity_log').createIndex({ created_at: -1 });
  await db.collection('tess_metrics_daily').createIndex({ user_id: 1, date: 1 });
  await db.collection('tess_metrics_monthly').createIndex({ user_id: 1, month: 1 });
  await db.collection('tess_collected_ids').createIndex({ user_id: 1 });
  await db.collection('tess_auto_answer_templates').createIndex({ user_id: 1, event_type: 1 });
  await db.collection('tess_auto_answer_daily').createIndex({ user_id: 1, date: 1 });
  await db.collection('tess_mailing_daily').createIndex({ user_id: 1, date: 1 });
  await db.collection('tess_notes').createIndex({ user_id: 1 });
  await db.collection('tess_notes').createIndex({ shared_with: 1 });
  await db.collection('tess_cribs').createIndex({ user_id: 1, updated_at: -1 });
  await db.collection('tess_sync_history').createIndex({ email: 1 }, { unique: true });
  await db.collection('tess_sync_config').createIndex({ email: 1, configKey: 1 }, { unique: true });
  await db.collection('tess_sync_activity_log').createIndex({ email: 1 }, { unique: true });

  // Crear usuario admin si no existe (solo si están definidos en .env)
  const adminEmail = process.env.TESS_ADMIN_EMAIL;
  const adminPass = process.env.TESS_ADMIN_PASSWORD;
  
  if (!adminEmail || !adminPass) {
    console.log('⚠️  Admin no creado: define TESS_ADMIN_EMAIL y TESS_ADMIN_PASSWORD en .env');
  } else {
  
  const existingAdmin = await db.collection('tess_users').findOne({ email: adminEmail });
  if (!existingAdmin) {
    const hash = bcrypt.hashSync(adminPass, 12);
    await db.collection('tess_users').insertOne({
      email: adminEmail,
      password_hash: hash,
      role: 'developer',
      is_admin: 1,
      is_developer: 1,
      is_banned: 0,
      is_approved: 1,
      is_premium: 1,
      demo_expiry: null,
      premium_expiry: null,
      login_count: 0,
      last_login: null,
      last_activity: Date.now(),
      office: null,
      is_office_admin: 0,
      created_at: Date.now()
    });
    console.log('✅ Admin creado:', adminEmail);
  } else {
    // Asegurar que el admin existente tenga is_approved y roles correctos
    await db.collection('tess_users').updateOne(
      { email: adminEmail },
      { $set: { is_approved: 1, is_admin: 1, is_developer: 1, role: 'developer', is_premium: 1 } }
    );
    console.log('✅ Admin verificado:', adminEmail);
  }
  }
   
  // Heartbeat cada 4 minutos para mantener conexión activa en free tier
  setInterval(async () => {
    try { await db.command({ ping: 1 }); } catch (e) {}
  }, 240000);

  console.log('✅ Base de datos MongoDB inicializada');
  return db;
}

// Helper functions
function toObjectId(id) {
  try {
    return new ObjectId(id);
  } catch (e) {
    return null;
  }
}

// Queries
async function findUserByEmail(email) {
  return await db.collection('tess_users').findOne({ email: email.toLowerCase() });
}

async function findUserById(id) {
  const objId = toObjectId(id);
  if (!objId) return null;
  return await db.collection('tess_users').findOne(
    { _id: objId },
    { projection: { password_hash: 0 } }
  );
}

async function createUser(email, passwordHash, demoExpiry) {
  const now = Date.now();
  const result = await db.collection('tess_users').insertOne({
    email: email.toLowerCase(),
    password_hash: passwordHash,
    role: 'demo',
    is_admin: 0,
    is_developer: 0,
    is_banned: 0,
    is_approved: 1, // Por defecto aprobado para usuarios existentes
    is_premium: 0,
    demo_expiry: demoExpiry,
    premium_expiry: null,
    login_count: 1,
    last_login: now,
    last_activity: now,
    office: null,
    is_office_admin: 0,
    created_at: now
  });
  return result.insertedId;
}

async function createUserPending(email, passwordHash, demoExpiry) {
  const now = Date.now();
  const result = await db.collection('tess_users').insertOne({
    email: email.toLowerCase(),
    password_hash: passwordHash,
    role: 'demo',
    is_admin: 0,
    is_developer: 0,
    is_banned: 0,
    is_approved: 0, // Pendiente de aprobación
    is_premium: 0,
    demo_expiry: demoExpiry,
    premium_expiry: null,
    login_count: 0,
    last_login: null,
    last_activity: now,
    office: null,
    is_office_admin: 0,
    created_at: now
  });
  return result.insertedId;
}

// Blacklist functions
async function getBlacklist(userId) {
  try {
    const objId = toObjectId(userId);
    if (!objId) return [];
    const user = await db.collection('tess_users').findOne({ _id: objId }, { projection: { blacklist: 1 } });
    return user?.blacklist || [];
  } catch (err) {
    console.error('[DB] getBlacklist error:', err.message);
    return [];
  }
}

async function addToBlacklist(userId, contactId) {
  try {
    const objId = toObjectId(userId);
    if (!objId) return false;
    await db.collection('tess_users').updateOne(
      { _id: objId },
      { $addToSet: { blacklist: contactId } }
    );
    return true;
  } catch (err) {
    console.error('[DB] addToBlacklist error:', err.message);
    return false;
  }
}

async function removeFromBlacklist(userId, contactId) {
  try {
    const objId = toObjectId(userId);
    if (!objId) return false;
    await db.collection('tess_users').updateOne(
      { _id: objId },
      { $pull: { blacklist: contactId } }
    );
    return true;
  } catch (err) {
    console.error('[DB] removeFromBlacklist error:', err.message);
    return false;
  }
}

async function isInBlacklist(userId, contactId) {
  const list = await getBlacklist(userId);
  return list.includes(contactId);
}

async function syncBlacklist(userId, ids) {
  try {
    const objId = toObjectId(userId);
    if (!objId) return false;
    const normalized = ids.map(id => String(id).trim()).filter(id => id.length > 0);
    await db.collection('tess_users').updateOne(
      { _id: objId },
      { $set: { blacklist: normalized } }
    );
    return true;
  } catch (err) {
    console.error('[DB] syncBlacklist error:', err.message);
    return false;
  }
}

async function updateLoginStats(userId) {
  const objId = toObjectId(userId);
  if (!objId) return;
  await db.collection('tess_users').updateOne(
    { _id: objId },
    { $inc: { login_count: 1 }, $set: { last_login: Date.now() } }
  );
}

async function updateLastActivity(userId, timestamp) {
  const objId = toObjectId(userId);
  if (!objId) return;
  await db.collection('tess_users').updateOne(
    { _id: objId },
    { $set: { last_activity: timestamp } }
  );
}

async function updateUserPremium(userId, premiumExpiry) {
  const objId = toObjectId(userId);
  if (!objId) return;
  await db.collection('tess_users').updateOne(
    { _id: objId },
    { $set: { role: 'premium', premium_expiry: premiumExpiry } }
  );
}

async function setUserBan(userId, banned) {
  const objId = toObjectId(userId);
  if (!objId) return;
  await db.collection('tess_users').updateOne(
    { _id: objId },
    { $set: { is_banned: banned ? 1 : 0 } }
  );
}

async function setUserDeveloper(userId, isDev) {
  const objId = toObjectId(userId);
  if (!objId) return;
  await db.collection('tess_users').updateOne(
    { _id: objId },
    { $set: { role: isDev ? 'developer' : 'demo', is_developer: isDev ? 1 : 0, is_admin: isDev ? 1 : 0 } }
  );
}

async function updateUserPassword(userId, passwordHash) {
  const objId = toObjectId(userId);
  if (!objId) return;
  await db.collection('tess_users').updateOne(
    { _id: objId },
    { $set: { password_hash: passwordHash } }
  );
}

async function updateUserApproved(email, approved) {
  await db.collection('tess_users').updateOne(
    { email: email.toLowerCase() },
    { $set: { is_approved: approved ? 1 : 0 } }
  );
}

async function setUserCustomPlan(userId, plan) {
  const objId = toObjectId(userId);
  if (!objId) return;
  await db.collection('tess_users').updateOne(
    { _id: objId },
    { $set: { role: plan } }
  );
}

async function deleteUser(userId) {
  const objId = toObjectId(userId);
  if (!objId) return;
  await db.collection('tess_users').deleteOne({ _id: objId });
}

async function getAllUsers() {
  return await db.collection('tess_users')
    .find({}, { projection: { password_hash: 0 } })
    .sort({ created_at: -1 })
    .toArray();
}

async function logActivity(userId, email, action, actionType = null, details = null) {
  await db.collection('tess_activity_log').insertOne({
    user_id: String(userId),
    email: email,
    action: action,
    action_type: actionType,
    details: details,
    created_at: Date.now()
  });
}

async function getRecentActivity(limit = 100) {
  const pipeline = [
    { $sort: { created_at: -1 } },
    { $limit: limit },
    {
      $lookup: {
        from: 'tess_users',
        let: { uid: '$user_id' },
        pipeline: [
          { $match: { $expr: { $eq: [{ $toString: '$_id' }, '$$uid'] } } }
        ],
        as: 'user'
      }
    },
    { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
    { $project: { email: 1, action: 1, action_type: 1, details: 1, created_at: 1, office: '$user.office' } }
  ];
  return await db.collection('tess_activity_log').aggregate(pipeline).toArray();
}

async function getRecentBotActions(limit = 50) {
  const BOT_ACTIONS = ['CARTAS', 'LFP', 'L+F+P', 'PERIODIC_SYNC', 'BLACKLIST', 'MAILING', 'AUTO_ANSWER', 'LFP_UNIFICADO'];
  const pipeline = [
    { $match: { action: { $in: BOT_ACTIONS } } },
    { $sort: { created_at: -1 } },
    { $limit: limit },
    {
      $lookup: {
        from: 'tess_users',
        let: { uid: '$user_id' },
        pipeline: [
          { $match: { $expr: { $eq: [{ $toString: '$_id' }, '$$uid'] } } }
        ],
        as: 'user'
      }
    },
    { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
    { $project: { email: 1, action: 1, action_type: 1, details: 1, created_at: 1, office: '$user.office' } }
  ];
  return await db.collection('tess_activity_log').aggregate(pipeline).toArray();
}

async function upsertDailyMetric(userId, date, stats, now, office = null) {
  const objId = toObjectId(userId);
  if (!objId) return;
  await db.collection('tess_metrics_daily').updateOne(
    { user_id: objId, date: date },
    { 
      $set: {
        messagesSent: stats?.messagesSent || 0,
        likes: stats?.likesGiven || 0,
        follows: stats?.followsGiven || 0,
        cartas: stats?.cartasSent || 0,
        sweeps: stats?.contactsProcessed || 0,
        auto_response: stats?.autoResponse || 0,
        mailing: stats?.mailingSent || 0,
        office: office || null,
        updated_at: now
      }
    },
    { upsert: true }
  );
}

async function upsertMonthlyMetric(userId, month, stats, now) {
  const objId = toObjectId(userId);
  if (!objId) return;
  await db.collection('tess_metrics_monthly').updateOne(
    { user_id: objId, month: month },
    { 
      $max: {
        messagesSent: stats?.messagesSent || 0,
        likes: stats?.likesGiven || 0,
        follows: stats?.followsGiven || 0,
        cartas: stats?.cartasSent || 0,
        sweeps: stats?.contactsProcessed || 0,
        auto_response: stats?.autoResponse || 0,
        mailing: stats?.mailingSent || 0
      },
      $set: {
        updated_at: now
      }
    },
    { upsert: true }
  );
}

async function insertCollectedId(userId, clientId, category, now) {
  const objId = toObjectId(userId);
  if (!objId) return;
  try {
    await db.collection('tess_collected_ids').updateOne(
      { user_id: objId, client_id: String(clientId), category: category },
      { $set: { created_at: now } },
      { upsert: true }
    );
  } catch (e) {}
}

async function getMetricsOverview() {
  const users = db.collection('tess_users');
  const metricsDaily = db.collection('tess_metrics_daily');
  const metricsMonthly = db.collection('tess_metrics_monthly');
  
  const today = new Date().toISOString().slice(0, 10);
  const month = new Date().toISOString().slice(0, 7);
  
  const total = await users.countDocuments();
  const yesterday = Date.now() - 86400000;
  const active = await users.countDocuments({ last_login: { $gt: yesterday } });
  const demo = await users.countDocuments({ role: 'demo' });
  const premium = await users.countDocuments({ role: 'premium' });
  const devs = await users.countDocuments({ role: 'developer' });
  
  const t = await metricsDaily.aggregate([
    { $match: { date: today } },
    { $group: { 
      _id: null, 
      messagesSent: { $sum: '$messagesSent' },
      likes: { $sum: '$likes' },
      follows: { $sum: '$follows' },
      cartas: { $sum: '$cartas' },
      sweeps: { $sum: '$sweeps' },
      auto_response: { $sum: '$auto_response' },
      mailing: { $sum: '$mailing' }
    }}
  ]).toArray();
  const todayStart = new Date(today + 'T00:00:00.000Z').getTime();
  const todayEnd = new Date(today + 'T23:59:59.999Z').getTime();
  const todayIdsCount = await db.collection('tess_collected_ids').countDocuments({ created_at: { $gte: todayStart, $lte: todayEnd } });
  
  const m = await metricsMonthly.aggregate([
    { $match: { month: month } },
    { $group: { 
      _id: null, 
      messagesSent: { $sum: '$messagesSent' },
      likes: { $sum: '$likes' },
      follows: { $sum: '$follows' },
      cartas: { $sum: '$cartas' },
      sweeps: { $sum: '$sweeps' },
      auto_response: { $sum: '$auto_response' },
      mailing: { $sum: '$mailing' }
    }}
  ]).toArray();
  
  const tt = t[0] || {};
  const mm = m[0] || {};
  
  return {
    users: { total, active, demo, premium, developers: devs },
    today: { 
      icebreakers: tt.messagesSent || 0, 
      likes: tt.likes || 0, 
      follows: tt.follows || 0, 
      cartas: tt.cartas || 0, 
      sweeps: tt.sweeps || 0, 
      auto_response: tt.auto_response || 0,
      mailing: tt.mailing || 0,
      ids_captured: todayIdsCount 
    },
    month: { 
      icebreakers: mm.messagesSent || 0, 
      likes: mm.likes || 0, 
      follows: mm.follows || 0, 
      cartas: mm.cartas || 0, 
      sweeps: mm.sweeps || 0,
      auto_response: mm.auto_response || 0,
      mailing: mm.mailing || 0
    }
  };
}

async function getMyMetrics(userId) {
  const objId = toObjectId(userId);
  if (!objId) return { daily: null, monthly: null, idsByCategory: [], totalIds: 0 };
  
  const today = new Date().toISOString().slice(0, 10);
  const month = new Date().toISOString().slice(0, 7);
  
  const daily = await db.collection('tess_metrics_daily').findOne({ user_id: objId, date: today });
  const monthly = await db.collection('tess_metrics_monthly').findOne({ user_id: objId, month: month });
  const idsByCategory = await db.collection('tess_collected_ids').aggregate([
    { $match: { user_id: objId } },
    { $group: { _id: '$category', count: { $sum: 1 } } }
  ]).toArray();
  const totalIds = await db.collection('tess_collected_ids').countDocuments({ user_id: objId });
  
  return { daily, monthly, idsByCategory, totalIds };
}

async function updateUserOffice(userId, office) {
  const objId = toObjectId(userId);
  if (!objId) return;
  await db.collection('tess_users').updateOne({ _id: objId }, { $set: { office: office } });
}

async function storeRefreshToken(userId, tokenHash, expiresAt) {
  const objId = toObjectId(userId);
  if (!objId) return false;
  await db.collection('tess_users').updateOne(
    { _id: objId },
    { $set: { refresh_token_hash: tokenHash, refresh_token_expiry: expiresAt } }
  );
  return true;
}

async function revokeRefreshToken(userId) {
  const objId = toObjectId(userId);
  if (!objId) return false;
  await db.collection('tess_users').updateOne(
    { _id: objId },
    { $unset: { refresh_token_hash: '', refresh_token_expiry: '' } }
  );
  return true;
}

async function getUsersByOffice(office) {
  if (!office || office === 'all') return getAllUsers();
  return await db.collection('tess_users')
    .find({ office: office }, { projection: { password_hash: 0 } })
    .sort({ created_at: -1 })
    .toArray();
}

async function getUsersWithMetrics(office) {
  const users = office && office !== 'all' ? await getUsersByOffice(office) : await getAllUsers();
  if (!users || !users.length) return [];
  const today = new Date().toISOString().slice(0, 10);
  const userIds = users.map(u => u._id);
  const metrics = await db.collection('tess_metrics_daily').find({
    user_id: { $in: userIds },
    date: today
  }).toArray();
  const metricsMap = {};
  metrics.forEach(function (m) { metricsMap[m.user_id.toString()] = m; });
  return users.map(function (u) {
    const m = metricsMap[u._id.toString()] || {};
    return {
      _id: u._id,
      email: u.email,
      office: u.office,
      role: u.role,
      is_banned: u.is_banned,
      is_developer: u.is_developer,
      is_admin: u.is_admin,
      is_office_admin: u.is_office_admin,
      premium_expiry: u.premium_expiry,
      login_count: u.login_count,
      last_login: u.last_login,
      last_activity: u.last_activity,
      created_at: u.created_at,
      metrics_today: {
        likes: m.likes || 0,
        follows: m.follows || 0,
        auto_response: m.auto_response || 0,
        mailing: m.mailing || 0,
        sweeps: m.sweeps || 0
      }
    };
  });
}

async function getMetricsByOffice(office) {
  let users = [];
  if (office && office !== 'all') {
    users = await db.collection('tess_users')
      .find({ office: office }, { projection: { _id: 1 } })
      .toArray();
  } else {
    users = await db.collection('tess_users')
      .find({}, { projection: { _id: 1 } })
      .toArray();
  }
  
  if (users.length === 0) {
    return { users: { total: 0, active: 0, demo: 0, premium: 0, developers: 0 }, today: {}, month: {} };
  }
  
  const userIds = users.map(u => u._id);
  const today = new Date().toISOString().slice(0, 10);
  const month = new Date().toISOString().slice(0, 7);
  const yesterday = Date.now() - 86400000;
  
  const total = users.length;
  const active = await db.collection('tess_users').countDocuments({ _id: { $in: userIds }, last_login: { $gt: yesterday } });
  const demo = await db.collection('tess_users').countDocuments({ _id: { $in: userIds }, role: 'demo' });
  const premium = await db.collection('tess_users').countDocuments({ _id: { $in: userIds }, role: 'premium' });
  const devs = await db.collection('tess_users').countDocuments({ _id: { $in: userIds }, role: 'developer' });
  
  const t = await db.collection('tess_metrics_daily').aggregate([
    { $match: { date: today, user_id: { $in: userIds } } },
    { $group: { 
      _id: null, 
      messagesSent: { $sum: '$messagesSent' },
      likes: { $sum: '$likes' },
      follows: { $sum: '$follows' },
      cartas: { $sum: '$cartas' },
      sweeps: { $sum: '$sweeps' },
      auto_response: { $sum: '$auto_response' },
      mailing: { $sum: '$mailing' },
      ids_captured: { $sum: '$ids_captured' }
    }}
  ]).toArray();
  
  const m = await db.collection('tess_metrics_monthly').aggregate([
    { $match: { month: month, user_id: { $in: userIds } } },
    { $group: { 
      _id: null, 
      messagesSent: { $sum: '$messagesSent' },
      likes: { $sum: '$likes' },
      follows: { $sum: '$follows' },
      cartas: { $sum: '$cartas' },
      sweeps: { $sum: '$sweeps' },
      auto_response: { $sum: '$auto_response' },
      mailing: { $sum: '$mailing' }
    }}
  ]).toArray();
  
  const tt = t[0] || {};
  const mm = m[0] || {};
  
  return {
    users: { total, active, demo, premium, developers: devs },
    today: { 
      icebreakers: tt.messagesSent || 0, 
      likes: tt.likes || 0, 
      follows: tt.follows || 0, 
      cartas: tt.cartas || 0, 
      sweeps: tt.sweeps || 0,
      auto_response: tt.auto_response || 0,
      mailing: tt.mailing || 0,
      ids_captured: tt.ids_captured || 0 
    },
    month: { 
      icebreakers: mm.messagesSent || 0, 
      likes: mm.likes || 0, 
      follows: mm.follows || 0, 
      cartas: mm.cartas || 0, 
      sweeps: mm.sweeps || 0,
      auto_response: mm.auto_response || 0,
      mailing: mm.mailing || 0
    }
  };
}

async function getActivityByOffice(office, limit = 100) {
  let users = [];
  if (office && office !== 'all') {
    users = await db.collection('tess_users')
      .find({ office: office }, { projection: { _id: 1 } })
      .toArray();
  }
  
  if (users.length === 0) {
    return getRecentActivity(limit);
  }
  
  // Convertir ObjectId a string para que coincida con user_id almacenado como string
  const userIds = users.map(u => u._id.toString());
  const pipeline = [
    { $match: { user_id: { $in: userIds } } },
    { $sort: { created_at: -1 } },
    { $limit: limit },
    {
      $lookup: {
        from: 'tess_users',
        let: { uid: '$user_id' },
        pipeline: [
          { $match: { $expr: { $eq: [{ $toString: '$_id' }, '$$uid'] } } }
        ],
        as: 'user'
      }
    },
    { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
    { $project: { email: 1, action: 1, action_type: 1, details: 1, created_at: 1, office: '$user.office' } }
  ];
  return await db.collection('tess_activity_log').aggregate(pipeline).toArray();
}

async function clearActivityLog(userId, isMaster) {
  if (isMaster) {
    return await db.collection('tess_activity_log').deleteMany({});
  }
  const uidStr = String(userId);
  const uidObj = toObjectId(userId);
  const orClause = [{ user_id: uidStr }];
  if (uidObj) orClause.push({ user_id: uidObj });
  return await db.collection('tess_activity_log').deleteMany({ $or: orClause });
}

async function clearActivityLogByOffice(office) {
  const users = await db.collection('tess_users')
    .find({ office: office }, { projection: { _id: 1 } })
    .toArray();
  if (users.length === 0) return { deletedCount: 0 };
  const userIds = users.map(u => u._id.toString());
  const result = await db.collection('tess_activity_log').deleteMany({ user_id: { $in: userIds } });
  return result;
}

async function createOffice(name, createdByUserId) {
  const existing = await db.collection('tess_offices').findOne({ name: name });
  if (existing) return null;
  
  const result = await db.collection('tess_offices').insertOne({
    name: name,
    created_by: toObjectId(createdByUserId),
    created_at: Date.now()
  });
  return result.insertedId;
}

async function getAllOffices() {
  return await db.collection('tess_offices')
    .find({})
    .sort({ created_at: -1 })
    .toArray();
}

async function deleteOffice(name) {
  await db.collection('tess_users').updateMany({ office: name }, { $set: { office: null, is_office_admin: 0 } });
  await db.collection('tess_offices').deleteOne({ name: name });
}

async function setUserOfficeAdmin(userId, isAdmin) {
  const objId = toObjectId(userId);
  if (!objId) return;
  await db.collection('tess_users').updateOne({ _id: objId }, { $set: { is_office_admin: isAdmin ? 1 : 0 } });
}

async function getUserOffice(userId) {
  const user = await findUserById(userId);
  return user?.office || null;
}

async function isUserOfficeAdmin(userId) {
  const user = await findUserById(userId);
  return user?.is_office_admin === 1;
}

async function startSession(userId) {
  const objId = toObjectId(userId);
  if (!objId) return null;
  const now = Date.now();
  const today = new Date().toISOString().slice(0, 10);
  const result = await db.collection('tess_user_sessions').insertOne({
    user_id: objId,
    start_time: now,
    date: today
  });
  return result.insertedId;
}

async function endSession(userId, sessionId) {
  const objId = toObjectId(sessionId);
  if (!objId) return;
  const now = Date.now();
  const session = await db.collection('tess_user_sessions').findOne({ _id: objId });
  if (session) {
    const duration = now - session.start_time;
    await db.collection('tess_user_sessions').updateOne(
      { _id: objId },
      { $set: { end_time: now, duration_ms: duration } }
    );
  }
}

async function getUserSessions(userId, limit = 10) {
  const objId = toObjectId(userId);
  if (!objId) return [];
  return await db.collection('tess_user_sessions')
    .find({ user_id: objId })
    .sort({ start_time: -1 })
    .limit(limit)
    .toArray();
}

async function getTotalTimeByUser(userId) {
  const objId = toObjectId(userId);
  if (!objId) return 0;
  const result = await db.collection('tess_user_sessions').aggregate([
    { $match: { user_id: objId } },
    { $group: { _id: null, total: { $sum: '$duration_ms' } } }
  ]).toArray();
  return result[0]?.total || 0;
}

async function getTotalTimeByOffice(office) {
  if (!office) return 0;
  const users = await db.collection('tess_users')
    .find({ office: office }, { projection: { _id: 1 } })
    .toArray();
  if (!users.length) return 0;
  const userIds = users.map(u => u._id);
  const result = await db.collection('tess_user_sessions').aggregate([
    { $match: { user_id: { $in: userIds } } },
    { $group: { _id: null, total: { $sum: '$duration_ms' } } }
  ]).toArray();
  return result[0]?.total || 0;
}

// Notes functions
async function createNote(userId, profileName, clientName, clientId, noteText) {
  const objId = toObjectId(userId);
  if (!objId) return null;
  const now = Date.now();
  const result = await db.collection('tess_notes').insertOne({
    user_id: objId,
    profile_name: profileName,
    client_name: clientName,
    client_id: clientId,
    note_text: noteText,
    shared_with: [],
    created_at: now,
    updated_at: now
  });
  return result.insertedId;
}

async function getUserNotes(userId) {
  const objId = toObjectId(userId);
  if (!objId) return [];
  return await db.collection('tess_notes')
    .find({ user_id: objId })
    .sort({ updated_at: -1 })
    .toArray();
}

async function getNotesSharedWithUser(userId) {
  const objId = toObjectId(userId);
  if (!objId) return [];
  return await db.collection('tess_notes')
    .find({ shared_with: objId })
    .sort({ updated_at: -1 })
    .toArray();
}

async function updateNote(noteId, userId, updates) {
  const objId = toObjectId(noteId);
  const userObjId = toObjectId(userId);
  if (!objId || !userObjId) return false;
  const setFields = {};
  if (updates.profile_name !== undefined) setFields.profile_name = updates.profile_name;
  if (updates.client_name !== undefined) setFields.client_name = updates.client_name;
  if (updates.client_id !== undefined) setFields.client_id = updates.client_id;
  if (updates.note_text !== undefined) setFields.note_text = updates.note_text;
  setFields.updated_at = Date.now();
  const result = await db.collection('tess_notes').updateOne(
    { _id: objId, user_id: userObjId },
    { $set: setFields }
  );
  return result.modifiedCount > 0;
}

async function deleteNote(noteId, userId) {
  const objId = toObjectId(noteId);
  const userObjId = toObjectId(userId);
  if (!objId || !userObjId) return false;
  const result = await db.collection('tess_notes').deleteOne({ _id: objId, user_id: userObjId });
  return result.deletedCount > 0;
}

async function shareNoteWithUser(noteId, ownerUserId, targetUserId) {
  const noteObjId = toObjectId(noteId);
  const ownerObjId = toObjectId(ownerUserId);
  const targetObjId = toObjectId(targetUserId);
  if (!noteObjId || !ownerObjId || !targetObjId) return false;
  const result = await db.collection('tess_notes').updateOne(
    { _id: noteObjId, user_id: ownerObjId },
    { $addToSet: { shared_with: targetObjId } }
  );
  return result.modifiedCount > 0;
}

async function unshareNote(noteId, ownerUserId, targetUserId) {
  const noteObjId = toObjectId(noteId);
  const ownerObjId = toObjectId(ownerUserId);
  const targetObjId = toObjectId(targetUserId);
  if (!noteObjId || !ownerObjId || !targetObjId) return false;
  const result = await db.collection('tess_notes').updateOne(
    { _id: noteObjId, user_id: ownerObjId },
    { $pull: { shared_with: targetObjId } }
  );
  return result.modifiedCount > 0;
}

async function getNoteById(noteId) {
  const objId = toObjectId(noteId);
  if (!objId) return null;
  return await db.collection('tess_notes').findOne({ _id: objId });
}

// Cribs functions
async function getCribs(userId) {
  const objId = toObjectId(userId);
  if (!objId) return [];
  return await db.collection('tess_cribs')
    .find({ user_id: objId })
    .sort({ updated_at: -1 })
    .toArray();
}

async function addCribEntry(userId, profileId) {
  const objId = toObjectId(userId);
  if (!objId) return null;
  const now = Date.now();
  const result = await db.collection('tess_cribs').insertOne({
    user_id: objId,
    profile_id: String(profileId).trim(),
    profile_name: '',
    country: '',
    city: '',
    age: null,
    interests: '',
    work: '',
    marital_status: '',
    traits: '',
    movie_genres: '',
    music_genres: '',
    goal: '',
    languages: '',
    education: '',
    looking_for: '',
    body_type: '',
    voice_style: '',
    letter_style: '',
    status: 'Nuevo',
    last_contact: null,
    preferred_template: 'default',
    quick_notes: '',
    priority: 'Media',
    created_at: now,
    updated_at: now
  });
  return result.insertedId;
}

async function updateCribField(entryId, userId, field, value) {
  const entryObjId = toObjectId(entryId);
  const userObjId = toObjectId(userId);
  if (!entryObjId || !userObjId) return false;
  const allowed = ['profile_name','country','age','interests','status','last_contact','preferred_template','quick_notes','priority','city','work','marital_status','traits','movie_genres','music_genres','goal','languages','education','looking_for','body_type','voice_style','letter_style'];
  if (!allowed.includes(field)) return false;
  const setFields = {};
  setFields[field] = value;
  setFields.updated_at = Date.now();
  const result = await db.collection('tess_cribs').updateOne(
    { _id: entryObjId, user_id: userObjId },
    { $set: setFields }
  );
  return result.matchedCount > 0;
}

async function deleteCribEntry(entryId, userId) {
  const entryObjId = toObjectId(entryId);
  const userObjId = toObjectId(userId);
  if (!entryObjId || !userObjId) return false;
  const result = await db.collection('tess_cribs').deleteOne({ _id: entryObjId, user_id: userObjId });
  return result.deletedCount > 0;
}

async function bulkUpdateCrib(entryId, userId, fields) {
  const entryObjId = toObjectId(entryId);
  const userObjId = toObjectId(userId);
  if (!entryObjId || !userObjId) return null;
  const allowed = ['profile_name','country','age','interests','status','last_contact','preferred_template','quick_notes','priority','city','work','marital_status','traits','movie_genres','music_genres','goal','languages','education','looking_for','body_type','voice_style','letter_style'];
  const setFields = {};
  let count = 0;
  for (const field in fields) {
    if (allowed.includes(field)) { setFields[field] = fields[field]; count++; }
  }
  if (count === 0) return null;
  setFields.updated_at = Date.now();
  const result = await db.collection('tess_cribs').updateOne(
    { _id: entryObjId, user_id: userObjId },
    { $set: setFields }
  );
  if (result.matchedCount === 0) return null;
  return result.modifiedCount;
}

async function findCribByProfileId(userId, profileId) {
  const objId = toObjectId(userId);
  if (!objId) return null;
  return await db.collection('tess_cribs').findOne({
    user_id: objId,
    profile_id: String(profileId).trim()
  });
}

// ============ SERVER SYNC FUNCTIONS ============
async function updateHistoryBatch(email, profileIds) {
  if (!email || !profileIds || !Array.isArray(profileIds) || profileIds.length === 0) return;
  await db.collection('tess_sync_history').updateOne(
    { email: email.toLowerCase() },
    { $addToSet: { profileIds: { $each: profileIds.map(String) } }, $set: { updatedAt: Date.now() } },
    { upsert: true }
  );
}

async function updateConfigSync(email, configKey, configData) {
  if (!email || !configKey) return;
  await db.collection('tess_sync_config').updateOne(
    { email: email.toLowerCase(), configKey },
    { $set: { configData: configData || {}, updatedAt: Date.now() } },
    { upsert: true }
  );
}

async function appendActivityLog(email, entry) {
  if (!email || !entry) return;
  await db.collection('tess_sync_activity_log').updateOne(
    { email: email.toLowerCase() },
    {
      $push: { entries: { $each: [entry], $slice: -5000 } },
      $set: { updatedAt: Date.now() }
    },
    { upsert: true }
  );
}

async function getHistory(email) {
  if (!email) return [];
  const doc = await db.collection('tess_sync_history').findOne({ email: email.toLowerCase() });
  return doc ? doc.profileIds : [];
}

async function getConfig(email, configKey) {
  if (!email || !configKey) return null;
  const doc = await db.collection('tess_sync_config').findOne({ email: email.toLowerCase(), configKey });
  return doc ? doc.configData : null;
}

// Exponer db para operaciones directas (usar con precaución)
function getDb() {
  if (!db) throw new Error('MongoDB no inicializada. Llama initDb() primero.');
  return db;
}

module.exports = {
  initDb, findUserByEmail, findUserById, createUser, createUserPending, updateLoginStats, updateLastActivity,
  updateUserPremium, setUserBan, setUserDeveloper, updateUserPassword, updateUserApproved, setUserCustomPlan, deleteUser,
  getAllUsers, logActivity, getRecentActivity, getRecentBotActions,
  upsertDailyMetric, upsertMonthlyMetric, insertCollectedId,
  getMetricsOverview, getMyMetrics,
  updateUserOffice, getUsersByOffice, getUsersWithMetrics, getMetricsByOffice, getActivityByOffice,
  createOffice, getAllOffices, deleteOffice, setUserOfficeAdmin,
  getUserOffice, isUserOfficeAdmin, clearActivityLog, clearActivityLogByOffice,
  startSession, endSession, getUserSessions, getTotalTimeByUser,
  getTotalTimeByOffice,
        getBlacklist, addToBlacklist, removeFromBlacklist, isInBlacklist, syncBlacklist,
  createNote, getUserNotes, getNotesSharedWithUser, updateNote, deleteNote,
  shareNoteWithUser, unshareNote, getNoteById,
  getCribs, addCribEntry, updateCribField, deleteCribEntry, findCribByProfileId, bulkUpdateCrib,
  getDb,
  storeRefreshToken, revokeRefreshToken,
  updateHistoryBatch, updateConfigSync, appendActivityLog, getHistory, getConfig
};