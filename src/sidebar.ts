import * as vscode from 'vscode';
import { MemoryProvider } from './memory-provider';

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

  constructor(private memory: MemoryProvider) {}

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

  constructor(private memory: MemoryProvider) {}

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
