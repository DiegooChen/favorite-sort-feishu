import { Bookmark, WritebackConfig, OperationLog } from '@/types/bookmark';
import { SnapshotManager } from '@/modules/snapshot';
import { Storage } from '@/modules/storage';

export interface WritebackResult {
  totalBookmarks: number;
  created: number;
  updated: number;
  skipped: number;
  failed: number;
  errors: Array<{
    bookmark: Bookmark;
    error: string;
  }>;
}

export interface WritebackProgress {
  total: number;
  processed: number;
  created: number;
  updated: number;
  skipped: number;
  failed: number;
  currentUrl?: string;
}

export interface FolderStructure {
  id: string;
  name: string;
  path: string;
  parentId?: string;
  children: FolderStructure[];
}

export class BookmarkWriteback {
  static async writebackFromFeishu(
    bookmarks: Bookmark[],
    config: WritebackConfig,
    onProgress?: (progress: WritebackProgress) => void
  ): Promise<WritebackResult> {
    const result: WritebackResult = {
      totalBookmarks: bookmarks.length,
      created: 0,
      updated: 0,
      skipped: 0,
      failed: 0,
      errors: []
    };

    const progress: WritebackProgress = {
      total: bookmarks.length,
      processed: 0,
      created: 0,
      updated: 0,
      skipped: 0,
      failed: 0
    };

    // 创建备份快照
    await SnapshotManager.createAutoSnapshot('pre-writeback');

    // 构建目标文件夹结构
    const folderStructure = await this.ensureFolderStructure(bookmarks, config);

    const operationId = this.generateOperationId();

    try {
      for (const bookmark of bookmarks) {
        progress.currentUrl = bookmark.url;
        onProgress?.(progress);

        try {
          const targetFolderId = await this.getTargetFolderId(bookmark, config, folderStructure);
          const existing = await this.findExistingBookmark(bookmark.url, targetFolderId);

          if (existing) {
            if (config.dedupeStrategy === 'skip') {
              result.skipped++;
              progress.skipped++;
            } else if (config.dedupeStrategy === 'updateTitle') {
              await chrome.bookmarks.update(existing.id!, { title: bookmark.title });
              result.updated++;
              progress.updated++;
            }
          } else {
            await chrome.bookmarks.create({
              parentId: targetFolderId,
              title: bookmark.title,
              url: bookmark.url
            });
            result.created++;
            progress.created++;
          }
        } catch (error) {
          result.failed++;
          progress.failed++;
          result.errors.push({
            bookmark,
            error: error.message
          });
        }

        progress.processed++;
        onProgress?.(progress);
      }

      // 记录操作日志
      const log: OperationLog = {
        id: operationId,
        type: 'WRITEBACK',
        browser: this.getCurrentBrowser(),
        timestamp: Date.now(),
        payload: {
          bookmarks: bookmarks.length,
          config
        },
        stats: {
          affected: result.totalBookmarks,
          success: result.created + result.updated,
          skipped: result.skipped,
          failed: result.failed
        }
      };

      await Storage.saveOperationLog(log);

    } catch (error) {
      console.error('回写操作失败:', error);
      result.errors.push({
        bookmark: {} as Bookmark,
        error: `批量操作失败: ${error.message}`
      });
    }

    return result;
  }

