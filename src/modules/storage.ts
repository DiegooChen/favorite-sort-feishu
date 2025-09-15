import { Bookmark, OperationLog, Snapshot, TagRule, NormalizationConfig, FeishuConfig } from '@/types/bookmark';

export class Storage {
  private static readonly KEYS = {
    BOOKMARKS: 'bookmarks',
    OPERATION_LOGS: 'operationLogs',
    SNAPSHOTS: 'snapshots',
    TAG_RULES: 'tagRules',
    NORMALIZATION_CONFIG: 'normalizationConfig',
    FEISHU_CONFIG: 'feishuConfig',
    ENCRYPTED_TOKENS: 'encryptedTokens'
  };

  static async saveBookmarks(bookmarks: Bookmark[]): Promise<void> {
    await chrome.storage.local.set({
      [this.KEYS.BOOKMARKS]: bookmarks
    });
  }

  static async getBookmarks(): Promise<Bookmark[]> {
    const result = await chrome.storage.local.get(this.KEYS.BOOKMARKS);
    const bookmarks = result[this.KEYS.BOOKMARKS] || [];
    return bookmarks;
  }

  static async clearBookmarks(): Promise<void> {
    await chrome.storage.local.remove(this.KEYS.BOOKMARKS);
  }

  static async saveOperationLog(log: OperationLog): Promise<void> {
    const logs = await this.getOperationLogs();
    logs.unshift(log);
    // 只保留最近100条日志
    if (logs.length > 100) {
      logs.splice(100);
    }
    await chrome.storage.local.set({
      [this.KEYS.OPERATION_LOGS]: logs
    });
  }

  static async getOperationLogs(): Promise<OperationLog[]> {
    const result = await chrome.storage.local.get(this.KEYS.OPERATION_LOGS);
    return result[this.KEYS.OPERATION_LOGS] || [];
  }

  static async saveSnapshot(snapshot: Snapshot): Promise<void> {
    const snapshots = await this.getSnapshots();
    snapshots.unshift(snapshot);
    // 只保留最近10个快照
    if (snapshots.length > 10) {
      snapshots.splice(10);
    }
    await chrome.storage.local.set({
      [this.KEYS.SNAPSHOTS]: snapshots
    });
  }

  static async getSnapshots(): Promise<Snapshot[]> {
    const result = await chrome.storage.local.get(this.KEYS.SNAPSHOTS);
    return result[this.KEYS.SNAPSHOTS] || [];
  }

  static async getLatestSnapshot(browser: 'Edge' | 'Chrome'): Promise<Snapshot | null> {
    const snapshots = await this.getSnapshots();
    return snapshots.find(s => s.browser === browser) || null;
  }

  static async saveTagRules(rules: TagRule[]): Promise<void> {
    await chrome.storage.local.set({
      [this.KEYS.TAG_RULES]: rules
    });
  }

  static async getTagRules(): Promise<TagRule[]> {
    const result = await chrome.storage.local.get(this.KEYS.TAG_RULES);
    return result[this.KEYS.TAG_RULES] || [];
  }

  static async saveNormalizationConfig(config: NormalizationConfig): Promise<void> {
    await chrome.storage.local.set({
      [this.KEYS.NORMALIZATION_CONFIG]: config
    });
  }

  static async getNormalizationConfig(): Promise<NormalizationConfig> {
    const result = await chrome.storage.local.get(this.KEYS.NORMALIZATION_CONFIG);
    return result[this.KEYS.NORMALIZATION_CONFIG] || {
      removeWww: true,
      removeMobile: true,
      removeFragment: true,
      removeTrackingParams: true,
      customTrackingParams: []
    };
  }

  static async saveFeishuConfig(config: FeishuConfig): Promise<void> {
    // 加密敏感信息
    const encryptedConfig = await this.encryptFeishuConfig(config);
    await chrome.storage.local.set({
      [this.KEYS.FEISHU_CONFIG]: encryptedConfig
    });
  }

  static async getFeishuConfig(): Promise<FeishuConfig> {
    const result = await chrome.storage.local.get(this.KEYS.FEISHU_CONFIG);
    const encryptedConfig = result[this.KEYS.FEISHU_CONFIG];
    if (!encryptedConfig) return {};
    return await this.decryptFeishuConfig(encryptedConfig);
  }

  static async clearFeishuConfig(): Promise<void> {
    await chrome.storage.local.remove([this.KEYS.FEISHU_CONFIG, this.KEYS.ENCRYPTED_TOKENS]);
  }

  private static async encryptFeishuConfig(config: FeishuConfig): Promise<any> {
    if (!config.accessToken && !config.refreshToken) {
      return config;
    }

    try {
      const key = await crypto.subtle.generateKey(
        { name: 'AES-GCM', length: 256 },
        true,
        ['encrypt', 'decrypt']
      );

      const iv = crypto.getRandomValues(new Uint8Array(12));
      const encoder = new TextEncoder();
      
      const tokenData = {
        accessToken: config.accessToken,
        refreshToken: config.refreshToken
      };

      const encrypted = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        key,
        encoder.encode(JSON.stringify(tokenData))
      );

      const keyData = await crypto.subtle.exportKey('raw', key);

      return {
        ...config,
        accessToken: undefined,
        refreshToken: undefined,
        encrypted: {
          data: Array.from(new Uint8Array(encrypted)),
          iv: Array.from(iv),
          key: Array.from(new Uint8Array(keyData))
        }
      };
    } catch (error) {
      console.error('加密失败:', error);
      return config;
    }
  }

  private static async decryptFeishuConfig(encryptedConfig: any): Promise<FeishuConfig> {
    if (!encryptedConfig.encrypted) {
      return encryptedConfig;
    }

    try {
      const { data, iv, key: keyData } = encryptedConfig.encrypted;
      
      const key = await crypto.subtle.importKey(
        'raw',
        new Uint8Array(keyData),
        { name: 'AES-GCM' },
        false,
        ['decrypt']
      );

      const decrypted = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: new Uint8Array(iv) },
        key,
        new Uint8Array(data)
      );

      const decoder = new TextDecoder();
      const tokenData = JSON.parse(decoder.decode(decrypted));

      return {
        ...encryptedConfig,
        accessToken: tokenData.accessToken,
        refreshToken: tokenData.refreshToken,
        encrypted: undefined
      };
    } catch (error) {
      console.error('解密失败:', error);
      return {
        ...encryptedConfig,
        encrypted: undefined
      };
    }
  }
}