const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');

const DB_PATH = path.join(__dirname, '..', 'tesseract.db');
let db = null;

function rows(execResult) {
  if (!execResult || !execResult[0]) return [];
  const { columns, values } = execResult[0];
  return values.map(v => {
    const o = {};
    columns.forEach((c, i) => { o[c] = v[i]; });
    return o;
  });
}

function row(execResult) {
  const r = rows(execResult);
  return r[0] || null;
}

function query(sql, params) {
  const stmt = db.prepare(sql);
  if (params) stmt.bind(params);
  const result = [];
  while (stmt.step()) result.push(stmt.getAsObject());
  stmt.free();
  return result;
}

function queryOne(sql, params) {
  const r = query(sql, params);
  return r[0] || null;
}

function exec(sql, params) {
  db.run(sql, params);
}

function save() {
  fs.writeFileSync(DB_PATH, Buffer.from(db.export()));
}

async function initDb() {
  const SQL = await initSqlJs();
  if (fs.existsSync(DB_PATH)) {
    db = new SQL.Database(fs.readFileSync(DB_PATH));
  } else {
    db = new SQL.Database();
  }
  db.run('PRAGMA journal_mode=WAL');
  db.run('PRAGMA foreign_keys=ON');
  exec(`CREATE TABLE IF NOT EXISTS tess_users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'demo',
    is_admin INTEGER NOT NULL DEFAULT 0,
    is_developer INTEGER NOT NULL DEFAULT 0,
    is_banned INTEGER NOT NULL DEFAULT 0,
    demo_expiry INTEGER,
    premium_expiry INTEGER,
    login_count INTEGER NOT NULL DEFAULT 0,
    last_login INTEGER,
    office TEXT,
    is_office_admin INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  )`);

  exec(`CREATE TABLE IF NOT EXISTS tess_offices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    created_by INTEGER,
    created_at INTEGER NOT NULL
  )`);
  exec(`CREATE TABLE IF NOT EXISTS tess_activity_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    email TEXT,
    action TEXT NOT NULL,
    action_type TEXT,
    details TEXT,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES tess_users(id) ON DELETE SET NULL
  )`);

  exec(`CREATE TABLE IF NOT EXISTS tess_user_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    start_time INTEGER NOT NULL,
    end_time INTEGER,
    duration_ms INTEGER DEFAULT 0,
    date TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES tess_users(id) ON DELETE CASCADE
  )`);
  exec(`CREATE TABLE IF NOT EXISTS tess_metrics_daily (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    date TEXT NOT NULL,
    icebreakers INTEGER DEFAULT 0,
    likes INTEGER DEFAULT 0,
    follows INTEGER DEFAULT 0,
    cartas INTEGER DEFAULT 0,
    sweeps INTEGER DEFAULT 0,
    ids_captured INTEGER DEFAULT 0,
    updated_at INTEGER,
    UNIQUE(user_id, date),
    FOREIGN KEY (user_id) REFERENCES tess_users(id) ON DELETE CASCADE
  )`);
  exec(`CREATE TABLE IF NOT EXISTS tess_metrics_monthly (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    month TEXT NOT NULL,
    icebreakers INTEGER DEFAULT 0,
    likes INTEGER DEFAULT 0,
    follows INTEGER DEFAULT 0,
    cartas INTEGER DEFAULT 0,
    sweeps INTEGER DEFAULT 0,
    updated_at INTEGER,
    UNIQUE(user_id, month),
    FOREIGN KEY (user_id) REFERENCES tess_users(id) ON DELETE CASCADE
  )`);
  exec(`CREATE TABLE IF NOT EXISTS tess_collected_ids (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    client_id TEXT NOT NULL,
    category TEXT NOT NULL CHECK(category IN ('Like','Follow','Saludo','Cartas')),
    created_at INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES tess_users(id) ON DELETE CASCADE
  )`);
  exec('CREATE INDEX IF NOT EXISTS idx_tess_activity_created ON tess_activity_log(created_at)');
  exec('CREATE INDEX IF NOT EXISTS idx_tess_metrics_daily ON tess_metrics_daily(user_id, date)');
  exec('CREATE INDEX IF NOT EXISTS idx_tess_metrics_monthly ON tess_metrics_monthly(user_id, month)');
  exec('CREATE INDEX IF NOT EXISTS idx_tess_collected_user ON tess_collected_ids(user_id)');

  const adminEmail = process.env.TESS_ADMIN_EMAIL || 'adminchevy@tesseract.com';
  const adminPass = process.env.TESS_ADMIN_PASSWORD || 'AdminSegura2026*+';
  const existing = queryOne('SELECT id FROM tess_users WHERE email = ?', [adminEmail]);
  if (!existing) {
    const hash = bcrypt.hashSync(adminPass, 12);
    exec(`INSERT INTO tess_users (email, password_hash, role, is_admin, is_developer, login_count, created_at) VALUES (?, ?, 'developer', 1, 1, 0, ?)`, [adminEmail, hash, Date.now()]);
    console.log('✅ Admin creado:', adminEmail);
  }
  save();
  console.log('✅ Base de datos SQLite inicializada');
  return db;
}

