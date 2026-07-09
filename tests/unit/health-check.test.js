const { checkCliAvailable, checkApiReachable, checkBackendHealth } = require('../../lib/utils/health-check');

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

  // Business invariant: doctor must give the user an actionable status for the
  // codex and opencode CLI backends — the command it looks for, and (when the
  // CLI is absent) a not-found error naming that command.
  describe('checkBackendHealth for CLI agent backends', () => {
    for (const backend of ['codex', 'opencode']) {
      it(`reports the command and a not-found error for ${backend} when its CLI is missing`, async () => {
        const result = await checkBackendHealth(backend, { command: `${backend}-not-installed-xyz` });
        expect(result.details.command).toBe(`${backend}-not-installed-xyz`);
        expect(result.healthy).toBe(false);
        expect(result.details.error).toMatch(/not found/i);
      });
    }
  });
});
