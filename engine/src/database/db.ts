import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { DB_PATH } from '../config/index.js';
import { logger } from '../utils/logger.js';
import { OFFER_COLUMNS, SCHEMA_SQL } from './schema.js';

/** Adiciona colunas novas a bancos criados por versões anteriores do schema. */
function applyColumnMigrations(db: Database.Database): void {
  const existing = new Set(
    (db.prepare('PRAGMA table_info(offers)').all() as { name: string }[]).map((row) => row.name),
  );

  for (const column of OFFER_COLUMNS) {
    if (existing.has(column.name)) continue;
    db.exec(`ALTER TABLE offers ADD COLUMN ${column.name} ${column.definition}`);
    logger.debug(`Migração: coluna offers.${column.name} adicionada`);
  }
}

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
  applyColumnMigrations(db);

  logger.debug(`SQLite pronto em ${DB_PATH}`);
  instance = db;
  return instance;
}

export function closeDb(): void {
  if (!instance) return;
  instance.close();
  instance = null;
}
