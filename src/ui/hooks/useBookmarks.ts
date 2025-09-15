import { useState, useEffect, useCallback } from 'react';
import { Bookmark } from '@/types/bookmark';

interface BookmarkStats {
  totalBookmarks: number;
  totalFolders: number;
  byFolder: Record<string, number>;
}

export const useBookmarks = () => {
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [stats, setStats] = useState<BookmarkStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const sendMessage = useCallback(async (action: string, payload?: any) => {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ action, payload }, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else if (response?.success) {
          resolve(response.data);
        } else {
          reject(new Error(response?.error || '操作失败'));
        }
      });
    });
  }, []);

  const refreshBookmarks = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const data = await sendMessage('GET_STORAGE_DATA', { key: 'bookmarks' }) as Bookmark[];
      setBookmarks(data || []);

      // 计算统计信息
      if (data && data.length > 0) {
        const byFolder: Record<string, number> = {};
        const folders = new Set<string>();
        
        data.forEach(bookmark => {
          const folder = bookmark.folderPath || '根目录';
          byFolder[folder] = (byFolder[folder] || 0) + 1;
          if (!bookmark.url) folders.add(folder);
        });
        
        setStats({
          totalBookmarks: data.length,
          totalFolders: folders.size,
          byFolder
        });
      } else {
        setStats(null);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [sendMessage]);

  const scanBookmarks = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      // sendMessage 返回的是 response.data，即书签数组
      const bookmarksData = await sendMessage('SCAN_BOOKMARKS') as Bookmark[];
      setBookmarks(bookmarksData || []);
      
      // 计算统计信息
      if (bookmarksData && bookmarksData.length > 0) {
        const byFolder: Record<string, number> = {};
        const folders = new Set<string>();
        
        bookmarksData.forEach(bookmark => {
          const folder = bookmark.folderPath || '根目录';
          byFolder[folder] = (byFolder[folder] || 0) + 1;
          if (!bookmark.url) folders.add(folder);
        });
        
        setStats({
          totalBookmarks: bookmarksData.length,
          totalFolders: folders.size,
          byFolder
        });
      } else {
        setStats(null);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [sendMessage]);

  useEffect(() => {
    refreshBookmarks();
  }, [refreshBookmarks]);

  return {
    bookmarks,
    stats,
    loading,
    error,
    refreshBookmarks,
    scanBookmarks,
    sendMessage
  };
};