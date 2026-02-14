import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { startSurveillance, fetchStatus } from '../../ui/src/lib/api';

describe('api', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe('fetchStatus', () => {
    it('returns parsed JSON on success', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ running: true, pid: 123 }),
      });
      const result = await fetchStatus();
      expect(result).toEqual({ running: true, pid: 123 });
    });

    it('throws on non-ok response', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });
      await expect(fetchStatus()).rejects.toThrow('Status failed: 500');
    });
  });

  describe('startSurveillance', () => {
    it('returns parsed JSON on success', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ ok: true, running: true }),
      });
      const result = await startSurveillance();
      expect(result).toEqual({ ok: true, running: true });
    });

    it('sends POST request', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({}),
      });
      await startSurveillance();
      expect(globalThis.fetch).toHaveBeenCalledWith('/api/start', {
        method: 'POST',
      });
    });

    it('throws on non-ok response', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        statusText: 'Service Unavailable',
      });
      await expect(startSurveillance()).rejects.toThrow('Start failed: 503');
    });
  });
});