// Queries
function findUserByEmail(email) { return queryOne('SELECT * FROM tess_users WHERE email = ?', [email.toLowerCase()]); }
function findUserById(id) { return queryOne('SELECT id, email, role, is_admin, is_developer, is_office_admin, office, is_banned, demo_expiry, premium_expiry, login_count, last_login, created_at FROM tess_users WHERE id = ?', [id]); }

function createUser(email, passwordHash, demoExpiry) {
  const now = Date.now();
  exec(`INSERT INTO tess_users (email, password_hash, role, demo_expiry, login_count, last_login, created_at) VALUES (?, ?, 'demo', ?, 1, ?, ?)`, [email.toLowerCase(), passwordHash, demoExpiry, now, now]);
  save();
  const u = queryOne('SELECT id FROM tess_users WHERE email = ?', [email.toLowerCase()]);
  return u ? u.id : null;
}

function updateLoginStats(userId) { exec('UPDATE tess_users SET login_count = login_count + 1, last_login = ? WHERE id = ?', [Date.now(), userId]); save(); }
function updateUserPremium(userId, premiumExpiry) { exec("UPDATE tess_users SET role = 'premium', premium_expiry = ? WHERE id = ?", [premiumExpiry, userId]); save(); }
function setUserBan(userId, banned) { exec('UPDATE tess_users SET is_banned = ? WHERE id = ?', [banned ? 1 : 0, userId]); save(); }
function setUserDeveloper(userId, isDev) { exec('UPDATE tess_users SET role = ?, is_developer = ?, is_admin = ? WHERE id = ?', [isDev ? 'developer' : 'demo', isDev ? 1 : 0, isDev ? 1 : 0, userId]); save(); }
function updateUserPassword(userId, passwordHash) { exec('UPDATE tess_users SET password_hash = ? WHERE id = ?', [passwordHash, userId]); save(); }
function setUserCustomPlan(userId, plan) { exec('UPDATE tess_users SET role = ? WHERE id = ?', [plan, userId]); save(); }

function getAllUsers() {
  return query('SELECT id, email, role, is_admin, is_developer, is_banned, login_count, last_login, created_at, demo_expiry, premium_expiry FROM tess_users ORDER BY created_at DESC');
}

function logActivity(userId, email, action, actionType = null, details = null) { 
  exec('INSERT INTO tess_activity_log (user_id, email, action, action_type, details, created_at) VALUES (?, ?, ?, ?, ?, ?)', [userId, email, action, actionType, details, Date.now()]); 
  save(); 
}

function getRecentActivity(limit = 100) {
  return query('SELECT email, action, action_type, details, created_at FROM tess_activity_log ORDER BY created_at DESC LIMIT ?', [limit]);
}

