import { IMAGE_EXTENSIONS, MIME_TO_EXTENSION, WIKI_IMAGE_REGEX, MARKDOWN_IMAGE_REGEX } from './constants';

/** Characters that are invalid in filenames across Windows/Mac/Linux */
const INVALID_FILENAME_CHARS = /[\\/:*?"<>|]/g;

/**
 * Sanitizes a filename to ensure it's valid for the filesystem.
 *
 * @param name - The filename to sanitize
 * @param aggressive - When true, converts to URL-friendly format:
 *   - Lowercase
 *   - Spaces → underscores
 *   - Accents removed (é → e, ñ → n)
 *
 *   When false, only removes invalid filesystem characters.
 *   This is useful for manual renames where user might type invalid chars.
 *
 * @returns The sanitized filename
 */
export function sanitizeFilename(name: string, aggressive: boolean): string {
	if (aggressive) {
		return name
			.trim()
			.normalize('NFD')
			.replace(/[\u0300-\u036f]/g, '') // Remove diacritics (accents)
			.replace(INVALID_FILENAME_CHARS, '')
			.replace(/[^a-zA-Z0-9\s_-]/g, '') // Remove non-alphanumeric except space, underscore, hyphen
			.replace(/\s+/g, '_')
			.replace(/_+/g, '_') // Collapse multiple underscores
			.replace(/^_|_$/g, '') // Remove leading/trailing underscores
			.toLowerCase();
	}

	// Standard mode: only remove invalid characters
	return name
		.replace(INVALID_FILENAME_CHARS, '')
		.replace(/\s+/g, ' ')
		.trim();
}

export function formatTimestamp(format: string): string {
	const now = new Date();
	const pad = (n: number) => n.toString().padStart(2, '0');

	return format
		.replace('YYYY', now.getFullYear().toString())
		.replace('MM', pad(now.getMonth() + 1))
		.replace('DD', pad(now.getDate()))
		.replace('HH', pad(now.getHours()))
		.replace('mm', pad(now.getMinutes()))
		.replace('ss', pad(now.getSeconds()));
}

export function isImageFile(ext: string): boolean {
	return IMAGE_EXTENSIONS.includes(ext.toLowerCase() as typeof IMAGE_EXTENSIONS[number]);
}

export function getExtensionFromMime(mimeType: string): string {
	return MIME_TO_EXTENSION[mimeType] || 'png';
}

export function getImageLinkAtCursor(line: string, cursorPos: number): string | null {
	// Try wiki-link syntax: ![[img|caption]]
	const wikiRegex = new RegExp(WIKI_IMAGE_REGEX.source, 'gi');
	let match;

	while ((match = wikiRegex.exec(line)) !== null) {
		const start = match.index;
		const end = start + match[0].length;
		if (cursorPos >= start && cursorPos <= end) {
			return match[1]; // Group 1 is the file path
		}
	}

	// Try markdown syntax: ![caption](path)
	const mdRegex = new RegExp(MARKDOWN_IMAGE_REGEX.source, 'gi');
	while ((match = mdRegex.exec(line)) !== null) {
		const start = match.index;
		const end = start + match[0].length;
		if (cursorPos >= start && cursorPos <= end) {
			return match[2]; // Group 2 is the file path in markdown
		}
	}

	return null;
}

/**
 * Get the first image link in a line, regardless of cursor position.
 * Fallback for context menus when cursor position doesn't match click position.
 */
export function getFirstImageLinkInLine(line: string): string | null {
	// Try wiki-link first
	const wikiRegex = new RegExp(WIKI_IMAGE_REGEX.source, 'gi');
	const wikiMatch = wikiRegex.exec(line);
	if (wikiMatch) return wikiMatch[1];

	// Try markdown syntax
	const mdRegex = new RegExp(MARKDOWN_IMAGE_REGEX.source, 'gi');
	const mdMatch = mdRegex.exec(line);
	if (mdMatch) return mdMatch[2]; // Group 2 is path in markdown

	return null;
}

export function extractImagePathFromSrc(src: string): string | null {
	let imagePath = decodeURIComponent(src);

	// Handle app://... URLs
	if (imagePath.includes('app://')) {
		const match = imagePath.match(/app:\/\/[^/]+\/(.+?)(\?|$)/);
		if (match) imagePath = match[1];
	}

	// Get just the filename (remove query params if any)
	let fileName = imagePath.split('/').pop();
	if (!fileName) return null;

	return fileName.split('?')[0];
}

/**
 * Remove configured suffixes from a base name.
 * Used to clean up note names before using them for image naming.
 *
 * @param basename - The base name to clean (without extension)
 * @param suffixes - Array of suffixes to remove (e.g., ['.excalidraw', '.canvas'])
 * @returns The cleaned base name
 */
export function removeNoteSuffixes(basename: string, suffixes: string[]): string {
	let name = basename;

	for (const suffix of suffixes) {
		if (name.toLowerCase().endsWith(suffix.toLowerCase())) {
			name = name.slice(0, -suffix.length);
			break;
		}
	}

	return name;
}
