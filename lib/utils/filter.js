const { minimatch } = require('minimatch');

function filterSkills(skills, options = {}) {
  const { include = [], exclude = [] } = options;
  let result = [...skills];

  // Include filter: keep skills matching at least one include pattern
  if (include.length > 0) {
    result = result.filter(skill => {
      const name = (skill.name || '').toLowerCase();
      const id = (skill.id || '').toLowerCase();
      return include.some(pattern => {
        const p = pattern.toLowerCase();
        return minimatch(name, p) || minimatch(id, p);
      });
    });
  }

  // Exclude filter: remove skills matching any exclude pattern
  if (exclude.length > 0) {
    result = result.filter(skill => {
      const name = (skill.name || '').toLowerCase();
      const id = (skill.id || '').toLowerCase();
      return !exclude.some(pattern => {
        const p = pattern.toLowerCase();
        return minimatch(name, p) || minimatch(id, p);
      });
    });
  }

  return result;
}

module.exports = { filterSkills };