function upsertDailyMetric(userId, date, stats, now) {
  const existing = queryOne('SELECT id FROM tess_metrics_daily WHERE user_id = ? AND date = ?', [userId, date]);
  if (existing) {
    exec('UPDATE tess_metrics_daily SET icebreakers=?, likes=?, follows=?, cartas=?, sweeps=?, ids_captured=?, updated_at=? WHERE user_id=? AND date=?',
      [stats?.messagesSent || 0, stats?.likesGiven || 0, stats?.followsGiven || 0, stats?.cartasSent || 0, stats?.contactsProcessed || 0, 0, now, userId, date]);
  } else {
    exec('INSERT INTO tess_metrics_daily (user_id, date, icebreakers, likes, follows, cartas, sweeps, ids_captured, updated_at) VALUES (?,?,?,?,?,?,?,?,?)',
      [userId, date, stats?.messagesSent || 0, stats?.likesGiven || 0, stats?.followsGiven || 0, stats?.cartasSent || 0, stats?.contactsProcessed || 0, 0, now]);
  }
  save();
}

function upsertMonthlyMetric(userId, month, stats, now) {
  const existing = queryOne('SELECT id FROM tess_metrics_monthly WHERE user_id = ? AND month = ?', [userId, month]);
  if (existing) {
    exec('UPDATE tess_metrics_monthly SET icebreakers=?, likes=?, follows=?, cartas=?, sweeps=?, updated_at=? WHERE user_id=? AND month=?',
      [stats?.messagesSent || 0, stats?.likesGiven || 0, stats?.followsGiven || 0, stats?.cartasSent || 0, stats?.contactsProcessed || 0, now, userId, month]);
  } else {
    exec('INSERT INTO tess_metrics_monthly (user_id, month, icebreakers, likes, follows, cartas, sweeps, updated_at) VALUES (?,?,?,?,?,?,?,?)',
      [userId, month, stats?.messagesSent || 0, stats?.likesGiven || 0, stats?.followsGiven || 0, stats?.cartasSent || 0, stats?.contactsProcessed || 0, now]);
  }
  save();
}

function insertCollectedId(userId, clientId, category, now) {
  try {
    exec('INSERT OR IGNORE INTO tess_collected_ids (user_id, client_id, category, created_at) VALUES (?, ?, ?, ?)', [userId, String(clientId), category, now]);
    save();
  } catch (e) {}
}

function getMetricsOverview() {
  const total = queryOne('SELECT COUNT(*) as c FROM tess_users').c;
  const active = queryOne('SELECT COUNT(*) as c FROM tess_users WHERE last_login > ?', [Date.now() - 86400000]).c;
  const demo = queryOne("SELECT COUNT(*) as c FROM tess_users WHERE role='demo'").c;
  const premium = queryOne("SELECT COUNT(*) as c FROM tess_users WHERE role='premium'").c;
  const devs = queryOne("SELECT COUNT(*) as c FROM tess_users WHERE role='developer'").c;
  const today = new Date().toISOString().slice(0, 10);
  const month = new Date().toISOString().slice(0, 7);
  const t = queryOne('SELECT SUM(icebreakers) as icebreakers, SUM(likes) as likes, SUM(follows) as follows, SUM(cartas) as cartas, SUM(sweeps) as sweeps, SUM(ids_captured) as ids_captured FROM tess_metrics_daily WHERE date=?', [today]) || {};
  const m = queryOne('SELECT SUM(icebreakers) as icebreakers, SUM(likes) as likes, SUM(follows) as follows, SUM(cartas) as cartas, SUM(sweeps) as sweeps, SUM(ids_captured) as ids_captured FROM tess_metrics_monthly WHERE month=?', [month]) || {};
  return {
    users: { total, active, demo, premium, developers: devs },
    today: { icebreakers: t.icebreakers || 0, likes: t.likes || 0, follows: t.follows || 0, cartas: t.cartas || 0, sweeps: t.sweeps || 0, ids_captured: t.ids_captured || 0 },
    month: { icebreakers: m.icebreakers || 0, likes: m.likes || 0, follows: m.follows || 0, cartas: m.cartas || 0, sweeps: m.sweeps || 0, ids_captured: m.ids_captured || 0 }
  };
}

