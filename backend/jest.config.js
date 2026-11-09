module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  // rootDir points to the root of your source code
  rootDir: 'src', 
  testRegex: '.*\\.spec\\.ts$',
  // Red-team probes assert desired behaviour and fail until fixed; run them with `npm run test:redteam`.
  testPathIgnorePatterns: ['/node_modules/', '/__redteam__/'],
  transform: {
    '^.+\\.(t|j)s$': 'ts-jest',
  },
  collectCoverageFrom: ['**/*.(t|j)s'],
  coverageDirectory: '../coverage',
  testEnvironment: 'node',
  // This matches your tsconfig paths
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
};