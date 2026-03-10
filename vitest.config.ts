import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    include: ['src/test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/test/**']
    }
  },
  resolve: {
    alias: {
      // Redirect `import * as vscode from 'vscode'` to our mock
      vscode: resolve(__dirname, 'src/test/mocks/vscode.ts')
    }
  }
});
