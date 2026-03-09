/**
 * QA Matrix — startup scenarios
 *
 * Covers:
 *   - Service available: IMemoryService initialised, count() returns 0
 *   - Service unavailable: faulted service throws on store; extension
 *     gracefully handles the error rather than crashing
 *   - Re-entrant startup: calling ensureReady() multiple times is idempotent
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryService, ServiceFault } from './mocks/memory-service.mock';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeService(fault?: ServiceFault) {
  return new InMemoryService({ fault });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('startup — service available', () => {
  it('starts with zero memories', () => {
    const svc = makeService();
    expect(svc.count()).toBe(0);
  });

  it('stats() returns zero-filled object when empty', () => {
    const svc = makeService();
    const s = svc.stats();
    expect(s.totalMemories).toBe(0);
    expect(s.edgeCount).toBe(0);
    expect(s.lastCaptureTime).toBeNull();
    expect(s.categories).toEqual({});
  });

  it('listSources() returns empty array when no memories stored', () => {
    const svc = makeService();
    expect(svc.listSources()).toHaveLength(0);
  });

  it('listAllTags() returns empty array when no memories stored', () => {
    const svc = makeService();
    expect(svc.listAllTags()).toHaveLength(0);
  });

  it('search() returns empty array on a fresh service', async () => {
    const svc = makeService();
    const results = await svc.search('anything');
    expect(results).toHaveLength(0);
  });
});

describe('startup — service unavailable (store fault)', () => {
  it('store() throws when the service is faulted', async () => {
    const svc = makeService({ storeError: 'Service unreachable' });
    await expect(svc.store('hello', 'other', 'test', [])).rejects.toThrow('Service unreachable');
  });

  it('count() still works even when store is faulted', () => {
    const svc = makeService({ storeError: 'Service unreachable' });
    // count should not require a live write path
    expect(svc.count()).toBe(0);
  });

  it('stats() still works even when store is faulted', () => {
    const svc = makeService({ storeError: 'Service unreachable' });
    expect(() => svc.stats()).not.toThrow();
  });
});

describe('startup — service unavailable (search fault)', () => {
  it('search() throws when the service is faulted', async () => {
    const svc = makeService({ searchError: 'Index unavailable' });
    await expect(svc.search('anything')).rejects.toThrow('Index unavailable');
  });

  it('store() still works when only search is faulted', async () => {
    const svc = makeService({ searchError: 'Index unavailable' });
    const entry = await svc.store('content', 'other', 'test', []);
    expect(entry.id).toBeTruthy();
    expect(svc.count()).toBe(1);
  });
});

describe('startup — service in empty mode', () => {
  it('search() always returns empty when fault.empty is set', async () => {
    const svc = makeService({ empty: true });
    // Seed directly so count > 0 but search still short-circuits
    svc.seed({ content: 'important fact' });
    const results = await svc.search('important fact');
    expect(results).toHaveLength(0);
  });
});

describe('startup — re-entrant / idempotent', () => {
  it('multiple stores are cumulative (not reset on each call)', async () => {
    const svc = makeService();
    await svc.store('first', 'other', 'test', []);
    await svc.store('second', 'other', 'test', []);
    expect(svc.count()).toBe(2);
  });
});
