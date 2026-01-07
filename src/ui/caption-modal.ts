import { App, Modal, Notice, Setting, TFile } from 'obsidian';
import { t } from '../i18n';
import { CaptionService } from '../services/caption-service';

export class CaptionModal extends Modal {
	private imageFile: TFile;
	private sourceNote: TFile;
	private captionService: CaptionService;
	private currentCaption: string | null;
	private inputEl: HTMLInputElement;
	private onSave: (newContent: string) => Promise<void>;

	constructor(
		app: App,
		imageFile: TFile,
		sourceNote: TFile,
		captionService: CaptionService,
		currentCaption: string | null,
		onSave: (newContent: string) => Promise<void>
	) {
		super(app);
		this.imageFile = imageFile;
		this.sourceNote = sourceNote;
		this.captionService = captionService;
		this.currentCaption = currentCaption;
		this.onSave = onSave;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.addClass('caption-modal');

		// Title
		new Setting(contentEl).setName(t('captionModal.title')).setHeading();

		// Image preview
		const previewContainer = contentEl.createDiv({ cls: 'caption-modal-preview' });
		const img = previewContainer.createEl('img');
		img.src = this.app.vault.adapter.getResourcePath(this.imageFile.path);
		img.alt = this.imageFile.basename;

		// Filename
		contentEl.createEl('p', {
			text: this.imageFile.name,
			cls: 'caption-modal-filename'
		});

		// Caption input
		this.inputEl = contentEl.createEl('input', {
			type: 'text',
			value: this.currentCaption || '',
			cls: 'caption-modal-input',
			placeholder: t('captionModal.placeholder')
		});
		this.inputEl.addEventListener('keydown', (e) => {
			if (e.key === 'Enter') {
				e.preventDefault();
				void this.save();
			}
		});

		// Buttons
		const buttonSetting = new Setting(contentEl)
			.addButton((btn) =>
				btn.setButtonText(t('captionModal.save'))
					.setCta()
					.onClick(() => { void this.save(); })
			);

		// Only show remove button if there's an existing caption
		if (this.currentCaption) {
			buttonSetting.addButton((btn) =>
				btn.setButtonText(t('captionModal.remove'))
					.setWarning()
					.onClick(() => { void this.remove(); })
			);
		}

		buttonSetting.addButton((btn) =>
			btn.setButtonText(t('captionModal.cancel'))
				.onClick(() => this.close())
		);

		// Focus input
		setTimeout(() => {
			this.inputEl.focus();
			this.inputEl.select();
		}, 10);
	}

	private async save(): Promise<void> {
		const newCaption = this.inputEl.value.trim();

		// Read current note content
		const content = await this.app.vault.read(this.sourceNote);

		// Check if we can find the image link
		const link = this.captionService.findImageLink(content, this.imageFile.name);
		if (!link) {
			new Notice(t('notices.imageLinkNotFound', { name: this.imageFile.name }));
			return;
		}

		// Update caption
		const newContent = this.captionService.setCaption(
			content,
			this.imageFile.name,
			newCaption
		);

		await this.onSave(newContent);
		new Notice(t('notices.captionSaved'));
		this.close();
	}

	private async remove(): Promise<void> {
		const content = await this.app.vault.read(this.sourceNote);
		const newContent = this.captionService.removeCaption(content, this.imageFile.name);

		await this.onSave(newContent);
		new Notice(t('notices.captionRemoved'));
		this.close();
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
