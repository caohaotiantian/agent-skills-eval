/**
 * ScanEngine — orchestrates per-file security scanning with all detectors.
 */

const path = require('path');
const fs = require('fs-extra');
const glob = require('glob');
const { minimatch } = require('minimatch');
const { loadAllRules, loadWhitelist, discoverWhitelistPath } = require('./rule-loader');
const { calculateCVSS } = require('./cvss');
const { createFinding } = require('./findings');
const { IOCMatcher } = require('./ioc');
const { EntropyDetector } = require('../detectors/entropy');
const { HiddenCharDetector } = require('../detectors/hidden-char');
const { CompoundDetector } = require('../detectors/compound');

// CommonMark: fenced code block opens with >=3 backticks or tildes (up to 3 spaces indent)
const FENCE_REGEX = /^ {0,3}(`{3,}|~{3,})\s*(\w*)/;

function extractMarkdownCodeBlocks(lines) {
  const blocks = [];
  let inBlock = false;
  let fenceChar = null;
  let fenceLen = 0;
  let blockStart = -1;

  for (let i = 0; i < lines.length; i++) {
    if (!inBlock) {
      const fenceMatch = FENCE_REGEX.exec(lines[i]);
      if (fenceMatch) {
        inBlock = true;
        fenceChar = fenceMatch[1].charAt(0);
        fenceLen = fenceMatch[1].length;
        blockStart = i + 1;
      }
    } else {
      // CommonMark: closing fence must use same char and be at least as long
      const closeMatch = lines[i].match(new RegExp(`^ {0,3}${fenceChar}{${fenceLen},}\\s*$`));
      if (closeMatch) {
        for (let j = blockStart; j < i; j++) {
          blocks.push(j);
        }
        inBlock = false;
        fenceChar = null;
        fenceLen = 0;
      }
    }
  }
  // Unclosed fence: treat remaining lines as code (safe default — don't let
  // attackers hide malicious code after an intentionally unclosed fence)
  if (inBlock) {
    for (let j = blockStart; j < lines.length; j++) {
      blocks.push(j);
    }
  }
  return new Set(blocks);
}

const FILE_GLOB = '**/*.{js,ts,mjs,py,sh,bash,yaml,yml,json,md,jsx,tsx,c,cpp,java,php,xml,txt}';
const SKIP_DIRS = ['node_modules', '.git', '__pycache__', 'dist', 'coverage', 'venv', '.venv'];
const SKIP_FILE_PATTERNS = /\.(min\.js|min\.css|map)$/i;
const DEFAULT_MAX_FILE_SIZE = 1048576;
const DEFAULT_MAX_FILES = 1000;
const DEFAULT_CONFIDENCE_THRESHOLD = 30;

class ScanEngine {
  constructor(config = {}) {
    const { rules, categories } = loadAllRules(config);
    const whitelistPath = discoverWhitelistPath(config);
    this.whitelist = loadWhitelist(whitelistPath);

    // Apply disabled rule overrides
    const disabledSet = new Set(this.whitelist.ruleOverrides.disabled);
    this.rules = rules.filter(r => !disabledSet.has(r.id));

    // Apply severity overrides
    for (const rule of this.rules) {
      const override = this.whitelist.ruleOverrides.severityOverrides[rule.id];
      if (override) rule.severity = override.toLowerCase();
    }

    this.categories = categories;
    this.maxFileSize = config.maxFileSize ?? DEFAULT_MAX_FILE_SIZE;
    this.maxFiles = config.maxFiles ?? DEFAULT_MAX_FILES;
    this.confidenceThreshold = config.confidenceThreshold ?? DEFAULT_CONFIDENCE_THRESHOLD;

    this.entropyDetector = config.entropy !== false ? new EntropyDetector() : null;
    this.hiddenCharDetector = config.hiddenChars !== false ? new HiddenCharDetector() : null;
    this.compoundDetector = config.compoundDetection !== false ? new CompoundDetector() : null;

    const iocDbPath = config.iocDatabase ||
      path.join(__dirname, '..', '..', '..', 'config', 'security', 'ioc-database.json');
    this.iocMatcher = config.ioc !== false ? new IOCMatcher(iocDbPath) : null;

    // Pass trusted domains to IOC matcher
    if (this.iocMatcher && this.whitelist.trustedDomains.length > 0) {
      for (const domain of this.whitelist.trustedDomains) {
        this.iocMatcher.addTrustedDomain(domain);
      }
    }
  }

  _discoverFiles(skillPath) {
    const ignore = SKIP_DIRS.map(d => `**/${d}/**`);
    const files = glob.sync(FILE_GLOB, { cwd: skillPath, ignore, nodir: true });
    return files
      .filter(f => !SKIP_FILE_PATTERNS.test(f))
      .filter(f => !this.whitelist.filePatterns.some(pattern => minimatch(f, pattern, { matchBase: true })))
      .slice(0, this.maxFiles);
  }

  _matchesFileType(filePath, fileTypes) {
    if (!fileTypes || fileTypes.length === 0) return true;
    return fileTypes.some(pattern => minimatch(filePath, pattern, { matchBase: true }));
  }

  _isPromptRule(rule) {
    return rule.category === 'PROMPT_INJECTION';
  }

  _scanRules(filePath, lines) {
    const findings = [];
    const isMarkdown = /\.md$/i.test(filePath);
    const codeBlockLines = isMarkdown ? extractMarkdownCodeBlocks(lines) : null;
    const matchingRules = isMarkdown
      ? this.rules  // In markdown, all rules apply (code blocks can contain any language)
      : this.rules.filter(r => this._matchesFileType(filePath, r.fileTypes));

    for (const rule of matchingRules) {
      const isPrompt = this._isPromptRule(rule);

      for (let i = 0; i < lines.length; i++) {
        // In markdown: code-pattern rules only run on code block lines,
        // PROMPT rules run on all lines
        if (isMarkdown && !isPrompt && !codeBlockLines.has(i)) continue;

        const line = lines[i];
        for (const pattern of rule.patterns) {
          pattern.lastIndex = 0;
          const m = pattern.exec(line);
          if (m) {
            const confidence = (isMarkdown && isPrompt) ? (rule.markdownConfidence ?? rule.confidence) : rule.confidence;
            findings.push(createFinding({
              ruleId: rule.id, detector: 'rule-engine', category: rule.category,
              name: rule.name, severity: rule.severity, confidence,
              file: filePath, line: i + 1, content: line, match: m[0],
              suggestion: rule.suggestion, reference: rule.reference
            }));
            break;
          }
        }
      }
    }
    return findings;
  }

  async scan(skillPath) {
    const result = {
      findings: [],
      cvss: { maxScore: 0, avgScore: 0, distribution: { critical: 0, high: 0, medium: 0, low: 0 } },
      categoryScores: {},
      detectorResults: {
        'rule-engine': { findings: 0 }, entropy: { findings: 0 },
        'hidden-char': { findings: 0 }, compound: { findings: 0 }, ioc: { findings: 0 }
      }
    };

    if (!await fs.pathExists(skillPath)) {
      result.error = `Path does not exist: ${skillPath}`;
      return result;
    }

    // Resolve symlinks so glob and file operations work correctly
    // (glob.sync doesn't follow symlinked cwd directories)
    const resolvedRoot = await fs.realpath(skillPath);
    const files = this._discoverFiles(resolvedRoot);
    const allFindings = [];

    for (const relPath of files) {
      const absPath = path.join(resolvedRoot, relPath);
      try {
        // Guard against symlinks escaping the skill directory
        const realPath = await fs.realpath(absPath);
        if (!realPath.startsWith(resolvedRoot + path.sep) && realPath !== resolvedRoot) {
          result.skippedFiles = (result.skippedFiles || 0) + 1;
          continue;
        }

        const stat = await fs.stat(realPath);
        if (stat.size > this.maxFileSize) {
          result.skippedFiles = (result.skippedFiles || 0) + 1;
          continue;
        }
        const content = await fs.readFile(realPath, 'utf-8');
        const lines = content.split(/\r?\n/);

        allFindings.push(...this._scanRules(relPath, lines));
        if (this.entropyDetector) allFindings.push(...this.entropyDetector.scanFile(relPath, lines));
        if (this.hiddenCharDetector) allFindings.push(...this.hiddenCharDetector.scanFile(relPath, lines));
        if (this.iocMatcher) {
          for (let i = 0; i < lines.length; i++) {
            allFindings.push(...this.iocMatcher.matchLine(lines[i], relPath, i + 1));
          }
        }
      } catch (_e) {
        result.skippedFiles = (result.skippedFiles || 0) + 1;
      }
    }

    if (this.compoundDetector) allFindings.push(...this.compoundDetector.analyze(allFindings));

    for (const finding of allFindings) {
      finding.cvss = calculateCVSS(finding.category, finding.confidence);
      if (finding.cvss) finding.severity = finding.cvss.severityRating.toLowerCase();
    }

    const filtered = allFindings.filter(f => f.confidence >= this.confidenceThreshold);
    result.findings = filtered;

    const scores = filtered.map(f => f.cvss?.adjustedScore).filter(s => s != null);
    if (scores.length > 0) {
      result.cvss.maxScore = scores.reduce((a, b) => a > b ? a : b, 0);
      result.cvss.avgScore = Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10;
    }
    for (const f of filtered) {
      const sev = f.severity || 'low';
      result.cvss.distribution[sev] = (result.cvss.distribution[sev] || 0) + 1;
    }

    for (const cat of this.categories) {
      const catFindings = filtered.filter(f => f.category === cat.id);
      result.categoryScores[cat.id] = {
        score: catFindings.length > 0 ? 0 : cat.severityWeight,
        maxScore: cat.severityWeight, findings: catFindings.length
      };
    }

    for (const f of filtered) {
      if (result.detectorResults[f.detector]) result.detectorResults[f.detector].findings++;
    }

    return result;
  }
}

module.exports = { ScanEngine };
