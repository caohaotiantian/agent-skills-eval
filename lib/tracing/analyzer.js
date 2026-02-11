/**
 * Trace Analyzer Module
 * Analyzes trace events for insights and metrics
 */

const { EVENT_TYPES, getTimeline, extractToolCalls, extractErrors, countByType, calculateDuration } = require('./parser');

class TraceAnalysis {
  constructor(traceId) {
    this.traceId = traceId;
    this.timestamp = new Date().toISOString();
    this.metrics = {};
    this.commandSequence = [];
    this.errors = [];
    this.performance = {};
    this.determinism = { isDeterministic: true, factors: [], recommendations: [] };
  }

  toJSON() {
    return {
      traceId: this.traceId, timestamp: this.timestamp,
      metrics: this.metrics, commandSequence: this.commandSequence,
      errors: this.errors, performance: this.performance,
      determinism: this.determinism
    };
  }
}

function analyzeTrace(events, options = {}) {
  const analysis = new TraceAnalysis(options.traceId);
  if (!events?.length) {
    analysis.metrics.eventCount = 0;
    return analysis;
  }

  const timeline = getTimeline(events);
  analysis.metrics.eventCount = events.length;
  analysis.metrics.eventTypeCounts = countByType(events);
  analysis.metrics.duration = calculateDuration(events);

  const toolCalls = extractToolCalls(events);
  analysis.commandSequence = extractCommandSequence(toolCalls);
  analysis.errors = extractErrors(events);
  analysis.metrics.errorCount = analysis.errors.length;

  analyzePerformance(analysis, events, toolCalls);
  analyzeDeterminism(analysis, events);

  return analysis;
}

function extractCommandSequence(toolCalls) {
  return toolCalls.map(call => ({
    id: call.id,
    timestamp: call.timestamp,
    command: call.input?.command || call.args?.command || String(call),
    status: call.status || 'success',
    duration: call.duration || null
  })).filter(c => c.command);
}

function analyzePerformance(analysis, events, toolCalls) {
  let inputTokens = 0, outputTokens = 0;
  toolCalls.forEach(c => {
    if (c.metadata?.tokens) {
      inputTokens += c.metadata.tokens.input || 0;
      outputTokens += c.metadata.tokens.output || 0;
    }
  });

  analysis.performance = {
    totalEvents: events.length,
    toolCallCount: toolCalls.length,
    duration: analysis.metrics.duration,
    tokens: { input: inputTokens, output: outputTokens, total: inputTokens + outputTokens }
  };
}

function analyzeDeterminism(analysis, events) {
  const factors = [];
  events.forEach(e => {
    const content = JSON.stringify(e).toLowerCase();
    if (content.includes('random') || content.includes('shuffle')) {
      factors.push({ type: 'random', description: 'Random operation detected' });
    }
    if (content.includes('date') || content.includes('time')) {
      factors.push({ type: 'time', description: 'Time-dependent operation' });
    }
  });

  analysis.determinism = {
    isDeterministic: factors.length === 0,
    factors,
    recommendations: factors.map(f => `Review: ${f.description}`)
  };
}

function compareTraces(trace1, trace2) {
  const seq1 = extractCommandSequence(extractToolCalls(trace1));
  const seq2 = extractCommandSequence(extractToolCalls(trace2));
  const cmds1 = seq1.map(c => c.command);
  const cmds2 = seq2.map(c => c.command);
  
  let matches = 0;
  const maxLen = Math.max(cmds1.length, cmds2.length);
  for (let i = 0; i < maxLen; i++) {
    if (cmds1[i] === cmds2[i]) matches++;
  }
  
  const similarity = maxLen > 0 ? (matches / maxLen) * 100 : 100;
  return {
    similarity: `${similarity.toFixed(1)}%`,
    isConsistent: similarity >= 95,
    trace1Length: cmds1.length,
    trace2Length: cmds2.length
  };
}

module.exports = { TraceAnalysis, analyzeTrace, extractCommandSequence, compareTraces };
