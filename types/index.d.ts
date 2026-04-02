/**
 * TypeScript type definitions for agent-skills-eval
 *
 * These definitions cover all key interfaces used across the project.
 * They are intended for IDE support and documentation; the project
 * itself remains plain JavaScript.
 */

// ---------------------------------------------------------------------------
// Skill Discovery
// ---------------------------------------------------------------------------

/** A discovered agent skill from any platform. */
export interface Skill {
  /** Skill identifier (directory name). */
  id: string;
  /** Human-readable skill name (from frontmatter or heading). */
  name: string;
  /** Path to the skill directory. */
  path: string;
  /** Short description from frontmatter. */
  description: string;
  /** Platform the skill belongs to (e.g. 'claude-code', 'opencode', 'codex', 'openclaw'). */
  platform: string;
  /** Source tier: 'personal' | 'project' | 'plugin' | 'managed' | 'workspace' | 'bundled'. */
  source: string;
  /** Plugin name, if the skill comes from a plugin. */
  pluginName?: string;
  /** Plugin version string. */
  pluginVersion?: string;
  /** Marketplace identifier for plugin skills. */
  marketplace?: string;
  /** Extension name for OpenClaw bundled extension skills. */
  extensionName?: string;
  /** Allowed tools string from frontmatter. */
  allowedTools?: string;
  /** Raw frontmatter object, when available. */
  frontmatter?: SkillFrontmatter;
}

/** YAML frontmatter fields in a SKILL.md file. */
export interface SkillFrontmatter {
  name: string;
  description: string;
  version?: string;
  triggers?: string[];
  tools?: string[];
  'allowed-tools'?: string;
  [key: string]: unknown;
}

/** Result of parsing YAML frontmatter from markdown content. */
export interface FrontmatterResult {
  /** Parsed frontmatter object, or null on failure. */
  frontmatter: SkillFrontmatter | null;
  /** Markdown body after the closing `---`. */
  body: string;
  /** Error message, or null on success. */
  error: string | null;
}

/** Result from the discovery module for a single platform. */
export interface PlatformDiscoveryResult {
  name: string;
  path?: string;
  skillsCount: number;
  skills: Skill[];
  error?: string;
  warning?: string;
  breakdown?: Record<string, number>;
}

/** Full discovery result across all platforms. */
export interface DiscoveryResult {
  timestamp: string;
  platforms: Record<string, PlatformDiscoveryResult>;
  totalSkills: number;
}

// ---------------------------------------------------------------------------
// Tracing
// ---------------------------------------------------------------------------

/** All recognized trace event type strings. */
export type TraceEventType =
  | 'tool_call'
  | 'tool_result'
  | 'message'
  | 'thought'
  | 'system'
  | 'error'
  | 'completion'
  | 'thread.started'
  | 'turn.started'
  | 'turn.failed'
  | 'result'
  | 'summary'
  | 'parse_error'
  | 'command_execution'
  | 'unknown';

/** A single trace event parsed from JSONL output. */
export interface TraceEvent {
  type: TraceEventType;
  timestamp?: string;
  created_at?: string;
  tool?: string;
  name?: string;
  input?: Record<string, unknown>;
  args?: Record<string, unknown>;
  content?: string;
  status?: string;
  thread_id?: string;
  id?: string;
  duration?: number;
  error?: string;
  message?: string;
  metadata?: {
    tokens?: { input?: number; output?: number };
    [key: string]: unknown;
  };
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    prompt_tokens?: number;
    completion_tokens?: number;
  };
  costUSD?: number;
  cost?: number;
  /** Present when type is 'parse_error'. */
  raw?: string;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Backends
// ---------------------------------------------------------------------------

/** Result returned by an agent backend's `run()` method. */
export interface BackendResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/** Options passed to a backend's `run()` method. */
export interface BackendRunOptions {
  skill?: string;
  verbose?: boolean;
  timeout?: number;
  config?: Record<string, unknown>;
  projectConfig?: ProjectConfig;
}

/** Interface that all agent backends must implement. */
export interface Backend {
  run(prompt: string, options: BackendRunOptions): BackendResult | Promise<BackendResult>;
}

// ---------------------------------------------------------------------------
// Health Check
// ---------------------------------------------------------------------------

/** Result from checking a backend's health. */
export interface HealthCheckResult {
  healthy: boolean;
  details: Record<string, unknown>;
}

/** Result from checking if a CLI tool is available. */
export interface CliAvailableResult {
  available: boolean;
  path?: string;
  error?: string;
}

/** Result from checking API reachability. */
export interface ApiReachableResult {
  reachable: boolean;
  status?: number;
  error?: string;
}

// ---------------------------------------------------------------------------
// Static Evaluation
// ---------------------------------------------------------------------------

/** A single evaluation criterion within a dimension. */
export interface EvalCriterion {
  id: string;
  name: string;
  weight: number;
}

/** An evaluation dimension containing multiple criteria. */
export interface EvalDimension {
  id: string;
  name: string;
  description: string;
  criteria: EvalCriterion[];
}

