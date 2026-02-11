const path = require('path');
const { analyzeSkill } = require('../../lib/skills/generating/analyzer');

describe('Skill Analyzer', () => {
  describe('analyzeSkill', () => {
    it('should extract basic skill info from SKILL.md', async () => {
      const skillPath = path.join(__dirname, '../fixtures/coding-agent');
      const result = await analyzeSkill(skillPath);

      expect(result.name).toBe('coding-agent');
      expect(result.description).toBeDefined();
      expect(result.frontmatter).toBeDefined();
    });

    it('should extract available skills with triggers', async () => {
      const skillPath = path.join(__dirname, '../fixtures/coding-agent');
      const result = await analyzeSkill(skillPath);

      expect(result.availableSkills).toBeInstanceOf(Array);
      expect(result.availableSkills[0]).toHaveProperty('name');
      expect(result.availableSkills[0]).toHaveProperty('triggers');
      expect(result.availableSkills[0]).toHaveProperty('description');
    });

    it('should extract implementation patterns', async () => {
      const skillPath = path.join(__dirname, '../fixtures/coding-agent');
      const result = await analyzeSkill(skillPath);

      expect(result.implementation).toHaveProperty('tools');
      expect(result.implementation).toHaveProperty('fileOperations');
      expect(result.implementation).toHaveProperty('securityPatterns');
    });
  });
});
