import { vi } from 'vitest';

// Event Emitter for testing event handlers
export class MockEventRef {
	constructor(
		public emitter: MockEventEmitter,
		public event: string,
		public handler: Function
	) {}
}

export class MockEventEmitter {
	private handlers: Map<string, Function[]> = new Map();

	on(event: string, handler: Function): MockEventRef {
		const handlers = this.handlers.get(event) || [];
		handlers.push(handler);
		this.handlers.set(event, handlers);
		return new MockEventRef(this, event, handler);
	}

	off(event: string, handler: Function): void {
		const handlers = this.handlers.get(event) || [];
		const index = handlers.indexOf(handler);
		if (index > -1) {
			handlers.splice(index, 1);
		}
	}

	trigger(event: string, ...args: any[]): void {
		const handlers = this.handlers.get(event) || [];
		handlers.forEach(handler => handler(...args));
	}

	_getHandlers(event: string): Function[] {
		return this.handlers.get(event) || [];
	}

	_clearHandlers(): void {
		this.handlers.clear();
	}
}

// Mock TFile
export class TFile {
	path: string;
	name: string;
	basename: string;
	extension: string;
	parent: TFolder | null;
	stat: { size: number; ctime: number; mtime: number };

	constructor(path: string) {
		this.path = path;
		this.name = path.split('/').pop() || '';
		const parts = this.name.split('.');
		this.extension = parts.length > 1 ? parts.pop()! : '';
		this.basename = parts.join('.');
		this.parent = null;
		this.stat = { size: 0, ctime: 0, mtime: 0 };
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

// Mock Vault with event support
export class Vault extends MockEventEmitter {
	private files: Map<string, TFile> = new Map();
	private folders: Map<string, TFolder> = new Map();

	getAbstractFileByPath(path: string): TFile | TFolder | null {
		return this.files.get(path) || this.folders.get(path) || null;
	}

	getFiles(): TFile[] {
		return Array.from(this.files.values());
	}

	getMarkdownFiles(): TFile[] {
		return Array.from(this.files.values()).filter(f => f.extension === 'md');
	}

	createBinary = vi.fn().mockResolvedValue(undefined);
	createFolder = vi.fn().mockResolvedValue(undefined);
	read = vi.fn().mockResolvedValue('');
	cachedRead = vi.fn().mockResolvedValue('');
	trash = vi.fn().mockResolvedValue(undefined);

	// Test helpers
	_addFile(file: TFile): void {
		this.files.set(file.path, file);
	}

	_removeFile(path: string): void {
		this.files.delete(path);
	}

	_addFolder(folder: TFolder): void {
		this.folders.set(folder.path, folder);
	}

	_clear(): void {
		this.files.clear();
		this.folders.clear();
		this._clearHandlers();
	}

	// @ts-expect-error - Mock internal API
	getConfig(key: string): string {
		return '';
	}
}

// Mock Workspace with event support
export class Workspace extends MockEventEmitter {
	private activeFile: TFile | null = null;
	private activeLeaf: WorkspaceLeaf | null = null;

	getActiveFile(): TFile | null {
		return this.activeFile;
	}

	getActiveViewOfType<T>(type: any): T | null {
		if (this.activeLeaf) {
			return this.activeLeaf.view as unknown as T;
		}
		return null;
	}

	// Test helpers
	_setActiveFile(file: TFile | null): void {
		this.activeFile = file;
	}

	_setActiveLeaf(leaf: WorkspaceLeaf | null): void {
		this.activeLeaf = leaf;
	}

	_clear(): void {
		this.activeFile = null;
		this.activeLeaf = null;
		this._clearHandlers();
	}
}

// Mock WorkspaceLeaf
export class WorkspaceLeaf {
	view: MarkdownView | null = null;

	constructor(view?: MarkdownView) {
		this.view = view || null;
	}
}

// Mock CachedMetadata
export interface CachedMetadata {
	embeds?: { link: string; displayText: string }[];
	links?: { link: string; displayText: string }[];
}

// Mock MetadataCache with event support
export class MetadataCache extends MockEventEmitter {
	private fileCache: Map<string, CachedMetadata> = new Map();
	private linkResolver: ((linkpath: string, sourcePath: string) => TFile | null) | null = null;

	/** Maps note paths to their outgoing links: { "note.md": { "image.png": 1 } } */
	resolvedLinks: Record<string, Record<string, number>> = {};

	getFirstLinkpathDest(linkpath: string, sourcePath: string): TFile | null {
		if (this.linkResolver) {
			return this.linkResolver(linkpath, sourcePath);
		}
		return null;
	}

	getFileCache(file: TFile): CachedMetadata | null {
		return this.fileCache.get(file.path) || null;
	}

	// Test helpers
	_setFileCache(filePath: string, cache: CachedMetadata): void {
		this.fileCache.set(filePath, cache);
	}

	_setLinkResolver(resolver: (linkpath: string, sourcePath: string) => TFile | null): void {
		this.linkResolver = resolver;
	}

	_setResolvedLinks(links: Record<string, Record<string, number>>): void {
		this.resolvedLinks = links;
	}

	_clear(): void {
		this.fileCache.clear();
		this.linkResolver = null;
		this.resolvedLinks = {};
		this._clearHandlers();
	}
}

// Mock FileManager
export class FileManager {
	renameFile = vi.fn().mockResolvedValue(undefined);
	trashFile = vi.fn().mockResolvedValue(undefined);
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
	addCommand = vi.fn();
	registerEvent = vi.fn((eventRef: MockEventRef) => {
		// Store the event ref for potential cleanup
		return eventRef;
	});
	registerDomEvent = vi.fn((el: any, event: string, handler: Function, options?: any) => {
		// Store DOM event for testing
		return { el, event, handler, options };
	});
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
	editor: Editor;

	constructor() {
		this.editor = new Editor();
	}
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
	private items: { title: string; icon: string; callback: () => void }[] = [];

	addItem(callback: (item: MenuItem) => void): this {
		const item = new MenuItem();
		callback(item);
		this.items.push({
			title: item._title,
			icon: item._icon,
			callback: item._callback
		});
		return this;
	}

	// Test helpers
	_getItems(): { title: string; icon: string; callback: () => void }[] {
		return this.items;
	}

	_findItem(title: string): { title: string; icon: string; callback: () => void } | undefined {
		return this.items.find(item => item.title === title);
	}

	_clear(): void {
		this.items = [];
	}
}

// Mock MenuItem
export class MenuItem {
	_title: string = '';
	_icon: string = '';
	_callback: () => void = () => {};

	setTitle(title: string): this {
		this._title = title;
		return this;
	}

	setIcon(icon: string): this {
		this._icon = icon;
		return this;
	}

	onClick(callback: () => void): this {
		this._callback = callback;
		return this;
	}
}

// Mock Notice with call tracking
export const noticeHistory: { message: string; timeout?: number }[] = [];

export class Notice {
	message: string;
	timeout: number | undefined;

	constructor(message: string, timeout?: number) {
		this.message = message;
		this.timeout = timeout;
		noticeHistory.push({ message, timeout });
	}

	static _clearHistory(): void {
		noticeHistory.length = 0;
	}

	static _getHistory(): { message: string; timeout?: number }[] {
		return noticeHistory;
	}
}

// Helper to create mock ClipboardEvent
export function createMockClipboardEvent(options: {
	items?: { type: string; kind: string; getAsFile: () => File | null }[];
	files?: File[];
}): ClipboardEvent {
	const clipboardData = {
		items: options.items || [],
		files: options.files || []
	} as unknown as DataTransfer;

	return {
		clipboardData,
		preventDefault: vi.fn(),
		stopPropagation: vi.fn()
	} as unknown as ClipboardEvent;
}

// Helper to create mock DragEvent
export function createMockDragEvent(options: {
	files?: File[];
	defaultPrevented?: boolean;
}): DragEvent {
	const dataTransfer = {
		files: options.files || []
	} as unknown as DataTransfer;

	return {
		dataTransfer,
		defaultPrevented: options.defaultPrevented || false,
		preventDefault: vi.fn(),
		stopPropagation: vi.fn()
	} as unknown as DragEvent;
}

// Helper to create mock MouseEvent
export function createMockMouseEvent(options: {
	target?: HTMLElement;
}): MouseEvent {
	return {
		target: options.target || document.createElement('div'),
		preventDefault: vi.fn(),
		stopPropagation: vi.fn()
	} as unknown as MouseEvent;
}

// Helper to create mock File with arrayBuffer method
export function createMockFile(name: string, type: string, content: ArrayBuffer = new ArrayBuffer(10)): File {
	const file = new File([content], name, { type });
	// Add arrayBuffer method that returns the content
	(file as any).arrayBuffer = async () => content;
	return file;
}

// Helper to create mock Image element
export function createMockImageElement(src: string): HTMLImageElement {
	const img = document.createElement('img');
	img.setAttribute('src', src);
	return img;
}

// Mock debounce function
export function debounce<T extends (...args: any[]) => any>(
	func: T,
	wait: number,
	immediate?: boolean
): T {
	let timeout: ReturnType<typeof setTimeout> | null = null;
	return function(this: any, ...args: Parameters<T>) {
		const context = this;
		const later = () => {
			timeout = null;
			if (!immediate) func.apply(context, args);
		};
		const callNow = immediate && !timeout;
		if (timeout) clearTimeout(timeout);
		timeout = setTimeout(later, wait);
		if (callNow) func.apply(context, args);
	} as T;
}

