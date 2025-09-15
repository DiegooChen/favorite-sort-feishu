export interface Bookmark {
  url: string;
  title: string;
  createdAt: number;
  browser: 'Edge' | 'Chrome';
  folderPath: string;
  faviconUrl?: string;
  visitCount?: number;
  lastVisited?: number;
  tags: string[];
  note: string;
  status: 'Unknown' | 'OK' | 'Broken' | 'Redirect' | 'Timeout';
  normalizedUrl: string;
  sourceId: string;
  browserNodeIds: {
    chrome?: string[];
    edge?: string[];
  };
}

export interface OperationLog {
  id: string;
  type: 'DELETE_PARTIAL' | 'DELETE_ALL' | 'WRITEBACK';
  browser: 'Edge' | 'Chrome';
  timestamp: number;
  payload: any;
  beforeSnapshotId?: string;
  afterSnapshotId?: string;
  stats: {
    affected: number;
    success: number;
    skipped: number;
    failed: number;
  };
}

export interface Snapshot {
  id: string;
  browser: 'Edge' | 'Chrome';
  createdAt: number;
  nodes: BookmarkTreeNode[];
}

export interface BookmarkTreeNode {
  id?: string;
  parentId?: string;
  title: string;
  url?: string;
  children?: BookmarkTreeNode[];
}

export interface TagRule {
  id: string;
  name: string;
  enabled: boolean;
  pattern: string; // 正则表达式
  tags: string[];
  type: 'domain' | 'path' | 'url';
}

export interface NormalizationConfig {
  removeWww: boolean;
  removeMobile: boolean;
  removeFragment: boolean;
  removeTrackingParams: boolean;
  customTrackingParams: string[];
}

export interface LinkCheckResult {
  url: string;
  status: 'OK' | 'Redirect' | 'Broken' | 'Timeout';
  finalUrl?: string;
  statusCode?: number;
  error?: string;
}

export interface FeishuConfig {
  accessToken?: string;
  refreshToken?: string;
  baseId?: string;
  tableId?: string;
  tokenExpiry?: number;
}

export interface BitableFieldMapping {
  url: string;
  title: string;
  tags: string;
  note: string;
  folderPath: string;
  browser: string;
  createdAt: string;
  favicon: string;
  status: string;
  category?: string;
}

export interface ImportProgress {
  total: number;
  processed: number;
  successful: number;
  failed: number;
  errors: Array<{
    bookmark: Bookmark;
    error: string;
  }>;
  status?: string;
  stage?: 'preparation' | 'validation' | 'connecting' | 'authenticating' | 'importing' | 'completed';
}

export interface WritebackConfig {
  categorySource: 'category' | 'tags' | 'folderPath';
  targetRoot: string;
  dedupeStrategy: 'skip' | 'updateTitle';
  selectedCategories: string[];
}