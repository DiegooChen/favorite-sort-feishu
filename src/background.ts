import { BookmarkScanner } from '@/modules/scanner';
import { UrlNormalizer } from '@/modules/normalize';
import { BookmarkDeduplicator } from '@/modules/dedupe';
import { TagRuleEngine } from '@/modules/rules';
import { LinkChecker } from '@/modules/linkcheck';
import { FeishuIntegration } from '@/modules/feishu';
import { BookmarkDeleter } from '@/modules/ops-delete';
import { SnapshotManager } from '@/modules/snapshot';
import { BookmarkWriteback } from '@/modules/ops-writeback';
import { Storage } from '@/modules/storage';
import { Logger } from '@/modules/logger';

// Service Worker主入口
console.log('书签整理扩展 Service Worker 已启动');

// 监听扩展图标点击事件，直接打开options页面
chrome.action.onClicked.addListener(async () => {
  await chrome.runtime.openOptionsPage();
});

// 监听扩展安装事件
chrome.runtime.onInstalled.addListener(async (details) => {
  console.log('扩展安装/更新:', details.reason);
  
  if (details.reason === 'install') {
    // 首次安装时的初始化
    await initializeExtension();
  } else if (details.reason === 'update') {
    // 更新时的处理
    await handleUpdate(details.previousVersion);
  }
});

// 监听来自UI的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  Logger.info('MESSAGE_RECEIVED', `接收到消息: ${message.action}`, { 
    action: message.action, 
    sender: sender.id,
    hasPayload: !!message.payload
  });
  
  handleMessage(message, sender)
    .then(response => {
      Logger.info('MESSAGE_SUCCESS', `消息处理成功: ${message.action}`, response);
      sendResponse(response);
    })
    .catch(error => {
      Logger.error('MESSAGE_ERROR', `消息处理失败: ${message.action}`, { 
        action: message.action, 
        payload: message.payload 
      }, error);
      sendResponse({ success: false, error: error.message });
    });
  
  return true; // 保持消息通道开启用于异步响应
});

// 消息处理中心
async function handleMessage(message: any, sender: chrome.runtime.MessageSender) {
  const { action, payload } = message;
  
  switch (action) {
    case 'SCAN_BOOKMARKS':
      return await handleScanBookmarks();
    
    case 'NORMALIZE_URLS':
      return await handleNormalizeUrls(payload);
    
    case 'DEDUPLICATE_BOOKMARKS':
      return await handleDeduplicateBookmarks(payload);
    
    case 'APPLY_TAG_RULES':
      return await handleApplyTagRules(payload);
    
    case 'CHECK_LINKS':
      return await handleCheckLinks(payload);
    
    case 'SYNC_TO_FEISHU':
      return await handleSyncToFeishu(payload);
    
    case 'DELETE_BOOKMARKS':
      return await handleDeleteBookmarks(payload);
    
    case 'CREATE_SNAPSHOT':
      return await handleCreateSnapshot(payload);
    
    case 'RESTORE_SNAPSHOT':
      return await handleRestoreSnapshot(payload);
    
    case 'WRITEBACK_FROM_FEISHU':
      return await handleWritebackFromFeishu(payload);
    
    case 'GET_STORAGE_DATA':
      return await handleGetStorageData(payload);
    
    case 'SAVE_CONFIG':
      return await handleSaveConfig(payload);
    
    case 'TEST_FEISHU_CONNECTION':
      return await handleTestFeishuConnection(payload);
    
    default:
      throw new Error(`未知操作: ${action}`);
  }
}

// 扫描书签
async function handleScanBookmarks() {
  try {
    const bookmarks = await BookmarkScanner.scanAll();
    await Storage.saveBookmarks(bookmarks);
    
    return {
      success: true,
      data: bookmarks,
      stats: await BookmarkScanner.getBookmarkStats()
    };
  } catch (error) {
    throw new Error(`扫描书签失败: ${error.message}`);
  }
}

// URL规范化
async function handleNormalizeUrls(payload: { bookmarks: any[], config: any }) {
  try {
    const { config } = payload;

    // 从存储中获取最新的书签数据，而不是使用前端传来的可能过期的数据
    const existingBookmarks = await Storage.getBookmarks();

    const normalizedBookmarks = existingBookmarks.map(bookmark => ({
      ...bookmark,
      normalizedUrl: UrlNormalizer.normalize(bookmark.url, config)
    }));

    await Storage.saveBookmarks(normalizedBookmarks);

    return {
      success: true,
      data: normalizedBookmarks
    };
  } catch (error) {
    throw new Error(`URL规范化失败: ${error.message}`);
  }
}

