import { Bookmark, LinkCheckResult } from '@/types/bookmark';

export interface LinkCheckConfig {
  timeout: number;
  maxRetries: number;
  maxConcurrency: number;
  minConcurrency: number;
  followRedirects: boolean;
  checkMethod: 'HEAD' | 'GET';
  retryDelay: number;
}

export interface LinkCheckProgress {
  total: number;
  checked: number;
  ok: number;
  broken: number;
  redirects: number;
  timeouts: number;
  currentUrl?: string;
  estimatedTimeRemaining?: number;
  averageResponseTime?: number;
  concurrency?: number;
}

export class LinkChecker {
  private static readonly DEFAULT_CONFIG: LinkCheckConfig = {
    timeout: 8000,
    maxRetries: 2,
    maxConcurrency: 50,
    minConcurrency: 10,
    followRedirects: true,
    checkMethod: 'HEAD',
    retryDelay: 1000
  };

  static async checkBookmarks(
    bookmarks: Bookmark[], 
    config: Partial<LinkCheckConfig> = {},
    onProgress?: (progress: LinkCheckProgress) => void
  ): Promise<Bookmark[]> {
    const finalConfig = { ...this.DEFAULT_CONFIG, ...config };
    
    // 根据链接数量智能调整并发数
    const concurrency = this.calculateOptimalConcurrency(bookmarks.length, finalConfig);
    
    console.log(`开始链接检测: ${bookmarks.length} 个链接, 并发数: ${concurrency}, 预计耗时: ${Math.round(this.estimateCheckTime(bookmarks.length, finalConfig) / 1000)}秒`);
    
    const results = new Map<string, LinkCheckResult>();
    const startTime = Date.now();
    const responseTimes: number[] = [];
    
    const progress: LinkCheckProgress = {
      total: bookmarks.length,
      checked: 0,
      ok: 0,
      broken: 0,
      redirects: 0,
      timeouts: 0,
      concurrency: concurrency
    };

    onProgress?.(progress);

    // 使用并发控制的Promise池
    await this.runConcurrently(
      bookmarks,
      concurrency,
      async (bookmark) => {
        const linkStartTime = Date.now();
        try {
          const result = await this.checkSingleLink(bookmark.url, finalConfig);
          const responseTime = Date.now() - linkStartTime;
          responseTimes.push(responseTime);
          
          results.set(bookmark.url, result);
          
          progress.checked++;
          progress.currentUrl = bookmark.url;
          progress.averageResponseTime = responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length;
          
          // 计算剩余时间估计
          const elapsedTime = Date.now() - startTime;
          const progressRatio = progress.checked / progress.total;
          if (progressRatio > 0.05) { // 至少完成5%后开始预估
            progress.estimatedTimeRemaining = Math.round((elapsedTime / progressRatio) - elapsedTime);
          }
          
          switch (result.status) {
            case 'OK': progress.ok++; break;
            case 'Broken': progress.broken++; break;
            case 'Redirect': progress.redirects++; break;
            case 'Timeout': progress.timeouts++; break;
          }
          
          onProgress?.(progress);
          return result;
        } catch (error) {
          const responseTime = Date.now() - linkStartTime;
          responseTimes.push(responseTime);
          
          const result: LinkCheckResult = {
            url: bookmark.url,
            status: 'Broken',
            error: error.message
          };
          results.set(bookmark.url, result);
          progress.checked++;
          progress.broken++;
          progress.averageResponseTime = responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length;
          
          // 计算剩余时间估计
          const elapsedTime = Date.now() - startTime;
          const progressRatio = progress.checked / progress.total;
          if (progressRatio > 0.05) {
            progress.estimatedTimeRemaining = Math.round((elapsedTime / progressRatio) - elapsedTime);
          }
          
          onProgress?.(progress);
          return result;
        }
      }
    );

    const totalTime = Date.now() - startTime;
    console.log(`链接检测完成: 耗时 ${Math.round(totalTime / 1000)}秒, 平均响应时间 ${Math.round(progress.averageResponseTime || 0)}ms`);

    return bookmarks.map(bookmark => ({
      ...bookmark,
      status: results.get(bookmark.url)?.status || 'Unknown'
    }));
  }

  // 根据链接数量计算最优并发数
  private static calculateOptimalConcurrency(linkCount: number, config: LinkCheckConfig): number {
    if (linkCount <= 20) {
      // 少量链接使用最小并发
      return Math.max(5, config.minConcurrency);
    } else if (linkCount <= 100) {
      // 中等数量链接，线性增长
      return Math.min(Math.floor(linkCount * 0.3), config.maxConcurrency);
    } else {
      // 大量链接使用最大并发
      return config.maxConcurrency;
    }
  }

