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

	private async handleFileCreate(file: TAbstractFile): Promise<void> {
		// Only process if setting is enabled
		if (!this.settings.autoRenameOnCreate) return;

		// Only process files (not folders)
		if (!(file instanceof TFile)) return;

		// Only process images
		if (!isImageFile(file.extension)) return;

		// Skip if we already processed this file (e.g., from paste handler)
		if (this.processingFiles.has(file.name)) return;

		// Check if it has a generic name
		if (!this.bulkRenameService.isGenericName(file.basename)) return;

		// Small delay to let the file system settle and get the active file
		await new Promise(resolve => setTimeout(resolve, 100));

		// Get the active file to use for naming
		const activeFile = this.app.workspace.getActiveFile();
		if (!activeFile) return;

		// Generate new name based on active file
		const baseName = this.getCleanBaseName(activeFile);
		const sanitized = sanitizeFilename(baseName, this.settings.aggressiveSanitization);

		if (!sanitized) return;

		try {
			// Mark as processing
			this.processingFiles.add(file.path);

			const newFileName = await this.fileService.renameFile(file, sanitized);
			new Notice(`Auto-renamed to ${newFileName}`);
		} catch (error) {
			console.error('Smart Image Renamer auto-rename error:', error);
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
