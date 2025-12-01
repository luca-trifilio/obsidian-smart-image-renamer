import { TFile, Editor } from 'obsidian';
import { SmartImageRenamerSettings } from '../types/settings';
import { FileService } from './file-service';
import { sanitizeFilename, getExtensionFromMime } from '../utils/filename';

export interface ProcessedImage {
	path: string;
	fileName: string;
	markdownLink: string;
}

export class ImageProcessor {
	constructor(
		private fileService: FileService,
		private settings: SmartImageRenamerSettings
	) {}

	updateSettings(settings: SmartImageRenamerSettings): void {
		this.settings = settings;
		this.fileService.updateSettings(settings);
	}

	getImageFromClipboard(clipboardData: DataTransfer): File | null {
		const items = clipboardData.files;
		for (let i = 0; i < items.length; i++) {
			const file = items[i];
			if (file.type.startsWith('image/')) {
				return file;
			}
		}
		return null;
	}

	async processImage(
		imageFile: File,
		activeFile: TFile
	): Promise<ProcessedImage> {
		const noteName = activeFile.basename;
		const sanitizedName = sanitizeFilename(noteName, this.settings.aggressiveSanitization);
		const extension = getExtensionFromMime(imageFile.type);
		const folderPath = this.fileService.getAttachmentFolder(activeFile);

		const availablePath = await this.fileService.getAvailablePath(
			folderPath,
			sanitizedName,
			extension
		);

		const arrayBuffer = await imageFile.arrayBuffer();
		await this.fileService.createBinaryFile(availablePath, arrayBuffer);

		const fileName = availablePath.split('/').pop() || availablePath;
		const markdownLink = `![[${fileName}]]`;

		return {
			path: availablePath,
			fileName,
			markdownLink
		};
	}

	insertMarkdownLink(editor: Editor, markdownLink: string): void {
		const cursor = editor.getCursor();
		editor.replaceRange(markdownLink, cursor);

		const newCursor = {
			line: cursor.line,
			ch: cursor.ch + markdownLink.length,
		};
		editor.setCursor(newCursor);
	}
}
