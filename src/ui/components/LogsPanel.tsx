import React, { useState, useEffect } from 'react';
import { Logger, LogEntry } from '@/modules/logger';
import { LoadingSpinner } from './LoadingSpinner';
import './LogsPanel.css';

export const LogsPanel: React.FC = () => {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [filteredLogs, setFilteredLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedLevel, setSelectedLevel] = useState<string>('all');
  const [selectedAction, setSelectedAction] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    loadLogs();
  }, []);

  useEffect(() => {
    filterLogs();
  }, [logs, selectedLevel, selectedAction, searchQuery]);

  const loadLogs = async () => {
    try {
      setLoading(true);
      const logEntries = await Logger.getLogs();
      setLogs(logEntries);
    } catch (error) {
      console.error('加载日志失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const filterLogs = () => {
    let filtered = logs;

    // 按级别过滤
    if (selectedLevel !== 'all') {
      filtered = filtered.filter(log => log.level === selectedLevel);
    }

    // 按操作过滤
    if (selectedAction !== 'all') {
      filtered = filtered.filter(log => log.action === selectedAction);
    }

    // 按搜索词过滤
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(log =>
        log.message.toLowerCase().includes(query) ||
        log.action.toLowerCase().includes(query) ||
        (log.details && JSON.stringify(log.details).toLowerCase().includes(query))
      );
    }

    setFilteredLogs(filtered);
  };

  const clearLogs = async () => {
    if (confirm('确定要清空所有日志吗？')) {
      await Logger.clearLogs();
      setLogs([]);
    }
  };

  const exportLogs = async () => {
    try {
      const logData = await Logger.exportLogs();
      const blob = new Blob([logData], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `extension-logs-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      alert(`导出失败: ${error.message}`);
    }
  };

  const getLevelIcon = (level: string) => {
    switch (level) {
      case 'error': return '❌';
      case 'warn': return '⚠️';
      case 'info': return 'ℹ️';
      case 'debug': return '🐛';
      default: return '📝';
    }
  };

  const getLevelClass = (level: string) => {
    return `log-level-${level}`;
  };

  const uniqueActions = [...new Set(logs.map(log => log.action))];

  if (loading) {
    return (
      <div className="logs-panel loading">
        <LoadingSpinner text="加载日志中..." />
      </div>
    );
  }

  return (
    <div className="logs-panel">
      <div className="logs-header">
        <h2>操作日志</h2>
        <div className="logs-stats">
          <span className="stat-item">总计: {logs.length}</span>
          <span className="stat-item error">错误: {logs.filter(l => l.level === 'error').length}</span>
          <span className="stat-item warn">警告: {logs.filter(l => l.level === 'warn').length}</span>
        </div>
      </div>

      <div className="logs-controls">
        <div className="filter-row">
          <div className="filter-group">
            <label>级别:</label>
            <select value={selectedLevel} onChange={(e) => setSelectedLevel(e.target.value)}>
              <option value="all">全部</option>
              <option value="error">错误</option>
              <option value="warn">警告</option>
              <option value="info">信息</option>
              <option value="debug">调试</option>
            </select>
          </div>

          <div className="filter-group">
            <label>操作:</label>
            <select value={selectedAction} onChange={(e) => setSelectedAction(e.target.value)}>
              <option value="all">全部</option>
              {uniqueActions.map(action => (
                <option key={action} value={action}>{action}</option>
              ))}
            </select>
          </div>

          <div className="filter-group search-group">
            <label>搜索:</label>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="搜索日志内容..."
              className="search-input"
            />
          </div>
        </div>

        <div className="action-buttons">
          <button onClick={loadLogs} className="refresh-btn">
            🔄 刷新
          </button>
          <button onClick={exportLogs} className="export-btn">
            📥 导出
          </button>
          <button onClick={clearLogs} className="clear-btn">
            🗑️ 清空
          </button>
        </div>
      </div>

      <div className="logs-content">
        {filteredLogs.length === 0 ? (
          <div className="empty-logs">
            {logs.length === 0 ? '暂无日志记录' : '没有符合条件的日志'}
          </div>
        ) : (
          <div className="logs-list">
            {filteredLogs.map(log => (
              <div key={log.id} className={`log-entry ${getLevelClass(log.level)}`}>
                <div className="log-header">
                  <span className="log-level">
                    {getLevelIcon(log.level)} {log.level.toUpperCase()}
                  </span>
                  <span className="log-action">[{log.action}]</span>
                  <span className="log-time">
                    {new Date(log.timestamp).toLocaleString('zh-CN')}
                  </span>
                </div>
                
                <div className="log-message">{log.message}</div>
                
                {log.details && (
                  <div className="log-details">
                    <details>
                      <summary>详情</summary>
                      <pre>{typeof log.details === 'string' ? log.details : JSON.stringify(log.details, null, 2)}</pre>
                    </details>
                  </div>
                )}
                
                {log.error && (
                  <div className="log-error">
                    <div className="error-message">
                      <strong>{log.error.name}:</strong> {log.error.message}
                    </div>
                    {log.error.stack && (
                      <details className="error-stack">
                        <summary>堆栈跟踪</summary>
                        <pre>{log.error.stack}</pre>
                      </details>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};