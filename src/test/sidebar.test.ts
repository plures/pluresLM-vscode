import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryService } from './mocks/memory-service.mock';
import { KnowledgeBrowserProvider, MemoryTreeDataProvider, StatsViewProvider } from '../sidebar';

describe('KnowledgeBrowserProvider', () => {
  let svc: InMemoryService;
  let provider: KnowledgeBrowserProvider;

  beforeEach(() => {
    svc = new InMemoryService();
    provider = new KnowledgeBrowserProvider(svc);
  });

  it('shows empty state when no memories exist', async () => {
    const roots = await provider.getChildren();
    expect(roots).toHaveLength(1);
    expect(roots[0].label).toContain('No memories stored yet');
  });

  it('shows grouping roots when memories exist', async () => {
    svc.seed({ content: 'hello world', category: 'decision' });
    const roots = await provider.getChildren();
    expect(roots).toHaveLength(4);
    const labels = roots.map((r) => r.label);
    expect(labels).toContain('By Category');
    expect(labels).toContain('By Source');
    expect(labels).toContain('By Date');
    expect(labels).toContain('By Topic');
  });

  it('shows empty state for topic group when no tags exist', async () => {
    svc.seed({ content: 'hello' });
    const roots = await provider.getChildren();
    // Expand By Topic
    const topicRoot = roots.find((r) => r.label === 'By Topic')!;
    const topics = await provider.getChildren(topicRoot);
    expect(topics).toHaveLength(1);
    expect(topics[0].label).toContain('No topics yet');
  });

  it('filters entries by text', async () => {
    svc.seed({ content: 'React hooks are useful', category: 'code-pattern' });
    svc.seed({ content: 'Python decorators rock', category: 'code-pattern' });
    const roots = await provider.getChildren();
    const catRoot = roots.find((r) => r.label === 'By Category')!;
    const cats = await provider.getChildren(catRoot);
    const cpNode = cats.find((c) => (c.label as string) === 'code-pattern')!;

    // No filter — both entries
    let entries = await provider.getChildren(cpNode);
    const entryCount = entries.filter((e) => e.nodeData.kind === 'entry').length;
    expect(entryCount).toBe(2);

    // Set filter to "react"
    provider.setFilter('react');
    // Need to re-fetch roots since tree refreshed
    const roots2 = await provider.getChildren();
    const catRoot2 = roots2.find((r) => r.label === 'By Category')!;
    const cats2 = await provider.getChildren(catRoot2);
    const cpNode2 = cats2.find((c) => (c.label as string) === 'code-pattern')!;
    entries = await provider.getChildren(cpNode2);
    const filteredEntries = entries.filter((e) => e.nodeData.kind === 'entry');
    expect(filteredEntries).toHaveLength(1);
  });

  it('caches group entries across repeated calls', async () => {
    svc.seed({ content: 'test', category: 'decision' });
    const roots = await provider.getChildren();
    const catRoot = roots.find((r) => r.label === 'By Category')!;
    const cats = await provider.getChildren(catRoot);
    const decNode = cats[0];

    const first = await provider.getChildren(decNode);
    const second = await provider.getChildren(decNode);
    // Same array reference from cache
    expect(first).toBe(second);
  });

  it('clears cache on refresh', async () => {
    svc.seed({ content: 'test', category: 'decision' });
    const roots = await provider.getChildren();
    const catRoot = roots.find((r) => r.label === 'By Category')!;
    const cats = await provider.getChildren(catRoot);
    const decNode = cats[0];

    const first = await provider.getChildren(decNode);
    provider.refresh();
    // After refresh, the tree will re-fetch from scratch
    // (node refs change, so we re-fetch from root)
    const roots2 = await provider.getChildren();
    const catRoot2 = roots2.find((r) => r.label === 'By Category')!;
    const cats2 = await provider.getChildren(catRoot2);
    const second = await provider.getChildren(cats2[0]);
    // Different reference since cache was cleared and new node objects
    expect(first).not.toBe(second);
  });
});

describe('MemoryTreeDataProvider', () => {
  let svc: InMemoryService;
  let provider: MemoryTreeDataProvider;

  beforeEach(() => {
    svc = new InMemoryService();
    provider = new MemoryTreeDataProvider(svc);
  });

  it('shows empty state when no memories', async () => {
    const items = await provider.getChildren();
    expect(items).toHaveLength(1);
    expect(items[0].label).toBe('No memories yet');
  });

  it('shows categories when memories exist', async () => {
    svc.seed({ content: 'a', category: 'decision' });
    svc.seed({ content: 'b', category: 'preference' });
    const items = await provider.getChildren();
    expect(items).toHaveLength(2);
    const labels = items.map((i) => i.label);
    expect(labels).toContain('decision');
    expect(labels).toContain('preference');
  });
});

describe('StatsViewProvider', () => {
  let svc: InMemoryService;
  let provider: StatsViewProvider;

  beforeEach(() => {
    svc = new InMemoryService();
    provider = new StatsViewProvider(svc);
  });

  it('shows empty state when no data', async () => {
    const items = await provider.getChildren();
    expect(items).toHaveLength(1);
    expect(items[0].label).toBe('No data');
  });

  it('shows stats when memories exist', async () => {
    svc.seed({ content: 'test' });
    const items = await provider.getChildren();
    expect(items.length).toBeGreaterThanOrEqual(3);
    expect(items[0].label).toBe('Total memories');
  });
});
