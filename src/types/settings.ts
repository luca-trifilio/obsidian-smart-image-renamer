export type DeletePromptBehavior = 'always' | 'orphan-only' | 'never';

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
	/**
	 * When enabled, automatically renames images created from any source
	 * (drag & drop, Excalidraw, other plugins) if they have generic names.
	 */
	autoRenameOnCreate: boolean;
	/**
	 * Suffixes to remove from note names when generating image names.
	 * Useful for plugins like Excalidraw that add their own suffixes.
	 * Example: [".excalidraw"] removes ".excalidraw" from "MyDrawing.excalidraw.md"
	 */
	suffixesToRemove: string[];
	/**
	 * When to prompt for deleting image files after removing links.
	 * - always: Always prompt when deleting image link
	 * - orphan-only: Prompt only if image not linked elsewhere (default)
	 * - never: Disable auto-prompt, context menu only
	 */
	deletePromptBehavior: DeletePromptBehavior;
}

export const DEFAULT_SETTINGS: SmartImageRenamerSettings = {
	suffixMode: 'sequential',
	timestampFormat: 'YYYYMMDD-HHmmss',
	aggressiveSanitization: false,
	autoRenameOnCreate: true,
	suffixesToRemove: ['.excalidraw', '.canvas'],
	deletePromptBehavior: 'orphan-only'
};
