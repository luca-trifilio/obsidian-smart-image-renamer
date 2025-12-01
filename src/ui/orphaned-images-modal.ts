import { App, Modal, Notice, Setting } from 'obsidian';
import { BulkRenameService } from '../services/bulk-rename-service';
import { OrphanedImage, OrphanScanResult } from '../types/bulk-rename';

export class OrphanedImagesModal extends Modal {
	private service: BulkRenameService;
	private scanResult: OrphanScanResult;
	private orphanedImages: OrphanedImage[] = [];
	private listContainer: HTMLElement;
	private targetFolder: string = '_orphaned';

	constructor(app: App, service: BulkRenameService, scanResult: OrphanScanResult) {
		super(app);
		this.service = service;
		this.scanResult = scanResult;
		this.orphanedImages = [...scanResult.orphaned];
	}

	onOpen(): void {
		const { contentEl, modalEl } = this;
		contentEl.addClass('orphaned-images-modal');
		modalEl.addClass('orphaned-images-modal');
		modalEl.style.width = '700px';
		modalEl.style.maxWidth = '95vw';
		contentEl.empty();

		this.renderHeader();
		this.listContainer = contentEl.createDiv({ cls: 'orphaned-images-list' });
		this.renderList();
		this.renderFooter();
	}

	private renderHeader(): void {
		const { contentEl } = this;

		contentEl.createEl('h2', { text: 'Orphaned Images' });

		const statsDiv = contentEl.createDiv({ cls: 'orphaned-images-stats' });
		const totalSize = this.formatSize(
			this.orphanedImages.reduce((sum, img) => sum + img.size, 0)
		);

		statsDiv.createEl('p', {
			text: `Found ${this.orphanedImages.length} orphaned image${this.orphanedImages.length !== 1 ? 's' : ''} (${totalSize} total)`,
		});

		statsDiv.createEl('p', {
			text: 'These images are not linked from any note, canvas, or Excalidraw file.',
			cls: 'orphaned-images-hint',
		});
	}

	private renderList(): void {
		this.listContainer.empty();

		if (this.orphanedImages.length === 0) {
			this.listContainer.createEl('p', {
				text: 'No orphaned images found. Your vault is clean!',
				cls: 'orphaned-images-empty',
			});
			return;
		}

		const listEl = this.listContainer.createDiv({ cls: 'orphaned-images-items' });

		for (const img of this.orphanedImages) {
			this.renderListItem(listEl, img);
		}
	}

	private renderListItem(container: HTMLElement, img: OrphanedImage): void {
		const itemEl = container.createDiv({ cls: 'orphaned-images-item' });

		// Checkbox
		const checkbox = itemEl.createEl('input', {
			type: 'checkbox',
			cls: 'orphaned-images-checkbox',
		});
		checkbox.checked = img.selected;
		checkbox.addEventListener('change', () => {
			img.selected = checkbox.checked;
			this.updateSelectedCount();
		});

		// Thumbnail
		const thumbEl = itemEl.createDiv({ cls: 'orphaned-images-thumb' });
		const imgEl = thumbEl.createEl('img');
		imgEl.src = this.app.vault.adapter.getResourcePath(img.file.path);
		imgEl.alt = img.file.basename;

		// Content
		const contentEl = itemEl.createDiv({ cls: 'orphaned-images-item-content' });

		// Name row
		const nameRow = contentEl.createDiv({ cls: 'orphaned-images-row' });
		const nameSpan = nameRow.createSpan({ cls: 'orphaned-images-name' });
		nameSpan.createSpan({ text: img.file.basename });
		nameSpan.createSpan({ text: `.${img.file.extension}`, cls: 'orphaned-images-ext' });

		// Size badge
		nameRow.createSpan({
			text: this.formatSize(img.size),
			cls: 'orphaned-images-size',
		});

		// Path row
		const pathRow = contentEl.createDiv({ cls: 'orphaned-images-row orphaned-images-path-row' });
		pathRow.createSpan({ text: img.file.path, cls: 'orphaned-images-path' });
	}

