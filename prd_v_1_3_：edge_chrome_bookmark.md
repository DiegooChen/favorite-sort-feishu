# PRD v1.2：Edge/Chrome 书签整理 ↔ 飞书多维表格（清洗、导入、删除/清空、分类回写）

## 1. 文档信息
- 文档版本：v1.2（单一版本）
- 产品负责人：—
- 技术负责人：—
- 目标发布日期：T0+2 周
- 适用平台：Chrome、Edge（Chromium 系）
- 开发目标：**Chromium Manifest V3 浏览器扩展**（Chrome Web Store / Microsoft Edge Add-ons）
- 运行时架构：Service Worker（后台）、Options Page（主 UI）、Popup（入口，可选）、Content Scripts（按需）
- 技术栈：TypeScript + React（Options Page），打包（Vite/webpack），使用 Chrome Extension APIs（MV3）

---

## 2. 背景与问题
用户在 Edge 与 Chrome 中维护了大量书签，结构不一致、重复多、命名不统一，难以统一管理与检索。希望一次性在扩展内完成“扫描→清洗/去重→标签与备注补充→预览→导入飞书多维表格（Bitable）”，同时补充浏览器端的生命周期管理能力：导入后可删除/清空本地收藏，并且可从飞书按分类回写重建浏览器收藏夹结构。

---

## 3. 目标与非目标
### 3.1 目标（Goals）
1. 在扩展内完成**端到端**流程：扫描书签 → 规范化与去重 → 标签/备注 → 断链检测 → 导入 Bitable → 导入后处置（删除/清空/保持）。
2. 飞书侧落地到**单一 Bitable 表**，支持**多标签（多选字段）**与**备注（长文本）**。
3. 提供**按分类从飞书回写至浏览器收藏夹**的能力，分类即文件夹名称。
4. 保障数据质量（断链检测、幂等写入）与可追溯（日志、快照与撤销）。

### 3.2 非目标（Non-goals）
- 跨设备/跨账号的云端同步与冲突解决。
- 实时双向自动同步与 AI 语义归类（本版本不做）。

---

## 4. 用户与典型场景
- **用户画像**：信息密集型用户，双浏览器并用，书签量 1,000–10,000+。
- **核心场景**：
  - 首次清洗导入：把两个浏览器的书签一次性导入飞书并去重。
  - 批量标注：根据文件夹与规则自动打标签，手动批量修正。
  - 质量保障：导入前查看预览与断链状态；导入后查看报告。
  - 导入后处置：选择删除覆盖项/清空全部，或保留本地。
  - 从飞书回写：按分类选择回写，重建浏览器收藏夹结构。

---

## 5. 价值主张
- 将分散在两个浏览器、结构混乱的书签转换为飞书中的**统一可协作的数据资产**。
- 降低清洗与标注成本；通过断链检测与幂等写入提升**数据质量与可信度**。
- 打通导入后的**浏览器端生命周期管理**：可删除、可清空、可回写重建。

---

## 6. 术语
- **Bitable**：飞书多维表格。
- **Normalized URL**：经规范化（协议、域名、参数清洗等）后的 URL，用作幂等与去重键。
- **分类（Category）**：用于回写时生成文件夹的名称来源；可来自 `Category` 字段、`Tags` 标签或 `FolderPath` 的末级。

---

## 7. 需求清单
### 7.1 功能需求（从零编号）
**F-01 扫描书签**：读取 Edge/Chrome 全量书签树；保留层级路径、创建时间、源节点 ID。

**F-02 URL 规范化与去重**：生成 `normalizedUrl`；同键合并，标签并集、备注择优、创建时间取最早。

**F-03 标签策略**：
- 文件夹 → 标签（可选全路径或仅末级）。
- 规则补充：域名/路径正则 → 多个标签。
- 手工修正：在预览表格中批量添加/替换标签。

**F-04 备注生成**：支持“文件夹路径拼接”、“模板批量填充（如 `来源：{Browser} | 路径：{FolderPath}`）”与手工编辑。

**F-05 断链检测（可开关）**：并发池 + 节流；HEAD 失败再 GET；记录最终跳转与状态（OK/Redirect/Broken/Timeout）。

**F-06 飞书写入（Bitable）**：字段探测/创建；多选项自动扩充；批量分片写入；以 `normalizedUrl` 幂等更新。

**F-07 导入预览与报告**：导入前 50 行预览；导入后成功/失败统计和失败原因分类；支持“仅重试失败项”。

**F-08 失败重试与进度**：批次退避与进度展示；可中止。

