import { App, Modal, Setting, TFile } from 'obsidian';
import { t } from '../i18n';

export class RenameImageModal extends Modal {
	private file: TFile;
	private onSubmit: (newName: string) => void | Promise<void>;
	private inputEl: HTMLInputElement;

	constructor(app: App, file: TFile, onSubmit: (newName: string) => void | Promise<void>) {
		super(app);
		this.file = file;
		this.onSubmit = onSubmit;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.addClass('rename-image-modal');

		new Setting(contentEl).setName(t('renameModal.title')).setHeading();
		contentEl.createEl('p', {
			text: t('renameModal.current', { name: this.file.basename }),
			cls: 'rename-image-current'
		});

		this.inputEl = contentEl.createEl('input', {
			type: 'text',
			value: this.file.basename,
			cls: 'rename-image-input'
		});
		this.inputEl.addEventListener('keydown', (e) => {
			if (e.key === 'Enter') {
				e.preventDefault();
				this.submit();
			}
		});

		new Setting(contentEl)
			.addButton((btn) =>
				btn.setButtonText(t('renameModal.rename'))
					.setCta()
					.onClick(() => this.submit())
			)
			.addButton((btn) =>
				btn.setButtonText(t('bulkRename.cancel'))
					.onClick(() => this.close())
			);

		// Focus and select after render
		setTimeout(() => this.inputEl.select(), 10);
	}

	private submit(): void {
		const newName = this.inputEl.value.trim();
		if (newName && newName !== this.file.basename) {
			void this.onSubmit(newName);
		}
		this.close();
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
