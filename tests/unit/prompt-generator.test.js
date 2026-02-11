const {
  generateTestPrompts,
  generateTriggerVariation,
  generateDescriptionPrompt,
  generateNegativePrompt,
  generateSecurityPrompt,
  inferExpectedTools
} = require('../../lib/skills/generating/prompt-generator');

describe('Prompt Generator', () => {
  describe('generateTestPrompts', () => {
    it('should generate positive test cases from triggers', async () => {
      const skillAnalysis = {
        name: 'coding-agent',
        description: 'Create CLI tools, scripts, and applications',
        availableSkills: [{
          name: 'create-cli',
          triggers: ['create tool', 'new cli', 'build tool'],
          description: 'Create a new CLI application'
        }]
      };

      const prompts = generateTestPrompts(skillAnalysis);

      expect(prompts).toBeInstanceOf(Array);
      expect(prompts.length).toBeGreaterThan(0);

      // Check prompt structure
      const prompt = prompts[0];
      expect(prompt).toHaveProperty('id');
      expect(prompt).toHaveProperty('should_trigger', true);
      expect(prompt).toHaveProperty('prompt');
      expect(prompt).toHaveProperty('category');
    });

    it('should generate negative test cases', async () => {
      const skillAnalysis = {
        name: 'coding-agent',
        description: 'Create CLI tools, scripts, and applications',
        availableSkills: [{
          name: 'create-cli',
          triggers: ['create tool', 'new cli'],
          description: 'Create a new CLI application'
        }]
      };

      const prompts = generateTestPrompts(skillAnalysis);
      const negativePrompts = prompts.filter(p => p.should_trigger === false);

      expect(negativePrompts.length).toBeGreaterThan(0);
    });

    it('should include security-focused test cases', async () => {
      const skillAnalysis = {
        name: 'coding-agent',
        description: 'Create CLI tools',
        implementation: {
          tools: ['bash', 'writeFile', 'exec'],
          fileOperations: ['writeFile'],
          securityPatterns: []
        },
        availableSkills: [{
          name: 'create-cli',
          triggers: ['create tool'],
          description: 'Create a new CLI application'
        }]
      };

      const prompts = generateTestPrompts(skillAnalysis);
      const securityPrompts = prompts.filter(p => p.category === 'security');

      expect(securityPrompts.length).toBeGreaterThan(0);
    });

    it('should generate description-based prompts', async () => {
      const skillAnalysis = {
        name: 'coding-agent',
        description: 'Create CLI tools',
        availableSkills: [{
          name: 'create-cli',
          triggers: ['create tool'],
          description: 'Create a new CLI application'
        }]
      };

      const prompts = generateTestPrompts(skillAnalysis);
      const descriptionPrompts = prompts.filter(p => p.category === 'description');

      expect(descriptionPrompts.length).toBeGreaterThan(0);
    });

    it('should infer expected tools from skill analysis', async () => {
      const skillAnalysis = {
        name: 'coding-agent',
        description: 'Create CLI tools',
        implementation: {
          tools: ['bash', 'writeFile', 'mkdir'],
          fileOperations: ['writeFile'],
          securityPatterns: []
        },
        availableSkills: [{
          name: 'create-cli',
          triggers: ['create tool'],
          description: 'Create a new CLI application'
        }]
      };

      const prompts = generateTestPrompts(skillAnalysis);
      const positivePrompts = prompts.filter(p => p.should_trigger === true);

      expect(positivePrompts.length).toBeGreaterThan(0);
      for (const prompt of positivePrompts) {
        expect(prompt.expected_tools).toBeDefined();
      }
    });
  });

  describe('generateTriggerVariation', () => {
    it('should generate variations of trigger phrases', () => {
      const trigger = 'create tool';
      const description = 'Create a new CLI application';

      const variations = [
        generateTriggerVariation(trigger, description, 0),
        generateTriggerVariation(trigger, description, 1),
        generateTriggerVariation(trigger, description, 2)
      ];

      // Each variation should contain the trigger or be related
      expect(variations.some(v => v.toLowerCase().includes('create') || v.toLowerCase().includes('tool'))).toBe(true);
      expect(variations[0]).not.toBe(variations[1]);
    });

    it('should handle different indices cyclically', () => {
      const trigger = 'test this';
      const description = 'Run tests';

      const v0 = generateTriggerVariation(trigger, description, 0);
      const v10 = generateTriggerVariation(trigger, description, 10);

      expect(v0).toBe(v10);
    });
  });

  describe('generateDescriptionPrompt', () => {
    it('should generate prompts based on skill description', () => {
      const description = 'Create a new CLI application';

      const prompt = generateDescriptionPrompt(description, 0);

      expect(typeof prompt).toBe('string');
      expect(prompt.length).toBeGreaterThan(0);
    });
  });

  describe('generateNegativePrompt', () => {
    it('should generate prompts that should not trigger', () => {
      const skill = {
        name: 'create-cli',
        triggers: ['create tool'],
        description: 'Create a new CLI application'
      };

      const prompt = generateNegativePrompt(skill, 0);

      expect(typeof prompt).toBe('string');
      expect(prompt.length).toBeGreaterThan(0);
    });
  });

  describe('generateSecurityPrompt', () => {
    it('should generate security-focused test prompts', () => {
      const skill = {
        name: 'create-cli',
        triggers: ['create tool'],
        description: 'Create a new CLI application'
      };
      const skillAnalysis = {
        implementation: {
          tools: ['bash', 'writeFile', 'exec'],
          fileOperations: ['writeFile'],
          securityPatterns: []
        }
      };

      const securityPrompt = generateSecurityPrompt(skill, skillAnalysis, 0);

      expect(securityPrompt).toBeDefined();
      expect(securityPrompt.prompt).toBeDefined();
      expect(securityPrompt.expected_tools).toBeDefined();
      expect(securityPrompt.security_focus).toBeDefined();
    });

    it('should return null when no tools available', () => {
      const skill = {
        name: 'unknown-skill',
        triggers: ['do something'],
        description: 'Do something'
      };
      const skillAnalysis = {
        implementation: {
          tools: [],
          fileOperations: [],
          securityPatterns: []
        }
      };

      const securityPrompt = generateSecurityPrompt(skill, skillAnalysis, 0);

      expect(securityPrompt).toBeNull();
    });
  });

  describe('inferExpectedTools', () => {
    it('should infer tools from skill name mapping', () => {
      const skill = { name: 'create-cli', triggers: [], description: '' };
      const skillAnalysis = { implementation: { tools: [], fileOperations: [], securityPatterns: [] } };

      const tools = inferExpectedTools(skill, skillAnalysis);

      expect(tools).toBeInstanceOf(Array);
      expect(tools.length).toBeGreaterThan(0);
    });

    it('should fall back to implementation tools when skill not mapped', () => {
      const skill = { name: 'unknown-skill', triggers: [], description: '' };
      const skillAnalysis = {
        implementation: {
          tools: ['bash', 'writeFile'],
          fileOperations: [],
          securityPatterns: []
        }
      };

      const tools = inferExpectedTools(skill, skillAnalysis);

      expect(tools).toContain('bash');
    });
  });
});
