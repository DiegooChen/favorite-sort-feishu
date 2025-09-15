import React, { useState, useEffect } from 'react';
import { BookmarkList } from '@/ui/components/BookmarkList';
import { VirtualBookmarkList } from '@/ui/components/VirtualBookmarkList';
import { ConfigPanel } from '@/ui/components/ConfigPanel';
import { StatusBar } from '@/ui/components/StatusBar';
import { NavigationTab } from '@/ui/components/NavigationTab';
import { LogsPanel } from '@/ui/components/LogsPanel';
import { LoadingSpinner } from '@/ui/components/LoadingSpinner';
import { useBookmarks } from '@/ui/hooks/useBookmarks';
import { useExtensionConfig } from '@/ui/hooks/useExtensionConfig';
import { Bookmark } from '@/types/bookmark';
import './OptionsApp.css';

export type TabType = 'bookmarks' | 'config' | 'logs';

const OptionsApp: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabType>('bookmarks');
  const [selectedBookmarks, setSelectedBookmarks] = useState<Bookmark[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const {
    bookmarks,
    stats,
    loading: bookmarksLoading,
    error: bookmarksError,
    refreshBookmarks,
    scanBookmarks
  } = useBookmarks();

  const {
    config,
    loading: configLoading,
    saveConfig,
    resetConfig
  } = useExtensionConfig();

  useEffect(() => {
    setIsLoading(bookmarksLoading || configLoading);
    setError(bookmarksError);
  }, [bookmarksLoading, configLoading, bookmarksError]);

  const handleBookmarkSelect = (bookmarks: Bookmark[]) => {
    setSelectedBookmarks(bookmarks);
  };

  const handleOperationComplete = async () => {
    await refreshBookmarks();
    setSelectedBookmarks([]);
  };

  if (isLoading) {
    return (
      <div className="options-app loading">
        <LoadingSpinner text="正在加载..." />
      </div>
    );
  }

  if (error) {
    return (
      <div className="options-app error">
        <div className="error-message">
          <h2>加载失败</h2>
          <p>{error}</p>
          <button onClick={() => window.location.reload()}>重新加载</button>
        </div>
      </div>
    );
  }

  return (
    <div className="options-app">
      <header className="app-header">
        <div className="header-content">
          <h1 className="app-title">书签整理器</h1>
        </div>
        
        <NavigationTab
          activeTab={activeTab}
          onTabChange={setActiveTab}
        />
      </header>

      <main className="app-main">
        {activeTab === 'bookmarks' && (
          bookmarks.length > 100 ? (
            <VirtualBookmarkList
              bookmarks={bookmarks}
              selectedBookmarks={selectedBookmarks}
              onSelectionChange={handleBookmarkSelect}
              onRefresh={refreshBookmarks}
              onScan={scanBookmarks}
              onOperationComplete={handleOperationComplete}
              config={config}
            />
          ) : (
            <BookmarkList
              bookmarks={bookmarks}
              selectedBookmarks={selectedBookmarks}
              onSelectionChange={handleBookmarkSelect}
              onRefresh={refreshBookmarks}
              onScan={scanBookmarks}
              onOperationComplete={handleOperationComplete}
              config={config}
            />
          )
        )}

        {activeTab === 'config' && (
          <ConfigPanel
            config={config}
            onConfigSave={(key: any, data: any) => saveConfig(key, data)}
            onConfigReset={resetConfig}
          />
        )}

        {activeTab === 'logs' && (
          <LogsPanel />
        )}
      </main>

      <StatusBar
        totalBookmarks={stats?.totalBookmarks || 0}
        selectedCount={selectedBookmarks.length}
        lastUpdate={new Date()}
      />
    </div>
  );
};

export default OptionsApp;