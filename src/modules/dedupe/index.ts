import { Bookmark } from '@/types/bookmark';
import { UrlNormalizer } from '@/modules/normalize';

export interface DedupeResult {
  uniqueBookmarks: Bookmark[];
  duplicateGroups: DuplicateGroup[];
  stats: {
    original: number;
    unique: number;
    duplicates: number;
    merged: number;
  };
}

export interface DuplicateGroup {
  normalizedUrl: string;
  bookmarks: Bookmark[];
  suggestedMerged: Bookmark;
}

export interface DedupeConfig {
  mergeStrategy: 'newest' | 'oldest' | 'mostTags' | 'manual';
  mergeTags: boolean;
  mergeNotes: boolean;
  preserveBrowserInfo: boolean;
}

export class BookmarkDeduplicator {
  static deduplicate(bookmarks: Bookmark[], config: DedupeConfig): DedupeResult {
    const urlGroups = this.groupByNormalizedUrl(bookmarks);
    const duplicateGroups: DuplicateGroup[] = [];
    const uniqueBookmarks: Bookmark[] = [];
    let mergedCount = 0;

    for (const [normalizedUrl, groupBookmarks] of urlGroups) {
      if (groupBookmarks.length === 1) {
        uniqueBookmarks.push(groupBookmarks[0]);
      } else {
        const merged = this.mergeBookmarks(groupBookmarks, config);
        const duplicateGroup: DuplicateGroup = {
          normalizedUrl,
          bookmarks: groupBookmarks,
          suggestedMerged: merged
        };
        
        duplicateGroups.push(duplicateGroup);
        uniqueBookmarks.push(merged);
        mergedCount += groupBookmarks.length - 1;
      }
    }

    return {
      uniqueBookmarks,
      duplicateGroups,
      stats: {
        original: bookmarks.length,
        unique: uniqueBookmarks.length,
        duplicates: bookmarks.length - uniqueBookmarks.length,
        merged: mergedCount
      }
    };
  }

  private static groupByNormalizedUrl(bookmarks: Bookmark[]): Map<string, Bookmark[]> {
    const groups = new Map<string, Bookmark[]>();
    
    for (const bookmark of bookmarks) {
      const normalizedUrl = bookmark.normalizedUrl;
      if (!groups.has(normalizedUrl)) {
        groups.set(normalizedUrl, []);
      }
      groups.get(normalizedUrl)!.push(bookmark);
    }
    
    return groups;
  }

  private static mergeBookmarks(bookmarks: Bookmark[], config: DedupeConfig): Bookmark {
    if (bookmarks.length === 0) {
      throw new Error('无法合并空书签列表');
    }
    
    if (bookmarks.length === 1) {
      return bookmarks[0];
    }

    let primaryBookmark: Bookmark;

    switch (config.mergeStrategy) {
      case 'newest':
        primaryBookmark = bookmarks.reduce((newest, current) => 
          current.createdAt > newest.createdAt ? current : newest
        );
        break;
      
      case 'oldest':
        primaryBookmark = bookmarks.reduce((oldest, current) => 
          current.createdAt < oldest.createdAt ? current : oldest
        );
        break;
      
      case 'mostTags':
        primaryBookmark = bookmarks.reduce((mostTags, current) => 
          current.tags.length > mostTags.tags.length ? current : mostTags
        );
        break;
      
      default:
        primaryBookmark = bookmarks[0];
    }

    const mergedBookmark: Bookmark = { ...primaryBookmark };

    if (config.mergeTags) {
      const allTags = new Set<string>();
      for (const bookmark of bookmarks) {
        bookmark.tags.forEach(tag => allTags.add(tag));
      }
      mergedBookmark.tags = Array.from(allTags);
    }

    if (config.mergeNotes) {
      const allNotes = bookmarks
        .map(b => b.note)
        .filter(note => note && note.trim())
        .filter((note, index, arr) => arr.indexOf(note) === index);
      mergedBookmark.note = allNotes.join('\n\n');
    }

    if (config.preserveBrowserInfo) {
      const allBrowserNodeIds = {
        chrome: [] as string[],
        edge: [] as string[]
      };

      for (const bookmark of bookmarks) {
        if (bookmark.browserNodeIds.chrome) {
          allBrowserNodeIds.chrome.push(...bookmark.browserNodeIds.chrome);
        }
        if (bookmark.browserNodeIds.edge) {
          allBrowserNodeIds.edge.push(...bookmark.browserNodeIds.edge);
        }
      }

      mergedBookmark.browserNodeIds = allBrowserNodeIds;
    }

    const bestTitle = this.selectBestTitle(bookmarks);
    if (bestTitle !== mergedBookmark.title) {
      mergedBookmark.title = bestTitle;
    }

    return mergedBookmark;
  }

