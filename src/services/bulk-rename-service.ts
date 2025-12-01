import { App, TFile, CachedMetadata } from 'obsidian';
import { SmartImageRenamerSettings } from '../types/settings';
import {
	ImageInfo,
	BulkRenameItem,
	BulkRenameResult,
	BulkRenameMode,
	ImageFilter,
	GENERIC_NAME_PATTERNS,
} from '../types/bulk-rename';
import { isImageFile, sanitizeFilename } from '../utils';

export class BulkRenameService {
	constructor(
		private app: App,
		private settings: SmartImageRenamerSettings
	) {}

	updateSettings(settings: SmartImageRenamerSettings): void {
		this.settings = settings;
	}

	/**
	 * Check if a filename matches generic/auto-generated patterns
	 */
	isGenericName(basename: string): boolean {
		return GENERIC_NAME_PATTERNS.some((pattern) => pattern.test(basename));
	}

	/**
	 * Scan all images linked in a specific note
	 */
	scanImagesInNote(note: TFile): ImageInfo[] {
		const images: ImageInfo[] = [];
		const cache = this.app.metadataCache.getFileCache(note);

		if (!cache) return images;

		// Get embedded links (images)
		const embeds = cache.embeds || [];

		for (const embed of embeds) {
			const linkedFile = this.app.metadataCache.getFirstLinkpathDest(
				embed.link,
				note.path
			);

			if (linkedFile instanceof TFile && isImageFile(linkedFile.extension)) {
				// Avoid duplicates
				if (!images.some((img) => img.file.path === linkedFile.path)) {
					images.push({
						file: linkedFile,
						sourceNote: note,
						isGeneric: this.isGenericName(linkedFile.basename),
					});
				}
			}
		}

		return images;
	}

	/**
	 * Scan all images in the vault
	 */
	scanImagesInVault(): ImageInfo[] {
		const images: ImageInfo[] = [];
		const allFiles = this.app.vault.getFiles();

		for (const file of allFiles) {
			if (isImageFile(file.extension)) {
				// Find the first note that references this image
				const sourceNote = this.findFirstReferencingNote(file);

				images.push({
					file,
					sourceNote,
					isGeneric: this.isGenericName(file.basename),
				});
			}
		}

		return images;
	}

	/**
	 * Find the first markdown note that references an image
	 */
	private findFirstReferencingNote(imageFile: TFile): TFile | null {
		const allFiles = this.app.vault.getMarkdownFiles();

		for (const mdFile of allFiles) {
			const cache = this.app.metadataCache.getFileCache(mdFile);
			if (!cache?.embeds) continue;

			for (const embed of cache.embeds) {
				const linkedFile = this.app.metadataCache.getFirstLinkpathDest(
					embed.link,
					mdFile.path
				);

				if (linkedFile?.path === imageFile.path) {
					return mdFile;
				}
			}
		}

		return null;
	}

	/**
	 * Filter images based on the filter setting
	 */
	filterImages(images: ImageInfo[], filter: ImageFilter): ImageInfo[] {
		if (filter === 'all') {
			return images;
		}

		// 'generic' - only images with generic names
		return images.filter((img) => img.isGeneric);
	}

	/**
	 * Generate a new name for an image based on the renaming mode
	 */
	generateNewName(
		image: ImageInfo,
		mode: BulkRenameMode,
		pattern?: string
	): string {
		const noteName = image.sourceNote?.basename || 'Untitled';
		const currentName = image.file.basename;

		let newName: string;

		switch (mode) {
			case 'prepend':
				// NoteName - ExistingName
				newName = `${noteName} - ${currentName}`;
				break;

			case 'replace':
				// Just use the note name (suffix will be added when checking availability)
				newName = noteName;
				break;

			case 'pattern':
				// Custom pattern: {note}, {original}, {n}
				newName = (pattern || '{note}')
					.replace('{note}', noteName)
					.replace('{original}', currentName);
				// {n} will be handled during actual rename
				break;

			default:
				newName = noteName;
		}

		return sanitizeFilename(newName, this.settings.aggressiveSanitization);
	}

	/**
	 * Generate preview items for bulk rename
	 */
	generatePreview(
		images: ImageInfo[],
		mode: BulkRenameMode,
		filter: ImageFilter,
		pattern?: string
	): BulkRenameItem[] {
		const filteredImages = this.filterImages(images, filter);
		const items: BulkRenameItem[] = [];
		const usedNames = new Map<string, number>();

		for (const image of filteredImages) {
			// Skip orphan images - we can't propose a meaningful name without a source note
			if (!image.sourceNote) {
				continue;
			}

			let baseName = this.generateNewName(image, mode, pattern);

			// Handle {n} placeholder or add suffix for duplicates
			if (mode === 'pattern' && pattern?.includes('{n}')) {
				const count = (usedNames.get(baseName) || 0) + 1;
				usedNames.set(baseName, count);
				baseName = baseName.replace('{n}', count.toString());
			} else {
				// For prepend mode or when no {n}, add suffix if duplicate
				const key = baseName.toLowerCase();
				const count = (usedNames.get(key) || 0) + 1;
				usedNames.set(key, count);

				if (count > 1 || mode === 'replace') {
					baseName = `${baseName} ${count}`;
				}
			}

			items.push({
				file: image.file,
				currentName: image.file.basename,
				newName: baseName,
				sourceNote: image.sourceNote,
				selected: false,
				isGeneric: image.isGeneric,
			});
		}

		return items;
	}

	/**
	 * Execute the bulk rename operation
	 */
	async executeBulkRename(items: BulkRenameItem[]): Promise<BulkRenameResult> {
		const selectedItems = items.filter((item) => item.selected);
		const result: BulkRenameResult = {
			success: 0,
			failed: 0,
			errors: [],
		};

		for (const item of selectedItems) {
			// Skip if name hasn't changed
			if (item.currentName === item.newName) {
				continue;
			}

			try {
				const newPath = item.file.parent?.path
					? `${item.file.parent.path}/${item.newName}.${item.file.extension}`
					: `${item.newName}.${item.file.extension}`;

				// Check if target already exists
				if (this.app.vault.getAbstractFileByPath(newPath)) {
					// Find available name
					let counter = 1;
					let availablePath: string;
					do {
						const suffixedName = `${item.newName} ${counter}`;
						availablePath = item.file.parent?.path
							? `${item.file.parent.path}/${suffixedName}.${item.file.extension}`
							: `${suffixedName}.${item.file.extension}`;
						counter++;
					} while (this.app.vault.getAbstractFileByPath(availablePath));

					await this.app.fileManager.renameFile(item.file, availablePath);
				} else {
					await this.app.fileManager.renameFile(item.file, newPath);
				}

				result.success++;
			} catch (error) {
				result.failed++;
				result.errors.push(
					`Failed to rename ${item.currentName}: ${error}`
				);
			}
		}

		return result;
	}
}
