import { getDatabase, getDbPath } from './database.js';

const FTS_MAX_WORDS = 5;

const sanitizeFtsQuery = (query) => {
  let cleaned = query.replace(/[^\w\sа-яёА-ЯЁ-]/g, ' ');
  cleaned = cleaned.trim().replace(/\s+/g, ' ');
  const words = cleaned.split(/\s+/).slice(0, FTS_MAX_WORDS);
  return words.join(' OR ');
};

export const ftsSearch = (dataDir, query, limit = 10) => {
  const db = getDatabase(dataDir);
  const sanitized = sanitizeFtsQuery(query);
  if (!sanitized) return [];

  try {
    const rows = db.query(`
      SELECT f.id, f.file_path, f.file_name, f.dir_path, f.file_ext, f.file_type,
             f.category, f.size_bytes, f.content_preview, f.is_dir, f.is_binary, f.depth,
             rank
      FROM file_fts
      JOIN file_index f ON file_fts.rowid = f.id
      WHERE file_fts MATCH ?
      ORDER BY rank
      LIMIT ?
    `).all(sanitized, limit);
    return rows;
  } catch {
    return [];
  }
};

export const searchByName = (dataDir, query, limit = 10) => {
  const db = getDatabase(dataDir);
  const words = query.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [];

  const conditions = words.map(() => '(LOWER(file_name) LIKE ? OR LOWER(dir_path) LIKE ?)');
  const sql = `
    SELECT * FROM file_index
    WHERE ${conditions.join(' AND ')}
    ORDER BY CASE file_type
      WHEN 'document' THEN 1
      WHEN 'code' THEN 2
      WHEN 'config' THEN 3
      ELSE 4
    END, size_bytes DESC
    LIMIT ?
  `;
  const params = words.flatMap((w) => [`%${w.toLowerCase()}%`, `%${w.toLowerCase()}%`]);
  params.push(limit);

  try {
    return db.query(sql).all(...params);
  } catch {
    return [];
  }
};

export const searchObsidian = (dataDir, query, vaultPath, limit = 5) => {
  const db = getDatabase(dataDir);

  const ftsResults = (() => {
    try {
      const sanitized = sanitizeFtsQuery(query);
      if (!sanitized) return [];
      return db.query(`
        SELECT f.id, f.file_path, f.file_name, f.dir_path, f.content_preview, rank
        FROM file_fts
        JOIN file_index f ON file_fts.rowid = f.id
        WHERE file_fts MATCH ? AND f.dir_path LIKE ?
        ORDER BY rank
        LIMIT ?
      `).all(sanitized, `${vaultPath}%`, limit);
    } catch {
      return [];
    }
  })();

  if (ftsResults.length >= limit) return ftsResults;

  const nameResults = db.query(`
    SELECT * FROM file_index
    WHERE file_type = 'document' AND LOWER(file_name) LIKE ? AND dir_path LIKE ?
    LIMIT ?
  `).all(`%${query.toLowerCase()}%`, `${vaultPath}%`, limit - ftsResults.length);

  return [...ftsResults, ...nameResults];
};

export const smartSearch = (dataDir, query, { vaultPath, topK = 3 } = {}) => {
  let results = ftsSearch(dataDir, query, topK);

  if (results.length < topK) {
    const nameResults = searchByName(dataDir, query, topK - results.length);
    const existingIds = new Set(results.map((r) => r.id));
    results = [...results, ...nameResults.filter((r) => !existingIds.has(r.id))];
  }

  let obsidianResults = [];
  if (vaultPath) {
    obsidianResults = searchObsidian(dataDir, query, vaultPath, topK);
  }

  return { fts: results, obsidian: obsidianResults };
};

export const getContextForPrompt = (dataDir, query, { vaultPath, topK = 3 } = {}) => {
  const { fts: ftsResults, obsidian: obsidianResults } = smartSearch(dataDir, query, { vaultPath, topK });

  const parts = [];

  if (obsidianResults.length > 0) {
    const notes = obsidianResults.map((r) =>
      `  📄 ${r.file_name} (${r.dir_path})\n  ${(r.content_preview || '').slice(0, 300)}`
    ).join('\n\n');
    parts.push(`📓 ИЗ ЗАМЕТОК OBSIDIAN:\n${notes}`);
  }

  const documents = ftsResults.filter((r) => r.file_type === 'document');
  if (documents.length > 0) {
    const docs = documents.map((r) =>
      `  📁 ${r.file_name}\n  ${(r.content_preview || '').slice(0, 200)}`
    ).join('\n\n');
    parts.push(`📄 ДОКУМЕНТЫ:\n${docs}`);
  }

  const codeFiles = ftsResults.filter((r) => r.file_type === 'code');
  if (codeFiles.length > 0) {
    const code = codeFiles.map((r) =>
      `  💻 ${r.file_name} (${r.category})\n  ${(r.content_preview || '').slice(0, 200)}`
    ).join('\n\n');
    parts.push(`💻 ФАЙЛЫ С КОДОМ:\n${code}`);
  }

  if (!parts.length) return '';

  return `🔍 Результаты поиска по запросу: «${query}»\n${'='.repeat(50)}\n\n${parts.join('\n\n')}`;
};

