import React from 'react';
import { useKnowledgeStore } from '@/stores/useKnowledgeStore';
import { useShallow } from 'zustand/react/shallow';
import { useI18n } from '@/lib/i18n';

export const KnowledgePage: React.FC = () => {
  const { t } = useI18n();
  const {
    stats,
    recentDialogs,
    searchQuery,
    searchResults,
    isLoading,
    setSearchQuery,
    search,
    loadRecentDialogs,
  } = useKnowledgeStore(
    useShallow((s) => ({
      stats: s.stats,
      recentDialogs: s.recentDialogs,
      searchQuery: s.searchQuery,
      searchResults: s.searchResults,
      isLoading: s.isLoading,
      setSearchQuery: s.setSearchQuery,
      search: s.search,
      loadRecentDialogs: s.loadRecentDialogs,
    })),
  );

  React.useEffect(() => {
    loadRecentDialogs();
  }, [loadRecentDialogs]);

  const handleSearchInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    search(searchQuery);
  };

  const results = searchResults?.results;

  return (
    <div className="h-full overflow-auto">
      <div className="mx-auto w-full max-w-3xl px-6 py-6 space-y-6">
        <div className="space-y-1">
          <h1 className="typography-ui-header font-semibold text-foreground">Second Brain</h1>
          <p className="typography-ui text-muted-foreground">
            Personal knowledge base with full-text search, dialog history, tasks, and reminders.
          </p>
        </div>

        <form onSubmit={handleSearch} className="flex gap-2">
          <input
            type="text"
            value={searchQuery}
            onChange={handleSearchInput}
            placeholder="Search files, notes, code..."
            className="flex-1 rounded-lg border border-border bg-[var(--surface-elevated)] px-3 py-2 typography-ui text-foreground placeholder:text-muted-foreground/50 outline-none focus:border-[var(--focus-ring)] transition-colors"
          />
          <button
            type="submit"
            disabled={isLoading}
            className="rounded-lg bg-[var(--accent)] px-4 py-2 typography-ui-label text-[var(--accent-foreground)] hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            Search
          </button>
        </form>

        {searchResults && (
          <div className="space-y-2">
            <h3 className="typography-ui-label text-foreground font-semibold">
              Results for: "{searchResults.query}"
            </h3>
            {results && Array.isArray(results) && results.length > 0 ? (
              <div className="space-y-2">
                {results.map((r: any) => (
                  <div key={r.id} className="rounded-lg border border-border bg-[var(--surface-elevated)] p-3">
                    <div className="typography-ui-label text-foreground">{r.file_name}</div>
                    <div className="typography-micro text-muted-foreground/70 truncate">{r.file_path}</div>
                    {r.content_preview && (
                      <div className="typography-micro text-muted-foreground mt-1 line-clamp-2">{r.content_preview}</div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="typography-ui text-muted-foreground">No results found.</p>
            )}
            {results?.fts && results.fts.length > 0 && (
              <div className="space-y-2 mt-4">
                <h4 className="typography-micro text-muted-foreground/70 font-semibold">FTS Matches</h4>
                {results.fts.map((r: any) => (
                  <div key={r.id} className="rounded-lg border border-border bg-[var(--surface-elevated)] p-3">
                    <div className="typography-ui-label text-foreground">{r.file_name}</div>
                    <div className="typography-micro text-muted-foreground/70 truncate">{r.file_path}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {!searchResults && recentDialogs.length > 0 && (
          <div className="space-y-2">
            <h3 className="typography-ui-label text-foreground font-semibold">Recent Dialogs</h3>
            <div className="space-y-2">
              {recentDialogs.slice(0, 10).map((d) => (
                <div key={d.id} className="rounded-lg border border-border bg-[var(--surface-elevated)] p-3">
                  <div className="flex items-center justify-between">
                    <span className="typography-micro text-muted-foreground/70">
                      [{d.date} {d.time}] ({d.source})
                    </span>
                    <span className="typography-micro text-muted-foreground/50">{d.model}</span>
                  </div>
                  <div className="mt-1 space-y-1">
                    <p className="typography-ui text-foreground line-clamp-1">
                      <span className="text-[var(--accent)]">User:</span> {d.user_message}
                    </p>
                    <p className="typography-ui text-muted-foreground line-clamp-1">
                      <span className="text-[var(--accent)]">AI:</span> {d.bot_response}
                    </p>
                  </div>
                  {d.cost > 0 && (
                    <div className="typography-micro text-muted-foreground/50 mt-1">${d.cost.toFixed(6)}</div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {!searchResults && recentDialogs.length === 0 && (
          <div className="rounded-lg border border-border bg-[var(--surface-elevated)] p-8 text-center">
            <p className="typography-ui text-muted-foreground">
              No dialogs yet. Start a conversation with OpenCode to build your knowledge base.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
