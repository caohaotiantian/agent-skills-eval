/**
 * Trace Parser Module
 * Parses JSONL trace events
 */

const fs = require('fs-extra');
const readline = require('readline');

const EVENT_TYPES = {
  TOOL_CALL: 'tool_call',
  TOOL_RESULT: 'tool_result',
  MESSAGE: 'message',
  THOUGHT: 'thought',
  SYSTEM: 'system',
  ERROR: 'error',
  COMPLETION: 'completion'
};

function parseLine(line) {
  if (!line?.trim()) return null;
  try {
    return JSON.parse(line);
  } catch (e) {
    return { type: 'parse_error', raw: line, error: e.message };
  }
}

async function parseJsonlFile(filepath) {
  const events = [];
  if (!(await fs.pathExists(filepath))) return events;
  const fileStream = fs.createReadStream(filepath);
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });
  for await (const line of rl) {
    const event = parseLine(line);
    if (event) events.push(event);
  }
  return events;
}

function parseJsonlString(content) {
  return content.split('\n').map(parseLine).filter(Boolean);
}

function getTimeline(events) {
  return [...events].sort((a, b) => 
    new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );
}

function calculateDuration(events) {
  const timeline = getTimeline(events);
  if (timeline.length < 2) return null;
  const start = new Date(timeline[0].timestamp).getTime();
  const end = new Date(timeline[timeline.length - 1].timestamp).getTime();
  return end - start;
}

function extractToolCalls(events) {
  return events.filter(e => e.type === EVENT_TYPES.TOOL_CALL || e.tool || e.name);
}

function extractErrors(events) {
  return events.filter(e => e.type === EVENT_TYPES.ERROR || e.error || e.status === 'error');
}

function countByType(events) {
  const counts = {};
  events.forEach(e => { counts[e.type] = (counts[e.type] || 0) + 1; });
  return counts;
}

module.exports = {
  EVENT_TYPES, parseLine, parseJsonlFile, parseJsonlString,
  getTimeline, calculateDuration, extractToolCalls, extractErrors, countByType
};
