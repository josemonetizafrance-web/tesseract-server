// Migration 001: Initial schema indexes
// Extracted from db/tesseract.js initDb()

const MIGRATION_ID = 1;
const MIGRATION_NAME = 'initial-indexes';

async function up(db) {
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
  console.log('[MIGRATION 001] Indexes created');
}

async function down(db) {
  await db.collection('tess_users').dropIndex('email_1');
  await db.collection('tess_offices').dropIndex('name_1');
  // Note: dropping indexes by name requires knowing the auto-generated name
  console.log('[MIGRATION 001] Indexes dropped (some may need manual cleanup)');
}

module.exports = { id: MIGRATION_ID, name: MIGRATION_NAME, up, down };
