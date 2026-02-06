export default {
    displayName: 'carbon',
    testEnvironment: 'node',
    transform: {
        '^.+\\.[tj]s$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.spec.json' }]
    },
    moduleFileExtensions: ['ts', 'js', 'json'],
    moduleNameMapper: {
        '^bun:sqlite$': '<rootDir>/src/__mocks__/bun-sqlite.ts',
        '^(\\.{1,2}/.*)\\.js$': '$1'
    }
};
