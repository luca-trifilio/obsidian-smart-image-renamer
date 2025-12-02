import { Plugin, TFile, MarkdownView, MarkdownFileInfo, Notice, Menu, Editor, TAbstractFile } from 'obsidian';
import { SmartImageRenamerSettings, DEFAULT_SETTINGS } from './src/types/settings';
import { FileService, ImageProcessor, BulkRenameService } from './src/services';
import { SmartImageRenamerSettingTab, RenameImageModal, BulkRenameModal, OrphanedImagesModal } from './src/ui';
import {
	sanitizeFilename,
	isImageFile,
	getImageLinkAtCursor,
	extractImagePathFromSrc,
	removeNoteSuffixes
} from './src/utils';
import { BulkRenameScope } from './src/types/bulk-rename';
import { t } from './src/i18n';

export default class SmartImageRenamer extends Plugin {
	settings: SmartImageRenamerSettings;
	private fileService: FileService;
	private imageProcessor: ImageProcessor;
	private bulkRenameService: BulkRenameService;
	private pendingImageFile: TFile | undefined;
	// Track files we're processing to avoid double-renaming
	private processingFiles: Set<string> = new Set();
	// Flag to skip file creation events during startup
	private isStartupComplete: boolean = false;
	// Flag to force rename (skip generic name check) - set during Excalidraw drops
	private forceRenameNext: boolean = false;

	async onload(): Promise<void> {
		await this.loadSettings();

		this.fileService = new FileService(this.app, this.settings);
		this.imageProcessor = new ImageProcessor(this.fileService, this.settings);
		this.bulkRenameService = new BulkRenameService(this.app, this.settings);

		this.addSettingTab(new SmartImageRenamerSettingTab(this.app, this));

		// Register commands
		this.addCommand({
			id: 'bulk-rename-current-note',
			name: t('commands.renameInNote'),
			checkCallback: (checking: boolean) => {
				const activeFile = this.app.workspace.getActiveFile();
				if (activeFile?.extension === 'md') {
					if (!checking) {
						this.openBulkRenameModal(activeFile, 'note');
					}
					return true;
				}
				return false;
			},
		});

		this.addCommand({
			id: 'bulk-rename-vault',
			name: t('commands.renameInVault'),
			callback: () => {
				const activeFile = this.app.workspace.getActiveFile();
				this.openBulkRenameModal(activeFile, 'vault');
			},
		});

		this.addCommand({
			id: 'find-orphaned-images',
			name: t('commands.findOrphaned'),
			callback: () => this.openOrphanedImagesModal(),
		});

		this.registerEvent(
			this.app.workspace.on('editor-paste', (evt, editor, view) => {
				void this.handlePaste(evt, editor, view);
			})
		);

		this.registerEvent(
			this.app.workspace.on('editor-drop', (evt, editor, view) => {
				void this.handleDrop(evt, editor, view);
			})
		);

		this.registerEvent(
			this.app.workspace.on('editor-menu', (menu, editor, view) => {
				this.handleEditorMenu(menu, editor, view);
			})
		);

		// Context menu on rendered images - capture phase to run before Obsidian
		this.registerDomEvent(
			document,
			'contextmenu',
			(evt: MouseEvent) => { this.handleImageContextMenu(evt); },
			true
		);

		// Global drop handler - capture phase to intercept before Excalidraw
		this.registerDomEvent(
			document,
			'drop',
			(evt: DragEvent) => { void this.handleGlobalDrop(evt); },
			true
		);

		// Monitor file creation for auto-rename (drag & drop, Excalidraw, etc.)
		this.registerEvent(
			this.app.vault.on('create', (file) => { void this.handleFileCreate(file); })
		);

		// Mark startup as complete after a delay to avoid processing existing files
		// during vault indexing
		setTimeout(() => {
			this.isStartupComplete = true;
		}, 3000);
	}

	onunload(): void {
		// Cleanup if needed
	}

