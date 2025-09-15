import { Bookmark, TagRule } from '@/types/bookmark';

export class TagRuleEngine {
  static applyRules(bookmarks: Bookmark[], rules: TagRule[]): Bookmark[] {
    const enabledRules = rules.filter(rule => rule.enabled);
    
    return bookmarks.map(bookmark => {
      const newTags = new Set(bookmark.tags);
      
      for (const rule of enabledRules) {
        if (this.matchesRule(bookmark, rule)) {
          rule.tags.forEach(tag => newTags.add(tag));
        }
      }
      
      return {
        ...bookmark,
        tags: Array.from(newTags)
      };
    });
  }

  private static matchesRule(bookmark: Bookmark, rule: TagRule): boolean {
    try {
      const regex = new RegExp(rule.pattern, 'i');
      
      switch (rule.type) {
        case 'domain':
          const domain = this.extractDomain(bookmark.url);
          return regex.test(domain);
        
        case 'path':
          const path = this.extractPath(bookmark.url);
          return regex.test(path);
        
        case 'url':
          return regex.test(bookmark.url);
        
        default:
          return false;
      }
    } catch (error) {
      console.warn(`规则 ${rule.name} 匹配失败:`, error);
      return false;
    }
  }

  private static extractDomain(url: string): string {
    try {
      return new URL(url).hostname;
    } catch {
      return '';
    }
  }

  private static extractPath(url: string): string {
    try {
      return new URL(url).pathname;
    } catch {
      return '';
    }
  }

  static testRule(rule: TagRule, testUrl: string): boolean {
    const mockBookmark: Bookmark = {
      url: testUrl,
      title: 'Test',
      createdAt: Date.now(),
      browser: 'Chrome',
      folderPath: '',
      tags: [],
      note: '',
      status: 'Unknown',
      normalizedUrl: testUrl,
      sourceId: 'test',
      browserNodeIds: {}
    };
    
    return this.matchesRule(mockBookmark, rule);
  }

  static validateRulePattern(pattern: string): {
    valid: boolean;
    error?: string;
  } {
    try {
      new RegExp(pattern);
      return { valid: true };
    } catch (error) {
      return {
        valid: false,
        error: error.message
      };
    }
  }

  static getDefaultRules(): TagRule[] {
    return [
      {
        id: 'github',
        name: 'GitHub',
        enabled: true,
        pattern: '^github\\.com',
        tags: ['development', 'github'],
        type: 'domain'
      },
      {
        id: 'stackoverflow',
        name: 'Stack Overflow',
        enabled: true,
        pattern: '^stackoverflow\\.com',
        tags: ['development', 'q&a'],
        type: 'domain'
      },
      {
        id: 'youtube',
        name: 'YouTube',
        enabled: true,
        pattern: '^(www\\.)?(youtube\\.com|youtu\\.be)',
        tags: ['video', 'entertainment'],
        type: 'domain'
      },
      {
        id: 'wikipedia',
        name: 'Wikipedia',
        enabled: true,
        pattern: '\\.wikipedia\\.org',
        tags: ['reference', 'education'],
        type: 'domain'
      },
      {
        id: 'medium',
        name: 'Medium',
        enabled: true,
        pattern: '^medium\\.com',
        tags: ['blog', 'article'],
        type: 'domain'
      },
      {
        id: 'reddit',
        name: 'Reddit',
        enabled: true,
        pattern: '^(www\\.)?reddit\\.com',
        tags: ['social', 'community'],
        type: 'domain'
      },
      {
        id: 'twitter',
        name: 'Twitter/X',
        enabled: true,
        pattern: '^(www\\.)?(twitter\\.com|x\\.com)',
        tags: ['social', 'news'],
        type: 'domain'
      },
      {
        id: 'amazon',
        name: 'Amazon',
        enabled: true,
        pattern: '^(www\\.)?amazon\\.[a-z.]+',
        tags: ['shopping', 'ecommerce'],
        type: 'domain'
      },
      {
        id: 'docs',
        name: 'Documentation',
        enabled: true,
        pattern: '/(docs?|documentation|api|reference)/',
        tags: ['documentation', 'reference'],
        type: 'path'
      },
      {
        id: 'blog',
        name: 'Blog Posts',
        enabled: true,
        pattern: '/(blog|post|article)/',
        tags: ['blog', 'article'],
        type: 'path'
      }
    ];
  }

  static analyzeBookmarksForRuleSuggestions(bookmarks: Bookmark[]): Array<{
    suggestedRule: Omit<TagRule, 'id'>;
    matchingBookmarks: number;
    examples: string[];
  }> {
    const domainCounts = new Map<string, number>();
    const pathPatterns = new Map<string, number>();
    
    for (const bookmark of bookmarks) {
      try {
        const url = new URL(bookmark.url);
        const domain = url.hostname;
        
        domainCounts.set(domain, (domainCounts.get(domain) || 0) + 1);
        
        const pathSegments = url.pathname.split('/').filter(s => s.length > 0);
        for (const segment of pathSegments) {
          if (segment.length > 2) {
            pathPatterns.set(segment, (pathPatterns.get(segment) || 0) + 1);
          }
        }
      } catch (error) {
        continue;
      }
    }

    const suggestions = [];

    const topDomains = Array.from(domainCounts.entries())
      .filter(([domain, count]) => count >= 3)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);

