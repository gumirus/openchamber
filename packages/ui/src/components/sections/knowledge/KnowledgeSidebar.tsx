import React from 'react';
import { useKnowledgeStore } from '@/stores/useKnowledgeStore';
import { useShallow } from 'zustand/react/shallow';
import { useI18n } from '@/lib/i18n';
import { Icon } from '@/components/icon/Icon';
import { SectionPlaceholder } from '@/components/sections/SectionPlaceholder';

interface KnowledgeSidebarProps {
  onItemSelect?: () => void;
}

export const KnowledgeSidebar: React.FC<KnowledgeSidebarProps> = ({ onItemSelect }) => {
  const { t } = useI18n();
  const { info, stats, loadInfo, loadStats } = useKnowledgeStore(
    useShallow((s) => ({
      info: s.info,
      stats: s.stats,
      loadInfo: s.loadInfo,
      loadStats: s.loadStats,
    })),
  );

  React.useEffect(() => {
    loadInfo();
    loadStats();
  }, [loadInfo, loadStats]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-4 pt-5 pb-2">
        <h2 className="typography-ui-label text-foreground font-semibold">
          Second Brain
        </h2>
      </div>
      <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-3">
        {stats && (
          <>
            <div className="rounded-lg border border-border bg-[var(--surface-elevated)] p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="typography-micro text-muted-foreground/70">Dialogs</span>
                <span className="typography-ui-label text-foreground">{stats.dialogs}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="typography-micro text-muted-foreground/70">Indexed Files</span>
                <span className="typography-ui-label text-foreground">{stats.indexedFiles}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="typography-micro text-muted-foreground/70">Active Tasks</span>
                <span className="typography-ui-label text-foreground">{stats.tasks?.active || 0}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="typography-micro text-muted-foreground/70">Pending Reminders</span>
                <span className="typography-ui-label text-foreground">{stats.pendingReminders}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="typography-micro text-muted-foreground/70">Cache Hits</span>
                <span className="typography-ui-label text-foreground">{stats.cacheHits}</span>
              </div>
            </div>
            {info && (
              <div className="rounded-lg border border-border bg-[var(--surface-elevated)] p-3 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="typography-micro text-muted-foreground/70">Tables</span>
                  <span className="typography-micro text-foreground">{info.tables}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="typography-micro text-muted-foreground/70">FTS Search</span>
                  <span className="typography-micro text-foreground">{info.ftsEnabled ? 'Enabled' : 'Disabled'}</span>
                </div>
              </div>
            )}
          </>
        )}
        {!stats && (
          <div className="flex items-center justify-center py-8">
            <span className="typography-micro text-muted-foreground/50">Loading...</span>
          </div>
        )}
      </div>
    </div>
  );
};