	async loadSettings(): Promise<void> {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData() as SmartImageRenamerSettings | null);
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
		this.fileService?.updateSettings(this.settings);
		this.imageProcessor?.updateSettings(this.settings);
		this.bulkRenameService?.updateSettings(this.settings);
	}

	private openBulkRenameModal(activeFile: TFile | null, scope: BulkRenameScope): void {
		// Check if there are images before opening modal
		let images;
		if (scope === 'note' && activeFile) {
			images = this.bulkRenameService.scanImagesInNote(activeFile);
			if (images.length === 0) {
				new Notice(t('notices.noImagesInNote'));
				return;
			}
		} else if (scope === 'vault') {
			images = this.bulkRenameService.scanImagesInVault();
			if (images.length === 0) {
				new Notice(t('notices.noImagesInVault'));
				return;
			}
		}

		// Check if any images actually need renaming (using default settings: replace mode, all filter)
		if (images && images.length > 0) {
			const preview = this.bulkRenameService.generatePreview(images, 'replace', 'all');
			if (preview.length === 0) {
				new Notice(t('notices.allImagesCorrect'));
				return;
			}
		}

		new BulkRenameModal(
			this.app,
			this.bulkRenameService,
			activeFile,
			scope
		).open();
	}

	private openOrphanedImagesModal(): void {
		const result = this.bulkRenameService.findOrphanedImages();

		if (result.orphaned.length === 0) {
			new Notice(t('notices.noOrphanedImages'));
			return;
		}

		new OrphanedImagesModal(this.app, this.bulkRenameService, result).open();
	}

	private handleImageContextMenu(evt: MouseEvent): void {
		const target = evt.target as HTMLElement;
		if (target.tagName !== 'IMG') return;

		const img = target as HTMLImageElement;
		const src = img.getAttribute('src');
		if (!src) return;

		const fileName = extractImagePathFromSrc(src);
		if (!fileName) return;

		const file = this.fileService.findFileByName(fileName);
		if (!file || !isImageFile(file.extension)) return;

		this.pendingImageFile = file;

		// Clear pending file after a tiny delay
		setTimeout(() => {
			this.pendingImageFile = undefined;
		}, 100);
	}

	private handleEditorMenu(menu: Menu, editor: Editor, info: MarkdownView | MarkdownFileInfo): void {
		// Check if we have a pending image from DOM right-click
		if (this.pendingImageFile) {
			const file = this.pendingImageFile;
			menu.addItem((item) => {
				item.setTitle(t('menu.renameImage'))
					.setIcon('pencil')
					.onClick(() => this.openRenameModal(file));
			});
			return;
		}

		// Check if cursor is on a wikilink
		const cursor = editor.getCursor();
		const line = editor.getLine(cursor.line);
		const imageLink = getImageLinkAtCursor(line, cursor.ch);

		if (!imageLink) return;

		menu.addItem((item) => {
			item.setTitle(t('menu.renameImage'))
				.setIcon('pencil')
				.onClick(() => this.renameImageFromLink(imageLink, info));
		});
	}

	private openRenameModal(file: TFile): void {
		new RenameImageModal(this.app, file, async (newName) => {
			const sanitized = sanitizeFilename(newName, this.settings.aggressiveSanitization);
			if (!sanitized) {
				new Notice(t('notices.invalidFilename'));
				return;
			}

			try {
				const newFileName = await this.fileService.renameFile(file, sanitized);
				new Notice(t('notices.renamedTo', { name: newFileName }));
			} catch (error) {
				new Notice(t('notices.failedToRename', { error: String(error) }));
			}
		}).open();
	}

	private async renameImageFromLink(imageName: string, info: MarkdownView | MarkdownFileInfo): Promise<void> {
		const file = this.fileService.resolveImageLink(imageName, info.file?.path || '');
		if (!file) {
			new Notice(t('notices.imageNotFound', { name: imageName }));
			return;
		}

		this.openRenameModal(file);
	}

	private async handlePaste(
		evt: ClipboardEvent,
		editor: Editor,
		info: MarkdownView | MarkdownFileInfo
	): Promise<void> {
		const clipboardData = evt.clipboardData;
		if (!clipboardData) return;

		const imageFile = this.imageProcessor.getImageFromClipboard(clipboardData);
		if (!imageFile) return;

		evt.preventDefault();

		const activeFile = info.file;
		if (!activeFile) {
			new Notice(t('notices.noActiveFile'));
			return;
		}

		try {
			const result = await this.imageProcessor.processImage(imageFile, activeFile);
			// Mark this file as processed to avoid double-renaming
			this.processingFiles.add(result.fileName);
			setTimeout(() => this.processingFiles.delete(result.fileName), 1000);

			this.imageProcessor.insertMarkdownLink(editor, result.markdownLink);
			new Notice(t('notices.imageSavedAs', { name: result.fileName }));
		} catch (error) {
			console.error('Smart Image Renamer error:', error);
			new Notice(t('notices.failedToSave', { error: String(error) }));
		}
	}

	private async handleGlobalDrop(evt: DragEvent): Promise<void> {
		const dataTransfer = evt.dataTransfer;
		if (!dataTransfer) return;

		// Get image files from the drop
		const files = Array.from(dataTransfer.files);
		const imageFiles = files.filter(file => file.type.startsWith('image/'));

		if (imageFiles.length === 0) return;

		// Get the active file (could be markdown or excalidraw)
		const activeFile = this.app.workspace.getActiveFile();

		if (!activeFile) {
			return;
		}

		// Check if we're in an Excalidraw view
		const isExcalidraw = activeFile.extension === 'md' &&
			activeFile.basename.toLowerCase().endsWith('.excalidraw');

		// For Excalidraw, set flag to force rename (skip generic name check)
		// then vault.on('create') will rename it
		if (isExcalidraw) {
			this.forceRenameNext = true;
			// Reset flag after a delay in case the drop doesn't result in a file creation
			setTimeout(() => { this.forceRenameNext = false; }, 5000);
			return;
		}

		// For regular markdown editors, editor-drop will handle it
		// This is a fallback for other cases
	}

	private async handleDrop(
		evt: DragEvent,
		editor: Editor,
		info: MarkdownView | { file: TFile | null }
	): Promise<void> {
		// Check if already handled
		if (evt.defaultPrevented) return;

		const dataTransfer = evt.dataTransfer;
		if (!dataTransfer) return;

		// Get image files from the drop
		const files = Array.from(dataTransfer.files);
		const imageFiles = files.filter(file => file.type.startsWith('image/'));

		if (imageFiles.length === 0) return;

		evt.preventDefault();

		const activeFile = info.file;
		if (!activeFile) {
			new Notice(t('notices.noActiveFile'));
			return;
		}

		// Process each dropped image
		for (const imageFile of imageFiles) {
			try {
				const result = await this.imageProcessor.processImage(imageFile, activeFile);
				// Mark this file as processed to avoid double-renaming
				this.processingFiles.add(result.fileName);
				setTimeout(() => this.processingFiles.delete(result.fileName), 1000);

				this.imageProcessor.insertMarkdownLink(editor, result.markdownLink);
				new Notice(t('notices.imageSavedAs', { name: result.fileName }));
			} catch (error) {
				console.error('Smart Image Renamer error:', error);
				new Notice(t('notices.failedToSave', { error: String(error) }));
			}
		}
	}

	private async handleFileCreate(file: TAbstractFile): Promise<void> {
		// Skip during startup to avoid processing existing files during vault indexing
		if (!this.isStartupComplete) {
			return;
		}

		// Only process if setting is enabled
		if (!this.settings.autoRenameOnCreate) {
			return;
		}

		// Only process files (not folders)
		if (!(file instanceof TFile)) {
			return;
		}

		// Only process images
		if (!isImageFile(file.extension)) {
			return;
		}

		// Skip if we already processed this file (e.g., from paste handler)
		if (this.processingFiles.has(file.name)) {
			return;
		}

		// Check if it has a generic name (or if we're forcing rename from Excalidraw drop)
		const isGeneric = this.bulkRenameService.isGenericName(file.basename);
		const shouldRename = isGeneric || this.forceRenameNext;

		if (!shouldRename) return;

		// Reset the force flag
		this.forceRenameNext = false;

		// Small delay to let the file system settle and get the active file
		await new Promise(resolve => setTimeout(resolve, 100));

		// Get the active file to use for naming
		const activeFile = this.app.workspace.getActiveFile();
		if (!activeFile) return;

		// Generate new name based on active file
		const baseName = this.getCleanBaseName(activeFile);
		const sanitized = sanitizeFilename(baseName, this.settings.aggressiveSanitization);

		if (!sanitized) {
			return;
		}

		try {
			// Mark as processing
			this.processingFiles.add(file.path);

			// Get the folder where the file currently is
			const folderPath = file.parent?.path || '';

			// Get available path with proper suffix (sequential or timestamp)
			const newPath = await this.fileService.getAvailablePath(
				folderPath,
				sanitized,
				file.extension
			);

			// Extract just the filename for the rename
			const newFileName = newPath.split('/').pop() || `${sanitized}.${file.extension}`;
			const newBaseName = newFileName.replace(`.${file.extension}`, '');

			await this.fileService.renameFile(file, newBaseName);
			new Notice(t('notices.autoRenamedTo', { name: newFileName }));
		} catch (error) {
			console.error('[Smart Image Renamer] Auto-rename error:', error);

			// Handle "file already exists" error
			const errorMessage = error instanceof Error ? error.message : String(error);
			if (errorMessage.includes('already exists')) {
				new Notice(t('notices.autoRenameExistsError', { name: file.name }), 5000);
			} else {
				new Notice(t('notices.failedToAutoRename', { error: errorMessage }));
			}
		} finally {
			this.processingFiles.delete(file.path);
		}
	}

	/**
	 * Get clean base name from a file, removing configured suffixes
	 */
	private getCleanBaseName(file: TFile): string {
		return removeNoteSuffixes(file.basename, this.settings.suffixesToRemove);
	}
}