**F-09 标题/Favicon 补全**：抓取页面标题与 Favicon，失败则回退到本地。

**F-10 潜在重复提示**：标题相似但 URL 不同的记录标注为“潜在重复”，供人工合并。

**F-11 导入后可选择删除浏览器收藏**：
- 选项 A：不删除（默认安全项）。
- 选项 B：**仅删除本次导入覆盖项**（已成功写入飞书的 `normalizedUrl` 对应节点）。
- 选项 C：跳转到清空流程（F-12）。
- 所有删除操作需强二次确认，并在执行前给出影响条数与耗时预估。

**F-12 一键清空浏览器收藏**：
- 对所选浏览器各根目录下**所有子节点**执行删除（保留根节点）。
- 执行前自动生成本地快照；执行后支持**撤销上一次操作**。

**F-13 从飞书按分类回写至浏览器收藏夹**：
- 选择目标浏览器与**分类来源**：优先 `Category`（单选）；或从 `Tags`（多选）推导；或 `FolderPath` 末级。
- 分类名 = 目标文件夹名；多分类在同级生成多个文件夹。
- 选择落盘位置：书签栏/其他收藏/移动书签/自定义父节点。
- 同一文件夹内以 `normalizedUrl` 去重；策略可选“跳过/更新标题”。
- 回写前提供预览与结果报告（成功/跳过/失败）。

### 7.2 非功能需求
- 性能：10k 条书签“扫描→规范化→预览”≤ 3 分钟（不含断链）。
- 可靠性：导入成功率 ≥ 99%；删除/清空/回写均可恢复或可重试。
- 安全：OAuth 令牌本地加密；显式授权与二次确认；日志与快照可追溯。
- 可用性：关键操作支持撤销/回滚（最近一次）；字段映射清晰。

---

## 8. 信息架构与用户流程
### 8.1 页面结构
1) **首页（Dashboard）**：\[扫描书签]、\[连接飞书]、统计概览（总数/潜在重复/断链数），入口到“浏览器管理”。
2) **清洗台（表格视图）**：可编辑列：URL、Title、FolderPath、Tags、Note、Status、Browser、CreatedAt、Favicon；工具条包含规则管理、批量操作、断链检测开关与进度条。
3) **字段映射与预览**：左侧本地字段，右侧 Bitable 字段（自动匹配可调）；下方展示前 50 行写入预览。
4) **导入结果**：成功/失败统计与明细；\[仅重试失败项]。
5) **导入后对话框**：是否删除（A 不删 / B 删除覆盖项 / C 清空）。
6) **浏览器管理**：\[清空收藏]、\[从飞书按分类回写]，均提供预览、二次确认与进度。

### 8.2 关键流程
- **导入后删除（F-11）**：基于导入成功清单与源节点 ID 匹配，删除命中的节点；完毕可撤销。
- **清空（F-12）**：获取各根目录一级子树，生成快照后逐树删除；完成后可撤销。
- **回写（F-13）**：选择分类来源与分类值 → 选择落盘根 → 预览“文件夹→链接数” → 执行批次创建与去重/更新 → 报告。

---

## 9. 数据模型与字段映射
### 9.1 扩展侧模型
```text
Bookmark {
  url, title, createdAt, browser("Edge"|"Chrome"),
  folderPath("Work/AI/Papers"), faviconUrl?, visitCount?, lastVisited?,
  tags[], note, status("Unknown"|"OK"|"Broken"|"Redirect"|"Timeout"),
  normalizedUrl, sourceId,
  browserNodeIds: { chrome?: string[], edge?: string[] }
}

OperationLog {
  id, type("DELETE_PARTIAL"|"DELETE_ALL"|"WRITEBACK"), browser,
  timestamp, payload, beforeSnapshotId?, afterSnapshotId?,
  stats { affected, success, skipped, failed }
}

Snapshot {
  id, browser, createdAt,
  nodes: Array<{ id?, parentId?, title, url?, children?[] }>
}
```

### 9.2 Bitable 目标表（Bookmarks）
- `URL`：超链接（写入 `normalizedUrl`）
- `Title`：文本
- `Tags`：多选
- `Note`：长文本
- `FolderPath`：文本
- `Browser`：单选（Edge/Chrome）
- `CreatedAt`：日期
- `Favicon`：超链接
- `Status`：单选（OK/Redirect/Broken/Timeout）
- `Category`（推荐新增）：单选，用于回写分类；若为空，可用 `Tags` 或 `FolderPath` 末级替代

