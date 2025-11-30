import { Plugin, TFile, TFolder, MarkdownView, Notice, Menu, Editor, Modal, Setting, PluginSettingTab, App } from "obsidian";

interface SmartImageRenamerSettings {
	suffixMode: 'sequential' | 'timestamp';
	timestampFormat: string;
	sanitizationMode: 'normal' | 'aggressive';
}

const DEFAULT_SETTINGS: SmartImageRenamerSettings = {
	suffixMode: 'sequential',
	timestampFormat: 'YYYYMMDD-HHmmss',
	sanitizationMode: 'normal'
};

const TIMESTAMP_PRESETS = [
	{ value: 'YYYYMMDD-HHmmss', label: 'Compact (20251130-185432)' },
	{ value: 'YYYY-MM-DD_HH-mm-ss', label: 'Readable (2025-11-30_18-54-32)' },
	{ value: 'custom', label: 'Custom' }
];

export default class SmartImageRenamer extends Plugin {
	settings: SmartImageRenamerSettings;

	async onload() {
		await this.loadSettings();
		this.addSettingTab(new SmartImageRenamerSettingTab(this.app, this));
		this.registerEvent(
			this.app.workspace.on("editor-paste", this.handlePaste.bind(this))
		);

		this.registerEvent(
			this.app.workspace.on("editor-menu", this.handleEditorMenu.bind(this))
		);

		// Context menu on rendered images - capture phase to run before Obsidian
		this.registerDomEvent(document, "contextmenu", this.handleImageContextMenu.bind(this), true);
	}

	private handleImageContextMenu(evt: MouseEvent): void {
		const target = evt.target as HTMLElement;
		if (target.tagName !== "IMG") return;

		const img = target as HTMLImageElement;
		const src = img.getAttribute("src");
		if (!src) return;

		// Extract filename from src (handles both vault URLs and resource paths)
		let imagePath = decodeURIComponent(src);

		// Handle app://... URLs
		if (imagePath.includes("app://")) {
			const match = imagePath.match(/app:\/\/[^/]+\/(.+?)(\?|$)/);
			if (match) imagePath = match[1];
		}

		// Get just the filename (remove query params if any)
		let fileName = imagePath.split("/").pop();
		if (!fileName) return;
		fileName = fileName.split("?")[0];

		const file = this.app.vault.getFiles().find(f => f.name === fileName);
		if (!file || !this.isImageFile(file.extension)) return;

		// Store file reference for menu
		this.pendingImageFile = file;

		// Show menu after a tiny delay to let Obsidian's menu appear first
		setTimeout(() => {
			this.pendingImageFile = undefined;
		}, 100);
	}

	private pendingImageFile: TFile | undefined;

	private isImageFile(ext: string): boolean {
		return ["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg"].includes(ext.toLowerCase());
	}

	private async renameImageFile(file: TFile): Promise<void> {
		new RenameImageModal(this.app, file, async (newName) => {
			const sanitized = this.sanitizeFilename(newName);
			if (!sanitized) {
				new Notice("Invalid filename");
				return;
			}

			const newPath = file.parent?.path
				? `${file.parent.path}/${sanitized}.${file.extension}`
				: `${sanitized}.${file.extension}`;

			try {
				await this.app.fileManager.renameFile(file, newPath);
				new Notice(`Renamed to ${sanitized}.${file.extension}`);
			} catch (error) {
				new Notice(`Failed to rename: ${error}`);
			}
		}).open();
	}

	private handleEditorMenu(menu: Menu, editor: Editor, view: MarkdownView): void {
		// Check if we have a pending image from DOM right-click
		if (this.pendingImageFile) {
			const file = this.pendingImageFile;
			menu.addItem((item) => {
				item.setTitle("Rename image")
					.setIcon("pencil")
					.onClick(() => this.renameImageFile(file));
			});
			return;
		}

		// Check if cursor is on a wikilink
		const cursor = editor.getCursor();
		const line = editor.getLine(cursor.line);
		const imageLink = this.getImageLinkAtCursor(line, cursor.ch);

		if (!imageLink) return;

		menu.addItem((item) => {
			item.setTitle("Rename image")
				.setIcon("pencil")
				.onClick(() => this.renameImage(imageLink, view));
		});
	}

