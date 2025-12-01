import { defineConfig } from 'vitest/config';
import path from 'path';
import { fileURLToPath } from 'url';

// Get current directory path for module resolution (ESM compatible)
const dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
	resolve: {
		alias: {
			obsidian: path.resolve(dirname, 'tests/__mocks__/obsidian.ts')
		}
	},
	test: {
		globals: true,
		environment: 'jsdom',
		include: ['tests/**/*.test.ts'],
		coverage: {
			provider: 'v8',
			reporter: ['text', 'html'],
			reportsDirectory: 'coverage',
			include: ['src/**/*.ts', 'main.ts'],
			exclude: ['src/**/index.ts']
		}
	}
});
