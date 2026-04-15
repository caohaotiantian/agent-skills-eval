/**
 * IOC (Indicator of Compromise) Threat Intelligence Matcher
 */

const fs = require('fs-extra');
const { createFinding } = require('./findings');

const IP_REGEX = /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g;
const DOMAIN_REGEX = /\b[a-zA-Z0-9][-a-zA-Z0-9]*\.[a-zA-Z]{2,}\b/g;
const URL_REGEX = /https?:\/\/[^\s'"<>]+/g;

// Common code patterns that look like domains but aren't (e.g., console.log, path.join)
const CODE_DOMAIN_ALLOWLIST = new Set([
  'console.log', 'console.info', 'console.warn', 'console.error', 'console.debug',
  'path.join', 'path.resolve', 'path.dirname', 'path.basename', 'path.extname',
  'fs.readFile', 'fs.writeFile', 'fs.readFileSync', 'fs.writeFileSync',
  'fs.existsSync', 'fs.pathExists', 'fs.ensureDir', 'fs.readJson',
  'module.exports', 'Object.keys', 'Object.values', 'Object.entries',
  'Object.assign', 'Object.create', 'Object.freeze',
  'Array.from', 'Array.isArray', 'JSON.parse', 'JSON.stringify',
  'Math.round', 'Math.floor', 'Math.ceil', 'Math.max', 'Math.min',
  'Math.random', 'Math.log2', 'Promise.all', 'Promise.resolve',
  'process.env', 'process.cwd', 'process.exit', 'process.argv',
  'Buffer.from', 'Buffer.alloc', 'Date.now', 'RegExp.test',
  'String.fromCharCode', 'Number.parseInt', 'Number.parseFloat',
  'crypto.createHash', 'crypto.randomBytes',
  'require.resolve', 'require.cache'
]);

// Minimum parts for suspicious TLD check
const MIN_DOMAIN_PARTS_FOR_TLD = 2;

// Context patterns that indicate a "domain" is actually a file reference, not a real domain
const FILE_CONTEXT_REGEX = /(?:import|require|open|read|load|from|include)\s+\S*$|["'/\\]/;

class IOCMatcher {
  constructor(dbPath) {
    this.db = { maliciousIPs: [], maliciousDomains: [], maliciousUrlPatterns: [], suspiciousTLDs: [] };
    this._compiledUrlPatterns = [];
    // Instance-scoped copy of the allowlist so addTrustedDomain doesn't leak across instances
    this._domainAllowlist = new Set(CODE_DOMAIN_ALLOWLIST);
    try {
      if (fs.existsSync(dbPath)) {
        this.db = JSON.parse(fs.readFileSync(dbPath, 'utf-8'));
        this._compiledUrlPatterns = (this.db.maliciousUrlPatterns || []).map(entry => ({
          pattern: new RegExp(entry.pattern, 'gi'),
          description: entry.description
        }));
      }
    } catch (_e) { /* graceful degrade */ }
  }

  addTrustedDomain(domain) {
    this._domainAllowlist.add(domain);
  }

  extractIPs(content) { return (content.match(IP_REGEX) || []); }
  extractDomains(content) { return (content.match(DOMAIN_REGEX) || []); }
  extractURLs(content) { return (content.match(URL_REGEX) || []); }

  /**
   * Match a single line against IOC database.
   * @param {string} lineContent - Line text
   * @param {string} file - Relative file path
   * @param {number} line - 1-based line number
   * @returns {Object[]} Array of Finding objects
   */
  matchLine(lineContent, file, line) {
    const findings = [];

    // Check IPs
    for (const ip of this.extractIPs(lineContent)) {
      const match = this.db.maliciousIPs.find(e => e.ip === ip);
      if (match) {
        findings.push(createFinding({
          ruleId: 'IOC-IP', detector: 'ioc', category: 'MALICIOUS_CODE',
          name: `Malicious IP: ${ip}`, severity: 'critical',
          confidence: match.confidence || 80, file, line,
          content: lineContent, match: ip, suggestion: match.description
        }));
      }
    }

    // Check domains (filter out code patterns)
    for (const domain of this.extractDomains(lineContent)) {
      if (this._domainAllowlist.has(domain)) continue;

      const match = this.db.maliciousDomains.find(e => e.domain === domain);
      if (match) {
        findings.push(createFinding({
          ruleId: 'IOC-DOMAIN', detector: 'ioc', category: 'MALICIOUS_CODE',
          name: `Malicious domain: ${domain}`, severity: 'high',
          confidence: match.confidence || 80, file, line,
          content: lineContent, match: domain, suggestion: match.description
        }));
        continue;
      }

      // Suspicious TLD check — skip if domain appears in a file-reference context
      const parts = domain.split('.');
      if (parts.length >= MIN_DOMAIN_PARTS_FOR_TLD) {
        const tld = '.' + parts[parts.length - 1];
        // Skip if the text before the domain looks like a file path or import
        const domainIdx = lineContent.indexOf(domain);
        const prefix = domainIdx > 0 ? lineContent.substring(Math.max(0, domainIdx - 30), domainIdx) : '';
        const isFileContext = FILE_CONTEXT_REGEX.test(prefix);
        if (!isFileContext && (this.db.suspiciousTLDs || []).includes(tld)) {
          findings.push(createFinding({
            ruleId: 'IOC-TLD', detector: 'ioc', category: 'MALICIOUS_CODE',
            name: `Suspicious TLD: ${domain} (${tld})`, severity: 'medium',
            confidence: 50, file, line,
            content: lineContent, match: domain,
            suggestion: `Domain uses suspicious TLD ${tld}`
          }));
        }
      }
    }

    // Check URL patterns
    for (const url of this.extractURLs(lineContent)) {
      for (const { pattern, description } of this._compiledUrlPatterns) {
        pattern.lastIndex = 0;
        if (pattern.test(url)) {
          findings.push(createFinding({
            ruleId: 'IOC-URL', detector: 'ioc', category: 'MALICIOUS_CODE',
            name: `Malicious URL pattern: ${description}`, severity: 'high',
            confidence: 85, file, line,
            content: lineContent, match: url.slice(0, 100), suggestion: description
          }));
        }
      }
    }

    return findings;
  }

  /**
   * Match content against IOC database (backward-compatible, delegates to matchLine).
   */
  matchContent(content, file, line) {
    return this.matchLine(content, file, line);
  }
}

module.exports = { IOCMatcher };
