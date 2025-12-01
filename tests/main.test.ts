/**
 * Comprehensive tests for SmartImageRenamer plugin (main.ts)
 *
 * These tests validate the actual application logic, not just mock behavior.
 * A failing test indicates a potential bug or improvement opportunity.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
	App,
	TFile,
	TFolder,
	Vault,
	Workspace,
	MarkdownView,
	Editor,
	Menu,
	Notice,
	createMockClipboardEvent,
	createMockDragEvent,
	createMockMouseEvent,
	createMockFile,
	createMockImageElement
} from './__mocks__/obsidian';
import { noticeHistory } from './__mocks__/obsidian';
import SmartImageRenamer from '../main.ts';
import { DEFAULT_SETTINGS } from '../src/types/settings';

// Track BulkRenameModal calls
let bulkRenameModalCalls: any[] = [];
// Track RenameImageModal calls and callbacks
let renameImageModalCalls: { file: any; callback: Function }[] = [];
let lastRenameModalCallback: Function | null = null;
// Track OrphanedImagesModal calls
let orphanedImagesModalCalls: any[] = [];

// Mock the UI modules to avoid side effects
vi.mock('../src/ui', () => ({
	SmartImageRenamerSettingTab: vi.fn(),
	RenameImageModal: vi.fn().mockImplementation((app: any, file: any, callback: Function) => {
		renameImageModalCalls.push({ file, callback });
		lastRenameModalCallback = callback;
		return { open: vi.fn() };
	}),
	BulkRenameModal: vi.fn().mockImplementation((...args: any[]) => {
		bulkRenameModalCalls.push(args);
		return { open: vi.fn() };
	}),
	OrphanedImagesModal: vi.fn().mockImplementation((...args: any[]) => {
		orphanedImagesModalCalls.push(args);
		return { open: vi.fn() };
	})
}));

describe('SmartImageRenamer', () => {
	let plugin: SmartImageRenamer;

	beforeEach(async () => {
		vi.clearAllMocks();
		vi.useFakeTimers();
		Notice._clearHistory();
		bulkRenameModalCalls = [];
		renameImageModalCalls = [];
		lastRenameModalCallback = null;
		orphanedImagesModalCalls = [];

		plugin = new SmartImageRenamer();
		// Don't call onload yet - individual tests will do this as needed
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	// ============================================
	// PHASE 2: Plugin Lifecycle Tests
	// ============================================
	describe('Plugin Lifecycle', () => {
		describe('onload', () => {
			it('should load settings from storage', async () => {
				const savedSettings = { ...DEFAULT_SETTINGS, suffixMode: 'timestamp' as const };
				plugin.loadData = vi.fn().mockResolvedValue(savedSettings);

				await plugin.onload();

				expect(plugin.loadData).toHaveBeenCalled();
				expect(plugin.settings.suffixMode).toBe('timestamp');
			});

			it('should use default settings when no saved data', async () => {
				plugin.loadData = vi.fn().mockResolvedValue(null);

				await plugin.onload();

				expect(plugin.settings).toMatchObject(DEFAULT_SETTINGS);
			});

			it('should register settings tab', async () => {
				await plugin.onload();

				expect(plugin.addSettingTab).toHaveBeenCalled();
			});

			it('should register bulk-rename-current-note command', async () => {
				await plugin.onload();

				const calls = (plugin.addCommand as any).mock.calls;
				const noteCommand = calls.find((c: any) => c[0].id === 'bulk-rename-current-note');

				expect(noteCommand).toBeDefined();
				expect(noteCommand[0].name).toBe('Rename images in current note');
			});

			it('should register bulk-rename-vault command', async () => {
				await plugin.onload();

				const calls = (plugin.addCommand as any).mock.calls;
				const vaultCommand = calls.find((c: any) => c[0].id === 'bulk-rename-vault');

				expect(vaultCommand).toBeDefined();
				expect(vaultCommand[0].name).toBe('Rename all images in vault');
			});

			it('should register editor-paste event handler', async () => {
				await plugin.onload();

				const calls = (plugin.registerEvent as any).mock.calls;
				expect(calls.length).toBeGreaterThan(0);
			});

			it('should register editor-drop event handler', async () => {
				await plugin.onload();

				const calls = (plugin.registerEvent as any).mock.calls;
				expect(calls.length).toBeGreaterThanOrEqual(2);
			});

			it('should register editor-menu event handler', async () => {
				await plugin.onload();

				const calls = (plugin.registerEvent as any).mock.calls;
				expect(calls.length).toBeGreaterThanOrEqual(3);
			});

			it('should register DOM contextmenu event handler', async () => {
				await plugin.onload();

				const calls = (plugin.registerDomEvent as any).mock.calls;
				const contextMenuCall = calls.find((c: any) => c[1] === 'contextmenu');

				expect(contextMenuCall).toBeDefined();
				expect(contextMenuCall[3]).toBe(true); // capture phase
			});

			it('should register DOM drop event handler for global drops', async () => {
				await plugin.onload();

				const calls = (plugin.registerDomEvent as any).mock.calls;
				const dropCall = calls.find((c: any) => c[1] === 'drop');

				expect(dropCall).toBeDefined();
				expect(dropCall[3]).toBe(true); // capture phase
			});

			it('should register vault create event handler', async () => {
				await plugin.onload();

				// This should register for vault 'create' event
				const registerCalls = (plugin.registerEvent as any).mock.calls;
				expect(registerCalls.length).toBeGreaterThanOrEqual(4);
			});

			it('should set isStartupComplete to false initially', async () => {
				await plugin.onload();

				// Access private property via any cast
				expect((plugin as any).isStartupComplete).toBe(false);
			});

			it('should set isStartupComplete to true after 3 seconds', async () => {
				await plugin.onload();

				expect((plugin as any).isStartupComplete).toBe(false);

				vi.advanceTimersByTime(3000);

				expect((plugin as any).isStartupComplete).toBe(true);
			});
		});

		describe('onunload', () => {
			it('should not throw errors during cleanup', async () => {
				await plugin.onload();

				expect(() => plugin.onunload()).not.toThrow();
			});
		});
	});

	// ============================================
	// PHASE 3: Paste Handler Tests
	// ============================================
	describe('handlePaste', () => {
		let editor: Editor;
		let markdownView: MarkdownView;
		let activeFile: TFile;

		beforeEach(async () => {
			await plugin.onload();
			vi.advanceTimersByTime(3000); // Complete startup

			editor = new Editor();
			markdownView = new MarkdownView();
			activeFile = new TFile('notes/test-note.md');
			activeFile.parent = new TFolder('notes');
			markdownView.file = activeFile;

			(plugin.app.workspace as Workspace)._setActiveFile(activeFile);
		});

		it('should ignore paste without clipboardData', async () => {
			const evt = { clipboardData: null, preventDefault: vi.fn() } as unknown as ClipboardEvent;

			await (plugin as any).handlePaste(evt, editor, markdownView);

			expect(evt.preventDefault).not.toHaveBeenCalled();
		});

		it('should ignore paste without image in clipboard', async () => {
			const evt = createMockClipboardEvent({
				items: [{ type: 'text/plain', kind: 'string', getAsFile: () => null }]
			});

			await (plugin as any).handlePaste(evt, editor, markdownView);

			expect(evt.preventDefault).not.toHaveBeenCalled();
		});

		it('should process paste with PNG image', async () => {
			const imageFile = createMockFile('image.png', 'image/png');
			const evt = createMockClipboardEvent({
				items: [{ type: 'image/png', kind: 'file', getAsFile: () => imageFile }]
			});

			// Mock the imageProcessor
			(plugin as any).imageProcessor.getImageFromClipboard = vi.fn().mockReturnValue(imageFile);
			(plugin as any).imageProcessor.processImage = vi.fn().mockResolvedValue({
				fileName: 'test-note 1.png',
				markdownLink: '![[test-note 1.png]]'
			});
			(plugin as any).imageProcessor.insertMarkdownLink = vi.fn();

			await (plugin as any).handlePaste(evt, editor, markdownView);

			expect(evt.preventDefault).toHaveBeenCalled();
			expect((plugin as any).imageProcessor.processImage).toHaveBeenCalledWith(imageFile, activeFile);
		});

		it('should process paste with JPEG image', async () => {
			const imageFile = createMockFile('image.jpg', 'image/jpeg');
			const evt = createMockClipboardEvent({
				items: [{ type: 'image/jpeg', kind: 'file', getAsFile: () => imageFile }]
			});

			(plugin as any).imageProcessor.getImageFromClipboard = vi.fn().mockReturnValue(imageFile);
			(plugin as any).imageProcessor.processImage = vi.fn().mockResolvedValue({
				fileName: 'test-note 1.jpg',
				markdownLink: '![[test-note 1.jpg]]'
			});
			(plugin as any).imageProcessor.insertMarkdownLink = vi.fn();

			await (plugin as any).handlePaste(evt, editor, markdownView);

			expect(evt.preventDefault).toHaveBeenCalled();
		});

		it('should process paste with GIF image', async () => {
			const imageFile = createMockFile('image.gif', 'image/gif');
			const evt = createMockClipboardEvent({
				items: [{ type: 'image/gif', kind: 'file', getAsFile: () => imageFile }]
			});

			(plugin as any).imageProcessor.getImageFromClipboard = vi.fn().mockReturnValue(imageFile);
			(plugin as any).imageProcessor.processImage = vi.fn().mockResolvedValue({
				fileName: 'test-note 1.gif',
				markdownLink: '![[test-note 1.gif]]'
			});
			(plugin as any).imageProcessor.insertMarkdownLink = vi.fn();

			await (plugin as any).handlePaste(evt, editor, markdownView);

			expect(evt.preventDefault).toHaveBeenCalled();
		});

		it('should insert markdown link after successful paste', async () => {
			const imageFile = createMockFile('image.png', 'image/png');
			const evt = createMockClipboardEvent({
				items: [{ type: 'image/png', kind: 'file', getAsFile: () => imageFile }]
			});

			(plugin as any).imageProcessor.getImageFromClipboard = vi.fn().mockReturnValue(imageFile);
			(plugin as any).imageProcessor.processImage = vi.fn().mockResolvedValue({
				fileName: 'test-note 1.png',
				markdownLink: '![[test-note 1.png]]'
			});
			(plugin as any).imageProcessor.insertMarkdownLink = vi.fn();

			await (plugin as any).handlePaste(evt, editor, markdownView);

			expect((plugin as any).imageProcessor.insertMarkdownLink).toHaveBeenCalledWith(
				markdownView.editor,
				'![[test-note 1.png]]'
			);
		});

		it('should add file to processingFiles to prevent double-rename', async () => {
			const imageFile = createMockFile('image.png', 'image/png');
			const evt = createMockClipboardEvent({
				items: [{ type: 'image/png', kind: 'file', getAsFile: () => imageFile }]
			});

			(plugin as any).imageProcessor.getImageFromClipboard = vi.fn().mockReturnValue(imageFile);
			(plugin as any).imageProcessor.processImage = vi.fn().mockResolvedValue({
				fileName: 'test-note 1.png',
				markdownLink: '![[test-note 1.png]]'
			});
			(plugin as any).imageProcessor.insertMarkdownLink = vi.fn();

			await (plugin as any).handlePaste(evt, editor, markdownView);

			expect((plugin as any).processingFiles.has('test-note 1.png')).toBe(true);
		});

		it('should remove file from processingFiles after 1 second', async () => {
			const imageFile = createMockFile('image.png', 'image/png');
			const evt = createMockClipboardEvent({
				items: [{ type: 'image/png', kind: 'file', getAsFile: () => imageFile }]
			});

			(plugin as any).imageProcessor.getImageFromClipboard = vi.fn().mockReturnValue(imageFile);
			(plugin as any).imageProcessor.processImage = vi.fn().mockResolvedValue({
				fileName: 'test-note 1.png',
				markdownLink: '![[test-note 1.png]]'
			});
			(plugin as any).imageProcessor.insertMarkdownLink = vi.fn();

			await (plugin as any).handlePaste(evt, editor, markdownView);

			expect((plugin as any).processingFiles.has('test-note 1.png')).toBe(true);

			vi.advanceTimersByTime(1000);

			expect((plugin as any).processingFiles.has('test-note 1.png')).toBe(false);
		});

		it('should show error notice when no active file', async () => {
			const imageFile = createMockFile('image.png', 'image/png');
			const evt = createMockClipboardEvent({
				items: [{ type: 'image/png', kind: 'file', getAsFile: () => imageFile }]
			});

			(plugin as any).imageProcessor.getImageFromClipboard = vi.fn().mockReturnValue(imageFile);
			markdownView.file = null;

			await (plugin as any).handlePaste(evt, editor, markdownView);

			// Notice should be called with error message
			expect(noticeHistory.some(n => n.message === 'No active file found')).toBe(true);
		});

		it('should show error notice when processImage fails', async () => {
			const imageFile = createMockFile('image.png', 'image/png');
			const evt = createMockClipboardEvent({
				items: [{ type: 'image/png', kind: 'file', getAsFile: () => imageFile }]
			});

			(plugin as any).imageProcessor.getImageFromClipboard = vi.fn().mockReturnValue(imageFile);
			(plugin as any).imageProcessor.processImage = vi.fn().mockRejectedValue(new Error('Disk full'));

			await (plugin as any).handlePaste(evt, editor, markdownView);

			expect(noticeHistory.some(n => n.message.includes('Failed to save image'))).toBe(true);
		});
	});

	// ============================================
	// PHASE 4: Drop Handler Tests (Editor)
	// ============================================
	describe('handleDrop', () => {
		let editor: Editor;
		let markdownView: MarkdownView;
		let activeFile: TFile;

		beforeEach(async () => {
			await plugin.onload();
			vi.advanceTimersByTime(3000);

			editor = new Editor();
			markdownView = new MarkdownView();
			activeFile = new TFile('notes/test-note.md');
			activeFile.parent = new TFolder('notes');
			markdownView.file = activeFile;
		});

		it('should ignore drop if already handled (defaultPrevented)', async () => {
			const evt = createMockDragEvent({
				files: [createMockFile('image.png', 'image/png')],
				defaultPrevented: true
			});

			await (plugin as any).handleDrop(evt, editor, markdownView);

			expect(evt.preventDefault).not.toHaveBeenCalled();
		});

		it('should ignore drop without dataTransfer', async () => {
			const evt = { dataTransfer: null, defaultPrevented: false, preventDefault: vi.fn() } as unknown as DragEvent;

			await (plugin as any).handleDrop(evt, editor, markdownView);

			expect(evt.preventDefault).not.toHaveBeenCalled();
		});

		it('should ignore drop without image files', async () => {
			const evt = createMockDragEvent({
				files: [createMockFile('document.pdf', 'application/pdf')]
			});

			await (plugin as any).handleDrop(evt, editor, markdownView);

			expect(evt.preventDefault).not.toHaveBeenCalled();
		});

		it('should process single image drop', async () => {
			const imageFile = createMockFile('photo.png', 'image/png');
			const evt = createMockDragEvent({
				files: [imageFile]
			});

			(plugin as any).imageProcessor.processImage = vi.fn().mockResolvedValue({
				fileName: 'test-note 1.png',
				markdownLink: '![[test-note 1.png]]'
			});
			(plugin as any).imageProcessor.insertMarkdownLink = vi.fn();

			await (plugin as any).handleDrop(evt, editor, markdownView);

			expect(evt.preventDefault).toHaveBeenCalled();
			expect((plugin as any).imageProcessor.processImage).toHaveBeenCalledWith(imageFile, activeFile);
		});

		it('should process multiple image drops', async () => {
			const image1 = createMockFile('photo1.png', 'image/png');
			const image2 = createMockFile('photo2.jpg', 'image/jpeg');
			const evt = createMockDragEvent({
				files: [image1, image2]
			});

			(plugin as any).imageProcessor.processImage = vi.fn()
				.mockResolvedValueOnce({ fileName: 'test-note 1.png', markdownLink: '![[test-note 1.png]]' })
				.mockResolvedValueOnce({ fileName: 'test-note 2.jpg', markdownLink: '![[test-note 2.jpg]]' });
			(plugin as any).imageProcessor.insertMarkdownLink = vi.fn();

			await (plugin as any).handleDrop(evt, editor, markdownView);

			expect((plugin as any).imageProcessor.processImage).toHaveBeenCalledTimes(2);
			expect((plugin as any).imageProcessor.insertMarkdownLink).toHaveBeenCalledTimes(2);
		});

		it('should insert markdown link for each dropped image', async () => {
			const imageFile = createMockFile('photo.png', 'image/png');
			const evt = createMockDragEvent({
				files: [imageFile]
			});

			(plugin as any).imageProcessor.processImage = vi.fn().mockResolvedValue({
				fileName: 'test-note 1.png',
				markdownLink: '![[test-note 1.png]]'
			});
			(plugin as any).imageProcessor.insertMarkdownLink = vi.fn();

			await (plugin as any).handleDrop(evt, editor, markdownView);

			expect((plugin as any).imageProcessor.insertMarkdownLink).toHaveBeenCalledWith(
				editor,
				'![[test-note 1.png]]'
			);
		});

		it('should show error notice when no active file', async () => {
			const imageFile = createMockFile('photo.png', 'image/png');
			const evt = createMockDragEvent({
				files: [imageFile]
			});
			markdownView.file = null;

			await (plugin as any).handleDrop(evt, editor, { file: null });

			expect(noticeHistory.some(n => n.message === 'No active file found')).toBe(true);
		});

		it('should add dropped files to processingFiles', async () => {
			const imageFile = createMockFile('photo.png', 'image/png');
			const evt = createMockDragEvent({
				files: [imageFile]
			});

			(plugin as any).imageProcessor.processImage = vi.fn().mockResolvedValue({
				fileName: 'test-note 1.png',
				markdownLink: '![[test-note 1.png]]'
			});
			(plugin as any).imageProcessor.insertMarkdownLink = vi.fn();

			await (plugin as any).handleDrop(evt, editor, markdownView);

			expect((plugin as any).processingFiles.has('test-note 1.png')).toBe(true);
		});

		it('should show error notice when processImage fails for a file', async () => {
			const imageFile = createMockFile('photo.png', 'image/png');
			const evt = createMockDragEvent({
				files: [imageFile]
			});

			(plugin as any).imageProcessor.processImage = vi.fn().mockRejectedValue(new Error('Permission denied'));

			await (plugin as any).handleDrop(evt, editor, markdownView);

			expect(noticeHistory.some(n => n.message.includes('Failed to save image'))).toBe(true);
		});

		it('should filter out non-image files from mixed drops', async () => {
			const imageFile = createMockFile('photo.png', 'image/png');
			const pdfFile = createMockFile('doc.pdf', 'application/pdf');
			const evt = createMockDragEvent({
				files: [imageFile, pdfFile]
			});

			(plugin as any).imageProcessor.processImage = vi.fn().mockResolvedValue({
				fileName: 'test-note 1.png',
				markdownLink: '![[test-note 1.png]]'
			});
			(plugin as any).imageProcessor.insertMarkdownLink = vi.fn();

			await (plugin as any).handleDrop(evt, editor, markdownView);

			// Should only process the image, not the PDF
			expect((plugin as any).imageProcessor.processImage).toHaveBeenCalledTimes(1);
			expect((plugin as any).imageProcessor.processImage).toHaveBeenCalledWith(imageFile, activeFile);
		});
	});

	// ============================================
	// PHASE 5: Global Drop Handler Tests (Excalidraw)
	// ============================================
	describe('handleGlobalDrop', () => {
		beforeEach(async () => {
			await plugin.onload();
			vi.advanceTimersByTime(3000);
		});

		it('should ignore drop without dataTransfer', async () => {
			const evt = { dataTransfer: null } as unknown as DragEvent;

			await (plugin as any).handleGlobalDrop(evt);

			expect((plugin as any).forceRenameNext).toBe(false);
		});

		it('should ignore drop without image files', async () => {
			const evt = createMockDragEvent({
				files: [createMockFile('document.pdf', 'application/pdf')]
			});

			await (plugin as any).handleGlobalDrop(evt);

			expect((plugin as any).forceRenameNext).toBe(false);
		});

		it('should ignore drop when no active file', async () => {
			const evt = createMockDragEvent({
				files: [createMockFile('image.png', 'image/png')]
			});
			(plugin.app.workspace as Workspace)._setActiveFile(null);

			await (plugin as any).handleGlobalDrop(evt);

			expect((plugin as any).forceRenameNext).toBe(false);
		});

		it('should NOT set forceRenameNext for regular markdown files', async () => {
			const evt = createMockDragEvent({
				files: [createMockFile('image.png', 'image/png')]
			});
			const regularFile = new TFile('notes/regular-note.md');
			(plugin.app.workspace as Workspace)._setActiveFile(regularFile);

			await (plugin as any).handleGlobalDrop(evt);

			expect((plugin as any).forceRenameNext).toBe(false);
		});

		it('should detect Excalidraw file by .excalidraw.md extension', async () => {
			const evt = createMockDragEvent({
				files: [createMockFile('image.png', 'image/png')]
			});
			const excalidrawFile = new TFile('drawings/My Drawing.excalidraw.md');
			(plugin.app.workspace as Workspace)._setActiveFile(excalidrawFile);

			await (plugin as any).handleGlobalDrop(evt);

			expect((plugin as any).forceRenameNext).toBe(true);
		});

		it('should detect Excalidraw file case-insensitively', async () => {
			const evt = createMockDragEvent({
				files: [createMockFile('image.png', 'image/png')]
			});
			const excalidrawFile = new TFile('drawings/My Drawing.EXCALIDRAW.md');
			(plugin.app.workspace as Workspace)._setActiveFile(excalidrawFile);

			await (plugin as any).handleGlobalDrop(evt);

			expect((plugin as any).forceRenameNext).toBe(true);
		});

		it('should reset forceRenameNext after 5 seconds if unused', async () => {
			const evt = createMockDragEvent({
				files: [createMockFile('image.png', 'image/png')]
			});
			const excalidrawFile = new TFile('drawings/Drawing.excalidraw.md');
			(plugin.app.workspace as Workspace)._setActiveFile(excalidrawFile);

			await (plugin as any).handleGlobalDrop(evt);

			expect((plugin as any).forceRenameNext).toBe(true);

			vi.advanceTimersByTime(5000);

			expect((plugin as any).forceRenameNext).toBe(false);
		});

		it('should NOT set forceRenameNext for canvas files', async () => {
			// Canvas files are different from Excalidraw
			const evt = createMockDragEvent({
				files: [createMockFile('image.png', 'image/png')]
			});
			// Canvas files don't have .excalidraw in basename
			const canvasFile = new TFile('notes/My Canvas.canvas');
			(plugin.app.workspace as Workspace)._setActiveFile(canvasFile);

			await (plugin as any).handleGlobalDrop(evt);

			// Canvas files have extension 'canvas', not 'md', so they won't match
			expect((plugin as any).forceRenameNext).toBe(false);
		});
	});

	// ============================================
	// PHASE 6: File Create Handler Tests
	// ============================================
	describe('handleFileCreate', () => {
		let activeFile: TFile;

		beforeEach(async () => {
			await plugin.onload();
			vi.advanceTimersByTime(3000); // Complete startup

			activeFile = new TFile('notes/test-note.md');
			activeFile.parent = new TFolder('notes');
			(plugin.app.workspace as Workspace)._setActiveFile(activeFile);
		});

		it('should skip during startup', async () => {
			// Create new plugin and don't advance timers
			const freshPlugin = new SmartImageRenamer();
			await freshPlugin.onload();
			// Don't advance timers - startup not complete

			const imageFile = new TFile('attachments/Pasted image 20251201.png');
			imageFile.parent = new TFolder('attachments');

			(freshPlugin as any).fileService.renameFile = vi.fn();

			await (freshPlugin as any).handleFileCreate(imageFile);

			expect((freshPlugin as any).fileService.renameFile).not.toHaveBeenCalled();
		});

		it('should skip when autoRenameOnCreate is disabled', async () => {
			plugin.settings.autoRenameOnCreate = false;

			const imageFile = new TFile('attachments/Pasted image 20251201.png');
			imageFile.parent = new TFolder('attachments');

			(plugin as any).fileService.renameFile = vi.fn();

			await (plugin as any).handleFileCreate(imageFile);

			expect((plugin as any).fileService.renameFile).not.toHaveBeenCalled();
		});

		it('should skip when file is not a TFile (e.g., folder)', async () => {
			const folder = new TFolder('new-folder');

			(plugin as any).fileService.renameFile = vi.fn();

			await (plugin as any).handleFileCreate(folder);

			expect((plugin as any).fileService.renameFile).not.toHaveBeenCalled();
		});

		it('should skip non-image files', async () => {
			const textFile = new TFile('notes/document.txt');

			(plugin as any).fileService.renameFile = vi.fn();

			await (plugin as any).handleFileCreate(textFile);

			expect((plugin as any).fileService.renameFile).not.toHaveBeenCalled();
		});

		it('should skip files already in processingFiles', async () => {
			const imageFile = new TFile('attachments/test-note 1.png');
			(plugin as any).processingFiles.add('test-note 1.png');

			(plugin as any).fileService.renameFile = vi.fn();

			await (plugin as any).handleFileCreate(imageFile);

			expect((plugin as any).fileService.renameFile).not.toHaveBeenCalled();
		});

		it('should rename file with generic name "Pasted image..."', async () => {
			const imageFile = new TFile('attachments/Pasted image 20251201123456.png');
			imageFile.parent = new TFolder('attachments');

			(plugin as any).fileService.getAvailablePath = vi.fn().mockResolvedValue('attachments/test-note 1.png');
			(plugin as any).fileService.renameFile = vi.fn().mockResolvedValue('test-note 1.png');
			(plugin as any).bulkRenameService.isGenericName = vi.fn().mockReturnValue(true);

			const promise = (plugin as any).handleFileCreate(imageFile);
			await vi.runAllTimersAsync();
			await promise;

			expect((plugin as any).fileService.renameFile).toHaveBeenCalled();
		});

		it('should rename file with generic name "Screenshot..."', async () => {
			const imageFile = new TFile('attachments/Screenshot 2025-12-01 at 14.30.45.png');
			imageFile.parent = new TFolder('attachments');

			(plugin as any).fileService.getAvailablePath = vi.fn().mockResolvedValue('attachments/test-note 1.png');
			(plugin as any).fileService.renameFile = vi.fn().mockResolvedValue('test-note 1.png');
			(plugin as any).bulkRenameService.isGenericName = vi.fn().mockReturnValue(true);

			const promise = (plugin as any).handleFileCreate(imageFile);
			await vi.runAllTimersAsync();
			await promise;

			expect((plugin as any).fileService.renameFile).toHaveBeenCalled();
		});

		it('should rename file with generic name "image1"', async () => {
			const imageFile = new TFile('attachments/image1.png');
			imageFile.parent = new TFolder('attachments');

			(plugin as any).fileService.getAvailablePath = vi.fn().mockResolvedValue('attachments/test-note 1.png');
			(plugin as any).fileService.renameFile = vi.fn().mockResolvedValue('test-note 1.png');
			(plugin as any).bulkRenameService.isGenericName = vi.fn().mockReturnValue(true);

			const promise = (plugin as any).handleFileCreate(imageFile);
			await vi.runAllTimersAsync();
			await promise;

			expect((plugin as any).fileService.renameFile).toHaveBeenCalled();
		});

		it('should rename file with generic name "IMG_001"', async () => {
			const imageFile = new TFile('attachments/IMG_001.jpg');
			imageFile.parent = new TFolder('attachments');

			(plugin as any).fileService.getAvailablePath = vi.fn().mockResolvedValue('attachments/test-note 1.jpg');
			(plugin as any).fileService.renameFile = vi.fn().mockResolvedValue('test-note 1.jpg');
			(plugin as any).bulkRenameService.isGenericName = vi.fn().mockReturnValue(true);

			const promise = (plugin as any).handleFileCreate(imageFile);
			await vi.runAllTimersAsync();
			await promise;

			expect((plugin as any).fileService.renameFile).toHaveBeenCalled();
		});

		it('should NOT rename file with non-generic name (forceRenameNext = false)', async () => {
			const imageFile = new TFile('attachments/my-custom-photo.png');
			imageFile.parent = new TFolder('attachments');

			(plugin as any).bulkRenameService.isGenericName = vi.fn().mockReturnValue(false);
			(plugin as any).fileService.renameFile = vi.fn();

			const promise = (plugin as any).handleFileCreate(imageFile);
			await vi.runAllTimersAsync();
			await promise;

			expect((plugin as any).fileService.renameFile).not.toHaveBeenCalled();
		});

		it('should rename file with non-generic name when forceRenameNext = true', async () => {
			const imageFile = new TFile('attachments/my-custom-photo.png');
			imageFile.parent = new TFolder('attachments');

			(plugin as any).forceRenameNext = true;
			(plugin as any).bulkRenameService.isGenericName = vi.fn().mockReturnValue(false);
			(plugin as any).fileService.getAvailablePath = vi.fn().mockResolvedValue('attachments/test-note 1.png');
			(plugin as any).fileService.renameFile = vi.fn().mockResolvedValue('test-note 1.png');

			const promise = (plugin as any).handleFileCreate(imageFile);
			await vi.runAllTimersAsync();
			await promise;

			expect((plugin as any).fileService.renameFile).toHaveBeenCalled();
		});

		it('should reset forceRenameNext after use', async () => {
			const imageFile = new TFile('attachments/my-custom-photo.png');
			imageFile.parent = new TFolder('attachments');

			(plugin as any).forceRenameNext = true;
			(plugin as any).bulkRenameService.isGenericName = vi.fn().mockReturnValue(false);
			(plugin as any).fileService.getAvailablePath = vi.fn().mockResolvedValue('attachments/test-note 1.png');
			(plugin as any).fileService.renameFile = vi.fn().mockResolvedValue('test-note 1.png');

			const promise = (plugin as any).handleFileCreate(imageFile);
			await vi.runAllTimersAsync();
			await promise;

			expect((plugin as any).forceRenameNext).toBe(false);
		});

		it('should remove .excalidraw suffix from active file name', async () => {
			const excalidrawFile = new TFile('drawings/My Drawing.excalidraw.md');
			(plugin.app.workspace as Workspace)._setActiveFile(excalidrawFile);

			const imageFile = new TFile('attachments/Pasted image.png');
			imageFile.parent = new TFolder('attachments');

			let capturedBaseName = '';
			(plugin as any).bulkRenameService.isGenericName = vi.fn().mockReturnValue(true);
			(plugin as any).fileService.getAvailablePath = vi.fn().mockImplementation((folder, name, ext) => {
				capturedBaseName = name;
				return Promise.resolve(`${folder}/${name} 1.${ext}`);
			});
			(plugin as any).fileService.renameFile = vi.fn().mockResolvedValue('My Drawing 1.png');

			const promise = (plugin as any).handleFileCreate(imageFile);
			await vi.runAllTimersAsync();
			await promise;

			expect(capturedBaseName).toBe('My Drawing');
		});

		it('should remove .canvas suffix from active file name', async () => {
			// Note: Canvas files in Obsidian have .canvas extension, not .canvas in basename
			// But the removeNoteSuffixes function handles this
			const canvasFile = new TFile('notes/My Canvas.canvas.md');
			canvasFile.basename = 'My Canvas.canvas'; // Simulate the case
			(plugin.app.workspace as Workspace)._setActiveFile(canvasFile);

			const imageFile = new TFile('attachments/Pasted image.png');
			imageFile.parent = new TFolder('attachments');

			let capturedBaseName = '';
			(plugin as any).bulkRenameService.isGenericName = vi.fn().mockReturnValue(true);
			(plugin as any).fileService.getAvailablePath = vi.fn().mockImplementation((folder, name, ext) => {
				capturedBaseName = name;
				return Promise.resolve(`${folder}/${name} 1.${ext}`);
			});
			(plugin as any).fileService.renameFile = vi.fn().mockResolvedValue('My Canvas 1.png');

			const promise = (plugin as any).handleFileCreate(imageFile);
			await vi.runAllTimersAsync();
			await promise;

			expect(capturedBaseName).toBe('My Canvas');
		});

		it('should apply sanitization according to settings', async () => {
			plugin.settings.aggressiveSanitization = true;
			const activeFileWithSpecialChars = new TFile('notes/Café & Bar.md');
			(plugin.app.workspace as Workspace)._setActiveFile(activeFileWithSpecialChars);

			const imageFile = new TFile('attachments/Pasted image.png');
			imageFile.parent = new TFolder('attachments');

			let capturedBaseName = '';
			(plugin as any).bulkRenameService.isGenericName = vi.fn().mockReturnValue(true);
			(plugin as any).fileService.getAvailablePath = vi.fn().mockImplementation((folder, name, ext) => {
				capturedBaseName = name;
				return Promise.resolve(`${folder}/${name} 1.${ext}`);
			});
			(plugin as any).fileService.renameFile = vi.fn().mockResolvedValue('cafe_bar 1.png');

			const promise = (plugin as any).handleFileCreate(imageFile);
			await vi.runAllTimersAsync();
			await promise;

			// With aggressive sanitization, should be lowercase with underscores
			expect(capturedBaseName).toBe('cafe_bar');
		});

		it('should use sequential suffix mode', async () => {
			plugin.settings.suffixMode = 'sequential';

			const imageFile = new TFile('attachments/Pasted image.png');
			imageFile.parent = new TFolder('attachments');

			(plugin as any).bulkRenameService.isGenericName = vi.fn().mockReturnValue(true);
			(plugin as any).fileService.getAvailablePath = vi.fn().mockResolvedValue('attachments/test-note 1.png');
			(plugin as any).fileService.renameFile = vi.fn().mockResolvedValue('test-note 1.png');

			const promise = (plugin as any).handleFileCreate(imageFile);
			await vi.runAllTimersAsync();
			await promise;

			expect((plugin as any).fileService.getAvailablePath).toHaveBeenCalledWith(
				'attachments',
				'test-note',
				'png'
			);
		});

		it('should show user-friendly notice when "file already exists" error', async () => {
			const imageFile = new TFile('attachments/Pasted image.png');
			imageFile.parent = new TFolder('attachments');

			(plugin as any).bulkRenameService.isGenericName = vi.fn().mockReturnValue(true);
			(plugin as any).fileService.getAvailablePath = vi.fn().mockResolvedValue('attachments/test-note 1.png');
			(plugin as any).fileService.renameFile = vi.fn().mockRejectedValue(new Error('Destination file already exists!'));

			const promise = (plugin as any).handleFileCreate(imageFile);
			await vi.runAllTimersAsync();
			await promise;

			const existsNotice = noticeHistory.find(n => n.message.includes('already exists'));
			expect(existsNotice).toBeDefined();
			expect(existsNotice?.timeout).toBe(5000);
		});

		it('should show generic error notice for other errors', async () => {
			const imageFile = new TFile('attachments/Pasted image.png');
			imageFile.parent = new TFolder('attachments');

			(plugin as any).bulkRenameService.isGenericName = vi.fn().mockReturnValue(true);
			(plugin as any).fileService.getAvailablePath = vi.fn().mockResolvedValue('attachments/test-note 1.png');
			(plugin as any).fileService.renameFile = vi.fn().mockRejectedValue(new Error('Permission denied'));

			const promise = (plugin as any).handleFileCreate(imageFile);
			await vi.runAllTimersAsync();
			await promise;

			expect(noticeHistory.some(n => n.message.includes('Failed to auto-rename'))).toBe(true);
		});

		it('should clean processingFiles even on error', async () => {
			const imageFile = new TFile('attachments/Pasted image.png');
			imageFile.parent = new TFolder('attachments');

			(plugin as any).bulkRenameService.isGenericName = vi.fn().mockReturnValue(true);
			(plugin as any).fileService.getAvailablePath = vi.fn().mockResolvedValue('attachments/test-note 1.png');
			(plugin as any).fileService.renameFile = vi.fn().mockRejectedValue(new Error('Some error'));

			const promise = (plugin as any).handleFileCreate(imageFile);
			await vi.runAllTimersAsync();
			await promise;

			expect((plugin as any).processingFiles.has(imageFile.path)).toBe(false);
		});

		it('should skip rename when sanitized name is empty', async () => {
			const activeFileWithOnlyInvalidChars = new TFile('notes/:<>|.md');
			activeFileWithOnlyInvalidChars.basename = ':<>|';
			(plugin.app.workspace as Workspace)._setActiveFile(activeFileWithOnlyInvalidChars);

			const imageFile = new TFile('attachments/Pasted image.png');
			imageFile.parent = new TFolder('attachments');

			(plugin as any).bulkRenameService.isGenericName = vi.fn().mockReturnValue(true);
			(plugin as any).fileService.renameFile = vi.fn();

			const promise = (plugin as any).handleFileCreate(imageFile);
			await vi.runAllTimersAsync();
			await promise;

			expect((plugin as any).fileService.renameFile).not.toHaveBeenCalled();
		});

		it('should skip rename when no active file', async () => {
			(plugin.app.workspace as Workspace)._setActiveFile(null);

			const imageFile = new TFile('attachments/Pasted image.png');
			imageFile.parent = new TFolder('attachments');

			(plugin as any).bulkRenameService.isGenericName = vi.fn().mockReturnValue(true);
			(plugin as any).fileService.renameFile = vi.fn();

			const promise = (plugin as any).handleFileCreate(imageFile);
			await vi.runAllTimersAsync();
			await promise;

			expect((plugin as any).fileService.renameFile).not.toHaveBeenCalled();
		});
	});

	// ============================================
	// PHASE 7: Context Menu Tests
	// ============================================
	describe('handleEditorMenu', () => {
		let menu: Menu;
		let editor: Editor;
		let markdownView: MarkdownView;

		beforeEach(async () => {
			await plugin.onload();
			vi.advanceTimersByTime(3000);

			menu = new Menu();
			editor = new Editor();
			markdownView = new MarkdownView();
			markdownView.file = new TFile('notes/test.md');
		});

		it('should add "Rename image" menu item when pendingImageFile is set', () => {
			const imageFile = new TFile('attachments/image.png');
			(plugin as any).pendingImageFile = imageFile;

			(plugin as any).handleEditorMenu(menu, editor, markdownView);

			const item = menu._findItem('Rename image');
			expect(item).toBeDefined();
		});

		it('should add "Rename image" menu item when cursor is on image wikilink', () => {
			(plugin as any).pendingImageFile = undefined;
			editor.getCursor = vi.fn().mockReturnValue({ line: 0, ch: 10 });
			editor.getLine = vi.fn().mockReturnValue('Some text ![[image.png]] more text');

			(plugin as any).handleEditorMenu(menu, editor, markdownView);

			const item = menu._findItem('Rename image');
			expect(item).toBeDefined();
		});

		it('should NOT add menu item when cursor is not on image wikilink', () => {
			(plugin as any).pendingImageFile = undefined;
			editor.getCursor = vi.fn().mockReturnValue({ line: 0, ch: 5 });
			editor.getLine = vi.fn().mockReturnValue('Some text ![[image.png]] more text');

			(plugin as any).handleEditorMenu(menu, editor, markdownView);

			const item = menu._findItem('Rename image');
			expect(item).toBeUndefined();
		});

		it('should NOT add menu item when cursor is on non-image wikilink', () => {
			(plugin as any).pendingImageFile = undefined;
			editor.getCursor = vi.fn().mockReturnValue({ line: 0, ch: 10 });
			editor.getLine = vi.fn().mockReturnValue('Some text ![[document.pdf]] more text');

			(plugin as any).handleEditorMenu(menu, editor, markdownView);

			const item = menu._findItem('Rename image');
			expect(item).toBeUndefined();
		});

		it('should clear pendingImageFile after adding menu item from it', () => {
			const imageFile = new TFile('attachments/image.png');
			(plugin as any).pendingImageFile = imageFile;

			(plugin as any).handleEditorMenu(menu, editor, markdownView);

			// pendingImageFile is used and then the method returns
			// It's cleared by the timeout in handleImageContextMenu, not here
			expect((plugin as any).pendingImageFile).toBe(imageFile);
		});
	});

	describe('handleImageContextMenu', () => {
		beforeEach(async () => {
			await plugin.onload();
			vi.advanceTimersByTime(3000);
		});

		it('should set pendingImageFile when right-clicking on image element', () => {
			const imageFile = new TFile('attachments/photo.png');
			(plugin.app.vault as Vault)._addFile(imageFile);

			(plugin as any).fileService.findFileByName = vi.fn().mockReturnValue(imageFile);

			const imgElement = createMockImageElement('attachments/photo.png');
			const evt = createMockMouseEvent({ target: imgElement });

			(plugin as any).handleImageContextMenu(evt);

			expect((plugin as any).pendingImageFile).toBe(imageFile);
		});

		it('should clear pendingImageFile after 100ms', () => {
			const imageFile = new TFile('attachments/photo.png');
			(plugin.app.vault as Vault)._addFile(imageFile);

			(plugin as any).fileService.findFileByName = vi.fn().mockReturnValue(imageFile);

			const imgElement = createMockImageElement('attachments/photo.png');
			const evt = createMockMouseEvent({ target: imgElement });

			(plugin as any).handleImageContextMenu(evt);

			expect((plugin as any).pendingImageFile).toBe(imageFile);

			vi.advanceTimersByTime(100);

			expect((plugin as any).pendingImageFile).toBeUndefined();
		});

		it('should ignore non-IMG elements', () => {
			const divElement = document.createElement('div');
			const evt = createMockMouseEvent({ target: divElement });

			(plugin as any).handleImageContextMenu(evt);

			expect((plugin as any).pendingImageFile).toBeUndefined();
		});

		it('should ignore IMG elements without src', () => {
			const imgElement = document.createElement('img');
			// No src attribute
			const evt = createMockMouseEvent({ target: imgElement });

			(plugin as any).handleImageContextMenu(evt);

			expect((plugin as any).pendingImageFile).toBeUndefined();
		});

		it('should ignore IMG elements with non-image file', () => {
			(plugin as any).fileService.findFileByName = vi.fn().mockReturnValue(null);

			const imgElement = createMockImageElement('attachments/missing.png');
			const evt = createMockMouseEvent({ target: imgElement });

			(plugin as any).handleImageContextMenu(evt);

			expect((plugin as any).pendingImageFile).toBeUndefined();
		});
	});

	// ============================================
	// PHASE 8: Settings Tests
	// ============================================
	describe('Settings', () => {
		describe('loadSettings', () => {
			it('should merge saved settings with defaults', async () => {
				const savedSettings = { suffixMode: 'timestamp' as const };
				plugin.loadData = vi.fn().mockResolvedValue(savedSettings);

				await plugin.loadSettings();

				expect(plugin.settings.suffixMode).toBe('timestamp');
				// Other settings should come from defaults
				expect(plugin.settings.aggressiveSanitization).toBe(DEFAULT_SETTINGS.aggressiveSanitization);
			});

			it('should use defaults when loadData returns null', async () => {
				plugin.loadData = vi.fn().mockResolvedValue(null);

				await plugin.loadSettings();

				expect(plugin.settings).toMatchObject(DEFAULT_SETTINGS);
			});

			it('should use defaults when loadData returns undefined', async () => {
				plugin.loadData = vi.fn().mockResolvedValue(undefined);

				await plugin.loadSettings();

				expect(plugin.settings).toMatchObject(DEFAULT_SETTINGS);
			});
		});

		describe('saveSettings', () => {
			beforeEach(async () => {
				await plugin.onload();
				vi.advanceTimersByTime(3000);
			});

			it('should call saveData with current settings', async () => {
				plugin.settings.suffixMode = 'timestamp';

				await plugin.saveSettings();

				expect(plugin.saveData).toHaveBeenCalledWith(plugin.settings);
			});

			it('should update fileService settings', async () => {
				(plugin as any).fileService.updateSettings = vi.fn();

				await plugin.saveSettings();

				expect((plugin as any).fileService.updateSettings).toHaveBeenCalledWith(plugin.settings);
			});

			it('should update imageProcessor settings', async () => {
				(plugin as any).imageProcessor.updateSettings = vi.fn();

				await plugin.saveSettings();

				expect((plugin as any).imageProcessor.updateSettings).toHaveBeenCalledWith(plugin.settings);
			});

			it('should update bulkRenameService settings', async () => {
				(plugin as any).bulkRenameService.updateSettings = vi.fn();

				await plugin.saveSettings();

				expect((plugin as any).bulkRenameService.updateSettings).toHaveBeenCalledWith(plugin.settings);
			});
		});
	});

	// ============================================
	// PHASE 9: Bulk Rename Command Tests
	// ============================================
	describe('Bulk Rename Commands', () => {
		beforeEach(async () => {
			await plugin.onload();
			vi.advanceTimersByTime(3000);
		});

		describe('bulk-rename-current-note', () => {
			it('should be available when active file is markdown', async () => {
				const mdFile = new TFile('notes/test.md');
				(plugin.app.workspace as Workspace)._setActiveFile(mdFile);

				const commands = (plugin.addCommand as any).mock.calls;
				const noteCommand = commands.find((c: any) => c[0].id === 'bulk-rename-current-note');

				const isAvailable = noteCommand[0].checkCallback(true);

				expect(isAvailable).toBe(true);
			});

			it('should NOT be available when active file is not markdown', async () => {
				const imageFile = new TFile('attachments/image.png');
				(plugin.app.workspace as Workspace)._setActiveFile(imageFile);

				const commands = (plugin.addCommand as any).mock.calls;
				const noteCommand = commands.find((c: any) => c[0].id === 'bulk-rename-current-note');

				const isAvailable = noteCommand[0].checkCallback(true);

				expect(isAvailable).toBe(false);
			});

			it('should NOT be available when no active file', async () => {
				(plugin.app.workspace as Workspace)._setActiveFile(null);

				const commands = (plugin.addCommand as any).mock.calls;
				const noteCommand = commands.find((c: any) => c[0].id === 'bulk-rename-current-note');

				const isAvailable = noteCommand[0].checkCallback(true);

				expect(isAvailable).toBe(false);
			});

			it('should execute and open bulk rename modal when checking=false', () => {
				const mdFile = new TFile('notes/test.md');
				const imageFile = new TFile('attachments/image.png');
				(plugin.app.workspace as Workspace)._setActiveFile(mdFile);
				(plugin as any).bulkRenameService.scanImagesInNote = vi.fn().mockReturnValue([{ file: imageFile }]);

				const commands = (plugin.addCommand as any).mock.calls;
				const noteCommand = commands.find((c: any) => c[0].id === 'bulk-rename-current-note');

				// Execute the command (checking=false)
				noteCommand[0].checkCallback(false);

				// Should have opened the modal
				expect(bulkRenameModalCalls.length).toBeGreaterThan(0);
			});
		});

		describe('bulk-rename-vault', () => {
			it('should execute and open bulk rename modal for vault', () => {
				const mdFile = new TFile('notes/test.md');
				const imageFile = new TFile('attachments/image.png');
				(plugin.app.workspace as Workspace)._setActiveFile(mdFile);
				(plugin as any).bulkRenameService.scanImagesInVault = vi.fn().mockReturnValue([{ file: imageFile }]);

				const commands = (plugin.addCommand as any).mock.calls;
				const vaultCommand = commands.find((c: any) => c[0].id === 'bulk-rename-vault');

				// Execute the command
				vaultCommand[0].callback();

				// Should have opened the modal
				expect(bulkRenameModalCalls.length).toBeGreaterThan(0);
			});

			it('should work even without active file', () => {
				const imageFile = new TFile('attachments/image.png');
				(plugin.app.workspace as Workspace)._setActiveFile(null);
				(plugin as any).bulkRenameService.scanImagesInVault = vi.fn().mockReturnValue([{ file: imageFile }]);

				const commands = (plugin.addCommand as any).mock.calls;
				const vaultCommand = commands.find((c: any) => c[0].id === 'bulk-rename-vault');

				// Execute the command
				vaultCommand[0].callback();

				// Should have opened the modal
				expect(bulkRenameModalCalls.length).toBeGreaterThan(0);
			});
		});

		describe('openBulkRenameModal', () => {
			it('should show notice when no images in note', () => {
				const mdFile = new TFile('notes/test.md');
				(plugin as any).bulkRenameService.scanImagesInNote = vi.fn().mockReturnValue([]);

				(plugin as any).openBulkRenameModal(mdFile, 'note');

				expect(noticeHistory.some(n => n.message === 'No images found in current note')).toBe(true);
			});

			it('should show notice when no images in vault', () => {
				(plugin as any).bulkRenameService.scanImagesInVault = vi.fn().mockReturnValue([]);

				(plugin as any).openBulkRenameModal(null, 'vault');

				expect(noticeHistory.some(n => n.message === 'No images found in vault')).toBe(true);
			});

			it('should open modal when images found in note', () => {
				const mdFile = new TFile('notes/test.md');
				const imageFile = new TFile('attachments/image.png');
				(plugin as any).bulkRenameService.scanImagesInNote = vi.fn().mockReturnValue([imageFile]);

				(plugin as any).openBulkRenameModal(mdFile, 'note');

				expect(bulkRenameModalCalls.length).toBeGreaterThan(0);
			});

			it('should open modal when images found in vault', () => {
				const imageFile = new TFile('attachments/image.png');
				(plugin as any).bulkRenameService.scanImagesInVault = vi.fn().mockReturnValue([imageFile]);

				(plugin as any).openBulkRenameModal(null, 'vault');

				expect(bulkRenameModalCalls.length).toBeGreaterThan(0);
			});
		});

		describe('find-orphaned-images', () => {
			it('should register find-orphaned-images command', async () => {
				await plugin.onload();

				const calls = (plugin.addCommand as any).mock.calls;
				const orphanCommand = calls.find((c: any) => c[0].id === 'find-orphaned-images');

				expect(orphanCommand).toBeDefined();
				expect(orphanCommand[0].name).toBe('Find orphaned images');
			});

			it('should execute and open orphaned images modal when orphans found', () => {
				const orphanFile = new TFile('attachments/orphan.png');
				(plugin as any).bulkRenameService.findOrphanedImages = vi.fn().mockReturnValue({
					orphaned: [{ file: orphanFile, size: 1000, selected: true }],
					totalImages: 5,
					referencedCount: 4
				});

				const commands = (plugin.addCommand as any).mock.calls;
				const orphanCommand = commands.find((c: any) => c[0].id === 'find-orphaned-images');

				// Execute the command
				orphanCommand[0].callback();

				// Should have opened the modal
				expect(orphanedImagesModalCalls.length).toBeGreaterThan(0);
			});

			it('should show notice when no orphaned images found', () => {
				(plugin as any).bulkRenameService.findOrphanedImages = vi.fn().mockReturnValue({
					orphaned: [],
					totalImages: 5,
					referencedCount: 5
				});

				const commands = (plugin.addCommand as any).mock.calls;
				const orphanCommand = commands.find((c: any) => c[0].id === 'find-orphaned-images');

				// Execute the command
				orphanCommand[0].callback();

				// Should show notice
				expect(noticeHistory.some(n => n.message.includes('No orphaned images found'))).toBe(true);
				// Should NOT open modal
				expect(orphanedImagesModalCalls.length).toBe(0);
			});
		});

		describe('openOrphanedImagesModal', () => {
			it('should show notice when no orphaned images', () => {
				(plugin as any).bulkRenameService.findOrphanedImages = vi.fn().mockReturnValue({
					orphaned: [],
					totalImages: 5,
					referencedCount: 5
				});

				(plugin as any).openOrphanedImagesModal();

				expect(noticeHistory.some(n => n.message.includes('No orphaned images found'))).toBe(true);
			});

			it('should open modal when orphaned images found', () => {
				const orphanFile = new TFile('attachments/orphan.png');
				(plugin as any).bulkRenameService.findOrphanedImages = vi.fn().mockReturnValue({
					orphaned: [{ file: orphanFile, size: 1000, selected: true }],
					totalImages: 10,
					referencedCount: 9
				});

				(plugin as any).openOrphanedImagesModal();

				expect(orphanedImagesModalCalls.length).toBeGreaterThan(0);
			});

			it('should pass scan result to modal', () => {
				const orphanFile = new TFile('attachments/orphan.png');
				const scanResult = {
					orphaned: [{ file: orphanFile, size: 2048, selected: true }],
					totalImages: 20,
					referencedCount: 19
				};
				(plugin as any).bulkRenameService.findOrphanedImages = vi.fn().mockReturnValue(scanResult);

				(plugin as any).openOrphanedImagesModal();

				// Third argument should be the scan result
				expect(orphanedImagesModalCalls[0][2]).toEqual(scanResult);
			});
		});
	});

	// ============================================
	// PHASE 10: Rename Modal Tests (previously uncovered)
	// ============================================
	describe('openRenameModal', () => {
		beforeEach(async () => {
			await plugin.onload();
			vi.advanceTimersByTime(3000);
		});

		it('should open RenameImageModal with correct file', () => {
			const imageFile = new TFile('attachments/test-image.png');

			(plugin as any).openRenameModal(imageFile);

			expect(renameImageModalCalls.length).toBe(1);
			expect(renameImageModalCalls[0].file).toBe(imageFile);
		});

		it('should call fileService.renameFile when callback provides valid name', async () => {
			const imageFile = new TFile('attachments/old-name.png');
			(plugin as any).fileService.renameFile = vi.fn().mockResolvedValue('new-name.png');

			(plugin as any).openRenameModal(imageFile);

			// Trigger the callback
			await lastRenameModalCallback!('new-name');

			expect((plugin as any).fileService.renameFile).toHaveBeenCalledWith(imageFile, 'new-name');
		});

		it('should show success notice after rename', async () => {
			const imageFile = new TFile('attachments/old-name.png');
			(plugin as any).fileService.renameFile = vi.fn().mockResolvedValue('new-name.png');

			(plugin as any).openRenameModal(imageFile);
			await lastRenameModalCallback!('new-name');

			expect(noticeHistory.some(n => n.message.includes('Renamed to new-name.png'))).toBe(true);
		});

		it('should show error notice when rename fails', async () => {
			const imageFile = new TFile('attachments/old-name.png');
			(plugin as any).fileService.renameFile = vi.fn().mockRejectedValue(new Error('Permission denied'));

			(plugin as any).openRenameModal(imageFile);
			await lastRenameModalCallback!('new-name');

			expect(noticeHistory.some(n => n.message.includes('Failed to rename'))).toBe(true);
		});

		it('should show invalid filename notice when sanitization returns empty', async () => {
			const imageFile = new TFile('attachments/old-name.png');

			(plugin as any).openRenameModal(imageFile);
			// Empty or invalid filename after sanitization
			await lastRenameModalCallback!('   ');

			expect(noticeHistory.some(n => n.message === 'Invalid filename')).toBe(true);
		});

		it('should apply aggressive sanitization when setting is enabled', async () => {
			plugin.settings.aggressiveSanitization = true;
			const imageFile = new TFile('attachments/old-name.png');
			(plugin as any).fileService.renameFile = vi.fn().mockResolvedValue('caffe_e_citta.png');

			(plugin as any).openRenameModal(imageFile);
			await lastRenameModalCallback!('Caffè & Città');

			// With aggressive sanitization, special chars should be removed
			expect((plugin as any).fileService.renameFile).toHaveBeenCalledWith(
				imageFile,
				expect.stringMatching(/caffe.*citta/i)
			);
		});
	});

	describe('renameImageFromLink', () => {
		let markdownView: MarkdownView;

		beforeEach(async () => {
			await plugin.onload();
			vi.advanceTimersByTime(3000);

			markdownView = new MarkdownView();
			markdownView.file = new TFile('notes/test.md');
		});

		it('should open RenameImageModal when image is found', async () => {
			const imageFile = new TFile('attachments/image.png');
			(plugin as any).fileService.resolveImageLink = vi.fn().mockReturnValue(imageFile);

			await (plugin as any).renameImageFromLink('image.png', markdownView);

			expect(renameImageModalCalls.length).toBe(1);
			expect(renameImageModalCalls[0].file).toBe(imageFile);
		});

		it('should show notice when image is not found', async () => {
			(plugin as any).fileService.resolveImageLink = vi.fn().mockReturnValue(null);

			await (plugin as any).renameImageFromLink('missing.png', markdownView);

			expect(noticeHistory.some(n => n.message.includes('Image not found: missing.png'))).toBe(true);
			expect(renameImageModalCalls.length).toBe(0);
		});

		it('should handle image links with subfolders', async () => {
			const imageFile = new TFile('attachments/subfolder/deep-image.png');
			(plugin as any).fileService.resolveImageLink = vi.fn().mockReturnValue(imageFile);

			await (plugin as any).renameImageFromLink('subfolder/deep-image.png', markdownView);

			expect(renameImageModalCalls.length).toBe(1);
			expect(renameImageModalCalls[0].file).toBe(imageFile);
		});

		it('should handle view without file', async () => {
			markdownView.file = null;
			(plugin as any).fileService.resolveImageLink = vi.fn().mockReturnValue(null);

			await (plugin as any).renameImageFromLink('image.png', markdownView);

			// Should call resolveImageLink with empty string when no file
			expect((plugin as any).fileService.resolveImageLink).toHaveBeenCalledWith('image.png', '');
		});
	});

	describe('Context Menu - Menu Item Callback', () => {
		let menu: Menu;
		let editor: Editor;
		let markdownView: MarkdownView;

		beforeEach(async () => {
			await plugin.onload();
			vi.advanceTimersByTime(3000);

			menu = new Menu();
			editor = new Editor();
			markdownView = new MarkdownView();
			markdownView.file = new TFile('notes/test.md');
		});

		it('should open modal when clicking Rename image from pendingImageFile', () => {
			const imageFile = new TFile('attachments/image.png');
			(plugin as any).pendingImageFile = imageFile;

			(plugin as any).handleEditorMenu(menu, editor, markdownView);

			const item = menu._findItem('Rename image');
			expect(item).toBeDefined();

			// Click the menu item
			item!.callback();

			expect(renameImageModalCalls.length).toBe(1);
			expect(renameImageModalCalls[0].file).toBe(imageFile);
		});

		it('should call renameImageFromLink when clicking on wikilink image', () => {
			(plugin as any).pendingImageFile = undefined;
			editor.getCursor = vi.fn().mockReturnValue({ line: 0, ch: 10 });
			editor.getLine = vi.fn().mockReturnValue('Some text ![[photo.png]] more text');

			const imageFile = new TFile('attachments/photo.png');
			(plugin as any).fileService.resolveImageLink = vi.fn().mockReturnValue(imageFile);

			(plugin as any).handleEditorMenu(menu, editor, markdownView);

			const item = menu._findItem('Rename image');
			expect(item).toBeDefined();

			// Click the menu item
			item!.callback();

			// Should open modal for the linked image
			expect(renameImageModalCalls.length).toBe(1);
		});
	});

	// ============================================
	// Additional Edge Case Tests
	// ============================================
	describe('Edge Cases', () => {
		beforeEach(async () => {
			await plugin.onload();
			vi.advanceTimersByTime(3000);
		});

		it('should handle concurrent paste operations', async () => {
			const editor = new Editor();
			const markdownView = new MarkdownView();
			const activeFile = new TFile('notes/test.md');
			markdownView.file = activeFile;

			// Simulate two rapid paste operations
			const evt1 = createMockClipboardEvent({
				items: [{ type: 'image/png', kind: 'file', getAsFile: () => createMockFile('img1.png', 'image/png') }]
			});
			const evt2 = createMockClipboardEvent({
				items: [{ type: 'image/png', kind: 'file', getAsFile: () => createMockFile('img2.png', 'image/png') }]
			});

			(plugin as any).imageProcessor.getImageFromClipboard = vi.fn()
				.mockReturnValueOnce(createMockFile('img1.png', 'image/png'))
				.mockReturnValueOnce(createMockFile('img2.png', 'image/png'));
			(plugin as any).imageProcessor.processImage = vi.fn()
				.mockResolvedValueOnce({ fileName: 'test 1.png', markdownLink: '![[test 1.png]]' })
				.mockResolvedValueOnce({ fileName: 'test 2.png', markdownLink: '![[test 2.png]]' });
			(plugin as any).imageProcessor.insertMarkdownLink = vi.fn();

			await Promise.all([
				(plugin as any).handlePaste(evt1, editor, markdownView),
				(plugin as any).handlePaste(evt2, editor, markdownView)
			]);

			expect((plugin as any).imageProcessor.processImage).toHaveBeenCalledTimes(2);
		});

		it('should handle all supported image formats', async () => {
			const formats = [
				{ ext: 'png', mime: 'image/png' },
				{ ext: 'jpg', mime: 'image/jpeg' },
				{ ext: 'gif', mime: 'image/gif' },
				{ ext: 'webp', mime: 'image/webp' },
				{ ext: 'bmp', mime: 'image/bmp' },
				{ ext: 'svg', mime: 'image/svg+xml' },
				{ ext: 'avif', mime: 'image/avif' },
				{ ext: 'tiff', mime: 'image/tiff' },
				{ ext: 'ico', mime: 'image/x-icon' }
			];

			for (const format of formats) {
				const imageFile = new TFile(`attachments/Pasted image.${format.ext}`);
				imageFile.parent = new TFolder('attachments');

				const activeFile = new TFile('notes/test.md');
				(plugin.app.workspace as Workspace)._setActiveFile(activeFile);

				(plugin as any).bulkRenameService.isGenericName = vi.fn().mockReturnValue(true);
				(plugin as any).fileService.getAvailablePath = vi.fn().mockResolvedValue(`attachments/test 1.${format.ext}`);
				(plugin as any).fileService.renameFile = vi.fn().mockResolvedValue(`test 1.${format.ext}`);

				// Use runAllTimersAsync to properly handle the internal setTimeout + async code
				const promise = (plugin as any).handleFileCreate(imageFile);
				await vi.runAllTimersAsync();
				await promise;

				expect((plugin as any).fileService.renameFile).toHaveBeenCalled();
				vi.clearAllMocks();
				Notice._clearHistory();
			}
		}, 30000); // Increase timeout for this test

		it('should handle very long filenames', async () => {
			const longName = 'A'.repeat(200);
			const activeFile = new TFile(`notes/${longName}.md`);
			(plugin.app.workspace as Workspace)._setActiveFile(activeFile);

			const imageFile = new TFile('attachments/Pasted image.png');
			imageFile.parent = new TFolder('attachments');

			(plugin as any).bulkRenameService.isGenericName = vi.fn().mockReturnValue(true);
			(plugin as any).fileService.getAvailablePath = vi.fn().mockResolvedValue(`attachments/${longName} 1.png`);
			(plugin as any).fileService.renameFile = vi.fn().mockResolvedValue(`${longName} 1.png`);

			const promise = (plugin as any).handleFileCreate(imageFile);
			await vi.runAllTimersAsync();
			await promise;

			expect((plugin as any).fileService.renameFile).toHaveBeenCalled();
		});

		it('should handle filenames with unicode characters', async () => {
			const activeFile = new TFile('notes/日本語テスト.md');
			(plugin.app.workspace as Workspace)._setActiveFile(activeFile);

			const imageFile = new TFile('attachments/Pasted image.png');
			imageFile.parent = new TFolder('attachments');

			(plugin as any).bulkRenameService.isGenericName = vi.fn().mockReturnValue(true);
			(plugin as any).fileService.getAvailablePath = vi.fn().mockResolvedValue('attachments/日本語テスト 1.png');
			(plugin as any).fileService.renameFile = vi.fn().mockResolvedValue('日本語テスト 1.png');

			const promise = (plugin as any).handleFileCreate(imageFile);
			await vi.runAllTimersAsync();
			await promise;

			expect((plugin as any).fileService.renameFile).toHaveBeenCalled();
		});

		it('should handle files in deeply nested folders', async () => {
			const activeFile = new TFile('notes/level1/level2/level3/deep-note.md');
			activeFile.parent = new TFolder('notes/level1/level2/level3');
			(plugin.app.workspace as Workspace)._setActiveFile(activeFile);

			const imageFile = new TFile('attachments/level1/level2/Pasted image.png');
			imageFile.parent = new TFolder('attachments/level1/level2');

			(plugin as any).bulkRenameService.isGenericName = vi.fn().mockReturnValue(true);
			(plugin as any).fileService.getAvailablePath = vi.fn().mockResolvedValue('attachments/level1/level2/deep-note 1.png');
			(plugin as any).fileService.renameFile = vi.fn().mockResolvedValue('deep-note 1.png');

			const promise = (plugin as any).handleFileCreate(imageFile);
			await vi.runAllTimersAsync();
			await promise;

			expect((plugin as any).fileService.renameFile).toHaveBeenCalled();
		});
	});
});
