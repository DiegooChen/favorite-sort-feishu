import { Bookmark, OperationLog } from '@/types/bookmark';
import { BookmarkScanner } from '@/modules/scanner';
import { Storage } from '@/modules/storage';

export interface DeleteConfig {
  deleteStrategy: 'individual' | 'batch' | 'folder';
  confirmEach: boolean;
  createBackup: boolean;
  dryRun: boolean;
}

export interface DeleteResult {
  totalRequested: number;
  deleted: number;
  skipped: number;
  failed: number;
  errors: Array<{
    bookmark: Bookmark;
    error: string;
  }>;
}

export interface DeleteProgress {
  total: number;
  processed: number;
  deleted: number;
  skipped: number;
  failed: number;
  currentUrl?: string;
}

export class BookmarkDeleter {
  static async deleteBookmarks(
    bookmarks: Bookmark[],
    config: DeleteConfig = {
      deleteStrategy: 'individual',
      confirmEach: false,
      createBackup: true,
      dryRun: false
    },
    onProgress?: (progress: DeleteProgress) => void
  ): Promise<DeleteResult> {
    const result: DeleteResult = {
      totalRequested: bookmarks.length,
      deleted: 0,
      skipped: 0,
      failed: 0,
      errors: []
    };

    const progress: DeleteProgress = {
      total: bookmarks.length,
      processed: 0,
      deleted: 0,
      skipped: 0,
      failed: 0
    };

    if (config.createBackup) {
      await this.createBackupSnapshot('pre-delete');
    }

    const operationId = this.generateOperationId();
    
    try {
      for (const bookmark of bookmarks) {
        progress.currentUrl = bookmark.url;
        onProgress?.(progress);

        if (config.dryRun) {
          result.deleted++;
          progress.deleted++;
        } else {
          const deleteSuccess = await this.deleteSingleBookmark(bookmark, config);
          
          if (deleteSuccess) {
            result.deleted++;
            progress.deleted++;
          } else {
            result.failed++;
            progress.failed++;
            result.errors.push({
              bookmark,
              error: '删除失败'
            });
          }
        }

        progress.processed++;
        onProgress?.(progress);
      }

      // 记录操作日志
      const log: OperationLog = {
        id: operationId,
        type: 'DELETE_PARTIAL',
        browser: this.getCurrentBrowser(),
        timestamp: Date.now(),
        payload: {
          bookmarks: bookmarks.map(b => ({
            url: b.url,
            title: b.title,
            folderPath: b.folderPath
          })),
          config
        },
        stats: {
          affected: bookmarks.length,
          success: result.deleted,
          skipped: result.skipped,
          failed: result.failed
        }
      };

      await Storage.saveOperationLog(log);

    } catch (error) {
      console.error('批量删除操作失败:', error);
      result.errors.push({
        bookmark: bookmarks[0] || {} as Bookmark,
        error: error.message
      });
    }

    return result;
  }

  private static async deleteSingleBookmark(
    bookmark: Bookmark,
    config: DeleteConfig
  ): Promise<boolean> {
    try {
      const browserNodeIds = this.getBrowserNodeIds(bookmark);
      
      for (const nodeId of browserNodeIds) {
        await chrome.bookmarks.remove(nodeId);
      }
      
      return true;
    } catch (error) {
      console.error(`删除书签失败 ${bookmark.url}:`, error);
      return false;
    }
  }

  private static getBrowserNodeIds(bookmark: Bookmark): string[] {
    const nodeIds: string[] = [];
    const browser = this.getCurrentBrowser().toLowerCase() as 'chrome' | 'edge';
    
    if (bookmark.browserNodeIds[browser]) {
      nodeIds.push(...bookmark.browserNodeIds[browser]);
    }
    
    if (nodeIds.length === 0 && bookmark.sourceId) {
      nodeIds.push(bookmark.sourceId);
    }
    
    return nodeIds;
  }

