const { buildGradingPrompt, parseGradingResponse } = require('../../lib/grading/llm-judge');

describe('llm-judge', () => {
  describe('buildGradingPrompt', () => {
    it('should produce a structured grading prompt', () => {
      const prompt = buildGradingPrompt({
        testPrompt: 'Create a hello world script',
        skillDescription: 'Helps create scripts',
        agentResponse: 'I created hello.js with console.log("Hello")',
        toolCalls: [{ tool: 'Write', input: { path: 'hello.js' } }]
      });
      expect(prompt).toContain('Create a hello world script');
      expect(prompt).toContain('hello.js');
    });
  });

  describe('parseGradingResponse', () => {
    it('should parse valid JSON grading', () => {
      const response = JSON.stringify({
        correctness: 8, helpfulness: 9, adherence: 7,
        reasoning: 'Good response', overall: 8
      });
      const result = parseGradingResponse(response);
      expect(result.correctness).toBe(8);
      expect(result.overall).toBe(8);
      expect(result.error).toBeNull();
    });

    it('should handle malformed JSON', () => {
      const result = parseGradingResponse('not json');
      expect(result.error).toBeTruthy();
    });

    it('should extract JSON from markdown code block', () => {
      const response = '```json\n{"correctness": 7, "helpfulness": 8, "adherence": 6, "reasoning": "ok", "overall": 7}\n```';
      const result = parseGradingResponse(response);
      expect(result.correctness).toBe(7);
    });

    it('should clamp values to 1-10 range', () => {
      const response = JSON.stringify({
        correctness: 15, helpfulness: 0, adherence: -3, reasoning: 'test', overall: 20
      });
      const result = parseGradingResponse(response);
      expect(result.correctness).toBe(10);
      expect(result.helpfulness).toBe(1);
      expect(result.adherence).toBe(1);
      expect(result.overall).toBe(10);
    });
  });
});
