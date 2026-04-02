const { checkCliAvailable, checkApiReachable } = require('../../lib/utils/health-check');

describe('health-check utilities', () => {
  describe('checkCliAvailable', () => {
    it('returns available: true with a path for a known command', async () => {
      const result = await checkCliAvailable('node');
      expect(result.available).toBe(true);
      expect(typeof result.path).toBe('string');
      expect(result.path.length).toBeGreaterThan(0);
    });

    it('returns available: false for a nonexistent command', async () => {
      const result = await checkCliAvailable('definitely-not-a-real-command-xyz');
      expect(result.available).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('checkApiReachable', () => {
    it('returns reachable: false for an unreachable endpoint', async () => {
      const result = await checkApiReachable('http://127.0.0.1:1/v1/models', { timeout: 1000 });
      expect(result.reachable).toBe(false);
      expect(result.error).toBeDefined();
    });
  });
});
