/**
 * Agent Skills Evaluation Tool Configuration
 *
 * This configuration file provides project-level settings for the
 * agent-skills-eval tool. Environment variables can also be used
 * as an alternative to this file.
 *
 * @see README.md#configuration for detailed documentation
 */

module.exports = {
  // Platforms to evaluate
  platforms: ['openclaw', 'claude-code', 'opencode'],

  // Default evaluation dimensions
  dimensions: ['outcome', 'process', 'style', 'efficiency'],

  // Enable security assessment
  security: {
    enabled: true,
    checks: [
      'no-hardcoded-secrets',
      'input-sanitization',
      'safe-shell-commands',
      'no-eval-usage',
      'file-permissions',
      'network-safety',
      'dependency-security'
    ]
  },

  // Thresholds
  thresholds: {
    passing: 70,  // Minimum score for passing (%)
    warning: 50   // Score for warning status
  },

  // Output settings
  output: {
    format: 'html',
    directory: './results',
    artifacts: './evals/artifacts'
  }
};
