/**
 * Skill Discovery Module
 * Discovers installed skills across different agent platforms
 */

const fs = require('fs-extra');
const path = require('path');
const glob = require('glob');
const chalk = require('chalk');

const PLATFORMS = {
  'claude-code': {
    name: 'Claude Code',
    pluginsPath: '~/.claude/plugins/',
    skillsPattern: '*/SKILL.md',
    metadataFile: '.claude-plugin/plugin.json'
  },
  'opencode': {
    name: 'OpenCode',
    pluginsPath: '~/.claude-code/plugins/',
    skillsPattern: '*/skills/*/SKILL.md',
    metadataFile: 'plugin.json'
  },
  'openclaw': {
    name: 'OpenClaw',
    pluginsPath: '~/.npm-global/lib/node_modules/openclaw/skills/',
    skillsPattern: '*/SKILL.md',
    metadataFile: 'SKILL.md'
  }
};

/**
 * Discover all skills across platforms
 */
async function discoverAll(options = {}) {
  const { platform = 'all' } = options;
  const results = {
    timestamp: new Date().toISOString(),
    platforms: {}
  };

  const platformsToCheck = platform === 'all' 
    ? Object.keys(PLATFORMS) 
    : [platform];

  for (const platformId of platformsToCheck) {
    try {
      const platformConfig = PLATFORMS[platformId];
      const expandedPath = path.expandHomeDir(platformConfig.pluginsPath);
      
      if (await fs.pathExists(expandedPath)) {
        const skills = await discoverPlatformSkills(platformId, platformConfig, expandedPath);
        results.platforms[platformId] = {
          name: platformConfig.name,
          path: expandedPath,
          skillsCount: skills.length,
          skills
        };
      } else {
        results.platforms[platformId] = {
          name: platformConfig.name,
          path: expandedPath,
          skillsCount: 0,
          skills: [],
          warning: 'Platform path does not exist'
        };
      }
    } catch (error) {
      results.platforms[platformId] = {
        name: PLATFORMS[platformId].name,
        error: error.message
      };
    }
  }

  // Calculate total skills
  results.totalSkills = Object.values(results.platforms).reduce(
    (sum, p) => sum + (p.skillsCount || 0), 
    0
  );

  return results;
}

/**
 * Discover skills for a specific platform
 */
async function discoverPlatformSkills(platformId, config, basePath) {
  const skills = [];
  
  // Find all skill directories
  const skillDirs = await fs.readdir(basePath);
  
  for (const dir of skillDirs) {
    const skillPath = path.join(basePath, dir);
    
    // Skip non-directory entries
    if (!(await fs.stat(skillPath)).isDirectory()) {
      continue;
    }
    
    // Check for SKILL.md
    const skillMdPath = path.join(skillPath, 'SKILL.md');
    const hasSkillMd = await fs.pathExists(skillMdPath);
    
    // Check for .claude-plugin metadata
    const metadataPath = path.join(skillPath, '.claude-plugin', 'plugin.json');
    const hasMetadata = await fs.pathExists(metadataPath);
    
    // Check for plugin.json (OpenCode style)
    const opencodeMetadataPath = path.join(skillPath, 'plugin.json');
    const hasOpencodeMetadata = await fs.pathExists(opencodeMetadataPath);
    
    if (hasSkillMd || hasMetadata || hasOpencodeMetadata) {
      const skill = await parseSkillMetadata(skillPath, dir, {
        hasSkillMd,
        hasMetadata,
        hasOpencodeMetadata
      });
      skills.push(skill);
    }
  }
  
  return skills;
}

/**
 * Parse skill metadata from various sources
 */
async function parseSkillMetadata(skillPath, skillId, options) {
  const skill = {
    id: skillId,
    path: skillPath,
    platform: 'unknown'
  };
  
  // Try to read SKILL.md for description and metadata
  if (options.hasSkillMd) {
    try {
      const content = await fs.readFile(path.join(skillPath, 'SKILL.md'), 'utf-8');
      const frontmatter = extractFrontmatter(content);
      
      if (frontmatter) {
        skill.name = frontmatter.name || skillId;
        skill.description = frontmatter.description || '';
        skill.location = frontmatter.location || '';
      } else {
        // Parse from content
        const lines = content.split('\n');
        skill.name = lines[0].replace(/^#\s*/, '').trim();
        skill.description = lines.find(l => l.startsWith('<location>:'))?.trim() || '';
      }
    } catch (e) {
      // Ignore read errors
    }
  }
  
  // Read .claude-plugin/plugin.json
  if (options.hasMetadata) {
    try {
      const metadata = await fs.readJson(path.join(skillPath, '.claude-plugin', 'plugin.json'));
      skill.platform = 'claude-code';
      skill.name = skill.name || metadata.name || skillId;
      skill.description = skill.description || metadata.description || '';
      skill.version = metadata.version;
      skill.author = metadata.author?.name;
      skill.repository = metadata.repository;
    } catch (e) {
      // Ignore
    }
  }
  
  // Read plugin.json (OpenCode style)
  if (options.hasOpencodeMetadata) {
    try {
      const metadata = await fs.readJson(path.join(skillPath, 'plugin.json'));
      skill.platform = 'opencode';
      skill.name = skill.name || metadata.name || skillId;
      skill.description = skill.description || metadata.description || '';
    } catch (e) {
      // Ignore
    }
  }
  
  // Detect platform from path
  if (skillPath.includes('.claude/plugins/')) {
    skill.platform = 'claude-code';
  } else if (skillPath.includes('.claude-code/plugins/')) {
    skill.platform = 'opencode';
  } else if (skillPath.includes('openclaw/skills/')) {
    skill.platform = 'openclaw';
  }
  
  return skill;
}

/**
 * Extract YAML frontmatter from markdown
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
    console.log(chalk.gray(`   Path: ${platformData.path}`));
    
    if (platformData.skills) {
      console.log(chalk.gray(`   Skills: ${platformData.skillsCount}`));
      
      for (const skill of platformData.skills) {
        console.log(chalk.white(`   ├── ${skill.name || skill.id}`));
        if (skill.description) {
          console.log(chalk.gray(`   │   └── ${skill.description.substring(0, 60)}...`));
        }
      }
    }
    
    if (platformData.warning) {
      console.log(chalk.yellow(`   ⚠️  ${platformData.warning}`));
    }
  }
  
  console.log(chalk.cyan('\n═'.repeat(60)));
}

module.exports = {
  discoverAll,
  discoverPlatformSkills,
  parseSkillMetadata,
  displaySkills,
  PLATFORMS
};

// Helper for path expansion
path.expandHomeDir = (p) => {
  if (p.startsWith('~')) {
    return path.join(require('os').homedir(), p.slice(1));
  }
  return p;
};
