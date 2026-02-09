module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  // rootDir points to the root of your source code
  rootDir: 'src', 
  testRegex: '.*\\.spec\\.ts$',
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