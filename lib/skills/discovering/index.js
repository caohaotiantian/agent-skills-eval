/**
 * Skill Discovery Module
 * Discovers installed skills across different agent platforms
 * 
 * Claude Code skills are organized in 3 tiers:
 *   1. Personal skills:  ~/.claude/skills/<name>/SKILL.md
 *   2. Project skills:   .claude/skills/<name>/SKILL.md
 *   3. Plugin skills:    ~/.claude/plugins/cache/<marketplace>/<plugin>/<ver>/skills/<name>/SKILL.md
 */

const fs = require('fs-extra');
const path = require('path');
const glob = require('glob');
const chalk = require('chalk');
const os = require('os');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Expand ~ to the user's home directory
 */
function expandHome(p) {
  if (p.startsWith('~')) {
    return path.join(os.homedir(), p.slice(1));
  }
  return p;
}

/**
 * Extract YAML frontmatter from markdown content
 */
function extractFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]+?)\n---/);
  if (match) {
    try {
      const yaml = require('js-yaml');
      return yaml.load(match[1]);
    } catch (e) {
      return null;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Platform definitions
// ---------------------------------------------------------------------------

const PLATFORMS = {
  'claude-code': {
    name: 'Claude Code',
    // Claude Code has three separate skill sources; handled by dedicated logic.
    sources: {
      personal: '~/.claude/skills/',
      plugins:  '~/.claude/plugins/',
      // project is resolved relative to CWD at runtime
      project:  '.claude/skills/'
    }
  },
  'opencode': {
    name: 'OpenCode',
    pluginsPath: '~/.claude-code/plugins/',
    skillsPattern: '**/skills/*/SKILL.md',
    metadataFile: 'plugin.json'
  },
  'openclaw': {
    name: 'OpenClaw',
    pluginsPath: '~/.npm-global/lib/node_modules/openclaw/skills/',
    skillsPattern: '*/SKILL.md',
    metadataFile: 'SKILL.md'
  }
};

// ---------------------------------------------------------------------------
// Core discovery
// ---------------------------------------------------------------------------

/**
 * Discover all skills across platforms
 */
async function discoverAll(options = {}) {
  const { platform = 'all', cwd = process.cwd() } = options;
  const results = {
    timestamp: new Date().toISOString(),
    platforms: {}
  };

  const platformsToCheck = platform === 'all'
    ? Object.keys(PLATFORMS)
    : [platform];

  for (const platformId of platformsToCheck) {
    try {
      if (platformId === 'claude-code') {
        results.platforms[platformId] = await discoverClaudeCode(cwd);
      } else {
        results.platforms[platformId] = await discoverGenericPlatform(platformId);
      }
    } catch (error) {
      results.platforms[platformId] = {
        name: (PLATFORMS[platformId] || {}).name || platformId,
        error: error.message,
        skillsCount: 0,
        skills: []
      };
    }
  }

  // Calculate totals
  results.totalSkills = Object.values(results.platforms).reduce(
    (sum, p) => sum + (p.skillsCount || 0),
    0
  );

  return results;
}

// ---------------------------------------------------------------------------
// Claude Code discovery  (the main fix)
// ---------------------------------------------------------------------------

/**
 * Discover Claude Code skills from all 3 tiers
 */
async function discoverClaudeCode(cwd) {
  const sources = PLATFORMS['claude-code'].sources;
  const allSkills = [];

  // ---- 1. Personal skills: ~/.claude/skills/<name>/SKILL.md ----
  const personalPath = expandHome(sources.personal);
  const personalSkills = await discoverSkillsInDir(personalPath, 'personal');
  allSkills.push(...personalSkills);

  // ---- 2. Project skills: <cwd>/.claude/skills/<name>/SKILL.md ----
  const projectPath = path.resolve(cwd, sources.project);
  const projectSkills = await discoverSkillsInDir(projectPath, 'project');
  allSkills.push(...projectSkills);

  // ---- 3. Plugin skills (via installed_plugins.json + cache scan) ----
  const pluginsBase = expandHome(sources.plugins);
  const pluginSkills = await discoverClaudePluginSkills(pluginsBase);
  allSkills.push(...pluginSkills);

  return {
    name: 'Claude Code',
    path: expandHome('~/.claude/'),
    skillsCount: allSkills.length,
    skills: allSkills,
    breakdown: {
      personal: personalSkills.length,
      project: projectSkills.length,
      plugin: pluginSkills.length
    }
  };
}

/**
 * Discover simple skills in a flat directory (personal / project skills)
 * Expected structure: <dir>/<skill-name>/SKILL.md
 */
async function discoverSkillsInDir(dir, source) {
  const skills = [];
  if (!(await fs.pathExists(dir))) return skills;

  let entries;
  try {
    entries = await fs.readdir(dir);
  } catch {
    return skills;
  }

  for (const entry of entries) {
    const entryPath = path.join(dir, entry);
    try {
      if (!(await fs.stat(entryPath)).isDirectory()) continue;
    } catch {
      continue;
    }

    const skillMdPath = path.join(entryPath, 'SKILL.md');
    if (await fs.pathExists(skillMdPath)) {
      const skill = await parseSkillMd(skillMdPath, entry);
      skill.source = source;
      skill.platform = 'claude-code';
      skills.push(skill);
    }
  }

  return skills;
}

/**
 * Discover skills that come from Claude Code plugins.
 *
 * Strategy:
 *   1. Read installed_plugins.json to get precise install paths.
 *   2. Fall back to scanning ~/.claude/plugins/cache/ recursively.
 *   3. In each plugin directory look for  skills/<name>/SKILL.md
 */
async function discoverClaudePluginSkills(pluginsBase) {
  const skills = [];
  const visitedPluginDirs = new Set();

  // --- Strategy 1: Use installed_plugins.json ---
  const installedPath = path.join(pluginsBase, 'installed_plugins.json');
  if (await fs.pathExists(installedPath)) {
    try {
      const installed = await fs.readJson(installedPath);
      const plugins = installed.plugins || {};

      for (const [pluginKey, installs] of Object.entries(plugins)) {
        const installList = Array.isArray(installs) ? installs : [installs];
        for (const install of installList) {
          const installDir = install.installPath;
          if (!installDir || !(await fs.pathExists(installDir))) continue;
          visitedPluginDirs.add(installDir);

          // Read plugin metadata
          const pluginMeta = await readPluginJson(installDir);

          // Find skills inside this plugin
          const skillsDir = path.join(installDir, 'skills');
          if (await fs.pathExists(skillsDir)) {
            const found = await discoverSkillsInDir(skillsDir, 'plugin');
            for (const s of found) {
              s.pluginName = pluginMeta.name || pluginKey;
              s.pluginVersion = install.version || pluginMeta.version;
              s.marketplace = pluginKey.split('@')[1] || '';
              skills.push(s);
            }
          }
        }
      }
    } catch {
      // installed_plugins.json was unreadable – fall through to cache scan
    }
  }

  // --- Strategy 2: Scan cache directory for any plugins not in installed_plugins.json ---
  const cachePath = path.join(pluginsBase, 'cache');
  if (await fs.pathExists(cachePath)) {
    const cacheSkills = await scanCacheDir(cachePath, visitedPluginDirs);
    skills.push(...cacheSkills);
  }

  return skills;
}

/**
 * Recursively scan the cache directory.
 * Structure: cache/<marketplace>/<plugin>/<version>/skills/<skill>/SKILL.md
 *
 * We walk the tree to find directories that contain a `skills/` sub-directory
 * (or `.claude-plugin/plugin.json`), then extract skills from them.
 */
async function scanCacheDir(cachePath, visitedDirs) {
  const skills = [];

  // cache/<marketplace>/
  const marketplaces = await safeReaddir(cachePath);
  for (const marketplace of marketplaces) {
    const marketplacePath = path.join(cachePath, marketplace);
    if (!(await isDir(marketplacePath))) continue;

    // cache/<marketplace>/<plugin>/
    const pluginNames = await safeReaddir(marketplacePath);
    for (const pluginName of pluginNames) {
      const pluginPath = path.join(marketplacePath, pluginName);
      if (!(await isDir(pluginPath))) continue;

      // cache/<marketplace>/<plugin>/<version>/
      const versions = await safeReaddir(pluginPath);
      for (const version of versions) {
        const versionPath = path.join(pluginPath, version);
        if (!(await isDir(versionPath))) continue;

        // Skip if already visited via installed_plugins.json
        if (visitedDirs.has(versionPath)) continue;

        const pluginMeta = await readPluginJson(versionPath);

        const skillsDir = path.join(versionPath, 'skills');
        if (await fs.pathExists(skillsDir)) {
          const found = await discoverSkillsInDir(skillsDir, 'plugin');
          for (const s of found) {
            s.pluginName = pluginMeta.name || pluginName;
            s.pluginVersion = version;
            s.marketplace = marketplace;
            skills.push(s);
          }
        }
      }
    }
  }

  return skills;
}

// ---------------------------------------------------------------------------
// Generic platform discovery (OpenCode, OpenClaw, etc.)
// ---------------------------------------------------------------------------

async function discoverGenericPlatform(platformId) {
  const config = PLATFORMS[platformId];
  if (!config || !config.pluginsPath) {
    return {
      name: (config || {}).name || platformId,
      path: '',
      skillsCount: 0,
      skills: [],
      warning: 'Platform configuration incomplete'
    };
  }

  const expandedPath = expandHome(config.pluginsPath);

  if (!(await fs.pathExists(expandedPath))) {
    return {
      name: config.name,
      path: expandedPath,
      skillsCount: 0,
      skills: [],
      warning: 'Platform path does not exist'
    };
  }

  const skills = await discoverPlatformSkills(platformId, config, expandedPath);
  return {
    name: config.name,
    path: expandedPath,
    skillsCount: skills.length,
    skills
  };
}

/**
 * Generic platform skill discovery using glob patterns
 */
async function discoverPlatformSkills(platformId, config, basePath) {
  const skills = [];
  const pattern = path.join(basePath, config.skillsPattern || '*/SKILL.md');

  let files;
  try {
    files = glob.sync(pattern);
  } catch {
    files = [];
  }

  for (const filePath of files) {
    const skillDir = path.dirname(filePath);
    const skillId = path.basename(skillDir);
    const skill = await parseSkillMd(filePath, skillId);
    skill.platform = platformId;
    skill.source = 'plugin';
    skills.push(skill);
  }

  // If glob found nothing, fall back to directory walk
  if (skills.length === 0) {
    const entries = await safeReaddir(basePath);
    for (const entry of entries) {
      const entryPath = path.join(basePath, entry);
      if (!(await isDir(entryPath))) continue;

      const skillMdPath = path.join(entryPath, 'SKILL.md');
      if (await fs.pathExists(skillMdPath)) {
        const skill = await parseSkillMd(skillMdPath, entry);
        skill.platform = platformId;
        skill.source = 'plugin';
        skills.push(skill);
      }
    }
  }

  return skills;
}

// ---------------------------------------------------------------------------
// Parsing helpers
// ---------------------------------------------------------------------------

/**
 * Parse metadata from a SKILL.md file
 */
async function parseSkillMd(filePath, fallbackId) {
  const skill = {
    id: fallbackId,
    path: path.dirname(filePath)
  };

  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const fm = extractFrontmatter(content);

    if (fm) {
      skill.name = fm.name || fallbackId;
      skill.description = fm.description || '';
      skill.allowedTools = fm['allowed-tools'] || '';
    } else {
      // Try to extract name from first heading
      const lines = content.split('\n');
      const heading = lines.find(l => l.startsWith('#'));
      skill.name = heading ? heading.replace(/^#+\s*/, '').trim() : fallbackId;
      skill.description = '';
    }
  } catch {
    skill.name = fallbackId;
    skill.description = '';
  }

  return skill;
}

/**
 * Read .claude-plugin/plugin.json from a plugin directory
 */
async function readPluginJson(pluginDir) {
  const jsonPath = path.join(pluginDir, '.claude-plugin', 'plugin.json');
  try {
    if (await fs.pathExists(jsonPath)) {
      return await fs.readJson(jsonPath);
    }
  } catch {
    // ignore
  }
  return {};
}

// ---------------------------------------------------------------------------
// Utility helpers
// ---------------------------------------------------------------------------

async function safeReaddir(dir) {
  try {
    return await fs.readdir(dir);
  } catch {
    return [];
  }
}

async function isDir(p) {
  try {
    return (await fs.stat(p)).isDirectory();
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Display
// ---------------------------------------------------------------------------

/**
 * Display discovered skills in a formatted way
 */
function displaySkills(results) {
  console.log(chalk.blue('\n🔍 Agent Skills Discovery Results\n'));
  console.log(chalk.gray(`Timestamp: ${results.timestamp}`));
  console.log(chalk.gray(`Total Skills Found: ${results.totalSkills}\n`));

  console.log(chalk.cyan('═'.repeat(60)));

  for (const [platformId, platformData] of Object.entries(results.platforms)) {
    console.log(chalk.green(`\n📦 ${platformData.name} (${platformId})`));
    console.log(chalk.gray(`   Path: ${platformData.path || 'N/A'}`));

    if (platformData.error) {
      console.log(chalk.red(`   ❌ Error: ${platformData.error}`));
      continue;
    }

    if (platformData.warning) {
      console.log(chalk.yellow(`   ⚠️  ${platformData.warning}`));
    }

    console.log(chalk.gray(`   Skills: ${platformData.skillsCount}`));

    // Show breakdown for Claude Code
    if (platformData.breakdown) {
      const b = platformData.breakdown;
      console.log(chalk.gray(`   Breakdown: personal=${b.personal}, project=${b.project}, plugin=${b.plugin}`));
    }

    if (platformData.skills && platformData.skills.length > 0) {
      // Group skills by source
      const groups = {};
      for (const skill of platformData.skills) {
        const src = skill.source || 'unknown';
        if (!groups[src]) groups[src] = [];
        groups[src].push(skill);
      }

      for (const [source, skills] of Object.entries(groups)) {
        const sourceLabel = {
          personal: '👤 Personal Skills',
          project: '📁 Project Skills',
          plugin: '🔌 Plugin Skills'
        }[source] || `📦 ${source}`;

        console.log(chalk.white(`\n   ${sourceLabel} (${skills.length}):`));

        for (const skill of skills) {
          const nameStr = skill.name || skill.id;
          const pluginTag = skill.pluginName
            ? chalk.gray(` [${skill.pluginName}@${skill.pluginVersion || '?'}]`)
            : '';
          console.log(chalk.white(`   ├── ${nameStr}${pluginTag}`));
          if (skill.description) {
            const desc = skill.description.length > 70
              ? skill.description.substring(0, 70) + '...'
              : skill.description;
            console.log(chalk.gray(`   │   └── ${desc}`));
          }
        }
      }
    }
  }

  console.log(chalk.cyan('\n' + '═'.repeat(60)));
}

// ---------------------------------------------------------------------------
// Convenience helpers
// ---------------------------------------------------------------------------

/**
 * Extract a flat array of ALL skills from a discovery result,
 * aggregating across every platform.
 *
 * @param {object} discoveryResult - The object returned by discoverAll()
 * @returns {Array} All skills with their platform info attached
 */
function getAllSkills(discoveryResult) {
  const skills = [];
  if (!discoveryResult || !discoveryResult.platforms) return skills;

  for (const [platformId, platformData] of Object.entries(discoveryResult.platforms)) {
    if (Array.isArray(platformData.skills)) {
      for (const skill of platformData.skills) {
        // Ensure platform is set on each skill
        if (!skill.platform) skill.platform = platformId;
        skills.push(skill);
      }
    }
  }
  return skills;
}

/**
 * Find a single skill by name (or id) across all platforms.
 *
 * @param {object} discoveryResult - The object returned by discoverAll()
 * @param {string} nameOrId - The skill name or id to search for
 * @returns {object|null} The matching skill, or null
 */
function findSkill(discoveryResult, nameOrId) {
  const all = getAllSkills(discoveryResult);
  const lower = nameOrId.toLowerCase();
  return all.find(s =>
    (s.name && s.name.toLowerCase() === lower) ||
    (s.id && s.id.toLowerCase() === lower)
  ) || null;
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  discoverAll,
  discoverClaudeCode,
  discoverSkillsInDir,
  discoverClaudePluginSkills,
  discoverPlatformSkills,
  parseSkillMd,
  displaySkills,
  getAllSkills,
  findSkill,
  PLATFORMS,
  expandHome
};
