import * as vscode from 'vscode';
import { IMemoryProvider, MemoryEntry } from './memory-provider';

const MS_PER_DAY = 86_400_000;
const PREVIEW_LENGTH = 80;
/** Maximum entries fetched per group to avoid blocking the UI on large datasets. */
const PAGE_SIZE = 50;

interface RootGroupData { kind: 'rootGroup'; groupBy: 'category' | 'source' | 'date' | 'topic' }
interface DateRangeData { kind: 'dateRange'; label: string; start: number; end: number }
interface GroupData { kind: 'group'; groupBy: 'category' | 'source' | 'topic'; value: string; count: number }
interface EntryData { kind: 'entry'; entry: Omit<MemoryEntry, 'embedding'> }
interface EmptyStateData { kind: 'empty'; message: string }
type BrowserNodeData = RootGroupData | DateRangeData | GroupData | EntryData | EmptyStateData;

class BrowserTreeItem extends vscode.TreeItem {
  constructor(
    label: string,
    collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly nodeData: BrowserNodeData,
    description?: string,
    tooltip?: string
  ) {
    super(label, collapsibleState);
    if (description) this.description = description;
    if (tooltip) this.tooltip = tooltip;

    if (nodeData.kind === 'entry') {
      this.contextValue = 'knowledgeEntry';
      this.command = {
        command: 'superlocalmemory.viewDocumentDetails',
        title: 'View Details',
        arguments: [nodeData.entry]
      };
    } else if (nodeData.kind === 'group' && nodeData.groupBy === 'source') {
      this.contextValue = 'knowledgeSource';
    } else if (nodeData.kind === 'empty') {
      this.iconPath = new vscode.ThemeIcon('info');
    }
  }
}

function emptyItem(message: string): BrowserTreeItem {
  return new BrowserTreeItem(
    message,
    vscode.TreeItemCollapsibleState.None,
    { kind: 'empty', message }
  );
}

