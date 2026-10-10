/** @type {import('jest').Config} */
const base = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  transform: { '^.+\\.ts$': ['ts-jest', { tsconfig: 'tsconfig.json' }] },
  testEnvironment: 'node',
};

module.exports = {
  testTimeout: 30000,
  // Les suites e2e partagent la même base de test : jamais en parallèle.
  maxWorkers: 1,
  projects: [
    { ...base, displayName: 'unit', rootDir: 'src', testRegex: '.*\\.spec\\.ts$' },
    {
      ...base,
      displayName: 'e2e',
      rootDir: 'test',
      testRegex: '.*\\.e2e-spec\\.ts$',
      setupFiles: ['<rootDir>/setup-env.ts'],
      globalSetup: '<rootDir>/global-setup.ts',
    },
  ],
};
