const http = require('http');

const KNOWLEDGE_API = 'http://127.0.0.1:3902/api/knowledge';
const TOOL_NAME = 'search_knowledge';

function jsonRpc(id, result, error) {
  const msg = { jsonrpc: '2.0', id };
  if (error) msg.error = error;
  else msg.result = result;
  return JSON.stringify(msg) + '\n';
}

function fetchApi(path) {
  return new Promise((resolve, reject) => {
    http.get(`${KNOWLEDGE_API}${path}`, (res) => {
      let data = '';
      res.on('data', (c) => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { reject(new Error('Invalid JSON from API')); }
      });
    }).on('error', reject);
  });
}

async function handleRequest(msg) {
  if (!msg || msg.jsonrpc !== '2.0' || msg.id == null) return;

  const { id, method, params } = msg;

  switch (method) {
    case 'initialize':
      return jsonRpc(id, {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: 'second-brain', version: '1.0.0' },
      });

    case 'tools/list':
      return jsonRpc(id, {
        tools: [{
          name: TOOL_NAME,
          description: 'Search indexed notes and files in your Second Brain knowledge base. Supports full-text search (mode=fts), name search (mode=name), and smart search (mode=smart).',
          inputSchema: {
            type: 'object',
            properties: {
              query: { type: 'string', description: 'Search query' },
              mode: { type: 'string', enum: ['fts', 'name', 'smart'], default: 'smart', description: 'Search mode' },
              limit: { type: 'number', default: 5, description: 'Max results' },
            },
            required: ['query'],
          },
        }],
      });

    case 'tools/call': {
      const { name, arguments: args } = params || {};
      if (name !== TOOL_NAME) {
        return jsonRpc(id, null, { code: -32601, message: `Tool not found: ${name}` });
      }

      const query = args?.query || '';
      const mode = args?.mode || 'smart';
      const limit = args?.limit || 5;

      if (!query.trim()) {
        return jsonRpc(id, null, { code: -32602, message: 'query is required' });
      }

      try {
        const data = await fetchApi(`/search?q=${encodeURIComponent(query)}&mode=${mode}&limit=${limit}`);
        const results = data.results || [];
        const fts = data.fts || [];

        const lines = [];
        if (results.length > 0) {
          lines.push(`Found ${results.length} results:`);
          for (const r of results) {
            lines.push(`\n📄 ${r.file_name}`);
            lines.push(`   Path: ${r.file_path}`);
            if (r.content_preview) lines.push(`   Preview: ${r.content_preview}`);
          }
        }
        if (fts.length > 0) {
          lines.push(`\n🔍 FTS matches (${fts.length}):`);
          for (const r of fts) {
            lines.push(`   • ${r.file_name} (${r.file_path})`);
          }
        }
        if (lines.length === 0) lines.push('No results found.');

        return jsonRpc(id, { content: [{ type: 'text', text: lines.join('\n') }] });
      } catch (e) {
        return jsonRpc(id, null, { code: -32603, message: `API error: ${e.message}` });
      }
    }

    case 'notifications/initialized':
      return;

    default:
      return;
  }
}

let buffer = '';
let pending = 0;

process.stdin.on('data', (chunk) => {
  buffer += chunk.toString();
  const lines = buffer.split('\n');
  buffer = lines.pop() || '';
  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const msg = JSON.parse(line);
      pending++;
      handleRequest(msg).then((response) => {
        if (response) process.stdout.write(response);
        pending--;
        if (process.stdin._closed && pending === 0) process.exit(0);
      });
    } catch (e) {
      // ignore malformed JSON
    }
  }
});

process.stdin.on('end', () => {
  process.stdin._closed = true;
  if (pending === 0) process.exit(0);
});