> 写入前自动探测/创建缺失字段与多选项。

---

## 10. 关键算法与规则
### 10.1 URL 规范化
- 协议统一 `https`（可访问时）；域名小写；可配置去 `www.`/`m.` 等价。
- 移除追踪参数：`utm_*`, `gclid`, `fbclid`…（黑/白名单维护）。
- 查询参数按键名排序；非根路径去尾斜杠；可配置移除 `#fragment`。

**伪代码**
```js
function normalize(url) {
  const u = new URL(url);
  u.protocol = 'https:';
  u.hostname = u.hostname.replace(/^www\./,'').toLowerCase();
  const drop = new Set(['utm_source','utm_medium','utm_campaign','utm_term','utm_content','gclid','fbclid']);
  const kept = [];
  for (const [k,v] of u.searchParams.entries()) if (!drop.has(k)) kept.push([k,v]);
  kept.sort(([a],[b]) => a.localeCompare(b));
  u.search = kept.map(([k,v]) => `${k}=${v}`).join('&');
  if (u.pathname !== '/' && u.pathname.endsWith('/')) u.pathname = u.pathname.slice(0,-1);
  u.hash = '';
  return u.toString();
}
```

### 10.2 去重/合并
- `normalizedUrl` 相同：合并为一条；Tags 并集；Note 取信息量更大；CreatedAt 取最早。
- 标题相似但 URL 不同：标为“潜在重复”，供人工合并。

### 10.3 标签与分类
- 标签：文件夹→标签、规则→标签、批量手工；可撤销。
- 分类：优先 `Category` 字段；或从 `Tags`/`FolderPath末级` 推导，用于回写生成文件夹。

### 10.4 断链检测
- HEAD→GET→跟随 3xx；
- 4xx/5xx→`Broken`，超时→`Timeout`，跟随成功→`Redirect`（记录最终落点）。
- 并发池、节流与可中断；仅对新/变更记录增量检测（可选）。

### 10.5 删除/清空/回写的幂等与回滚
- 删除覆盖项：以导入成功清单（`normalizedUrl`）匹配 `browserNodeIds` 精确删除。
- 清空：对根目录子树批量删除；执行前写入 `Snapshot`，支持撤销一次。
- 回写：同一文件夹内以 `normalizedUrl` 去重；策略“跳过/更新标题”。保留映射日志（分类→文件夹ID）。

---

## 11. 对外集成（飞书 Bitable）
- 鉴权：OAuth 2.0，令牌本地加密与刷新。
- 能力探测：读取 Base/表结构；缺字段/多选项则创建。
- 写入策略：批量分片（如 100 条/批）+ 退避重试（最多 3 次）。
- 幂等：以 `normalizedUrl` 为业务主键；存在则更新。
- 错误分级：权限/配额/网络/结构不匹配/数据非法，分类呈现于报告。

---

## 12. 权限与安全
- 扩展权限：`bookmarks`, `storage`, `identity`, `scripting`，以及访问飞书域的网络权限。
- 敏感操作：显式同意 + 强二次确认（输入关键字 `DELETE`）。
- 快照与日志：任何破坏性操作前生成快照；本地操作日志可追溯；撤销仅限最近一次。
- 隐私：数据本地处理；仅在用户确认后向飞书写入。

---

## 13. 指标与埋点
### 13.1 关键指标（NSM）
- 首周**成功导入到 Bitable 的唯一 URL 数**。

### 13.2 过程指标
- 去重率 = (原始条目数 − 导入后唯一数) / 原始条目数。
- ≥1 标签或备注的 URL 占比。
- 导入成功率 = 成功行 / 提交行；首次导入用时（不含断链）。
- 断链占比；重试成功率。
- 删除执行率、清空完成率、撤销成功率、回写成功率与重复率（跳过比例）。

### 13.3 埋点事件
- `scan_start/finish`, `normalize_done`, `linkcheck_start/finish`, `mapping_confirmed`, `import_start/finish`, `import_retry`, `rule_added/edited/toggled`, `bulk_tag_applied`, `bulk_note_applied`, `merge_confirmed`, `post_import_choice`, `delete_partial_start/finish`, `delete_all_start/finish`, `undo`, `writeback_preview`, `writeback_start/finish`。

---

## 14. 里程碑与交付
**里程碑 1（T0+1 周）：功能闭环**
- 扫描、规范化、预览；文件夹→标签；规则引擎；导入到 Bitable（字段探测、幂等写入）。
- 导入后对话框与删除覆盖项（可撤销）。
- 基础 UI（Dashboard/清洗台/映射与预览/结果页/浏览器管理）。

