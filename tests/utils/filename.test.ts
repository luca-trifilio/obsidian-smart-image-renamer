import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
	sanitizeFilename,
	formatTimestamp,
	isImageFile,
	getExtensionFromMime,
	getImageLinkAtCursor,
	extractImagePathFromSrc,
	removeNoteSuffixes
} from '../../src/utils/filename';

describe('sanitizeFilename', () => {
	describe('standard mode (aggressive = false)', () => {
		it('should remove invalid filesystem characters', () => {
			expect(sanitizeFilename('file:name', false)).toBe('filename');
			expect(sanitizeFilename('file/name', false)).toBe('filename');
			expect(sanitizeFilename('file\\name', false)).toBe('filename');
			expect(sanitizeFilename('file*name', false)).toBe('filename');
			expect(sanitizeFilename('file?name', false)).toBe('filename');
			expect(sanitizeFilename('file"name', false)).toBe('filename');
			expect(sanitizeFilename('file<name', false)).toBe('filename');
			expect(sanitizeFilename('file>name', false)).toBe('filename');
			expect(sanitizeFilename('file|name', false)).toBe('filename');
		});

		it('should normalize multiple spaces to single space', () => {
			expect(sanitizeFilename('file   name', false)).toBe('file name');
			expect(sanitizeFilename('file  name  here', false)).toBe('file name here');
		});

		it('should trim whitespace', () => {
			expect(sanitizeFilename('  filename  ', false)).toBe('filename');
			expect(sanitizeFilename('  file name  ', false)).toBe('file name');
		});

		it('should preserve accents and special characters', () => {
			expect(sanitizeFilename('Caffè', false)).toBe('Caffè');
			expect(sanitizeFilename('Città', false)).toBe('Città');
			expect(sanitizeFilename('Niño', false)).toBe('Niño');
		});

		it('should preserve case', () => {
			expect(sanitizeFilename('FileName', false)).toBe('FileName');
			expect(sanitizeFilename('FILE NAME', false)).toBe('FILE NAME');
		});
	});

	describe('aggressive mode (aggressive = true)', () => {
		it('should remove invalid filesystem characters', () => {
			expect(sanitizeFilename('file:name', true)).toBe('filename');
		});

		it('should convert to lowercase', () => {
			expect(sanitizeFilename('FileName', true)).toBe('filename');
			expect(sanitizeFilename('FILE NAME', true)).toBe('file_name');
		});

		it('should replace spaces with underscores', () => {
			expect(sanitizeFilename('file name', true)).toBe('file_name');
			expect(sanitizeFilename('file   name', true)).toBe('file_name');
		});

		it('should remove accents/diacritics', () => {
			expect(sanitizeFilename('Caffè', true)).toBe('caffe');
			expect(sanitizeFilename('Città', true)).toBe('citta');
			expect(sanitizeFilename('Niño', true)).toBe('nino');
			expect(sanitizeFilename('Crème brûlée', true)).toBe('creme_brulee');
		});

		it('should handle combined transformations', () => {
			expect(sanitizeFilename('  Café & Città  ', true)).toBe('cafe_citta');
		});
	});

	describe('edge cases', () => {
		it('should handle empty string', () => {
			expect(sanitizeFilename('', false)).toBe('');
			expect(sanitizeFilename('', true)).toBe('');
		});

		it('should handle string with only invalid characters', () => {
			expect(sanitizeFilename(':<>|', false)).toBe('');
			expect(sanitizeFilename(':<>|', true)).toBe('');
		});

		it('should handle string with only spaces', () => {
			expect(sanitizeFilename('   ', false)).toBe('');
			expect(sanitizeFilename('   ', true)).toBe('');
		});
	});
});

describe('formatTimestamp', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2025-12-01T14:30:45'));
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('should format compact timestamp', () => {
		expect(formatTimestamp('YYYYMMDD-HHmmss')).toBe('20251201-143045');
	});

	it('should format readable timestamp', () => {
		expect(formatTimestamp('YYYY-MM-DD_HH-mm-ss')).toBe('2025-12-01_14-30-45');
	});

	it('should handle partial formats', () => {
		expect(formatTimestamp('YYYY')).toBe('2025');
		expect(formatTimestamp('MM-DD')).toBe('12-01');
		expect(formatTimestamp('HH:mm')).toBe('14:30');
	});

	it('should handle custom formats', () => {
		expect(formatTimestamp('YYYY_MM_DD')).toBe('2025_12_01');
		expect(formatTimestamp('DD.MM.YYYY')).toBe('01.12.2025');
	});

	it('should preserve non-placeholder text', () => {
		expect(formatTimestamp('date-YYYYMMDD-time-HHmmss')).toBe('date-20251201-time-143045');
	});
});

