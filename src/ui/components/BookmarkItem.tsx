import React, { useState } from 'react';
import { Bookmark } from '@/types/bookmark';
import clsx from 'clsx';
import './BookmarkItem.css';

interface BookmarkItemProps {
  bookmark: Bookmark;
  selected: boolean;
  onSelect: (bookmark: Bookmark, selected: boolean) => void;
}

export const BookmarkItem: React.FC<BookmarkItemProps> = ({
  bookmark,
  selected,
  onSelect
}) => {
  const [expanded, setExpanded] = useState(false);

  const handleSelect = () => {
    onSelect(bookmark, !selected);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'OK': return '#10b981';
      case 'Broken': return '#ef4444';
      case 'Redirect': return '#f59e0b';
      case 'Timeout': return '#6b7280';
      default: return '#9ca3af';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'OK': return '正常';
      case 'Broken': return '失效';
      case 'Redirect': return '重定向';
      case 'Timeout': return '超时';
      default: return '未知';
    }
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleString('zh-CN');
  };

  const getDomainFromUrl = (url: string) => {
    try {
      return new URL(url).hostname;
    } catch {
      return url;
    }
  };

  return (
    <div className={clsx('bookmark-item', { selected, expanded })}>
      <div className="bookmark-header" onClick={() => setExpanded(!expanded)}>
        <div className="bookmark-main">
          <div className="checkbox-section">
            <input
              type="checkbox"
              checked={selected}
              onChange={handleSelect}
              onClick={(e) => e.stopPropagation()}
              className="bookmark-checkbox"
            />
          </div>

          <div className="bookmark-info">
            <div className="bookmark-title">
              <span className="title-text">{bookmark.title}</span>
              <div className="status-badge" style={{ backgroundColor: getStatusColor(bookmark.status) }}>
                {getStatusText(bookmark.status)}
              </div>
            </div>
            
            <div className="bookmark-url">
              <span className="url-domain">{getDomainFromUrl(bookmark.url)}</span>
              <span className="url-path">{bookmark.url.replace(/^https?:\/\/[^/]+/, '')}</span>
            </div>

            <div className="bookmark-meta">
              <span className="meta-item">
                📁 {bookmark.folderPath || '根目录'}
              </span>
              <span className="meta-item">
                🌐 {bookmark.browser}
              </span>
              <span className="meta-item">
                📅 {formatDate(bookmark.createdAt)}
              </span>
            </div>
          </div>
        </div>

        <div className="bookmark-actions">
          {bookmark.tags.length > 0 && (
            <div className="tags">
              {bookmark.tags.slice(0, 3).map(tag => (
                <span key={tag} className="tag">
                  {tag}
                </span>
              ))}
              {bookmark.tags.length > 3 && (
                <span className="tag more">+{bookmark.tags.length - 3}</span>
              )}
            </div>
          )}
          
          <button className="expand-btn">
            {expanded ? '▲' : '▼'}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="bookmark-details">
          <div className="detail-section">
            <h4>完整URL</h4>
            <div className="url-display">
              <a href={bookmark.url} target="_blank" rel="noopener noreferrer">
                {bookmark.url}
              </a>
              <button 
                className="copy-btn"
                onClick={() => navigator.clipboard.writeText(bookmark.url)}
              >
                📋
              </button>
            </div>
          </div>

          {bookmark.normalizedUrl && bookmark.normalizedUrl !== bookmark.url && (
            <div className="detail-section">
              <h4>规范化URL</h4>
              <div className="url-display">
                <span className="normalized-url">{bookmark.normalizedUrl}</span>
              </div>
            </div>
          )}

          {bookmark.tags.length > 0 && (
            <div className="detail-section">
              <h4>标签</h4>
              <div className="tags-full">
                {bookmark.tags.map(tag => (
                  <span key={tag} className="tag">
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          )}

          {bookmark.note && (
            <div className="detail-section">
              <h4>备注</h4>
              <div className="note-content">
                {bookmark.note}
              </div>
            </div>
          )}

          <div className="detail-section">
            <h4>技术信息</h4>
            <div className="technical-info">
              <div className="info-item">
                <span className="info-label">来源ID:</span>
                <span className="info-value">{bookmark.sourceId}</span>
              </div>
              <div className="info-item">
                <span className="info-label">浏览器节点:</span>
                <span className="info-value">
                  {JSON.stringify(bookmark.browserNodeIds)}
                </span>
              </div>
              {bookmark.faviconUrl && (
                <div className="info-item">
                  <span className="info-label">图标:</span>
                  <img 
                    src={bookmark.faviconUrl} 
                    alt="favicon"
                    className="favicon-img"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = 'none';
                    }}
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};