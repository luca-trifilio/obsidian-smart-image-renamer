import { Plugin, TFile, TFolder, MarkdownView, Notice, Menu, Editor, Modal, Setting } from "obsidian";

export default class SmartImageRenamer extends Plugin {
	async onload() {
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
		// Remove chars not allowed in filenames across platforms
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

		let n = 1;
		let filePath: string;

		while (true) {
			const fileName = `${baseName} ${n}.${extension}`;
			filePath = folderPath ? `${folderPath}/${fileName}` : fileName;

			const exists = this.app.vault.getAbstractFileByPath(filePath);
			if (!exists) {
				break;
			}
			n++;
		}

		return filePath;
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