describe('isImageFile', () => {
	it('should return true for valid image extensions', () => {
		expect(isImageFile('png')).toBe(true);
		expect(isImageFile('jpg')).toBe(true);
		expect(isImageFile('jpeg')).toBe(true);
		expect(isImageFile('gif')).toBe(true);
		expect(isImageFile('webp')).toBe(true);
		expect(isImageFile('bmp')).toBe(true);
		expect(isImageFile('svg')).toBe(true);
		expect(isImageFile('avif')).toBe(true);
		expect(isImageFile('tiff')).toBe(true);
		expect(isImageFile('tif')).toBe(true);
		expect(isImageFile('ico')).toBe(true);
	});

	it('should be case insensitive', () => {
		expect(isImageFile('PNG')).toBe(true);
		expect(isImageFile('JPG')).toBe(true);
		expect(isImageFile('Png')).toBe(true);
	});

	it('should return false for non-image extensions', () => {
		expect(isImageFile('pdf')).toBe(false);
		expect(isImageFile('txt')).toBe(false);
		expect(isImageFile('md')).toBe(false);
		expect(isImageFile('doc')).toBe(false);
	});

	it('should return false for empty string', () => {
		expect(isImageFile('')).toBe(false);
	});
});

describe('getExtensionFromMime', () => {
	it('should return correct extension for known MIME types', () => {
		expect(getExtensionFromMime('image/png')).toBe('png');
		expect(getExtensionFromMime('image/jpeg')).toBe('jpg');
		expect(getExtensionFromMime('image/gif')).toBe('gif');
		expect(getExtensionFromMime('image/webp')).toBe('webp');
		expect(getExtensionFromMime('image/bmp')).toBe('bmp');
		expect(getExtensionFromMime('image/svg+xml')).toBe('svg');
		expect(getExtensionFromMime('image/avif')).toBe('avif');
		expect(getExtensionFromMime('image/tiff')).toBe('tiff');
		expect(getExtensionFromMime('image/x-icon')).toBe('ico');
		expect(getExtensionFromMime('image/vnd.microsoft.icon')).toBe('ico');
	});

	it('should return png as default for unknown MIME types', () => {
		expect(getExtensionFromMime('image/unknown')).toBe('png');
		expect(getExtensionFromMime('application/octet-stream')).toBe('png');
		expect(getExtensionFromMime('')).toBe('png');
	});
});

describe('getImageLinkAtCursor', () => {
	it('should return image name when cursor is inside link', () => {
		const line = 'Some text ![[image.png]] more text';
		expect(getImageLinkAtCursor(line, 15)).toBe('image.png');
	});

	it('should return null when cursor is outside link', () => {
		const line = 'Some text ![[image.png]] more text';
		expect(getImageLinkAtCursor(line, 5)).toBe(null);
		expect(getImageLinkAtCursor(line, 30)).toBe(null);
	});

	it('should handle multiple image links', () => {
		const line = '![[first.png]] text ![[second.jpg]]';
		expect(getImageLinkAtCursor(line, 5)).toBe('first.png');
		expect(getImageLinkAtCursor(line, 25)).toBe('second.jpg');
	});

	it('should work with different image extensions', () => {
		expect(getImageLinkAtCursor('![[test.jpg]]', 5)).toBe('test.jpg');
		expect(getImageLinkAtCursor('![[test.jpeg]]', 5)).toBe('test.jpeg');
		expect(getImageLinkAtCursor('![[test.gif]]', 5)).toBe('test.gif');
		expect(getImageLinkAtCursor('![[test.webp]]', 5)).toBe('test.webp');
		expect(getImageLinkAtCursor('![[test.bmp]]', 5)).toBe('test.bmp');
		expect(getImageLinkAtCursor('![[test.svg]]', 5)).toBe('test.svg');
		expect(getImageLinkAtCursor('![[test.avif]]', 5)).toBe('test.avif');
		expect(getImageLinkAtCursor('![[test.tiff]]', 5)).toBe('test.tiff');
		expect(getImageLinkAtCursor('![[test.tif]]', 5)).toBe('test.tif');
		expect(getImageLinkAtCursor('![[test.ico]]', 5)).toBe('test.ico');
	});

	it('should return null for non-image links', () => {
		expect(getImageLinkAtCursor('![[document.pdf]]', 5)).toBe(null);
		expect(getImageLinkAtCursor('![[note.md]]', 5)).toBe(null);
	});

	it('should handle cursor at boundaries', () => {
		const line = '![[image.png]]';
		expect(getImageLinkAtCursor(line, 0)).toBe('image.png'); // At start
		expect(getImageLinkAtCursor(line, 14)).toBe('image.png'); // At end
	});

	it('should return null for empty line', () => {
		expect(getImageLinkAtCursor('', 0)).toBe(null);
	});

	it('should handle images with caption', () => {
		const line = '![[image.png|My caption here]]';
		expect(getImageLinkAtCursor(line, 10)).toBe('image.png');
	});

	it('should handle images with caption and size', () => {
		const line = '![[image.png|Caption|500]]';
		expect(getImageLinkAtCursor(line, 10)).toBe('image.png');
	});

	it('should handle images with size only', () => {
		const line = '![[image.png||300]]';
		expect(getImageLinkAtCursor(line, 10)).toBe('image.png');
	});

	it('should handle images with path and caption', () => {
		const line = '![[attachments/image.png|Caption]]';
		expect(getImageLinkAtCursor(line, 15)).toBe('attachments/image.png');
	});
});

