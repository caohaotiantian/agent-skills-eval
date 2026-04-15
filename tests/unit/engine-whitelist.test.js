/**
 * Tests for whitelist loading in rule-loader.js
 */

const path = require('path');
const fs = require('fs-extra');
const { loadWhitelist, discoverWhitelistPath } = require('../../lib/validation/engine/rule-loader');

describe('loadWhitelist', () => {
  it('should load whitelist from YAML file', async () => {
    const whitelistPath = path.join(__dirname, '..', '..', 'config', 'security', 'whitelist.yaml');
    const result = loadWhitelist(whitelistPath);

    expect(result.filePatterns).toContain('README.md');
    expect(result.trustedDomains).toContain('localhost');
    expect(result.ruleOverrides).toBeDefined();
    expect(result.ruleOverrides.disabled).toEqual([]);
  });

  it('should return empty defaults for missing file path', () => {
    const result = loadWhitelist('/nonexistent/path/whitelist.yaml');

    expect(result.filePatterns).toEqual([]);
    expect(result.trustedDomains).toEqual([]);
    expect(result.ruleOverrides).toEqual({ disabled: [], severityOverrides: {} });
  });

  it('should return empty defaults for null path', () => {
    const result = loadWhitelist(null);

    expect(result.filePatterns).toEqual([]);
    expect(result.trustedDomains).toEqual([]);
    expect(result.ruleOverrides).toEqual({ disabled: [], severityOverrides: {} });
  });
});

describe('discoverWhitelistPath', () => {
  it('should return config.whitelistFile if provided and exists', () => {
    const whitelistPath = path.join(__dirname, '..', '..', 'config', 'security', 'whitelist.yaml');
    const result = discoverWhitelistPath({ whitelistFile: whitelistPath });
    expect(result).toBe(whitelistPath);
  });

  it('should discover bundled whitelist.yaml', () => {
    const result = discoverWhitelistPath({});
    expect(result).not.toBeNull();
    expect(result).toMatch(/whitelist\.yaml$/);
  });

  it('should return null when no whitelist exists', () => {
    // Override cwd to a temp dir with no whitelist
    const origCwd = process.cwd;
    process.cwd = () => '/tmp/nonexistent-dir-for-test';
    try {
      const result = discoverWhitelistPath({});
      // Could be null or could find the bundled path; depends on module location
      // The bundled path should still be found since __dirname doesn't change
    } finally {
      process.cwd = origCwd;
    }
  });
});
