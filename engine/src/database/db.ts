import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { DB_PATH } from '../config/index.js';
import { logger } from '../utils/logger.js';
import { SCHEMA_SQL } from './schema.js';

let instance: Database.Database | null = null;

/**
 * Conexão única com o SQLite. O schema é aplicado na primeira chamada,
 * então não existe passo de migração manual.
 */
export function getDb(): Database.Database {
  if (instance) return instance;

  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA_SQL);

  logger.debug(`SQLite pronto em ${DB_PATH}`);
  instance = db;
  return instance;
}

export function closeDb(): void {
  if (!instance) return;
  instance.close();
  instance = null;
}
