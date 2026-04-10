/**
 * SARIF 2.1.0 Reporter
 * Generates Static Analysis Results Interchange Format output.
 */

const packageJson = require('../../../package.json');

function toSARIFLevel(severity) {
  switch (severity) {
    case 'critical': case 'high': return 'error';
    case 'medium': return 'warning';
    case 'low': default: return 'note';
  }
}

function generateSARIF(findings) {
  const rulesMap = new Map();
  for (const f of findings) {
    if (f.ruleId && !rulesMap.has(f.ruleId)) {
      rulesMap.set(f.ruleId, {
        id: f.ruleId, name: f.name,
        shortDescription: { text: f.name },
        fullDescription: { text: f.suggestion || f.name },
        helpUri: f.reference || undefined,
        properties: { category: f.category, detector: f.detector }
      });
    }
  }

  const results = findings.map(f => {
    const result = {
      ruleId: f.ruleId,
      level: toSARIFLevel(f.severity),
      message: { text: f.suggestion ? `${f.name}: ${f.suggestion}` : f.name },
      locations: []
    };
    if (f.file) {
      const physicalLocation = { artifactLocation: { uri: f.file } };
      if (f.line) physicalLocation.region = { startLine: f.line };
      result.locations.push({ physicalLocation });
    }
    result.properties = { confidence: f.confidence, detector: f.detector, category: f.category };
    if (f.cvss) result.properties.cvss = f.cvss;
    return result;
  });

  const sarif = {
    $schema: 'https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json',
    version: '2.1.0',
    runs: [{
      tool: {
        driver: {
          name: 'agent-skills-eval',
          version: packageJson.version,
          informationUri: packageJson.homepage || 'https://github.com/caohaotiantian/agent-skills-eval',
          rules: Array.from(rulesMap.values())
        }
      },
      results
    }]
  };

  return JSON.stringify(sarif, null, 2);
}

module.exports = { generateSARIF, toSARIFLevel };