/** Result of evaluating a single criterion against a skill. */
export interface CriterionResult {
  criterion_id: string;
  name: string;
  score: number;
  weight: number;
  passed: boolean;
  reasoning: string;
  metadata: Record<string, unknown>;
}

/** Result of a single eval dimension run against a skill. */
export interface SingleEvalResult {
  eval_id: string;
  eval_name: string;
  description: string;
  created_at: string;
  criteria_results: CriterionResult[];
  total_score: number;
  max_score: number;
  percentage: number;
  status: string;
}

/** Full output of a static evaluation run. */
export interface StaticEvalResult {
  run_id: string;
  created_at: string;
  status: string;
  config: {
    platform: string;
    skill_filter?: string;
    benchmark_filter?: string;
  };
  data: Record<string, {
    skill_name: string;
    platform: string;
    path: string;
    scores: Record<string, SingleEvalResult>;
  }>;
  errors: Array<{ error: string; stack?: string }>;
  summary: {
    aggregate_scores?: { mean?: number };
    scores?: Record<string, { mean_score: number }>;
    [key: string]: unknown;
  };
}

// ---------------------------------------------------------------------------
// Dynamic Evaluation (Runner)
// ---------------------------------------------------------------------------

/** A test prompt loaded from JSONL or CSV. */
export interface TestPrompt {
  id?: string;
  should_trigger: string | boolean;
  prompt: string;
  expected_tools?: string;
  category?: string;
  security_focus?: boolean | string;
  [key: string]: unknown;
}

/** Result of validating whether a skill was triggered. */
export interface TriggerResult {
  triggered: boolean;
  reason: string;
}

/** A single security check within a security analysis. */
export interface SecurityCheck {
  id: string;
  name: string;
  pass: boolean;
  severity: 'info' | 'high' | 'critical';
  notes: string;
  details?: unknown[];
}

/** Result of security pattern analysis on trace events. */
export interface SecurityResult {
  score: number;
  maxScore: number;
  percentage: number;
  checks: SecurityCheck[];
  vulnerabilities: string[];
}

/** Trace details embedded in a test result. */
export interface TraceDetails {
  messages: Array<{ content: string; timestamp?: string }>;
  toolCalls: Array<{ tool: string; input: unknown; id?: string; timestamp?: string }>;
  errors: Array<{ type: string; message: string; timestamp?: string }>;
  eventCount: number;
}

/** Thrashing detection result. */
export interface ThrashingResult {
  isThrashing: boolean;
  command?: string | null;
  streak?: number;
  reason: string;
}

/** Token usage information. */
export interface TokenUsage {
  input: number | null;
  output: number | null;
  total: number | null;
}

/** Report generated by TraceAnalyzer.generateReport(). */
export interface TraceReport {
  commandCount: number;
  errorCount: number;
  efficiencyScore: number;
  thrashing: ThrashingResult;
  performance: {
    totalEvents: number;
    toolCallCount: number;
    duration: number | null;
    tokens: TokenUsage;
  };
  determinism: {
    isDeterministic: boolean;
    factors: Array<{ type: string; description: string }>;
    recommendations: string[];
  };
  createdFiles: string[];
  tokenUsage: TokenUsage;
}

/** Result from a deterministic rubric check. */
export interface RubricCheckResult {
  check: string;
  passed: boolean;
  type?: string;
  pattern?: string;
  path?: string;
  value?: number;
  name?: string;
}

/** Result of a single test prompt execution. */
export interface TestResult {
  testId: string;
  prompt: string;
  category: string | null;
  shouldTrigger: boolean;
  tracePath: string;
  traceReport: TraceReport;
  traceDetails: TraceDetails;
  triggerResult: TriggerResult;
  securityResult: SecurityResult | null;
  gradingResult: GradingResult | null;
  checkResults: RubricCheckResult[];
  passed: boolean;
  exitCode: number;
}

/** Result of running all prompts for a skill (dynamic evaluation). */
export interface DynamicEvalResult {
  skillName: string;
  backend: string;
  prompts: number;
  summary: {
    total: number;
    passed: number;
    failed: number;
  };
  results: TestResult[];
  error?: string;
}

// ---------------------------------------------------------------------------
// LLM-as-Judge Grading
// ---------------------------------------------------------------------------

/** Result from LLM-based grading of an agent response. */
export interface GradingResult {
  correctness?: number;
  helpfulness?: number;
  adherence?: number;
  reasoning?: string;
  overall?: number;
  error?: string | null;
  skipped?: boolean;
}

// ---------------------------------------------------------------------------
// Pipeline & Aggregation
// ---------------------------------------------------------------------------

/** Options accepted by the pipeline orchestrator. */
export interface PipelineOptions {
  skill?: string;
  include?: string[];
  exclude?: string[];
  platform?: string;
  backend?: string;
  useLLM?: boolean;
  format?: 'html' | 'markdown' | 'json';
  output?: string;
  outputDir?: string;
  skipGenerate?: boolean;
  skipDynamic?: boolean;
  verbose?: boolean;
  dryRun?: boolean;
  resume?: boolean;
}

