import { NormalizationConfig } from '@/types/bookmark';

export class UrlNormalizer {
  private static readonly DEFAULT_TRACKING_PARAMS = [
    'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
    'fbclid', 'gclid', 'msclkid', 'dclid',
    '_ga', '_gid', '_gac_ua',
    'ref', 'referrer',
    'src', 'source',
    'campaign_id', 'ad_id',
    'mc_cid', 'mc_eid',
    'hsCtaTracking',
    'zanpid', 'ali_trackid'
  ];

  private static readonly MOBILE_PREFIXES = ['m.', 'mobile.', 'wap.', 'touch.'];

  static normalize(url: string, config: NormalizationConfig): string {
    try {
      let normalizedUrl = url.trim();
      
      if (!normalizedUrl.startsWith('http://') && !normalizedUrl.startsWith('https://')) {
        normalizedUrl = 'https://' + normalizedUrl;
      }

      const urlObj = new URL(normalizedUrl);

      if (config.removeWww && urlObj.hostname.startsWith('www.')) {
        urlObj.hostname = urlObj.hostname.substring(4);
      }

      if (config.removeMobile) {
        for (const prefix of this.MOBILE_PREFIXES) {
          if (urlObj.hostname.startsWith(prefix)) {
            urlObj.hostname = urlObj.hostname.substring(prefix.length);
            break;
          }
        }
      }

      if (config.removeFragment) {
        urlObj.hash = '';
      }

      if (config.removeTrackingParams) {
        const paramsToRemove = [
          ...this.DEFAULT_TRACKING_PARAMS,
          ...(config.customTrackingParams || [])
        ];

        for (const param of paramsToRemove) {
          urlObj.searchParams.delete(param);
        }
      }

      const cleanedUrl = urlObj.toString();
      return cleanedUrl.endsWith('/') && cleanedUrl !== urlObj.origin + '/' 
        ? cleanedUrl.slice(0, -1) 
        : cleanedUrl;

    } catch (error) {
      console.warn(`URL规范化失败: ${url}`, error);
      return url;
    }
  }

  static normalizeMultiple(urls: string[], config: NormalizationConfig): string[] {
    return urls.map(url => this.normalize(url, config));
  }

  static getDomainFromUrl(url: string): string {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname;
    } catch (error) {
      console.warn(`获取域名失败: ${url}`, error);
      return '';
    }
  }

  static getPathFromUrl(url: string): string {
    try {
      const urlObj = new URL(url);
      return urlObj.pathname;
    } catch (error) {
      console.warn(`获取路径失败: ${url}`, error);
      return '';
    }
  }

  static extractTrackingParams(url: string): Record<string, string> {
    try {
      const urlObj = new URL(url);
      const trackingParams: Record<string, string> = {};
      
      for (const param of this.DEFAULT_TRACKING_PARAMS) {
        const value = urlObj.searchParams.get(param);
        if (value) {
          trackingParams[param] = value;
        }
      }
      
      return trackingParams;
    } catch (error) {
      console.warn(`提取跟踪参数失败: ${url}`, error);
      return {};
    }
  }

  static isSameNormalizedUrl(url1: string, url2: string, config: NormalizationConfig): boolean {
    const normalized1 = this.normalize(url1, config);
    const normalized2 = this.normalize(url2, config);
    return normalized1 === normalized2;
  }

  static isValidUrl(url: string): boolean {
    try {
      new URL(url.startsWith('http') ? url : 'https://' + url);
      return true;
    } catch {
      return false;
    }
  }

  static sortUrlsByDomain(urls: string[]): string[] {
    return urls.sort((a, b) => {
      const domainA = this.getDomainFromUrl(a);
      const domainB = this.getDomainFromUrl(b);
      return domainA.localeCompare(domainB);
    });
  }

  static groupUrlsByDomain(urls: string[]): Record<string, string[]> {
    const groups: Record<string, string[]> = {};
    
    for (const url of urls) {
      const domain = this.getDomainFromUrl(url);
      if (domain) {
        if (!groups[domain]) {
          groups[domain] = [];
        }
        groups[domain].push(url);
      }
    }
    
    return groups;
  }

  static getUrlStatistics(urls: string[]): {
    totalUrls: number;
    uniqueDomains: number;
    domainCounts: Record<string, number>;
    protocolCounts: Record<string, number>;
  } {
    const domainCounts: Record<string, number> = {};
    const protocolCounts: Record<string, number> = {};
    
    for (const url of urls) {
      try {
        const urlObj = new URL(url);
        const domain = urlObj.hostname;
        const protocol = urlObj.protocol;
        
        domainCounts[domain] = (domainCounts[domain] || 0) + 1;
        protocolCounts[protocol] = (protocolCounts[protocol] || 0) + 1;
      } catch (error) {
        console.warn(`URL统计处理失败: ${url}`, error);
      }
    }
    
    return {
      totalUrls: urls.length,
      uniqueDomains: Object.keys(domainCounts).length,
      domainCounts,
      protocolCounts
    };
  }

  static createNormalizationPreview(url: string, config: NormalizationConfig): {
    original: string;
    normalized: string;
    changes: string[];
  } {
    const changes: string[] = [];
    const normalized = this.normalize(url, config);
    
    if (url !== normalized) {
      try {
        const originalUrl = new URL(url);
        const normalizedUrl = new URL(normalized);
        
        if (originalUrl.hostname !== normalizedUrl.hostname) {
          if (config.removeWww && originalUrl.hostname.startsWith('www.')) {
            changes.push('移除www前缀');
          }
          if (config.removeMobile) {
            for (const prefix of this.MOBILE_PREFIXES) {
              if (originalUrl.hostname.startsWith(prefix)) {
                changes.push(`移除${prefix}前缀`);
                break;
              }
            }
          }
        }
        
        if (config.removeFragment && originalUrl.hash && !normalizedUrl.hash) {
          changes.push('移除锚点');
        }
        
        if (config.removeTrackingParams) {
          const originalParams = Array.from(originalUrl.searchParams.keys());
          const normalizedParams = Array.from(normalizedUrl.searchParams.keys());
          const removedParams = originalParams.filter(p => !normalizedParams.includes(p));
          if (removedParams.length > 0) {
            changes.push(`移除跟踪参数: ${removedParams.join(', ')}`);
          }
        }
      } catch (error) {
        console.warn('生成规范化预览失败:', error);
      }
    }
    
    return {
      original: url,
      normalized,
      changes
    };
  }
}