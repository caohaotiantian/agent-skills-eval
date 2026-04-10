/**
 * Compound Detector — Multi-signal detection across findings.
 * Identifies attack patterns that require two or more independent signals.
 */

const { createFinding } = require('../engine/findings');

const COMPOUND_RULES = [
  {
    name: 'Data exfiltration (file access + network upload)',
    category: 'DATA_EXFILTRATION', severity: 'critical', confidence: 85,
    signalA: { category: 'DATA_EXFILTRATION', pattern: /env|credential|secret|key|password|ssh|file.*read/i },
    signalB: { category: 'DATA_EXFILTRATION', pattern: /network|POST|upload|fetch|curl|request/i },
    suggestion: 'Skill accesses sensitive files AND sends network requests — potential data exfiltration'
  },
  {
    name: 'Rug pull (remote loading + dynamic execution)',
    category: 'MALICIOUS_CODE', severity: 'critical', confidence: 90,
    signalA: { category: 'MALICIOUS_CODE', pattern: /remote|rug|fetch.*config|load.*remote|import.*http/i },
    signalB: { category: 'MALICIOUS_CODE', pattern: /eval|exec|Function|dynamic.*code/i },
    suggestion: 'Skill loads remote code/config AND executes it dynamically — potential rug pull attack'
  },
  {
    name: 'Credential relay (credential access + network request)',
    category: 'DATA_EXFILTRATION', severity: 'critical', confidence: 85,
    signalA: { category: 'DATA_EXFILTRATION', pattern: /credential|keychain|browser.*cred|aws.*cred|ssh.*key/i },
    signalB: { category: null, pattern: /network|curl|fetch|request|POST|upload/i },
    suggestion: 'Skill accesses credentials AND makes network requests — potential credential relay'
  },
  {
    name: 'Backdoor install (persistence + reverse shell/hidden file)',
    category: 'BACKDOOR', severity: 'critical', confidence: 90,
    signalA: { category: 'BACKDOOR', pattern: /persist|crontab|systemd|launch|startup|init\.d/i },
    signalB: { category: 'BACKDOOR', pattern: /reverse.*shell|hidden.*file|nc\s|bash\s*-i|\/dev\/tcp/i },
    suggestion: 'Skill creates persistence mechanism AND uses reverse shell/hidden files — potential backdoor'
  }
];

function matchesSignal(finding, signal) {
  if (signal.category && finding.category !== signal.category) return false;
  const text = `${finding.name} ${finding.content || ''} ${finding.ruleId || ''}`;
  return signal.pattern.test(text);
}

class CompoundDetector {
  analyze(findings) {
    if (!findings || findings.length === 0) return [];
    const compounds = [];
    for (const rule of COMPOUND_RULES) {
      const hasA = findings.some(f => matchesSignal(f, rule.signalA));
      const hasB = findings.some(f => matchesSignal(f, rule.signalB));
      if (hasA && hasB) {
        compounds.push(createFinding({
          ruleId: `COMPOUND-${rule.name.split(' ')[0].toUpperCase()}`,
          detector: 'compound', category: rule.category,
          name: rule.name, severity: rule.severity, confidence: rule.confidence,
          file: null, line: null,
          content: `Compound: ${rule.name}`, match: 'multi-signal',
          suggestion: rule.suggestion
        }));
      }
    }
    return compounds;
  }
}

module.exports = { CompoundDetector };
