/**
 * eval-skill.sh usage surface.
 *
 * Business invariant: the entry-point script must advertise the backends it
 * supports — including opencode and codex — so `-b codex` / `-b opencode` are
 * discoverable to users, not just accepted silently.
 */

const path = require('path');
const { execFileSync } = require('child_process');

const SCRIPT = path.join(__dirname, '..', '..', 'eval-skill.sh');

describe('eval-skill.sh usage', () => {
  it('lists opencode and codex as accepted backends in --help', () => {
    const out = execFileSync('bash', [SCRIPT, '-h'], { encoding: 'utf8' });
    expect(out).toMatch(/-b, --backend/);
    expect(out).toMatch(/opencode/);
    expect(out).toMatch(/codex/);
  });

  it('has valid bash syntax', () => {
    // `bash -n` parses without executing; throws (non-zero exit) on a syntax error.
    expect(() => execFileSync('bash', ['-n', SCRIPT])).not.toThrow();
  });
});
