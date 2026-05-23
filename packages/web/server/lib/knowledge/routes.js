import express from 'express';
import {
  ftsSearch,
  searchByName,
  searchObsidian,
  smartSearch,
  getContextForPrompt,
  getMasterContext,
  logDailyDialog,
  logChatMessage,
  getChatHistory,
  createTask,
  updateTaskStatus,
  getTasks,
  createReminder,
  getDueReminders,
  markReminderSent,
  logApiCall,
  getStats,
  getDbInfo,
  scanObsidianVault,
} from './service.js';
import { getDatabase, initDatabase, rebuildFtsIndex } from './database.js';

export const registerKnowledgeRoutes = (app, dependencies) => {
  const { openchamberDataDir } = dependencies;

  const withError = (res, fn) => {
    try {
      return fn();
    } catch (error) {
      console.error('Knowledge base error:', error);
      return res.status(500).json({ error: error.message || 'Internal error' });
    }
  };

  app.use('/api/knowledge', express.json());
  app.use('/api/knowledge', (_req, _res, next) => {
    try {
      initDatabase(openchamberDataDir);
    } catch (e) {
      console.error('Failed to initialize knowledge database:', e);
    }
    next();
  });

  app.get('/api/knowledge/info', (req, res) => {
    withError(res, () => {
      const db = getDatabase(openchamberDataDir);
      const info = getDbInfo(openchamberDataDir);
      const tableCount = db.prepare(
        "SELECT COUNT(*) as count FROM sqlite_master WHERE type='table'"
      ).get();
      const ftsExists = db.prepare(
        "SELECT COUNT(*) as count FROM sqlite_master WHERE type='table' AND name='file_fts'"
      ).get();
      res.json({ ...info, tables: tableCount.count, ftsEnabled: ftsExists.count > 0 });
    });
  });

  app.get('/api/knowledge/stats', (req, res) => {
    withError(res, () => {
      const stats = getStats(openchamberDataDir);
      res.json(stats);
    });
  });

  app.get('/api/knowledge/search', (req, res) => {
    withError(res, () => {
      const query = typeof req.query.q === 'string' ? req.query.q.trim() : '';
      if (!query) {
        return res.status(400).json({ error: 'Query parameter q is required' });
      }
      const limit = parseInt(req.query.limit, 10) || 10;
      const vaultPath = req.query.vaultPath || '';
      const mode = req.query.mode || 'smart';

      let results;
      if (mode === 'fts') {
        results = ftsSearch(openchamberDataDir, query, limit);
      } else if (mode === 'name') {
        results = searchByName(openchamberDataDir, query, limit);
      } else if (mode === 'obsidian' && vaultPath) {
        results = searchObsidian(openchamberDataDir, query, vaultPath, limit);
      } else {
        const smart = smartSearch(openchamberDataDir, query, { vaultPath, topK: limit });
        results = { fts: smart.fts, obsidian: smart.obsidian };
      }

      res.json({ query, mode, results });
    });
  });

  app.get('/api/knowledge/context', (req, res) => {
    withError(res, () => {
      const query = typeof req.query.q === 'string' ? req.query.q.trim() : '';
      const userId = parseInt(req.query.userId, 10) || 0;
      const vaultPath = req.query.vaultPath || '';
      const topK = parseInt(req.query.topK, 10) || 3;

      let context = '';
      if (query) {
        context = getContextForPrompt(openchamberDataDir, query, { vaultPath, topK });
      }

      const masterCtx = getMasterContext(openchamberDataDir, userId);

      res.json({
        query,
        ragContext: context,
        masterContext: masterCtx,
        combined: [context, masterCtx].filter(Boolean).join('\n\n'),
      });
    });
  });

  app.post('/api/knowledge/dialogs', (req, res) => {
    withError(res, () => {
      const { userId, source, userMessage, botResponse, model, tokensInput, tokensOutput, cost } = req.body || {};
      if (!userMessage || !botResponse) {
        return res.status(400).json({ error: 'userMessage and botResponse are required' });
      }
      logDailyDialog(openchamberDataDir, { userId, source, userMessage, botResponse, model, tokensInput, tokensOutput, cost });
      res.json({ success: true });
    });
  });

  app.get('/api/knowledge/dialogs', (req, res) => {
    withError(res, () => {
      const userId = parseInt(req.query.userId, 10) || 0;
      const limit = parseInt(req.query.limit, 10) || 50;
      const offset = parseInt(req.query.offset, 10) || 0;
      const db = getDatabase(openchamberDataDir);
      const dialogs = db.prepare(`
        SELECT * FROM daily_logs WHERE user_id = ? ORDER BY id DESC LIMIT ? OFFSET ?
      `).all(userId, limit, offset);
      res.json({ dialogs });
    });
  });

  app.post('/api/knowledge/chat', (req, res) => {
    withError(res, () => {
      const { userId, role, message, source } = req.body || {};
      if (!role || !message) {
        return res.status(400).json({ error: 'role and message are required' });
      }
      logChatMessage(openchamberDataDir, { userId, role, message, source });
      res.json({ success: true });
    });
  });

  app.get('/api/knowledge/chat', (req, res) => {
    withError(res, () => {
      const userId = parseInt(req.query.userId, 10) || 0;
      const limit = parseInt(req.query.limit, 10) || 50;
      const offset = parseInt(req.query.offset, 10) || 0;
      const history = getChatHistory(openchamberDataDir, { userId, limit, offset });
      res.json({ history });
    });
  });

  app.post('/api/knowledge/tasks', (req, res) => {
    withError(res, () => {
      const { userId, title, description, priority, date } = req.body || {};
      if (!title) {
        return res.status(400).json({ error: 'title is required' });
      }
      const id = createTask(openchamberDataDir, { userId, title, description, priority, date });
      res.json({ success: true, id });
    });
  });

  app.get('/api/knowledge/tasks', (req, res) => {
    withError(res, () => {
      const userId = parseInt(req.query.userId, 10) || 0;
      const status = req.query.status || '';
      const date = req.query.date || '';
      const limit = parseInt(req.query.limit, 10) || 50;
      const tasks = getTasks(openchamberDataDir, { userId, status, date, limit });
      res.json({ tasks });
    });
  });

  app.patch('/api/knowledge/tasks/:id', (req, res) => {
    withError(res, () => {
      const taskId = parseInt(req.params.id, 10);
      const { status } = req.body || {};
      if (!status) {
        return res.status(400).json({ error: 'status is required' });
      }
      updateTaskStatus(openchamberDataDir, taskId, status);
      res.json({ success: true });
    });
  });

  app.post('/api/knowledge/reminders', (req, res) => {
    withError(res, () => {
      const { userId, text, remindAt } = req.body || {};
      if (!text || !remindAt) {
        return res.status(400).json({ error: 'text and remindAt are required' });
      }
      const id = createReminder(openchamberDataDir, { userId, text, remindAt });
      res.json({ success: true, id });
    });
  });

  app.get('/api/knowledge/reminders/due', (req, res) => {
    withError(res, () => {
      const reminders = getDueReminders(openchamberDataDir);
      res.json({ reminders });
    });
  });

  app.post('/api/knowledge/reminders/:id/sent', (req, res) => {
    withError(res, () => {
      const id = parseInt(req.params.id, 10);
      markReminderSent(openchamberDataDir, id);
      res.json({ success: true });
    });
  });

  app.post('/api/knowledge/api-log', (req, res) => {
    withError(res, () => {
      const { model, endpoint, inputTokens, outputTokens, cost, durationMs, status, error } = req.body || {};
      logApiCall(openchamberDataDir, { model, endpoint, inputTokens, outputTokens, cost, durationMs, status, error });
      res.json({ success: true });
    });
  });

  app.post('/api/knowledge/vault/scan', (req, res) => {
    withError(res, () => {
      const vaultPath = req.body?.vaultPath || '';
      if (!vaultPath) {
        return res.status(400).json({ error: 'vaultPath is required' });
      }
      const result = scanObsidianVault(openchamberDataDir, vaultPath);
      if (result.error) {
        return res.status(400).json(result);
      }
      res.json(result);
    });
  });

  app.post('/api/knowledge/fts/rebuild', (req, res) => {
    withError(res, () => {
      const db = getDatabase(openchamberDataDir);
      const ok = rebuildFtsIndex(db);
      res.json({ success: ok });
    });
  });
};