  private static async ensureFolderStructure(
    bookmarks: Bookmark[],
    config: WritebackConfig
  ): Promise<Map<string, string>> {
    const folderMap = new Map<string, string>(); // path -> folderId
    const createdPaths = new Set<string>();

    // 获取根文件夹ID
    const rootFolderId = await this.ensureRootFolder(config.targetRoot);
    folderMap.set('', rootFolderId);

    // 收集所有需要的文件夹路径
    const requiredPaths = new Set<string>();
    
    for (const bookmark of bookmarks) {
      const targetPath = this.getTargetPath(bookmark, config);
      if (targetPath) {
        const pathSegments = targetPath.split('/').filter(s => s.length > 0);
        let currentPath = '';
        
        for (const segment of pathSegments) {
          currentPath = currentPath ? `${currentPath}/${segment}` : segment;
          requiredPaths.add(currentPath);
        }
      }
    }

    // 按路径长度排序，确保父文件夹先创建
    const sortedPaths = Array.from(requiredPaths).sort((a, b) => 
      a.split('/').length - b.split('/').length
    );

    // 创建文件夹结构
    for (const path of sortedPaths) {
      if (createdPaths.has(path)) {
        continue;
      }

      const pathSegments = path.split('/');
      const folderName = pathSegments[pathSegments.length - 1];
      const parentPath = pathSegments.slice(0, -1).join('/');
      const parentId = folderMap.get(parentPath) || rootFolderId;

      try {
        // 检查文件夹是否已存在
        const children = await chrome.bookmarks.getChildren(parentId);
        const existing = children.find(child => 
          !child.url && child.title === folderName
        );

        if (existing) {
          folderMap.set(path, existing.id!);
        } else {
          const created = await chrome.bookmarks.create({
            parentId,
            title: folderName
          });
          folderMap.set(path, created.id!);
        }

        createdPaths.add(path);
      } catch (error) {
        console.error(`创建文件夹失败 ${path}:`, error);
        folderMap.set(path, parentId); // 使用父文件夹作为fallback
      }
    }

    return folderMap;
  }

  private static async ensureRootFolder(targetRoot: string): Promise<string> {
    if (!targetRoot || targetRoot === '根目录') {
      // 返回书签栏ID
      const tree = await chrome.bookmarks.getTree();
      return tree[0]?.children?.[0]?.id || '1'; // 通常书签栏的ID是'1'
    }

    // 在书签栏下查找或创建目标根文件夹
    const bookmarkBarId = await this.getBookmarkBarId();
    const children = await chrome.bookmarks.getChildren(bookmarkBarId);
    
    const existing = children.find(child => 
      !child.url && child.title === targetRoot
    );

    if (existing) {
      return existing.id!;
    }

    const created = await chrome.bookmarks.create({
      parentId: bookmarkBarId,
      title: targetRoot
    });

    return created.id!;
  }

  private static async getBookmarkBarId(): Promise<string> {
    const tree = await chrome.bookmarks.getTree();
    // 通常书签栏是第一个根节点的第一个子节点
    return tree[0]?.children?.[0]?.id || '1';
  }

  private static getTargetPath(bookmark: Bookmark, config: WritebackConfig): string {
    switch (config.categorySource) {
      case 'category':
        // 假设 category 存储在 tags 的第一个元素或单独字段中
        return bookmark.tags[0] || '未分类';
      
      case 'tags':
        // 使用主要标签作为文件夹
        return bookmark.tags.join('/') || '未分类';
      
      case 'folderPath':
        return bookmark.folderPath || '未分类';
      
      default:
        return '未分类';
    }
  }

  private static async getTargetFolderId(
    bookmark: Bookmark,
    config: WritebackConfig,
    folderStructure: Map<string, string>
  ): Promise<string> {
    const targetPath = this.getTargetPath(bookmark, config);
    
    // 检查是否在选中的分类中
    if (config.selectedCategories.length > 0) {
      const category = targetPath.split('/')[0];
      if (!config.selectedCategories.includes(category)) {
        // 使用默认文件夹
        return folderStructure.get('') || await this.getBookmarkBarId();
      }
    }

    return folderStructure.get(targetPath) || folderStructure.get('') || await this.getBookmarkBarId();
  }

  private static async findExistingBookmark(
    url: string,
    folderId: string
  ): Promise<chrome.bookmarks.BookmarkTreeNode | null> {
    try {
      const children = await chrome.bookmarks.getChildren(folderId);
      return children.find(child => child.url === url) || null;
    } catch (error) {
      console.error(`查找现有书签失败:`, error);
      return null;
    }
  }

