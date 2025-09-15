import React, { useEffect } from 'react';
import { Bookmark } from '@/types/bookmark';
import './FilterPanel.css';

interface FilterPanelProps {
  filters: any;
  onFiltersChange: (filters: any) => void;
  availableOptions: any;
  bookmarks?: Bookmark[]; // 添加bookmarks参数用于计算数量
}

export const FilterPanel: React.FC<FilterPanelProps> = ({
  filters,
  onFiltersChange,
  availableOptions,
  bookmarks = []
}) => {
  // 自动清理不存在的过滤器选项
  useEffect(() => {
    let hasChanges = false;
    let updatedFilters = { ...filters };

    // 清理不存在的文件夹过滤器
    const existingFolders = new Set(
      availableOptions.folders.filter((folder: string) =>
        bookmarks.some(b => b.folderPath === folder)
      )
    );

    const validFolders = filters.folders.filter((folder: string) =>
      existingFolders.has(folder)
    );

    if (validFolders.length !== filters.folders.length) {
      updatedFilters.folders = validFolders;
      hasChanges = true;
    }

    // 清理不存在的状态过滤器
    const existingStatuses = new Set(
      availableOptions.statuses.filter((status: string) =>
        bookmarks.some(b => b.status === status)
      )
    );

    const validStatuses = filters.status.filter((status: string) =>
      existingStatuses.has(status)
    );

    if (validStatuses.length !== filters.status.length) {
      updatedFilters.status = validStatuses;
      hasChanges = true;
    }

    // 如果有变化，更新过滤器
    if (hasChanges) {
      onFiltersChange(updatedFilters);
    }
  }, [bookmarks, availableOptions.folders, availableOptions.statuses, filters, onFiltersChange]);
  // 计算每种状态的数量
  const getStatusCount = (status: string) => {
    return bookmarks.filter(bookmark => bookmark.status === status).length;
  };

  // 获取状态图标和颜色
  const getStatusInfo = (status: string) => {
    switch (status) {
      case 'OK':
        return { icon: '✅', color: '#10b981', bgColor: '#ecfdf5' };
      case 'Broken':
        return { icon: '❌', color: '#ef4444', bgColor: '#fef2f2' };
      case 'Timeout':
        return { icon: '⏱️', color: '#f59e0b', bgColor: '#fffbeb' };
      case 'Redirect':
        return { icon: '🔄', color: '#3b82f6', bgColor: '#eff6ff' };
      default:
        return { icon: '❓', color: '#6b7280', bgColor: '#f9fafb' };
    }
  };

  const handleStatusToggle = (status: string, checked: boolean) => {
    const newStatus = checked 
      ? [...filters.status, status]
      : filters.status.filter((s: string) => s !== status);
    onFiltersChange({ ...filters, status: newStatus });
  };

  const handleFolderToggle = (folder: string, checked: boolean) => {
    const newFolders = checked 
      ? [...filters.folders, folder]
      : filters.folders.filter((f: string) => f !== folder);
    onFiltersChange({ ...filters, folders: newFolders });
  };

  return (
    <div className="filter-panel">
      <h3>过滤器</h3>

      <div className="filter-groups vertical-layout">
        {/* 状态过滤器 */}
        <div className="filter-group">
          <h4>链接状态</h4>
          <div className="status-filters card-layout">
            {availableOptions.statuses
              .filter((status: string) => {
                // 只显示实际存在的状态
                const count = getStatusCount(status);
                return count > 0;
              })
              .map((status: string) => {
                const statusInfo = getStatusInfo(status);
                const count = getStatusCount(status);
                const isActive = filters.status.includes(status);

                return (
                  <label
                    key={status}
                    className="status-filter-card"
                  >
                    <input
                      type="checkbox"
                      checked={isActive}
                      onChange={() => handleStatusToggle(status, !isActive)}
                      style={{ display: 'none' }}
                    />
                    <div className={`status-checkbox-card ${isActive ? 'checked' : ''}`}>
                      {isActive && '✓'}
                    </div>
                    <div className="status-card-content">
                      <div className="status-icon-large">{statusInfo.icon}</div>
                      <div className="status-name">{status}</div>
                      <div className="status-count">({count})</div>
                    </div>
                  </label>
                );
              })}
          </div>
        </div>

        {/* 文件夹过滤器 */}
        {availableOptions.folders.length > 0 && (
          <div className="filter-group">
            <h4>文件夹</h4>
            <div className="status-filters card-layout">
              {availableOptions.folders
                .filter((folder: string) => {
                  // 只显示实际包含书签的文件夹
                  const count = bookmarks.filter(b => b.folderPath === folder).length;
                  return count > 0;
                })
                .map((folder: string) => {
                  const isActive = filters.folders.includes(folder);
                  const count = bookmarks.filter(b => b.folderPath === folder).length;

                  return (
                    <label
                      key={folder}
                      className="status-filter-card"
                    >
                      <input
                        type="checkbox"
                        checked={isActive}
                        onChange={() => handleFolderToggle(folder, !isActive)}
                        style={{ display: 'none' }}
                      />
                      <div className={`status-checkbox-card ${isActive ? 'checked' : ''}`}>
                        {isActive && '✓'}
                      </div>
                      <div className="status-card-content">
                        <div className="status-icon-large">📁</div>
                        <div className="status-name" title={folder}>
                          {folder.split('/').pop() || folder}
                        </div>
                        <div className="status-count">({count})</div>
                      </div>
                    </label>
                  );
                })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};