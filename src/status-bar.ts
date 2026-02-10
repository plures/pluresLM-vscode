import * as vscode from 'vscode';
import { MemoryProvider } from './memory-provider';

export class MemoryStatusBar {
  private item: vscode.StatusBarItem;
  private timer: NodeJS.Timeout | null = null;

  constructor(private memory: MemoryProvider) {
    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    this.item.command = 'superlocalmemory.stats';
    this.item.tooltip = 'Superlocalmemory: show stats';
  }

  show(): void {
    this.item.show();
    void this.refresh();
    if (!this.timer) {
      this.timer = setInterval(() => void this.refresh(), 60_000);
    }
  }

  hide(): void {
    this.item.hide();
  }

  dispose(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.item.dispose();
  }

  async refresh(): Promise<void> {
    try {
      await this.memory.ensureInitialized();
      const count = this.memory.count();
      this.item.text = `$(brain) ${count} memories`;
    } catch {
      this.item.text = `$(brain) memory offline`;
    }
  }
}