  static async analyzeWritebackImpact(
    bookmarks: Bookmark[],
    config: WritebackConfig
  ): Promise<{
    summary: {
      totalBookmarks: number;
      newFolders: string[];
      conflicts: Array<{
        url: string;
        title: string;
        action: 'skip' | 'update';
      }>;
    };
    preview: Array<{
      bookmark: Bookmark;
      targetPath: string;
      action: 'create' | 'skip' | 'update';
    }>;
  }> {
    const folderStructure = await this.ensureFolderStructure(bookmarks, config);
    const newFolders: string[] = [];
    const conflicts: Array<{
      url: string;
      title: string;
      action: 'skip' | 'update';
    }> = [];
    const preview: Array<{
      bookmark: Bookmark;
      targetPath: string;
      action: 'create' | 'skip' | 'update';
    }> = [];

    // 获取当前书签栏中已存在的所有URL
    const existingUrls = new Set<string>();
    await this.collectExistingUrls(await this.getBookmarkBarId(), existingUrls);

    for (const bookmark of bookmarks) {
      const targetPath = this.getTargetPath(bookmark, config);
      let action: 'create' | 'skip' | 'update' = 'create';

      if (existingUrls.has(bookmark.url)) {
        if (config.dedupeStrategy === 'skip') {
          action = 'skip';
        } else if (config.dedupeStrategy === 'updateTitle') {
          action = 'update';
        }

        conflicts.push({
          url: bookmark.url,
          title: bookmark.title,
          action: config.dedupeStrategy === 'skip' ? 'skip' : 'update'
        });
      }

      preview.push({
        bookmark,
        targetPath,
        action
      });
    }

    // 收集新文件夹
    for (const [path, folderId] of folderStructure) {
      if (path && folderId) {
        newFolders.push(path);
      }
    }

    return {
      summary: {
        totalBookmarks: bookmarks.length,
        newFolders,
        conflicts
      },
      preview
    };
  }

  private static async collectExistingUrls(
    nodeId: string,
    urlSet: Set<string>
  ): Promise<void> {
    try {
      const children = await chrome.bookmarks.getChildren(nodeId);
      
      for (const child of children) {
        if (child.url) {
          urlSet.add(child.url);
        } else if (child.children !== undefined) {
          await this.collectExistingUrls(child.id!, urlSet);
        }
      }
    } catch (error) {
      console.error(`收集现有URL失败:`, error);
    }
  }

  static async getBrowserFolderStructure(): Promise<FolderStructure[]> {
    const tree = await chrome.bookmarks.getTree();
    const structures: FolderStructure[] = [];

    for (const root of tree) {
      if (root.children) {
        for (const child of root.children) {
          const structure = this.buildFolderStructure(child, child.title);
          structures.push(structure);
        }
      }
    }

    return structures;
  }

  private static buildFolderStructure(
    node: chrome.bookmarks.BookmarkTreeNode,
    basePath: string
  ): FolderStructure {
    const structure: FolderStructure = {
      id: node.id!,
      name: node.title,
      path: basePath,
      parentId: node.parentId,
      children: []
    };

    if (node.children) {
      for (const child of node.children) {
        if (!child.url) { // 只处理文件夹
          const childPath = `${basePath}/${child.title}`;
          structure.children.push(this.buildFolderStructure(child, childPath));
        }
      }
    }

    return structure;
  }

  static async validateWritebackConfig(config: WritebackConfig): Promise<{
    valid: boolean;
    errors: string[];
    warnings: string[];
  }> {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!config.targetRoot) {
      warnings.push('未指定目标根文件夹，将使用书签栏');
    }

    if (!['category', 'tags', 'folderPath'].includes(config.categorySource)) {
      errors.push('无效的分类来源配置');
    }

    if (!['skip', 'updateTitle'].includes(config.dedupeStrategy)) {
      errors.push('无效的去重策略配置');
    }

    if (config.selectedCategories.length === 0) {
      warnings.push('未选择任何分类，将处理所有书签');
    }

    try {
      await this.getBookmarkBarId();
    } catch (error) {
      errors.push('无法访问浏览器书签API');
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  private static getCurrentBrowser(): 'Chrome' | 'Edge' {
    const userAgent = navigator.userAgent;
    if (userAgent.includes('Edg/')) {
      return 'Edge';
    }
    return 'Chrome';
  }

  private static generateOperationId(): string {
    return `writeback_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}