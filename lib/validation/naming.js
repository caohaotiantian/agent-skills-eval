/**
 * Naming Convention Validation Module
 */

const VALID_NAME_PATTERN = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;

function validateSkillName(name) {
  const errors = [], warnings = [];
  if (typeof name !== 'string') {
    errors.push('Name must be a string');
    return { valid: false, errors, warnings };
  }
  const trimmed = name.trim();
  if (!trimmed) errors.push('Name cannot be empty');
  if (trimmed.length > 64) errors.push(`Name too long (${trimmed.length} > 64)`);
  if (!VALID_NAME_PATTERN.test(trimmed)) errors.push('Name must be kebab-case');
  if (trimmed.includes('--')) errors.push('No consecutive hyphens');
  if (/-$/.test(trimmed)) errors.push('Cannot end with hyphen');
  return { valid: errors.length === 0, errors, warnings };
}

function validateSkillId(id) {
  return validateSkillName(id);
}

function validateDescription(desc, minLen = 1, maxLen = 1024) {
  const errors = [], warnings = [];
  if (typeof desc !== 'string') {
    errors.push('Description must be a string');
    return { valid: false, errors, warnings };
  }
  const trimmed = desc.trim();
  if (trimmed.length < minLen) errors.push(`Description too short (< ${minLen})`);
  if (trimmed.length > maxLen) errors.push(`Description too long (> ${maxLen})`);
  if (trimmed.length > 0 && trimmed.length < 10) warnings.push('Very short description');
  return { valid: errors.length === 0, errors, warnings };
}

function validateTriggers(triggers) {
  const errors = [], warnings = [];
  if (!Array.isArray(triggers)) {
    errors.push('Triggers must be an array');
    return { valid: false, errors, warnings };
  }
  if (triggers.length === 0) errors.push('Triggers cannot be empty');
  triggers.forEach((t, i) => {
    if (typeof t !== 'string') errors.push(`Trigger ${i} must be string`);
    else if (!t.trim()) errors.push(`Trigger ${i} cannot be empty`);
  });
  const unique = new Set(triggers);
  if (unique.size !== triggers.length) warnings.push('Duplicate triggers');
  return { valid: errors.length === 0, errors, warnings };
}

module.exports = { validateSkillName, validateSkillId, validateDescription, validateTriggers, VALID_NAME_PATTERN };
