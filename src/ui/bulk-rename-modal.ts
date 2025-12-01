import { App, Modal, TFile, Setting, Notice } from 'obsidian';
import { BulkRenameService } from '../services/bulk-rename-service';
import {
	BulkRenameItem,
	BulkRenameMode,
	ImageFilter,
	ImageInfo,
	BulkRenameScope,
} from '../types/bulk-rename';
import { OrphanedImagesModal } from './orphaned-images-modal';

export class BulkRenameModal extends Modal {
	private service: BulkRenameService;
	private activeNote: TFile | null;
	private renameScope: BulkRenameScope;
	private filter: ImageFilter = 'all';
	private mode: BulkRenameMode = 'replace';
	private pattern: string = '{note} - {original}';
	private images: ImageInfo[] = [];
	private previewItems: BulkRenameItem[] = [];
	private listContainer: HTMLElement;

	constructor(
		app: App,
		service: BulkRenameService,
		activeNote: TFile | null,
		initialScope: BulkRenameScope = 'note'
	) {
		super(app);
		this.service = service;
		this.activeNote = activeNote;
		this.renameScope = activeNote ? initialScope : 'vault';
	}

	onOpen(): void {
		const { contentEl, modalEl } = this;
		contentEl.addClass('bulk-rename-modal');
		modalEl.addClass('bulk-rename-modal');
		contentEl.empty();

		this.renderHeader();
		this.renderControls();
		this.listContainer = contentEl.createDiv({ cls: 'bulk-rename-list' });
		this.renderFooter();

		this.scanAndPreview();
	}

	private renderHeader(): void {
		const { contentEl } = this;
		contentEl.createEl('h2', { text: 'Bulk rename images' });
	}

	private renderControls(): void {
		const { contentEl } = this;
		const controlsDiv = contentEl.createDiv({ cls: 'bulk-rename-controls' });

		// Scope selector
		new Setting(controlsDiv)
			.setName('Scope')
			.setDesc('Where to search for images')
			.addDropdown((dropdown) => {
				dropdown
					.addOption('note', 'Current note')
					.addOption('vault', 'Entire vault')
					.setValue(this.renameScope)
					.setDisabled(!this.activeNote)
					.onChange((value: BulkRenameScope) => {
						this.renameScope = value;
						this.scanAndPreview();
					});
			});

		// Filter selector
		new Setting(controlsDiv)
			.setName('Filter')
			.setDesc('Which images to include')
			.addDropdown((dropdown) => {
				dropdown
					.addOption('generic', 'Only generic names (Pasted, Screenshot...)')
					.addOption('all', 'All images')
					.setValue(this.filter)
					.onChange((value: ImageFilter) => {
						this.filter = value;
						this.updatePreview();
					});
			});

		// Mode selector
		new Setting(controlsDiv)
			.setName('Rename mode')
			.setDesc('How to generate new names')
			.addDropdown((dropdown) => {
				dropdown
					.addOption('replace', 'Use note name (Note 1, Note 2...)')
					.addOption('prepend', 'Prepend note name (Note - Original)')
					.addOption('pattern', 'Custom pattern')
					.setValue(this.mode)
					.onChange((value: BulkRenameMode) => {
						this.mode = value;
						this.updatePatternVisibility();
						this.updatePreview();
					});
			});

		// Pattern input (shown only for pattern mode)
		this.patternSetting = new Setting(controlsDiv)
			.setName('Pattern')
			.setDesc('Use {note}, {original}, {n} as placeholders')
			.addText((text) => {
				text
					.setValue(this.pattern)
					.setPlaceholder('{note} - {original}')
					.onChange((value) => {
						this.pattern = value || '{note}';
						this.updatePreview();
					});
			});

		this.updatePatternVisibility();
	}

	private patternSetting: Setting;

	private updatePatternVisibility(): void {
		if (this.patternSetting) {
			this.patternSetting.settingEl.toggle(this.mode === 'pattern');
		}
	}