  static async deleteAllBookmarks(
    config: DeleteConfig = {
      deleteStrategy: 'batch',
      confirmEach: false,
      createBackup: true,
      dryRun: false
    }
  ): Promise<DeleteResult> {
    if (config.createBackup) {
      await this.createBackupSnapshot('pre-delete-all');
    }

    const allBookmarks = await BookmarkScanner.scanAll();
    
    const operationId = this.generateOperationId();
    const result: DeleteResult = {
      totalRequested: allBookmarks.length,
      deleted: 0,
      skipped: 0,
      failed: 0,
      errors: []
    };

    try {
      if (config.dryRun) {
        result.deleted = allBookmarks.length;
      } else {
        // 获取根节点
        const tree = await chrome.bookmarks.getTree();
        
        for (const root of tree) {
          if (root.children) {
            for (const child of root.children) {
              // 跳过系统文件夹
              if (this.isSystemFolder(child.title)) {
                continue;
              }
              
              try {
                await this.deleteBookmarkNode(child.id!);
                result.deleted += await this.countBookmarksInNode(child);
              } catch (error) {
                result.failed++;
                result.errors.push({
                  bookmark: {
                    url: child.url || '',
                    title: child.title,
                    folderPath: child.title,
                    createdAt: child.dateAdded || Date.now(),
                    browser: this.getCurrentBrowser(),
                    tags: [],
                    note: '',
                    status: 'Unknown',
                    normalizedUrl: child.url || '',
                    sourceId: child.id || '',
                    browserNodeIds: {}
                  },
                  error: error.message
                });
              }
            }
          }
        }
      }

      const log: OperationLog = {
        id: operationId,
        type: 'DELETE_ALL',
        browser: this.getCurrentBrowser(),
        timestamp: Date.now(),
        payload: { config },
        stats: {
          affected: result.totalRequested,
          success: result.deleted,
          skipped: result.skipped,
          failed: result.failed
        }
      };

      await Storage.saveOperationLog(log);

    } catch (error) {
      console.error('清空所有书签失败:', error);
      result.errors.push({
        bookmark: {} as Bookmark,
        error: error.message
      });
    }

    return result;
  }

  private static async deleteBookmarkNode(nodeId: string): Promise<void> {
    try {
      const nodes = await chrome.bookmarks.getChildren(nodeId);
      
      // 递归删除子节点
      for (const child of nodes) {
        if (child.children) {
          await this.deleteBookmarkNode(child.id!);
        } else {
          await chrome.bookmarks.remove(child.id!);
        }
      }
      
      // 删除文件夹本身
      await chrome.bookmarks.remove(nodeId);
    } catch (error) {
      console.error(`删除节点 ${nodeId} 失败:`, error);
      throw error;
    }
  }

  private static async countBookmarksInNode(node: chrome.bookmarks.BookmarkTreeNode): Promise<number> {
    let count = 0;
    
    if (node.url) {
      count = 1;
    }
    
    if (node.children) {
      for (const child of node.children) {
        count += await this.countBookmarksInNode(child);
      }
    }
    
    return count;
  }

  static async deleteBrokenBookmarks(
    bookmarks: Bookmark[],
    config: Partial<DeleteConfig> = {}
  ): Promise<DeleteResult> {
    const brokenBookmarks = bookmarks.filter(b => b.status === 'Broken');
    
    return this.deleteBookmarks(brokenBookmarks, {
      deleteStrategy: 'batch',
      confirmEach: false,
      createBackup: true,
      dryRun: false,
      ...config
    });
  }

  static async deleteDuplicateBookmarks(
    bookmarks: Bookmark[],
    keepStrategy: 'newest' | 'oldest' | 'first' = 'newest',
    config: Partial<DeleteConfig> = {}
  ): Promise<DeleteResult> {
    const duplicateGroups = this.groupByNormalizedUrl(bookmarks);
    const toDelete: Bookmark[] = [];

    for (const [url, group] of duplicateGroups) {
      if (group.length > 1) {
        const sorted = [...group];
        
        switch (keepStrategy) {
          case 'newest':
            sorted.sort((a, b) => b.createdAt - a.createdAt);
            break;
          case 'oldest':
            sorted.sort((a, b) => a.createdAt - b.createdAt);
            break;
          case 'first':
            // 保持原顺序，删除后面的
            break;
        }
        
        // 保留第一个，删除其余的
        toDelete.push(...sorted.slice(1));
      }
    }

    return this.deleteBookmarks(toDelete, {
      deleteStrategy: 'batch',
      confirmEach: false,
      createBackup: true,
      dryRun: false,
      ...config
    });
  }