/** Per-skill comparison entry in aggregated results. */
export interface SkillRanking {
  skillName: string;
  rank: number;
  staticScore: number | null;
  dynamicPassRate: number;
  efficiencyAvg: number | null;
  securityAvg: number | null;
  totalTokens: number;
  thrashingCount: number;
  compositeScore: number;
  testCount: number;
  passedCount: number;
  failedCount: number;
}

/** Cross-skill comparison data. */
export interface Comparison {
  rankings: SkillRanking[];
  bestPerformer: string | null;
  worstPerformer: string | null;
  averageEfficiency: number | null;
  averageCompositeScore: number | null;
  totalThrashingIncidents: number;
  totalTokensUsed: number;
}

/** Trace metrics for a single test within aggregated dynamic results. */
export interface AggregatedTraceMetric {
  testId: string;
  passed: boolean;
  shouldTrigger: boolean | null;
  triggerResult: TriggerResult | null;
  securityResult: SecurityResult | null;
  prompt: string | null;
  category: string | null;
  commandCount: number;
  errorCount: number;
  efficiencyScore: number | null;
  thrashing: ThrashingResult | Record<string, never>;
  tokenUsage: TokenUsage | Record<string, never>;
  tracePath: string | null;
  traceDetails: TraceDetails | null;
}

/** Aggregated dynamic skill entry. */
export interface AggregatedDynamicSkill {
  skillName: string;
  backend: string;
  summary: {
    total?: number;
    passed?: number;
    failed?: number;
  };
  traceMetrics: AggregatedTraceMetric[];
}

/** Full aggregated results from the pipeline. */
export interface AggregatedResults {
  run_id: string;
  created_at: string;
  pipeline: true;
  meta: {
    platform?: string;
    backend?: string;
    useLLM?: boolean;
    format?: string;
    generated_by: string;
    [key: string]: unknown;
  };

  /** Static evaluation results (verbatim). */
  static_eval: StaticEvalResult;

  /** Dynamic execution summary. */
  dynamic_eval: {
    total_tests: number;
    passed: number;
    failed: number;
    pass_rate: number | null;
    total_tokens: number;
    thrashing_count: number;
    skills: AggregatedDynamicSkill[];
  };

  /** Cross-skill comparison and rankings. */
  comparison: Comparison;

  /** High-level summary. */
  summary: {
    static_score: number | null;
    dynamic_pass_rate: number | null;
    total_skills_evaluated: number;
    total_dynamic_tests: number;
    average_composite_score: number | null;
    best_performer: string | null;
    worst_performer: string | null;
  };
}

// ---------------------------------------------------------------------------
// Project Configuration
// ---------------------------------------------------------------------------

/** Configuration from agent-skills-eval.config.js. */
export interface ProjectConfig {
  platforms?: string[];
  dimensions?: string[];
  security?: {
    enabled: boolean;
    checks: string[];
  };
  thresholds?: {
    passing: number;
    warning: number;
  };
  output?: {
    format?: string;
    directory?: string;
    traces?: string;
    prompts?: string;
    results?: string;
    reports?: string;
  };
  paths?: {
    rubrics?: string;
    evals?: string;
  };
  grading?: {
    enabled: boolean;
    dimensions?: string[];
    passingScore?: number;
  };
  llm?: {
    enabled?: boolean;
    provider?: string;
    baseURL?: string;
    model?: string;
    temperature?: number;
    maxTokens?: number;
    timeout?: number;
    retryAttempts?: number;
    retryDelay?: number;
    apiKey?: string;
  };
  generation?: {
    defaultSamples?: number;
    maxSamples?: number;
    templateFallback?: boolean;
  };
  runner?: {
    backend?: string;
    timeout?: number;
    backends?: Record<string, Record<string, unknown>>;
  };
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Security Validation (static)
// ---------------------------------------------------------------------------

/** Result of the comprehensive static security validation. */
export interface SecurityValidationResult {
  path: string;
  timestamp: string;
  valid: boolean;
  score: number;
  maxScore: number;
  percentage: number;
  checks: Record<string, {
    passed: boolean;
    score: number;
    maxScore: number;
    [key: string]: unknown;
  }>;
  issues: {
    critical: unknown[];
    high: unknown[];
    medium: unknown[];
    low: unknown[];
  };
  error?: string;
}

/** Result of a static security content scan. */
export interface SecurityScanResult {
  critical: unknown[];
  high: unknown[];
  medium: unknown[];
  low: unknown[];
  passed: boolean;
}

// ---------------------------------------------------------------------------
// Resolved Paths
// ---------------------------------------------------------------------------

/** All resolved paths used by the project. */
export interface ResolvedPaths {
  output: string;
  traces: string;
  prompts: string;
  results: string;
  reports: string;
  rubrics: string;
  evals: string;
  root: string;
}