	private renderFooter(): void {
		const { contentEl } = this;
		const footerDiv = contentEl.createDiv({ cls: 'bulk-rename-footer' });

		// Select all / none
		const selectDiv = footerDiv.createDiv({ cls: 'bulk-rename-select-actions' });

		const selectAllBtn = selectDiv.createEl('button', {
			text: 'Select all',
			cls: 'mod-muted',
		});
		selectAllBtn.addEventListener('click', () => this.selectAll(true));

		const selectNoneBtn = selectDiv.createEl('button', {
			text: 'Select none',
			cls: 'mod-muted',
		});
		selectNoneBtn.addEventListener('click', () => this.selectAll(false));

		// Action buttons
		new Setting(footerDiv)
			.addButton((btn) =>
				btn
					.setButtonText('Rename selected')
					.setCta()
					.onClick(() => this.executeRename())
			)
			.addButton((btn) =>
				btn.setButtonText('Cancel').onClick(() => this.close())
			);
	}

	private async scanAndPreview(): Promise<void> {
		this.listContainer.empty();
		this.listContainer.createEl('p', { text: 'Scanning...', cls: 'bulk-rename-scanning' });

		// Scan images
		if (this.renameScope === 'note' && this.activeNote) {
			this.images = this.service.scanImagesInNote(this.activeNote);
		} else {
			this.images = this.service.scanImagesInVault();
		}

		this.updatePreview();
	}

	private updatePreview(): void {
		this.previewItems = this.service.generatePreview(
			this.images,
			this.mode,
			this.filter,
			this.pattern
		);

		this.renderList();
	}

	private renderList(): void {
		this.listContainer.empty();

		// Get orphan images
		const orphanImages = this.images.filter((img) => !img.sourceNote);

		if (this.previewItems.length === 0 && orphanImages.length === 0) {
			this.listContainer.createEl('p', {
				text: 'No images found matching the filter.',
				cls: 'bulk-rename-empty',
			});
			return;
		}

		// Renameable images section
		if (this.previewItems.length > 0) {
			const count = this.previewItems.length;
			this.listContainer.createEl('p', {
				text: `Found ${count} image${count !== 1 ? 's' : ''} to rename:`,
				cls: 'bulk-rename-count',
			});

			const listEl = this.listContainer.createEl('div', { cls: 'bulk-rename-items' });
			for (const item of this.previewItems) {
				this.renderListItem(listEl, item);
			}
		}

		// Orphan images section
		if (orphanImages.length > 0) {
			const orphanHeader = this.listContainer.createDiv({ cls: 'bulk-rename-orphan-header' });

			orphanHeader.createEl('p', {
				text: `${orphanImages.length} orphan image${orphanImages.length !== 1 ? 's' : ''} (not linked):`,
				cls: 'bulk-rename-count bulk-rename-orphan-title',
			});

			const manageBtn = orphanHeader.createEl('button', {
				text: 'Manage orphans →',
				cls: 'mod-muted bulk-rename-manage-orphans-btn',
			});
			manageBtn.addEventListener('click', () => this.openOrphanedImagesModal());

			const orphanListEl = this.listContainer.createEl('div', { cls: 'bulk-rename-items bulk-rename-orphan-items' });
			for (const img of orphanImages) {
				this.renderOrphanItem(orphanListEl, img);
			}
		}
	}