  private static groupByNormalizedUrl(bookmarks: Bookmark[]): Map<string, Bookmark[]> {
    const groups = new Map<string, Bookmark[]>();
    
    for (const bookmark of bookmarks) {
      const key = bookmark.normalizedUrl;
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(bookmark);
    }
    
    return groups;
  }

  static async deleteByTags(
    bookmarks: Bookmark[],
    tags: string[],
    config: Partial<DeleteConfig> = {}
  ): Promise<DeleteResult> {
    const toDelete = bookmarks.filter(bookmark =>
      tags.some(tag => bookmark.tags.includes(tag))
    );

    return this.deleteBookmarks(toDelete, {
      deleteStrategy: 'batch',
      confirmEach: false,
      createBackup: true,
      dryRun: false,
      ...config
    });
  }

  static async deleteByFolder(
    folderPath: string,
    config: Partial<DeleteConfig> = {}
  ): Promise<DeleteResult> {
    const allBookmarks = await BookmarkScanner.scanAll();
    const toDelete = allBookmarks.filter(bookmark =>
      bookmark.folderPath.startsWith(folderPath)
    );

    return this.deleteBookmarks(toDelete, {
      deleteStrategy: 'folder',
      confirmEach: false,
      createBackup: true,
      dryRun: false,
      ...config
    });
  }

  private static async createBackupSnapshot(reason: string): Promise<void> {
    try {
      const tree = await chrome.bookmarks.getTree();
      const snapshot = {
        id: `backup_${Date.now()}`,
        browser: this.getCurrentBrowser(),
        createdAt: Date.now(),
        nodes: tree,
        reason
      };
      
      await Storage.saveSnapshot(snapshot);
    } catch (error) {
      console.error('创建备份快照失败:', error);
    }
  }

  private static isSystemFolder(folderName: string): boolean {
    const systemFolders = [
      'Bookmarks Bar',
      'Other Bookmarks',
      'Mobile Bookmarks',
      '书签栏',
      '其他书签',
      '移动设备书签'
    ];
    
    return systemFolders.includes(folderName);
  }

  private static getCurrentBrowser(): 'Chrome' | 'Edge' {
    const userAgent = navigator.userAgent;
    if (userAgent.includes('Edg/')) {
      return 'Edge';
    }
    return 'Chrome';
  }

  private static generateOperationId(): string {
    return `delete_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  static async getDeletePreview(
    bookmarks: Bookmark[],
    config: DeleteConfig
  ): Promise<{
    willDelete: Bookmark[];
    summary: {
      totalBookmarks: number;
      byFolder: Record<string, number>;
      byDomain: Record<string, number>;
    };
  }> {
    const willDelete = config.dryRun ? [] : bookmarks;
    
    const summary = {
      totalBookmarks: bookmarks.length,
      byFolder: {} as Record<string, number>,
      byDomain: {} as Record<string, number>
    };

    for (const bookmark of bookmarks) {
      // 按文件夹统计
      const folder = bookmark.folderPath || '根目录';
      summary.byFolder[folder] = (summary.byFolder[folder] || 0) + 1;

      // 按域名统计
      try {
        const domain = new URL(bookmark.url).hostname;
        summary.byDomain[domain] = (summary.byDomain[domain] || 0) + 1;
      } catch {
        summary.byDomain['无效URL'] = (summary.byDomain['无效URL'] || 0) + 1;
      }
    }

    return {
      willDelete,
      summary
    };
  }
}