function getMyMetrics(userId) {
  const today = new Date().toISOString().slice(0, 10);
  const month = new Date().toISOString().slice(0, 7);
  return {
    daily: queryOne('SELECT * FROM tess_metrics_daily WHERE user_id=? AND date=?', [userId, today]),
    monthly: queryOne('SELECT * FROM tess_metrics_monthly WHERE user_id=? AND month=?', [userId, month]),
    idsByCategory: query('SELECT category, COUNT(*) as count FROM tess_collected_ids WHERE user_id=? GROUP BY category', [userId]),
    totalIds: queryOne('SELECT COUNT(*) as count FROM tess_collected_ids WHERE user_id=?', [userId]).count
  };
}

function updateUserOffice(userId, office) {
  exec('UPDATE tess_users SET office=? WHERE id=?', [office, userId]);
  save();
}

function getUsersByOffice(office) {
  if (!office || office === 'all') return getAllUsers();
  return query('SELECT * FROM tess_users WHERE office=? ORDER BY created_at DESC', [office]);
}

function getMetricsByOffice(office) {
  let users = [];
  if (office && office !== 'all') {
    users = query('SELECT id FROM tess_users WHERE office=?', [office]).map(u => u.id);
  } else {
    users = query('SELECT id FROM tess_users').map(u => u.id);
  }
  if (users.length === 0) return { users: { total: 0, active: 0, demo: 0, premium: 0, developers: 0 }, today: {}, month: {} };
  const userIds = users.join(',');
  const today = new Date().toISOString().slice(0, 10);
  const month = new Date().toISOString().slice(0, 7);
  const total = users.length;
  const active = queryOne(`SELECT COUNT(*) as c FROM tess_users WHERE id IN (${userIds}) AND last_login > ?`, [Date.now() - 86400000]).c;
  const demo = queryOne(`SELECT COUNT(*) as c FROM tess_users WHERE id IN (${userIds}) AND role='demo'`).c;
  const premium = queryOne(`SELECT COUNT(*) as c FROM tess_users WHERE id IN (${userIds}) AND role='premium'`).c;
  const devs = queryOne(`SELECT COUNT(*) as c FROM tess_users WHERE id IN (${userIds}) AND role='developer'`).c;
  const t = queryOne(`SELECT SUM(icebreakers) as icebreakers, SUM(likes) as likes, SUM(follows) as follows, SUM(cartas) as cartas, SUM(sweeps) as sweeps, SUM(ids_captured) as ids_captured FROM tess_metrics_daily WHERE date=? AND user_id IN (${userIds})`, [today]) || {};
  const m = queryOne(`SELECT SUM(icebreakers) as icebreakers, SUM(likes) as likes, SUM(follows) as follows, SUM(cartas) as cartas, SUM(sweeps) as sweeps, SUM(ids_captured) as ids_captured FROM tess_metrics_monthly WHERE month=? AND user_id IN (${userIds})`, [month]) || {};
  return {
    users: { total, active, demo, premium, developers: devs },
    today: { icebreakers: t.icebreakers || 0, likes: t.likes || 0, follows: t.follows || 0, cartas: t.cartas || 0, sweeps: t.sweeps || 0, ids_captured: t.ids_captured || 0 },
    month: { icebreakers: m.icebreakers || 0, likes: m.likes || 0, follows: m.follows || 0, cartas: m.cartas || 0, sweeps: m.sweeps || 0, ids_captured: m.ids_captured || 0 }
  };
}

