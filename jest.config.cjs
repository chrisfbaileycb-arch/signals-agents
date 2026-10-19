module.exports = {
	preset: 'ts-jest',
	testEnvironment: 'jsdom',
	roots: ['<rootDir>/src'],
	moduleNameMapper: {
		'^lib/(.*)$': '<rootDir>/src/lib/$1',
		'^providers/(.*)$': '<rootDir>/src/providers/$1',
		'^providers$': '<rootDir>/src/providers/index.ts',
		'^components/(.*)$': '<rootDir>/src/components/$1',
		'^renderer/(.*)$': '<rootDir>/src/renderer/$1',
	},
	transform: {
		'^.+\\.tsx?$': [
			'ts-jest',
			{
				useESM: false,
				tsconfig: {
					module: 'commonjs',
					esModuleInterop: true,
					jsx: 'react-jsx',
				},
			},
		],
	},
};
