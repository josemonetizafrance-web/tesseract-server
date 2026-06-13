// TESSERACT - MongoDB Migration System
// Tracks and runs schema migrations sequentially

const MIGRATIONS_COLLECTION = 'tess_migrations';

async function getAppliedMigrations(db) {
  try {
    const docs = await db.collection(MIGRATIONS_COLLECTION)
      .find({})
      .sort({ id: 1 })
      .toArray();
    return new Set(docs.map(d => d.id));
  } catch (e) {
    return new Set();
  }
}

async function markMigrationApplied(db, id, name) {
  await db.collection(MIGRATIONS_COLLECTION).insertOne({
    id,
    name,
    applied_at: new Date()
  });
}

async function runMigrations(db) {
  const applied = await getAppliedMigrations(db);
  const migrations = [];

  // Dynamically load all migration files
  const fs = require('fs');
  const path = require('path');
  const migrationsDir = path.join(__dirname, 'migrations');
  
  if (fs.existsSync(migrationsDir)) {
    const files = fs.readdirSync(migrationsDir)
      .filter(f => f.endsWith('.js'))
      .sort();
    
    for (const file of files) {
      const migration = require(path.join(migrationsDir, file));
      migrations.push(migration);
    }
  }

  let count = 0;
  for (const migration of migrations) {
    if (!applied.has(migration.id)) {
      console.log(`[MIGRATOR] Running migration ${migration.id}: ${migration.name}`);
      await migration.up(db);
      await markMigrationApplied(db, migration.id, migration.name);
      count++;
    }
  }

  if (count > 0) {
    console.log(`[MIGRATOR] Applied ${count} migration(s)`);
  } else {
    console.log('[MIGRATOR] No pending migrations');
  }
}

module.exports = { runMigrations };
