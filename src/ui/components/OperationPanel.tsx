import React, { useState, useEffect } from 'react';
import { Bookmark } from '@/types/bookmark';
import { LoadingSpinner } from './LoadingSpinner';
import './OperationPanel.css';

interface OperationPanelProps {
  bookmarks: Bookmark[];
  selectedBookmarks: Bookmark[];
  onOperationComplete: () => Promise<void>;
  config?: any;
}

export const OperationPanel: React.FC<OperationPanelProps> = ({
  bookmarks,
  selectedBookmarks,
  onOperationComplete,
  config
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const [loadingText, setLoadingText] = useState('');
  const [progress, setProgress] = useState(0);

  // 监听进度更新消息
  useEffect(() => {
    const handleMessage = (message: any) => {
      if (message.type === 'SYNC_PROGRESS') {
        const progressPercent = (message.progress.processed / message.progress.total) * 100;
        setProgress(progressPercent);
        
        // 使用自定义状态文本，如果有的话
        let statusText = message.progress.status || `正在同步到飞书... ${message.progress.processed}/${message.progress.total}`;
        
        // 如果是导入阶段且有成功/失败统计，显示更详细信息
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

  const handleOperation = async (action: string) => {
    setIsLoading(true);
    setProgress(0);
    
    // 设置加载提示文本
    const loadingTexts: Record<string, string> = {
      'CHECK_LINKS': '正在检测链接状态...',
      'SYNC_TO_FEISHU': '正在同步到飞书...',
      'DEDUPE_BOOKMARKS': '正在去重...',
      'NORMALIZE_URLS': '正在规范化URL...',
      'DELETE_SELECTED': '正在删除...',
      'TAG_BOOKMARKS': '正在自动标记...'
    };
    setLoadingText(loadingTexts[action] || '正在处理...');
    
    try {
      // 构建payload
      const bookmarksToSync = selectedBookmarks.length > 0 ? selectedBookmarks : bookmarks;
      console.log(`准备同步 ${bookmarksToSync.length} 个书签:`, bookmarksToSync.slice(0, 3)); // 显示前3个用于调试
      
      let payload: any = {
        bookmarks: bookmarksToSync
      };

      // 为特定操作添加额外参数
      if (action === 'SYNC_TO_FEISHU') {
        if (!config?.feishu?.appId || !config?.feishu?.appSecret) {
          throw new Error('请先在配置设置中填写飞书App ID和App Secret');
        }
        if (!config?.feishu?.baseId || !config?.feishu?.tableId) {
          throw new Error('请先在配置设置中填写Base Token（多维表格ID）和Table ID（数据表ID）');
        }
        
        // 构建飞书配置，优先使用手动Token
        const feishuConfig = { ...config.feishu };
        if (config.feishu.manualToken && config.feishu.manualToken.trim()) {
          feishuConfig.accessToken = config.feishu.manualToken.trim();
          console.log('🔑 使用手动输入的Access Token进行同步');
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
      
      await onOperationComplete();
      
      // 显示成功消息
      if (action === 'SYNC_TO_FEISHU') {
        console.log('飞书同步结果:', result);
        const successful = result?.successful || 0;
        const failed = result?.failed || 0;
        const total = result?.total || 0;
        
        let message = `同步完成！`;
        if (total > 0) {
          message += `\n总计: ${total} 个书签`;
          message += `\n成功: ${successful} 个`;
          if (failed > 0) {
            message += `\n失败: ${failed} 个`;
          }
        } else {
          message += `\n没有书签需要同步。`;
          message += `\n请确保已选择要同步的书签。`;
        }
        
        alert(message);
      }
    } catch (error) {
      console.error('操作失败:', error);
      alert(`操作失败: ${error.message}`);
    } finally {
      setIsLoading(false);
      setLoadingText('');
      setProgress(0);
    }
  };

  return (
    <div className={`operation-panel ${isLoading ? 'loading' : ''}`}>
      <h2>批量操作</h2>
      <div className="operation-groups">
        <div className="operation-group">
          <h3>数据处理</h3>
          <p className="group-description">对书签数据进行清洗和规范化处理</p>
          <button 
            onClick={() => handleOperation('NORMALIZE_URLS')} 
            disabled={isLoading}
            className="operation-btn"
          >
            <span className="btn-icon">🔧</span>
            <span className="btn-content">
              <span className="btn-title">规范化URL</span>
              <span className="btn-desc">统一URL格式，移除跟踪参数</span>
            </span>
          </button>
          <button 
            onClick={() => handleOperation('DEDUPLICATE_BOOKMARKS')} 
            disabled={isLoading}
            className="operation-btn"
          >
            <span className="btn-icon">🔄</span>
            <span className="btn-content">
              <span className="btn-title">去重合并</span>
              <span className="btn-desc">识别并合并重复的书签</span>
            </span>
          </button>
          <button 
            onClick={() => handleOperation('APPLY_TAG_RULES')} 
            disabled={isLoading}
            className="operation-btn"
          >
            <span className="btn-icon">🏷️</span>
            <span className="btn-content">
              <span className="btn-title">应用标签规则</span>
              <span className="btn-desc">根据规则自动添加标签</span>
            </span>
          </button>
        </div>

        <div className="operation-group">
          <h3>链接检测</h3>
          <p className="group-description">检查书签链接的可用性状态</p>
          <button 
            onClick={() => handleOperation('CHECK_LINKS')} 
            disabled={isLoading}
            className="operation-btn"
          >
            <span className="btn-icon">🔍</span>
            <span className="btn-content">
              <span className="btn-title">检测链接状态</span>
              <span className="btn-desc">验证链接是否有效可访问</span>
            </span>
          </button>
        </div>

        <div className="operation-group">
          <h3>飞书同步</h3>
          <p className="group-description">将书签数据同步到飞书多维表格</p>
          <button 
            onClick={() => handleOperation('SYNC_TO_FEISHU')} 
            disabled={isLoading}
            className="operation-btn"
          >
            <span className="btn-icon">🚀</span>
            <span className="btn-content">
              <span className="btn-title">同步到飞书</span>
              <span className="btn-desc">导出书签到飞书多维表格</span>
            </span>
          </button>
        </div>
      </div>
      
      {selectedBookmarks.length > 0 && (
        <div className="selection-info">
          <span className="selection-count">
            已选择 {selectedBookmarks.length} 个书签进行操作
          </span>
        </div>
      )}
      
      {/* 加载覆盖层 */}
      {isLoading && (
        <LoadingSpinner 
          text={loadingText} 
          progress={progress} 
          overlay={true} 
        />
      )}
    </div>
  );
};