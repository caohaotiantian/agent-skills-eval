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
  COMPLETION: 'completion',
  THREAD_STARTED: 'thread.started',
  TURN_STARTED: 'turn.started',
  TURN_FAILED: 'turn.failed'
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

function getEventType(event) {
  return event?.type || event?.event_type || 'unknown';
}

function isToolCall(event) {
  const type = getEventType(event);
  return type === EVENT_TYPES.TOOL_CALL || 
         type === 'tool_call' ||
         event?.tool || 
         event?.name ||
         type === 'command_execution';
}

function isError(event) {
  const type = getEventType(event);
  return type === EVENT_TYPES.ERROR || 
         type === 'error' ||
         type === 'turn.failed' ||
         event?.error ||
         event?.status === 'error';
}

function getTimeline(events) {
  return [...events].sort((a, b) => 
    new Date(a.timestamp || a.created_at).getTime() - new Date(b.timestamp || b.created_at).getTime()
  );
}

function calculateDuration(events) {
  const timeline = getTimeline(events);
  if (timeline.length < 2) return null;
  const start = new Date(timeline[0].timestamp || timeline[0].created_at).getTime();
  const end = new Date(timeline[timeline.length - 1].timestamp || timeline[timeline.length - 1].created_at).getTime();
  return end - start;
}

function extractToolCalls(events) {
  return events.filter(isToolCall);
}

function extractErrors(events) {
  return events.filter(isError);
}

function countByType(events) {
  const counts = {};
  events.forEach(e => {
    const type = getEventType(e);
    counts[type] = (counts[type] || 0) + 1;
  });
  return counts;
}

module.exports = {
  EVENT_TYPES, 
  parseLine, 
  parseJsonlFile, 
  parseJsonlString,
  getTimeline, 
  calculateDuration, 
  extractToolCalls, 
  extractErrors, 
  countByType,
  getEventType,
  isToolCall,
  isError
};
