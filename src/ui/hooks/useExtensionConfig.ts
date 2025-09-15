import { useState, useEffect, useCallback } from 'react';
import { NormalizationConfig, FeishuConfig, TagRule } from '@/types/bookmark';

interface ExtensionConfig {
  normalization: NormalizationConfig;
  feishu: FeishuConfig;
  tagRules: TagRule[];
}

export const useExtensionConfig = () => {
  const [config, setConfig] = useState<ExtensionConfig | null>(null);
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

  const loadConfig = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      const [normalization, feishu, tagRules] = await Promise.all([
        sendMessage('GET_STORAGE_DATA', { key: 'normalizationConfig' }),
        sendMessage('GET_STORAGE_DATA', { key: 'feishuConfig' }),
        sendMessage('GET_STORAGE_DATA', { key: 'tagRules' })
      ]);

      setConfig({
        normalization: normalization as NormalizationConfig,
        feishu: feishu as FeishuConfig,
        tagRules: tagRules as TagRule[]
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [sendMessage]);

  const saveConfig = useCallback(async (key: keyof ExtensionConfig, data: any) => {
    try {
      const storageKey = key === 'normalization' ? 'normalizationConfig' : 
                        key === 'feishu' ? 'feishuConfig' : 'tagRules';
      
      await sendMessage('SAVE_CONFIG', { key: storageKey, data });
      await loadConfig(); // 重新加载配置
    } catch (err) {
      setError(err.message);
      throw err;
    }
  }, [sendMessage, loadConfig]);

  const resetConfig = useCallback(async () => {
    try {
      // 重置为默认配置
      const defaultNormalization: NormalizationConfig = {
        removeWww: true,
        removeMobile: true,
        removeFragment: true,
        removeTrackingParams: true,
        customTrackingParams: []
      };

      await saveConfig('normalization', defaultNormalization);
      await saveConfig('feishu', {});
    } catch (err) {
      setError(err.message);
      throw err;
    }
  }, [saveConfig]);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  return {
    config,
    loading,
    error,
    saveConfig,
    resetConfig,
    loadConfig
  };
};