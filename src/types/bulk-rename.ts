import { TFile } from 'obsidian';

export type BulkRenameMode = 'prepend' | 'replace' | 'pattern';
export type ImageFilter = 'generic' | 'all';
export type BulkRenameScope = 'note' | 'vault';

/**
 * Patterns that indicate a generic/auto-generated image name
 */
export const GENERIC_NAME_PATTERNS = [
	/^pasted[-_ ]?image/i,
	/^screenshot/i,
	/^screen[-_ ]?shot/i,
	/^image[-_ ]?\d+$/i,      // "image1", "image 2", but not "image of cat"
	/^img[-_ ]?\d+$/i,        // "IMG_001", "img-1"
	/^photo[-_ ]?\d+$/i,      // "photo1", "photo_123", but not "photo of cat"
	/^clipboard[-_ ]?\d*$/i,  // "clipboard", "clipboard-1"
	/^\d{8,}/,                // Timestamps like 20231105123456
];

/**
 * Information about an image found during scanning
 */
export interface ImageInfo {
	/** The image file */
	file: TFile;
	/** The note that references this image (for context) */
	sourceNote: TFile | null;
	/** Whether the image has a generic name */
	isGeneric: boolean;
}

/**
 * A preview item for the bulk rename operation
 */
export interface BulkRenameItem {
	/** The image file */
	file: TFile;
	/** Current filename (without extension) */
	currentName: string;
	/** Proposed new filename (without extension) */
	newName: string;
	/** The note this image is associated with */
	sourceNote: TFile | null;
	/** Whether this item is selected for rename */
	selected: boolean;
	/** Whether the image has a generic name */
	isGeneric: boolean;
}

/**
 * Result of the bulk rename operation
 */
export interface BulkRenameResult {
	/** Number of images successfully renamed */
	success: number;
	/** Number of images that failed to rename */
	failed: number;
	/** Error messages for failed renames */
	errors: string[];
}
