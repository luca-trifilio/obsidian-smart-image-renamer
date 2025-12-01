import { describe, it, expect } from 'vitest';
import {
	IMAGE_EXTENSIONS,
	MIME_TO_EXTENSION,
	TIMESTAMP_PRESETS,
	IMAGE_LINK_REGEX
} from '../../src/utils/constants';

describe('IMAGE_EXTENSIONS', () => {
	it('should contain all common image extensions', () => {
		expect(IMAGE_EXTENSIONS).toContain('png');
		expect(IMAGE_EXTENSIONS).toContain('jpg');
		expect(IMAGE_EXTENSIONS).toContain('jpeg');
		expect(IMAGE_EXTENSIONS).toContain('gif');
		expect(IMAGE_EXTENSIONS).toContain('webp');
		expect(IMAGE_EXTENSIONS).toContain('bmp');
		expect(IMAGE_EXTENSIONS).toContain('svg');
		expect(IMAGE_EXTENSIONS).toContain('avif');
		expect(IMAGE_EXTENSIONS).toContain('tiff');
		expect(IMAGE_EXTENSIONS).toContain('tif');
		expect(IMAGE_EXTENSIONS).toContain('ico');
	});

	it('should have 11 extensions', () => {
		expect(IMAGE_EXTENSIONS.length).toBe(11);
	});
});

describe('MIME_TO_EXTENSION', () => {
	it('should map common MIME types to extensions', () => {
		expect(MIME_TO_EXTENSION['image/png']).toBe('png');
		expect(MIME_TO_EXTENSION['image/jpeg']).toBe('jpg');
		expect(MIME_TO_EXTENSION['image/gif']).toBe('gif');
		expect(MIME_TO_EXTENSION['image/webp']).toBe('webp');
		expect(MIME_TO_EXTENSION['image/bmp']).toBe('bmp');
		expect(MIME_TO_EXTENSION['image/svg+xml']).toBe('svg');
		expect(MIME_TO_EXTENSION['image/avif']).toBe('avif');
		expect(MIME_TO_EXTENSION['image/tiff']).toBe('tiff');
		expect(MIME_TO_EXTENSION['image/x-icon']).toBe('ico');
		expect(MIME_TO_EXTENSION['image/vnd.microsoft.icon']).toBe('ico');
	});

	it('should have 10 MIME type mappings', () => {
		expect(Object.keys(MIME_TO_EXTENSION).length).toBe(10);
	});
});

describe('TIMESTAMP_PRESETS', () => {
	it('should have compact preset', () => {
		const compact = TIMESTAMP_PRESETS.find(p => p.value === 'YYYYMMDD-HHmmss');
		expect(compact).toBeDefined();
		expect(compact?.label).toContain('Compact');
	});

	it('should have readable preset', () => {
		const readable = TIMESTAMP_PRESETS.find(p => p.value === 'YYYY-MM-DD_HH-mm-ss');
		expect(readable).toBeDefined();
		expect(readable?.label).toContain('Readable');
	});

	it('should have custom option', () => {
		const custom = TIMESTAMP_PRESETS.find(p => p.value === 'custom');
		expect(custom).toBeDefined();
		expect(custom?.label).toContain('Custom');
	});

	it('should have 3 presets', () => {
		expect(TIMESTAMP_PRESETS.length).toBe(3);
	});
});

describe('IMAGE_LINK_REGEX', () => {
	it('should match Obsidian image links', () => {
		expect('![[image.png]]').toMatch(IMAGE_LINK_REGEX);
		expect('![[photo.jpg]]').toMatch(IMAGE_LINK_REGEX);
		expect('![[animation.gif]]').toMatch(IMAGE_LINK_REGEX);
	});

	it('should capture filename', () => {
		// Use exec() instead of match() to get capture groups with global regex
		const regex = new RegExp(IMAGE_LINK_REGEX.source, 'gi');
		const match = regex.exec('![[test.png]]');
		expect(match).not.toBeNull();
		expect(match![1]).toBe('test.png');
	});

	it('should match all image extensions', () => {
		IMAGE_EXTENSIONS.forEach(ext => {
			expect(`![[test.${ext}]]`).toMatch(IMAGE_LINK_REGEX);
		});
	});

	it('should be case insensitive', () => {
		expect('![[image.PNG]]').toMatch(IMAGE_LINK_REGEX);
		expect('![[image.Jpg]]').toMatch(IMAGE_LINK_REGEX);
	});

	it('should not match non-image links', () => {
		// Reset regex lastIndex
		const regex = new RegExp(IMAGE_LINK_REGEX.source, 'gi');
		expect('![[document.pdf]]'.match(regex)).toBeNull();
		expect('![[note.md]]'.match(regex)).toBeNull();
	});
});