	private renderFooter(): void {
		const { contentEl } = this;
		const footerDiv = contentEl.createDiv({ cls: 'orphaned-images-footer' });

		// Selection controls
		const selectDiv = footerDiv.createDiv({ cls: 'orphaned-images-select-actions' });

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

		this.selectedCountEl = selectDiv.createSpan({ cls: 'orphaned-images-selected-count' });
		this.updateSelectedCount();

		// Move folder input
		new Setting(footerDiv)
			.setName('Move folder')
			.setDesc('Folder to move orphaned images to')
			.addText((text) => {
				text
					.setValue(this.targetFolder)
					.setPlaceholder('_orphaned')
					.onChange((value) => {
						this.targetFolder = value || '_orphaned';
					});
			});

		// Action buttons
		const buttonSetting = new Setting(footerDiv);

		buttonSetting.addButton((btn) =>
			btn
				.setButtonText('Delete selected')
				.setWarning()
				.onClick(() => this.confirmDelete())
		);

		buttonSetting.addButton((btn) =>
			btn
				.setButtonText('Move selected')
				.setCta()
				.onClick(() => this.executeMove())
		);

		buttonSetting.addButton((btn) =>
			btn.setButtonText('Cancel').onClick(() => this.close())
		);
	}

	private selectedCountEl: HTMLElement;

	private updateSelectedCount(): void {
		const count = this.orphanedImages.filter((img) => img.selected).length;
		if (this.selectedCountEl) {
			this.selectedCountEl.setText(`${count} selected`);
		}
	}

	private selectAll(selected: boolean): void {
		for (const img of this.orphanedImages) {
			img.selected = selected;
		}
		this.renderList();
		this.updateSelectedCount();
	}

	private confirmDelete(): void {
		const selectedCount = this.orphanedImages.filter((img) => img.selected).length;

		if (selectedCount === 0) {
			new Notice('No images selected');
			return;
		}

		// Show confirmation modal
		const confirmModal = new ConfirmDeleteModal(
			this.app,
			selectedCount,
			() => this.executeDelete()
		);
		confirmModal.open();
	}

	private async executeDelete(): Promise<void> {
		const selectedCount = this.orphanedImages.filter((img) => img.selected).length;

		this.listContainer.empty();
		this.listContainer.createEl('p', {
			text: `Deleting ${selectedCount} image${selectedCount !== 1 ? 's' : ''}...`,
			cls: 'orphaned-images-progress',
		});

		const result = await this.service.deleteOrphanedImages(this.orphanedImages);

		if (result.failed === 0) {
			new Notice(`Deleted ${result.success} image${result.success !== 1 ? 's' : ''} (moved to trash)`);
		} else {
			new Notice(`Deleted ${result.success}, failed ${result.failed}. Check console.`);
			console.error('Orphan delete errors:', result.errors);
		}

		this.close();
	}

	private async executeMove(): Promise<void> {
		const selectedCount = this.orphanedImages.filter((img) => img.selected).length;

		if (selectedCount === 0) {
			new Notice('No images selected');
			return;
		}

		this.listContainer.empty();
		this.listContainer.createEl('p', {
			text: `Moving ${selectedCount} image${selectedCount !== 1 ? 's' : ''} to ${this.targetFolder}/...`,
			cls: 'orphaned-images-progress',
		});

		const result = await this.service.moveOrphanedImages(
			this.orphanedImages,
			this.targetFolder
		);

		if (result.failed === 0) {
			new Notice(`Moved ${result.success} image${result.success !== 1 ? 's' : ''} to ${this.targetFolder}/`);
		} else {
			new Notice(`Moved ${result.success}, failed ${result.failed}. Check console.`);
			console.error('Orphan move errors:', result.errors);
		}

		this.close();
	}

	private formatSize(bytes: number): string {
		if (bytes < 1024) return `${bytes} B`;
		if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
		return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
	}

	onClose(): void {
		this.contentEl.empty();
	}
}

/**
 * Confirmation modal for delete action
 */
class ConfirmDeleteModal extends Modal {
	private count: number;
	private onConfirm: () => void;

	constructor(app: App, count: number, onConfirm: () => void) {
		super(app);
		this.count = count;
		this.onConfirm = onConfirm;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.addClass('confirm-delete-modal');

		contentEl.createEl('h3', { text: 'Confirm Deletion' });

		contentEl.createEl('p', {
			text: `Are you sure you want to delete ${this.count} image${this.count !== 1 ? 's' : ''}?`,
		});

		contentEl.createEl('p', {
			text: 'Files will be moved to your system trash and can be recovered.',
			cls: 'confirm-delete-hint',
		});

		new Setting(contentEl)
			.addButton((btn) =>
				btn
					.setButtonText('Delete')
					.setWarning()
					.onClick(() => {
						this.close();
						this.onConfirm();
					})
			)
			.addButton((btn) =>
				btn.setButtonText('Cancel').onClick(() => this.close())
			);
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
