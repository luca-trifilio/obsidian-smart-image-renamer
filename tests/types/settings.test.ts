import { describe, it, expect } from 'vitest';
import { DEFAULT_SETTINGS, SmartImageRenamerSettings } from '../../src/types/settings';

describe('Settings', () => {
	describe('DEFAULT_SETTINGS', () => {
		it('should have deletePromptBehavior set to orphan-only', () => {
			expect(DEFAULT_SETTINGS.deletePromptBehavior).toBe('orphan-only');
		});
	});

	describe('SmartImageRenamerSettings type', () => {
		it('should accept all valid deletePromptBehavior values', () => {
			const settingsAlways: SmartImageRenamerSettings = {
				...DEFAULT_SETTINGS,
				deletePromptBehavior: 'always'
			};
			const settingsOrphan: SmartImageRenamerSettings = {
				...DEFAULT_SETTINGS,
				deletePromptBehavior: 'orphan-only'
			};
			const settingsNever: SmartImageRenamerSettings = {
				...DEFAULT_SETTINGS,
				deletePromptBehavior: 'never'
			};

			expect(settingsAlways.deletePromptBehavior).toBe('always');
			expect(settingsOrphan.deletePromptBehavior).toBe('orphan-only');
			expect(settingsNever.deletePromptBehavior).toBe('never');
		});
	});
});
