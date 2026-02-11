module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.test.js'],
  collectCoverageFrom: [
    'lib/**/*.js',
    '!lib/**/index.js'
  ],
  verbose: true,
  testPathIgnorePatterns: ['/node_modules/']
};
