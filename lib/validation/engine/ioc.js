/**
 * IOC (Indicator of Compromise) Threat Intelligence Matcher
 */

const fs = require('fs-extra');
const { createFinding } = require('./findings');

const IP_REGEX = /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g;
const DOMAIN_REGEX = /\b[a-zA-Z0-9][-a-zA-Z0-9]*\.[a-zA-Z]{2,}\b/g;
const URL_REGEX = /https?:\/\/[^\s'"<>]+/g;

class IOCMatcher {
  constructor(dbPath) {
    this.db = { maliciousIPs: [], maliciousDomains: [], maliciousUrlPatterns: [], suspiciousTLDs: [] };
    this._compiledUrlPatterns = [];
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

  extractIPs(content) { return (content.match(IP_REGEX) || []); }
  extractDomains(content) { return (content.match(DOMAIN_REGEX) || []); }
  extractURLs(content) { return (content.match(URL_REGEX) || []); }

  matchContent(content, file, line) {
    const findings = [];

    // Check IPs
    for (const ip of this.extractIPs(content)) {
      const match = this.db.maliciousIPs.find(e => e.ip === ip);
      if (match) {
        findings.push(createFinding({
          ruleId: 'IOC-IP', detector: 'ioc', category: 'MALICIOUS_CODE',
          name: `Malicious IP: ${ip}`, severity: 'critical',
          confidence: match.confidence || 80, file, line,
          content: content.slice(0, 200), match: ip, suggestion: match.description
        }));
      }
    }

    // Check domains
    for (const domain of this.extractDomains(content)) {
      const match = this.db.maliciousDomains.find(e => e.domain === domain);
      if (match) {
        findings.push(createFinding({
          ruleId: 'IOC-DOMAIN', detector: 'ioc', category: 'MALICIOUS_CODE',
          name: `Malicious domain: ${domain}`, severity: 'high',
          confidence: match.confidence || 80, file, line,
          content: content.slice(0, 200), match: domain, suggestion: match.description
        }));
        continue;
      }
      const tld = '.' + domain.split('.').pop();
      if ((this.db.suspiciousTLDs || []).includes(tld)) {
        findings.push(createFinding({
          ruleId: 'IOC-TLD', detector: 'ioc', category: 'MALICIOUS_CODE',
          name: `Suspicious TLD: ${domain} (${tld})`, severity: 'medium',
          confidence: 50, file, line,
          content: content.slice(0, 200), match: domain,
          suggestion: `Domain uses suspicious TLD ${tld}`
        }));
      }
    }

    // Check URL patterns
    for (const url of this.extractURLs(content)) {
      for (const { pattern, description } of this._compiledUrlPatterns) {
        pattern.lastIndex = 0;
        if (pattern.test(url)) {
          findings.push(createFinding({
            ruleId: 'IOC-URL', detector: 'ioc', category: 'MALICIOUS_CODE',
            name: `Malicious URL pattern: ${description}`, severity: 'high',
            confidence: 85, file, line,
            content: content.slice(0, 200), match: url.slice(0, 100), suggestion: description
          }));
        }
      }
    }

    return findings;
  }
}

module.exports = { IOCMatcher };
