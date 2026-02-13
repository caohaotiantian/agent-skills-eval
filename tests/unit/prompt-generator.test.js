const {
  generateTestPrompts,
  generateTriggerVariation,
  generateDescriptionPrompt,
  generateNegativePrompt,
  generateSecurityPrompt,
  inferExpectedTools,
  isLLMEnabled,
  generateWithLLM,
  generateTestPromptsWithLLM,
  _resetConfigCache,
  PROMPT_CONFIG,
  TRIGGER_SYNONYMS
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

      const prompts = await generateTestPrompts(skillAnalysis);

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

      const prompts = await generateTestPrompts(skillAnalysis);
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

      const prompts = await generateTestPrompts(skillAnalysis);
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

      const prompts = await generateTestPrompts(skillAnalysis);
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

      const prompts = await generateTestPrompts(skillAnalysis);
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
      const v15 = generateTriggerVariation(trigger, description, 15);

      // With 15 variations, index 15 wraps back to index 0
      expect(v0).toBe(v15);
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

describe('LLM-based Prompt Generation', () => {
  const skillAnalysis = {
    name: 'coding-agent',
    description: 'Create CLI tools, scripts, and applications',
    availableSkills: [{
      name: 'create-cli',
      triggers: ['create tool', 'new cli'],
      description: 'Create a new CLI application'
    }]
  };

  describe('isLLMEnabled', () => {
    it('should be exported as a function', () => {
      expect(typeof isLLMEnabled).toBe('function');
    });

    it('should return false when OPENAI_API_KEY is not set and no baseURL configured', () => {
      const originalKey = process.env.OPENAI_API_KEY;
      const originalBase = process.env.OPENAI_BASE_URL;
      delete process.env.OPENAI_API_KEY;
      delete process.env.OPENAI_BASE_URL;
      // Inject empty config so disk config (which has baseURL) is not loaded
      _resetConfigCache({});

      const result = isLLMEnabled();

      // Restore
      if (originalKey !== undefined) process.env.OPENAI_API_KEY = originalKey;
      if (originalBase !== undefined) process.env.OPENAI_BASE_URL = originalBase;
      _resetConfigCache();

      // Without API key and without baseURL, isLLMEnabled should be false
      expect(result).toBeFalsy();
    });

    it('should return truthy value when OPENAI_API_KEY is set', () => {
      // Save original value
      const originalKey = process.env.OPENAI_API_KEY;
      process.env.OPENAI_API_KEY = 'test-key';

      const result = isLLMEnabled();

      // Restore original value
      if (originalKey !== undefined) {
        process.env.OPENAI_API_KEY = originalKey;
      } else {
        delete process.env.OPENAI_API_KEY;
      }

      expect(result).toBeTruthy();
    });
  });

  describe('generateWithLLM', () => {
    it('should be exported as a function', () => {
      expect(typeof generateWithLLM).toBe('function');
    });

    it('should throw error when LLM is not enabled (no key, no baseURL)', async () => {
      const originalKey = process.env.OPENAI_API_KEY;
      const originalBase = process.env.OPENAI_BASE_URL;
      delete process.env.OPENAI_API_KEY;
      delete process.env.OPENAI_BASE_URL;
      _resetConfigCache({});

      await expect(generateWithLLM(skillAnalysis, 'positive', 2))
        .rejects.toThrow('LLM generation is not enabled');

      if (originalKey !== undefined) process.env.OPENAI_API_KEY = originalKey;
      if (originalBase !== undefined) process.env.OPENAI_BASE_URL = originalBase;
      _resetConfigCache();
    });
  });

  describe('generateTestPromptsWithLLM', () => {
    it('should be exported as a function', () => {
      expect(typeof generateTestPromptsWithLLM).toBe('function');
    });

    it('should throw when LLM is not enabled (no key, no baseURL)', async () => {
      const llmSkillAnalysis = {
        name: 'coding-agent',
        description: 'Create CLI tools',
        availableSkills: [{
          name: 'create-cli',
          triggers: ['create tool'],
          description: 'Create a new CLI application'
        }]
      };

      const originalKey = process.env.OPENAI_API_KEY;
      const originalBase = process.env.OPENAI_BASE_URL;
      delete process.env.OPENAI_API_KEY;
      delete process.env.OPENAI_BASE_URL;
      _resetConfigCache({});

      await expect(generateTestPromptsWithLLM(llmSkillAnalysis))
        .rejects.toThrow('LLM generation is not enabled');

      if (originalKey !== undefined) process.env.OPENAI_API_KEY = originalKey;
      if (originalBase !== undefined) process.env.OPENAI_BASE_URL = originalBase;
      _resetConfigCache();
    });

    it('should throw error when useLLM is false', async () => {
      const llmSkillAnalysis = {
        name: 'coding-agent',
        description: 'Create CLI tools',
        availableSkills: [{
          name: 'create-cli',
          triggers: ['create tool'],
          description: 'Create a new CLI application'
        }]
      };

      const originalKey = process.env.OPENAI_API_KEY;
      delete process.env.OPENAI_API_KEY;
      _resetConfigCache();

      await expect(generateTestPromptsWithLLM(llmSkillAnalysis, { useLLM: false }))
        .rejects.toThrow('LLM generation is not enabled');

      if (originalKey !== undefined) process.env.OPENAI_API_KEY = originalKey;
      _resetConfigCache();
    });
  });

  describe('generateTestPrompts with LLM option', () => {
    const testSkillAnalysis = {
      name: 'coding-agent',
      description: 'Create CLI tools',
      availableSkills: [{
        name: 'create-cli',
        triggers: ['create tool'],
        description: 'Create a new CLI application'
      }]
    };

    it('should use template-based generation when useLLM is false', async () => {
      const prompts = await generateTestPrompts(testSkillAnalysis, { useLLM: false });

      expect(prompts).toBeInstanceOf(Array);
      expect(prompts.length).toBeGreaterThan(0);
    });

    it('should return Promise when useLLM option is provided', async () => {
      const prompts = await generateTestPrompts(testSkillAnalysis, { useLLM: false });

      expect(prompts).toBeInstanceOf(Array);
    });

    it('should use template-based when useLLM is true but LLM not available', async () => {
      // Save original values
      const originalKey = process.env.OPENAI_API_KEY;
      const originalBase = process.env.OPENAI_BASE_URL;
      delete process.env.OPENAI_API_KEY;
      delete process.env.OPENAI_BASE_URL;
      _resetConfigCache({});

      // With no API key and no baseURL, generateTestPrompts should fall back to template-based
      const prompts = await generateTestPrompts(testSkillAnalysis, { useLLM: true });

      expect(prompts).toBeInstanceOf(Array);
      expect(prompts.length).toBeGreaterThan(0);

      // Restore original values
      if (originalKey !== undefined) process.env.OPENAI_API_KEY = originalKey;
      if (originalBase !== undefined) process.env.OPENAI_BASE_URL = originalBase;
      _resetConfigCache();
    });
  });

  describe('Exports and Constants', () => {
    it('should export generateWithLLM function', () => {
      const { generateWithLLM: gg } = require('../../lib/skills/generating/prompt-generator');
      expect(typeof gg).toBe('function');
    });

    it('should export generateTestPromptsWithLLM function', () => {
      const { generateTestPromptsWithLLM: gtpwllm } = require('../../lib/skills/generating/prompt-generator');
      expect(typeof gtpwllm).toBe('function');
    });

    it('should export isLLMEnabled function', () => {
      const { isLLMEnabled: ile } = require('../../lib/skills/generating/prompt-generator');
      expect(typeof ile).toBe('function');
    });

    it('should export PROMPT_CONFIG constant', () => {
      const { PROMPT_CONFIG } = require('../../lib/skills/generating/prompt-generator');
      expect(PROMPT_CONFIG).toBeDefined();
      expect(PROMPT_CONFIG.positivePerTrigger).toBe(2);
      expect(PROMPT_CONFIG.negativePerSkill).toBe(3);
      expect(PROMPT_CONFIG.securityPerSkill).toBe(2);
      expect(PROMPT_CONFIG.descriptionCases).toBe(2);
    });

    it('should export TRIGGER_SYNONYMS constant', () => {
      const { TRIGGER_SYNONYMS } = require('../../lib/skills/generating/prompt-generator');
      expect(TRIGGER_SYNONYMS).toBeDefined();
      expect(TRIGGER_SYNONYMS.create).toEqual(['make', 'build', 'develop', 'write', 'generate']);
      expect(TRIGGER_SYNONYMS['new']).toEqual(['fresh', 'initialize', 'setup', 'initiate']);
    });
  });
});
