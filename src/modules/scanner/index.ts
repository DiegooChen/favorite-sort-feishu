import { Bookmark, BookmarkTreeNode } from '@/types/bookmark';

export class BookmarkScanner {
  private static getCurrentBrowser(): 'Chrome' | 'Edge' {
    const userAgent = navigator.userAgent;
    if (userAgent.includes('Edg/')) {
      return 'Edge';
    }
    return 'Chrome';
  }

  static async scanAll(): Promise<Bookmark[]> {
    try {
      const tree = await chrome.bookmarks.getTree();
      const browser = this.getCurrentBrowser();
      const bookmarks: Bookmark[] = [];

      for (const root of tree) {
        this.traverseBookmarks(root, '', bookmarks, browser);
      }

      return bookmarks;
    } catch (error) {
      console.error('扫描书签失败:', error);
      throw new Error(`扫描书签失败: ${error.message}`);
    }
  }

  static async getBookmarkTree(): Promise<BookmarkTreeNode[]> {
    try {
      const tree = await chrome.bookmarks.getTree();
      return tree.map(node => this.convertToTreeNode(node));
    } catch (error) {
      console.error('获取书签树失败:', error);
      throw new Error(`获取书签树失败: ${error.message}`);
    }
  }

  private static traverseBookmarks(
    node: chrome.bookmarks.BookmarkTreeNode,
    folderPath: string,
    bookmarks: Bookmark[],
    browser: 'Chrome' | 'Edge'
  ): void {
    if (node.url) {
      const bookmark: Bookmark = {
        url: node.url,
        title: node.title || 'Untitled',
        createdAt: node.dateAdded || Date.now(),
        browser,
        folderPath,
        tags: [],
        note: '',
        status: 'Unknown',
        normalizedUrl: node.url,
        sourceId: node.id || '',
        browserNodeIds: {
          [browser.toLowerCase() as 'chrome' | 'edge']: [node.id || '']
        }
      };
      
      bookmarks.push(bookmark);
    }

    if (node.children) {
      const currentPath = folderPath ? `${folderPath}/${node.title}` : node.title;
      for (const child of node.children) {
        this.traverseBookmarks(child, currentPath, bookmarks, browser);
      }
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

  static async getBookmarkById(id: string): Promise<chrome.bookmarks.BookmarkTreeNode | null> {
    try {
      const nodes = await chrome.bookmarks.get(id);
      return nodes[0] || null;
    } catch (error) {
      console.error(`获取书签 ${id} 失败:`, error);
      return null;
    }
  }

  static async searchBookmarks(query: string): Promise<chrome.bookmarks.BookmarkTreeNode[]> {
    try {
      return await chrome.bookmarks.search(query);
    } catch (error) {
      console.error(`搜索书签失败:`, error);
      return [];
    }
  }

  static async getFolderContents(folderId: string): Promise<chrome.bookmarks.BookmarkTreeNode[]> {
    try {
      const nodes = await chrome.bookmarks.getChildren(folderId);
      return nodes;
    } catch (error) {
      console.error(`获取文件夹内容失败:`, error);
      return [];
    }
  }

  static async getBookmarkStats(): Promise<{
    totalBookmarks: number;
    totalFolders: number;
    byFolder: Record<string, number>;
  }> {
    try {
      const bookmarks = await this.scanAll();
      const tree = await chrome.bookmarks.getTree();
      
      let totalFolders = 0;
      const byFolder: Record<string, number> = {};
      
      const countFolders = (node: chrome.bookmarks.BookmarkTreeNode, path: string) => {
        if (!node.url) {
          totalFolders++;
          byFolder[path] = 0;
        }
        
        if (node.children) {
          const currentPath = path ? `${path}/${node.title}` : node.title;
          for (const child of node.children) {
            if (child.url) {
              byFolder[currentPath] = (byFolder[currentPath] || 0) + 1;
            } else {
              countFolders(child, currentPath);
            }
          }
        }
      };

      for (const root of tree) {
        countFolders(root, '');
      }

      return {
        totalBookmarks: bookmarks.length,
        totalFolders,
        byFolder
      };
    } catch (error) {
      console.error('获取书签统计失败:', error);
      throw error;
    }
  }
}