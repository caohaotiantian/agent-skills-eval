/**
 * Test for Test Case Generator
 */
const path = require('path');
const fs = require('fs-extra');

describe('Test Case Generator', () => {
  const testOutputDir = path.join(__dirname, '../fixtures/test-output');
  const testSkillPath = path.join(__dirname, '../fixtures/coding-agent');

  beforeAll(async () => {
    await fs.ensureDir(testOutputDir);
  });

  afterAll(async () => {
    await fs.remove(testOutputDir);
  });

  describe('generateTestCases', () => {
    it('should generate JSONL file from skill analysis', async () => {
      const { generateTestCases } = require('../../lib/skills/generating');
      const result = await generateTestCases({
        skillPath: testSkillPath,
        outputDir: testOutputDir,
        options: { samples: 5 }
      });

      expect(result).toHaveProperty('outputPath');
      expect(result).toHaveProperty('csvPath'); // backward compat alias
      expect(result).toHaveProperty('prompts');
      expect(result.prompts.length).toBeGreaterThan(0);

      // Verify JSONL file exists
      const fileExists = await fs.pathExists(result.outputPath);
      expect(fileExists).toBe(true);
      expect(result.outputPath).toMatch(/\.jsonl$/);
    });

    it('should generate valid JSONL format', async () => {
      const { generateTestCases } = require('../../lib/skills/generating');
      const result = await generateTestCases({
        skillPath: testSkillPath,
        outputDir: testOutputDir,
        options: { samples: 3 }
      });

      const content = await fs.readFile(result.outputPath, 'utf-8');
      const lines = content.trim().split('\n');

      // Each line should be valid JSON
      expect(lines.length).toBeGreaterThan(0);
      for (const line of lines) {
        const parsed = JSON.parse(line);
        expect(parsed).toHaveProperty('id');
        expect(parsed).toHaveProperty('should_trigger');
        expect(parsed).toHaveProperty('prompt');
      }
    });

    it('should include expected properties in prompts', async () => {
      const { generateTestCases } = require('../../lib/skills/generating');
      const result = await generateTestCases({
        skillPath: testSkillPath,
        outputDir: testOutputDir,
        options: { samples: 5 }
      });

      expect(result.prompts.length).toBeGreaterThan(0);
      
      const prompt = result.prompts[0];
      expect(prompt).toHaveProperty('id');
      expect(prompt).toHaveProperty('should_trigger');
      expect(prompt).toHaveProperty('prompt');
      expect(prompt).toHaveProperty('category');
    });
  });

  describe('generateCSV', () => {
    it('should escape quotes in prompt content', async () => {
      const { generateCSV } = require('../../lib/skills/generating');
      
      const prompts = [{
        id: 'test-001',
        should_trigger: true,
        prompt: 'Please "create" a tool for me',
        expected_tools: 'bash',
        category: 'positive',
        security_focus: ''
      }];
      
      const csv = generateCSV(prompts);
      expect(csv).toContain('""create""');  // Escaped quotes
    });
  });

  describe('generateMultiple', () => {
    it('should generate test cases for multiple skills', async () => {
      const { generateMultiple } = require('../../lib/skills/generating');
      
      const results = await generateMultiple(
        [testSkillPath],
        { outputDir: testOutputDir, options: { samples: 3 } }
      );

      expect(results.length).toBe(1);
      expect(results[0].prompts.length).toBeGreaterThan(0);
    });
  });
});