export const getMasterContext = (dataDir, userId = 0) => {
  const db = getDatabase(dataDir);

  const recentDialogs = db.query(`
    SELECT date, time, source, user_message, bot_response
    FROM daily_logs
    WHERE user_id = ?
    ORDER BY id DESC
    LIMIT 15
  `).all(userId);

  const activeTasks = db.query(`
    SELECT title, priority, date
    FROM tasks
    WHERE user_id = ? AND status = 'active'
    ORDER BY date DESC
  `).all(userId);

  const todayDialogs = db.query(`
    SELECT COUNT(*) as count FROM daily_logs
    WHERE user_id = ? AND date = date('now', 'localtime')
  `).get(userId);

  const parts = [];

  if (recentDialogs.length > 0) {
    const dialogs = recentDialogs.reverse().map((d) =>
      `[${d.date} ${d.time}] (${d.source})\n👤 ${d.user_message.slice(0, 200)}\n🤖 ${d.bot_response.slice(0, 200)}`
    ).join('\n\n');
    parts.push(`📋 Последние диалоги:\n${dialogs}`);
  }

  if (activeTasks.length > 0) {
    const tasks = activeTasks.map((t) =>
      `  • [${t.priority}] ${t.title} -- ${t.date}`
    ).join('\n');
    parts.push(`📝 Активные задачи:\n${tasks}`);
  }

  if (todayDialogs && todayDialogs.count > 0) {
    parts.push(`📊 Сегодня ${todayDialogs.count} диалогов.`);
  }

  return parts.length ? `📚 Контекст из базы знаний:\n${parts.join('\n\n')}` : '';
};