    for (const [domain, count] of topDomains) {
      const examples = bookmarks
        .filter(b => {
          try {
            return new URL(b.url).hostname === domain;
          } catch {
            return false;
          }
        })
        .slice(0, 3)
        .map(b => b.url);

      const domainTag = this.suggestTagFromDomain(domain);
      
      suggestions.push({
        suggestedRule: {
          name: `${domain} 网站`,
          enabled: true,
          pattern: `^${domain.replace(/\./g, '\\.')}`,
          tags: [domainTag],
          type: 'domain' as const
        },
        matchingBookmarks: count,
        examples
      });
    }

    const topPaths = Array.from(pathPatterns.entries())
      .filter(([path, count]) => count >= 2)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    for (const [path, count] of topPaths) {
      const examples = bookmarks
        .filter(b => {
          try {
            return new URL(b.url).pathname.includes(path);
          } catch {
            return false;
          }
        })
        .slice(0, 3)
        .map(b => b.url);

      const pathTag = this.suggestTagFromPath(path);
      
      suggestions.push({
        suggestedRule: {
          name: `${path} 路径`,
          enabled: true,
          pattern: `/${path}/`,
          tags: [pathTag],
          type: 'path' as const
        },
        matchingBookmarks: count,
        examples
      });
    }

    return suggestions.sort((a, b) => b.matchingBookmarks - a.matchingBookmarks);
  }

  private static suggestTagFromDomain(domain: string): string {
    const domainToTag: Record<string, string> = {
      'github.com': 'development',
      'stackoverflow.com': 'development',
      'youtube.com': 'video',
      'youtu.be': 'video',
      'wikipedia.org': 'reference',
      'medium.com': 'blog',
      'reddit.com': 'social',
      'twitter.com': 'social',
      'x.com': 'social',
      'amazon.com': 'shopping',
      'amazon.cn': 'shopping',
      'taobao.com': 'shopping',
      'tmall.com': 'shopping',
      'jd.com': 'shopping',
      'bilibili.com': 'video',
      'zhihu.com': 'q&a',
      'csdn.net': 'development',
      'juejin.cn': 'development',
      'segmentfault.com': 'development'
    };

    for (const [key, tag] of Object.entries(domainToTag)) {
      if (domain.includes(key)) {
        return tag;
      }
    }

    if (domain.includes('blog')) return 'blog';
    if (domain.includes('news')) return 'news';
    if (domain.includes('shop')) return 'shopping';
    if (domain.includes('edu')) return 'education';
    if (domain.includes('gov')) return 'government';
    
    return 'website';
  }

  private static suggestTagFromPath(path: string): string {
    const pathToTag: Record<string, string> = {
      'docs': 'documentation',
      'doc': 'documentation',
      'documentation': 'documentation',
      'api': 'api',
      'reference': 'reference',
      'blog': 'blog',
      'post': 'blog',
      'article': 'article',
      'news': 'news',
      'tutorial': 'tutorial',
      'guide': 'guide',
      'help': 'help',
      'support': 'support',
      'forum': 'forum',
      'wiki': 'wiki',
      'faq': 'faq'
    };

    const lowerPath = path.toLowerCase();
    for (const [key, tag] of Object.entries(pathToTag)) {
      if (lowerPath.includes(key)) {
        return tag;
      }
    }

    return 'content';
  }

  static getRuleStatistics(bookmarks: Bookmark[], rules: TagRule[]): Array<{
    rule: TagRule;
    matchCount: number;
    matchedBookmarks: Bookmark[];
    coverage: number;
  }> {
    const stats = [];

    for (const rule of rules) {
      const matchedBookmarks = bookmarks.filter(bookmark => this.matchesRule(bookmark, rule));
      stats.push({
        rule,
        matchCount: matchedBookmarks.length,
        matchedBookmarks,
        coverage: bookmarks.length > 0 ? matchedBookmarks.length / bookmarks.length : 0
      });
    }

    return stats.sort((a, b) => b.matchCount - a.matchCount);
  }

  static exportRules(rules: TagRule[]): string {
    return JSON.stringify(rules, null, 2);
  }

  static importRules(jsonString: string): TagRule[] {
    try {
      const imported = JSON.parse(jsonString);
      if (!Array.isArray(imported)) {
        throw new Error('导入的数据不是数组格式');
      }

      return imported.map((rule, index) => {
        if (!rule.id) rule.id = `imported_${Date.now()}_${index}`;
        if (!rule.name) rule.name = `导入规则 ${index + 1}`;
        if (typeof rule.enabled !== 'boolean') rule.enabled = true;
        if (!rule.pattern) throw new Error(`规则 ${rule.name} 缺少 pattern 字段`);
        if (!Array.isArray(rule.tags)) rule.tags = [];
        if (!rule.type) rule.type = 'url';

        const validation = this.validateRulePattern(rule.pattern);
        if (!validation.valid) {
          throw new Error(`规则 ${rule.name} 的正则表达式无效: ${validation.error}`);
        }

        return rule as TagRule;
      });
    } catch (error) {
      throw new Error(`导入规则失败: ${error.message}`);
    }
  }
}