// 去重合并
async function handleDeduplicateBookmarks(payload: { bookmarks: any[], config: any }) {
  try {
    const { config } = payload;

    // 从存储中获取最新的书签数据
    const existingBookmarks = await Storage.getBookmarks();
    const result = BookmarkDeduplicator.deduplicate(existingBookmarks, config);

    await Storage.saveBookmarks(result.uniqueBookmarks);

    return {
      success: true,
      data: result
    };
  } catch (error) {
    throw new Error(`去重合并失败: ${error.message}`);
  }
}

// 应用标签规则
async function handleApplyTagRules(payload: { bookmarks: any[], rules?: any[] }) {
  try {
    const { rules } = payload;
    const tagRules = rules || await Storage.getTagRules();

    // 从存储中获取最新的书签数据
    const existingBookmarks = await Storage.getBookmarks();
    const taggedBookmarks = TagRuleEngine.applyRules(existingBookmarks, tagRules);
    await Storage.saveBookmarks(taggedBookmarks);

    return {
      success: true,
      data: taggedBookmarks
    };
  } catch (error) {
    throw new Error(`应用标签规则失败: ${error.message}`);
  }
}

// 链接检测
async function handleCheckLinks(payload: { bookmarks: any[], config: any, onProgress?: Function }) {
  try {
    const { bookmarks: selectedBookmarks, config, onProgress } = payload;

    // 从存储中获取最新的书签数据
    const existingBookmarks = await Storage.getBookmarks();

    // 创建一个Map来快速查找和更新
    const bookmarkMap = new Map<string, any>();
    existingBookmarks.forEach(b => {
      bookmarkMap.set(b.sourceId, b);
      bookmarkMap.set(b.normalizedUrl, b);
    });

    // 确定要检测的书签（如果有选中的，只检测选中的；否则检测全部）
    const bookmarksToCheck = selectedBookmarks.length > 0 ? selectedBookmarks : existingBookmarks;

    const checkedBookmarks = await LinkChecker.checkBookmarks(
      bookmarksToCheck,
      config,
      (progress: any) => {
        // 发送进度更新到UI
        chrome.runtime.sendMessage({
          type: 'CHECK_PROGRESS',
          progress
        });

        // 调用原始的进度回调（如果有）
        if (onProgress) {
          onProgress(progress);
        }
      }
    );

    // 更新存储中的书签状态
    if (selectedBookmarks.length > 0) {
      // 如果只检测了部分书签，更新这部分书签的状态
      checkedBookmarks.forEach(checked => {
        const existing = bookmarkMap.get(checked.sourceId) || bookmarkMap.get(checked.normalizedUrl);
        if (existing) {
          existing.status = checked.status;
        }
      });
      await Storage.saveBookmarks(existingBookmarks);
      return {
        success: true,
        data: existingBookmarks,
        stats: LinkChecker.getCheckStatistics(checkedBookmarks)
      };
    } else {
      // 如果检测了全部书签，直接保存结果
      await Storage.saveBookmarks(checkedBookmarks);
      return {
        success: true,
        data: checkedBookmarks,
        stats: LinkChecker.getCheckStatistics(checkedBookmarks)
      };
    }
  } catch (error) {
    throw new Error(`链接检测失败: ${error.message}`);
  }
}

