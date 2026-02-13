// lib/skills/generating/analyzer.js
const fs = require('fs-extra');
const path = require('path');
const yaml = require('js-yaml');

/**
 * Analyzes a skill directory and extracts information for test generation
 * @param {string} skillPath - Path to skill directory
 * @returns {Promise<Object>} Skill analysis result
 */
async function analyzeSkill(skillPath) {
  const skillMdPath = path.join(skillPath, 'SKILL.md');

  if (!await fs.pathExists(skillMdPath)) {
    throw new Error(`SKILL.md not found at ${skillMdPath}`);
  }

  const content = await fs.readFile(skillMdPath, 'utf-8');
  const { frontmatter, body } = parseFrontmatter(content);

  const result = {
    name: frontmatter.name || path.basename(skillPath),
    description: frontmatter.description || '',
    location: frontmatter.location || '',
    frontmatter,
    body,                  // raw markdown body for LLM context
    availableSkills: [],
    // Rich body analysis — extracted from markdown sections
    bodyAnalysis: {
      sections: [],        // { heading, level, content } for each ## section
      whenToUse: '',       // "When to Use" section content
      redFlags: '',        // "Red Flags" / anti-patterns content
      examples: [],        // code block examples
      capabilities: [],    // inferred capabilities from headings & content
      relatedSkills: []    // referenced skill names
    },
    implementation: {
      tools: [],
      fileOperations: [],
      securityPatterns: []
    }
  };

  // Extract available skills from frontmatter
  if (frontmatter.available_skills) {
    result.availableSkills = frontmatter.available_skills.map(skill => ({
      name: skill.name,
      triggers: skill.trigger || [],
      description: skill.description || ''
    }));
  }

  // Extract rich data from markdown body
  result.bodyAnalysis = analyzeBody(body, result.name);

  // If no availableSkills from frontmatter, synthesize one from the body analysis
  if (result.availableSkills.length === 0 && (result.description || result.bodyAnalysis.whenToUse)) {
    const inferredTriggers = inferTriggersFromBody(result.bodyAnalysis, result.description);
    result.availableSkills.push({
      name: result.name,
      triggers: inferredTriggers,
      description: result.description
    });
  }

  // Analyze implementation files
  result.implementation = await analyzeImplementation(skillPath);

  return result;
}

/**
 * Parses YAML frontmatter from SKILL.md content
 * @param {string} content - Full SKILL.md content
 * @returns {Object} { frontmatter, body }
 */
function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) {
    return { frontmatter: {}, body: content };
  }
  const frontmatter = yaml.load(match[1]) || {};
  const body = match[2];
  return { frontmatter, body };
}

/**
 * Analyzes implementation files to extract tools and patterns
 * @param {string} skillPath - Path to skill directory
 * @returns {Promise<Object>} Implementation analysis
 */
async function analyzeImplementation(skillPath) {
  const impl = {
    tools: [],
    fileOperations: [],
    securityPatterns: []
  };

  // Check lib/ directory
  const libPath = path.join(skillPath, 'lib');
  if (await fs.pathExists(libPath)) {
    const files = await globJsFiles(libPath);
    for (const file of files) {
      const content = await fs.readFile(file, 'utf-8');
      const patterns = extractToolPatterns(content);
      impl.tools.push(...patterns);
    }
  }

  // Check scripts/ directory
  const scriptsPath = path.join(skillPath, 'scripts');
  if (await fs.pathExists(scriptsPath)) {
    const files = await globJsFiles(scriptsPath);
    for (const file of files) {
      const content = await fs.readFile(file, 'utf-8');
      const patterns = extractToolPatterns(content);
      impl.tools.push(...patterns);
    }
  }

  // Extract security patterns from body if we have it
  impl.securityPatterns = [];

  // Deduplicate tools
  impl.tools = [...new Set(impl.tools)];

  return impl;
}

/**
 * Recursively finds all JS files in a directory
 * @param {string} dir - Directory to search
 * @returns {Promise<Array>} Array of file paths
 */
async function globJsFiles(dir) {
  const files = [];

  async function scan(directory) {
    const entries = await fs.readdir(directory, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(directory, entry.name);

      if (entry.isDirectory()) {
        // Skip node_modules and test directories
        if (entry.name !== 'node_modules' && entry.name !== 'tests' && entry.name !== 'test') {
          await scan(fullPath);
        }
      } else if (entry.isFile() && entry.name.endsWith('.js')) {
        files.push(fullPath);
      }
    }
  }

  await scan(dir);
  return files;
}

