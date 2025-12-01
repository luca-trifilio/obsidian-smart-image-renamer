import { describe, it, expect, vi, beforeEach } from 'vitest';
import { App, TFile, TFolder, Editor } from '../__mocks__/obsidian';
import { FileService } from '../../src/services/file-service';
import { ImageProcessor } from '../../src/services/image-processor';
import { SmartImageRenamerSettings, DEFAULT_SETTINGS } from '../../src/types/settings';

describe('ImageProcessor', () => {
	let app: App;
	let fileService: FileService;
	let imageProcessor: ImageProcessor;
	let settings: SmartImageRenamerSettings;

	beforeEach(() => {
		app = new App();
		settings = { ...DEFAULT_SETTINGS };
		fileService = new FileService(app, settings);
		imageProcessor = new ImageProcessor(fileService, settings);
	});

	describe('getImageFromClipboard', () => {
		it('should return image file from clipboard', () => {
			const imageFile = new File([''], 'test.png', { type: 'image/png' });
			const clipboardData = {
				files: [imageFile]
			} as unknown as DataTransfer;

			const result = imageProcessor.getImageFromClipboard(clipboardData);

			expect(result).toBe(imageFile);
		});

		it('should return first image when multiple files present', () => {
			const textFile = new File([''], 'test.txt', { type: 'text/plain' });
			const imageFile = new File([''], 'test.png', { type: 'image/png' });
			const clipboardData = {
				files: [textFile, imageFile]
			} as unknown as DataTransfer;

			const result = imageProcessor.getImageFromClipboard(clipboardData);

			expect(result).toBe(imageFile);
		});

		it('should return null when no image in clipboard', () => {
			const textFile = new File([''], 'test.txt', { type: 'text/plain' });
			const clipboardData = {
				files: [textFile]
			} as unknown as DataTransfer;

			const result = imageProcessor.getImageFromClipboard(clipboardData);

			expect(result).toBeNull();
		});

		it('should return null when clipboard is empty', () => {
			const clipboardData = {
				files: []
			} as unknown as DataTransfer;

			const result = imageProcessor.getImageFromClipboard(clipboardData);

			expect(result).toBeNull();
		});

		it('should recognize different image types', () => {
			const types = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];

			types.forEach(type => {
				const imageFile = new File([''], 'test', { type });
				const clipboardData = {
					files: [imageFile]
				} as unknown as DataTransfer;

				const result = imageProcessor.getImageFromClipboard(clipboardData);
				expect(result).toBe(imageFile);
			});
		});
	});

	describe('processImage', () => {
		beforeEach(() => {
			vi.spyOn(fileService, 'getAttachmentFolder').mockReturnValue('attachments');
			vi.spyOn(fileService, 'getAvailablePath').mockResolvedValue('attachments/My Note 1.png');
			vi.spyOn(fileService, 'createBinaryFile').mockResolvedValue(undefined);
		});

		it('should process image and return correct result', async () => {
			const imageFile = new File(['test content'], 'clipboard.png', { type: 'image/png' });
			const activeFile = new TFile('notes/My Note.md');

			const result = await imageProcessor.processImage(imageFile, activeFile);

			expect(result).toEqual({
				path: 'attachments/My Note 1.png',
				fileName: 'My Note 1.png',
				markdownLink: '![[My Note 1.png]]'
			});
		});

		it('should use correct extension from MIME type', async () => {
			vi.spyOn(fileService, 'getAvailablePath').mockResolvedValue('attachments/note 1.jpg');
			const imageFile = new File(['test'], 'image', { type: 'image/jpeg' });
			const activeFile = new TFile('note.md');

			const result = await imageProcessor.processImage(imageFile, activeFile);

			expect(result.fileName).toBe('note 1.jpg');
		});

		it('should call createBinaryFile with image data', async () => {
			const imageData = new Uint8Array([1, 2, 3, 4]);
			const imageFile = new File([imageData], 'test.png', { type: 'image/png' });
			const activeFile = new TFile('note.md');

			await imageProcessor.processImage(imageFile, activeFile);

			expect(fileService.createBinaryFile).toHaveBeenCalledWith(
				'attachments/My Note 1.png',
				expect.any(ArrayBuffer)
			);
		});

		it('should sanitize filename based on settings', async () => {
			const imageFile = new File(['test'], 'test.png', { type: 'image/png' });
			const activeFile = new TFile('Caffè & Città.md');

			// Update settings to use aggressive sanitization
			const aggressiveSettings = { ...settings, aggressiveSanitization: true };
			imageProcessor.updateSettings(aggressiveSettings);

			vi.spyOn(fileService, 'getAvailablePath').mockImplementation(
				async (folder, baseName, ext) => `${folder}/${baseName} 1.${ext}`
			);

			const result = await imageProcessor.processImage(imageFile, activeFile);

			// With aggressive sanitization, should be lowercase with underscores
			expect(result.fileName).toContain('caffe');
		});
	});

	describe('insertMarkdownLink', () => {
		it('should insert link at cursor position', () => {
			const editor = new Editor();
			editor.getCursor.mockReturnValue({ line: 5, ch: 10 });

			imageProcessor.insertMarkdownLink(editor, '![[image.png]]');

			expect(editor.replaceRange).toHaveBeenCalledWith(
				'![[image.png]]',
				{ line: 5, ch: 10 }
			);
		});

		it('should move cursor after inserted link', () => {
			const editor = new Editor();
			editor.getCursor.mockReturnValue({ line: 5, ch: 10 });

			imageProcessor.insertMarkdownLink(editor, '![[image.png]]');

			expect(editor.setCursor).toHaveBeenCalledWith({
				line: 5,
				ch: 10 + '![[image.png]]'.length
			});
		});
	});

	describe('updateSettings', () => {
		it('should update both processor and file service settings', () => {
			const updateSpy = vi.spyOn(fileService, 'updateSettings');
			const newSettings: SmartImageRenamerSettings = {
				...DEFAULT_SETTINGS,
				aggressiveSanitization: true
			};

			imageProcessor.updateSettings(newSettings);

			expect(updateSpy).toHaveBeenCalledWith(newSettings);
		});
	});
});