// 同步到飞书
async function handleSyncToFeishu(payload: { bookmarks: any[], config: any, mapping: any }) {
  try {
    const { bookmarks, config, mapping } = payload;
    
    // 立即发送开始状态
    chrome.runtime.sendMessage({
      type: 'SYNC_PROGRESS',
      progress: {
        total: bookmarks.length,
        processed: 0,
        successful: 0,
        failed: 0,
        status: '正在准备同步...',
        stage: 'preparation'
      }
    });
    
    await Logger.info('SYNC_TO_FEISHU_START', `开始同步 ${bookmarks.length} 个书签到飞书`, {
      bookmarkCount: bookmarks.length,
      hasConfig: !!config,
      hasMapping: !!mapping,
      configKeys: config ? Object.keys(config) : []
    });

    // 验证配置
    chrome.runtime.sendMessage({
      type: 'SYNC_PROGRESS',
      progress: {
        total: bookmarks.length,
        processed: 0,
        successful: 0,
        failed: 0,
        status: '正在验证配置信息...',
        stage: 'validation'
      }
    });
    
    if (!config) {
      throw new Error('缺少飞书配置信息');
    }
    
    if (!config.appId || !config.appSecret) {
      throw new Error('飞书App ID或App Secret未配置');
    }

    if (!mapping) {
      throw new Error('缺少字段映射配置');
    }

    await Logger.debug('SYNC_TO_FEISHU_CONFIG', '飞书配置验证通过', {
      appId: config.appId ? config.appId.substring(0, 8) + '...' : null,
      hasSecret: !!config.appSecret,
      mappingFields: Object.keys(mapping)
    });
    
    // 测试连接
    chrome.runtime.sendMessage({
      type: 'SYNC_PROGRESS',
      progress: {
        total: bookmarks.length,
        processed: 0,
        successful: 0,
        failed: 0,
        status: '正在连接飞书服务器...',
        stage: 'connecting'
      }
    });
    
    await Logger.info('SYNC_TO_FEISHU_TEST', '开始测试飞书连接');
    const connected = await FeishuIntegration.testConnection(config);
    if (!connected) {
      throw new Error('飞书连接测试失败');
    }
    await Logger.info('SYNC_TO_FEISHU_TEST_SUCCESS', '飞书连接测试成功');
    
    // 开始导入
    chrome.runtime.sendMessage({
      type: 'SYNC_PROGRESS',
      progress: {
        total: bookmarks.length,
        processed: 0,
        successful: 0,
        failed: 0,
        status: '开始导入书签数据...',
        stage: 'importing'
      }
    });
    
    console.log(`Background: 开始同步 ${bookmarks.length} 个书签到飞书`);
    console.log('飞书配置:', { 
      appId: config.appId?.substring(0, 8) + '...', 
      hasSecret: !!config.appSecret,
      baseId: config.baseId,
      tableId: config.tableId 
    });
    
    const result = await FeishuIntegration.importBookmarks(
      config,
      bookmarks,
      mapping,
      (progress) => {
        // 发送进度更新到UI
        chrome.runtime.sendMessage({
          type: 'SYNC_PROGRESS',
          progress
        });
        Logger.debug('SYNC_TO_FEISHU_PROGRESS', '同步进度更新', progress);
      }
    );
    
    console.log('飞书同步最终结果:', result);
    
    await Logger.info('SYNC_TO_FEISHU_SUCCESS', '飞书同步完成', {
      total: result.total,
      successful: result.successful,
      failed: result.failed,
      errors: result.errors?.length || 0
    });
    
    return {
      success: true,
      data: result
    };
  } catch (error) {
    await Logger.error('SYNC_TO_FEISHU_ERROR', `同步到飞书失败: ${error.message}`, {
      payload: {
        bookmarkCount: payload.bookmarks?.length,
        hasConfig: !!payload.config,
        hasMapping: !!payload.mapping
      }
    }, error);
    throw new Error(`同步到飞书失败: ${error.message}`);
  }
}

// 删除书签
async function handleDeleteBookmarks(payload: { bookmarks: any[], config: any }) {
  try {
    const { bookmarks, config } = payload;


    const result = await BookmarkDeleter.deleteBookmarks(
      bookmarks,
      config,
      (progress) => {
        chrome.runtime.sendMessage({
          type: 'DELETE_PROGRESS',
          progress
        });
      }
    );

    // 更新存储的书签列表
    // 获取现有的书签数据（包含链接状态等信息）
    const existingBookmarks = await Storage.getBookmarks();


    // 只从存储中移除已删除的书签，而不是重新扫描
    const deletedIds = new Set(bookmarks.map(b => b.sourceId));
    const deletedUrls = new Set(bookmarks.map(b => b.normalizedUrl));


    const remainingBookmarks = existingBookmarks.filter(bookmark => {
      return !deletedIds.has(bookmark.sourceId) && !deletedUrls.has(bookmark.normalizedUrl);
    });


    await Storage.saveBookmarks(remainingBookmarks);

    return {
      success: true,
      data: {
        ...result,
        total: bookmarks.length,
        successful: result.deleted,
        failed: result.failed
      }
    };
  } catch (error) {
    throw new Error(`删除书签失败: ${error.message}`);
  }
}

