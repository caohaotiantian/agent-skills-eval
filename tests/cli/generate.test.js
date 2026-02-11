/**
 * Test for CLI generate command
 */
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs-extra');

describe('CLI generate command', () => {
  const outputDir = path.join(__dirname, '../fixtures/cli-output');

  beforeAll(async () => {
    await fs.ensureDir(outputDir);
  });

  afterAll(async () => {
    await fs.remove(outputDir);
  });

  describe('generate <skill>', () => {
    it('should show help for generate command', (done) => {
      exec('node bin/cli.js generate --help', (err, stdout, stderr) => {
        expect(err).toBeNull();
        expect(stdout).toContain('Auto-generate test cases');
        expect(stdout).toContain('--output');
        expect(stdout).toContain('--samples');
        done();
      });
    });

    it('should generate test cases for a skill using fixture path', async () => {
      const testOutputDir = path.join(__dirname, '../fixtures/cli-output/test-skill');
      const fixturePath = path.join(__dirname, '../fixtures/coding-agent');

      await fs.ensureDir(testOutputDir);

      const { execSync } = require('child_process');
      const stdout = execSync(`node bin/cli.js generate ${fixturePath} --output ${testOutputDir} --samples 3`, { encoding: 'utf8' });

      expect(stdout).toContain('Generated');

      // Verify output file exists
      const csvPath = path.join(testOutputDir, 'coding-agent.csv');
      const exists = await fs.pathExists(csvPath);
      expect(exists).toBe(true);
    }, 30000);
  });

  describe('generate-all', () => {
    it('should show help for generate-all command', (done) => {
      exec('node bin/cli.js generate-all --help', (err, stdout, stderr) => {
        expect(err).toBeNull();
        expect(stdout).toContain('Generate test cases for all');
        expect(stdout).toContain('--output');
        expect(stdout).toContain('--platform');
        done();
      });
    });
  });
});
