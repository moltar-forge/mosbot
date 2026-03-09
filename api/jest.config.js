/** @type {import('jest').Config} */
module.exports = {
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  setupFiles: ['<rootDir>/test.setup.js'],
  testEnvironment: 'node',
  coveragePathIgnorePatterns: ['/node_modules/'],
  coverageThreshold: {
    global: {
      statements: 75,
      branches: 62,
      functions: 82,
      lines: 75,
    },
  },
};
