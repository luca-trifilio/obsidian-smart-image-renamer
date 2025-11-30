import { Plugin, TFile, TFolder, MarkdownView, Notice } from "obsidian";

export default class SmartImageRenamer extends Plugin {
	async onload() {
		this.registerEvent(
			this.app.workspace.on("editor-paste", this.handlePaste.bind(this))
		);
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
