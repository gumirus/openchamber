import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import type { KnowledgeStats, KnowledgeDbInfo, DailyDialog } from '@/types/knowledge';

interface KnowledgeStore {
  info: KnowledgeDbInfo | null;
  stats: KnowledgeStats | null;
  recentDialogs: DailyDialog[];
  searchQuery: string;
  searchResults: any;
  isLoading: boolean;
  error: string | null;

  loadInfo: () => Promise<void>;
  loadStats: () => Promise<void>;
  loadRecentDialogs: () => Promise<void>;
  setSearchQuery: (q: string) => void;
  search: (query: string) => Promise<void>;
  scanVault: (vaultPath: string) => Promise<any>;
}

const BASE = '/api/knowledge';

export const useKnowledgeStore = create<KnowledgeStore>()(
  devtools(
    (set, get) => ({
      info: null,
      stats: null,
      recentDialogs: [],
      searchQuery: '',
      searchResults: null,
      isLoading: false,
      error: null,

      loadInfo: async () => {
        try {
          const res = await fetch(`${BASE}/info`, {
            headers: { 'Cache-Control': 'no-cache' },
          });
          if (!res.ok) throw new Error('Failed to load knowledge base info');
          const info = await res.json();
          set({ info });
        } catch (e) {
          set({ error: e instanceof Error ? e.message : 'Unknown error' });
        }
      },

      loadStats: async () => {
        try {
          const res = await fetch(`${BASE}/stats`, {
            headers: { 'Cache-Control': 'no-cache' },
          });
          if (!res.ok) throw new Error('Failed to load stats');
          const stats = await res.json();
          set({ stats });
        } catch (e) {
          set({ error: e instanceof Error ? e.message : 'Unknown error' });
        }
      },

      loadRecentDialogs: async () => {
        try {
          const res = await fetch(`${BASE}/dialogs?limit=20`, {
            headers: { 'Cache-Control': 'no-cache' },
          });
          if (!res.ok) throw new Error('Failed to load dialogs');
          const data = await res.json();
          set({ recentDialogs: data.dialogs || [] });
        } catch (e) {
          set({ error: e instanceof Error ? e.message : 'Unknown error' });
        }
      },

      setSearchQuery: (q) => set({ searchQuery: q }),

      search: async (query) => {
        if (!query.trim()) {
          set({ searchResults: null });
          return;
        }
        set({ isLoading: true });
        try {
          const res = await fetch(`${BASE}/search?q=${encodeURIComponent(query)}&limit=10`, {
            headers: { 'Cache-Control': 'no-cache' },
          });
          if (!res.ok) throw new Error('Search failed');
          const results = await res.json();
          set({ searchResults: results, isLoading: false });
        } catch (e) {
          set({ error: e instanceof Error ? e.message : 'Unknown error', isLoading: false });
        }
      },

      scanVault: async (vaultPath) => {
        set({ isLoading: true, error: null });
        try {
          const res = await fetch(`${BASE}/vault/scan`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ vaultPath }),
          });
          if (!res.ok) {
            const err = await res.json();
            throw new Error(err.error || 'Scan failed');
          }
          const result = await res.json();
          await get().loadStats();
          set({ isLoading: false });
          return result;
        } catch (e) {
          set({ error: e instanceof Error ? e.message : 'Unknown error', isLoading: false });
          return null;
        }
      },
    }),
    { name: 'knowledge-store' },
  ),
);
