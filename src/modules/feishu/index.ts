import { Bookmark, FeishuConfig, BitableFieldMapping, ImportProgress } from '@/types/bookmark';
import { Logger } from '@/modules/logger';

export interface FeishuAuthConfig {
  appId: string;
  appSecret: string;
  redirectUri: string;
}

export interface BitableRecord {
  record_id?: string;
  fields: Record<string, any>;
}

export interface BitableResponse {
  code: number;
  msg: string;
  data?: any;
}

export class FeishuIntegration {
  private static readonly BASE_URL = 'https://open.feishu.cn/open-apis';
  private static readonly BITABLE_API = '/bitable/v1';

  static async authenticate(appId: string, appSecret: string): Promise<{
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
  }> {
    try {
      await Logger.info('FEISHU_AUTH_START', '开始飞书认证', { 
        appId: appId.substring(0, 8) + '...' 
      });
      
      // 多维表格API需要租户访问令牌
      const response = await fetch(`${this.BASE_URL}/auth/v3/tenant_access_token/internal`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          app_id: appId,
          app_secret: appSecret
        })
      });

      const data = await response.json();
      console.log('认证API完整响应:', data);
      
      await Logger.debug('FEISHU_AUTH_RESPONSE', '飞书认证API响应', {
        code: data.code,
        msg: data.msg,
        hasAppToken: !!data.app_access_token,
        hasTenantToken: !!data.tenant_access_token
      });
      
      if (data.code !== 0) {
        await Logger.error('FEISHU_AUTH_ERROR', `飞书认证失败: ${data.msg}`, {
          code: data.code,
          msg: data.msg,
          appId: appId.substring(0, 8) + '...'
        });
        throw new Error(`认证失败: ${data.msg}`);
      }

      await Logger.info('FEISHU_AUTH_SUCCESS', '飞书认证成功', {
        expiresIn: data.expire
      });

      return {
        accessToken: data.tenant_access_token,
        refreshToken: '',
        expiresIn: data.expire
      };
    } catch (error) {
      await Logger.error('FEISHU_AUTH_EXCEPTION', '飞书认证异常', {
        appId: appId.substring(0, 8) + '...'
      }, error);
      throw error;
    }
  }

  static async refreshToken(refreshToken: string): Promise<{
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
  }> {
    throw new Error('飞书企业版不支持刷新令牌，需要重新认证');
  }

  static async getBitables(config: FeishuConfig): Promise<Array<{
    appToken: string;
    name: string;
    url: string;
  }>> {
    const response = await fetch(`${this.BASE_URL}/bitable/v1/apps`, {
      headers: {
        'Authorization': `Bearer ${config.accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    const data = await response.json();
    
    if (data.code !== 0) {
      throw new Error(`获取多维表格列表失败: ${data.msg}`);
    }

    return data.data.apps.map((app: any) => ({
      appToken: app.app_token,
      name: app.name,
      url: app.url
    }));
  }

  static async getTables(config: FeishuConfig, appToken: string): Promise<Array<{
    tableId: string;
    name: string;
    revision: number;
  }>> {
    const response = await fetch(`${this.BASE_URL}${this.BITABLE_API}/apps/${appToken}/tables`, {
      headers: {
        'Authorization': `Bearer ${config.accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    const data = await response.json();
    
    if (data.code !== 0) {
      throw new Error(`获取数据表列表失败: ${data.msg}`);
    }

    return data.data.items.map((table: any) => ({
      tableId: table.table_id,
      name: table.name,
      revision: table.revision
    }));
  }

  static async getFields(config: FeishuConfig, appToken: string, tableId: string): Promise<Array<{
    fieldId: string;
    fieldName: string;
    type: string;
    description?: string;
  }>> {
    const response = await fetch(
      `${this.BASE_URL}${this.BITABLE_API}/apps/${appToken}/tables/${tableId}/fields`,
      {
        headers: {
          'Authorization': `Bearer ${config.accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const data = await response.json();
    
    if (data.code !== 0) {
      throw new Error(`获取字段列表失败: ${data.msg}`);
    }

    return data.data.items.map((field: any) => ({
      fieldId: field.field_id,
      fieldName: field.field_name,
      type: field.type,
      description: field.description
    }));
  }

  static async createTable(
    config: FeishuConfig, 
    appToken: string, 
    tableName: string
  ): Promise<{
    tableId: string;
    name: string;
  }> {
    const fields = [
      { field_name: 'URL', type: 1 }, // 单行文本
      { field_name: '标题', type: 1 },
      { field_name: '标签', type: 3 }, // 多选
      { field_name: '备注', type: 2 }, // 多行文本
      { field_name: '文件夹路径', type: 1 },
      { field_name: '浏览器', type: 4 }, // 单选
      { field_name: '创建时间', type: 5 }, // 日期
      { field_name: '图标', type: 1 },
      { field_name: '状态', type: 4 },
      { field_name: '分类', type: 1 }
    ];

    const response = await fetch(
      `${this.BASE_URL}${this.BITABLE_API}/apps/${appToken}/tables`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${config.accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          table: {
            name: tableName,
            default_view_name: '全部书签',
            fields
          }
        })
      }
    );

    const data = await response.json();
    
    if (data.code !== 0) {
      throw new Error(`创建数据表失败: ${data.msg}`);
    }

    return {
      tableId: data.data.table_id,
      name: data.data.name
    };
  }

  static async importBookmarks(
    config: FeishuConfig | { appId: string; appSecret: string; baseId?: string; tableId?: string },
    bookmarks: Bookmark[],
    mapping: BitableFieldMapping,
    onProgress?: (progress: ImportProgress) => void
  ): Promise<ImportProgress> {
    // 初始化进度
    const progress: ImportProgress = {
      total: bookmarks.length,
      processed: 0,
      successful: 0,
      failed: 0,
      errors: [],
      status: '正在认证...',
      stage: 'authenticating'
    };
    
    onProgress?.(progress);
    
    // 先获取访问令牌
    let accessToken: string;
    let finalConfig: FeishuConfig;
    
    if ('accessToken' in config && config.accessToken) {
      accessToken = config.accessToken;
      finalConfig = config;
    } else if ('appId' in config && 'appSecret' in config && config.appId && config.appSecret) {
      progress.status = '正在进行飞书认证...';
      onProgress?.(progress);
      
      const authResult = await this.authenticate(config.appId, config.appSecret);
      accessToken = authResult.accessToken;
      finalConfig = {
        accessToken,
        baseId: config.baseId,
        tableId: config.tableId
      };
      
      progress.status = '认证成功，准备导入...';
      onProgress?.(progress);
    } else {
      throw new Error('缺少必要的认证信息');
    }

    // 如果没有配置表格信息，需要先创建
    if (!finalConfig.baseId || !finalConfig.tableId) {
      throw new Error('未配置飞书多维表格信息，请先创建多维表格并配置Base ID和Table ID');
    }
    
    // 检查权限
    progress.status = '检查应用权限...';
    onProgress?.(progress);
    
    const permissionCheck = await this.checkPermissions(finalConfig);
    console.log('权限检查结果:', permissionCheck);
    
    if (!permissionCheck.canWrite) {
      throw new Error(permissionCheck.error || '没有写入权限');
    }
    
    progress.status = '权限检查通过，开始批量导入书签...';
    progress.stage = 'importing';
    onProgress?.(progress);

    const batchSize = 100; // 飞书API限制每次最多100条记录
    const totalBatches = Math.ceil(bookmarks.length / batchSize);

    for (let i = 0; i < bookmarks.length; i += batchSize) {
      const batchNumber = Math.floor(i / batchSize) + 1;
      const batch = bookmarks.slice(i, i + batchSize);
      
      progress.status = `正在导入第 ${batchNumber}/${totalBatches} 批数据... (${Math.min(i + batchSize, bookmarks.length)}/${bookmarks.length})`;
      onProgress?.(progress);
      
      const records: BitableRecord[] = batch.map(bookmark => ({
        fields: this.mapBookmarkToFields(bookmark, mapping)
      }));

      try {
        console.log(`正在插入第 ${batchNumber} 批记录，包含 ${records.length} 条数据`);
        console.log('样本记录字段:', Object.keys(records[0]?.fields || {}));
        
        await this.insertRecords(finalConfig, records);
        progress.processed += batch.length;
        progress.successful += batch.length;
        
        console.log(`第 ${batchNumber} 批导入成功，累计成功: ${progress.successful}`);
        progress.status = `第 ${batchNumber} 批导入成功，已完成 ${progress.processed}/${bookmarks.length} 个书签`;
      } catch (error) {
        console.error(`第 ${batchNumber} 批导入失败:`, error);
        progress.processed += batch.length;
        progress.failed += batch.length;
        
        for (const bookmark of batch) {
          progress.errors.push({
            bookmark,
            error: error.message
          });
        }
        
        progress.status = `第 ${batchNumber} 批导入失败，继续处理... (${progress.processed}/${bookmarks.length})`;
      }

      onProgress?.(progress);

      // 避免触发API限流，在最后一批之前等待
      if (i + batchSize < bookmarks.length) {
        progress.status = `等待 1 秒以避免API限流... (${progress.processed}/${bookmarks.length})`;
        onProgress?.(progress);
        await this.delay(1000);
      }
    }
    
    // 最终状态
    progress.status = `导入完成！成功: ${progress.successful}, 失败: ${progress.failed}`;
    progress.stage = 'completed';
    onProgress?.(progress);

    return progress;
  }

  private static mapBookmarkToFields(
    bookmark: Bookmark, 
    mapping: BitableFieldMapping
  ): Record<string, any> {
    const fields: Record<string, any> = {};

    if (mapping.url) fields[mapping.url] = bookmark.url;
    if (mapping.title) fields[mapping.title] = bookmark.title;
    if (mapping.tags) fields[mapping.tags] = bookmark.tags;
    if (mapping.note) fields[mapping.note] = bookmark.note;
    if (mapping.folderPath) fields[mapping.folderPath] = bookmark.folderPath;
    if (mapping.browser) fields[mapping.browser] = bookmark.browser;
    if (mapping.createdAt) fields[mapping.createdAt] = bookmark.createdAt;
    if (mapping.favicon) fields[mapping.favicon] = bookmark.faviconUrl || '';
    if (mapping.status) fields[mapping.status] = bookmark.status;
    if (mapping.category) {
      // 基于标签或文件夹路径生成分类
      const category = bookmark.tags.length > 0 
        ? bookmark.tags[0] 
        : bookmark.folderPath.split('/').pop() || '未分类';
      fields[mapping.category] = category;
    }

    return fields;
  }

  private static async insertRecords(
    config: FeishuConfig, 
    records: BitableRecord[]
  ): Promise<void> {
    const url = `${this.BASE_URL}${this.BITABLE_API}/apps/${config.baseId}/tables/${config.tableId}/records/batch_create`;
    console.log(`调用飞书API: ${url}`);
    console.log(`插入 ${records.length} 条记录`);
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ records })
    });

    const data = await response.json();
    console.log('飞书API响应:', data);
    
    if (data.code !== 0) {
      console.error('飞书API错误详情:', data);
      
      let errorMessage = `插入记录失败: ${data.msg} (code: ${data.code})`;
      
      // 提供具体的错误解决方案
      if (data.code === 91403) {
        errorMessage += `\n\n可能的解决方案：\n`;
        errorMessage += `1. 确保飞书应用已获得 "多维表格" 权限\n`;
        errorMessage += `2. 检查 Base ID 和 Table ID 是否正确\n`;
        errorMessage += `3. 确认当前用户对该多维表格有写入权限\n`;
        errorMessage += `4. 尝试重新生成 App ID 和 App Secret`;
      }
      
      throw new Error(errorMessage);
    }
    
    console.log(`成功插入 ${data.data?.records?.length || records.length} 条记录`);
  }

  // 新增权限检查方法
  static async checkPermissions(config: FeishuConfig): Promise<{
    canRead: boolean;
    canWrite: boolean;
    error?: string;
    details?: any;
  }> {
    try {
      await Logger.info('FEISHU_PERMISSIONS_CHECK', '开始详细权限检查');
      
      // 1. 测试基本的API访问权限 - 直接测试指定应用
      console.log('🔍 步骤1: 测试应用访问权限...');
      console.log(`📍 Base ID: ${config.baseId}`);
      
      if (!config.baseId) {
        return {
          canRead: false,
          canWrite: false,
          error: '缺少Base ID配置',
          details: {
            step: '配置检查',
            error: '未配置Base ID',
            suggestion: '请在设置中填入正确的Base ID'
          }
        };
      }

      const appsResponse = await fetch(`${this.BASE_URL}${this.BITABLE_API}/apps/${config.baseId}`, {
        headers: {
          'Authorization': `Bearer ${config.accessToken}`,
          'Content-Type': 'application/json'
        }
      });

      console.log('📋 API响应状态:', appsResponse.status, appsResponse.statusText);
      
      // 检查响应状态
      if (!appsResponse.ok) {
        const errorText = await appsResponse.text();
        console.log('📋 API错误响应文本:', errorText);
        
        return {
          canRead: false,
          canWrite: false,
          error: `应用访问失败: HTTP ${appsResponse.status} - ${appsResponse.statusText}`,
          details: {
            step: '应用访问权限',
            status: appsResponse.status,
            statusText: appsResponse.statusText,
            baseId: config.baseId,
            responseText: errorText.substring(0, 200) + (errorText.length > 200 ? '...' : ''),
            suggestion: appsResponse.status === 404 ? 'Base ID不存在或不正确' : 
                       appsResponse.status === 403 ? 'Access Token权限不足' :
                       appsResponse.status === 401 ? 'Access Token无效或过期' :
                       '检查Access Token是否有效，以及网络连接'
          }
        };
      }

      let appsData;
      try {
        const responseText = await appsResponse.text();
        console.log('📋 原始响应文本:', responseText.substring(0, 200) + (responseText.length > 200 ? '...' : ''));
        appsData = JSON.parse(responseText);
      } catch (parseError) {
        console.error('📋 JSON解析失败:', parseError);
        
        return {
          canRead: false,
          canWrite: false,
          error: `JSON解析失败: ${parseError.message}`,
          details: {
            step: 'JSON解析',
            error: parseError.message,
            suggestion: '服务器返回了非JSON格式的响应，可能是HTML错误页面或认证失败'
          }
        };
      }
      
      console.log('📋 应用信息API响应:', appsData);
      
      if (appsData.code !== 0) {
        const errorDetails = {
          step: '应用信息获取',
          code: appsData.code,
          message: appsData.msg,
          baseId: config.baseId,
          suggestion: this.getSuggestionForError(appsData.code)
        };
        
        return {
          canRead: false,
          canWrite: false,
          error: `无法访问应用信息: ${appsData.msg} (code: ${appsData.code})`,
          details: errorDetails
        };
      }

      // 2. 测试表格访问权限
      if (config.baseId && config.tableId) {
        console.log('🔍 步骤2: 测试表格访问权限...');
        console.log(`📍 Table ID: ${config.tableId}`);

        // 测试表格字段获取权限
        const fieldsResponse = await fetch(
          `${this.BASE_URL}${this.BITABLE_API}/apps/${config.baseId}/tables/${config.tableId}/fields`,
          {
            headers: {
              'Authorization': `Bearer ${config.accessToken}`,
              'Content-Type': 'application/json'
            }
          }
        );

        const fieldsData = await fieldsResponse.json();
        console.log('📋 表格字段API响应:', fieldsData);
        
        // 显示实际的字段名称
        if (fieldsData.code === 0 && fieldsData.data?.items) {
          const fieldNames = fieldsData.data.items.map((field: any) => field.field_name);
          console.log('📋 表格实际字段名称:', fieldNames);
          console.log('📋 扩展程序期望的字段名称:', ['URL', '标题', '标签', '备注', '文件夹路径', '浏览器', '创建时间', '图标', '状态']);
        }
        
        if (fieldsData.code !== 0) {
          const errorDetails = {
            step: '表格字段权限',
            code: fieldsData.code,
            message: fieldsData.msg,
            baseId: config.baseId,
            tableId: config.tableId,
            suggestion: this.getSuggestionForError(fieldsData.code)
          };
          
          return {
            canRead: false,
            canWrite: false,
            error: `无法访问表格字段: ${fieldsData.msg} (code: ${fieldsData.code})`,
            details: errorDetails
          };
        }

        // 测试记录读取权限
        console.log('🔍 步骤3: 测试记录读取权限...');
        const recordsResponse = await fetch(
          `${this.BASE_URL}${this.BITABLE_API}/apps/${config.baseId}/tables/${config.tableId}/records?page_size=1`,
          {
            headers: {
              'Authorization': `Bearer ${config.accessToken}`,
              'Content-Type': 'application/json'
            }
          }
        );

        const recordsData = await recordsResponse.json();
        console.log('📋 记录读取API响应:', recordsData);
        
        const canRead = recordsData.code === 0;
        
        if (!canRead) {
          const errorDetails = {
            step: '记录读取权限',
            code: recordsData.code,
            message: recordsData.msg,
            baseId: config.baseId,
            tableId: config.tableId,
            suggestion: this.getSuggestionForError(recordsData.code)
          };
          
          return {
            canRead: false,
            canWrite: false,
            error: `无法读取表格记录: ${recordsData.msg} (code: ${recordsData.code})`,
            details: errorDetails
          };
        }

        // 测试写入权限 - 尝试创建一个测试记录然后立即删除
        console.log('🔍 步骤4: 测试写入权限...');
        const testRecord = {
          fields: {
            'URL': 'https://test-write-permission.example.com',
            '标题': '权限测试记录 - 请忽略',
            '状态': '测试'
          }
        };

        try {
          const writeTestResponse = await fetch(
            `${this.BASE_URL}${this.BITABLE_API}/apps/${config.baseId}/tables/${config.tableId}/records`,
            {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${config.accessToken}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify(testRecord)
            }
          );

          const writeTestData = await writeTestResponse.json();
          console.log('📋 写入测试API响应:', writeTestData);
          
          let canWrite = false;
          let writeError = '';
          
          if (writeTestData.code === 0) {
            canWrite = true;
            // 立即删除测试记录
            const recordId = writeTestData.data?.record?.record_id;
            if (recordId) {
              try {
                await fetch(
                  `${this.BASE_URL}${this.BITABLE_API}/apps/${config.baseId}/tables/${config.tableId}/records/${recordId}`,
                  {
                    method: 'DELETE',
                    headers: {
                      'Authorization': `Bearer ${config.accessToken}`,
                      'Content-Type': 'application/json'
                    }
                  }
                );
                console.log('🗑️ 测试记录已删除');
              } catch (deleteError) {
                console.log('⚠️ 删除测试记录失败，请手动删除');
              }
            }
          } else {
            writeError = `${writeTestData.msg} (code: ${writeTestData.code})`;
          }

          console.log('✅ 权限检查完成:', canWrite ? '读写权限正常' : '仅有读取权限');
          return {
            canRead: true,
            canWrite,
            error: !canWrite ? `写入权限不足: ${writeError}` : undefined,
            details: {
              step: '权限检查完成',
              appName: appsData.data?.app?.name,
              fieldCount: fieldsData.data?.items?.length,
              recordCount: recordsData.data?.total,
              writePermission: canWrite,
              writeError: !canWrite ? writeError : undefined
            }
          };
        } catch (writeTestError) {
          console.error('📋 写入权限测试失败:', writeTestError);
          return {
            canRead: true,
            canWrite: false,
            error: `写入权限测试失败: ${writeTestError.message}`,
            details: {
              step: '写入权限测试异常',
              appName: appsData.data?.app?.name,
              fieldCount: fieldsData.data?.items?.length,
              recordCount: recordsData.data?.total,
              writeTestError: writeTestError.message
            }
          };
        }
      }

      console.log('✅ 基本权限检查通过');
      return {
        canRead: true,
        canWrite: true
      };
    } catch (error) {
      await Logger.error('FEISHU_PERMISSIONS_CHECK', '权限检查失败', undefined, error as Error);
      return {
        canRead: false,
        canWrite: false,
        error: `权限检查异常: ${error instanceof Error ? error.message : String(error)}`,
        details: { step: '异常处理', error: error instanceof Error ? error.message : String(error) }
      };
    }
  }

  private static getSuggestionForError(code: number): string {
    switch (code) {
      case 91403:
        return '权限不足，请检查：1) 应用是否有"多维表格"权限 2) Base ID和Table ID是否正确 3) 应用是否已发布 4) 重新生成Access Token';
      case 91401:
        return 'Access Token无效，请重新获取Token';
      case 91404:
        return '资源不存在，请检查Base ID和Table ID是否正确';
      case 91400:
        return '请求参数错误，请检查API调用格式';
      case 91429:
        return 'API调用频率过高，请稍后再试';
      default:
        return '未知错误，请查看飞书开放平台文档';
    }
  }

  static async exportBookmarksFromBitable(
    config: FeishuConfig,
    mapping: BitableFieldMapping
  ): Promise<Bookmark[]> {
    if (!config.baseId || !config.tableId) {
      throw new Error('未配置飞书多维表格信息');
    }

    const records = await this.getAllRecords(config);
    return records.map(record => this.mapFieldsToBookmark(record.fields, mapping));
  }

  private static async getAllRecords(config: FeishuConfig): Promise<BitableRecord[]> {
    const allRecords: BitableRecord[] = [];
    let pageToken = '';

    do {
      const url = new URL(
        `${this.BASE_URL}${this.BITABLE_API}/apps/${config.baseId}/tables/${config.tableId}/records`
      );
      
      if (pageToken) {
        url.searchParams.set('page_token', pageToken);
      }
      url.searchParams.set('page_size', '500');

      const response = await fetch(url.toString(), {
        headers: {
          'Authorization': `Bearer ${config.accessToken}`,
          'Content-Type': 'application/json'
        }
      });

      const data = await response.json();
      
      if (data.code !== 0) {
        throw new Error(`获取记录失败: ${data.msg}`);
      }

      allRecords.push(...data.data.items);
      pageToken = data.data.page_token || '';
      
    } while (pageToken);

    return allRecords;
  }

  private static mapFieldsToBookmark(
    fields: Record<string, any>, 
    mapping: BitableFieldMapping
  ): Bookmark {
    const bookmark: Bookmark = {
      url: fields[mapping.url] || '',
      title: fields[mapping.title] || 'Untitled',
      createdAt: fields[mapping.createdAt] || Date.now(),
      browser: fields[mapping.browser] || 'Chrome',
      folderPath: fields[mapping.folderPath] || '',
      tags: Array.isArray(fields[mapping.tags]) ? fields[mapping.tags] : [],
      note: fields[mapping.note] || '',
      status: fields[mapping.status] || 'Unknown',
      normalizedUrl: fields[mapping.url] || '',
      sourceId: 'feishu',
      browserNodeIds: {},
      faviconUrl: fields[mapping.favicon]
    };

    return bookmark;
  }

  static async clearTable(config: FeishuConfig): Promise<void> {
    if (!config.baseId || !config.tableId) {
      throw new Error('未配置飞书多维表格信息');
    }

    const records = await this.getAllRecords(config);
    const recordIds = records
      .filter(r => r.record_id)
      .map(r => r.record_id!);

    if (recordIds.length === 0) {
      return;
    }

    // 批量删除记录
    const batchSize = 100;
    for (let i = 0; i < recordIds.length; i += batchSize) {
      const batch = recordIds.slice(i, i + batchSize);
      
      await fetch(
        `${this.BASE_URL}${this.BITABLE_API}/apps/${config.baseId}/tables/${config.tableId}/records/batch_delete`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${config.accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ records: batch })
        }
      );

      if (i + batchSize < recordIds.length) {
        await this.delay(1000);
      }
    }
  }

  static async testConnection(config: FeishuConfig | { appId: string; appSecret: string }): Promise<boolean> {
    try {
      await Logger.info('FEISHU_TEST_CONNECTION_START', '开始测试飞书连接');
      
      // 检查必要参数
      if (!('appId' in config) || !('appSecret' in config) || !config.appId || !config.appSecret) {
        await Logger.error('FEISHU_TEST_CONNECTION_MISSING_CONFIG', '缺少必要的认证信息');
        return false;
      }

      // 直接调用认证API来测试连接
      const authResult = await this.authenticate(config.appId, config.appSecret);
      
      await Logger.info('FEISHU_TEST_CONNECTION_SUCCESS', '飞书连接测试成功', {
        hasAccessToken: !!authResult.accessToken,
        expiresIn: authResult.expiresIn
      });
      
      return true;
    } catch (error) {
      await Logger.error('FEISHU_TEST_CONNECTION_ERROR', `飞书连接测试失败: ${error.message}`, null, error);
      console.error('测试飞书连接失败:', error);
      return false;
    }
  }

  private static delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}