  private static selectBestTitle(bookmarks: Bookmark[]): string {
    const titles = bookmarks.map(b => b.title).filter(title => title && title.trim());
    
    if (titles.length === 0) {
      return 'Untitled';
    }

    const longestTitle = titles.reduce((longest, current) => 
      current.length > longest.length ? current : longest
    );

    const nonGenericTitles = titles.filter(title => 
      !['Untitled', 'New Tab', 'Page', 'Document'].includes(title)
    );

    return nonGenericTitles.length > 0 ? 
      nonGenericTitles.reduce((longest, current) => 
        current.length > longest.length ? current : longest
      ) : longestTitle;
  }

  static findSimilarTitles(bookmarks: Bookmark[]): Array<{
    title: string;
    bookmarks: Bookmark[];
    similarity: number;
  }> {
    const titleGroups = new Map<string, Bookmark[]>();
    
    for (const bookmark of bookmarks) {
      const normalizedTitle = this.normalizeTitle(bookmark.title);
      if (!titleGroups.has(normalizedTitle)) {
        titleGroups.set(normalizedTitle, []);
      }
      titleGroups.get(normalizedTitle)!.push(bookmark);
    }

    const similarGroups = [];
    for (const [title, groupBookmarks] of titleGroups) {
      if (groupBookmarks.length > 1) {
        similarGroups.push({
          title,
          bookmarks: groupBookmarks,
          similarity: this.calculateTitleSimilarity(groupBookmarks.map(b => b.title))
        });
      }
    }

    return similarGroups.sort((a, b) => b.similarity - a.similarity);
  }

  private static normalizeTitle(title: string): string {
    return title
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private static calculateTitleSimilarity(titles: string[]): number {
    if (titles.length < 2) return 1;
    
    const normalizedTitles = titles.map(t => this.normalizeTitle(t));
    const uniqueTitles = new Set(normalizedTitles);
    
    return 1 - (uniqueTitles.size - 1) / (titles.length - 1);
  }

  static getDuplicateStatistics(bookmarks: Bookmark[]): {
    totalBookmarks: number;
    potentialDuplicates: number;
    byDomain: Record<string, number>;
    duplicateRatio: number;
  } {
    const urlGroups = this.groupByNormalizedUrl(bookmarks);
    let duplicateCount = 0;
    const domainDuplicates: Record<string, number> = {};

    for (const [normalizedUrl, groupBookmarks] of urlGroups) {
      if (groupBookmarks.length > 1) {
        duplicateCount += groupBookmarks.length - 1;
        
        try {
          const domain = new URL(normalizedUrl).hostname;
          domainDuplicates[domain] = (domainDuplicates[domain] || 0) + (groupBookmarks.length - 1);
        } catch (error) {
          console.warn(`提取域名失败: ${normalizedUrl}`, error);
        }
      }
    }

    return {
      totalBookmarks: bookmarks.length,
      potentialDuplicates: duplicateCount,
      byDomain: domainDuplicates,
      duplicateRatio: bookmarks.length > 0 ? duplicateCount / bookmarks.length : 0
    };
  }

  static createDedupePreview(bookmarks: Bookmark[], config: DedupeConfig): {
    willKeep: Bookmark[];
    willMerge: DuplicateGroup[];
    summary: {
      before: number;
      after: number;
      saved: number;
      mergedGroups: number;
    };
  } {
    const result = this.deduplicate(bookmarks, config);
    
    return {
      willKeep: result.uniqueBookmarks,
      willMerge: result.duplicateGroups,
      summary: {
        before: result.stats.original,
        after: result.stats.unique,
        saved: result.stats.duplicates,
        mergedGroups: result.duplicateGroups.length
      }
    };
  }
}