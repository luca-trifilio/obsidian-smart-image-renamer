import { App, Plugin, PluginSettingTab, Setting } from 'obsidian';
import { SmartImageRenamerSettings } from '../types/settings';
import { TIMESTAMP_PRESETS, formatTimestamp } from '../utils';
import { t } from '../i18n';

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
			.setName(t('settings.suffixMode.name'))
			.setDesc(t('settings.suffixMode.desc'))
			.addDropdown(dropdown => dropdown
				.addOption('sequential', t('settings.suffixMode.sequential'))
				.addOption('timestamp', t('settings.suffixMode.timestamp'))
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
				.setName(t('settings.timestampFormat.name'))
				.setDesc(t('settings.timestampFormat.desc'))
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
					.setName(t('settings.customFormat.name'))
					.setDesc(t('settings.customFormat.desc'))
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
			.setName(t('settings.autoRename.name'))
			.setDesc(t('settings.autoRename.desc'))
			.addToggle(toggle => toggle
				.setValue(this.provider.settings.autoRenameOnCreate)
				.onChange(async (value) => {
					this.provider.settings.autoRenameOnCreate = value;
					await this.provider.saveSettings();
				}));

		// Suffixes to remove
		new Setting(containerEl)
			.setName(t('settings.suffixesToRemove.name'))
			.setDesc(t('settings.suffixesToRemove.desc'))
			.addText(text => text
				.setValue(this.provider.settings.suffixesToRemove.join(', '))
				.setPlaceholder(t('settings.suffixesToRemove.placeholder'))
				.onChange(async (value) => {
					this.provider.settings.suffixesToRemove = value
						.split(',')
						.map(s => s.trim())
						.filter(s => s.length > 0);
					await this.provider.saveSettings();
				}));

		// Aggressive Sanitization Toggle
		new Setting(containerEl)
			.setName(t('settings.aggressiveSanitization.name'))
			.setDesc(t('settings.aggressiveSanitization.desc'))
			.addToggle(toggle => toggle
				.setValue(this.provider.settings.aggressiveSanitization)
				.onChange(async (value) => {
					this.provider.settings.aggressiveSanitization = value;
					await this.provider.saveSettings();
					this.display(); // Refresh preview
				}));

		// Preview
		new Setting(containerEl).setName(t('settings.preview')).setHeading();
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

		el.setText(t('settings.previewExample', { example: `${exampleNote} ${suffix}.png` }));
	}
}
