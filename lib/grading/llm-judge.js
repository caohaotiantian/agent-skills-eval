/**
 * LLM-as-Judge Grading Module
 * Sends agent traces to an LLM for quality evaluation.
 */

let _OpenAI = null;
function getOpenAI() {
  if (_OpenAI === null) {
    try { _OpenAI = require('openai'); } catch { _OpenAI = false; }
  }
  return _OpenAI || null;
}

function buildGradingPrompt({ testPrompt, skillDescription, agentResponse, toolCalls }) {
  const toolSummary = (toolCalls || [])
    .map(tc => `- ${tc.tool}(${JSON.stringify(tc.input || {}).substring(0, 200)})`)
    .join('\n');

  return `You are an expert evaluator grading an AI coding agent's response to a task.

## Task Given to Agent
${testPrompt}

## Skill Context
${skillDescription || 'No skill description available'}

## Agent's Tool Calls
${toolSummary || 'None'}

## Agent's Response
${agentResponse || 'No response content'}

## Grading Instructions
Rate the agent's response on these dimensions (1-10 scale):

1. **correctness** - Did the agent produce correct output for the task?
2. **helpfulness** - Was the response useful and complete?
3. **adherence** - Did the agent follow the skill's instructions properly?

Respond with ONLY a JSON object:
{"correctness": <1-10>, "helpfulness": <1-10>, "adherence": <1-10>, "reasoning": "<brief explanation>", "overall": <1-10>}`;
}

function parseGradingResponse(response) {
  try {
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return { error: 'No JSON found in response' };
    const parsed = JSON.parse(jsonMatch[0]);
    return {
      correctness: Math.min(10, Math.max(1, parsed.correctness || 0)),
      helpfulness: Math.min(10, Math.max(1, parsed.helpfulness || 0)),
      adherence: Math.min(10, Math.max(1, parsed.adherence || 0)),
      reasoning: parsed.reasoning || '',
      overall: Math.min(10, Math.max(1, parsed.overall || 0)),
      error: null
    };
  } catch (e) {
    return { error: `Failed to parse grading: ${e.message}` };
  }
}

async function gradeWithLLM({ testPrompt, skillDescription, agentResponse, toolCalls, llmConfig = {} }) {
  const OpenAI = getOpenAI();
  if (!OpenAI) {
    return { error: 'openai package not installed', skipped: true };
  }

  const apiKey = process.env.OPENAI_API_KEY || llmConfig.apiKey || 'no-key';
  const baseURL = process.env.OPENAI_BASE_URL || llmConfig.baseURL;
  const model = process.env.OPENAI_MODEL || llmConfig.model || 'gpt-4o';

  const clientOpts = { apiKey };
  if (baseURL) clientOpts.baseURL = baseURL;

  const client = new OpenAI(clientOpts);
  const prompt = buildGradingPrompt({ testPrompt, skillDescription, agentResponse, toolCalls });

  try {
    const response = await client.chat.completions.create({
      model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      max_tokens: 500
    });
    const content = response.choices?.[0]?.message?.content || '';
    return parseGradingResponse(content);
  } catch (err) {
    return { error: `LLM grading failed: ${err.message}` };
  }
}

module.exports = { buildGradingPrompt, parseGradingResponse, gradeWithLLM };
