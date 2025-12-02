import en from './locales/en.json';

// Remove plural suffixes (_one, _other) from key strings
type RemovePluralSuffix<S extends string> = S extends `${infer Base}_one`
	? Base
	: S extends `${infer Base}_other`
		? Base
		: S;

// Generate nested key paths from translation object
type NestedKeyOf<T, K extends string = ''> = T extends object
	? {
			[P in keyof T & string]: T[P] extends object
				? NestedKeyOf<T[P], K extends '' ? P : `${K}.${P}`>
				: K extends ''
					? RemovePluralSuffix<P>
					: `${K}.${RemovePluralSuffix<P>}`;
		}[keyof T & string]
	: never;

export type TranslationKeys = NestedKeyOf<typeof en>;
