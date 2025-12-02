import i18next from 'i18next';
import { moment } from 'obsidian';
import en from './locales/en.json';
import it from './locales/it.json';
import type { TranslationKeys } from './types';

const SUPPORTED_LOCALES = ['en', 'it'] as const;
type SupportedLocale = typeof SUPPORTED_LOCALES[number];

const resources = {
	en: { translation: en },
	it: { translation: it },
};

function getSupportedLocale(locale: string): SupportedLocale {
	const lang = locale.split('-')[0]; // "en-US" → "en"
	return SUPPORTED_LOCALES.includes(lang as SupportedLocale)
		? (lang as SupportedLocale)
		: 'en';
}

// Initialize i18next
void i18next.init({
	lng: getSupportedLocale(moment.locale()),
	fallbackLng: 'en',
	resources,
	interpolation: {
		escapeValue: false, // Not needed for Obsidian
	},
});

/**
 * Translate a key with optional interpolation values.
 * Automatically syncs with Obsidian's current language.
 */
export function t(key: TranslationKeys, options?: Record<string, unknown>): string {
	const currentLocale = getSupportedLocale(moment.locale());
	if (i18next.language !== currentLocale) {
		void i18next.changeLanguage(currentLocale);
	}
	return i18next.t(key, options);
}

export { i18next };
