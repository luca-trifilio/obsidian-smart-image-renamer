import { App, Modal, Setting, TFile } from 'obsidian';
import { t } from '../i18n';

export interface DeleteImageModalOptions {
	/** Notes that link to this image (excluding current note) */
	backlinks: string[];
	/** If true, show lightweight orphan prompt */
	isOrphanPrompt?: boolean;
}

export class DeleteImageModal extends Modal {
	private file: TFile;
	private options: DeleteImageModalOptions;
	private onConfirm: () => void | Promise<void>;

	constructor(
		app: App,
		file: TFile,
		options: DeleteImageModalOptions,
		onConfirm: () => void | Promise<void>
	) {
		super(app);
		this.file = file;
		this.options = options;
		this.onConfirm = onConfirm;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.addClass('delete-image-modal');

		if (this.options.isOrphanPrompt) {
			this.renderOrphanPrompt(contentEl);
		} else {
			this.renderFullModal(contentEl);
		}
	}

	private renderOrphanPrompt(contentEl: HTMLElement): void {
		contentEl.addClass('delete-image-modal--orphan');

		contentEl.createEl('p', {
			text: t('deleteImage.orphanPrompt'),
			cls: 'delete-image-prompt'
		});

		contentEl.createEl('p', {
			text: this.file.name,
			cls: 'delete-image-filename'
		});

		new Setting(contentEl)
			.addButton((btn) =>
				btn
					.setButtonText(t('confirmDelete.delete'))
					.setWarning()
					.onClick(() => this.confirm())
			)
			.addButton((btn) =>
				btn.setButtonText(t('bulkRename.cancel')).onClick(() => this.close())
			);
	}

	private renderFullModal(contentEl: HTMLElement): void {
		new Setting(contentEl).setName(t('deleteImage.title')).setHeading();

		contentEl.createEl('p', {
			text: t('deleteImage.confirm'),
		});

		contentEl.createEl('p', {
			text: this.file.name,
			cls: 'delete-image-filename'
		});

		// Show backlinks warning if any
		if (this.options.backlinks.length > 0) {
			const warningEl = contentEl.createDiv({ cls: 'delete-image-warning' });
			warningEl.createEl('p', {
				text: t('deleteImage.linkedIn', { count: this.options.backlinks.length }),
				cls: 'delete-image-warning-text'
			});

			const listEl = warningEl.createEl('ul', { cls: 'delete-image-backlinks' });
			for (const notePath of this.options.backlinks.slice(0, 5)) {
				listEl.createEl('li', { text: notePath });
			}
			if (this.options.backlinks.length > 5) {
				listEl.createEl('li', {
					text: `... +${this.options.backlinks.length - 5}`,
					cls: 'delete-image-more'
				});
			}
		}

		contentEl.createEl('p', {
			text: t('confirmDelete.hint'),
			cls: 'delete-image-hint',
		});

		new Setting(contentEl)
			.addButton((btn) =>
				btn
					.setButtonText(t('confirmDelete.delete'))
					.setWarning()
					.onClick(() => this.confirm())
			)
			.addButton((btn) =>
				btn.setButtonText(t('bulkRename.cancel')).onClick(() => this.close())
			);
	}

	private confirm(): void {
		this.close();
		void this.onConfirm();
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
