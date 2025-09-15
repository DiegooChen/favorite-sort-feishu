# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

这是一个 Chrome/Edge 浏览器扩展，用于管理、清理和同步浏览器书签到飞书多维表格（Bitable）。扩展采用 Manifest V3 架构，使用 TypeScript + React + Vite 构建。

## 开发命令

### 构建和开发
- `npm run build` - 构建扩展到 dist/ 目录，自动递增版本号并复制 manifest.json
- `npm run build:no-bump` - 构建扩展但不递增版本号
- `npm run dev` - 开发模式，监听文件变化并自动重新构建
- `npm run lint` - ESLint 代码检查
- `npm run type-check` - TypeScript 类型检查
- `npm run test` - 运行单元测试
- `npm run test:ui` - 运行测试 UI 界面（可视化测试）

### 扩展安装测试
1. 运行 `npm run build` 构建扩展
2. 在浏览器中进入 `chrome://extensions/` 或 `edge://extensions/`
3. 启用开发者模式
4. 点击"加载已解压的扩展程序"，选择 `dist` 目录

## 项目架构

### 目录结构
- `src/background.ts` - Service Worker 主入口，负责业务逻辑协调
- `src/modules/` - 核心业务模块，每个模块负责特定功能
- `src/types/` - TypeScript 类型定义
- `src/ui/` - React UI 组件和页面
- `manifest.json` - 扩展配置文件
- `dist/` - 构建输出目录

### 核心模块架构
扩展采用模块化架构，Service Worker 作为中央协调器：

- `scanner/` - 书签扫描，读取浏览器书签树
- `normalize/` - URL 规范化和去重处理
- `dedupe/` - 重复书签检测和合并
- `rules/` - 标签规则引擎，根据域名/路径自动打标签
- `linkcheck/` - 链接有效性检查，支持并发和节流
- `feishu/` - 飞书 API 集成，OAuth 认证和数据写入
- `ops-delete/` - 书签删除操作
- `ops-writeback/` - 从飞书回写书签到浏览器
- `snapshot/` - 快照管理，支持操作回滚
- `logger/` - 日志系统
- `storage.ts` - 数据持久化封装

### UI 结构
- Options Page (`src/options.html`) - 主要配置和操作界面
- Popup (`src/popup.html`) - 工具栏弹窗界面
- `src/ui/pages/OptionsApp.tsx` - React 主应用组件

### 数据流
1. Service Worker 接收 UI 消息
2. 调用相应模块处理业务逻辑
3. 通过 Storage 模块持久化数据
4. 返回结果给 UI 组件更新界面

## 重要约定

### 消息通信
所有 UI 与 Service Worker 间通信通过 `chrome.runtime.onMessage` 进行，消息格式：
```typescript
{
  action: string,
  payload?: any
}
```

### 数据类型
核心数据模型定义在 `src/types/bookmark.ts`：
- `Bookmark` - 规范化后的书签对象
- `OperationLog` - 操作日志
- `Snapshot` - 快照数据
- `TagRule` - 标签规则

### URL 规范化
使用 normalize 模块统一处理 URL：
- 统一协议为 https
- 移除跟踪参数 (utm_*, gclid, fbclid 等)
- 域名小写，可选移除 www/m 前缀
- 查询参数按键名排序

### 错误处理
- Service Worker 中所有异步操作都有完整的错误捕获
- 使用 Logger 模块记录详细日志
- UI 界面展示友好的错误信息

## 飞书集成

### 认证流程
使用 `chrome.identity.launchWebAuthFlow` 进行 OAuth 2.0 认证，不依赖 manifest oauth2 字段。

### API 调用
- 所有网络请求在 Service Worker 中发起
- 支持字段自动探测和创建
- 批量写入支持分片和重试

### 字段映射
飞书多维表格字段：URL(超链接)、Title(文本)、Tags(多选)、Note(长文本)、FolderPath(文本)、Browser(单选)、CreatedAt(日期)、Favicon(超链接)、Status(单选)、Category(单选)

## 开发注意事项

### Vite 配置
- 多入口构建：background.ts、options.html、popup.html
- 使用 @/ 别名指向 src 目录
- 输出文件命名：[name].js 格式

### Chrome Extension APIs
- 需要 bookmarks、storage、identity、scripting 权限
- Service Worker 不支持 DOM 操作
- 所有异步操作使用 Promise 包装

### 性能考虑
- 大量书签处理时使用批处理和进度显示
- 链接检查支持并发控制和节流
- 删除/回写操作支持中断和恢复

### 版本管理
- 使用 `scripts/bump-version.js` 自动管理版本号
- 版本号同步更新到 package.json 和 manifest.json
- 构建时通过 `prebuild` 钩子自动执行版本递增