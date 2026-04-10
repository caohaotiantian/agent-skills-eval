const { HiddenCharDetector } = require('../../../lib/validation/detectors/hidden-char');

describe('HiddenCharDetector', () => {
  let detector;
  beforeEach(() => { detector = new HiddenCharDetector(); });

  describe('zero-width characters', () => {
    it('should detect zero-width space U+200B', () => {
      const line = 'const x\u200B = 42;';
      const findings = detector.scanFile('test.js', [line]);
      expect(findings.length).toBeGreaterThan(0);
      expect(findings[0].name).toMatch(/zero-width/i);
      expect(findings[0].confidence).toBe(70);
    });

    it('should detect zero-width joiner U+200D', () => {
      const findings = detector.scanFile('test.js', ['function foo\u200D() {}']);
      expect(findings.length).toBeGreaterThan(0);
    });

    it('should allow BOM at byte 0 of file', () => {
      const findings = detector.scanFile('test.js', ['\uFEFFconst x = 1;']);
      expect(findings).toHaveLength(0);
    });

    it('should flag BOM mid-file', () => {
      const findings = detector.scanFile('test.js', ['const x = 1;', 'const y\uFEFF = 2;']);
      expect(findings.length).toBeGreaterThan(0);
    });
  });

  describe('bidi control characters', () => {
    it('should detect left-to-right override U+202D', () => {
      const findings = detector.scanFile('test.js', ['const isAdmin = false;\u202D']);
      expect(findings.length).toBeGreaterThan(0);
      expect(findings[0].name).toMatch(/bidi/i);
      expect(findings[0].confidence).toBe(90);
    });

    it('should detect right-to-left override U+202E', () => {
      const findings = detector.scanFile('test.js', ['access = "\u202Enimdaer"']);
      expect(findings.length).toBeGreaterThan(0);
    });

    it('should detect isolate chars U+2066-U+2069', () => {
      const findings = detector.scanFile('test.js', ['if (\u2066isAdmin\u2069) { grant(); }']);
      expect(findings.length).toBeGreaterThan(0);
    });
  });

  describe('homoglyphs', () => {
    it('should detect Cyrillic a (U+0430) in code files', () => {
      const findings = detector.scanFile('test.js', ['const \u0430dmin = true;']);
      expect(findings.length).toBeGreaterThan(0);
      expect(findings[0].name).toMatch(/homoglyph/i);
      expect(findings[0].category).toBe('SUPPLY_CHAIN');
    });

    it('should NOT check homoglyphs in markdown files', () => {
      const findings = detector.scanFile('README.md', ['This text has \u0430 Cyrillic character']);
      const homoglyphs = findings.filter(f => f.name.match(/homoglyph/i));
      expect(homoglyphs).toHaveLength(0);
    });
  });

  describe('clean content', () => {
    it('should return empty for normal code', () => {
      const findings = detector.scanFile('test.js', ['const x = 42;', 'function foo() { return x; }']);
      expect(findings).toHaveLength(0);
    });
  });
});
