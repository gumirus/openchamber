export interface KnowledgeStats {
  dialogs: number;
  tasks: Record<string, number>;
  totalCost: number;
  cacheHits: number;
  indexedFiles: number;
  pendingReminders: number;
}

export interface KnowledgeSearchResult {
  id: number;
  file_path: string;
  file_name: string;
  dir_path: string;
  file_ext: string;
  file_type: string;
  content_preview: string;
  rank?: number;
}

export interface KnowledgeContext {
  query: string;
  ragContext: string;
  masterContext: string;
  combined: string;
}

export interface DailyDialog {
  id: number;
  date: string;
  time: string;
  source: string;
  user_message: string;
  bot_response: string;
  model: string;
  tokens_input: number;
  tokens_output: number;
  cost: number;
}

export interface KnowledgeDbInfo {
  path: string;
  tables: number;
  ftsEnabled: boolean;
}
