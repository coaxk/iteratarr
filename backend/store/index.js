import Database from 'better-sqlite3';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { mkdirSync, writeFileSync } from 'fs';

export function createStore(dbPathOrDir) {
  // Determine the actual database file path
  const dbPath = (dbPathOrDir.endsWith('.db') || dbPathOrDir.endsWith('.sqlite'))
    ? dbPathOrDir
    : join(dbPathOrDir, 'iteratarr.db');

  // Ensure parent directory exists
  const parentDir = dbPath.replace(/[/\\][^/\\]+$/, '');
  mkdirSync(parentDir, { recursive: true });

  const db = Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('auto_vacuum = INCREMENTAL');

  // Track which tables have been ensured so we only CREATE TABLE once per collection
  const ensuredTables = new Set();

  function ensureTable(collection) {
    if (ensuredTables.has(collection)) return;
    db.exec(`CREATE TABLE IF NOT EXISTS "${collection}" (
      id TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      created_at TEXT,
      updated_at TEXT
    )`);
    ensuredTables.add(collection);
  }

  return {
    async create(collection, data) {
      ensureTable(collection);
      const id = randomUUID();
      const now = new Date().toISOString();
      const record = { id, ...data, created_at: now, updated_at: now };
      const stmt = db.prepare(`INSERT INTO "${collection}" (id, data, created_at, updated_at) VALUES (?, ?, ?, ?)`);
      stmt.run(id, JSON.stringify(record), now, now);
      return record;
    },

    async get(collection, id) {
      ensureTable(collection);
      const stmt = db.prepare(`SELECT data FROM "${collection}" WHERE id = ?`);
      const row = stmt.get(id);
      if (!row) throw new Error(`${collection}/${id} not found`);
      return JSON.parse(row.data);
    },

    async update(collection, id, patch) {
      ensureTable(collection);
      const existing = await this.get(collection, id);
      const now = new Date().toISOString();
      const updated = { ...existing, ...patch, id, updated_at: now };
      const stmt = db.prepare(`UPDATE "${collection}" SET data = ?, updated_at = ? WHERE id = ?`);
      stmt.run(JSON.stringify(updated), now, id);
      return updated;
    },

    async list(collection, predicate) {
      ensureTable(collection);
      const stmt = db.prepare(`SELECT data FROM "${collection}"`);
      const rows = stmt.all();
      const records = rows.map(r => JSON.parse(r.data));
      return predicate ? records.filter(predicate) : records;
    },

    async delete(collection, id) {
      ensureTable(collection);
      const stmt = db.prepare(`DELETE FROM "${collection}" WHERE id = ?`);
      stmt.run(id);
    },

    async exportToJson(collection, outputDir) {
      ensureTable(collection);
      mkdirSync(outputDir, { recursive: true });
      const stmt = db.prepare(`SELECT data FROM "${collection}"`);
      const rows = stmt.all();
      let count = 0;
      for (const row of rows) {
        const record = JSON.parse(row.data);
        writeFileSync(join(outputDir, `${record.id}.json`), JSON.stringify(record, null, 2));
        count++;
      }
      return count;
    },

    async exportAllToJson(outputDir) {
      mkdirSync(outputDir, { recursive: true });
      // Get all table names from SQLite master that we manage
      const tables = db.prepare(
        `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`
      ).all().map(r => r.name);

      const counts = {};
      for (const table of tables) {
        const collectionDir = join(outputDir, table);
        counts[table] = await this.exportToJson(table, collectionDir);
      }
      return counts;
    },

    // Expose for cleanup in tests
    close() {
      db.close();
    }
  };
}
