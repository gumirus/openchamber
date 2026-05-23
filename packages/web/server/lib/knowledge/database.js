import { Database } from 'bun:sqlite';
import path from 'path';
import fs from 'fs';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS daily_logs (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id         INTEGER NOT NULL DEFAULT 0,
    date            TEXT NOT NULL,
    time            TEXT NOT NULL,
    source          TEXT DEFAULT 'web',
    user_message    TEXT NOT NULL,
    bot_response    TEXT NOT NULL,
    model           TEXT DEFAULT 'deepseek/deepseek-chat',
    tokens_input    INTEGER DEFAULT 0,
    tokens_output   INTEGER DEFAULT 0,
    cost            REAL DEFAULT 0.0,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_daily_logs_date ON daily_logs(date);
CREATE INDEX IF NOT EXISTS idx_daily_logs_source ON daily_logs(source);

CREATE TABLE IF NOT EXISTS chat_history (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL,
    role        TEXT NOT NULL,
    message     TEXT NOT NULL,
    source      TEXT DEFAULT 'web',
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_chat_history_user ON chat_history(user_id);

CREATE TABLE IF NOT EXISTS tasks (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id      INTEGER NOT NULL,
    title        TEXT NOT NULL,
    description  TEXT DEFAULT '',
    status       TEXT DEFAULT 'active',
    priority     TEXT DEFAULT 'medium',
    date         TEXT NOT NULL,
    created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP,
    cancelled_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS reminders (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL,
    text        TEXT NOT NULL,
    remind_at   TIMESTAMP NOT NULL,
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    sent        INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS api_logs (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    model          TEXT,
    endpoint       TEXT,
    input_tokens   INTEGER DEFAULT 0,
    output_tokens  INTEGER DEFAULT 0,
    cost           REAL DEFAULT 0.0,
    duration_ms    INTEGER DEFAULT 0,
    status         TEXT DEFAULT 'success',
    error          TEXT
);

CREATE TABLE IF NOT EXISTS balance_checks (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    balance       REAL,
    currency      TEXT DEFAULT 'USD',
    is_available  INTEGER DEFAULT 1,
    raw_response  TEXT
);

CREATE TABLE IF NOT EXISTS response_cache (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    cache_key      TEXT UNIQUE,
    prompt         TEXT,
    response       TEXT,
    model          TEXT,
    input_tokens   INTEGER DEFAULT 0,
    output_tokens  INTEGER DEFAULT 0,
    cost           REAL DEFAULT 0.0,
    created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at     TIMESTAMP,
    hits           INTEGER DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_cache_key ON response_cache(cache_key);
CREATE INDEX IF NOT EXISTS idx_cache_expires ON response_cache(expires_at);

CREATE TABLE IF NOT EXISTS sync_log (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    direction    TEXT NOT NULL,
    table_name   TEXT NOT NULL,
    rows_synced  INTEGER DEFAULT 0,
    status       TEXT DEFAULT 'success',
    error        TEXT,
    created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS vault_index (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    file_path     TEXT UNIQUE,
    file_name     TEXT,
    content_hash  TEXT,
    chunk_count   INTEGER DEFAULT 0,
    last_indexed  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS file_index (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    file_path       TEXT UNIQUE NOT NULL,
    file_name       TEXT NOT NULL,
    dir_path        TEXT NOT NULL,
    file_ext        TEXT DEFAULT '',
    file_type       TEXT DEFAULT 'other',
    category        TEXT DEFAULT 'other',
    size_bytes      INTEGER DEFAULT 0,
    is_dir          INTEGER DEFAULT 0,
    is_binary       INTEGER DEFAULT 1,
    depth           INTEGER DEFAULT 0,
    created_at      TIMESTAMP,
    modified_at     TIMESTAMP,
    content_hash    TEXT,
    content_preview TEXT,
    indexed_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_file_path ON file_index(file_path);
CREATE INDEX IF NOT EXISTS idx_file_type ON file_index(file_type);
CREATE INDEX IF NOT EXISTS idx_category ON file_index(category);
CREATE INDEX IF NOT EXISTS idx_dir_path ON file_index(dir_path);
CREATE INDEX IF NOT EXISTS idx_depth ON file_index(depth);

CREATE TABLE IF NOT EXISTS dir_tree (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    dir_path          TEXT UNIQUE NOT NULL,
    dir_name          TEXT NOT NULL,
    parent_path       TEXT,
    depth             INTEGER DEFAULT 0,
    file_count        INTEGER DEFAULT 0,
    dir_count         INTEGER DEFAULT 0,
    total_size_bytes  INTEGER DEFAULT 0,
    indexed_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_dir_parent ON dir_tree(parent_path);
CREATE INDEX IF NOT EXISTS idx_dir_depth ON dir_tree(depth);
`;

const FTS_SCHEMA = `
CREATE VIRTUAL TABLE IF NOT EXISTS file_fts USING fts5(
    file_name, dir_path, file_type, content_preview,
    content='file_index',
    content_rowid='id',
    tokenize='unicode61'
);
`;

let dbInstance = null;

export const getDbPath = (dataDir) => {
  return path.join(dataDir, 'second_brain.db');
};

export const initDatabase = (dataDir) => {
  const dbPath = getDbPath(dataDir);
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const db = new Database(dbPath);
  db.run('PRAGMA journal_mode = WAL');
  db.run('PRAGMA foreign_keys = ON');

  db.run(SCHEMA);

  try {
    db.run(FTS_SCHEMA);
  } catch (e) {
    console.warn('Failed to create FTS5 table:', e.message);
  }

  return db;
};

export const getDatabase = (dataDir) => {
  if (!dbInstance) {
    dbInstance = initDatabase(dataDir);
  }
  return dbInstance;
};

export const closeDatabase = () => {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
};

export const rebuildFtsIndex = (db) => {
  try {
    db.run("INSERT INTO file_fts(file_fts) VALUES('rebuild')");
    return true;
  } catch (e) {
    console.warn('Failed to rebuild FTS index:', e.message);
    return false;
  }
};
