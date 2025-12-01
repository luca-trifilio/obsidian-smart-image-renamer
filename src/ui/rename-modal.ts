import { App, Modal, TFile, Setting } from 'obsidian';

export class RenameImageModal extends Modal {
	private file: TFile;
	private onSubmit: (newName: string) => void;
	private inputEl: HTMLInputElement;

	constructor(app: App, file: TFile, onSubmit: (newName: string) => void) {
		super(app);
		this.file = file;
		this.onSubmit = onSubmit;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.addClass('rename-image-modal');

		contentEl.createEl('h3', { text: 'Rename image' });
		contentEl.createEl('p', {
			text: `Current: ${this.file.basename}`,
			cls: 'rename-image-current'
		});

		this.inputEl = contentEl.createEl('input', {
			type: 'text',
			value: this.file.basename,
			cls: 'rename-image-input'
		});
		this.inputEl.style.width = '100%';
		this.inputEl.style.marginBottom = '1em';
		this.inputEl.addEventListener('keydown', (e) => {
			if (e.key === 'Enter') {
				e.preventDefault();
				this.submit();
			}
		});

		new Setting(contentEl)
			.addButton((btn) =>
				btn.setButtonText('Rename')
					.setCta()
					.onClick(() => this.submit())
			)
			.addButton((btn) =>
				btn.setButtonText('Cancel')
					.onClick(() => this.close())
			);

		// Focus and select after render
		setTimeout(() => this.inputEl.select(), 10);
	}

	private submit(): void {
		const newName = this.inputEl.value.trim();
		if (newName && newName !== this.file.basename) {
			this.onSubmit(newName);
		}
		this.close();
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
