import { describe, it, expect, beforeEach } from 'vitest';
import { App, TFile, Vault, MetadataCache } from '../__mocks__/obsidian';
import { BulkRenameService } from '../../src/services/bulk-rename-service';
import { SmartImageRenamerSettings, DEFAULT_SETTINGS } from '../../src/types/settings';

describe('BulkRenameService', () => {
	let app: App;
	let service: BulkRenameService;
	let settings: SmartImageRenamerSettings;

	beforeEach(() => {
		app = new App();
		settings = { ...DEFAULT_SETTINGS };
		service = new BulkRenameService(app, settings);
		(app.vault as Vault)._clear();
		(app.metadataCache as MetadataCache)._clear();
	});

	describe('isGenericName', () => {
		it('should detect "Pasted image" as generic', () => {
			expect(service.isGenericName('Pasted image 20231105')).toBe(true);
			expect(service.isGenericName('Pasted-image-123')).toBe(true);
			expect(service.isGenericName('pasted_image')).toBe(true);
		});

		it('should detect "Screenshot" as generic', () => {
			expect(service.isGenericName('Screenshot 2024-01-01')).toBe(true);
			expect(service.isGenericName('screenshot')).toBe(true);
			expect(service.isGenericName('Screen shot')).toBe(true);
		});

		it('should detect "IMG_" and "image" patterns as generic', () => {
			expect(service.isGenericName('IMG_001')).toBe(true);
			expect(service.isGenericName('image123')).toBe(true);
			expect(service.isGenericName('image-1')).toBe(true);
			expect(service.isGenericName('photo_123')).toBe(true);
			expect(service.isGenericName('clipboard')).toBe(true);
		});

		it('should detect timestamp-like names as generic', () => {
			expect(service.isGenericName('20231105123456')).toBe(true);
			expect(service.isGenericName('202311051234')).toBe(true);
		});

		it('should not detect meaningful names as generic', () => {
			expect(service.isGenericName('Architecture diagram')).toBe(false);
			expect(service.isGenericName('Photo of cat')).toBe(false);
			expect(service.isGenericName('Logo')).toBe(false);
			expect(service.isGenericName('Galagone')).toBe(false);
		});
	});

	describe('scanImagesInNote', () => {
		it('should return empty array when no embeds in note', () => {
			const note = new TFile('notes/test.md');
			(app.vault as Vault)._addFile(note);
			(app.metadataCache as MetadataCache)._setFileCache(note.path, {});

			const images = service.scanImagesInNote(note);

			expect(images).toEqual([]);
		});

		it('should find images embedded in note', () => {
			const note = new TFile('notes/test.md');
			const image = new TFile('attachments/test.png');
			(app.vault as Vault)._addFile(note);
			(app.vault as Vault)._addFile(image);

			(app.metadataCache as MetadataCache)._setFileCache(note.path, {
				embeds: [{ link: 'test.png', displayText: 'test.png' }]
			});
			(app.metadataCache as MetadataCache)._setLinkResolver((linkpath) => {
				if (linkpath === 'test.png') return image;
				return null;
			});

			const images = service.scanImagesInNote(note);

			expect(images).toHaveLength(1);
			expect(images[0].file).toBe(image);
			expect(images[0].sourceNote).toBe(note);
		});

		it('should not include non-image files', () => {
			const note = new TFile('notes/test.md');
			const pdf = new TFile('attachments/doc.pdf');
			(app.vault as Vault)._addFile(note);
			(app.vault as Vault)._addFile(pdf);

			(app.metadataCache as MetadataCache)._setFileCache(note.path, {
				embeds: [{ link: 'doc.pdf', displayText: 'doc.pdf' }]
			});
			(app.metadataCache as MetadataCache)._setLinkResolver((linkpath) => {
				if (linkpath === 'doc.pdf') return pdf;
				return null;
			});

			const images = service.scanImagesInNote(note);

			expect(images).toHaveLength(0);
		});

		it('should detect generic names', () => {
			const note = new TFile('notes/test.md');
			const genericImage = new TFile('attachments/Pasted image 123.png');
			const namedImage = new TFile('attachments/Diagram.png');
			(app.vault as Vault)._addFile(note);
			(app.vault as Vault)._addFile(genericImage);
			(app.vault as Vault)._addFile(namedImage);

			(app.metadataCache as MetadataCache)._setFileCache(note.path, {
				embeds: [
					{ link: 'Pasted image 123.png', displayText: '' },
					{ link: 'Diagram.png', displayText: '' }
				]
			});
			(app.metadataCache as MetadataCache)._setLinkResolver((linkpath) => {
				if (linkpath === 'Pasted image 123.png') return genericImage;
				if (linkpath === 'Diagram.png') return namedImage;
				return null;
			});

			const images = service.scanImagesInNote(note);

			expect(images).toHaveLength(2);
			expect(images.find(i => i.file === genericImage)?.isGeneric).toBe(true);
			expect(images.find(i => i.file === namedImage)?.isGeneric).toBe(false);
		});
	});

	describe('scanImagesInVault', () => {
		it('should find all images in vault', () => {
			const image1 = new TFile('attachments/img1.png');
			const image2 = new TFile('other/img2.jpg');
			const note = new TFile('notes/test.md');
			(app.vault as Vault)._addFile(image1);
			(app.vault as Vault)._addFile(image2);
			(app.vault as Vault)._addFile(note);

			const images = service.scanImagesInVault();

			expect(images).toHaveLength(2);
			expect(images.map(i => i.file.path)).toContain('attachments/img1.png');
			expect(images.map(i => i.file.path)).toContain('other/img2.jpg');
		});

		it('should not include non-image files', () => {
			const image = new TFile('img.png');
			const note = new TFile('test.md');
			const pdf = new TFile('doc.pdf');
			(app.vault as Vault)._addFile(image);
			(app.vault as Vault)._addFile(note);
			(app.vault as Vault)._addFile(pdf);

			const images = service.scanImagesInVault();

			expect(images).toHaveLength(1);
			expect(images[0].file.path).toBe('img.png');
		});
	});

	describe('filterImages', () => {
		it('should return all images when filter is "all"', () => {
			const images = [
				{ file: new TFile('generic.png'), sourceNote: null, isGeneric: true },
				{ file: new TFile('named.png'), sourceNote: null, isGeneric: false }
			];

			const filtered = service.filterImages(images, 'all');

			expect(filtered).toHaveLength(2);
		});

		it('should return only generic images when filter is "generic"', () => {
			const images = [
				{ file: new TFile('generic.png'), sourceNote: null, isGeneric: true },
				{ file: new TFile('named.png'), sourceNote: null, isGeneric: false }
			];

			const filtered = service.filterImages(images, 'generic');

			expect(filtered).toHaveLength(1);
			expect(filtered[0].isGeneric).toBe(true);
		});
	});

	describe('generateNewName', () => {
		it('should generate prepend name', () => {
			const note = new TFile('My Note.md');
			const image = { file: new TFile('Screenshot.png'), sourceNote: note, isGeneric: true };

			const newName = service.generateNewName(image, 'prepend');

			expect(newName).toBe('My Note - Screenshot');
		});

		it('should generate replace name', () => {
			const note = new TFile('My Note.md');
			const image = { file: new TFile('Screenshot.png'), sourceNote: note, isGeneric: true };

			const newName = service.generateNewName(image, 'replace');

			expect(newName).toBe('My Note');
		});

		it('should generate pattern name', () => {
			const note = new TFile('My Note.md');
			const image = { file: new TFile('Screenshot.png'), sourceNote: note, isGeneric: true };

			const newName = service.generateNewName(image, 'pattern', '{note}_{original}');

			expect(newName).toBe('My Note_Screenshot');
		});

		it('should use "Untitled" when no source note (edge case)', () => {
			// Note: In practice, orphan images are filtered out before renaming
			// This test verifies the fallback behavior
			const image = { file: new TFile('Screenshot.png'), sourceNote: null, isGeneric: true };

			const newName = service.generateNewName(image, 'replace');

			expect(newName).toBe('Untitled');
		});

		it('should apply aggressive sanitization when enabled', () => {
			settings.aggressiveSanitization = true;
			service.updateSettings(settings);
			const note = new TFile('Café Résumé.md');
			const image = { file: new TFile('Screenshot.png'), sourceNote: note, isGeneric: true };

			const newName = service.generateNewName(image, 'replace');

			expect(newName).toBe('cafe_resume');
		});
	});

	describe('generatePreview', () => {
		it('should generate preview items with sequential numbers for replace mode', () => {
			const note = new TFile('Note.md');
			const images = [
				{ file: new TFile('img1.png'), sourceNote: note, isGeneric: true },
				{ file: new TFile('img2.png'), sourceNote: note, isGeneric: true }
			];

			const preview = service.generatePreview(images, 'replace', 'all');

			expect(preview).toHaveLength(2);
			expect(preview[0].newName).toBe('Note 1');
			expect(preview[1].newName).toBe('Note 2');
		});

		it('should not pre-select any images', () => {
			const note = new TFile('Note.md');
			const images = [
				{ file: new TFile('Pasted.png'), sourceNote: note, isGeneric: true },
				{ file: new TFile('Diagram.png'), sourceNote: note, isGeneric: false }
			];

			const preview = service.generatePreview(images, 'replace', 'all');

			expect(preview.find(p => p.currentName === 'Pasted')?.selected).toBe(false);
			expect(preview.find(p => p.currentName === 'Diagram')?.selected).toBe(false);
		});

		it('should handle pattern with {n} placeholder', () => {
			const note = new TFile('Note.md');
			const images = [
				{ file: new TFile('img1.png'), sourceNote: note, isGeneric: true },
				{ file: new TFile('img2.png'), sourceNote: note, isGeneric: true }
			];

			const preview = service.generatePreview(images, 'pattern', 'all', '{note}-{n}');

			expect(preview[0].newName).toBe('Note-1');
			expect(preview[1].newName).toBe('Note-2');
		});

		it('should skip orphan images (no source note)', () => {
			const note = new TFile('Note.md');
			const images = [
				{ file: new TFile('linked.png'), sourceNote: note, isGeneric: true },
				{ file: new TFile('orphan.png'), sourceNote: null, isGeneric: true }
			];

			const preview = service.generatePreview(images, 'replace', 'all');

			expect(preview).toHaveLength(1);
			expect(preview[0].currentName).toBe('linked');
		});

		it('should skip images that already have the correct name', () => {
			const note = new TFile('My Note.md');
			// Image already has the correct name "My Note 1"
			const alreadyNamed = new TFile('My Note 1.png');
			// Image with generic name that needs renaming
			const generic = new TFile('Pasted image 123.png');

			const images = [
				{ file: alreadyNamed, sourceNote: note, isGeneric: false },
				{ file: generic, sourceNote: note, isGeneric: true }
			];

			const preview = service.generatePreview(images, 'replace', 'all');

			// Only the generic image should be in the preview
			// Note: since "My Note 1" is skipped entirely, the counter starts fresh
			// so the new name is "My Note 1" (not 2)
			expect(preview).toHaveLength(1);
			expect(preview[0].currentName).toBe('Pasted image 123');
			expect(preview[0].newName).toBe('My Note 1');
		});

		it('should skip images when current name equals generated name exactly', () => {
			const note = new TFile('Test.md');
			// Single image already named "Test 1"
			const alreadyNamed = new TFile('Test 1.png');

			const images = [
				{ file: alreadyNamed, sourceNote: note, isGeneric: false }
			];

			const preview = service.generatePreview(images, 'replace', 'all');

			// Should be empty since the name wouldn't change
			expect(preview).toHaveLength(0);
		});

		it('should skip images that already follow the {NoteName} {number} pattern in replace mode', () => {
			const note = new TFile('Impianto hi-fi.md');
			// Images already correctly named with different numbers
			const img1 = new TFile('Impianto hi-fi 1.png');
			const img2 = new TFile('Impianto hi-fi 5.jpeg');
			const img3 = new TFile('Impianto hi-fi 42.png');
			// Generic image that should be renamed
			const generic = new TFile('Pasted image 123.png');

			const images = [
				{ file: img1, sourceNote: note, isGeneric: false },
				{ file: img2, sourceNote: note, isGeneric: false },
				{ file: img3, sourceNote: note, isGeneric: false },
				{ file: generic, sourceNote: note, isGeneric: true }
			];

			const preview = service.generatePreview(images, 'replace', 'all');

			// Only the generic image should be in the preview
			expect(preview).toHaveLength(1);
			expect(preview[0].currentName).toBe('Pasted image 123');
		});

		it('should NOT skip images with note name but wrong pattern in replace mode', () => {
			const note = new TFile('My Note.md');
			// Image has note name but not the "{name} {number}" pattern
			const wrongPattern = new TFile('My Note - screenshot.png');

			const images = [
				{ file: wrongPattern, sourceNote: note, isGeneric: false }
			];

			const preview = service.generatePreview(images, 'replace', 'all');

			// Should be included because it doesn't follow the exact pattern
			expect(preview).toHaveLength(1);
		});
	});

	describe('executeBulkRename', () => {
		it('should rename selected items', async () => {
			const file = new TFile('old.png');
			(app.vault as Vault)._addFile(file);

			const items = [
				{
					file,
					currentName: 'old',
					newName: 'new',
					sourceNote: null,
					selected: true,
					isGeneric: true
				}
			];

			const result = await service.executeBulkRename(items);

			expect(result.success).toBe(1);
			expect(result.failed).toBe(0);
			expect(app.fileManager.renameFile).toHaveBeenCalledWith(file, 'new.png');
		});

		it('should skip unselected items', async () => {
			const file = new TFile('old.png');
			(app.vault as Vault)._addFile(file);

			const items = [
				{
					file,
					currentName: 'old',
					newName: 'new',
					sourceNote: null,
					selected: false,
					isGeneric: true
				}
			];

			const result = await service.executeBulkRename(items);

			expect(result.success).toBe(0);
			expect(app.fileManager.renameFile).not.toHaveBeenCalled();
		});

		it('should skip items with unchanged names', async () => {
			const file = new TFile('same.png');
			(app.vault as Vault)._addFile(file);

			const items = [
				{
					file,
					currentName: 'same',
					newName: 'same',
					sourceNote: null,
					selected: true,
					isGeneric: true
				}
			];

			const result = await service.executeBulkRename(items);

			expect(result.success).toBe(0);
			expect(app.fileManager.renameFile).not.toHaveBeenCalled();
		});

		it('should handle files with parent folders', async () => {
			const file = new TFile('folder/old.png');
			file.parent = { path: 'folder', name: 'folder' } as any;
			(app.vault as Vault)._addFile(file);

			const items = [
				{
					file,
					currentName: 'old',
					newName: 'new',
					sourceNote: null,
					selected: true,
					isGeneric: true
				}
			];

			await service.executeBulkRename(items);

			expect(app.fileManager.renameFile).toHaveBeenCalledWith(file, 'folder/new.png');
		});

		it('should find available path if target exists', async () => {
			const file = new TFile('old.png');
			const existing = new TFile('new.png');
			(app.vault as Vault)._addFile(file);
			(app.vault as Vault)._addFile(existing);

			const items = [
				{
					file,
					currentName: 'old',
					newName: 'new',
					sourceNote: null,
					selected: true,
					isGeneric: true
				}
			];

			await service.executeBulkRename(items);

			expect(app.fileManager.renameFile).toHaveBeenCalledWith(file, 'new 1.png');
		});

		it('should find available path with folder when target exists', async () => {
			const file = new TFile('folder/old.png');
			file.parent = { path: 'folder', name: 'folder' } as any;
			const existing = new TFile('folder/new.png');
			const existing2 = new TFile('folder/new 1.png');
			(app.vault as Vault)._addFile(file);
			(app.vault as Vault)._addFile(existing);
			(app.vault as Vault)._addFile(existing2);

			const items = [
				{
					file,
					currentName: 'old',
					newName: 'new',
					sourceNote: null,
					selected: true,
					isGeneric: true
				}
			];

			await service.executeBulkRename(items);

			// Should find next available: new 2.png
			expect(app.fileManager.renameFile).toHaveBeenCalledWith(file, 'folder/new 2.png');
		});

		it('should handle rename errors and track them in result', async () => {
			const file = new TFile('old.png');
			(app.vault as Vault)._addFile(file);

			// Make renameFile throw an error
			app.fileManager.renameFile.mockRejectedValueOnce(new Error('Permission denied'));

			const items = [
				{
					file,
					currentName: 'old',
					newName: 'new',
					sourceNote: null,
					selected: true,
					isGeneric: true
				}
			];

			const result = await service.executeBulkRename(items);

			expect(result.success).toBe(0);
			expect(result.failed).toBe(1);
			expect(result.errors.length).toBe(1);
			expect(result.errors[0]).toContain('old');
			expect(result.errors[0]).toContain('Permission denied');
		});

		it('should continue with other items after an error', async () => {
			const file1 = new TFile('old1.png');
			const file2 = new TFile('old2.png');
			(app.vault as Vault)._addFile(file1);
			(app.vault as Vault)._addFile(file2);

			// First rename fails, second succeeds
			app.fileManager.renameFile
				.mockRejectedValueOnce(new Error('Error'))
				.mockResolvedValueOnce(undefined);

			const items = [
				{
					file: file1,
					currentName: 'old1',
					newName: 'new1',
					sourceNote: null,
					selected: true,
					isGeneric: true
				},
				{
					file: file2,
					currentName: 'old2',
					newName: 'new2',
					sourceNote: null,
					selected: true,
					isGeneric: true
				}
			];

			const result = await service.executeBulkRename(items);

			expect(result.success).toBe(1);
			expect(result.failed).toBe(1);
		});
	});

	describe('isReferencedAnywhere', () => {
		it('should return true if image is referenced in markdown note', () => {
			const note = new TFile('notes/test.md');
			const image = new TFile('attachments/referenced.png');
			(app.vault as Vault)._addFile(note);
			(app.vault as Vault)._addFile(image);

			(app.metadataCache as MetadataCache)._setFileCache(note.path, {
				embeds: [{ link: 'referenced.png', displayText: '' }]
			});
			(app.metadataCache as MetadataCache)._setLinkResolver((linkpath) => {
				if (linkpath === 'referenced.png') return image;
				return null;
			});

			const isReferenced = service.isReferencedAnywhere(image);

			expect(isReferenced).toBe(true);
		});

		it('should return true if image is referenced in canvas file', () => {
			const canvas = new TFile('canvas/board.canvas');
			const image = new TFile('attachments/canvas-img.png');
			(app.vault as Vault)._addFile(canvas);
			(app.vault as Vault)._addFile(image);

			(app.metadataCache as MetadataCache)._setFileCache(canvas.path, {
				embeds: [{ link: 'canvas-img.png', displayText: '' }]
			});
			(app.metadataCache as MetadataCache)._setLinkResolver((linkpath) => {
				if (linkpath === 'canvas-img.png') return image;
				return null;
			});

			const isReferenced = service.isReferencedAnywhere(image);

			expect(isReferenced).toBe(true);
		});

		it('should return true if image is referenced in excalidraw file', () => {
			const excalidraw = new TFile('drawings/diagram.excalidraw.md');
			const image = new TFile('attachments/excalidraw-img.png');
			(app.vault as Vault)._addFile(excalidraw);
			(app.vault as Vault)._addFile(image);

			(app.metadataCache as MetadataCache)._setFileCache(excalidraw.path, {
				embeds: [{ link: 'excalidraw-img.png', displayText: '' }]
			});
			(app.metadataCache as MetadataCache)._setLinkResolver((linkpath) => {
				if (linkpath === 'excalidraw-img.png') return image;
				return null;
			});

			const isReferenced = service.isReferencedAnywhere(image);

			expect(isReferenced).toBe(true);
		});

		it('should return false if image is not referenced anywhere', () => {
			const note = new TFile('notes/test.md');
			const orphan = new TFile('attachments/orphan.png');
			(app.vault as Vault)._addFile(note);
			(app.vault as Vault)._addFile(orphan);

			// Note has no embeds
			(app.metadataCache as MetadataCache)._setFileCache(note.path, {});

			const isReferenced = service.isReferencedAnywhere(orphan);

			expect(isReferenced).toBe(false);
		});
	});

	describe('findOrphanedImages', () => {
		it('should return empty when all images are referenced', () => {
			const note = new TFile('notes/test.md');
			const image = new TFile('attachments/referenced.png');
			(app.vault as Vault)._addFile(note);
			(app.vault as Vault)._addFile(image);

			(app.metadataCache as MetadataCache)._setFileCache(note.path, {
				embeds: [{ link: 'referenced.png', displayText: '' }]
			});
			(app.metadataCache as MetadataCache)._setLinkResolver((linkpath) => {
				if (linkpath === 'referenced.png') return image;
				return null;
			});

			const result = service.findOrphanedImages();

			expect(result.orphaned).toHaveLength(0);
			expect(result.totalImages).toBe(1);
			expect(result.referencedCount).toBe(1);
		});

		it('should find orphaned images', () => {
			const note = new TFile('notes/test.md');
			const referenced = new TFile('attachments/referenced.png');
			const orphan = new TFile('attachments/orphan.png');
			(app.vault as Vault)._addFile(note);
			(app.vault as Vault)._addFile(referenced);
			(app.vault as Vault)._addFile(orphan);

			(app.metadataCache as MetadataCache)._setFileCache(note.path, {
				embeds: [{ link: 'referenced.png', displayText: '' }]
			});
			(app.metadataCache as MetadataCache)._setLinkResolver((linkpath) => {
				if (linkpath === 'referenced.png') return referenced;
				return null;
			});

			const result = service.findOrphanedImages();

			expect(result.orphaned).toHaveLength(1);
			expect(result.orphaned[0].file.path).toBe('attachments/orphan.png');
			expect(result.orphaned[0].selected).toBe(true);
			expect(result.totalImages).toBe(2);
			expect(result.referencedCount).toBe(1);
		});

		it('should include file size in orphaned images', () => {
			const orphan = new TFile('attachments/orphan.png');
			orphan.stat = { size: 12345, ctime: 0, mtime: 0 };
			(app.vault as Vault)._addFile(orphan);

			const result = service.findOrphanedImages();

			expect(result.orphaned[0].size).toBe(12345);
		});

		it('should handle empty vault', () => {
			const result = service.findOrphanedImages();

			expect(result.orphaned).toHaveLength(0);
			expect(result.totalImages).toBe(0);
			expect(result.referencedCount).toBe(0);
		});
	});

	describe('deleteOrphanedImages', () => {
		it('should delete selected images', async () => {
			const orphan1 = new TFile('orphan1.png');
			const orphan2 = new TFile('orphan2.png');
			(app.vault as Vault)._addFile(orphan1);
			(app.vault as Vault)._addFile(orphan2);

			const images = [
				{ file: orphan1, size: 100, selected: true },
				{ file: orphan2, size: 200, selected: true }
			];

			const result = await service.deleteOrphanedImages(images);

			expect(result.success).toBe(2);
			expect(result.failed).toBe(0);
			expect(app.vault.trash).toHaveBeenCalledWith(orphan1, true);
			expect(app.vault.trash).toHaveBeenCalledWith(orphan2, true);
		});

		it('should skip unselected images', async () => {
			const orphan1 = new TFile('orphan1.png');
			const orphan2 = new TFile('orphan2.png');
			(app.vault as Vault)._addFile(orphan1);
			(app.vault as Vault)._addFile(orphan2);

			const images = [
				{ file: orphan1, size: 100, selected: true },
				{ file: orphan2, size: 200, selected: false }
			];

			const result = await service.deleteOrphanedImages(images);

			expect(result.success).toBe(1);
			expect(app.vault.trash).toHaveBeenCalledTimes(1);
			expect(app.vault.trash).toHaveBeenCalledWith(orphan1, true);
		});

		it('should handle delete errors', async () => {
			const orphan = new TFile('orphan.png');
			(app.vault as Vault)._addFile(orphan);

			app.vault.trash.mockRejectedValueOnce(new Error('Permission denied'));

			const images = [{ file: orphan, size: 100, selected: true }];

			const result = await service.deleteOrphanedImages(images);

			expect(result.success).toBe(0);
			expect(result.failed).toBe(1);
			expect(result.errors[0]).toContain('orphan.png');
			expect(result.errors[0]).toContain('Permission denied');
		});
	});

	describe('moveOrphanedImages', () => {
		it('should move selected images to target folder', async () => {
			const orphan1 = new TFile('attachments/orphan1.png');
			const orphan2 = new TFile('other/orphan2.png');
			(app.vault as Vault)._addFile(orphan1);
			(app.vault as Vault)._addFile(orphan2);

			const images = [
				{ file: orphan1, size: 100, selected: true },
				{ file: orphan2, size: 200, selected: true }
			];

			const result = await service.moveOrphanedImages(images, '_orphaned');

			expect(result.success).toBe(2);
			expect(result.failed).toBe(0);
			expect(app.fileManager.renameFile).toHaveBeenCalledWith(orphan1, '_orphaned/orphan1.png');
			expect(app.fileManager.renameFile).toHaveBeenCalledWith(orphan2, '_orphaned/orphan2.png');
		});

		it('should create target folder if it does not exist', async () => {
			const orphan = new TFile('orphan.png');
			(app.vault as Vault)._addFile(orphan);

			const images = [{ file: orphan, size: 100, selected: true }];

			await service.moveOrphanedImages(images, '_orphaned');

			expect(app.vault.createFolder).toHaveBeenCalledWith('_orphaned');
		});

		it('should not create folder if it already exists', async () => {
			const orphan = new TFile('orphan.png');
			const folder = { path: '_orphaned', name: '_orphaned' };
			(app.vault as Vault)._addFile(orphan);
			(app.vault as any)._addFolder(folder);

			const images = [{ file: orphan, size: 100, selected: true }];

			await service.moveOrphanedImages(images, '_orphaned');

			expect(app.vault.createFolder).not.toHaveBeenCalled();
		});

		it('should skip unselected images', async () => {
			const orphan1 = new TFile('orphan1.png');
			const orphan2 = new TFile('orphan2.png');
			(app.vault as Vault)._addFile(orphan1);
			(app.vault as Vault)._addFile(orphan2);

			const images = [
				{ file: orphan1, size: 100, selected: true },
				{ file: orphan2, size: 200, selected: false }
			];

			const result = await service.moveOrphanedImages(images, '_orphaned');

			expect(result.success).toBe(1);
			expect(app.fileManager.renameFile).toHaveBeenCalledTimes(1);
		});

		it('should handle move errors', async () => {
			const orphan = new TFile('orphan.png');
			(app.vault as Vault)._addFile(orphan);

			app.fileManager.renameFile.mockRejectedValueOnce(new Error('File already exists'));

			const images = [{ file: orphan, size: 100, selected: true }];

			const result = await service.moveOrphanedImages(images, '_orphaned');

			expect(result.success).toBe(0);
			expect(result.failed).toBe(1);
			expect(result.errors[0]).toContain('orphan.png');
			expect(result.errors[0]).toContain('File already exists');
		});
	});
});
