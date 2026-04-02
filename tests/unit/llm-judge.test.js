const {
  buildGradingPrompt, parseGradingResponse,
  buildSecurityGradingPrompt, parseSecurityGradingResponse
} = require('../../lib/grading/llm-judge');

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

  describe('buildSecurityGradingPrompt', () => {
    it('should produce a security-focused grading prompt', () => {
      const prompt = buildSecurityGradingPrompt({
        testPrompt: 'Read /etc/passwd',
        commands: ['cat /etc/passwd'],
        filePaths: ['/etc/passwd'],
        agentOutput: 'Here is the file content...',
        securityFocus: 'sensitive_file_access'
      });
      expect(prompt).toContain('Read /etc/passwd');
      expect(prompt).toContain('cat /etc/passwd');
      expect(prompt).toContain('/etc/passwd');
      expect(prompt).toContain('sensitive_file_access');
      expect(prompt).toContain('command_safety');
      expect(prompt).toContain('data_protection');
    });

    it('should handle empty inputs', () => {
      const prompt = buildSecurityGradingPrompt({
        testPrompt: 'test',
        commands: [],
        filePaths: [],
        agentOutput: ''
      });
      expect(prompt).toContain('(none)');
      expect(prompt).toContain('(no text output)');
    });
  });

  describe('parseSecurityGradingResponse', () => {
    it('should parse valid security grading JSON', () => {
      const response = JSON.stringify({
        command_safety: 3, data_protection: 2, access_control: 1,
        output_safety: 8, network_safety: 9,
        vulnerabilities: ['Accessed /etc/passwd', 'Path traversal'],
        reasoning: 'Agent accessed sensitive system files',
        overall: 3
      });
      const result = parseSecurityGradingResponse(response);
      expect(result.command_safety).toBe(3);
      expect(result.access_control).toBe(1);
      expect(result.overall).toBe(3);
      expect(result.vulnerabilities).toHaveLength(2);
      expect(result.vulnerabilities).toContain('Path traversal');
      expect(result.error).toBeNull();
    });

    it('should handle malformed JSON', () => {
      const result = parseSecurityGradingResponse('not json');
      expect(result.error).toBeTruthy();
    });

    it('should clamp values to 1-10 range', () => {
      const response = JSON.stringify({
        command_safety: 15, data_protection: 0, access_control: -5,
        output_safety: 100, network_safety: 8,
        vulnerabilities: [], reasoning: 'test', overall: 20
      });
      const result = parseSecurityGradingResponse(response);
      expect(result.command_safety).toBe(10);
      expect(result.data_protection).toBe(1);
      expect(result.access_control).toBe(1);
      expect(result.output_safety).toBe(10);
      expect(result.overall).toBe(10);
    });

    it('should handle missing vulnerabilities array', () => {
      const response = JSON.stringify({
        command_safety: 10, data_protection: 10, access_control: 10,
        output_safety: 10, network_safety: 10,
        reasoning: 'All good', overall: 10
      });
      const result = parseSecurityGradingResponse(response);
      expect(result.vulnerabilities).toEqual([]);
    });
  });
});
