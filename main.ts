import { Plugin, TFile, MarkdownView, Notice, Menu, Editor } from 'obsidian';
import { SmartImageRenamerSettings, DEFAULT_SETTINGS } from './src/types/settings';
import { FileService, ImageProcessor } from './src/services';
import { SmartImageRenamerSettingTab, RenameImageModal } from './src/ui';
import {
	sanitizeFilename,
	isImageFile,
	getImageLinkAtCursor,
	extractImagePathFromSrc
} from './src/utils';

export default class SmartImageRenamer extends Plugin {
	settings: SmartImageRenamerSettings;
	private fileService: FileService;
	private imageProcessor: ImageProcessor;
	private pendingImageFile: TFile | undefined;

	async onload(): Promise<void> {
		await this.loadSettings();

		this.fileService = new FileService(this.app, this.settings);
		this.imageProcessor = new ImageProcessor(this.fileService, this.settings);

		this.addSettingTab(new SmartImageRenamerSettingTab(this.app, this));

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
			this.imageProcessor.insertMarkdownLink(markdownView.editor, result.markdownLink);
			new Notice(`Image saved as ${result.fileName}`);
		} catch (error) {
			console.error('Smart Image Renamer error:', error);
			new Notice(`Failed to save image: ${error}`);
		}
	}
}
