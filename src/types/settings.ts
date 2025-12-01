export interface SmartImageRenamerSettings {
	suffixMode: 'sequential' | 'timestamp';
	timestampFormat: string;
	/**
	 * When enabled, filenames are converted to a URL-friendly format:
	 * - Lowercase
	 * - Spaces replaced with underscores
	 * - Accents removed (é → e)
	 *
	 * When disabled, only invalid filesystem characters are removed.
	 */
	aggressiveSanitization: boolean;
}

export const DEFAULT_SETTINGS: SmartImageRenamerSettings = {
	suffixMode: 'sequential',
	timestampFormat: 'YYYYMMDD-HHmmss',
	aggressiveSanitization: false
};