describe('extractImagePathFromSrc', () => {
	it('should extract filename from simple path', () => {
		expect(extractImagePathFromSrc('image.png')).toBe('image.png');
		expect(extractImagePathFromSrc('folder/image.png')).toBe('image.png');
	});

	it('should handle URL-encoded paths', () => {
		expect(extractImagePathFromSrc('My%20Image.png')).toBe('My Image.png');
		expect(extractImagePathFromSrc('folder/My%20Image.png')).toBe('My Image.png');
	});

	it('should handle app:// URLs', () => {
		expect(extractImagePathFromSrc('app://local/path/to/image.png')).toBe('image.png');
		expect(extractImagePathFromSrc('app://local/vault/attachments/test.jpg?1234')).toBe('test.jpg');
	});

	it('should remove query parameters', () => {
		expect(extractImagePathFromSrc('image.png?v=123')).toBe('image.png');
		expect(extractImagePathFromSrc('folder/image.png?timestamp=456')).toBe('image.png');
	});

	it('should return null for empty string', () => {
		expect(extractImagePathFromSrc('')).toBe(null);
	});

	it('should handle complex paths', () => {
		expect(extractImagePathFromSrc('app://obsidian/vault%20name/attachments/My%20Image.png?v=1')).toBe('My Image.png');
	});
});

describe('removeNoteSuffixes', () => {
	const defaultSuffixes = ['.excalidraw', '.canvas'];

	describe('with default suffixes', () => {
		it('should remove .excalidraw suffix', () => {
			expect(removeNoteSuffixes('MyDrawing.excalidraw', defaultSuffixes)).toBe('MyDrawing');
		});

		it('should remove .canvas suffix', () => {
			expect(removeNoteSuffixes('MyCanvas.canvas', defaultSuffixes)).toBe('MyCanvas');
		});

		it('should be case insensitive', () => {
			expect(removeNoteSuffixes('MyDrawing.Excalidraw', defaultSuffixes)).toBe('MyDrawing');
			expect(removeNoteSuffixes('MyDrawing.EXCALIDRAW', defaultSuffixes)).toBe('MyDrawing');
			expect(removeNoteSuffixes('MyCanvas.CANVAS', defaultSuffixes)).toBe('MyCanvas');
		});

		it('should not modify names without matching suffix', () => {
			expect(removeNoteSuffixes('MyNote', defaultSuffixes)).toBe('MyNote');
			expect(removeNoteSuffixes('My.Note.With.Dots', defaultSuffixes)).toBe('My.Note.With.Dots');
		});

		it('should only remove suffix at the end', () => {
			expect(removeNoteSuffixes('excalidraw.something', defaultSuffixes)).toBe('excalidraw.something');
		});

		it('should only remove one suffix (first match)', () => {
			expect(removeNoteSuffixes('MyFile.canvas.excalidraw', defaultSuffixes)).toBe('MyFile.canvas');
		});
	});

	describe('with empty suffixes', () => {
		it('should not modify any names', () => {
			expect(removeNoteSuffixes('MyDrawing.excalidraw', [])).toBe('MyDrawing.excalidraw');
			expect(removeNoteSuffixes('MyNote', [])).toBe('MyNote');
		});
	});

	describe('with custom suffixes', () => {
		it('should remove custom suffixes', () => {
			const customSuffixes = ['.template', '.draft'];
			expect(removeNoteSuffixes('MyNote.template', customSuffixes)).toBe('MyNote');
			expect(removeNoteSuffixes('MyNote.draft', customSuffixes)).toBe('MyNote');
		});
	});

	describe('edge cases', () => {
		it('should handle empty basename', () => {
			expect(removeNoteSuffixes('', defaultSuffixes)).toBe('');
		});

		it('should handle basename that is exactly the suffix', () => {
			expect(removeNoteSuffixes('.excalidraw', defaultSuffixes)).toBe('');
		});

		it('should preserve spaces and special characters', () => {
			expect(removeNoteSuffixes('My Drawing 2024.excalidraw', defaultSuffixes)).toBe('My Drawing 2024');
			expect(removeNoteSuffixes('Café Diagram.canvas', defaultSuffixes)).toBe('Café Diagram');
		});
	});
});
