import React, { useState, useMemo, useEffect } from 'react';
import { Bookmark } from '@/types/bookmark';
import { BookmarkItem } from './BookmarkItem';
import { SearchBar } from './SearchBar';
import { FilterPanel } from './FilterPanel';
import { ConfirmDialog } from './ConfirmDialog';
import { LoadingSpinner } from './LoadingSpinner';
import { Toast, ToastContainer } from './Toast';
import './BookmarkList.css';

interface BookmarkListProps {
  bookmarks: Bookmark[];
  selectedBookmarks: Bookmark[];
  onSelectionChange: (bookmarks: Bookmark[]) => void;
  onRefresh: () => Promise<void>;
  onScan: () => Promise<void>;
  onOperationComplete?: () => Promise<void>;
  config?: any;
}

interface FilterOptions {
  status: string[];
  folders: string[];
  tags: string[];
  browsers: string[];
}

export const BookmarkList: React.FC<BookmarkListProps> = ({
  bookmarks,
  selectedBookmarks,
  onSelectionChange,
  onRefresh,
  onScan,
  onOperationComplete,
  config
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [filters, setFilters] = useState<FilterOptions>({
    status: [],
    folders: [],
    tags: [],
    browsers: []
  });
  const [sortBy, setSortBy] = useState<'title' | 'url' | 'created' | 'folder'>('created');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [isLoading, setIsLoading] = useState(false);
  const [loadingText, setLoadingText] = useState('');
  const [progress, setProgress] = useState(0);
  const [toasts, setToasts] = useState<Array<{id: string; message: string; type: 'success' | 'error' | 'warning' | 'info'}>>([]);
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    type: 'warning' | 'danger' | 'info';
    requireConfirmText?: string;
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    type: 'warning',
    onConfirm: () => {}
  });

  const filteredAndSortedBookmarks = useMemo(() => {
    let filtered = bookmarks;

    // 搜索过滤
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(bookmark =>
        bookmark.title.toLowerCase().includes(query) ||
        bookmark.url.toLowerCase().includes(query) ||
        bookmark.tags.some(tag => tag.toLowerCase().includes(query)) ||
        bookmark.folderPath.toLowerCase().includes(query)
      );
    }

    // 状态过滤
    if (filters.status.length > 0) {
      filtered = filtered.filter(bookmark => 
        filters.status.includes(bookmark.status)
      );
    }

    // 文件夹过滤
    if (filters.folders.length > 0) {
      filtered = filtered.filter(bookmark => 
        filters.folders.some(folder => 
          bookmark.folderPath.includes(folder)
        )
      );
    }

    // 标签过滤
    if (filters.tags.length > 0) {
      filtered = filtered.filter(bookmark => 
        filters.tags.some(tag => 
          bookmark.tags.includes(tag)
        )
      );
    }

    // 浏览器过滤
    if (filters.browsers.length > 0) {
      filtered = filtered.filter(bookmark => 
        filters.browsers.includes(bookmark.browser)
      );
    }

    // 排序
    filtered.sort((a, b) => {
      let compareValue = 0;
      
      switch (sortBy) {
        case 'title':
          compareValue = a.title.localeCompare(b.title);
          break;
        case 'url':
          compareValue = a.url.localeCompare(b.url);
          break;
        case 'created':
          compareValue = a.createdAt - b.createdAt;
          break;
        case 'folder':
          compareValue = a.folderPath.localeCompare(b.folderPath);
          break;
      }

      return sortOrder === 'asc' ? compareValue : -compareValue;
    });

    return filtered;
  }, [bookmarks, searchQuery, filters, sortBy, sortOrder]);

  const handleSelectAll = () => {
    if (selectedBookmarks.length === filteredAndSortedBookmarks.length) {
      onSelectionChange([]);
    } else {
      onSelectionChange(filteredAndSortedBookmarks);
    }
  };

  const handleBookmarkSelect = (bookmark: Bookmark, selected: boolean) => {
    if (selected) {
      onSelectionChange([...selectedBookmarks, bookmark]);
    } else {
      onSelectionChange(selectedBookmarks.filter(b => b.sourceId !== bookmark.sourceId));
    }
  };

  const handleRefresh = async () => {
    setIsLoading(true);
    try {
      await onRefresh();
    } finally {
      setIsLoading(false);
    }
  };

  const handleScan = async () => {
    setIsLoading(true);
    try {
      await onScan();
    } finally {
      setIsLoading(false);
    }
  };

  // 监听进度更新消息
  useEffect(() => {
    const handleMessage = (message: any) => {
      if (message.type === 'SYNC_PROGRESS') {
        const progressPercent = (message.progress.processed / message.progress.total) * 100;
        setProgress(progressPercent);

        let statusText = message.progress.status || `正在同步到飞书... ${message.progress.processed}/${message.progress.total}`;

        if (message.progress.stage === 'importing' && message.progress.processed > 0) {
          statusText += ` (成功: ${message.progress.successful}, 失败: ${message.progress.failed})`;
        }

        setLoadingText(statusText);
      } else if (message.type === 'CHECK_PROGRESS') {
        const progressPercent = (message.progress.checked / message.progress.total) * 100;
        setProgress(progressPercent);

        let progressText = `正在检测链接... ${message.progress.checked}/${message.progress.total}`;

        if (message.progress.estimatedTimeRemaining && message.progress.estimatedTimeRemaining > 1000) {
          const remainingSeconds = Math.round(message.progress.estimatedTimeRemaining / 1000);
          progressText += ` (剩余约 ${remainingSeconds}秒)`;
        }

        if (message.progress.concurrency) {
          progressText += ` [${message.progress.concurrency}线程]`;
        }

        setLoadingText(progressText);
      }
    };

    chrome.runtime.onMessage.addListener(handleMessage);

    return () => {
      chrome.runtime.onMessage.removeListener(handleMessage);
    };
  }, []);

  const availableOptions = useMemo(() => {
    const statuses = [...new Set(bookmarks.map(b => b.status))];
    const folders = [...new Set(bookmarks.map(b => b.folderPath))].filter(Boolean);
    const tags = [...new Set(bookmarks.flatMap(b => b.tags))].filter(Boolean);
    const browsers = [...new Set(bookmarks.map(b => b.browser))];

    return { statuses, folders, tags, browsers };
  }, [bookmarks]);

  const handleOperation = async (action: string, requiresConfirm: boolean = false) => {
    const operationInfo = getOperationInfo(action);

    if (requiresConfirm) {
      setConfirmDialog({
        isOpen: true,
        title: operationInfo.title,
        message: operationInfo.message,
        type: operationInfo.type,
        requireConfirmText: operationInfo.requireConfirmText,
        onConfirm: () => executeOperation(action)
      });
      return;
    }

    await executeOperation(action);
  };

  const executeOperation = async (action: string) => {
    setIsLoading(true);
    setProgress(0);

    const loadingTexts: Record<string, string> = {
      'CHECK_LINKS': '正在检测链接状态...',
      'SYNC_TO_FEISHU': '正在同步到飞书...',
      'NORMALIZE_URLS': '正在规范化URL...',
      'DEDUPE_BOOKMARKS': '正在去重...',
      'APPLY_TAG_RULES': '正在应用标签规则...',
      'DELETE_BOOKMARKS': '正在删除书签...'
    };
    setLoadingText(loadingTexts[action] || '正在处理...');

    try {
      const bookmarksToSync = selectedBookmarks.length > 0 ? selectedBookmarks : bookmarks;
      let payload: any = { bookmarks: bookmarksToSync };

      if (action === 'SYNC_TO_FEISHU') {
        if (!config?.feishu?.appId || !config?.feishu?.appSecret) {
          throw new Error('请先在配置设置中填写飞书App ID和App Secret');
        }
        if (!config?.feishu?.baseId || !config?.feishu?.tableId) {
          throw new Error('请先在配置设置中填写Base Token（多维表格ID）和Table ID（数据表ID）');
        }

        const feishuConfig = { ...config.feishu };
        if (config.feishu.manualToken && config.feishu.manualToken.trim()) {
          feishuConfig.accessToken = config.feishu.manualToken.trim();
        }

        payload.config = feishuConfig;
        payload.mapping = {
          url: 'URL',
          title: '标题',
          tags: '标签',
          note: '备注',
          folderPath: '文件夹路径',
          browser: '浏览器',
          createdAt: '创建时间',
          favicon: '图标',
          status: '状态'
        };
      } else if (action === 'NORMALIZE_URLS') {
        payload.config = config?.normalization || {
          removeWww: true,
          removeMobile: true,
          removeFragment: true,
          removeTrackingParams: true,
          customTrackingParams: []
        };
      } else if (action === 'CHECK_LINKS') {
        payload.config = {
          timeout: 8000,
          maxRetries: 2,
          maxConcurrency: 50,
          minConcurrency: 10,
          followRedirects: true,
          checkMethod: 'HEAD',
          retryDelay: 1000
        };
      } else if (action === 'DELETE_BOOKMARKS') {
        // 只删除选中的书签
        if (selectedBookmarks.length === 0) {
          throw new Error('请先选择要删除的书签');
        }
        payload.bookmarks = selectedBookmarks;
        payload.config = {};
      }

      const result = await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
          action,
          payload
        }, (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else if (response?.success) {
            resolve(response.data);
          } else {
            reject(new Error(response?.error || '操作失败'));
          }
        });
      });

      // 显示成功消息
      if (action === 'SYNC_TO_FEISHU') {
        const typedResult = result as any;
        const successful = typedResult?.successful || 0;
        const failed = typedResult?.failed || 0;
        const total = typedResult?.total || 0;

        let message = '';
        if (total > 0) {
          message = `同步成功 ${successful} 个`;
          if (failed > 0) {
            message += `，失败 ${failed} 个`;
          }
        } else {
          message = '没有书签需要同步';
        }

        addToast(message, failed > 0 ? 'warning' : 'success');
      } else if (action === 'DELETE_BOOKMARKS') {
        const typedResult = result as any;
        const successful = typedResult?.successful || 0;
        const failed = typedResult?.failed || 0;

        let message = `成功删除 ${successful} 个书签`;
        if (failed > 0) {
          message += `，${failed} 个失败`;
        }

        addToast(message, failed > 0 ? 'warning' : 'success');

        // 删除成功后刷新列表并清空选中
        if (successful > 0) {
          // 只调用一次刷新
          if (onOperationComplete) {
            await onOperationComplete();
          } else {
            onRefresh();
            onSelectBookmarks([]);
          }
        }
      } else if (action === 'CHECK_LINKS') {
        const typedResult = result as any;
        const stats = typedResult?.stats || {};
        const total = stats.total || 0;
        const active = stats.active || 0;
        const broken = stats.broken || 0;
        const unknown = stats.unknown || 0;

        let message = `检测完成：${active} 个正常`;
        if (broken > 0) {
          message += `，${broken} 个失效`;
        }
        if (unknown > 0) {
          message += `，${unknown} 个未知`;
        }

        addToast(message, broken > 0 ? 'warning' : 'success');

        // 检测完成后刷新列表以显示新状态
        onRefresh();

        // 如果有选中的书签，更新它们的状态
        if (selectedBookmarks.length > 0 && typedResult?.data) {
          const updatedBookmarks = typedResult.data as any[];
          const updatedMap = new Map();
          updatedBookmarks.forEach(b => {
            updatedMap.set(b.sourceId, b);
          });

          // 更新选中书签的状态
          const updatedSelected = selectedBookmarks.map(selected => {
            const updated = updatedMap.get(selected.sourceId);
            return updated || selected;
          });
          onSelectBookmarks(updatedSelected);
        }
      }
    } catch (error) {
      console.error('操作失败:', error);
      addToast(`操作失败: ${error instanceof Error ? error.message : String(error)}`, 'error');
    } finally {
      setIsLoading(false);
      setLoadingText('');
      setProgress(0);
    }
  };

  const addToast = (message: string, type: 'success' | 'error' | 'warning' | 'info' = 'info') => {
    const id = Date.now().toString();
    setToasts(prev => [...prev, { id, message, type }]);
  };

  const removeToast = (id: string) => {
    setToasts(prev => prev.filter(toast => toast.id !== id));
  };

  const getOperationInfo = (action: string) => {
    switch (action) {
      case 'SYNC_TO_FEISHU':
        return {
          title: '确认同步到飞书',
          message: `即将同步 ${selectedBookmarks.length > 0 ? selectedBookmarks.length : bookmarks.length} 个书签到飞书多维表格。\n\n此操作将会：\n- 将书签数据导入到飞书表格\n- 自动创建缺失的字段\n- 对重复数据进行更新\n\n请确认是否继续？`,
          type: 'warning' as const,
          requireConfirmText: undefined,
        };
      case 'CHECK_LINKS':
        return {
          title: '确认检测链接',
          message: `即将检测 ${selectedBookmarks.length > 0 ? selectedBookmarks.length : bookmarks.length} 个书签的链接状态。\n\n此操作可能需要较长时间，请确认是否继续？`,
          type: 'info' as const,
          requireConfirmText: undefined,
        };
      case 'DELETE_BOOKMARKS':
        return {
          title: '确认删除书签',
          message: `您确定要删除选中的 ${selectedBookmarks.length} 个书签吗？\n\n⚠️ 此操作不可撤销！`,
          type: 'danger' as const,
          requireConfirmText: undefined,
        };
      default:
        return {
          title: '确认操作',
          message: '请确认是否执行此操作？',
          type: 'warning' as const,
          requireConfirmText: undefined,
        };
    }
  };

  return (
    <div className="bookmark-list">
      <div className="bookmark-list-header">
        <div className="header-row">
          <div className="title-section">
            <h2>书签列表</h2>
          </div>
          
          <div className="action-buttons">
            {/* 数据获取操作 */}
            <button
              className="operation-btn-header"
              onClick={handleRefresh}
              disabled={isLoading}
              title="刷新书签列表"
            >
              🔄 {isLoading ? '刷新中...' : '刷新'}
            </button>
            <button
              className="operation-btn-header"
              onClick={handleScan}
              disabled={isLoading}
              title="重新扫描浏览器书签"
            >
              📚 {isLoading ? '扫描中...' : '重新扫描'}
            </button>

            <div className="button-divider"></div>

            {/* 数据处理操作 */}
            <button
              onClick={() => handleOperation('NORMALIZE_URLS')}
              disabled={isLoading}
              className="operation-btn-header"
              title="规范化URL - 统一URL格式，移除跟踪参数"
            >
              🔧 规范化
            </button>
            <button
              onClick={() => handleOperation('DEDUPE_BOOKMARKS')}
              disabled={isLoading}
              className="operation-btn-header"
              title="去重合并 - 识别并合并重复的书签"
            >
              🔄 去重
            </button>
            <button
              onClick={() => handleOperation('APPLY_TAG_RULES')}
              disabled={isLoading}
              className="operation-btn-header"
              title="应用标签规则 - 根据规则自动添加标签"
            >
              🏷️ 标签
            </button>

            <div className="button-divider"></div>

            {/* 数据验证操作 */}
            <button
              onClick={() => handleOperation('CHECK_LINKS', true)}
              disabled={isLoading}
              className="operation-btn-header check-btn"
              title="检测链接状态 - 验证链接是否有效可访问"
            >
              🔍 检测
            </button>

            <div className="button-divider"></div>

            {/* 数据导出操作 */}
            <button
              onClick={() => handleOperation('SYNC_TO_FEISHU', true)}
              disabled={isLoading}
              className="operation-btn-header sync-btn"
              title="同步到飞书 - 导出书签到飞书多维表格"
            >
              🚀 同步
            </button>
          </div>
        </div>

        <SearchBar
          value={searchQuery}
          onChange={setSearchQuery}
          placeholder="搜索书签标题、URL、标签或文件夹..."
        />
      </div>

      <div className="bookmark-list-body">
        <div className="filters-sidebar">
          <FilterPanel
            filters={filters}
            onFiltersChange={setFilters}
            availableOptions={availableOptions}
            bookmarks={bookmarks}
          />

          {selectedBookmarks.length > 0 && (
            <div className="selection-info-sidebar">
              <div className="selection-count-sidebar">
                已选择 {selectedBookmarks.length} 个书签
              </div>
              <p className="selection-tip">
                批量操作将对选中的书签执行
              </p>
            </div>
          )}
        </div>

        <div className="bookmarks-content">
          <div className="list-controls">
            <div className="selection-controls">
              <button
                className="select-all-btn"
                onClick={handleSelectAll}
              >
                {selectedBookmarks.length === filteredAndSortedBookmarks.length ? '取消全选' : '全选'}
              </button>
              <span className="count-badge">
                已选 {selectedBookmarks.length}/{filteredAndSortedBookmarks.length}
              </span>
              {selectedBookmarks.length > 0 && (
                <button
                  onClick={() => handleOperation('DELETE_BOOKMARKS', true)}
                  disabled={isLoading}
                  className="operation-btn-header delete-btn"
                  title={`删除选中的 ${selectedBookmarks.length} 个书签`}
                  style={{ marginLeft: '12px' }}
                >
                  🗑️ 删除选中
                </button>
              )}
            </div>

            <div className="sort-controls">
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="sort-select"
              >
                <option value="created">按创建时间</option>
                <option value="title">按标题</option>
                <option value="url">按URL</option>
                <option value="folder">按文件夹</option>
              </select>
              <button
                className="sort-order-btn"
                onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
              >
                {sortOrder === 'asc' ? '↑' : '↓'}
              </button>
            </div>
          </div>

          <div className="bookmarks-grid">
            {filteredAndSortedBookmarks.length === 0 ? (
              <div className="empty-state">
                {bookmarks.length === 0 ? (
                  <div className="empty-bookmarks">
                    <h3>暂无书签</h3>
                    <p>点击"重新扫描"按钮扫描浏览器中的书签</p>
                  </div>
                ) : (
                  <div className="no-results">
                    <h3>没有找到匹配的书签</h3>
                    <p>尝试调整搜索条件或过滤器</p>
                  </div>
                )}
              </div>
            ) : (
              filteredAndSortedBookmarks.map(bookmark => (
                <BookmarkItem
                  key={bookmark.sourceId}
                  bookmark={bookmark}
                  selected={selectedBookmarks.some(b => b.sourceId === bookmark.sourceId)}
                  onSelect={handleBookmarkSelect}
                />
              ))
            )}
          </div>
        </div>
      </div>

      {/* 确认对话框 */}
      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        title={confirmDialog.title}
        message={confirmDialog.message}
        type={confirmDialog.type}
        requireConfirmText={confirmDialog.requireConfirmText}
        onConfirm={() => {
          setConfirmDialog({ ...confirmDialog, isOpen: false });
          confirmDialog.onConfirm();
        }}
        onCancel={() => setConfirmDialog({ ...confirmDialog, isOpen: false })}
      />

      {/* 加载覆盖层 */}
      {isLoading && (
        <LoadingSpinner
          text={loadingText}
          progress={progress}
          overlay={true}
        />
      )}

      {/* Toast 通知 */}
      <ToastContainer>
        {toasts.map(toast => (
          <Toast
            key={toast.id}
            message={toast.message}
            type={toast.type}
            onClose={() => removeToast(toast.id)}
          />
        ))}
      </ToastContainer>
    </div>
  );
};