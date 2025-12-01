import { vi } from 'vitest';

// Mock TFile
export class TFile {
	path: string;
	name: string;
	basename: string;
	extension: string;
	parent: TFolder | null;

	constructor(path: string) {
		this.path = path;
		this.name = path.split('/').pop() || '';
		const parts = this.name.split('.');
		this.extension = parts.length > 1 ? parts.pop()! : '';
		this.basename = parts.join('.');
		this.parent = null;
	}
}

// Mock TFolder
export class TFolder {
	path: string;
	name: string;

	constructor(path: string) {
		this.path = path;
		this.name = path.split('/').pop() || '';
	}
}

// Mock TAbstractFile
export class TAbstractFile {
	path: string;
	name: string;

	constructor(path: string) {
		this.path = path;
		this.name = path.split('/').pop() || '';
	}
}

// Mock App
export class App {
	vault = new Vault();
	workspace = new Workspace();
	metadataCache = new MetadataCache();
	fileManager = new FileManager();
}

// Mock Vault
export class Vault {
	private files: Map<string, TFile> = new Map();
	private folders: Map<string, TFolder> = new Map();

	getAbstractFileByPath(path: string): TFile | TFolder | null {
		return this.files.get(path) || this.folders.get(path) || null;
	}

	getFiles(): TFile[] {
		return Array.from(this.files.values());
	}

	createBinary = vi.fn().mockResolvedValue(undefined);
	createFolder = vi.fn().mockResolvedValue(undefined);

	// Test helpers
	_addFile(file: TFile): void {
		this.files.set(file.path, file);
	}

	_addFolder(folder: TFolder): void {
		this.folders.set(folder.path, folder);
	}

	_clear(): void {
		this.files.clear();
		this.folders.clear();
	}

	// @ts-expect-error - Mock internal API
	getConfig(key: string): string {
		return '';
	}
}

// Mock Workspace
export class Workspace {
	on = vi.fn();
}

// Mock MetadataCache
export class MetadataCache {
	getFirstLinkpathDest(linkpath: string, sourcePath: string): TFile | null {
		return null;
	}
}

// Mock FileManager
export class FileManager {
	renameFile = vi.fn().mockResolvedValue(undefined);
}

// Mock Plugin
export class Plugin {
	app: App;
	manifest = { id: 'test-plugin', name: 'Test Plugin' };

	constructor() {
		this.app = new App();
	}

	loadData = vi.fn().mockResolvedValue({});
	saveData = vi.fn().mockResolvedValue(undefined);
	addSettingTab = vi.fn();
	registerEvent = vi.fn();
	registerDomEvent = vi.fn();
}

// Mock PluginSettingTab
export class PluginSettingTab {
	app: App;
	containerEl = {
		empty: vi.fn(),
		createEl: vi.fn().mockReturnValue({ setText: vi.fn() })
	};

	constructor(app: App, plugin: any) {
		this.app = app;
	}

	display(): void {}
	hide(): void {}
}

// Mock Setting
export class Setting {
	constructor(containerEl: any) {}

	setName = vi.fn().mockReturnThis();
	setDesc = vi.fn().mockReturnThis();
	addDropdown = vi.fn().mockReturnThis();
	addToggle = vi.fn().mockReturnThis();
	addText = vi.fn().mockReturnThis();
	addButton = vi.fn().mockReturnThis();
}

// Mock Modal
export class Modal {
	app: App;
	contentEl = {
		empty: vi.fn(),
		createEl: vi.fn().mockReturnValue({
			style: {},
			addEventListener: vi.fn(),
			select: vi.fn(),
			addClass: vi.fn()
		}),
		addClass: vi.fn()
	};

	constructor(app: App) {
		this.app = app;
	}

	open = vi.fn();
	close = vi.fn();
	onOpen(): void {}
	onClose(): void {}
}

// Mock MarkdownView
export class MarkdownView {
	file: TFile | null = null;
	editor = {
		getCursor: vi.fn().mockReturnValue({ line: 0, ch: 0 }),
		getLine: vi.fn().mockReturnValue(''),
		replaceRange: vi.fn(),
		setCursor: vi.fn()
	};
}

// Mock Editor
export class Editor {
	getCursor = vi.fn().mockReturnValue({ line: 0, ch: 0 });
	getLine = vi.fn().mockReturnValue('');
	replaceRange = vi.fn();
	setCursor = vi.fn();
}

// Mock Menu
export class Menu {
	addItem = vi.fn().mockReturnThis();
}

// Mock Notice
export class Notice {
	constructor(message: string, timeout?: number) {}
}
