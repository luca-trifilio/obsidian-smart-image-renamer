import { describe, it, expect, beforeEach } from 'vitest';
import { CaptionService, ImageLink } from '../../src/services/caption-service';

describe('CaptionService', () => {
	let service: CaptionService;

	beforeEach(() => {
		service = new CaptionService();
	});

	describe('parseImageLinks', () => {
		describe('wiki-link syntax', () => {
			it('should parse wiki-link without caption', () => {
				const content = '![[image.png]]';
				const links = service.parseImageLinks(content);

				expect(links).toHaveLength(1);
				expect(links[0]).toMatchObject({
					fullMatch: '![[image.png]]',
					filePath: 'image.png',
					caption: null,
					size: null,
					type: 'wiki'
				});
			});

			it('should parse wiki-link with caption', () => {
				const content = '![[screenshot.jpg|My caption here]]';
				const links = service.parseImageLinks(content);

				expect(links).toHaveLength(1);
				expect(links[0]).toMatchObject({
					filePath: 'screenshot.jpg',
					caption: 'My caption here',
					size: null,
					type: 'wiki'
				});
			});

			it('should parse wiki-link with caption and size', () => {
				const content = '![[diagram.png|Architecture diagram|500]]';
				const links = service.parseImageLinks(content);

				expect(links).toHaveLength(1);
				expect(links[0]).toMatchObject({
					filePath: 'diagram.png',
					caption: 'Architecture diagram',
					size: '500',
					type: 'wiki'
				});
			});

			it('should parse wiki-link with size only (empty caption)', () => {
				const content = '![[image.png||200]]';
				const links = service.parseImageLinks(content);

				expect(links).toHaveLength(1);
				expect(links[0]).toMatchObject({
					filePath: 'image.png',
					caption: null,  // empty string captured as null
					size: '200',
					type: 'wiki'
				});
			});

			it('should parse wiki-link with path', () => {
				const content = '![[attachments/folder/image.png|Caption]]';
				const links = service.parseImageLinks(content);

				expect(links).toHaveLength(1);
				expect(links[0]).toMatchObject({
					filePath: 'attachments/folder/image.png',
					caption: 'Caption',
					type: 'wiki'
				});
			});

			it('should handle various image extensions', () => {
				const extensions = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'avif', 'tiff', 'tif', 'ico', 'bmp'];

				for (const ext of extensions) {
					const content = `![[image.${ext}|caption]]`;
					const links = service.parseImageLinks(content);
					expect(links).toHaveLength(1);
					expect(links[0].filePath).toBe(`image.${ext}`);
				}
			});
		});

		describe('markdown syntax', () => {
			it('should parse markdown image without caption', () => {
				const content = '![](image.png)';
				const links = service.parseImageLinks(content);

				expect(links).toHaveLength(1);
				expect(links[0]).toMatchObject({
					filePath: 'image.png',
					caption: null,  // empty alt treated as null
					size: null,
					type: 'markdown'
				});
			});

			it('should parse markdown image with alt text', () => {
				const content = '![My screenshot](screenshot.jpg)';
				const links = service.parseImageLinks(content);

				expect(links).toHaveLength(1);
				expect(links[0]).toMatchObject({
					filePath: 'screenshot.jpg',
					caption: 'My screenshot',
					type: 'markdown'
				});
			});

			it('should parse markdown image with title', () => {
				const content = '![Alt text](image.png "Title text")';
				const links = service.parseImageLinks(content);

				expect(links).toHaveLength(1);
				expect(links[0]).toMatchObject({
					filePath: 'image.png',
					caption: 'Alt text',
					type: 'markdown'
				});
			});

			it('should parse markdown image with path', () => {
				const content = '![Caption](./assets/img.png)';
				const links = service.parseImageLinks(content);

				expect(links).toHaveLength(1);
				expect(links[0].filePath).toBe('./assets/img.png');
			});
		});

		describe('multiple images', () => {
			it('should parse multiple wiki-links', () => {
				const content = `
Some text
![[first.png|First image]]
More text
![[second.jpg|Second image]]
`;
				const links = service.parseImageLinks(content);

				expect(links).toHaveLength(2);
				expect(links[0].filePath).toBe('first.png');
				expect(links[1].filePath).toBe('second.jpg');
			});

			it('should parse mixed wiki-link and markdown', () => {
				const content = `
![[wiki-image.png|Wiki caption]]
![Markdown caption](md-image.jpg)
`;
				const links = service.parseImageLinks(content);

				expect(links).toHaveLength(2);
				expect(links[0].type).toBe('wiki');
				expect(links[1].type).toBe('markdown');
			});

			it('should return links sorted by position', () => {
				const content = '![first](a.png) ![[b.png]] ![third](c.png)';
				const links = service.parseImageLinks(content);

				expect(links).toHaveLength(3);
				expect(links[0].start).toBeLessThan(links[1].start);
				expect(links[1].start).toBeLessThan(links[2].start);
			});
		});

		describe('edge cases', () => {
			it('should return empty array for content without images', () => {
				const content = 'Just some text without images';
				const links = service.parseImageLinks(content);
				expect(links).toHaveLength(0);
			});

			it('should not match non-image links', () => {
				const content = '[[note.md]] ![[document.pdf]]';
				const links = service.parseImageLinks(content);
				expect(links).toHaveLength(0);
			});

			it('should handle caption with special characters', () => {
				const content = '![[image.png|Caption with (parens) and - dashes]]';
				const links = service.parseImageLinks(content);

				expect(links[0].caption).toBe('Caption with (parens) and - dashes');
			});

			it('should track correct start and end positions', () => {
				const content = 'prefix ![[image.png]] suffix';
				const links = service.parseImageLinks(content);

				expect(links[0].start).toBe(7);
				expect(links[0].end).toBe(21);
				expect(content.slice(links[0].start, links[0].end)).toBe('![[image.png]]');
			});
		});
	});

	describe('findImageLink', () => {
		it('should find image by exact filename', () => {
			const content = '![[image.png|caption]] ![[other.jpg]]';
			const link = service.findImageLink(content, 'image.png');

			expect(link).not.toBeNull();
			expect(link?.filePath).toBe('image.png');
		});

		it('should find image by path (normalized)', () => {
			const content = '![[attachments/image.png|caption]]';
			const link = service.findImageLink(content, 'image.png');

			expect(link).not.toBeNull();
			expect(link?.caption).toBe('caption');
		});

		it('should be case-insensitive', () => {
			const content = '![[Screenshot.PNG|caption]]';
			const link = service.findImageLink(content, 'screenshot.png');

			expect(link).not.toBeNull();
		});

		it('should return null when image not found', () => {
			const content = '![[other.png]]';
			const link = service.findImageLink(content, 'missing.png');

			expect(link).toBeNull();
		});

		it('should find wiki-link without extension (Obsidian shorthand)', () => {
			const content = '![[Impianto hi-fi 2]]';
			const link = service.findImageLink(content, 'Impianto hi-fi 2.jpeg');

			expect(link).not.toBeNull();
			expect(link?.filePath).toBe('Impianto hi-fi 2');
		});

		it('should find wiki-link without extension with caption', () => {
			const content = '![[my image|some caption]]';
			const link = service.findImageLink(content, 'my image.png');

			expect(link).not.toBeNull();
			expect(link?.caption).toBe('some caption');
		});

		it('should prefer exact match over basename fallback', () => {
			const content = '![[image.png|exact]] ![[image|fallback]]';
			const link = service.findImageLink(content, 'image.png');

			expect(link).not.toBeNull();
			expect(link?.caption).toBe('exact');
		});

		it('should handle URL-encoded paths in markdown syntax', () => {
			const content = '![](Impianto%20hi-fi%202.jpeg)';
			const link = service.findImageLink(content, 'Impianto hi-fi 2.jpeg');

			expect(link).not.toBeNull();
			expect(link?.type).toBe('markdown');
		});

		it('should handle URL-encoded paths with caption', () => {
			const content = '![My caption](folder%2Fimage%20name.png)';
			const link = service.findImageLink(content, 'image name.png');

			expect(link).not.toBeNull();
			expect(link?.caption).toBe('My caption');
		});
	});

	describe('setCaption', () => {
		it('should add caption to image without caption', () => {
			const content = '![[image.png]]';
			const result = service.setCaption(content, 'image.png', 'New caption');

			expect(result).toBe('![[image.png|New caption]]');
		});

		it('should update existing caption', () => {
			const content = '![[image.png|Old caption]]';
			const result = service.setCaption(content, 'image.png', 'New caption');

			expect(result).toBe('![[image.png|New caption]]');
		});

		it('should preserve size when updating caption', () => {
			const content = '![[image.png|Old caption|300]]';
			const result = service.setCaption(content, 'image.png', 'New caption');

			expect(result).toBe('![[image.png|New caption|300]]');
		});

		it('should add caption to markdown image', () => {
			const content = '![](image.png)';
			const result = service.setCaption(content, 'image.png', 'New caption');

			expect(result).toBe('![New caption](image.png)');
		});

		it('should update markdown image caption', () => {
			const content = '![Old](image.png)';
			const result = service.setCaption(content, 'image.png', 'New caption');

			expect(result).toBe('![New caption](image.png)');
		});

		it('should preserve surrounding content', () => {
			const content = 'Before ![[image.png]] After';
			const result = service.setCaption(content, 'image.png', 'Caption');

			expect(result).toBe('Before ![[image.png|Caption]] After');
		});

		it('should return unchanged content if image not found', () => {
			const content = '![[other.png]]';
			const result = service.setCaption(content, 'missing.png', 'Caption');

			expect(result).toBe(content);
		});

		it('should only update the targeted image', () => {
			const content = '![[first.png]] ![[second.png]]';
			const result = service.setCaption(content, 'second.png', 'Caption');

			expect(result).toBe('![[first.png]] ![[second.png|Caption]]');
		});
	});

	describe('removeCaption', () => {
		it('should remove caption from wiki-link', () => {
			const content = '![[image.png|Caption to remove]]';
			const result = service.removeCaption(content, 'image.png');

			expect(result).toBe('![[image.png]]');
		});

		it('should preserve size when removing caption', () => {
			const content = '![[image.png|Caption|300]]';
			const result = service.removeCaption(content, 'image.png');

			expect(result).toBe('![[image.png||300]]');
		});

		it('should remove caption from markdown image', () => {
			const content = '![Caption](image.png)';
			const result = service.removeCaption(content, 'image.png');

			expect(result).toBe('![](image.png)');
		});

		it('should be idempotent for images without caption', () => {
			const content = '![[image.png]]';
			const result = service.removeCaption(content, 'image.png');

			expect(result).toBe('![[image.png]]');
		});
	});

	describe('buildImageLink', () => {
		describe('wiki-link', () => {
			it('should build basic wiki-link', () => {
				const result = service.buildImageLink('image.png', null, null, 'wiki');
				expect(result).toBe('![[image.png]]');
			});

			it('should build wiki-link with caption', () => {
				const result = service.buildImageLink('image.png', 'My caption', null, 'wiki');
				expect(result).toBe('![[image.png|My caption]]');
			});

			it('should build wiki-link with caption and size', () => {
				const result = service.buildImageLink('image.png', 'Caption', '500', 'wiki');
				expect(result).toBe('![[image.png|Caption|500]]');
			});

			it('should build wiki-link with size only', () => {
				const result = service.buildImageLink('image.png', null, '300', 'wiki');
				expect(result).toBe('![[image.png||300]]');
			});
		});

		describe('markdown', () => {
			it('should build basic markdown image', () => {
				const result = service.buildImageLink('image.png', null, null, 'markdown');
				expect(result).toBe('![](image.png)');
			});

			it('should build markdown image with caption', () => {
				const result = service.buildImageLink('image.png', 'Alt text', null, 'markdown');
				expect(result).toBe('![Alt text](image.png)');
			});
		});
	});
});
