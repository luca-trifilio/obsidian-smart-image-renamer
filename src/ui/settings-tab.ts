import { App, Plugin, PluginSettingTab, Setting } from 'obsidian';
import { SmartImageRenamerSettings } from '../types/settings';
import { TIMESTAMP_PRESETS, formatTimestamp } from '../utils';

export interface SettingsProvider {
	settings: SmartImageRenamerSettings;
	saveSettings(): Promise<void>;
}

export class SmartImageRenamerSettingTab extends PluginSettingTab {
	private provider: SettingsProvider;

	constructor(app: App, plugin: Plugin & SettingsProvider) {
		super(app, plugin);
		this.provider = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		// Suffix Mode
		new Setting(containerEl)
			.setName('Suffix mode')
			.setDesc('How to generate the suffix for image filenames')
			.addDropdown(dropdown => dropdown
				.addOption('sequential', 'Sequential (1, 2, 3...)')
				.addOption('timestamp', 'Timestamp')
				.setValue(this.provider.settings.suffixMode)
				.onChange(async (value: 'sequential' | 'timestamp') => {
					this.provider.settings.suffixMode = value;
					await this.provider.saveSettings();
					this.display(); // Refresh to show/hide timestamp options
				}));

		// Timestamp format (only show if timestamp mode)
		if (this.provider.settings.suffixMode === 'timestamp') {
			const isCustom = !TIMESTAMP_PRESETS.slice(0, -1).some(
				p => p.value === this.provider.settings.timestampFormat
			);

			new Setting(containerEl)
				.setName('Timestamp format')
				.setDesc('Choose a preset or custom format')
				.addDropdown(dropdown => {
					TIMESTAMP_PRESETS.forEach(preset => {
						dropdown.addOption(preset.value, preset.label);
					});
					dropdown.setValue(isCustom ? 'custom' : this.provider.settings.timestampFormat);
					dropdown.onChange(async (value) => {
						if (value === 'custom') {
							this.display();
						} else {
							this.provider.settings.timestampFormat = value;
							await this.provider.saveSettings();
							this.display();
						}
					});
				});

			// Show custom format field if custom is selected
			if (isCustom) {
				new Setting(containerEl)
					.setName('Custom format')
					.setDesc('Supports year, month, day, hour, minute, second tokens')
					.addText(text => {
						text.setValue(this.provider.settings.timestampFormat)
							.setPlaceholder('20240101-120000')
							.onChange(async (value) => {
								this.provider.settings.timestampFormat = value || 'YYYYMMDD-HHmmss';
								await this.provider.saveSettings();
							});
					});
			}
		}

		// Auto-rename on create
		new Setting(containerEl)
			.setName('Auto-rename images from any source')
			.setDesc(
				'Automatically rename images with generic names (Pasted image, Screenshot, etc.) ' +
				'when created from any source: drag & drop, Excalidraw, or other plugins.'
			)
			.addToggle(toggle => toggle
				.setValue(this.provider.settings.autoRenameOnCreate)
				.onChange(async (value) => {
					this.provider.settings.autoRenameOnCreate = value;
					await this.provider.saveSettings();
				}));

		// Suffixes to remove
		new Setting(containerEl)
			.setName('Suffixes to remove from note names')
			.setDesc(
				'Comma-separated list of suffixes to strip from note names. ' +
				'Example: .excalidraw,.canvas (removes ".excalidraw" from "Drawing.excalidraw.md")'
			)
			.addText(text => text
				.setValue(this.provider.settings.suffixesToRemove.join(', '))
				.setPlaceholder('Suffixes to strip')
				.onChange(async (value) => {
					this.provider.settings.suffixesToRemove = value
						.split(',')
						.map(s => s.trim())
						.filter(s => s.length > 0);
					await this.provider.saveSettings();
				}));

		// Aggressive Sanitization Toggle
		new Setting(containerEl)
			.setName('Aggressive filename sanitization')
			.setDesc(
				'When enabled, filenames are converted to URL-friendly format: ' +
				'lowercase, spaces → underscores, accents removed (é → e). ' +
				'When disabled, only invalid filesystem characters are removed. ' +
				'This applies to both pasted images and manual renames.'
			)
			.addToggle(toggle => toggle
				.setValue(this.provider.settings.aggressiveSanitization)
				.onChange(async (value) => {
					this.provider.settings.aggressiveSanitization = value;
					await this.provider.saveSettings();
					this.display(); // Refresh preview
				}));

		// Preview
		new Setting(containerEl).setName("Preview").setHeading();
		const previewEl = containerEl.createEl('p', { cls: 'setting-item-description' });
		this.updatePreview(previewEl);
	}

	private updatePreview(el: HTMLElement): void {
		const exampleNote = this.provider.settings.aggressiveSanitization
			? 'my_example_note'
			: 'My Example Note';

		let suffix: string;
		if (this.provider.settings.suffixMode === 'timestamp') {
			suffix = formatTimestamp(this.provider.settings.timestampFormat);
		} else {
			suffix = '1';
		}

		el.setText(`Example: ${exampleNote} ${suffix}.png`);
	}
}
