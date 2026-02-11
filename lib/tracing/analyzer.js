/**
 * Trace Analyzer Module
 * Analyzes trace events for insights and metrics
 */

const { EVENT_TYPES, getTimeline, extractToolCalls, extractErrors, countByType, calculateDuration } = require('./parser');

class TraceAnalyzer {
  constructor(traceId) {
    this.traceId = traceId;
    this.timestamp = new Date().toISOString();
    this.metrics = {};
    this.commandSequence = [];
    this.errors = [];
    this.performance = {};
    this.determinism = { isDeterministic: true, factors: [], recommendations: [] };
  }

  analyze(events) {
    if (!events?.length) {
      this.metrics.eventCount = 0;
      return this;
    }

    const timeline = getTimeline(events);
    this.metrics.eventCount = events.length;
    this.metrics.eventTypeCounts = countByType(events);
    this.metrics.duration = calculateDuration(events);

    const toolCalls = extractToolCalls(events);
    this.commandSequence = this.extractCommandSequence(toolCalls);
    this.errors = extractErrors(events);
    this.metrics.errorCount = this.errors.length;

    this.analyzePerformance(events, toolCalls);
    this.analyzeDeterminism(events);

    return this;
  }

  extractCommandSequence(toolCalls) {
    return toolCalls.map(call => ({
      id: call.id,
      timestamp: call.timestamp,
      command: call.input?.command || call.args?.command || String(call),
      status: call.status || 'success',
      duration: call.duration || null
    })).filter(c => c.command);
  }

  analyzePerformance(events, toolCalls) {
    let inputTokens = 0, outputTokens = 0;
    toolCalls.forEach(c => {
      if (c.metadata?.tokens) {
        inputTokens += c.metadata.tokens.input || 0;
        outputTokens += c.metadata.tokens.output || 0;
      }
    });

    this.performance = {
      totalEvents: events.length,
      toolCallCount: toolCalls.length,
      duration: this.metrics.duration,
      tokens: { input: inputTokens, output: outputTokens, total: inputTokens + outputTokens }
    };
  }

  analyzeDeterminism(events) {
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

    this.determinism = {
      isDeterministic: factors.length === 0,
      factors,
      recommendations: factors.map(f => `Review: ${f.description}`)
    };
  }

  getCommandCount() {
    return this.commandSequence.length;
  }

  hasCommand(pattern) {
    const regex = typeof pattern === 'string' ? new RegExp(pattern) : pattern;
    return this.commandSequence.some(c => regex.test(c.command));
  }

  fileCreated(path) {
    return this.commandSequence.some(c => c.command.includes(`touch ${path}`) || c.command.includes(`create ${path}`));
  }

  generateReport() {
    const errorCount = this.errors.length;
    const thrashing = this.detectThrashing();
    
    return {
      commandCount: this.commandSequence.length,
      errorCount,
      efficiencyScore: Math.max(0, 100 - errorCount * 10),
      thrashing,
      performance: this.performance,
      determinism: this.determinism,
      createdFiles: this.extractCreatedFiles(),
      tokenUsage: this.performance.tokens
    };
  }

  detectThrashing() {
    if (this.commandSequence.length < 4) return { isThrashing: false, reason: 'Not enough commands' };
    
    let sameCommandStreak = 0;
    let maxStreak = 0;
    let thrashingCommand = null;
    
    for (let i = 1; i < this.commandSequence.length; i++) {
      if (this.commandSequence[i].command === this.commandSequence[i-1].command) {
        sameCommandStreak++;
        if (sameCommandStreak > maxStreak) {
          maxStreak = sameCommandStreak;
          thrashingCommand = this.commandSequence[i].command;
        }
      } else {
        sameCommandStreak = 0;
      }
    }
    
    return {
      isThrashing: maxStreak >= 3,
      command: thrashingCommand,
      streak: maxStreak,
      reason: maxStreak >= 3 ? `Same command executed ${maxStreak + 1} times` : 'No thrashing detected'
    };
  }

  extractCreatedFiles() {
    const files = [];
    this.commandSequence.forEach(c => {
      const match = c.command.match(/create|touch|write|echo.*>/);
      if (match) files.push(c.command);
    });
    return files;
  }
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

module.exports = { TraceAnalyzer, compareTraces };
