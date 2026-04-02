const path = require('path');
const { computeSkillHash, loadCacheIndex, saveCacheIndex } = require('../../lib/utils/content-hash');

describe('content-hash', () => {
  it('should compute a consistent hash for a directory', async () => {
    // Use the test fixtures directory
    const fixturesPath = path.join(__dirname, '../fixtures/coding-agent');
    const hash1 = await computeSkillHash(fixturesPath);
    const hash2 = await computeSkillHash(fixturesPath);
    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(16);
  });

  it('should load empty index when no cache exists', async () => {
    const index = await loadCacheIndex('/tmp/nonexistent-cache-path-xyz');
    expect(index).toEqual({});
  });
});
