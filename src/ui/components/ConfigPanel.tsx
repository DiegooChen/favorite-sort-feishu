import React, { useState, useEffect } from 'react';
import './ConfigPanel.css';

interface ConfigPanelProps {
  config: any;
  onConfigSave: (key: string, data: any) => Promise<void>;
  onConfigReset: () => Promise<void>;
}

const testFeishuConnection = async (config: any) => {
  try {
    // 构建测试配置，优先使用手动Token
    const testConfig = { ...config?.feishu };
    if (config?.feishu?.manualToken && config.feishu.manualToken.trim()) {
      testConfig.accessToken = config.feishu.manualToken.trim();
    }
    
    const result = await chrome.runtime.sendMessage({
      action: 'TEST_FEISHU_CONNECTION',
      payload: { config: testConfig }
    });
    
    if (result.success) {
      alert('飞书连接测试成功！');
    } else {
      alert(`飞书连接测试失败: ${result.error}`);
    }
  } catch (error) {
    alert(`连接测试异常: ${error.message}`);
  }
};

export const ConfigPanel: React.FC<ConfigPanelProps> = ({
  config,
  onConfigSave,
  onConfigReset
}) => {
  // 本地状态管理，避免每次输入都触发重新渲染
  const [localConfig, setLocalConfig] = useState(config || {});
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // 当外部config变化时，更新本地状态
  useEffect(() => {
    setLocalConfig(config || {});
    setHasUnsavedChanges(false);
  }, [config]);

  // 更新本地配置状态
  const updateLocalConfig = (key: string, data: any) => {
    setLocalConfig(prev => ({
      ...prev,
      [key]: data
    }));
    setHasUnsavedChanges(true);
  };

  // 保存配置
  const handleSaveConfig = async () => {
    try {
      // 保存所有修改的配置
      if (localConfig.normalization) {
        await onConfigSave('normalization', localConfig.normalization);
      }
      if (localConfig.feishu) {
        await onConfigSave('feishu', localConfig.feishu);
      }
      setHasUnsavedChanges(false);
    } catch (error) {
      alert(`保存配置失败: ${error.message}`);
    }
  };
  return (
    <div className="config-panel">
      <h2>配置设置</h2>
      <div className="config-sections">
        <div className="config-section">
          <h3>URL规范化</h3>
          <p className="section-description">配置URL处理和清洗规则</p>
          {localConfig?.normalization && (
            <div className="config-options">
              <label className="config-checkbox">
                <input
                  type="checkbox"
                  checked={localConfig.normalization.removeWww || false}
                  onChange={(e) => updateLocalConfig('normalization', {
                    ...localConfig.normalization,
                    removeWww: e.target.checked
                  })}
                />
                <span className="checkbox-content">
                  <span className="checkbox-title">移除 www 前缀</span>
                  <span className="checkbox-desc">将 www.example.com 转换为 example.com</span>
                </span>
              </label>
              <label className="config-checkbox">
                <input
                  type="checkbox"
                  checked={localConfig.normalization.removeMobile || false}
                  onChange={(e) => updateLocalConfig('normalization', {
                    ...localConfig.normalization,
                    removeMobile: e.target.checked
                  })}
                />
                <span className="checkbox-content">
                  <span className="checkbox-title">移除移动端前缀</span>
                  <span className="checkbox-desc">将 m.example.com 转换为 example.com</span>
                </span>
              </label>
              <label className="config-checkbox">
                <input
                  type="checkbox"
                  checked={localConfig.normalization.removeTrackingParams || false}
                  onChange={(e) => updateLocalConfig('normalization', {
                    ...localConfig.normalization,
                    removeTrackingParams: e.target.checked
                  })}
                />
                <span className="checkbox-content">
                  <span className="checkbox-title">移除跟踪参数</span>
                  <span className="checkbox-desc">清理 utm_source 等统计参数</span>
                </span>
              </label>
              <label className="config-checkbox">
                <input
                  type="checkbox"
                  checked={localConfig.normalization.removeFragment || false}
                  onChange={(e) => updateLocalConfig('normalization', {
                    ...localConfig.normalization,
                    removeFragment: e.target.checked
                  })}
                />
                <span className="checkbox-content">
                  <span className="checkbox-title">移除锚点</span>
                  <span className="checkbox-desc">去除URL中的#fragment部分</span>
                </span>
              </label>
            </div>
          )}
        </div>

        <div className="config-section">
          <h3>飞书配置</h3>
          <p className="section-description">配置飞书多维表格连接信息</p>
          <div className="config-options">
            <div className="config-input">
              <label>
                <span className="input-label">
                  <span className="label-icon">🔑</span>
                  App ID
                </span>
                <input
                  type="text"
                  placeholder="请输入飞书应用ID"
                  value={localConfig?.feishu?.appId || ''}
                  onChange={(e) => updateLocalConfig('feishu', {
                    ...localConfig?.feishu,
                    appId: e.target.value
                  })}
                />
              </label>
            </div>
            <div className="config-input">
              <label>
                <span className="input-label">
                  <span className="label-icon">🔐</span>
                  App Secret
                </span>
                <input
                  type="password"
                  placeholder="请输入飞书应用密钥"
                  value={localConfig?.feishu?.appSecret || ''}
                  onChange={(e) => updateLocalConfig('feishu', {
                    ...localConfig?.feishu,
                    appSecret: e.target.value
                  })}
                />
              </label>
            </div>
            <div className="config-input">
              <label>
                <span className="input-label">
                  <span className="label-icon">📊</span>
                  Base Token (多维表格ID)
                </span>
                <input
                  type="text"
                  placeholder="例如: UdCEbCW9fa1ness3LDmcTECVn8c"
                  value={localConfig?.feishu?.baseId || ''}
                  onChange={(e) => updateLocalConfig('feishu', {
                    ...localConfig?.feishu,
                    baseId: e.target.value
                  })}
                />
              </label>
            </div>
            <div className="config-input">
              <label>
                <span className="input-label">
                  <span className="label-icon">📋</span>
                  Table ID (数据表ID)
                </span>
                <input
                  type="text"
                  placeholder="例如: tblRe3G9kNMXN7RD"
                  value={localConfig?.feishu?.tableId || ''}
                  onChange={(e) => updateLocalConfig('feishu', {
                    ...localConfig?.feishu,
                    tableId: e.target.value
                  })}
                />
              </label>
            </div>
            {config?.feishu?.accessToken && (
              <div className="connection-status">
                <span className="config-status connected">
                  ✓ 已连接到飞书
                </span>
              </div>
            )}
            <div className="config-input">
              <label>
                <span className="input-label">
                  <span className="label-icon">🔑</span>
                  手动Access Token (临时测试)
                </span>
                <input
                  type="text"
                  placeholder="临时输入Access Token进行测试"
                  value={localConfig?.feishu?.manualToken || ''}
                  onChange={(e) => updateLocalConfig('feishu', {
                    ...localConfig?.feishu,
                    manualToken: e.target.value
                  })}
                />
              </label>
              <small style={{color: '#666', fontSize: '12px'}}>
                仅用于测试权限问题，正常情况下会自动获取Token
              </small>
            </div>
          </div>
        </div>
      </div>

      <div className="config-actions">
        <button onClick={onConfigReset} className="reset-btn">
          <span className="btn-icon">🔄</span>
          重置配置
        </button>
        <button
          onClick={handleSaveConfig}
          className="save-btn"
          disabled={!hasUnsavedChanges}
          style={{ opacity: hasUnsavedChanges ? 1 : 0.6 }}
        >
          <span className="btn-icon">💾</span>
          {hasUnsavedChanges ? '保存配置' : '已保存'}
        </button>
        <button onClick={() => testFeishuConnection(localConfig)} className="test-btn">
          <span className="btn-icon">🧪</span>
          测试飞书连接
        </button>
      </div>
    </div>
  );
};