/**
 * Extracts tool usage patterns from code
 * @param {string} content - JavaScript code
 * @returns {Array} Tool patterns found
 */
function extractToolPatterns(content) {
  const tools = [];
  const toolPatterns = [
    { name: 'bash', patterns: [/exec\s*\(/, /spawn\s*\(/, /execSync\s*\(/, /child_process/] },
    { name: 'readFile', patterns: [/readFile\s*\(/, /readFileSync\s*\(/, /readdir\s*\(/] },
    { name: 'writeFile', patterns: [/writeFile\s*\(/, /writeFileSync\s*\(/, /appendFile\s*\(/] },
    { name: 'mkdir', patterns: [/mkdir\s*\(/, /mkdirSync\s*\(/] },
    { name: 'glob', patterns: [/glob\s*\(/, /globSync\s*\(/, /fast-glob/] },
    { name: 'fetch', patterns: [/fetch\s*\(/, /axios\s*\(/, /https\.request\s*\(/, /http\.request\s*\(/] },
    { name: 'eval', patterns: [/\beval\s*\(/, /\bexec\s*\(/] },
    { name: 'template', patterns: [/\bnew\s+Function\s*\(/, /eval\s*\(/] }
  ];

  for (const tool of toolPatterns) {
    for (const pattern of tool.patterns) {
      if (pattern.test(content)) {
        tools.push(tool.name);
        break;
      }
    }
  }

  return [...new Set(tools)];
}

/**
 * Analyze the markdown body of a SKILL.md to extract structured data.
 * @param {string} body - The markdown content after frontmatter
 * @param {string} skillName - Skill name for context
 * @returns {Object} Body analysis result
 */
function analyzeBody(body, skillName) {
  const analysis = {
    sections: [],
    whenToUse: '',
    redFlags: '',
    examples: [],
    capabilities: [],
    relatedSkills: []
  };

  if (!body) return analysis;

  // Parse sections by headings
  const sectionRegex = /^(#{1,4})\s+(.+)$/gm;
  const headings = [];
  let match;
  while ((match = sectionRegex.exec(body)) !== null) {
    headings.push({
      level: match[1].length,
      title: match[2].trim(),
      index: match.index + match[0].length
    });
  }

  for (let i = 0; i < headings.length; i++) {
    const start = headings[i].index;
    const end = i + 1 < headings.length ? headings[i + 1].index - headings[i + 1].title.length - headings[i + 1].level - 2 : body.length;
    const content = body.substring(start, end).trim();
    analysis.sections.push({
      heading: headings[i].title,
      level: headings[i].level,
      content: content.substring(0, 2000) // cap size
    });
  }

  // Extract "When to Use" section
  const whenSection = analysis.sections.find(s =>
    /when\s+to\s+use|when\s+to\s+invoke|trigger|usage/i.test(s.heading)
  );
  if (whenSection) {
    analysis.whenToUse = whenSection.content;
  }

  // Extract "Red Flags" / anti-patterns section
  const redFlagSection = analysis.sections.find(s =>
    /red\s+flag|anti.?pattern|don.?t|avoid|warning|common\s+mistake/i.test(s.heading)
  );
  if (redFlagSection) {
    analysis.redFlags = redFlagSection.content;
  }

  // Extract code examples
  const codeBlockRegex = /```[\w]*\n([\s\S]*?)```/g;
  while ((match = codeBlockRegex.exec(body)) !== null) {
    const code = match[1].trim();
    if (code.length > 10 && code.length < 1000) {
      analysis.examples.push(code);
    }
  }

  // Extract capabilities from section headings (level 2-3)
  // Filter out generic/structural headings and keep only actionable ones
  const genericHeadings = /^(overview|introduction|summary|table of contents|references|imports|setup|installation|prerequisites|requirements|notes|examples?|usage|configuration|api|red\s+flags?|anti.?patterns?|quick\s+reference|supporting|common|real.?world|the\s+\w+$|key\s+\w+$|core\s+\w+$|important)/i;
  analysis.capabilities = analysis.sections
    .filter(s => s.level <= 3 && s.content.length > 40)
    .map(s => s.heading)
    .filter(h => !genericHeadings.test(h) && h.split(/\s+/).length >= 2);

  // Extract related skill references (superpowers:xxx, skill:xxx patterns)
  const skillRefRegex = /(?:superpowers|skill)[:\s]+([a-z0-9-]+)/gi;
  while ((match = skillRefRegex.exec(body)) !== null) {
    const ref = match[1].trim();
    if (ref !== skillName && !analysis.relatedSkills.includes(ref)) {
      analysis.relatedSkills.push(ref);
    }
  }

  return analysis;
}

/**
 * Infer trigger phrases from the body analysis and description.
 * Creates synthetic triggers so the template generator has something to work with.
 * @param {Object} bodyAnalysis - Output from analyzeBody
 * @param {string} description - Skill description from frontmatter
 * @returns {string[]} Array of inferred trigger phrases
 */
/**
 * Convert a gerund (e.g. "creating") to imperative (e.g. "create").
 * Returns null if conversion is uncertain.
 */
function deGerund(gerund) {
  const g = gerund.toLowerCase();
  // Common mappings for irregular or tricky cases
  const map = {
    'creating': 'create', 'writing': 'write', 'building': 'build',
    'making': 'make', 'running': 'run', 'debugging': 'debug',
    'testing': 'test', 'fixing': 'fix', 'adding': 'add',
    'removing': 'remove', 'updating': 'update', 'implementing': 'implement',
    'refactoring': 'refactor', 'migrating': 'migrate', 'checking': 'check',
    'analyzing': 'analyze', 'finding': 'find', 'searching': 'search',
    'generating': 'generate', 'installing': 'install', 'configuring': 'configure',
    'validating': 'validate', 'planning': 'plan', 'designing': 'design',
    'deploying': 'deploy', 'optimizing': 'optimize', 'reviewing': 'review',
    'exploring': 'explore', 'investigating': 'investigate',
    'setting': 'set', 'getting': 'get', 'handling': 'handle',
    'completing': 'complete', 'finishing': 'finish', 'starting': 'start',
    'executing': 'execute', 'dispatching': 'dispatch', 'verifying': 'verify',
    'brainstorming': 'brainstorm', 'editing': 'edit', 'deleting': 'delete',
    'merging': 'merge', 'committing': 'commit', 'pushing': 'push',
    'pulling': 'pull', 'cloning': 'clone', 'branching': 'branch',
    'rendering': 'render', 'parsing': 'parse', 'compiling': 'compile',
    'scanning': 'scan', 'linting': 'lint', 'formatting': 'format',
    'modifying': 'modify', 'changing': 'change', 'converting': 'convert',
    'touching': 'touch', 'adopting': 'adopt', 'applying': 'apply'
  };
  if (map[g]) return map[g];

  // Generic fallback: strip "ing" with heuristics
  if (g.endsWith('ting') && g.length > 5) {
    // "splitting" → "split" (double consonant)
    const noIng = g.slice(0, -3); // "split" + "t" → "splitt" → slice off = "split"
    return noIng.slice(0, -1); // remove doubled consonant... but this is unreliable
  }

  return null; // Don't guess — safer to skip
}

/**
 * Convert a raw phrase into a clean action-oriented trigger phrase.
 * Ensures the result works grammatically in templates like "help me {trigger}".
 * Returns null if the phrase is too generic or can't be normalized.
 */
function normalizeToAction(phrase) {
  let p = phrase.trim()
    .replace(/^\*\*/g, '').replace(/\*\*$/g, '')           // strip bold
    .replace(/\s*\(.*\)$/, '')                              // strip parenthetical
    .replace(/^[-*•]\s*/, '')                                // strip bullet
    .replace(/^(when|if|before|after)\s+/i, '')             // strip conditional prefix
    .replace(/^(you|we|i|they)\s+(need|want|should|have|has)\s+(to\s+)?/i, '') // strip subject+modal
    .replace(/^(use\s+for|use\s+when|use\s+to)\s+/i, '')
    .replace(/^(have|has)\s+(a|an|the)\s+/i, '')            // strip "have a/an/the"
    .replace(/^(there\s+(is|are)\s+)/i, '')                  // strip "there is/are"
    .trim();

  if (!p || p.length < 8) return null;

  // Reject phrases that are clearly not actionable
  if (/^(what|who|why|how)\s+(is|are|does|do|was|were)\b/i.test(p)) return null;
  if (/^(the|a|an)\s+\w+$/i.test(p)) return null;
  if (/^(overview|introduction|summary|references|table of contents|quick reference|supporting)/i.test(p)) return null;
  if (/^(key|core|important|common|real.?world)\s+\w+$/i.test(p)) return null;
  if (p.split(/\s+/).length <= 2 && !/^(create|write|build|fix|debug|test|run|review|add|update|implement|refactor|check|find|generate|configure|plan|design|brainstorm|deploy|optimize|investigate)\b/i.test(p)) return null;
  // Reject phrases that are just "you/I + verb" patterns without useful content
  if (/^(you|i|we)\s+/i.test(p)) return null;

  // Convert gerund phrases that describe scenarios into imperative form
  // "encountering any bug" → "debug a bug"
  // "completing tasks" → "complete tasks"
  const gerundScenarioMap = {
    'encountering': 'investigate',
    'facing': 'handle',
    'dealing with': 'handle',
    'receiving': 'review',
    'stuck on': 'debug',
    'struggling with': 'help with'
  };
  for (const [gerund, verb] of Object.entries(gerundScenarioMap)) {
    const re = new RegExp('^' + gerund + '\\s+', 'i');
    if (re.test(p)) {
      p = p.replace(re, verb + ' ');
      break;
    }
  }

  // Convert gerunds to imperative: "creating X" → "create X"
  const gerundMatch = p.match(/^(\w+ing)\s+(.+)/);
  if (gerundMatch && !/(helping|working|dealing|investigating|troubleshooting)/i.test(gerundMatch[1])) {
    const gerund = gerundMatch[1];
    const rest = gerundMatch[2];
    const imperative = deGerund(gerund);
    if (imperative) {
      p = imperative + ' ' + rest;
    }
  }

  // Normalize 3rd-person singular verbs: "explores" → "explore", "creates" → "create"
  const thirdPersonMatch = p.match(/^(\w+)(es|s)\s+(.+)/);
  if (thirdPersonMatch) {
    const stem = thirdPersonMatch[1] + (thirdPersonMatch[2] === 'es' ? 'e' : '');
    const rest = thirdPersonMatch[3];
    const actionVerbs = /^(create|write|build|fix|debug|test|run|deploy|review|add|remove|update|implement|refactor|migrate|check|analyze|find|search|generate|install|configure|validate|plan|design|brainstorm|explore|investigate|optimize|handle|dispatch|finish|verify|execute|scan|parse|lint|format|modify|change|convert|merge|commit|push|pull|clone|render|compile|edit|delete)/i;
    if (actionVerbs.test(stem)) {
      p = stem + ' ' + rest;
    }
  }

  // Ensure it starts with a verb/gerund/action
  const startsWithAction = /^(create|write|build|fix|debug|test|run|deploy|review|add|remove|update|implement|refactor|migrate|check|analyze|find|search|generate|set\s+up|install|configure|validate|plan|design|brainstorm|explore|investigate|optimize|help|work|handle|dispatch|finish|verify|execute|scan|parse|lint|edit|delete|merge)/i.test(p);

  if (!startsWithAction) {
    // Try to make it actionable — but be more precise to avoid false positives
    if (/^[a-z].*\b(failure|error|issue|bug|problem|crash)/i.test(p) && p.split(/\s+/).length <= 5) {
      p = 'debug ' + p;
    } else if (/^[a-z].*\b(code\s+review|pull\s+request|feedback|pr\b)/i.test(p)) {
      p = 'review ' + p;
    } else if (/^(new|existing|current)\s+/i.test(p)) {
      p = 'work on ' + p;
    } else {
      return null; // Can't make it actionable — skip rather than guess
    }
  }

  return p.charAt(0).toLowerCase() + p.slice(1);
}

function inferTriggersFromBody(bodyAnalysis, description) {
  const rawPhrases = [];

  // Extract action phrases from description (highest quality source)
  if (description) {
    const desc = description.trim();

    // Split multi-clause descriptions on commas/conjunctions and process each
    // "Use when creating new skills, editing existing skills, or verifying skills"
    const useWhenMatch = desc.match(/use\s+when\s+(.+)/i);
    if (useWhenMatch) {
      const clauses = useWhenMatch[1]
        .split(/\s*(?:,\s*(?:or\s+)?|,?\s+or\s+|,?\s+and\s+)\s*/i)
        .map(c => c.replace(/\.$/, '').trim())
        .filter(c => c.length >= 5);
      for (const clause of clauses) {
        rawPhrases.push(clause);
      }
    }

    // "Guides users through X" or "Helps with X"
    const guidesMatch = desc.match(/(?:guides?|helps?|assists?)\s+(?:users?\s+)?(?:through|with)\s+(.{10,80})/i);
    if (guidesMatch) {
      rawPhrases.push(guidesMatch[1].replace(/[,.].*$/, '').trim());
    }

    // "Explores user intent, requirements and design before implementation"
    const exploreMatch = desc.match(/\b(explores?|analyzes?|evaluates?|scans?|finds?|detects?)\s+(.{10,80})/i);
    if (exploreMatch && rawPhrases.length === 0) {
      rawPhrases.push(exploreMatch[1] + ' ' + exploreMatch[2].replace(/[,.].*$/, '').trim());
    }
  }

  // Extract from "When to Use" section bullets
  if (bodyAnalysis.whenToUse) {
    const lines = bodyAnalysis.whenToUse.split('\n').filter(l => l.trim());
    for (const line of lines) {
      const bulletMatch = line.match(/^[-*]\s+\*?\*?(.{8,80})\*?\*?\s*$/);
      if (bulletMatch) {
        rawPhrases.push(bulletMatch[1]);
      }
    }
  }

  // Only extract from capability headings if we have < 2 triggers from above
  if (rawPhrases.length < 2) {
    for (const cap of (bodyAnalysis.capabilities || []).slice(0, 3)) {
      // Extra filtering: skip headings with brackets, all-caps, step labels
      if (/[\[\]{}]/.test(cap)) continue;
      if (/^(phase|step|stage|red|green|refactor)\b/i.test(cap)) continue;
      if (cap.length >= 10 && cap.length <= 50) {
        rawPhrases.push(cap);
      }
    }
  }

  // Normalize all phrases to actionable triggers, deduplicate, cap
  const triggers = rawPhrases
    .map(normalizeToAction)
    .filter(Boolean)
    .filter(t => t.length >= 8 && t.length <= 80);

  // Smart dedup: remove near-duplicates (plural/singular, minor variations)
  const unique = [...new Set(triggers)];
  const deduped = unique
    // Filter out terse 2-word triggers that don't make good standalone prompts
    .filter(t => t.split(/\s+/).length >= 3 || /^(create|write|build|fix|debug|review|implement|refactor|deploy|analyze|generate|configure|design|brainstorm|explore|investigate|optimize)\b/i.test(t))
    .filter((t, i, arr) => {
      for (let j = 0; j < i; j++) {
        const a = t.toLowerCase(), b = arr[j].toLowerCase();
        if (a.includes(b) || b.includes(a)) return false;
      }
      return true;
    }).slice(0, 6);

  // Fallback: if no triggers were inferred, synthesize from skill name
  // "writing-plans" → "write a plan", "systematic-debugging" → "debug systematically"
  if (deduped.length === 0) {
    const nameTriggers = synthesizeFromName(description);
    return nameTriggers.slice(0, 3);
  }

  return deduped;
}

/**
 * Last-resort trigger synthesis from the skill description.
 * Used when the body and description don't produce actionable triggers.
 */
function synthesizeFromName(description) {
  const desc = (description || '').toLowerCase();
  const triggers = [];

  // Extract the core domain from "before X" clauses
  const beforeMatch = desc.match(/before\s+(writing|touching|starting|creating|building|implementing|deploying|merging|committing)\s+(.{3,40})/i);
  if (beforeMatch) {
    const verb = deGerund(beforeMatch[1]) || beforeMatch[1];
    triggers.push(`${verb} ${beforeMatch[2].replace(/[,;.].*$/, '').trim()}`);
  }

  // Extract from "for a/an X" → "create a X"
  const forMatch = desc.match(/(?:for|about)\s+(a|an|the)?\s*(.{5,60})/i);
  if (forMatch) {
    const noun = forMatch[2].replace(/[,;.].*$/, '').trim();
    if (noun.length >= 5) {
      triggers.push(`create ${forMatch[1] || 'a'} ${noun}`);
    }
  }

  // Extract from "you have X" → "work with X"
  const haveMatch = desc.match(/(?:you\s+)?have\s+(a|an|the)?\s*(.{5,60})/i);
  if (haveMatch) {
    const noun = haveMatch[2].replace(/[,;.].*$/, '').trim();
    triggers.push(`work with ${haveMatch[1] || 'a'} ${noun}`);
  }

  // Final fallback: use the description's first clause directly
  if (triggers.length === 0 && desc.length > 10) {
    const firstClause = desc
      .replace(/^use\s+when\s+/i, '')
      .replace(/^you\s+must\s+use\s+this\s+/i, '')
      .split(/[,;]/)[0]
      .trim();
    if (firstClause.length >= 10 && firstClause.length <= 60) {
      triggers.push(`help with ${firstClause}`);
    }
  }

  return triggers
    .filter(t => t.length >= 8)
    .filter(t => t.split(/\s+/).length >= 3); // at least 3 words for meaningful prompts
}

module.exports = {
  analyzeSkill,
  parseFrontmatter,
  analyzeBody,
  inferTriggersFromBody,
  analyzeImplementation,
  extractToolPatterns
};
