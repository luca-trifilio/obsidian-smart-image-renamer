import { IMAGE_EXTENSIONS } from '../utils/constants';

// Wikilink: ![[image.png]] or ![[path/image.png]]
const WIKILINK_IMAGE_REGEX = /!\[\[([^\]]+)\]\]/gi;

// Markdown: ![alt](image.png) or ![](path/image.png)
const MARKDOWN_IMAGE_REGEX = /!\[[^\]]*\]\(([^)]+)\)/gi;

/**
 * Service to track image links in notes and detect when they are removed.
 * Used for auto-prompting image deletion when links are deleted.
 */
export class LinkTrackerService {
	private cache: Map<string, Set<string>> = new Map();

	/**
	 * Check if a path points to an image file.
	 */
	private isImagePath(path: string): boolean {
		const ext = path.split('.').pop()?.toLowerCase() || '';
		return IMAGE_EXTENSIONS.includes(ext as typeof IMAGE_EXTENSIONS[number]);
	}

	/**
	 * Extract all image links from content (wikilinks and markdown syntax).
	 */
	extractImageLinks(content: string): Set<string> {
		const links = new Set<string>();

		// Extract wikilinks: ![[image.png]]
		let match;
		const wikiRegex = new RegExp(WIKILINK_IMAGE_REGEX.source, WIKILINK_IMAGE_REGEX.flags);
		while ((match = wikiRegex.exec(content)) !== null) {
			const path = match[1];
			if (this.isImagePath(path)) {
				links.add(path);
			}
		}

		// Extract markdown links: ![](image.png)
		const mdRegex = new RegExp(MARKDOWN_IMAGE_REGEX.source, MARKDOWN_IMAGE_REGEX.flags);
		while ((match = mdRegex.exec(content)) !== null) {
			// Decode URL-encoded paths (e.g., %20 → space)
			const path = decodeURIComponent(match[1]);
			if (this.isImagePath(path)) {
				links.add(path);
			}
		}

		return links;
	}

	/**
	 * Update cached links for a note.
	 */
	updateCache(notePath: string, content: string): void {
		const links = this.extractImageLinks(content);
		this.cache.set(notePath, links);
	}

	/**
	 * Get cached links for a note.
	 */
	getCachedLinks(notePath: string): Set<string> | undefined {
		return this.cache.get(notePath);
	}

	/**
	 * Detect links removed between cached and new content.
	 * Also updates the cache with new content.
	 * @returns Array of removed image paths
	 */
	detectRemovedLinks(notePath: string, newContent: string): string[] {
		const oldLinks = this.cache.get(notePath);
		const newLinks = this.extractImageLinks(newContent);

		// Update cache with new content
		this.cache.set(notePath, newLinks);

		if (!oldLinks) {
			return [];
		}

		// Find links in old that are not in new
		const removed: string[] = [];
		for (const link of oldLinks) {
			if (!newLinks.has(link)) {
				removed.push(link);
			}
		}

		return removed;
	}

	/**
	 * Clear cache for a note (e.g., when note is closed).
	 */
	clearCache(notePath: string): void {
		this.cache.delete(notePath);
	}
}
