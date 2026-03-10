import * as vscode from 'vscode';
import { IMemoryProvider, MemoryEntry } from './memory-provider';

const MS_PER_DAY = 86_400_000;
const PREVIEW_LENGTH = 80;

interface RootGroupData { kind: 'rootGroup'; groupBy: 'category' | 'source' | 'date' | 'topic' }
interface DateRangeData { kind: 'dateRange'; label: string; start: number; end: number }
interface GroupData { kind: 'group'; groupBy: 'category' | 'source' | 'topic'; value: string; count: number }
interface EntryData { kind: 'entry'; entry: Omit<MemoryEntry, 'embedding'> }
type BrowserNodeData = RootGroupData | DateRangeData | GroupData | EntryData;

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
    }
  }
}

export class KnowledgeBrowserProvider implements vscode.TreeDataProvider<BrowserTreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<BrowserTreeItem | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor(private memory: IMemoryProvider) {}

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: BrowserTreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: BrowserTreeItem): Promise<BrowserTreeItem[]> {
    if (!element) {
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
      return this._getGroupEntries(nodeData);
    }

    if (nodeData.kind === 'dateRange') {
      return this._getDateRangeEntries(nodeData);
    }

    return [];
  }

  private _getRootGroupChildren(groupBy: 'category' | 'source' | 'date' | 'topic'): BrowserTreeItem[] {
    if (groupBy === 'category') {
      const cats = Object.entries(this.memory.stats().categories).sort((a, b) => b[1] - a[1]);
      return cats.map(([cat, cnt]) =>
        new BrowserTreeItem(cat, vscode.TreeItemCollapsibleState.Collapsed,
          { kind: 'group', groupBy: 'category', value: cat, count: cnt },
          String(cnt))
      );
    }

    if (groupBy === 'source') {
      return this.memory.listSources().map(({ source, count }) =>
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
      return this.memory.listAllTags().map(({ tag, count }) =>
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

  private _getGroupEntries(data: GroupData): BrowserTreeItem[] {
    if (data.groupBy === 'category') {
      return this.memory.listByCategory(data.value).map((e) => this._entryToTreeItem(e));
    }
    if (data.groupBy === 'source') {
      return this.memory.listBySource(data.value).map((e) => this._entryToTreeItem(e));
    }
    if (data.groupBy === 'topic') {
      return this.memory.listByTag(data.value).map((e) => this._entryToTreeItem(e));
    }
    return [];
  }

  private _getDateRangeEntries(data: DateRangeData): BrowserTreeItem[] {
    return this.memory.listByDateRange(data.start, data.end).map((e) => this._entryToTreeItem(e));
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
      const categories = Object.entries(stats.categories).sort((a, b) => b[1] - a[1]);
      return categories.map(([cat, cnt]) => new MemoryTreeItem(cat, vscode.TreeItemCollapsibleState.Collapsed, String(cnt)));
    }

    // For now we don't list individual memories (would require a list API).
    // TODO: add a paged list endpoint in MemoryDB and show recent memories per category.
    const cat = element.label;
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
    return [
      new MemoryTreeItem('Total memories', vscode.TreeItemCollapsibleState.None, String(s.totalMemories)),
      new MemoryTreeItem('Edges', vscode.TreeItemCollapsibleState.None, String(s.edgeCount)),
      new MemoryTreeItem('Last capture', vscode.TreeItemCollapsibleState.None, s.lastCaptureTime ? new Date(s.lastCaptureTime).toLocaleString() : '—')
    ];
  }
}
