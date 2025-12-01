import { App, TFile, TFolder } from 'obsidian';
import { SmartImageRenamerSettings } from '../types/settings';
import { formatTimestamp } from '../utils/filename';

export class FileService {
	constructor(private app: App, private settings: SmartImageRenamerSettings) {}

	updateSettings(settings: SmartImageRenamerSettings): void {
		this.settings = settings;
	}

	getAttachmentFolder(activeFile: TFile): string {
		const vault = this.app.vault as { getConfig?: (key: string) => string | undefined };
		const attachmentFolderPath = vault.getConfig?.('attachmentFolderPath') ?? '';

		if (!attachmentFolderPath || attachmentFolderPath === '/') {
			return '';
		}

		if (attachmentFolderPath === './') {
			return activeFile.parent?.path || '';
		}

		if (attachmentFolderPath.startsWith('./')) {
			const subfolder = attachmentFolderPath.slice(2);
			const parentPath = activeFile.parent?.path || '';
			return parentPath ? `${parentPath}/${subfolder}` : subfolder;
		}

		return attachmentFolderPath;
	}

	async ensureFolderExists(folderPath: string): Promise<void> {
		const folder = this.app.vault.getAbstractFileByPath(folderPath);
		if (folder instanceof TFolder) {
			return;
		}

		const parts = folderPath.split('/');
		let currentPath = '';

		for (const part of parts) {
			currentPath = currentPath ? `${currentPath}/${part}` : part;
			const existing = this.app.vault.getAbstractFileByPath(currentPath);
			if (!existing) {
				await this.app.vault.createFolder(currentPath);
			}
		}
	}

	async getAvailablePath(
		folderPath: string,
		baseName: string,
		extension: string
	): Promise<string> {
		if (folderPath) {
			await this.ensureFolderExists(folderPath);
		}

		let filePath: string;

		if (this.settings.suffixMode === 'timestamp') {
			const suffix = formatTimestamp(this.settings.timestampFormat);
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

	async renameFile(file: TFile, newBaseName: string): Promise<string> {
		const newPath = file.parent?.path
			? `${file.parent.path}/${newBaseName}.${file.extension}`
			: `${newBaseName}.${file.extension}`;

		await this.app.fileManager.renameFile(file, newPath);
		return `${newBaseName}.${file.extension}`;
	}

	async createBinaryFile(path: string, data: ArrayBuffer): Promise<void> {
		await this.app.vault.createBinary(path, data);
	}

	findFileByName(fileName: string): TFile | undefined {
		return this.app.vault.getFiles().find(f => f.name === fileName);
	}

	resolveImageLink(imageName: string, sourcePath: string): TFile | null {
		return this.app.metadataCache.getFirstLinkpathDest(imageName, sourcePath);
	}
}
