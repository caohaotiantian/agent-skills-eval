const path = require('path');
const fs = require('fs-extra');
const { validateSkill } = require('../../lib/validation');

describe('name-matches-directory validation', () => {
  it('should warn when name does not match parent directory', async () => {
    const tmpDir = path.join(__dirname, 'tmp-mismatch-skill');
    await fs.ensureDir(tmpDir);
    await fs.writeFile(path.join(tmpDir, 'SKILL.md'), '---\nname: different-name\ndescription: A test skill for validation testing\n---\n# Test\nSome content here.');
    try {
      const report = await validateSkill(tmpDir);
      expect(report.warnings).toEqual(
        expect.arrayContaining([expect.stringContaining('does not match')])
      );
    } finally {
      await fs.remove(tmpDir);
    }
  });

  it('should not warn when name matches parent directory', async () => {
    const tmpDir = path.join(__dirname, 'tmp-matching-skill');
    await fs.ensureDir(tmpDir);
    await fs.writeFile(path.join(tmpDir, 'SKILL.md'), '---\nname: tmp-matching-skill\ndescription: A test skill for validation testing\n---\n# Test\nSome content here.');
    try {
      const report = await validateSkill(tmpDir);
      const nameWarnings = (report.warnings || []).filter(w => w.includes('does not match'));
      expect(nameWarnings).toHaveLength(0);
    } finally {
      await fs.remove(tmpDir);
    }
  });
});
