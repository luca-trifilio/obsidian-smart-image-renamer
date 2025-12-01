import { Plugin, TFile, MarkdownView, Notice, Menu, Editor, TAbstractFile } from 'obsidian';
import { SmartImageRenamerSettings, DEFAULT_SETTINGS } from './src/types/settings';
import { FileService, ImageProcessor, BulkRenameService } from './src/services';
import { SmartImageRenamerSettingTab, RenameImageModal, BulkRenameModal } from './src/ui';
import {
	sanitizeFilename,
	isImageFile,
	getImageLinkAtCursor,
	extractImagePathFromSrc,
	removeNoteSuffixes
} from './src/utils';
import { BulkRenameScope } from './src/types/bulk-rename';

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

	async onload(): Promise<void> {
		await this.loadSettings();

		this.fileService = new FileService(this.app, this.settings);
		this.imageProcessor = new ImageProcessor(this.fileService, this.settings);
		this.bulkRenameService = new BulkRenameService(this.app, this.settings);

		this.addSettingTab(new SmartImageRenamerSettingTab(this.app, this));

		// Register commands
		this.addCommand({
			id: 'bulk-rename-current-note',
			name: 'Rename images in current note',
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
			name: 'Rename all images in vault',
			callback: () => {
				const activeFile = this.app.workspace.getActiveFile();
				this.openBulkRenameModal(activeFile, 'vault');
			},
		});

		this.registerEvent(
			this.app.workspace.on('editor-paste', this.handlePaste.bind(this))
		);

		this.registerEvent(
			this.app.workspace.on('editor-drop', this.handleDrop.bind(this))
		);

		this.registerEvent(
			this.app.workspace.on('editor-menu', this.handleEditorMenu.bind(this))
		);

		// Context menu on rendered images - capture phase to run before Obsidian
		this.registerDomEvent(
			document,
			'contextmenu',
			this.handleImageContextMenu.bind(this),
			true
		);

		// Monitor file creation for auto-rename (drag & drop, Excalidraw, etc.)
		this.registerEvent(
			this.app.vault.on('create', this.handleFileCreate.bind(this))
		);

		// Mark startup as complete after a delay to avoid processing existing files
		// during vault indexing
		setTimeout(() => {
			this.isStartupComplete = true;
			console.log('[Smart Image Renamer] Startup complete, now monitoring file creation');
		}, 3000);
	}

	onunload(): void {
		// Cleanup if needed
	}

	async loadSettings(): Promise<void> {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
		this.fileService?.updateSettings(this.settings);
		this.imageProcessor?.updateSettings(this.settings);
		this.bulkRenameService?.updateSettings(this.settings);
	}

	private openBulkRenameModal(activeFile: TFile | null, scope: BulkRenameScope): void {
		// Check if there are images before opening modal
		if (scope === 'note' && activeFile) {
			const images = this.bulkRenameService.scanImagesInNote(activeFile);
			if (images.length === 0) {
				new Notice('No images found in current note');
				return;
			}
		} else if (scope === 'vault') {
			const images = this.bulkRenameService.scanImagesInVault();
			if (images.length === 0) {
				new Notice('No images found in vault');
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

	private handleEditorMenu(menu: Menu, editor: Editor, view: MarkdownView): void {
		// Check if we have a pending image from DOM right-click
		if (this.pendingImageFile) {
			const file = this.pendingImageFile;
			menu.addItem((item) => {
				item.setTitle('Rename image')
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
			item.setTitle('Rename image')
				.setIcon('pencil')
				.onClick(() => this.renameImageFromLink(imageLink, view));
		});
	}

	private openRenameModal(file: TFile): void {
		new RenameImageModal(this.app, file, async (newName) => {
			const sanitized = sanitizeFilename(newName, this.settings.aggressiveSanitization);
			if (!sanitized) {
				new Notice('Invalid filename');
				return;
			}

			try {
				const newFileName = await this.fileService.renameFile(file, sanitized);
				new Notice(`Renamed to ${newFileName}`);
			} catch (error) {
				new Notice(`Failed to rename: ${error}`);
			}
		}).open();
	}

	private async renameImageFromLink(imageName: string, view: MarkdownView): Promise<void> {
		const file = this.fileService.resolveImageLink(imageName, view.file?.path || '');
		if (!file) {
			new Notice(`Image not found: ${imageName}`);
			return;
		}

		this.openRenameModal(file);
	}

	private async handlePaste(
		evt: ClipboardEvent,
		_editor: Editor,
		markdownView: MarkdownView
	): Promise<void> {
		const clipboardData = evt.clipboardData;
		if (!clipboardData) return;

		const imageFile = this.imageProcessor.getImageFromClipboard(clipboardData);
		if (!imageFile) return;

		evt.preventDefault();

		const activeFile = markdownView.file;
		if (!activeFile) {
			new Notice('No active file found');
			return;
		}

		try {
			const result = await this.imageProcessor.processImage(imageFile, activeFile);
			// Mark this file as processed to avoid double-renaming
			this.processingFiles.add(result.fileName);
			setTimeout(() => this.processingFiles.delete(result.fileName), 1000);

			this.imageProcessor.insertMarkdownLink(markdownView.editor, result.markdownLink);
			new Notice(`Image saved as ${result.fileName}`);
		} catch (error) {
			console.error('Smart Image Renamer error:', error);
			new Notice(`Failed to save image: ${error}`);
		}
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
			new Notice('No active file found');
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
				new Notice(`Image saved as ${result.fileName}`);
			} catch (error) {
				console.error('Smart Image Renamer error:', error);
				new Notice(`Failed to save image: ${error}`);
			}
		}
	}

	private async handleFileCreate(file: TAbstractFile): Promise<void> {
		// Skip during startup to avoid processing existing files during vault indexing
		if (!this.isStartupComplete) {
			return;
		}

		console.log('[Smart Image Renamer] File created:', file.path);

		// Only process if setting is enabled
		if (!this.settings.autoRenameOnCreate) {
			console.log('[Smart Image Renamer] Auto-rename disabled in settings');
			return;
		}

		// Only process files (not folders)
		if (!(file instanceof TFile)) {
			console.log('[Smart Image Renamer] Not a file, skipping');
			return;
		}

		// Only process images
		if (!isImageFile(file.extension)) {
			console.log('[Smart Image Renamer] Not an image file:', file.extension);
			return;
		}

		// Skip if we already processed this file (e.g., from paste handler)
		if (this.processingFiles.has(file.name)) {
			console.log('[Smart Image Renamer] Already processing this file');
			return;
		}

		// Check if it has a generic name
		const isGeneric = this.bulkRenameService.isGenericName(file.basename);
		console.log('[Smart Image Renamer] Is generic name?', file.basename, isGeneric);
		if (!isGeneric) return;

		// Small delay to let the file system settle and get the active file
		await new Promise(resolve => setTimeout(resolve, 100));

		// Get the active file to use for naming
		const activeFile = this.app.workspace.getActiveFile();
		console.log('[Smart Image Renamer] Active file:', activeFile?.path);
		if (!activeFile) return;

		// Generate new name based on active file
		const baseName = this.getCleanBaseName(activeFile);
		console.log('[Smart Image Renamer] Clean base name:', baseName);
		const sanitized = sanitizeFilename(baseName, this.settings.aggressiveSanitization);
		console.log('[Smart Image Renamer] Sanitized name:', sanitized);

		if (!sanitized) {
			console.log('[Smart Image Renamer] Sanitized name is empty, skipping');
			return;
		}

		try {
			// Mark as processing
			this.processingFiles.add(file.path);
			console.log('[Smart Image Renamer] Renaming to:', sanitized);

			const newFileName = await this.fileService.renameFile(file, sanitized);
			new Notice(`Auto-renamed to ${newFileName}`);
			console.log('[Smart Image Renamer] Renamed successfully to:', newFileName);
		} catch (error) {
			console.error('[Smart Image Renamer] Auto-rename error:', error);

			// Handle "file already exists" error
			const errorMessage = error instanceof Error ? error.message : String(error);
			if (errorMessage.includes('already exists')) {
				new Notice(
					`Could not auto-rename "${file.name}" - a file with that name already exists. ` +
					`Right-click on the image to rename it manually.`,
					5000
				);
			} else {
				new Notice(`Failed to auto-rename: ${errorMessage}`);
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