// 创建快照
async function handleCreateSnapshot(payload: { name?: string }) {
  try {
    const snapshot = await SnapshotManager.createSnapshot(payload.name);
    
    return {
      success: true,
      data: snapshot
    };
  } catch (error) {
    throw new Error(`创建快照失败: ${error.message}`);
  }
}

// 恢复快照
async function handleRestoreSnapshot(payload: { snapshotId: string, options: any }) {
  try {
    const { snapshotId, options } = payload;
    
    const result = await SnapshotManager.restoreSnapshot(snapshotId, options);
    
    // 更新存储的书签列表
    const bookmarks = await BookmarkScanner.scanAll();
    await Storage.saveBookmarks(bookmarks);
    
    return {
      success: true,
      data: result
    };
  } catch (error) {
    throw new Error(`恢复快照失败: ${error.message}`);
  }
}

// 从飞书回写
async function handleWritebackFromFeishu(payload: { bookmarks: any[], config: any }) {
  try {
    const { bookmarks, config } = payload;
    
    const result = await BookmarkWriteback.writebackFromFeishu(
      bookmarks,
      config,
      (progress) => {
        chrome.runtime.sendMessage({
          type: 'WRITEBACK_PROGRESS',
          progress
        });
      }
    );
    
    return {
      success: true,
      data: result
    };
  } catch (error) {
    throw new Error(`从飞书回写失败: ${error.message}`);
  }
}

// 获取存储数据
async function handleGetStorageData(payload: { key: string }) {
  try {
    const { key } = payload;
    
    switch (key) {
      case 'bookmarks':
        return { success: true, data: await Storage.getBookmarks() };
      case 'tagRules':
        return { success: true, data: await Storage.getTagRules() };
      case 'normalizationConfig':
        return { success: true, data: await Storage.getNormalizationConfig() };
      case 'feishuConfig':
        return { success: true, data: await Storage.getFeishuConfig() };
      case 'snapshots':
        return { success: true, data: await Storage.getSnapshots() };
      case 'operationLogs':
        return { success: true, data: await Storage.getOperationLogs() };
      default:
        throw new Error(`未知的存储键: ${key}`);
    }
  } catch (error) {
    throw new Error(`获取存储数据失败: ${error.message}`);
  }
}

// 保存配置
async function handleSaveConfig(payload: { key: string, data: any }) {
  try {
    const { key, data } = payload;
    
    switch (key) {
      case 'tagRules':
        await Storage.saveTagRules(data);
        break;
      case 'normalizationConfig':
        await Storage.saveNormalizationConfig(data);
        break;
      case 'feishuConfig':
        await Storage.saveFeishuConfig(data);
        break;
      default:
        throw new Error(`未知的配置键: ${key}`);
    }
    
    return { success: true };
  } catch (error) {
    throw new Error(`保存配置失败: ${error.message}`);
  }
}

// 初始化扩展
async function initializeExtension() {
  try {
    console.log('初始化扩展...');
    
    // 设置默认配置
    await Storage.saveNormalizationConfig({
      removeWww: true,
      removeMobile: true,
      removeFragment: true,
      removeTrackingParams: true,
      customTrackingParams: []
    });
    
    // 设置默认标签规则
    const defaultRules = TagRuleEngine.getDefaultRules();
    await Storage.saveTagRules(defaultRules);
    
    // 创建初始快照
    await SnapshotManager.createAutoSnapshot('initial-install');
    
    console.log('扩展初始化完成');
  } catch (error) {
    console.error('初始化扩展失败:', error);
  }
}

// 处理更新
async function handleUpdate(previousVersion?: string) {
  try {
    console.log(`从版本 ${previousVersion} 更新`);
    
    // 创建更新前快照
    await SnapshotManager.createAutoSnapshot(`pre-update-${previousVersion}`);
    
    // 处理版本特定的迁移逻辑
    if (previousVersion) {
      // 这里可以添加版本迁移代码
    }
    
    console.log('更新处理完成');
  } catch (error) {
    console.error('处理更新失败:', error);
  }
}

