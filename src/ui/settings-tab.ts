import { App, PluginSettingTab, Setting } from 'obsidian';
import { SmartImageRenamerSettings } from '../types/settings';
import { TIMESTAMP_PRESETS, formatTimestamp } from '../utils';

export interface SettingsProvider {
	settings: SmartImageRenamerSettings;
	saveSettings(): Promise<void>;
}

export class SmartImageRenamerSettingTab extends PluginSettingTab {
	private provider: SettingsProvider;

	constructor(app: App, plugin: SettingsProvider & { manifest: { id: string; name: string } }) {
		super(app, plugin as any);
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
					.setDesc('Use: YYYY (year), MM (month), DD (day), HH (hour), mm (min), ss (sec)')
					.addText(text => {
						text.setValue(this.provider.settings.timestampFormat)
							.setPlaceholder('YYYYMMDD-HHmmss')
							.onChange(async (value) => {
								this.provider.settings.timestampFormat = value || 'YYYYMMDD-HHmmss';
								await this.provider.saveSettings();
							});
					});
			}
		}

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
		containerEl.createEl('h3', { text: 'Preview' });
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
