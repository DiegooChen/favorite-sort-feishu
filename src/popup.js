document.addEventListener('DOMContentLoaded', function() {
  const openOptionsBtn = document.getElementById('openOptions');
  const scanBookmarksBtn = document.getElementById('scanBookmarks');
  const checkLinksBtn = document.getElementById('checkLinks');
  
  const totalBookmarksEl = document.getElementById('totalBookmarks');
  const totalFoldersEl = document.getElementById('totalFolders');
  const lastScanEl = document.getElementById('lastScan');

  // 加载统计信息
  loadStats();

  // 打开选项页面
  openOptionsBtn.addEventListener('click', function() {
    chrome.runtime.openOptionsPage();
  });

  // 扫描书签
  scanBookmarksBtn.addEventListener('click', async function() {
    scanBookmarksBtn.textContent = '扫描中...';
    scanBookmarksBtn.disabled = true;
    
    try {
      const response = await sendMessage('SCAN_BOOKMARKS');
      if (response.success) {
        updateStats(response.data, response.stats);
        showNotification('扫描完成！', 'success');
      } else {
        throw new Error(response.error);
      }
    } catch (error) {
      showNotification('扫描失败: ' + error.message, 'error');
    } finally {
      scanBookmarksBtn.textContent = '快速扫描书签';
      scanBookmarksBtn.disabled = false;
    }
  });

  // 检测链接
  checkLinksBtn.addEventListener('click', async function() {
    checkLinksBtn.textContent = '检测中...';
    checkLinksBtn.disabled = true;
    
    try {
      // 先获取书签
      const bookmarksResponse = await sendMessage('GET_STORAGE_DATA', { key: 'bookmarks' });
      if (bookmarksResponse.success && bookmarksResponse.data.length > 0) {
        const response = await sendMessage('CHECK_LINKS', {
          bookmarks: bookmarksResponse.data.slice(0, 50), // 只检查前50个
          config: { timeout: 5000, batchSize: 5 }
        });
        
        if (response.success) {
          showNotification('链接检测完成！', 'success');
        } else {
          throw new Error(response.error);
        }
      } else {
        showNotification('没有找到书签，请先扫描', 'warning');
      }
    } catch (error) {
      showNotification('检测失败: ' + error.message, 'error');
    } finally {
      checkLinksBtn.textContent = '检测链接状态';
      checkLinksBtn.disabled = false;
    }
  });

  async function loadStats() {
    try {
      const response = await sendMessage('GET_STORAGE_DATA', { key: 'bookmarks' });
      if (response.success) {
        const bookmarks = response.data || [];
        const folders = new Set();
        
        bookmarks.forEach(bookmark => {
          if (bookmark.folderPath) {
            folders.add(bookmark.folderPath);
          }
        });
        
        updateStats(bookmarks, {
          totalBookmarks: bookmarks.length,
          totalFolders: folders.size
        });
      }
    } catch (error) {
      console.error('加载统计信息失败:', error);
    }
  }

  function updateStats(bookmarks, stats) {
    totalBookmarksEl.textContent = stats.totalBookmarks || 0;
    totalFoldersEl.textContent = stats.totalFolders || 0;
    lastScanEl.textContent = new Date().toLocaleTimeString();
  }

  function showNotification(message, type = 'info') {
    // 简单的通知实现
    const notification = document.createElement('div');
    notification.style.cssText = `
      position: fixed;
      top: 10px;
      right: 10px;
      padding: 8px 12px;
      border-radius: 4px;
      font-size: 12px;
      z-index: 1000;
      max-width: 200px;
      word-wrap: break-word;
      ${type === 'success' ? 'background: #d4edda; color: #155724; border: 1px solid #c3e6cb;' : ''}
      ${type === 'error' ? 'background: #f8d7da; color: #721c24; border: 1px solid #f5c6cb;' : ''}
      ${type === 'warning' ? 'background: #fff3cd; color: #856404; border: 1px solid #ffeaa7;' : ''}
      ${type === 'info' ? 'background: #d1ecf1; color: #0c5460; border: 1px solid #bee5eb;' : ''}
    `;
    notification.textContent = message;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
      if (notification.parentNode) {
        notification.parentNode.removeChild(notification);
      }
    }, 3000);
  }

  function sendMessage(action, payload) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ action, payload }, (response) => {
        resolve(response || { success: false, error: 'No response' });
      });
    });
  }
});