	private getImageLinkAtCursor(line: string, cursorPos: number): string | null {
		const regex = /!\[\[([^\]]+\.(png|jpg|jpeg|gif|webp|bmp|svg))\]\]/gi;
		let match;

		while ((match = regex.exec(line)) !== null) {
			const start = match.index;
			const end = start + match[0].length;
			if (cursorPos >= start && cursorPos <= end) {
				return match[1];
			}
		}
		return null;
	}

	private async renameImage(imageName: string, view: MarkdownView): Promise<void> {
		const file = this.app.metadataCache.getFirstLinkpathDest(imageName, view.file?.path || "");
		if (!file) {
			new Notice(`Image not found: ${imageName}`);
			return;
		}

		new RenameImageModal(this.app, file, async (newName) => {
			const sanitized = this.sanitizeFilename(newName);
			if (!sanitized) {
				new Notice("Invalid filename");
				return;
			}

			const newPath = file.parent?.path
				? `${file.parent.path}/${sanitized}.${file.extension}`
				: `${sanitized}.${file.extension}`;

			try {
				await this.app.fileManager.renameFile(file, newPath);
				new Notice(`Renamed to ${sanitized}.${file.extension}`);
			} catch (error) {
				new Notice(`Failed to rename: ${error}`);
			}
		}).open();
	}

	private async handlePaste(
		evt: ClipboardEvent,
		_editor: unknown,
		markdownView: MarkdownView
	): Promise<void> {
		const clipboardData = evt.clipboardData;
		if (!clipboardData) return;

		const imageFile = this.getImageFromClipboard(clipboardData);
		if (!imageFile) return;

		evt.preventDefault();

		const activeFile = markdownView.file;
		if (!activeFile) {
			new Notice("No active file found");
			return;
		}

		try {
			await this.processImage(imageFile, activeFile, markdownView);
		} catch (error) {
			console.error("Smart Image Renamer error:", error);
			new Notice(`Failed to save image: ${error}`);
		}
	}

	private getImageFromClipboard(clipboardData: DataTransfer): File | null {
		const items = clipboardData.files;
		for (let i = 0; i < items.length; i++) {
			const file = items[i];
			if (file.type.startsWith("image/")) {
				return file;
			}
		}
		return null;
	}

	private async processImage(
		imageFile: File,
		activeFile: TFile,
		markdownView: MarkdownView
	): Promise<void> {
		const noteName = activeFile.basename;
		const sanitizedName = this.sanitizeFilename(noteName);
		const extension = this.getExtension(imageFile.type);
		const folderPath = this.getAttachmentFolder(activeFile);

		const availablePath = await this.getAvailablePath(
			folderPath,
			sanitizedName,
			extension
		);

		const arrayBuffer = await imageFile.arrayBuffer();
		await this.app.vault.createBinary(availablePath, arrayBuffer);

		const fileName = availablePath.split("/").pop() || availablePath;
		const markdownLink = `![[${fileName}]]`;

		const editor = markdownView.editor;
		const cursor = editor.getCursor();
		editor.replaceRange(markdownLink, cursor);

		const newCursor = {
			line: cursor.line,
			ch: cursor.ch + markdownLink.length,
		};
		editor.setCursor(newCursor);

		new Notice(`Image saved as ${fileName}`);
	}

	private sanitizeFilename(name: string): string {
		if (this.settings.sanitizationMode === 'aggressive') {
			return name
				.normalize('NFD')
				.replace(/[\u0300-\u036f]/g, '') // Remove accents
				.replace(/[\\/:*?"<>|]/g, '')
				.replace(/\s+/g, '_')
				.toLowerCase()
				.trim();
		}
		// Normal mode
		return name
			.replace(/[\\/:*?"<>|]/g, "")
			.replace(/\s+/g, " ")
			.trim();
	}

	private getExtension(mimeType: string): string {
		const mimeToExt: Record<string, string> = {
			"image/png": "png",
			"image/jpeg": "jpg",
			"image/gif": "gif",
			"image/webp": "webp",
			"image/bmp": "bmp",
			"image/svg+xml": "svg",
		};
		return mimeToExt[mimeType] || "png";
	}

	private getAttachmentFolder(activeFile: TFile): string {
		// @ts-expect-error - getConfig is internal API
		const attachmentFolderPath = this.app.vault.getConfig("attachmentFolderPath") || "";

		if (!attachmentFolderPath || attachmentFolderPath === "/") {
			// Root of vault
			return "";
		}

		if (attachmentFolderPath === "./") {
			// Same folder as current file
			return activeFile.parent?.path || "";
		}

		if (attachmentFolderPath.startsWith("./")) {
			// Subfolder of current file's folder
			const subfolder = attachmentFolderPath.slice(2);
			const parentPath = activeFile.parent?.path || "";
			return parentPath ? `${parentPath}/${subfolder}` : subfolder;
		}

		// Specific folder path (option 4)
		return attachmentFolderPath;
	}

	private async getAvailablePath(
		folderPath: string,
		baseName: string,
		extension: string
	): Promise<string> {
		// Ensure folder exists
		if (folderPath) {
			await this.ensureFolderExists(folderPath);
		}

		let filePath: string;

		if (this.settings.suffixMode === 'timestamp') {
			const suffix = this.formatTimestamp(this.settings.timestampFormat);
			const fileName = `${baseName} ${suffix}.${extension}`;
			filePath = folderPath ? `${folderPath}/${fileName}` : fileName;

			// If file exists with same timestamp, add sequential number
			if (this.app.vault.getAbstractFileByPath(filePath)) {
				let n = 1;
				while (true) {
					const seqFileName = `${baseName} ${suffix}-${n}.${extension}`;
					filePath = folderPath ? `${folderPath}/${seqFileName}` : seqFileName;
					if (!this.app.vault.getAbstractFileByPath(filePath)) break;
					n++;
				}
			}
		} else {
			// Sequential mode
			let n = 1;
			while (true) {
				const fileName = `${baseName} ${n}.${extension}`;
				filePath = folderPath ? `${folderPath}/${fileName}` : fileName;
				if (!this.app.vault.getAbstractFileByPath(filePath)) break;
				n++;
			}
		}

		return filePath;
	}

	private formatTimestamp(format: string): string {
		const now = new Date();
		const pad = (n: number) => n.toString().padStart(2, '0');

		return format
			.replace('YYYY', now.getFullYear().toString())
			.replace('MM', pad(now.getMonth() + 1))
			.replace('DD', pad(now.getDate()))
			.replace('HH', pad(now.getHours()))
			.replace('mm', pad(now.getMinutes()))
			.replace('ss', pad(now.getSeconds()));
	}

	private async ensureFolderExists(folderPath: string): Promise<void> {
		const folder = this.app.vault.getAbstractFileByPath(folderPath);
		if (folder instanceof TFolder) {
			return;
		}

		// Create folder hierarchy
		const parts = folderPath.split("/");
		let currentPath = "";

		for (const part of parts) {
			currentPath = currentPath ? `${currentPath}/${part}` : part;
			const existing = this.app.vault.getAbstractFileByPath(currentPath);
			if (!existing) {
				await this.app.vault.createFolder(currentPath);
			}
		}
	}

	onunload() {
		// Cleanup if needed
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

class SmartImageRenamerSettingTab extends PluginSettingTab {
	plugin: SmartImageRenamer;
	customFormatEl: HTMLInputElement | null = null;

	constructor(app: App, plugin: SmartImageRenamer) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		// Suffix Mode
		new Setting(containerEl)
			.setName('Suffix mode')
			.setDesc('How to generate the suffix for image filenames')
			.addDropdown(dropdown => dropdown
				.addOption('sequential', 'Sequential (1, 2, 3...)')
				.addOption('timestamp', 'Timestamp')
				.setValue(this.plugin.settings.suffixMode)
				.onChange(async (value: 'sequential' | 'timestamp') => {
					this.plugin.settings.suffixMode = value;
					await this.plugin.saveSettings();
					this.display(); // Refresh to show/hide timestamp options
				}));

		// Timestamp format (only show if timestamp mode)
		if (this.plugin.settings.suffixMode === 'timestamp') {
			const isCustom = !TIMESTAMP_PRESETS.slice(0, -1).some(p => p.value === this.plugin.settings.timestampFormat);

			new Setting(containerEl)
				.setName('Timestamp format')
				.setDesc('Choose a preset or custom format')
				.addDropdown(dropdown => {
					TIMESTAMP_PRESETS.forEach(preset => {
						dropdown.addOption(preset.value, preset.label);
					});
					dropdown.setValue(isCustom ? 'custom' : this.plugin.settings.timestampFormat);
					dropdown.onChange(async (value) => {
						if (value === 'custom') {
							this.showCustomFormat(containerEl);
						} else {
							this.plugin.settings.timestampFormat = value;
							await this.plugin.saveSettings();
							this.display();
						}
					});
				});

			// Show custom format field if custom is selected
			if (isCustom) {
				new Setting(containerEl)
					.setName('Custom format')
					.setDesc('Use: YYYY (year), MM (month), DD (day), HH (hour), mm (min), ss (sec)')
					.addText(text => {
						this.customFormatEl = text.inputEl;
						text.setValue(this.plugin.settings.timestampFormat)
							.setPlaceholder('YYYYMMDD-HHmmss')
							.onChange(async (value) => {
								this.plugin.settings.timestampFormat = value || 'YYYYMMDD-HHmmss';
								await this.plugin.saveSettings();
							});
					});
			}
		}

		// Sanitization Mode
		new Setting(containerEl)
			.setName('Sanitization mode')
			.setDesc('How to clean note names for use in filenames')
			.addDropdown(dropdown => dropdown
				.addOption('normal', 'Normal (remove invalid chars)')
				.addOption('aggressive', 'Aggressive (lowercase, underscores, no accents)')
				.setValue(this.plugin.settings.sanitizationMode)
				.onChange(async (value: 'normal' | 'aggressive') => {
					this.plugin.settings.sanitizationMode = value;
					await this.plugin.saveSettings();
				}));

		// Preview
		containerEl.createEl('h3', { text: 'Preview' });
		const previewEl = containerEl.createEl('p', { cls: 'setting-item-description' });
		this.updatePreview(previewEl);
	}

	private showCustomFormat(containerEl: HTMLElement) {
		this.display();
	}

	private updatePreview(el: HTMLElement) {
		const exampleNote = this.plugin.settings.sanitizationMode === 'aggressive'
			? 'my_example_note'
			: 'My Example Note';

		let suffix: string;
		if (this.plugin.settings.suffixMode === 'timestamp') {
			suffix = this.formatTimestampPreview(this.plugin.settings.timestampFormat);
		} else {
			suffix = '1';
		}

		el.setText(`Example: ${exampleNote} ${suffix}.png`);
	}

	private formatTimestampPreview(format: string): string {
		const now = new Date();
		const pad = (n: number) => n.toString().padStart(2, '0');

		return format
			.replace('YYYY', now.getFullYear().toString())
			.replace('MM', pad(now.getMonth() + 1))
			.replace('DD', pad(now.getDate()))
			.replace('HH', pad(now.getHours()))
			.replace('mm', pad(now.getMinutes()))
			.replace('ss', pad(now.getSeconds()));
	}
}

class RenameImageModal extends Modal {
	private file: TFile;
	private onSubmit: (newName: string) => void;
	private inputEl: HTMLInputElement;

	constructor(app: import("obsidian").App, file: TFile, onSubmit: (newName: string) => void) {
		super(app);
		this.file = file;
		this.onSubmit = onSubmit;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.addClass("rename-image-modal");

		contentEl.createEl("h3", { text: "Rename image" });
		contentEl.createEl("p", {
			text: `Current: ${this.file.basename}`,
			cls: "rename-image-current"
		});

		this.inputEl = contentEl.createEl("input", {
			type: "text",
			value: this.file.basename,
			cls: "rename-image-input"
		});
		this.inputEl.style.width = "100%";
		this.inputEl.style.marginBottom = "1em";
		this.inputEl.addEventListener("keydown", (e) => {
			if (e.key === "Enter") {
				e.preventDefault();
				this.submit();
			}
		});

		new Setting(contentEl)
			.addButton((btn) =>
				btn.setButtonText("Rename")
					.setCta()
					.onClick(() => this.submit())
			)
			.addButton((btn) =>
				btn.setButtonText("Cancel")
					.onClick(() => this.close())
			);

		// Focus and select after render
		setTimeout(() => this.inputEl.select(), 10);
	}

	private submit() {
		const newName = this.inputEl.value.trim();
		if (newName && newName !== this.file.basename) {
			this.onSubmit(newName);
		}
		this.close();
	}

	onClose() {
		this.contentEl.empty();
	}
}