	private renderListItem(container: HTMLElement, item: BulkRenameItem): void {
		const itemEl = container.createDiv({ cls: 'bulk-rename-item' });

		// Left side: checkbox
		const checkbox = itemEl.createEl('input', { type: 'checkbox', cls: 'bulk-rename-checkbox' });
		checkbox.checked = item.selected;
		checkbox.addEventListener('change', () => {
			item.selected = checkbox.checked;
		});

		// Thumbnail
		const thumbEl = itemEl.createDiv({ cls: 'bulk-rename-thumb' });
		const img = thumbEl.createEl('img');
		img.src = this.app.vault.adapter.getResourcePath(item.file.path);
		img.alt = item.currentName;

		// Right side: content
		const contentEl = itemEl.createDiv({ cls: 'bulk-rename-item-content' });

		// Row 1: Current name with tags
		const currentRow = contentEl.createDiv({ cls: 'bulk-rename-row' });
		const currentName = currentRow.createSpan({ cls: 'bulk-rename-current-name' });
		currentName.createSpan({ text: item.currentName });
		currentName.createSpan({ text: `.${item.file.extension}`, cls: 'bulk-rename-ext' });

		if (item.isGeneric) {
			currentRow.createSpan({ text: 'auto', cls: 'bulk-rename-tag bulk-rename-tag-generic' });
		}

		// Row 2: New proposed name
		const previewRow = contentEl.createDiv({ cls: 'bulk-rename-row bulk-rename-preview-row' });
		previewRow.createSpan({ text: '→', cls: 'bulk-rename-arrow' });
		const newName = previewRow.createSpan({ cls: 'bulk-rename-new-name' });
		newName.createSpan({ text: item.newName });
		newName.createSpan({ text: `.${item.file.extension}`, cls: 'bulk-rename-ext' });

		// Row 3: Source note (if available)
		if (item.sourceNote) {
			const sourceRow = contentEl.createDiv({ cls: 'bulk-rename-row bulk-rename-source-row' });
			sourceRow.createSpan({ text: 'in ' });
			sourceRow.createSpan({ text: item.sourceNote.basename, cls: 'bulk-rename-source-note' });
		}
	}

	private renderOrphanItem(container: HTMLElement, image: ImageInfo): void {
		const itemEl = container.createDiv({ cls: 'bulk-rename-item bulk-rename-item-orphan' });

		// Thumbnail
		const thumbEl = itemEl.createDiv({ cls: 'bulk-rename-thumb' });
		const img = thumbEl.createEl('img');
		img.src = this.app.vault.adapter.getResourcePath(image.file.path);
		img.alt = image.file.basename;

		// Content
		const contentEl = itemEl.createDiv({ cls: 'bulk-rename-item-content' });

		// Name
		const nameRow = contentEl.createDiv({ cls: 'bulk-rename-row' });
		const name = nameRow.createSpan({ cls: 'bulk-rename-current-name' });
		name.createSpan({ text: image.file.basename });
		name.createSpan({ text: `.${image.file.extension}`, cls: 'bulk-rename-ext' });
		nameRow.createSpan({ text: 'orphan', cls: 'bulk-rename-tag bulk-rename-tag-orphan' });

		// Path
		const pathRow = contentEl.createDiv({ cls: 'bulk-rename-row bulk-rename-source-row' });
		pathRow.createSpan({ text: image.file.path, cls: 'bulk-rename-path' });
	}

	private selectAll(selected: boolean): void {
		for (const item of this.previewItems) {
			item.selected = selected;
		}
		this.renderList();
	}

	private openOrphanedImagesModal(): void {
		const scanResult = this.service.findOrphanedImages();
		this.close();
		new OrphanedImagesModal(this.app, this.service, scanResult).open();
	}

	private async executeRename(): Promise<void> {
		const selectedCount = this.previewItems.filter((i) => i.selected).length;

		if (selectedCount === 0) {
			new Notice('No images selected');
			return;
		}

		this.listContainer.empty();
		this.listContainer.createEl('p', {
			text: `Renaming ${selectedCount} image${selectedCount !== 1 ? 's' : ''}...`,
			cls: 'bulk-rename-progress',
		});

		const result = await this.service.executeBulkRename(this.previewItems);

		if (result.failed === 0) {
			new Notice(`Successfully renamed ${result.success} image${result.success !== 1 ? 's' : ''}`);
		} else {
			new Notice(
				`Renamed ${result.success}, failed ${result.failed}. Check console for details.`
			);
			console.error('Bulk rename errors:', result.errors);
		}

		this.close();
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
