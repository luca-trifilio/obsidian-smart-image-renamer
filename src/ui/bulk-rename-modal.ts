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
import { t } from '../i18n';

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

		void this.scanAndPreview();
	}

	private renderHeader(): void {
		const { contentEl } = this;
		new Setting(contentEl).setName(t('bulkRename.title')).setHeading();
	}

	private renderControls(): void {
		const { contentEl } = this;
		const controlsDiv = contentEl.createDiv({ cls: 'bulk-rename-controls' });

		// Scope selector
		new Setting(controlsDiv)
			.setName(t('bulkRename.scope.name'))
			.setDesc(t('bulkRename.scope.desc'))
			.addDropdown((dropdown) => {
				dropdown
					.addOption('note', t('bulkRename.scope.note'))
					.addOption('vault', t('bulkRename.scope.vault'))
					.setValue(this.renameScope)
					.setDisabled(!this.activeNote)
					.onChange((value: BulkRenameScope) => {
						this.renameScope = value;
						void this.scanAndPreview();
					});
			});

		// Filter selector
		new Setting(controlsDiv)
			.setName(t('bulkRename.filter.name'))
			.setDesc(t('bulkRename.filter.desc'))
			.addDropdown((dropdown) => {
				dropdown
					.addOption('generic', t('bulkRename.filter.generic'))
					.addOption('all', t('bulkRename.filter.all'))
					.setValue(this.filter)
					.onChange((value: ImageFilter) => {
						this.filter = value;
						this.updatePreview();
					});
			});

		// Mode selector
		new Setting(controlsDiv)
			.setName(t('bulkRename.mode.name'))
			.setDesc(t('bulkRename.mode.desc'))
			.addDropdown((dropdown) => {
				dropdown
					.addOption('replace', t('bulkRename.mode.replace'))
					.addOption('prepend', t('bulkRename.mode.prepend'))
					.addOption('pattern', t('bulkRename.mode.pattern'))
					.setValue(this.mode)
					.onChange((value: BulkRenameMode) => {
						this.mode = value;
						this.updatePatternVisibility();
						this.updatePreview();
					});
			});

		// Pattern input (shown only for pattern mode)
		this.patternSetting = new Setting(controlsDiv)
			.setName(t('bulkRename.pattern.name'))
			.setDesc(t('bulkRename.pattern.desc'))
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

	private patternSetting: Setting | undefined;

	private updatePatternVisibility(): void {
		if (this.patternSetting !== undefined) {
			this.patternSetting.settingEl.toggle(this.mode === 'pattern');
		}
	}

	private renderFooter(): void {
		const { contentEl } = this;
		const footerDiv = contentEl.createDiv({ cls: 'bulk-rename-footer' });

		// Select all / none
		const selectDiv = footerDiv.createDiv({ cls: 'bulk-rename-select-actions' });

		const selectAllBtn = selectDiv.createEl('button', {
			text: t('bulkRename.selectAll'),
			cls: 'mod-muted',
		});
		selectAllBtn.addEventListener('click', () => this.selectAll(true));

		const selectNoneBtn = selectDiv.createEl('button', {
			text: t('bulkRename.selectNone'),
			cls: 'mod-muted',
		});
		selectNoneBtn.addEventListener('click', () => this.selectAll(false));

		// Action buttons
		new Setting(footerDiv)
			.addButton((btn) =>
				btn
					.setButtonText(t('bulkRename.renameSelected'))
					.setCta()
					.onClick(() => this.executeRename())
			)
			.addButton((btn) =>
				btn.setButtonText(t('bulkRename.cancel')).onClick(() => this.close())
			);
	}

	private async scanAndPreview(): Promise<void> {
		this.listContainer.empty();
		this.listContainer.createEl('p', { text: t('bulkRename.scanning'), cls: 'bulk-rename-scanning' });

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
				text: t('bulkRename.noImagesFound'),
				cls: 'bulk-rename-empty',
			});
			return;
		}

		// Renameable images section
		if (this.previewItems.length > 0) {
			const count = this.previewItems.length;
			this.listContainer.createEl('p', {
				text: t('bulkRename.foundImages', { count }),
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
				text: t('bulkRename.orphanImages', { count: orphanImages.length }),
				cls: 'bulk-rename-count bulk-rename-orphan-title',
			});

			const manageBtn = orphanHeader.createEl('button', {
				text: t('bulkRename.manageOrphans'),
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
			currentRow.createSpan({ text: t('bulkRename.tagGeneric'), cls: 'bulk-rename-tag bulk-rename-tag-generic' });
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
			sourceRow.createSpan({ text: t('bulkRename.inNote') + ' ' });
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
		nameRow.createSpan({ text: t('bulkRename.tagOrphan'), cls: 'bulk-rename-tag bulk-rename-tag-orphan' });

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
			new Notice(t('notices.noImagesSelected'));
			return;
		}

		this.listContainer.empty();
		this.listContainer.createEl('p', {
			text: t('bulkRename.renaming', { count: selectedCount }),
			cls: 'bulk-rename-progress',
		});

		const result = await this.service.executeBulkRename(this.previewItems);

		if (result.failed === 0) {
			new Notice(t('notices.successfullyRenamed', { count: result.success }));
		} else {
			new Notice(t('notices.renamedWithErrors', { success: result.success, failed: result.failed }));
			console.error('Bulk rename errors:', result.errors);
		}

		this.close();
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
