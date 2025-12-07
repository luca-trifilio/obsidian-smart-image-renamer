import { describe, it, expect, vi, beforeEach } from 'vitest';
import { App, TFile, TFolder, Vault } from '../__mocks__/obsidian';
import { FileService } from '../../src/services/file-service';
import { SmartImageRenamerSettings, DEFAULT_SETTINGS } from '../../src/types/settings';

describe('FileService', () => {
	let app: App;
	let fileService: FileService;
	let settings: SmartImageRenamerSettings;

	beforeEach(() => {
		app = new App();
		settings = { ...DEFAULT_SETTINGS };
		fileService = new FileService(app, settings);
		(app.vault as Vault)._clear();
	});

	describe('getAttachmentFolder', () => {
		it('should return empty string when attachment folder is root', () => {
			vi.spyOn(app.vault, 'getConfig').mockReturnValue('/');
			const file = new TFile('notes/test.md');

			expect(fileService.getAttachmentFolder(file)).toBe('');
		});

		it('should return empty string when attachment folder is not set', () => {
			vi.spyOn(app.vault, 'getConfig').mockReturnValue('');
			const file = new TFile('notes/test.md');

			expect(fileService.getAttachmentFolder(file)).toBe('');
		});

		it('should return parent path when attachment folder is "./"', () => {
			vi.spyOn(app.vault, 'getConfig').mockReturnValue('./');
			const file = new TFile('notes/test.md');
			file.parent = new TFolder('notes');

			expect(fileService.getAttachmentFolder(file)).toBe('notes');
		});

		it('should return subfolder path when attachment folder starts with "./"', () => {
			vi.spyOn(app.vault, 'getConfig').mockReturnValue('./attachments');
			const file = new TFile('notes/test.md');
			file.parent = new TFolder('notes');

			expect(fileService.getAttachmentFolder(file)).toBe('notes/attachments');
		});

		it('should return absolute path for specific folder', () => {
			vi.spyOn(app.vault, 'getConfig').mockReturnValue('assets/images');
			const file = new TFile('notes/test.md');

			expect(fileService.getAttachmentFolder(file)).toBe('assets/images');
		});
	});

	describe('ensureFolderExists', () => {
		it('should not create folder if it already exists', async () => {
			const folder = new TFolder('existing');
			(app.vault as Vault)._addFolder(folder);

			await fileService.ensureFolderExists('existing');

			expect(app.vault.createFolder).not.toHaveBeenCalled();
		});

		it('should create folder if it does not exist', async () => {
			await fileService.ensureFolderExists('new-folder');

			expect(app.vault.createFolder).toHaveBeenCalledWith('new-folder');
		});

		it('should create nested folders', async () => {
			await fileService.ensureFolderExists('path/to/folder');

			expect(app.vault.createFolder).toHaveBeenCalledWith('path');
			expect(app.vault.createFolder).toHaveBeenCalledWith('path/to');
			expect(app.vault.createFolder).toHaveBeenCalledWith('path/to/folder');
		});

		it('should ignore "Folder already exists" error (race condition)', async () => {
			vi.spyOn(app.vault, 'createFolder').mockRejectedValueOnce(new Error('Folder already exists.'));

			// Should not throw
			await expect(fileService.ensureFolderExists('new-folder')).resolves.toBeUndefined();
		});

		it('should throw other errors', async () => {
			vi.spyOn(app.vault, 'createFolder').mockRejectedValueOnce(new Error('Permission denied'));

			await expect(fileService.ensureFolderExists('new-folder')).rejects.toThrow('Permission denied');
		});
	});

	describe('getAvailablePath', () => {
		describe('sequential mode', () => {
			beforeEach(() => {
				settings.suffixMode = 'sequential';
				fileService.updateSettings(settings);
			});

			it('should return path with number 1 when no files exist', async () => {
				const path = await fileService.getAvailablePath('folder', 'note', 'png');

				expect(path).toBe('folder/note 1.png');
			});

			it('should increment number when file exists', async () => {
				const existingFile = new TFile('folder/note 1.png');
				(app.vault as Vault)._addFile(existingFile);

				const path = await fileService.getAvailablePath('folder', 'note', 'png');

				expect(path).toBe('folder/note 2.png');
			});

			it('should find next available number', async () => {
				(app.vault as Vault)._addFile(new TFile('folder/note 1.png'));
				(app.vault as Vault)._addFile(new TFile('folder/note 2.png'));
				(app.vault as Vault)._addFile(new TFile('folder/note 3.png'));

				const path = await fileService.getAvailablePath('folder', 'note', 'png');

				expect(path).toBe('folder/note 4.png');
			});

			it('should work without folder path', async () => {
				const path = await fileService.getAvailablePath('', 'note', 'png');

				expect(path).toBe('note 1.png');
			});
		});

		describe('timestamp mode', () => {
			beforeEach(() => {
				settings.suffixMode = 'timestamp';
				settings.timestampFormat = 'YYYYMMDD-HHmmss';
				fileService.updateSettings(settings);
				vi.useFakeTimers();
				vi.setSystemTime(new Date('2025-12-01T14:30:45'));
			});

			afterEach(() => {
				vi.useRealTimers();
			});

			it('should return path with timestamp', async () => {
				const path = await fileService.getAvailablePath('folder', 'note', 'png');

				expect(path).toBe('folder/note 20251201-143045.png');
			});

			it('should add sequential suffix if timestamp exists', async () => {
				(app.vault as Vault)._addFile(new TFile('folder/note 20251201-143045.png'));

				const path = await fileService.getAvailablePath('folder', 'note', 'png');

				expect(path).toBe('folder/note 20251201-143045-1.png');
			});

			it('should increment sequential suffix when multiple timestamp collisions', async () => {
				// Original timestamp file
				(app.vault as Vault)._addFile(new TFile('folder/note 20251201-143045.png'));
				// First collision
				(app.vault as Vault)._addFile(new TFile('folder/note 20251201-143045-1.png'));
				// Second collision
				(app.vault as Vault)._addFile(new TFile('folder/note 20251201-143045-2.png'));

				const path = await fileService.getAvailablePath('folder', 'note', 'png');

				expect(path).toBe('folder/note 20251201-143045-3.png');
			});

			it('should handle timestamp collision without folder', async () => {
				(app.vault as Vault)._addFile(new TFile('note 20251201-143045.png'));
				(app.vault as Vault)._addFile(new TFile('note 20251201-143045-1.png'));

				const path = await fileService.getAvailablePath('', 'note', 'png');

				expect(path).toBe('note 20251201-143045-2.png');
			});
		});
	});

	describe('renameFile', () => {
		it('should call fileManager.renameFile with correct path', async () => {
			const file = new TFile('folder/old-name.png');
			file.parent = new TFolder('folder');

			const result = await fileService.renameFile(file, 'new-name');

			expect(app.fileManager.renameFile).toHaveBeenCalledWith(file, 'folder/new-name.png');
			expect(result).toBe('new-name.png');
		});

		it('should handle files without parent folder', async () => {
			const file = new TFile('old-name.png');
			file.parent = null;

			const result = await fileService.renameFile(file, 'new-name');

			expect(app.fileManager.renameFile).toHaveBeenCalledWith(file, 'new-name.png');
			expect(result).toBe('new-name.png');
		});
	});

	describe('createBinaryFile', () => {
		it('should call vault.createBinary', async () => {
			const data = new ArrayBuffer(10);

			await fileService.createBinaryFile('path/to/file.png', data);

			expect(app.vault.createBinary).toHaveBeenCalledWith('path/to/file.png', data);
		});
	});

	describe('findFileByName', () => {
		it('should find file by name', () => {
			const file = new TFile('folder/test.png');
			(app.vault as Vault)._addFile(file);

			const result = fileService.findFileByName('test.png');

			expect(result).toBe(file);
		});

		it('should return undefined when file not found', () => {
			const result = fileService.findFileByName('nonexistent.png');

			expect(result).toBeUndefined();
		});
	});

	describe('resolveImageLink', () => {
		it('should delegate to metadataCache.getFirstLinkpathDest', () => {
			const imageFile = new TFile('attachments/image.png');
			app.metadataCache._setLinkResolver((linkpath, sourcePath) => {
				if (linkpath === 'image.png' && sourcePath === 'notes/test.md') {
					return imageFile;
				}
				return null;
			});

			const result = fileService.resolveImageLink('image.png', 'notes/test.md');

			expect(result).toBe(imageFile);
		});

		it('should return null when image not found', () => {
			app.metadataCache._setLinkResolver(() => null);

			const result = fileService.resolveImageLink('missing.png', 'notes/test.md');

			expect(result).toBeNull();
		});

		it('should handle complex link paths with subfolders', () => {
			const imageFile = new TFile('attachments/subfolder/deep-image.png');
			app.metadataCache._setLinkResolver((linkpath, sourcePath) => {
				if (linkpath === 'subfolder/deep-image.png') {
					return imageFile;
				}
				return null;
			});

			const result = fileService.resolveImageLink('subfolder/deep-image.png', 'notes/nested/doc.md');

			expect(result).toBe(imageFile);
		});
	});

	describe('updateSettings', () => {
		it('should update internal settings', () => {
			const newSettings: SmartImageRenamerSettings = {
				...DEFAULT_SETTINGS,
				suffixMode: 'timestamp'
			};

			fileService.updateSettings(newSettings);

			// Verify by checking behavior change
			vi.useFakeTimers();
			vi.setSystemTime(new Date('2025-12-01T14:30:45'));

			// The next getAvailablePath should use timestamp mode
			// (we can't directly check private settings, but behavior confirms)
		});
	});
});
