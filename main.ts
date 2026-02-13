import { Plugin, TFile, MarkdownView, MarkdownFileInfo, Notice, Menu, Editor, TAbstractFile, debounce } from 'obsidian';
import { SmartImageRenamerSettings, DEFAULT_SETTINGS } from './src/types/settings';
import { FileService, ImageProcessor, BulkRenameService, LinkTrackerService, CaptionService } from './src/services';
import { SmartImageRenamerSettingTab, RenameImageModal, BulkRenameModal, OrphanedImagesModal, DeleteImageModal, CaptionModal } from './src/ui';
import {
	sanitizeFilename,
	isImageFile,
	getImageLinkAtCursor,
	getFirstImageLinkInLine,
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
	private linkTrackerService: LinkTrackerService;
	private captionService: CaptionService;
	private pendingImageFile: TFile | undefined;
	private pendingSourceNote: TFile | undefined;
	// Track files we're processing to avoid double-renaming
	private processingFiles: Set<string> = new Set();
	// Skip link removal detection during caption edits
	private isEditingCaption: boolean = false;
	// Flag to skip file creation events during startup
	private isStartupComplete: boolean = false;
	// Flag to force rename (skip generic name check) - set during Excalidraw drops
	private forceRenameNext: boolean = false;
	// Debounced handler for editor changes
	private debouncedEditorChange: ReturnType<typeof debounce>;

	async onload(): Promise<void> {
		await this.loadSettings();

		this.fileService = new FileService(this.app, this.settings);
		this.imageProcessor = new ImageProcessor(this.fileService, this.settings);
		this.bulkRenameService = new BulkRenameService(this.app, this.settings);
		this.linkTrackerService = new LinkTrackerService();
		this.captionService = new CaptionService();

		// Setup debounced editor change handler
		this.debouncedEditorChange = debounce(
			(editor: Editor, info: MarkdownView | MarkdownFileInfo) => {
				this.handleEditorChange(editor, info);
			},
			300,
			true
		);

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

		// Obsidian 1.12+: file-menu fires for image right-clicks instead of editor-menu
		this.registerEvent(
			this.app.workspace.on('file-menu', (menu, file) => {
				this.handleFileMenu(menu, file);
			})
		);

		// Context menu on rendered images - capture phase to run before Obsidian
		// Sets pendingImageFile for editor-menu fallback (pre-1.12)
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
			(evt: DragEvent) => { this.handleGlobalDrop(evt); },
			true
		);

		// Monitor editor changes for link removal detection
		this.registerEvent(
			this.app.workspace.on('editor-change', (editor, info) => {
				this.debouncedEditorChange(editor, info);
			})
		);

		// Initialize link cache when opening a file
		this.registerEvent(
			this.app.workspace.on('active-leaf-change', () => {
				const view = this.app.workspace.getActiveViewOfType(MarkdownView);
				if (view?.file) {
					this.linkTrackerService.updateCache(view.file.path, view.editor.getValue());
				}
			})
		);

		// Monitor file creation for auto-rename (drag & drop, Excalidraw, etc.)
		this.registerEvent(
			this.app.vault.on('create', (file) => { void this.handleFileCreate(file); })
		);

		// Mark startup as complete after a delay to avoid processing existing files
		// during vault indexing
		setTimeout(() => {
			this.isStartupComplete = true;
			// Initialize link cache for currently active note
			this.initializeLinkCacheForActiveNote();
		}, 3000);
	}

	/**
	 * Initialize link cache for the currently active note
	 */
	private initializeLinkCacheForActiveNote(): void {
		const view = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (view?.file && view.editor) {
			this.linkTrackerService.updateCache(view.file.path, view.editor.getValue());
		}
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

	/**
	 * Find the <img> element from a click target.
	 * In Obsidian 1.12+, the click target may be a resize wrapper around the image
	 * rather than the <img> element itself.
	 */
	private findImageElement(target: HTMLElement): HTMLImageElement | null {
		// 1. Target IS the <img>
		if (target.tagName === 'IMG') return target as HTMLImageElement;
		// 2. Target is inside an <img> (unlikely but defensive)
		const closestImg = target.closest('img');
		if (closestImg) return closestImg;
		// 3. Target is a wrapper containing <img> as child
		const childImg = target.querySelector('img');
		if (childImg) return childImg;
		// 4. Target is inside an embed block — find the <img> via container
		// Obsidian 1.12+ uses .internal-embed.image-embed; pre-1.12 used .cm-embed-block.cm-embed-image
		const embedBlock = target.closest('.internal-embed.image-embed, .cm-embed-block.cm-embed-image');
		if (embedBlock) {
			const embeddedImg = embedBlock.querySelector('img');
			if (embeddedImg) return embeddedImg;
		}
		return null;
	}

	private handleImageContextMenu(evt: MouseEvent): void {
		const target = evt.target as HTMLElement;
		const img = this.findImageElement(target);
		if (!img) return;

		const src = img.getAttribute('src');
		if (!src) return;

		const fileName = extractImagePathFromSrc(src);
		if (!fileName) return;

		const file = this.fileService.findFileByName(fileName);
		if (!file || !isImageFile(file.extension)) return;

		// Store pending file for editor-menu fallback (pre-1.12 Obsidian)
		this.pendingImageFile = file;
		this.pendingSourceNote = this.app.workspace.getActiveFile() ?? undefined;
		setTimeout(() => {
			this.pendingImageFile = undefined;
			this.pendingSourceNote = undefined;
		}, 100);
	}

	/**
	 * Handle file-menu event (Obsidian 1.12+ fires this for image right-clicks
	 * instead of editor-menu)
	 */
	private handleFileMenu(menu: Menu, file: TAbstractFile): void {
		if (!(file instanceof TFile) || !isImageFile(file.extension)) return;

		const sourceNote = this.app.workspace.getActiveFile() ?? undefined;
		if (!sourceNote) return;

		menu.addItem((item) => {
			item.setTitle(t('menu.editCaption'))
				.setIcon('text-cursor-input')
				.setSection('action')
				.onClick(() => { void this.openCaptionModal(file, sourceNote); });
		});
	}

	private handleEditorMenu(menu: Menu, editor: Editor, info: MarkdownView | MarkdownFileInfo): void {
		// Check if we have a pending image from DOM right-click
		if (this.pendingImageFile) {
			const file = this.pendingImageFile;
			const sourceNote = this.pendingSourceNote;
			menu.addItem((item) => {
				item.setTitle(t('menu.renameImage'))
					.setIcon('pencil')
					.onClick(() => this.openRenameModal(file));
			});
			if (sourceNote) {
				menu.addItem((item) => {
					item.setTitle(t('menu.editCaption'))
						.setIcon('text-cursor-input')
						.onClick(() => { void this.openCaptionModal(file, sourceNote); });
				});
			}
			menu.addItem((item) => {
				item.setTitle(t('menu.deleteImage'))
					.setIcon('trash')
					.onClick(() => { this.openDeleteModal(file); });
			});
			return;
		}

		// Check if cursor is on a wikilink or markdown image
		const cursor = editor.getCursor();
		const line = editor.getLine(cursor.line);
		// Try cursor position first, then fallback to first image in line
		// (right-click may not move cursor to click position in source mode)
		const rawImageLink = getImageLinkAtCursor(line, cursor.ch) || getFirstImageLinkInLine(line);

		if (!rawImageLink) return;

		// Decode URL-encoded paths (markdown syntax uses %20 for spaces, etc.)
		let imageLink: string;
		try {
			imageLink = decodeURIComponent(rawImageLink);
		} catch {
			imageLink = rawImageLink;
		}

		const resolvedFile = this.fileService.resolveImageLink(imageLink, info.file?.path || '');

		menu.addItem((item) => {
			item.setTitle(t('menu.renameImage'))
				.setIcon('pencil')
				.onClick(() => { this.renameImageFromLink(imageLink, info); });
		});

		if (resolvedFile && info.file) {
			menu.addItem((item) => {
				item.setTitle(t('menu.editCaption'))
					.setIcon('text-cursor-input')
					.onClick(() => { void this.openCaptionModal(resolvedFile, info.file!); });
			});
			menu.addItem((item) => {
				item.setTitle(t('menu.deleteImage'))
					.setIcon('trash')
					.onClick(() => { this.openDeleteModal(resolvedFile); });
			});
		}
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

	private async openCaptionModal(imageFile: TFile, sourceNote: TFile): Promise<void> {
		// Read current note content to find existing caption
		const content = await this.app.vault.read(sourceNote);
		const link = this.captionService.findImageLink(content, imageFile.name);
		const currentCaption = link?.caption ?? null;

		new CaptionModal(
			this.app,
			imageFile,
			sourceNote,
			this.captionService,
			currentCaption,
			async (newContent) => {
				// Skip link removal detection during caption save
				this.isEditingCaption = true;
				await this.app.vault.modify(sourceNote, newContent);
				// Update link cache with new content to prevent false removal detection
				this.linkTrackerService.updateCache(sourceNote.path, newContent);
				// Reset flag after a short delay
				setTimeout(() => { this.isEditingCaption = false; }, 100);
			}
		).open();
	}

	private renameImageFromLink(imageName: string, info: MarkdownView | MarkdownFileInfo): void {
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

	private handleGlobalDrop(evt: DragEvent): void {
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

	/**
	 * Handle editor changes to detect removed image links
	 */
	private handleEditorChange(editor: Editor, info: MarkdownView | MarkdownFileInfo): void {
		if (this.settings.deletePromptBehavior === 'never') return;
		// Skip during caption edits (we're modifying the link, not removing it)
		if (this.isEditingCaption) return;

		const notePath = info.file?.path;
		if (!notePath) return;

		const cachedLinks = this.linkTrackerService.getCachedLinks(notePath);

		// Skip if cache not initialized (note just opened, wait for active-leaf-change)
		if (!cachedLinks) {
			return;
		}

		const content = editor.getValue();
		const removedLinks = this.linkTrackerService.detectRemovedLinks(notePath, content);

		if (removedLinks.length === 0) return;

		// Process each removed link
		for (const linkPath of removedLinks) {
			const imageFile = this.fileService.resolveImageLink(linkPath, notePath);
			if (!imageFile) continue;

			const backlinks = this.getImageBacklinks(imageFile, notePath);

			// Check if should prompt based on setting
			if (this.settings.deletePromptBehavior === 'orphan-only') {
				if (backlinks.length > 0) continue; // Not orphaned, skip
			}

			// Show orphan prompt only if truly orphaned
			const isOrphan = backlinks.length === 0;
			this.openDeleteModal(imageFile, isOrphan);
		}
	}

	/**
	 * Get notes that link to an image, excluding a specific note
	 */
	private getImageBacklinks(imageFile: TFile, excludeNotePath?: string): string[] {
		const backlinks: string[] = [];
		const resolvedLinks = this.app.metadataCache.resolvedLinks;

		for (const [notePath, links] of Object.entries(resolvedLinks)) {
			if (excludeNotePath && notePath === excludeNotePath) continue;
			if (links[imageFile.path]) {
				backlinks.push(notePath);
			}
		}

		return backlinks;
	}

	/**
	 * Open delete confirmation modal
	 */
	private openDeleteModal(file: TFile, isOrphanPrompt = false): void {
		const currentNotePath = this.app.workspace.getActiveFile()?.path;
		const backlinks = this.getImageBacklinks(file, currentNotePath);

		new DeleteImageModal(
			this.app,
			file,
			{ backlinks, isOrphanPrompt },
			async () => {
				try {
					await this.app.fileManager.trashFile(file);
					new Notice(t('notices.deleted', { count: 1 }));
				} catch (error) {
					new Notice(t('notices.failedToRename', { error: String(error) }));
				}
			}
		).open();
	}
}
