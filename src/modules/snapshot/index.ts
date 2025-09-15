import { Bookmark, Snapshot, BookmarkTreeNode } from '@/types/bookmark';
import { BookmarkScanner } from '@/modules/scanner';
import { Storage } from '@/modules/storage';

export interface SnapshotComparison {
  added: BookmarkTreeNode[];
  removed: BookmarkTreeNode[];
  modified: Array<{
    before: BookmarkTreeNode;
    after: BookmarkTreeNode;
    changes: string[];
  }>;
  unchanged: BookmarkTreeNode[];
  stats: {
    totalBefore: number;
    totalAfter: number;
    added: number;
    removed: number;
    modified: number;
    unchanged: number;
  };
}

export interface RestoreOptions {
  mode: 'full' | 'selective';
  selectedNodes?: string[];
  mergeStrategy: 'replace' | 'merge' | 'skip';
  createBackup: boolean;
}

export class SnapshotManager {
  static async createSnapshot(name?: string): Promise<Snapshot> {
    try {
      const tree = await chrome.bookmarks.getTree();
      const browser = this.getCurrentBrowser();
      
      const snapshot: Snapshot = {
        id: `snapshot_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        browser,
        createdAt: Date.now(),
        nodes: tree.map(node => this.convertToTreeNode(node))
      };

      await Storage.saveSnapshot(snapshot);
      return snapshot;
    } catch (error) {
      console.error('创建快照失败:', error);
      throw new Error(`创建快照失败: ${error.message}`);
    }
  }

  private static convertToTreeNode(node: chrome.bookmarks.BookmarkTreeNode): BookmarkTreeNode {
    return {
      id: node.id,
      parentId: node.parentId,
      title: node.title,
      url: node.url,
      children: node.children?.map(child => this.convertToTreeNode(child))
    };
  }

  static async createAutoSnapshot(reason: string): Promise<Snapshot> {
    const snapshot = await this.createSnapshot();
    snapshot.id = `auto_${reason}_${Date.now()}`;
    return snapshot;
  }

  static async compareSnapshots(
    beforeId: string, 
    afterId: string
  ): Promise<SnapshotComparison> {
    const snapshots = await Storage.getSnapshots();
    const before = snapshots.find(s => s.id === beforeId);
    const after = snapshots.find(s => s.id === afterId);

    if (!before || !after) {
      throw new Error('找不到指定的快照');
    }

    return this.performComparison(before, after);
  }

  static async compareWithCurrent(snapshotId: string): Promise<SnapshotComparison> {
    const snapshots = await Storage.getSnapshots();
    const snapshot = snapshots.find(s => s.id === snapshotId);
    
    if (!snapshot) {
      throw new Error('找不到指定的快照');
    }

    const currentSnapshot = await this.createSnapshot('current_temp');
    return this.performComparison(snapshot, currentSnapshot);
  }

  private static performComparison(
    before: Snapshot,
    after: Snapshot
  ): SnapshotComparison {
    const beforeMap = new Map<string, BookmarkTreeNode>();
    const afterMap = new Map<string, BookmarkTreeNode>();

    this.flattenNodes(before.nodes, beforeMap);
    this.flattenNodes(after.nodes, afterMap);

    const added: BookmarkTreeNode[] = [];
    const removed: BookmarkTreeNode[] = [];
    const modified: Array<{
      before: BookmarkTreeNode;
      after: BookmarkTreeNode;
      changes: string[];
    }> = [];
    const unchanged: BookmarkTreeNode[] = [];

    // 检查新增和修改的节点
    for (const [id, afterNode] of afterMap) {
      const beforeNode = beforeMap.get(id);
      
      if (!beforeNode) {
        added.push(afterNode);
      } else {
        const changes = this.findNodeChanges(beforeNode, afterNode);
        if (changes.length > 0) {
          modified.push({
            before: beforeNode,
            after: afterNode,
            changes
          });
        } else {
          unchanged.push(afterNode);
        }
      }
    }

    // 检查删除的节点
    for (const [id, beforeNode] of beforeMap) {
      if (!afterMap.has(id)) {
        removed.push(beforeNode);
      }
    }

    return {
      added,
      removed,
      modified,
      unchanged,
      stats: {
        totalBefore: beforeMap.size,
        totalAfter: afterMap.size,
        added: added.length,
        removed: removed.length,
        modified: modified.length,
        unchanged: unchanged.length
      }
    };
  }

  private static flattenNodes(
    nodes: BookmarkTreeNode[],
    map: Map<string, BookmarkTreeNode>
  ): void {
    for (const node of nodes) {
      if (node.id) {
        map.set(node.id, node);
      }
      
      if (node.children) {
        this.flattenNodes(node.children, map);
      }
    }
  }

  private static findNodeChanges(
    before: BookmarkTreeNode,
    after: BookmarkTreeNode
  ): string[] {
    const changes: string[] = [];

    if (before.title !== after.title) {
      changes.push(`标题: "${before.title}" → "${after.title}"`);
    }

    if (before.url !== after.url) {
      changes.push(`URL: "${before.url}" → "${after.url}"`);
    }

    if (before.parentId !== after.parentId) {
      changes.push(`父级: "${before.parentId}" → "${after.parentId}"`);
    }

    const beforeChildrenCount = before.children?.length || 0;
    const afterChildrenCount = after.children?.length || 0;
    
    if (beforeChildrenCount !== afterChildrenCount) {
      changes.push(`子节点数量: ${beforeChildrenCount} → ${afterChildrenCount}`);
    }

    return changes;
  }

  static async restoreSnapshot(
    snapshotId: string,
    options: RestoreOptions = {
      mode: 'full',
      mergeStrategy: 'replace',
      createBackup: true
    }
  ): Promise<{
    restored: number;
    skipped: number;
    failed: number;
    errors: string[];
  }> {
    const snapshots = await Storage.getSnapshots();
    const snapshot = snapshots.find(s => s.id === snapshotId);
    
    if (!snapshot) {
      throw new Error('找不到指定的快照');
    }

    if (options.createBackup) {
      await this.createAutoSnapshot('pre-restore');
    }

    const result = {
      restored: 0,
      skipped: 0,
      failed: 0,
      errors: [] as string[]
    };

    try {
      if (options.mode === 'full') {
        await this.performFullRestore(snapshot, options, result);
      } else {
        await this.performSelectiveRestore(snapshot, options, result);
      }
    } catch (error) {
      result.errors.push(`恢复失败: ${error.message}`);
    }

    return result;
  }

  private static async performFullRestore(
    snapshot: Snapshot,
    options: RestoreOptions,
    result: any
  ): Promise<void> {
    // 清空当前书签（除了系统文件夹）
    const currentTree = await chrome.bookmarks.getTree();
    
    for (const root of currentTree) {
      if (root.children) {
        for (const child of root.children) {
          if (!this.isSystemFolder(child.title)) {
            try {
              await this.removeBookmarkNode(child.id!);
            } catch (error) {
              result.errors.push(`删除节点失败: ${error.message}`);
            }
          }
        }
      }
    }

    // 恢复快照中的书签
    for (const rootNode of snapshot.nodes) {
      if (rootNode.children) {
        for (const child of rootNode.children) {
          try {
            await this.restoreBookmarkNode(child, rootNode.id);
            result.restored++;
          } catch (error) {
            result.failed++;
            result.errors.push(`恢复节点失败: ${error.message}`);
          }
        }
      }
    }
  }

  private static async performSelectiveRestore(
    snapshot: Snapshot,
    options: RestoreOptions,
    result: any
  ): Promise<void> {
    if (!options.selectedNodes || options.selectedNodes.length === 0) {
      return;
    }

    const nodeMap = new Map<string, BookmarkTreeNode>();
    this.flattenNodes(snapshot.nodes, nodeMap);

    for (const nodeId of options.selectedNodes) {
      const node = nodeMap.get(nodeId);
      if (!node) {
        result.skipped++;
        continue;
      }

      try {
        // 找到合适的父节点进行恢复
        const parentId = await this.findSuitableParent(node.parentId);
        await this.restoreBookmarkNode(node, parentId);
        result.restored++;
      } catch (error) {
        result.failed++;
        result.errors.push(`恢复节点 ${nodeId} 失败: ${error.message}`);
      }
    }
  }

  private static async restoreBookmarkNode(
    node: BookmarkTreeNode,
    parentId?: string
  ): Promise<string> {
    const createInfo: chrome.bookmarks.BookmarkCreateArg = {
      parentId,
      title: node.title
    };

    if (node.url) {
      createInfo.url = node.url;
    }

    const created = await chrome.bookmarks.create(createInfo);

    // 递归恢复子节点
    if (node.children) {
      for (const child of node.children) {
        await this.restoreBookmarkNode(child, created.id);
      }
    }

    return created.id!;
  }

  private static async removeBookmarkNode(nodeId: string): Promise<void> {
    const children = await chrome.bookmarks.getChildren(nodeId);
    
    for (const child of children) {
      if (child.children) {
        await this.removeBookmarkNode(child.id!);
      }
      await chrome.bookmarks.remove(child.id!);
    }
  }

  private static async findSuitableParent(originalParentId?: string): Promise<string | undefined> {
    if (!originalParentId) {
      // 返回默认的书签栏
      const tree = await chrome.bookmarks.getTree();
      return tree[0]?.children?.[0]?.id; // 通常是书签栏
    }

    try {
      // 尝试使用原始父节点ID
      await chrome.bookmarks.get(originalParentId);
      return originalParentId;
    } catch {
      // 如果原始父节点不存在，使用书签栏
      const tree = await chrome.bookmarks.getTree();
      return tree[0]?.children?.[0]?.id;
    }
  }

  static async deleteSnapshot(snapshotId: string): Promise<void> {
    const snapshots = await Storage.getSnapshots();
    const filtered = snapshots.filter(s => s.id !== snapshotId);
    
    // 重新保存过滤后的快照列表
    await chrome.storage.local.set({ snapshots: filtered });
  }

  static async getSnapshotStatistics(snapshotId: string): Promise<{
    totalNodes: number;
    bookmarkCount: number;
    folderCount: number;
    maxDepth: number;
    byFolder: Record<string, number>;
  }> {
    const snapshots = await Storage.getSnapshots();
    const snapshot = snapshots.find(s => s.id === snapshotId);
    
    if (!snapshot) {
      throw new Error('找不到指定的快照');
    }

    const stats = {
      totalNodes: 0,
      bookmarkCount: 0,
      folderCount: 0,
      maxDepth: 0,
      byFolder: {} as Record<string, number>
    };

    for (const root of snapshot.nodes) {
      this.analyzeNode(root, '', 0, stats);
    }

    return stats;
  }

  private static analyzeNode(
    node: BookmarkTreeNode,
    path: string,
    depth: number,
    stats: any
  ): void {
    stats.totalNodes++;
    
    if (node.url) {
      stats.bookmarkCount++;
      const folderKey = path || '根目录';
      stats.byFolder[folderKey] = (stats.byFolder[folderKey] || 0) + 1;
    } else {
      stats.folderCount++;
    }

    stats.maxDepth = Math.max(stats.maxDepth, depth);

    if (node.children) {
      const currentPath = path ? `${path}/${node.title}` : node.title;
      for (const child of node.children) {
        this.analyzeNode(child, currentPath, depth + 1, stats);
      }
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

  static async exportSnapshot(snapshotId: string): Promise<string> {
    const snapshots = await Storage.getSnapshots();
    const snapshot = snapshots.find(s => s.id === snapshotId);
    
    if (!snapshot) {
      throw new Error('找不到指定的快照');
    }

    return JSON.stringify(snapshot, null, 2);
  }

  static async importSnapshot(jsonData: string): Promise<Snapshot> {
    try {
      const imported = JSON.parse(jsonData) as Snapshot;
      
      // 验证快照格式
      if (!imported.id || !imported.browser || !imported.createdAt || !imported.nodes) {
        throw new Error('无效的快照格式');
      }

      // 生成新的ID避免冲突
      imported.id = `imported_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      await Storage.saveSnapshot(imported);
      return imported;
    } catch (error) {
      throw new Error(`导入快照失败: ${error.message}`);
    }
  }
}