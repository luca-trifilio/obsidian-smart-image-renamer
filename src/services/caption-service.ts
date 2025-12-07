import { WIKI_IMAGE_REGEX, MARKDOWN_IMAGE_REGEX } from '../utils/constants';

export interface ImageLink {
	fullMatch: string;
	filePath: string;
	caption: string | null;
	size: string | null;
	type: 'wiki' | 'markdown';
	start: number;
	end: number;
}

// Regex for wiki-links without extension: ![[filename]], ![[filename|caption]], ![[filename|caption|size]]
// This handles Obsidian's shorthand where extension can be omitted
const WIKI_LINK_NO_EXT_REGEX = /!\[\[([^\]|]+?)(?:\|([^|\]]*?))?(?:\|(\d+))?\]\]/gi;

export class CaptionService {
	parseImageLinks(content: string): ImageLink[] {
		const links: ImageLink[] = [];

		// Parse wiki-links: ![[file.ext|caption|size]]
		const wikiRegex = new RegExp(WIKI_IMAGE_REGEX.source, 'gi');
		let match: RegExpExecArray | null;

		while ((match = wikiRegex.exec(content)) !== null) {
			links.push({
				fullMatch: match[0],
				filePath: match[1],
				caption: match[2] || null,
				size: match[3] || null,
				type: 'wiki',
				start: match.index,
				end: match.index + match[0].length
			});
		}

		// Parse markdown: ![caption](path)
		const mdRegex = new RegExp(MARKDOWN_IMAGE_REGEX.source, 'gi');

		while ((match = mdRegex.exec(content)) !== null) {
			links.push({
				fullMatch: match[0],
				filePath: match[2],
				caption: match[1] || null,
				size: null,
				type: 'markdown',
				start: match.index,
				end: match.index + match[0].length
			});
		}

		// Sort by position
		links.sort((a, b) => a.start - b.start);

		return links;
	}

	/**
	 * Parse all wiki-links (including those without extension)
	 * Used as fallback when image link not found with extension
	 */
	private parseAllWikiLinks(content: string): ImageLink[] {
		const links: ImageLink[] = [];
		const regex = new RegExp(WIKI_LINK_NO_EXT_REGEX.source, 'gi');
		let match: RegExpExecArray | null;

		while ((match = regex.exec(content)) !== null) {
			links.push({
				fullMatch: match[0],
				filePath: match[1],
				caption: match[2] || null,
				size: match[3] || null,
				type: 'wiki',
				start: match.index,
				end: match.index + match[0].length
			});
		}

		return links;
	}

	findImageLink(content: string, imagePath: string): ImageLink | null {
		// First try with extension-required regex (standard image links)
		const links = this.parseImageLinks(content);
		const normalizedPath = this.normalizePath(imagePath);

		let found = links.find(link =>
			this.normalizePath(link.filePath) === normalizedPath
		);

		if (found) return found;

		// Fallback: search for wiki-links without extension
		// Obsidian allows ![[filename]] without extension
		const basename = this.getBasename(imagePath);
		if (basename !== normalizedPath) {
			const allLinks = this.parseAllWikiLinks(content);
			found = allLinks.find(link =>
				this.normalizePath(link.filePath) === basename
			);
		}

		return found || null;
	}

	/**
	 * Get basename without extension, lowercased
	 */
	private getBasename(path: string): string {
		const filename = this.normalizePath(path);
		const lastDot = filename.lastIndexOf('.');
		return lastDot > 0 ? filename.slice(0, lastDot) : filename;
	}

	setCaption(content: string, imagePath: string, caption: string): string {
		const link = this.findImageLink(content, imagePath);
		if (!link) return content;

		const newLink = this.buildImageLink(
			link.filePath,
			caption,
			link.size,
			link.type
		);

		return (
			content.slice(0, link.start) +
			newLink +
			content.slice(link.end)
		);
	}

	removeCaption(content: string, imagePath: string): string {
		const link = this.findImageLink(content, imagePath);
		if (!link) return content;

		const newLink = this.buildImageLink(
			link.filePath,
			null,
			link.size,
			link.type
		);

		return (
			content.slice(0, link.start) +
			newLink +
			content.slice(link.end)
		);
	}

	buildImageLink(
		filePath: string,
		caption: string | null,
		size: string | null,
		type: 'wiki' | 'markdown'
	): string {
		if (type === 'wiki') {
			let link = `![[${filePath}`;
			if (caption) {
				link += `|${caption}`;
			}
			if (size) {
				if (!caption) link += '|';
				link += `|${size}`;
			}
			link += ']]';
			return link;
		} else {
			// Markdown style
			const alt = caption || '';
			return `![${alt}](${filePath})`;
		}
	}

	private normalizePath(path: string): string {
		// Decode URL encoding (e.g., %20 -> space)
		let decoded = path;
		try {
			decoded = decodeURIComponent(path);
		} catch {
			// Keep original if decoding fails
		}
		// Extract just the filename for comparison (handles paths like "folder/image.png")
		const parts = decoded.split('/');
		return parts[parts.length - 1].toLowerCase();
	}
}
