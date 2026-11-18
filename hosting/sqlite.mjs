import { DatabaseSync } from 'node:sqlite';
import { mkdir, readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

class Statement {
  constructor(database, sql, values = []) {
    this.database = database;
    this.sql = sql;
    this.values = values;
  }
  bind(...values) { return new Statement(this.database, this.sql, values); }
  execute(mode) {
    const query = this.database.prepare(this.sql);
    if (mode === 'first') return query.get(...this.values) ?? null;
    if (mode === 'all') return { results: query.all(...this.values) };
    const result = query.run(...this.values);
    return { success: true, meta: { changes: Number(result.changes), last_row_id: Number(result.lastInsertRowid) } };
  }
  async first(column) {
    const row = this.execute('first');
    return column ? row?.[column] ?? null : row;
  }
  async all() { return this.execute('all'); }
  async run() { return this.execute('run'); }
}

export async function openDatabase(dataDir) {
  await mkdir(dataDir, { recursive: true });
  const database = new DatabaseSync(join(dataDir, 'last-round.sqlite'));
  database.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON;');
  database.exec('CREATE TABLE IF NOT EXISTS hosting_migrations (name TEXT PRIMARY KEY)');
  const folder = new URL('../drizzle/', import.meta.url);
  for (const name of (await readdir(folder)).filter(name => name.endsWith('.sql')).sort()) {
    if (database.prepare('SELECT name FROM hosting_migrations WHERE name=?').get(name)) continue;
    const sql = await readFile(new URL(name, folder), 'utf8');
    database.exec('BEGIN IMMEDIATE');
    try {
      database.exec(sql);
      database.prepare('INSERT INTO hosting_migrations(name) VALUES(?)').run(name);
      database.exec('COMMIT');
    } catch (error) { database.exec('ROLLBACK'); throw error; }
  }
  return {
    prepare(sql) { return new Statement(database, sql); },
    async batch(statements) {
      // 同步完成事务，避免异步等待时其他请求插入同一事务。
      database.exec('BEGIN IMMEDIATE');
      try {
        const results = statements.map(statement => statement.execute('run'));
        database.exec('COMMIT');
        return results;
      } catch (error) { database.exec('ROLLBACK'); throw error; }
    },
    close() { database.close(); },
  };
}
