/**
 * Minimal VS Code API mock for unit tests.
 *
 * Only the surface area actually exercised by the extension is mocked.  New
 * methods can be added here as tests expand to cover more of the VS Code API.
 */

export const window = {
  createOutputChannel: (name: string) => ({
    name,
    appendLine: () => undefined,
    show: () => undefined,
    dispose: () => undefined
  }),
  showInformationMessage: () => Promise.resolve(undefined),
  showWarningMessage: () => Promise.resolve(undefined),
  showErrorMessage: () => Promise.resolve(undefined),
  showInputBox: () => Promise.resolve(undefined),
  showQuickPick: () => Promise.resolve(undefined),
  showTextDocument: () => Promise.resolve(undefined),
  registerTreeDataProvider: () => ({ dispose: () => undefined })
};

export const workspace = {
  workspaceFolders: [] as unknown[],
  getConfiguration: (_section?: string) => ({
    get: <T>(_key: string, defaultValue: T) => defaultValue
  }),
  findFiles: () => Promise.resolve([]),
  openTextDocument: (_opts: unknown) =>
    Promise.resolve({ getText: () => '' }),
  onDidSaveTextDocument: () => ({ dispose: () => undefined }),
  asRelativePath: (uri: unknown) => String(uri)
};

export const commands = {
  registerCommand: (_id: string, _handler: (...args: unknown[]) => unknown) => ({
    dispose: () => undefined
  }),
  executeCommand: () => Promise.resolve(undefined)
};

export const chat = {
  createChatParticipant: (_id: string, _handler: unknown) => ({
    dispose: () => undefined
  })
};

export const lm = {
  registerTool: (_name: string, _tool: unknown) => ({ dispose: () => undefined })
};

export class RelativePattern {
  constructor(public base: unknown, public pattern: string) {}
}

export class Uri {
  static parse(str: string) {
    return { fsPath: str, toString: () => str };
  }
  static file(str: string) {
    return { fsPath: str, toString: () => str };
  }
}

export class CancellationTokenSource {
  token = { isCancellationRequested: false, onCancellationRequested: () => ({ dispose: () => undefined }) };
  cancel() { this.token.isCancellationRequested = true; }
  dispose() {}
}

export class TreeItem {
  label: string;
  constructor(label: string) { this.label = label; }
}

export enum TreeItemCollapsibleState {
  None = 0,
  Collapsed = 1,
  Expanded = 2
}

export class LanguageModelToolResult {
  constructor(public content: unknown[]) {}
}

export class LanguageModelTextPart {
  constructor(public value: string) {}
}

export const EventEmitter = class {
  event = (_listener: unknown) => ({ dispose: () => undefined });
  fire(_data: unknown) {}
  dispose() {}
};

export const ThemeIcon = class {
  constructor(public id: string) {}
};