export class KnowledgeBrowserProvider implements vscode.TreeDataProvider<BrowserTreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<BrowserTreeItem | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  /** Simple in-memory cache keyed by group identity. Cleared on refresh(). */
  private _cache = new Map<string, BrowserTreeItem[]>();

  /** Active text filter (empty string = no filter). */
  private _filterText = '';

  constructor(private memory: IMemoryProvider) {}

  refresh(): void {
    this._cache.clear();
    this._onDidChangeTreeData.fire();
  }

  /** Set a text filter and refresh the tree. */
  setFilter(text: string): void {
    this._filterText = text.toLowerCase().trim();
    this._cache.clear();
    this._onDidChangeTreeData.fire();
  }

  /** Get the current filter text (exposed for tests). */
  get filterText(): string {
    return this._filterText;
  }

  getTreeItem(element: BrowserTreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: BrowserTreeItem): Promise<BrowserTreeItem[]> {
    if (!element) {
      const total = this.memory.stats().totalMemories;
      if (total === 0) {
        return [emptyItem('No memories stored yet. Use @memory /store or the Store Memory command to get started.')];
      }
      return [
        new BrowserTreeItem('By Category', vscode.TreeItemCollapsibleState.Collapsed, { kind: 'rootGroup', groupBy: 'category' }),
        new BrowserTreeItem('By Source', vscode.TreeItemCollapsibleState.Collapsed, { kind: 'rootGroup', groupBy: 'source' }),
        new BrowserTreeItem('By Date', vscode.TreeItemCollapsibleState.Collapsed, { kind: 'rootGroup', groupBy: 'date' }),
        new BrowserTreeItem('By Topic', vscode.TreeItemCollapsibleState.Collapsed, { kind: 'rootGroup', groupBy: 'topic' })
      ];
    }

    const { nodeData } = element;

    if (nodeData.kind === 'rootGroup') {
      return this._getRootGroupChildren(nodeData.groupBy);
    }

    if (nodeData.kind === 'group') {
      return this._getCachedGroupEntries(nodeData);
    }

    if (nodeData.kind === 'dateRange') {
      return this._getCachedDateRangeEntries(nodeData);
    }

    return [];
  }

  private _getRootGroupChildren(groupBy: 'category' | 'source' | 'date' | 'topic'): BrowserTreeItem[] {
    if (groupBy === 'category') {
      const cats = Object.entries(this.memory.stats().categories).sort((a, b) => b[1] - a[1]);
      if (cats.length === 0) return [emptyItem('No categories yet')];
      return cats.map(([cat, cnt]) =>
        new BrowserTreeItem(cat, vscode.TreeItemCollapsibleState.Collapsed,
          { kind: 'group', groupBy: 'category', value: cat, count: cnt },
          String(cnt))
      );
    }

    if (groupBy === 'source') {
      const sources = this.memory.listSources();
      if (sources.length === 0) return [emptyItem('No sources yet')];
      return sources.map(({ source, count }) =>
        new BrowserTreeItem(source || '(no source)', vscode.TreeItemCollapsibleState.Collapsed,
          { kind: 'group', groupBy: 'source', value: source, count },
          String(count))
      );
    }

    if (groupBy === 'date') {
      const now = Date.now();
      return [
        new BrowserTreeItem('Today', vscode.TreeItemCollapsibleState.Collapsed,
          { kind: 'dateRange', label: 'Today', start: now - MS_PER_DAY, end: now }),
        new BrowserTreeItem('This Week', vscode.TreeItemCollapsibleState.Collapsed,
          { kind: 'dateRange', label: 'This Week', start: now - 7 * MS_PER_DAY, end: now - MS_PER_DAY }),
        new BrowserTreeItem('This Month', vscode.TreeItemCollapsibleState.Collapsed,
          { kind: 'dateRange', label: 'This Month', start: now - 30 * MS_PER_DAY, end: now - 7 * MS_PER_DAY }),
        new BrowserTreeItem('Older', vscode.TreeItemCollapsibleState.Collapsed,
          { kind: 'dateRange', label: 'Older', start: 0, end: now - 30 * MS_PER_DAY })
      ];
    }

    if (groupBy === 'topic') {
      const tags = this.memory.listAllTags();
      if (tags.length === 0) return [emptyItem('No topics yet')];
      return tags.map(({ tag, count }) =>
        new BrowserTreeItem(tag, vscode.TreeItemCollapsibleState.Collapsed,
          { kind: 'group', groupBy: 'topic', value: tag, count },
          String(count))
      );
    }

    return [];
  }

  private _entryToTreeItem(entry: Omit<MemoryEntry, 'embedding'>): BrowserTreeItem {
    const preview = entry.content.slice(0, PREVIEW_LENGTH).replace(/\s+/g, ' ');
    const date = new Date(entry.created_at).toLocaleDateString();
    return new BrowserTreeItem(
      preview,
      vscode.TreeItemCollapsibleState.None,
      { kind: 'entry', entry },
      `${entry.category} • ${date}`,
      entry.content
    );
  }

  /** Apply the active text filter to a list of entries. */
  private _applyFilter(entries: Array<Omit<MemoryEntry, 'embedding'>>): Array<Omit<MemoryEntry, 'embedding'>> {
    if (!this._filterText) return entries;
    return entries.filter((e) => {
      const hay = `${e.content} ${e.category} ${e.source} ${e.tags.join(' ')}`.toLowerCase();
      return hay.includes(this._filterText);
    });
  }

  private _cacheKey(data: GroupData | DateRangeData): string {
    return JSON.stringify(
      data.kind === 'group'
        ? { kind: 'group', groupBy: data.groupBy, value: data.value, filterText: this._filterText }
        : { kind: 'dateRange', label: data.label, start: data.start, end: data.end, filterText: this._filterText }
    );
  }

  private _getCachedGroupEntries(data: GroupData): BrowserTreeItem[] {
    const key = this._cacheKey(data);
    const cached = this._cache.get(key);
    if (cached) return cached;
    const result = this._getGroupEntries(data);
    this._cache.set(key, result);
    return result;
  }

  private _getCachedDateRangeEntries(data: DateRangeData): BrowserTreeItem[] {
    const key = this._cacheKey(data);
    const cached = this._cache.get(key);
    if (cached) return cached;
    const result = this._getDateRangeEntries(data);
    this._cache.set(key, result);
    return result;
  }

  private _getGroupEntries(data: GroupData): BrowserTreeItem[] {
    let entries: Array<Omit<MemoryEntry, 'embedding'>> = [];
    if (data.groupBy === 'category') {
      entries = this.memory.listByCategory(data.value, PAGE_SIZE);
    } else if (data.groupBy === 'source') {
      entries = this.memory.listBySource(data.value, PAGE_SIZE);
    } else if (data.groupBy === 'topic') {
      entries = this.memory.listByTag(data.value, PAGE_SIZE);
    }
    entries = this._applyFilter(entries);
    if (entries.length === 0) return [emptyItem(this._filterText ? 'No matches for current filter' : 'No entries')];
    return entries.map((e) => this._entryToTreeItem(e));
  }

  private _getDateRangeEntries(data: DateRangeData): BrowserTreeItem[] {
    let entries = this.memory.listByDateRange(data.start, data.end, PAGE_SIZE);
    entries = this._applyFilter(entries);
    if (entries.length === 0) return [emptyItem(this._filterText ? 'No matches for current filter' : 'No entries in this range')];
    return entries.map((e) => this._entryToTreeItem(e));
  }
}

class MemoryTreeItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly description?: string,
    public readonly tooltipText?: string
  ) {
    super(label, collapsibleState);
    if (description) this.description = description;
    if (tooltipText) this.tooltip = tooltipText;
  }
}

export class MemoryTreeDataProvider implements vscode.TreeDataProvider<MemoryTreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<MemoryTreeItem | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor(private memory: IMemoryProvider) {}

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: MemoryTreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: MemoryTreeItem): Promise<MemoryTreeItem[]> {
    const stats = this.memory.stats();

    if (!element) {
      if (stats.totalMemories === 0) {
        return [new MemoryTreeItem(
          'No memories yet',
          vscode.TreeItemCollapsibleState.None,
          undefined,
          'Store your first memory with the Store Memory command or @memory /store in Copilot Chat.'
        )];
      }
      const categories = Object.entries(stats.categories).sort((a, b) => b[1] - a[1]);
      return categories.map(([cat, cnt]) => new MemoryTreeItem(cat, vscode.TreeItemCollapsibleState.Collapsed, String(cnt)));
    }

    return [
      new MemoryTreeItem(
        'Search in this category…',
        vscode.TreeItemCollapsibleState.None,
        undefined,
        'Run Memory Search and filter by this category (future)'
      )
    ];
  }
}

export class StatsViewProvider implements vscode.TreeDataProvider<MemoryTreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<MemoryTreeItem | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor(private memory: IMemoryProvider) {}

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: MemoryTreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(): Promise<MemoryTreeItem[]> {
    const s = this.memory.stats();
    if (s.totalMemories === 0) {
      return [new MemoryTreeItem('No data', vscode.TreeItemCollapsibleState.None, undefined, 'Store memories to see statistics here.')];
    }
    return [
      new MemoryTreeItem('Total memories', vscode.TreeItemCollapsibleState.None, String(s.totalMemories)),
      new MemoryTreeItem('Edges', vscode.TreeItemCollapsibleState.None, String(s.edgeCount)),
      new MemoryTreeItem('Last capture', vscode.TreeItemCollapsibleState.None, s.lastCaptureTime ? new Date(s.lastCaptureTime).toLocaleString() : '—')
    ];
  }
}
