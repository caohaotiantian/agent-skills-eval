/**
 * LLM-powered rewriter for static suggestion templates.
 *
 * One LLM call per skill batches all failing criteria into a single prompt.
 * The LLM receives the actual SKILL.md content and a list of generic
 * suggestion templates, and rewrites each to be specific to this skill.
 *
 * Failure modes (LLM unavailable, timeout, JSON parse error) silently
 * return {} — caller keeps the static suggestion.
 */

const fs = require('fs-extra');
const path = require('path');
const crypto = require('crypto');

let _OpenAI = null;
function getOpenAI() {
  if (_OpenAI === null) {
    try {
      const mod = require('openai');
      _OpenAI = mod.default || mod.OpenAI || mod;
    } catch { _OpenAI = false; }
  }
  return _OpenAI || null;
}

const MAX_SKILL_CONTENT_CHARS = 3000;
const MAX_SUGGESTION_CHARS = 500;

function buildBatchPrompt(skillName, skillContent, failingCriteria) {
  const truncated = (skillContent || '').substring(0, MAX_SKILL_CONTENT_CHARS);
  const issues = failingCriteria.map((f, i) =>
    `[${i + 1}] criterion: ${f.criterionId}\n` +
    `    Why it failed: ${f.reasoning || ''}\n` +
    `    Generic suggestion: ${f.suggestion || ''}`
  ).join('\n');

  return `You are reviewing a skill named "${skillName}". Below is its SKILL.md content, followed by N issues each with a generic suggestion template. Rewrite each suggestion to be *specific* to this skill's actual content. Reference exact lines, fields, or text from SKILL.md. Keep each rewritten suggestion to 1-3 sentences. Output JSON only, no prose:
{ "<criterionId>": "<rewritten suggestion>", ... }

=== SKILL.md ===
${truncated}

=== Issues ===
${issues}`;
}

function parseRewrittenJson(response) {
  try {
    const match = response.match(/\{[\s\S]*\}/);
    if (!match) return {};
    const parsed = JSON.parse(match[0]);
    if (typeof parsed !== 'object' || parsed === null) return {};
    const out = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v === 'string') {
        out[k] = v.length > MAX_SUGGESTION_CHARS ? v.substring(0, MAX_SUGGESTION_CHARS) : v;
      }
    }
    return out;
  } catch {
    return {};
  }
}

async function rewriteSuggestions({ skillName, skillContent, failingCriteria, llmConfig = {} }) {
  if (!failingCriteria || failingCriteria.length === 0) return {};

  const OpenAI = getOpenAI();
  if (!OpenAI) return {};

  const apiKey = process.env.OPENAI_API_KEY || llmConfig.apiKey || 'no-key';
  const baseURL = process.env.OPENAI_BASE_URL || llmConfig.baseURL;
  const model = process.env.OPENAI_MODEL || llmConfig.model || 'gpt-4o';

  const clientOpts = { apiKey };
  if (baseURL) clientOpts.baseURL = baseURL;
  const client = new OpenAI(clientOpts);

  const prompt = buildBatchPrompt(skillName, skillContent, failingCriteria);

  try {
    const response = await client.chat.completions.create({
      model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      max_tokens: 2000
    });
    const content = response.choices?.[0]?.message?.content || '';
    return parseRewrittenJson(content);
  } catch {
    return {};
  }
}

module.exports = {
  buildBatchPrompt,
  parseRewrittenJson,
  rewriteSuggestions,
  // exported for testing
  MAX_SKILL_CONTENT_CHARS,
  MAX_SUGGESTION_CHARS
};
