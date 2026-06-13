const fs = require('fs');
const path = require('path');

describe('Migration files', () => {
  test('migrations directory should contain at least one migration', () => {
    const migrationsDir = path.join(__dirname, '..', 'db', 'migrations');
    expect(fs.existsSync(migrationsDir)).toBe(true);
    const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.js'));
    expect(files.length).toBeGreaterThan(0);
  });

  test('each migration should export id, name, up, down', () => {
    const migrationsDir = path.join(__dirname, '..', 'db', 'migrations');
    const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.js')).sort();
    
    for (const file of files) {
      const migration = require(path.join(migrationsDir, file));
      expect(migration).toHaveProperty('id');
      expect(migration).toHaveProperty('name');
      expect(typeof migration.up).toBe('function');
      expect(typeof migration.down).toBe('function');
    }
  });
});

describe('Migrator module', () => {
  let migrator;

  beforeAll(() => {
    jest.isolateModules(() => {
      // Need to re-require because migrator does a require of fs at runtime
    });
  });

  beforeEach(() => {
    jest.resetModules();
  });

  test('should export runMigrations function', () => {
    const migratorModule = require('../db/migrator');
    expect(typeof migratorModule.runMigrations).toBe('function');
  });

  test('runMigrations should handle empty migrations', async () => {
    // Mock fs to return empty migrations list
    jest.mock('fs', () => ({
      ...jest.requireActual('fs'),
      existsSync: jest.fn().mockReturnValue(true),
      readdirSync: jest.fn().mockReturnValue([])
    }));
    
    const migratorModule = require('../db/migrator');
    const mockDb = {
      collection: jest.fn().mockReturnThis(),
      find: jest.fn().mockReturnThis(),
      sort: jest.fn().mockReturnThis(),
      toArray: jest.fn().mockResolvedValue([])
    };

    await expect(migratorModule.runMigrations(mockDb)).resolves.toBeUndefined();
  });
});

describe('Migration 001 - initial indexes', () => {
  test('should have id = 1 and name = initial-indexes', () => {
    const migration = require('../db/migrations/001-initial-indexes');
    expect(migration.id).toBe(1);
    expect(migration.name).toBe('initial-indexes');
  });

  test('up should call createIndex on collections', async () => {
    const migration = require('../db/migrations/001-initial-indexes');
    const createIndex = jest.fn().mockResolvedValue();
    const mockDb = {
      collection: jest.fn().mockReturnValue({ createIndex })
    };

    await migration.up(mockDb);
    expect(createIndex).toHaveBeenCalled();
    expect(mockDb.collection).toHaveBeenCalledWith('tess_users');
    expect(mockDb.collection).toHaveBeenCalledWith('tess_notes');
  });
});
