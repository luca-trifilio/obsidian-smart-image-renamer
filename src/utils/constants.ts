export const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'avif', 'tiff', 'tif', 'ico'] as const;

export const MIME_TO_EXTENSION: Record<string, string> = {
	'image/png': 'png',
	'image/jpeg': 'jpg',
	'image/gif': 'gif',
	'image/webp': 'webp',
	'image/bmp': 'bmp',
	'image/svg+xml': 'svg',
	'image/avif': 'avif',
	'image/tiff': 'tiff',
	'image/x-icon': 'ico',
	'image/vnd.microsoft.icon': 'ico',
};

export const TIMESTAMP_PRESETS = [
	{ value: 'YYYYMMDD-HHmmss', label: 'Compact (20251130-185432)' },
	{ value: 'YYYY-MM-DD_HH-mm-ss', label: 'Readable (2025-11-30_18-54-32)' },
	{ value: 'custom', label: 'Custom' }
] as const;

export const IMAGE_LINK_REGEX = /!\[\[([^\]]+\.(png|jpg|jpeg|gif|webp|bmp|svg|avif|tiff|tif|ico))\]\]/gi;