**里程碑 2（T0+2 周）：质量与性能**
- 断链检测；清空收藏（快照与撤销）；按分类回写（预览、幂等、报告）。
- 失败重试、进度可视化、性能优化与压力测试（10k）。
- 使用手册、隐私声明与字段映射说明。

---

## 15. 验收标准
- **扫描**：10k 书签可完成扫描并展示总数、浏览器分布、潜在重复数。
- **规范化/去重**：对含 `utm_*`/`gclid`/`fbclid` 的 URL 去除并正确合并；`m.` 与 `www.` 等价可配置。
- **标签**：`Work/AI/Papers` 生成 `["Work","AI","Papers"]`；切换“仅末级”后仅 `["Papers"]`；规则与批量操作生效。
- **备注**：模板渲染正确（如 `来源：{Browser}`）。
- **断链**：对 1000 条 URL 产出 OK/Redirect/Broken/Timeout；记录最终落点。
- **导入**：自动创建缺失字段与多选项；二次导入无重复（幂等）。
- **删除覆盖项**：仅删除导入成功清单匹配的节点；成功率 ≥ 99%；操作可撤销。
- **清空收藏**：删除各根目录子节点，根节点保留；可撤销并完整恢复层级与链接。
- **分类回写**：可从 `Category/Tags/FolderPath末级` 选择分类；选择落盘根；去重策略生效；二次回写不重复；结果报告完整。
- **性能**：10k 条全流程（不含断链）≤ 3 分钟；UI 无明显卡顿。
- **安全**：断网或令牌失效有清晰提示与重连；本地存储加密。

---

## 16. 测试用例（节选）
- **F-01/02**：混合 Edge/Chrome 书签树扫描；`http://www.Example.com/page/?utm_source=x&b=2&a=1#top` 规范化为 `https://example.com/page?a=1&b=2`。
- **F-03**：规则 `*.docs.microsoft.com → Docs` 生效；批量添加/替换标签成功。
- **F-04**：备注模板 `来源：{Browser} | 路径：{FolderPath}` 渲染正确。
- **F-05**：404 判为 Broken；302 记录最终落点并标为 Redirect。
- **F-06/07/08**：Bitable 字段自动创建；导入失败因类型不匹配在报告中呈现；“仅重试失败项”后成功。
- **F-11**：导入后选择“仅删除覆盖项”，删除集合与导入成功清单一致；撤销成功恢复。
- **F-12**：清空前生成快照；清空后撤销完整恢复深层结构。
- **F-13**：选择 `Category=Design, AI` 回写，在书签栏生成两个文件夹；同一 `normalizedUrl` 二次回写不重复；启用“更新标题”后标题被更新。

---

## 17. 工程实现与架构
- **Manifest V3 权限**：`bookmarks`, `storage`, `identity`, `scripting`，以及飞书域访问。
- **架构**：Service Worker 负责扫描、规范化、断链、批量写入、删除/清空/回写与进度；Options Page 为主 UI；IndexedDB/Storage 存放中间数据、日志和快照。
- **模块划分**：
  - `scanner`（读取并展平书签树）
  - `normalize`（URL 规范化、参数黑/白名单）
  - `dedupe`（合并策略）
  - `rules`（域名/路径→标签）
  - `linkcheck`（并发池、超时、重定向记录）
  - `feishu`（OAuth、字段探测/创建、批量写入、幂等）
  - `ops-delete`（删除覆盖项/清空）
  - `snapshot`（快照生成与恢复）
  - `ops-writeback`（分类映射、文件夹保障、去重与更新）
  - `ui/*`（表格预览、批量操作、报告、预览与确认对话框）

### 17.1 Manifest V3 配置（示例）
```json
{
  "manifest_version": 3,
  "name": "Bookmarks to Feishu (Bitable)",
  "version": "1.0.0",
  "description": "Clean, dedupe, tag and sync bookmarks to Feishu Bitable; delete/clear/write-back.",
  "permissions": ["bookmarks", "storage", "identity", "scripting"],
  "host_permissions": [
    "https://*.feishu.cn/*",
    "https://*.larksuite.com/*"
  ],
  "action": { "default_popup": "popup.html" },
  "options_page": "options.html",
  "background": { "service_worker": "background.js", "type": "module" },
  "icons": { "16": "icons/16.png", "48": "icons/48.png", "128": "icons/128.png" },
  "content_security_policy": { "extension_pages": "script-src 'self'; object-src 'self'" }
}
```

