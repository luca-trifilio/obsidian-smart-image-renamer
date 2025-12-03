import i18next from 'i18next';
import en from './locales/en.json';
import it from './locales/it.json';
import type { TranslationKeys } from './types';

const SUPPORTED_LOCALES = ['en', 'it'] as const;
type SupportedLocale = typeof SUPPORTED_LOCALES[number];

const resources = {
	en: { translation: en },
	it: { translation: it },
};

function getObsidianLocale(): SupportedLocale {
	try {
		const stored = window.localStorage?.getItem('language');
		if (!stored) return 'en';
		const lang = stored.split('-')[0]; // "en-US" → "en"
		return SUPPORTED_LOCALES.includes(lang as SupportedLocale)
			? (lang as SupportedLocale)
			: 'en';
	} catch {
		return 'en';
	}
}

// Initialize i18next once at load time
void i18next.init({
	lng: getObsidianLocale(),
	fallbackLng: 'en',
	resources,
	interpolation: {
		escapeValue: false,
	},
});

/**
 * Translate a key with optional interpolation values.
 */
export function t(key: TranslationKeys, options?: Record<string, unknown>): string {
	return i18next.t(key, options);
}

export { i18next };