  // 并发控制Promise池
  private static async runConcurrently<T, R>(
    items: T[],
    concurrency: number,
    processor: (item: T) => Promise<R>
  ): Promise<R[]> {
    return new Promise((resolve, reject) => {
      const results: R[] = new Array(items.length);
      let completed = 0;
      let started = 0;
      let running = 0;
      
      const run = () => {
        while (running < concurrency && started < items.length) {
          const index = started++;
          running++;
          
          processor(items[index])
            .then(result => {
              results[index] = result;
              completed++;
              running--;
              
              if (completed === items.length) {
                resolve(results);
              } else {
                run(); // 启动下一个任务
              }
            })
            .catch(error => {
              reject(error);
            });
        }
      };
      
      run(); // 开始执行
    });
  }

  private static async checkSingleLink(
    url: string, 
    config: LinkCheckConfig
  ): Promise<LinkCheckResult> {
    // URL验证和清理
    if (!this.isValidUrl(url)) {
      return {
        url,
        status: 'Broken',
        error: '无效的URL格式'
      };
    }

    const cleanUrl = this.cleanUrl(url);
    
    for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), config.timeout);

        const response = await fetch(cleanUrl, {
          method: config.checkMethod,
          signal: controller.signal,
          redirect: config.followRedirects ? 'follow' : 'manual',
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          }
        });

        clearTimeout(timeoutId);

        if (response.ok) {
          return {
            url,
            status: 'OK',
            statusCode: response.status,
            finalUrl: response.url !== url ? response.url : undefined
          };
        }

        if (response.status >= 300 && response.status < 400) {
          const location = response.headers.get('location');
          return {
            url,
            status: 'Redirect',
            statusCode: response.status,
            finalUrl: location || undefined
          };
        }

        if (attempt === config.maxRetries) {
          return {
            url,
            status: 'Broken',
            statusCode: response.status,
            error: `HTTP ${response.status} ${response.statusText}`
          };
        }

      } catch (error) {
        clearTimeout(timeoutId);
        
        if (error.name === 'AbortError') {
          if (attempt === config.maxRetries) {
            return {
              url,
              status: 'Timeout',
              error: '请求超时'
            };
          }
        } else {
          const errorMessage = error.message || String(error);
          
          // 特殊处理CORS错误
          if (errorMessage.includes('CORS') || errorMessage.includes('Access-Control-Allow-Origin')) {
            return {
              url,
              status: 'Broken',
              error: 'CORS跨域限制 - 网站不允许跨域访问'
            };
          }
          
          // 特殊处理网络错误
          if (errorMessage.includes('NetworkError') || errorMessage.includes('Failed to fetch')) {
            if (attempt === config.maxRetries) {
              return {
                url,
                status: 'Broken',
                error: '网络连接失败或网站无法访问'
              };
            }
          } else if (attempt === config.maxRetries) {
            return {
              url,
              status: 'Broken',
              error: errorMessage
            };
          }
        }

        await this.delay(config.retryDelay * (attempt + 1));
      }
    }

    return {
      url,
      status: 'Broken',
      error: '重试次数已达上限'
    };
  }

  static async checkSingleBookmark(url: string, config: Partial<LinkCheckConfig> = {}): Promise<LinkCheckResult> {
    const finalConfig = { ...this.DEFAULT_CONFIG, ...config };
    return this.checkSingleLink(url, finalConfig);
  }

  static filterBrokenLinks(bookmarks: Bookmark[]): Bookmark[] {
    return bookmarks.filter(bookmark => bookmark.status === 'Broken');
  }

  static filterWorkingLinks(bookmarks: Bookmark[]): Bookmark[] {
    return bookmarks.filter(bookmark => bookmark.status === 'OK');
  }

  static getCheckStatistics(bookmarks: Bookmark[]): {
    total: number;
    ok: number;
    broken: number;
    redirects: number;
    timeouts: number;
    unknown: number;
    healthyRatio: number;
  } {
    const stats = {
      total: bookmarks.length,
      ok: 0,
      broken: 0,
      redirects: 0,
      timeouts: 0,
      unknown: 0,
      healthyRatio: 0
    };

    for (const bookmark of bookmarks) {
      switch (bookmark.status) {
        case 'OK': stats.ok++; break;
        case 'Broken': stats.broken++; break;
        case 'Redirect': stats.redirects++; break;
        case 'Timeout': stats.timeouts++; break;
        default: stats.unknown++; break;
      }
    }

    stats.healthyRatio = stats.total > 0 ? (stats.ok + stats.redirects) / stats.total : 0;
    
    return stats;
  }

  static groupByStatus(bookmarks: Bookmark[]): Record<string, Bookmark[]> {
    const groups: Record<string, Bookmark[]> = {
      OK: [],
      Broken: [],
      Redirect: [],
      Timeout: [],
      Unknown: []
    };

    for (const bookmark of bookmarks) {
      const status = bookmark.status || 'Unknown';
      if (!groups[status]) {
        groups[status] = [];
      }
      groups[status].push(bookmark);
    }

    return groups;
  }

  static async validateUrl(url: string): Promise<boolean> {
    try {
      new URL(url);
      const result = await this.checkSingleBookmark(url, { timeout: 5000 });
      return result.status === 'OK' || result.status === 'Redirect';
    } catch {
      return false;
    }
  }

  static estimateCheckTime(bookmarkCount: number, config: Partial<LinkCheckConfig> = {}): number {
    const finalConfig = { ...this.DEFAULT_CONFIG, ...config };
    const concurrency = this.calculateOptimalConcurrency(bookmarkCount, finalConfig);
    
    // 并发执行的估计时间 = 总时间 / 并发数
    // 考虑超时和重试的平均时间
    const avgTimePerLink = finalConfig.timeout * 0.5 + (finalConfig.retryDelay * finalConfig.maxRetries * 0.1);
    const totalTime = Math.ceil(bookmarkCount / concurrency) * avgTimePerLink;
    
    return totalTime;
  }

  static createCheckReport(bookmarks: Bookmark[]): {
    summary: ReturnType<typeof LinkChecker.getCheckStatistics>;
    brokenLinks: Array<{
      url: string;
      title: string;
      folderPath: string;
      error?: string;
    }>;
    redirects: Array<{
      url: string;
      title: string;
      finalUrl?: string;
    }>;
    recommendations: string[];
  } {
    const summary = this.getCheckStatistics(bookmarks);
    const brokenLinks = this.filterBrokenLinks(bookmarks).map(b => ({
      url: b.url,
      title: b.title,
      folderPath: b.folderPath,
      error: b.status
    }));

    const redirects = bookmarks
      .filter(b => b.status === 'Redirect')
      .map(b => ({
        url: b.url,
        title: b.title,
        finalUrl: b.normalizedUrl
      }));

    const recommendations = [];
    if (summary.broken > 0) {
      recommendations.push(`发现 ${summary.broken} 个失效链接，建议删除或更新`);
    }
    if (summary.redirects > 0) {
      recommendations.push(`发现 ${summary.redirects} 个重定向链接，建议更新为最终URL`);
    }
    if (summary.timeouts > 0) {
      recommendations.push(`发现 ${summary.timeouts} 个超时链接，可能需要增加超时时间重新检测`);
    }
    if (summary.healthyRatio < 0.8) {
      recommendations.push('链接健康度较低，建议进行批量清理');
    }

    return {
      summary,
      brokenLinks,
      redirects,
      recommendations
    };
  }

  private static delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // URL验证方法
  private static isValidUrl(url: string): boolean {
    try {
      const urlObj = new URL(url);
      
      // 检查协议是否有效
      if (!['http:', 'https:', 'ftp:', 'ftps:'].includes(urlObj.protocol)) {
        return false;
      }
      
      // 检查主机名是否有效
      if (!urlObj.hostname || urlObj.hostname.length === 0) {
        return false;
      }
      
      // 检查是否包含异常字符
      if (url.includes('\ufffd') || url.includes('?????????')) {
        return false;
      }
      
      return true;
    } catch (error) {
      return false;
    }
  }

  // URL清理方法
  private static cleanUrl(url: string): string {
    try {
      // 移除不可见字符和异常字符
      let cleanedUrl = url
        .replace(/[\ufffd\u0000-\u001f\u007f-\u009f]/g, '') // 移除控制字符和替换字符
        .replace(/[^\x20-\x7E\u00A0-\uFFFF]/g, '') // 移除非打印字符
        .trim();
      
      // 确保URL以协议开头
      if (!/^https?:\/\//i.test(cleanedUrl)) {
        cleanedUrl = 'http://' + cleanedUrl;
      }
      
      // 使用URL构造函数进一步清理
      const urlObj = new URL(cleanedUrl);
      return urlObj.toString();
    } catch (error) {
      // 如果清理失败，返回原URL
      return url;
    }
  }
}