> 说明：身份鉴权不使用 `oauth2` manifest 字段，而是通过 `chrome.identity.launchWebAuthFlow` 完成第三方 OAuth（需要将重定向 URI 配置为 `https://<extension-id>.chromiumapp.org/`）。

### 17.2 身份鉴权流程（`chrome.identity.launchWebAuthFlow`）
1. 获取扩展重定向 URI：`const redirectUri = chrome.identity.getRedirectURL();`
2. 组装 Feishu OAuth 授权 URL（包含 `client_id`、`redirect_uri`、`response_type=code`、`state`）。
3. 拉起授权：
```ts
const resultUrl = await chrome.identity.launchWebAuthFlow({
  url: authUrl,
  interactive: true
});
const code = new URL(resultUrl).searchParams.get('code');
```
4. 在 Service Worker 中用 `fetch` 交换 token（`code→access_token/refresh_token`），并将令牌**加密**后存储：
```ts
const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt','decrypt']);
const enc = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(tokenJson));
await chrome.storage.local.set({ t: Array.from(new Uint8Array(enc)) });
```
5. 后续请求携带 `Authorization: Bearer <token>` 调用飞书接口；处理过期刷新与错误上报。

### 17.3 Edge/Chrome 打包与发布
- **Chrome**：使用开发者控制台上传 ZIP；填写隐私说明与权限说明，通过审核后发布。
- **Edge**：将相同包上传到 Microsoft Edge Add-ons；注意商店描述与图标规范可能略有差异。
- **版本与回滚**：严格的版本号策略（SemVer）；必要时下架或回退到上一版本。

### 17.4 兼容性注意
- 根目录命名在不同浏览器可能不同（如 `bookmark_bar`、`other`、`mobile`）；需以 API 返回为准动态处理。
- 某些环境无“移动书签”根；UI 需在选择落盘根时做存在性校验。
- CORS：通过 `host_permissions` 放行飞书域名；所有网络请求在 SW 内发起。

**关键伪代码（节选）**
```js
// 删除覆盖项
for (const rec of importedRecords) {
  for (const nodeId of rec.browserNodeIds[targetBrowser] || []) {
    try { await chrome.bookmarks.removeTree(nodeId); stats.success++; }
    catch { stats.failed++; }
  }
}

// 清空收藏
const roots = await chrome.bookmarks.getTree();
const topChildren = getAllRootChildren(roots);
const snapshot = makeSnapshot(topChildren);
for (const node of topChildren) await chrome.bookmarks.removeTree(node.id);

// 按分类回写
for (const category of chosenCategories) {
  const folderId = await ensureFolder(targetRootId, category);
  const urls = dedupeByNormalizedUrl(recordsFor(category));
  for (const r of urls) {
    if (existsInFolder(folderId, r.normalizedUrl)) {
      if (policy.updateTitle) await updateTitle(folderId, r); else stats.skipped++;
    } else {
      await chrome.bookmarks.create({ parentId: folderId, title: r.title, url: r.url });
      stats.success++;
    }
  }
}
```

---

## 18. 风险与对策
- **误删风险**：二次确认 + 快照 + 单次撤销；默认“不删除”。
- **回滚不完全**：快照仅覆盖被改动节点，减少体量；配合操作日志定位。
- **分类歧义**：提供来源字段选择与预览；多分类映射多个同级文件夹。
- **性能与限流**：删除、清空与回写采用批次与节流；UI 显示进度与可中止。
- **URL 过度清洗**：提供严格/宽松模式与差异预览；可还原原始 URL。

---

## 19. 发布与回滚
- **发布**：开发者模式灰度（CRX）→ 内测（≤10 人）→ 上架渠道。
- **回滚**：扩展版本回退；Bitable 侧支持“按批次删除本次导入”与重放前一逻辑（基于导入日志）。

---

## 20. 附录：Bitable 字段模板
| 字段名 | 类型 | 说明 |
|---|---|---|
| URL | 超链接 | 主键/幂等键，写入 `normalizedUrl` |
| Title | 文本 | 页面标题 |
| Tags | 多选 | 多标签，导入时自动补充选项 |
| Note | 长文本 | 备注或模板渲染结果 |
| FolderPath | 文本 | 书签原始层级路径 |
| Browser | 单选 | Edge / Chrome |
| CreatedAt | 日期 | 书签创建时间 |
| Favicon | 超链接 | 图标链接 |
| Status | 单选 | OK / Redirect / Broken / Timeout |
| Category | 单选 | 回写分类来源（推荐新增） |

