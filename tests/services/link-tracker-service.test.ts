import { describe, it, expect, beforeEach } from 'vitest';
import { LinkTrackerService } from '../../src/services/link-tracker-service';

describe('LinkTrackerService', () => {
	let service: LinkTrackerService;

	beforeEach(() => {
		service = new LinkTrackerService();
	});

	describe('extractImageLinks', () => {
		it('should extract wikilinks from content', () => {
			const content = 'Some text ![[image.png]] more text';
			const links = service.extractImageLinks(content);
			expect(links).toEqual(new Set(['image.png']));
		});

		it('should extract multiple image links', () => {
			const content = '![[first.png]] text ![[second.jpg]] end';
			const links = service.extractImageLinks(content);
			expect(links).toEqual(new Set(['first.png', 'second.jpg']));
		});

		it('should handle image links with paths', () => {
			const content = '![[attachments/subfolder/image.png]]';
			const links = service.extractImageLinks(content);
			expect(links).toEqual(new Set(['attachments/subfolder/image.png']));
		});

		it('should return empty set for no images', () => {
			const content = 'Just some text without images';
			const links = service.extractImageLinks(content);
			expect(links).toEqual(new Set());
		});

		it('should ignore non-image wikilinks', () => {
			const content = '![[note]] ![[image.png]] [[another-note]]';
			const links = service.extractImageLinks(content);
			expect(links).toEqual(new Set(['image.png']));
		});

		it('should handle all supported image extensions', () => {
			const content = '![[a.png]] ![[b.jpg]] ![[c.jpeg]] ![[d.gif]] ![[e.webp]] ![[f.svg]]';
			const links = service.extractImageLinks(content);
			expect(links.size).toBe(6);
		});

		it('should extract markdown image links', () => {
			const content = 'Some text ![alt](image.png) more text';
			const links = service.extractImageLinks(content);
			expect(links).toEqual(new Set(['image.png']));
		});

		it('should extract markdown links with empty alt', () => {
			const content = '![](photo.jpg)';
			const links = service.extractImageLinks(content);
			expect(links).toEqual(new Set(['photo.jpg']));
		});

		it('should decode URL-encoded markdown paths', () => {
			const content = '![](Impianto%20hi-fi%202.jpeg)';
			const links = service.extractImageLinks(content);
			expect(links).toEqual(new Set(['Impianto hi-fi 2.jpeg']));
		});

		it('should extract both wikilinks and markdown links', () => {
			const content = '![[wiki.png]] and ![](markdown.jpg)';
			const links = service.extractImageLinks(content);
			expect(links).toEqual(new Set(['wiki.png', 'markdown.jpg']));
		});

		it('should ignore non-image markdown links', () => {
			const content = '![](document.pdf) ![](image.png)';
			const links = service.extractImageLinks(content);
			expect(links).toEqual(new Set(['image.png']));
		});

		it('should extract path only from wiki-links with caption', () => {
			const content = '![[image.png|My caption here]]';
			const links = service.extractImageLinks(content);
			expect(links).toEqual(new Set(['image.png']));
		});

		it('should extract path only from wiki-links with caption and size', () => {
			const content = '![[image.png|Caption|500]]';
			const links = service.extractImageLinks(content);
			expect(links).toEqual(new Set(['image.png']));
		});
	});

	describe('updateCache', () => {
		it('should store links for a note', () => {
			const content = '![[image.png]]';
			service.updateCache('note.md', content);
			const cached = service.getCachedLinks('note.md');
			expect(cached).toEqual(new Set(['image.png']));
		});

		it('should overwrite previous cache', () => {
			service.updateCache('note.md', '![[old.png]]');
			service.updateCache('note.md', '![[new.png]]');
			const cached = service.getCachedLinks('note.md');
			expect(cached).toEqual(new Set(['new.png']));
		});
	});

	describe('detectRemovedLinks', () => {
		it('should detect when a link is removed', () => {
			// Initial content with image
			service.updateCache('note.md', '![[image.png]] some text');
			// New content without image
			const removed = service.detectRemovedLinks('note.md', 'some text');
			expect(removed).toEqual(['image.png']);
		});

		it('should return empty array when no links removed', () => {
			service.updateCache('note.md', '![[image.png]]');
			const removed = service.detectRemovedLinks('note.md', '![[image.png]] more text');
			expect(removed).toEqual([]);
		});

		it('should NOT detect removal when caption is added', () => {
			// Original: no caption
			service.updateCache('note.md', '![[image.png]]');
			// New: with caption - same image, should NOT trigger removal
			const removed = service.detectRemovedLinks('note.md', '![[image.png|New caption]]');
			expect(removed).toEqual([]);
		});

		it('should NOT detect removal when caption is changed', () => {
			service.updateCache('note.md', '![[image.png|Old caption]]');
			const removed = service.detectRemovedLinks('note.md', '![[image.png|New caption]]');
			expect(removed).toEqual([]);
		});

		it('should detect multiple removed links', () => {
			service.updateCache('note.md', '![[a.png]] ![[b.jpg]] ![[c.gif]]');
			const removed = service.detectRemovedLinks('note.md', '![[b.jpg]]');
			expect(removed).toContain('a.png');
			expect(removed).toContain('c.gif');
			expect(removed).not.toContain('b.jpg');
		});

		it('should return empty array for uncached note', () => {
			const removed = service.detectRemovedLinks('uncached.md', 'some content');
			expect(removed).toEqual([]);
		});

		it('should update cache after detection', () => {
			service.updateCache('note.md', '![[old.png]] ![[keep.png]]');
			service.detectRemovedLinks('note.md', '![[keep.png]]');
			const cached = service.getCachedLinks('note.md');
			expect(cached).toEqual(new Set(['keep.png']));
		});
	});

	describe('clearCache', () => {
		it('should remove note from cache', () => {
			service.updateCache('note.md', '![[image.png]]');
			service.clearCache('note.md');
			const cached = service.getCachedLinks('note.md');
			expect(cached).toBeUndefined();
		});
	});
});
