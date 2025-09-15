export interface LogEntry {
  id: string;
  timestamp: number;
  level: 'info' | 'warn' | 'error' | 'debug';
  action: string;
  message: string;
  details?: any;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
}

export class Logger {
  private static readonly MAX_LOGS = 1000;
  private static readonly STORAGE_KEY = 'extensionLogs';

  static async log(level: LogEntry['level'], action: string, message: string, details?: any, error?: Error): Promise<void> {
    const entry: LogEntry = {
      id: this.generateId(),
      timestamp: Date.now(),
      level,
      action,
      message,
      details,
      error: error ? {
        name: error.name,
        message: error.message,
        stack: error.stack
      } : undefined
    };

    try {
      const logs = await this.getLogs();
      logs.unshift(entry);
      
      // 保持日志数量限制
      if (logs.length > this.MAX_LOGS) {
        logs.splice(this.MAX_LOGS);
      }
      
      await chrome.storage.local.set({ [this.STORAGE_KEY]: logs });
      
      // 在开发环境中也输出到控制台
      const consoleMethod = level === 'error' ? console.error : 
                          level === 'warn' ? console.warn : 
                          level === 'debug' ? console.debug : console.log;
      
      consoleMethod(`[${action}] ${message}`, details || '', error || '');
    } catch (storageError) {
      console.error('日志存储失败:', storageError);
    }
  }

  static async info(action: string, message: string, details?: any): Promise<void> {
    return this.log('info', action, message, details);
  }

  static async warn(action: string, message: string, details?: any): Promise<void> {
    return this.log('warn', action, message, details);
  }

  static async error(action: string, message: string, details?: any, error?: Error): Promise<void> {
    return this.log('error', action, message, details, error);
  }

  static async debug(action: string, message: string, details?: any): Promise<void> {
    return this.log('debug', action, message, details);
  }

  static async getLogs(): Promise<LogEntry[]> {
    try {
      const result = await chrome.storage.local.get(this.STORAGE_KEY);
      return result[this.STORAGE_KEY] || [];
    } catch (error) {
      console.error('获取日志失败:', error);
      return [];
    }
  }

  static async clearLogs(): Promise<void> {
    try {
      await chrome.storage.local.remove(this.STORAGE_KEY);
    } catch (error) {
      console.error('清空日志失败:', error);
    }
  }

  static async exportLogs(): Promise<string> {
    const logs = await this.getLogs();
    return JSON.stringify(logs, null, 2);
  }

  private static generateId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substring(2);
  }

  static formatLogEntry(entry: LogEntry): string {
    const date = new Date(entry.timestamp).toLocaleString('zh-CN');
    const level = entry.level.toUpperCase().padEnd(5);
    let message = `[${date}] ${level} [${entry.action}] ${entry.message}`;
    
    if (entry.details) {
      message += `\n  详情: ${typeof entry.details === 'string' ? entry.details : JSON.stringify(entry.details, null, 2)}`;
    }
    
    if (entry.error) {
      message += `\n  错误: ${entry.error.name}: ${entry.error.message}`;
      if (entry.error.stack) {
        message += `\n  堆栈: ${entry.error.stack}`;
      }
    }
    
    return message;
  }

  // 获取最近的错误日志
  static async getRecentErrors(count: number = 10): Promise<LogEntry[]> {
    const logs = await this.getLogs();
    return logs.filter(log => log.level === 'error').slice(0, count);
  }

  // 获取特定操作的日志
  static async getLogsByAction(action: string): Promise<LogEntry[]> {
    const logs = await this.getLogs();
    return logs.filter(log => log.action === action);
  }
}