function getActivityByOffice(office, limit) {
  let users = [];
  if (office && office !== 'all') {
    users = query('SELECT id FROM tess_users WHERE office=?', [office]).map(u => u.id);
  }
  if (users.length === 0) return getRecentActivity(limit);
  const userIds = users.map(String).join(',');
  return query(`SELECT * FROM tess_activity_log WHERE user_id IN (${userIds}) ORDER BY created_at DESC LIMIT ?`, [limit]);
}

function createOffice(name, createdByUserId) {
  const existing = queryOne('SELECT id FROM tess_offices WHERE name=?', [name]);
  if (existing) return null;
  const now = Date.now();
  exec('INSERT INTO tess_offices (name, created_by, created_at) VALUES (?, ?, ?)', [name, createdByUserId, now]);
  save();
  return queryOne('SELECT id FROM tess_offices WHERE name=?', [name]).id;
}

function getAllOffices() {
  return query('SELECT * FROM tess_offices ORDER BY created_at DESC');
}

function deleteOffice(name) {
  const users = query('SELECT id FROM tess_users WHERE office=?', [name]);
  users.forEach(u => exec('UPDATE tess_users SET office=NULL, is_office_admin=0 WHERE id=?', [u.id]));
  exec('DELETE FROM tess_offices WHERE name=?', [name]);
  save();
}

function setUserOfficeAdmin(userId, isAdmin) {
  exec('UPDATE tess_users SET is_office_admin=? WHERE id=?', [isAdmin ? 1 : 0, userId]);
  save();
}

function getUserOffice(userId) {
  const user = findUserById(userId);
  return user?.office || null;
}

function isUserOfficeAdmin(userId) {
  const user = findUserById(userId);
  return user?.is_office_admin === 1;
}

function startSession(userId) {
  const now = Date.now();
  const today = new Date().toISOString().slice(0, 10);
  exec('INSERT INTO tess_user_sessions (user_id, start_time, date) VALUES (?, ?, ?)', [userId, now, today]);
  save();
  return queryOne('SELECT id FROM tess_user_sessions WHERE user_id=? AND end_time IS NULL ORDER BY id DESC', [userId])?.id;
}

function endSession(userId, sessionId) {
  const now = Date.now();
  const session = queryOne('SELECT start_time FROM tess_user_sessions WHERE id=?', [sessionId]);
  if (session) {
    const duration = now - session.start_time;
    exec('UPDATE tess_user_sessions SET end_time=?, duration_ms=? WHERE id=?', [now, duration, sessionId]);
    save();
  }
}

function getUserSessions(userId, limit = 10) {
  return query('SELECT * FROM tess_user_sessions WHERE user_id=? ORDER BY start_time DESC LIMIT ?', [userId, limit]);
}

function getTotalTimeByUser(userId) {
  const result = queryOne('SELECT SUM(duration_ms) as total FROM tess_user_sessions WHERE user_id=?', [userId]);
  return result?.total || 0;
}

function getTotalTimeByOffice(office) {
  if (!office) return 0;
  const users = query('SELECT id FROM tess_users WHERE office=?', [office]).map(u => u.id);
  if (!users.length) return 0;
  const ids = users.join(',');
  const result = queryOne(`SELECT SUM(duration_ms) as total FROM tess_user_sessions WHERE user_id IN (${ids})`);
  return result?.total || 0;
}

module.exports = {
  initDb, findUserByEmail, findUserById, createUser, updateLoginStats,
  updateUserPremium, setUserBan, setUserDeveloper, updateUserPassword, setUserCustomPlan,
  getAllUsers, logActivity, getRecentActivity,
  upsertDailyMetric, upsertMonthlyMetric, insertCollectedId,
  getMetricsOverview, getMyMetrics,
  updateUserOffice, getUsersByOffice, getMetricsByOffice, getActivityByOffice,
  createOffice, getAllOffices, deleteOffice, setUserOfficeAdmin,
  getUserOffice, isUserOfficeAdmin,
  startSession, endSession, getUserSessions, getTotalTimeByUser
};