export const logDailyDialog = (dataDir, { userId = 0, source = 'web', userMessage, botResponse, model = 'deepseek/deepseek-chat', tokensInput = 0, tokensOutput = 0, cost = 0 }) => {
  const db = getDatabase(dataDir);
  const now = new Date();
  const date = now.toISOString().slice(0, 10);
  const time = now.toTimeString().slice(0, 5);

  db.query(`
    INSERT INTO daily_logs (user_id, date, time, source, user_message, bot_response, model, tokens_input, tokens_output, cost)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(userId, date, time, source, userMessage, botResponse, model, tokensInput, tokensOutput, cost);
};

export const logChatMessage = (dataDir, { userId = 0, role, message, source = 'web' }) => {
  const db = getDatabase(dataDir);
  db.query(`
    INSERT INTO chat_history (user_id, role, message, source)
    VALUES (?, ?, ?, ?)
  `).run(userId, role, message, source);
};

export const getChatHistory = (dataDir, { userId = 0, limit = 50, offset = 0 } = {}) => {
  const db = getDatabase(dataDir);
  return db.query(`
    SELECT * FROM chat_history
    WHERE user_id = ?
    ORDER BY id DESC
    LIMIT ? OFFSET ?
  `).all(userId, limit, offset);
};

export const createTask = (dataDir, { userId = 0, title, description = '', priority = 'medium', date }) => {
  const db = getDatabase(dataDir);
  const taskDate = date || new Date().toISOString().slice(0, 10);
  const result = db.query(`
    INSERT INTO tasks (user_id, title, description, priority, date)
    VALUES (?, ?, ?, ?, ?)
  `).run(userId, title, description, priority, taskDate);
  return result.lastInsertRowid;
};

export const updateTaskStatus = (dataDir, taskId, status) => {
  const db = getDatabase(dataDir);
  const now = new Date().toISOString();

  if (status === 'done') {
    db.query('UPDATE tasks SET status = ?, completed_at = ? WHERE id = ?').run(status, now, taskId);
  } else if (status === 'cancelled') {
    db.query('UPDATE tasks SET status = ?, cancelled_at = ? WHERE id = ?').run(status, now, taskId);
  } else {
    db.query('UPDATE tasks SET status = ? WHERE id = ?').run(status, taskId);
  }
};

export const getTasks = (dataDir, { userId = 0, status, date, limit = 50 } = {}) => {
  const db = getDatabase(dataDir);
  let sql = 'SELECT * FROM tasks WHERE user_id = ?';
  const params = [userId];

  if (status) {
    sql += ' AND status = ?';
    params.push(status);
  }
  if (date) {
    sql += ' AND date = ?';
    params.push(date);
  }

  sql += ' ORDER BY created_at DESC LIMIT ?';
  params.push(limit);

  return db.query(sql).all(...params);
};

export const createReminder = (dataDir, { userId = 0, text, remindAt }) => {
  const db = getDatabase(dataDir);
  const result = db.query(`
    INSERT INTO reminders (user_id, text, remind_at)
    VALUES (?, ?, ?)
  `).run(userId, text, remindAt);
  return result.lastInsertRowid;
};

export const getDueReminders = (dataDir) => {
  const db = getDatabase(dataDir);
  return db.query(`
    SELECT * FROM reminders
    WHERE sent = 0 AND remind_at <= datetime('now')
    ORDER BY remind_at ASC
  `).all();
};

export const markReminderSent = (dataDir, id) => {
  const db = getDatabase(dataDir);
  db.query('UPDATE reminders SET sent = 1 WHERE id = ?').run(id);
};

export const logApiCall = (dataDir, { model, endpoint, inputTokens, outputTokens, cost, durationMs, status = 'success', error = null }) => {
  const db = getDatabase(dataDir);
  db.query(`
    INSERT INTO api_logs (model, endpoint, input_tokens, output_tokens, cost, duration_ms, status, error)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(model, endpoint, inputTokens, outputTokens, cost, durationMs, status, error);
};

export const getStats = (dataDir) => {
  const db = getDatabase(dataDir);

  const dialogCount = db.query('SELECT COUNT(*) as count FROM daily_logs').get();
  const taskCount = db.query('SELECT COUNT(*) as count, status FROM tasks GROUP BY status').all();
  const totalCost = db.query('SELECT COALESCE(SUM(cost), 0) as total FROM api_logs').get();
  const cacheHits = db.query('SELECT COALESCE(SUM(hits), 0) as total FROM response_cache').get();
  const fileCount = db.query('SELECT COUNT(*) as count FROM file_index').get();
  const reminderPending = db.query("SELECT COUNT(*) as count FROM reminders WHERE sent = 0").get();

  const tasksByStatus = {};
  for (const row of taskCount) {
    tasksByStatus[row.status] = row.count;
  }

  return {
    dialogs: dialogCount.count,
    tasks: tasksByStatus,
    totalCost: totalCost.total,
    cacheHits: cacheHits.total,
    indexedFiles: fileCount.count,
    pendingReminders: reminderPending.count,
  };
};

export const scanObsidianVault = (dataDir, vaultPath) => {
  const db = getDatabase(dataDir);
  const fs = require('fs');
  const path = require('path');

  if (!fs.existsSync(vaultPath)) {
    return { indexed: 0, error: 'Vault path does not exist' };
  }

  let indexed = 0;
  const scanDir = (dir) => {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch { return; }

    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        scanDir(fullPath);
      } else if (entry.name.endsWith('.md')) {
        try {
          const stats = fs.statSync(fullPath);
          const content = fs.readFileSync(fullPath, 'utf-8');
          const contentPreview = content.slice(0, 500);
          const contentHash = require('crypto')
            .createHash('md5').update(content).digest('hex');
          const relPath = fullPath.replace(vaultPath, '').replace(/^\//, '');
          const dirPath = path.dirname(relPath);

          const existing = db.query(
            'SELECT content_hash FROM vault_index WHERE file_path = ?'
          ).get(relPath);

          if (existing && existing.content_hash === contentHash) return;

          db.query(`
            INSERT INTO vault_index (file_path, file_name, content_hash, chunk_count, last_indexed)
            VALUES (?, ?, ?, ?, datetime('now'))
            ON CONFLICT(file_path) DO UPDATE SET
              content_hash = excluded.content_hash,
              chunk_count = excluded.chunk_count,
              last_indexed = datetime('now')
          `).run(relPath, entry.name, contentHash, 0);

          db.query(`
            INSERT INTO file_index (file_path, file_name, dir_path, file_ext, file_type, category, size_bytes, content_hash, content_preview, modified_at, indexed_at)
            VALUES (?, ?, ?, '.md', 'document', 'note', ?, ?, ?, datetime('now'), datetime('now'))
            ON CONFLICT(file_path) DO UPDATE SET
              content_hash = excluded.content_hash,
              content_preview = excluded.content_preview,
              size_bytes = excluded.size_bytes,
              modified_at = excluded.modified_at,
              indexed_at = datetime('now')
          `).run(relPath, entry.name, dirPath, stats.size, contentHash, contentPreview);

          indexed++;
        } catch (e) {
          console.warn(`Failed to index ${fullPath}:`, e.message);
        }
      }
    }
  };

  scanDir(vaultPath);

  try {
    db.run("INSERT INTO file_fts(file_fts) VALUES('rebuild')");
  } catch (e) {
    console.warn('Failed to rebuild FTS:', e.message);
  }

  return { indexed };
};

export const getDbInfo = (dataDir) => {
  return {
    path: getDbPath(dataDir),
  };
};