// 测试飞书连接
async function handleTestFeishuConnection(payload: any) {
  try {
    await Logger.info('TEST_FEISHU_START', '开始测试飞书连接');
    
    // 优先使用传入的配置，否则使用存储的配置
    let feishuConfig;
    if (payload?.config) {
      feishuConfig = payload.config;
      console.log('使用传入的飞书配置进行测试');
    } else {
      feishuConfig = await Storage.getFeishuConfig();
      console.log('使用存储的飞书配置进行测试');
    }
    
    await Logger.debug('TEST_FEISHU_CONFIG', '飞书配置信息', {
      hasAppId: !!feishuConfig.appId,
      hasAppSecret: !!feishuConfig.appSecret,
      hasAccessToken: !!feishuConfig.accessToken,
      appId: feishuConfig.appId ? feishuConfig.appId.substring(0, 8) + '...' : null
    });
    
    if (!feishuConfig.appId || !feishuConfig.appSecret) {
      throw new Error('请先在配置中填写飞书App ID和App Secret');
    }
    
    // 测试连接
    const connected = await FeishuIntegration.testConnection(feishuConfig);
    
    if (!connected) {
      throw new Error('飞书连接测试失败，请检查App ID和App Secret是否正确');
    }
    
    await Logger.info('TEST_FEISHU_SUCCESS', '飞书连接测试成功');
    
    return {
      success: true,
      message: '飞书连接测试成功'
    };
  } catch (error) {
    await Logger.error('TEST_FEISHU_ERROR', `飞书连接测试失败: ${error.message}`, null, error);
    throw new Error(`飞书连接测试失败: ${error.message}`);
  }
}

// 监听书签变化事件
chrome.bookmarks.onCreated.addListener(async (id, bookmark) => {
  console.log('书签已创建:', bookmark);
  await refreshBookmarkCache();
});

chrome.bookmarks.onRemoved.addListener(async (id, removeInfo) => {
  console.log('书签已删除:', id);
  await refreshBookmarkCache();
});

chrome.bookmarks.onChanged.addListener(async (id, changeInfo) => {
  console.log('书签已更改:', id, changeInfo);
  await refreshBookmarkCache();
});

chrome.bookmarks.onMoved.addListener(async (id, moveInfo) => {
  console.log('书签已移动:', id, moveInfo);
  await refreshBookmarkCache();
});

// 刷新书签缓存
async function refreshBookmarkCache() {
  try {
    // 获取现有的书签数据以保留状态信息
    const existingBookmarks = await Storage.getBookmarks();
    const statusMap = new Map<string, string>();

    // 创建状态映射
    existingBookmarks.forEach(bookmark => {
      if (bookmark.normalizedUrl) {
        statusMap.set(bookmark.normalizedUrl, bookmark.status);
      }
      if (bookmark.url) {
        statusMap.set(bookmark.url, bookmark.status);
      }
    });

    // 重新扫描书签
    const bookmarks = await BookmarkScanner.scanAll();

    // 恢复状态信息
    bookmarks.forEach(bookmark => {
      const savedStatus = statusMap.get(bookmark.normalizedUrl) || statusMap.get(bookmark.url);
      if (savedStatus && savedStatus !== 'Unknown') {
        bookmark.status = savedStatus;
      }
    });

    await Storage.saveBookmarks(bookmarks);

    // 通知UI更新
    chrome.runtime.sendMessage({
      type: 'BOOKMARKS_UPDATED',
      bookmarks
    });
  } catch (error) {
    console.error('刷新书签缓存失败:', error);
  }
}

// 定期清理任务
setInterval(async () => {
  try {
    // 清理过期的操作日志（保留最近100条）
    const logs = await Storage.getOperationLogs();
    if (logs.length > 100) {
      const recentLogs = logs.slice(0, 100);
      await chrome.storage.local.set({ operationLogs: recentLogs });
    }
    
    // 清理过期的快照（保留最近10个）
    const snapshots = await Storage.getSnapshots();
    if (snapshots.length > 10) {
      const recentSnapshots = snapshots.slice(0, 10);
      await chrome.storage.local.set({ snapshots: recentSnapshots });
    }
  } catch (error) {
    console.error('清理任务失败:', error);
  }
}, 24 * 60 * 60 * 1000); // 每24小时运行一次