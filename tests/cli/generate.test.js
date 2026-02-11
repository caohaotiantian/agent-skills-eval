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
        expect(stdout).toContain('Generate test cases');
        expect(stdout).toContain('--output');
        expect(stdout).toContain('--samples');
        done();
      });
    });

    it('should generate test cases for a skill', (done) => {
      const testOutputDir = path.join(__dirname, '../fixtures/cli-output/test-skill');
      
      exec(`node bin/cli.js generate coding-agent --output ${testOutputDir} --samples 3`, async (err, stdout, stderr) => {
        expect(err).toBeNull();
        expect(stdout).toContain('Generated');

        // Verify output file exists
        const csvPath = path.join(testOutputDir, 'coding-agent.csv');
        const exists = await fs.pathExists(csvPath);
        expect(exists).toBe(true);
        done();
      });
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
