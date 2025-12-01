# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build Commands

```bash
npm run build    # TypeScript check + esbuild production bundle
npm run dev      # Watch mode for development
```

## Testing Locally

Copy built plugin to Obsidian vault:
```bash
npm run build && cp main.js manifest.json "/path/to/vault/.obsidian/plugins/smart-image-renamer/"
```
Then reload Obsidian (Cmd+R).

## Release Process

1. Create feature branch, implement changes
2. Push branch and create PR (CI runs build check)
3. Merge PR to main
4. Create tag: `git tag X.Y.Z && git push --tags` (or via GitHub UI)
5. Release workflow automatically:
   - Updates version in manifest.json and package.json
   - Builds and creates GitHub release with assets
   - Commits version bump back to main

## Architecture

Single-file plugin (`main.ts`) with three main components:

- **SmartImageRenamer** (Plugin class): Registers event handlers for paste and context menu
- **SmartImageRenamerSettingTab**: Settings UI (suffix mode, timestamp format, sanitization)
- **RenameImageModal**: Modal dialog for renaming existing images

Key flows:
- `handlePaste` → `processImage` → `getAvailablePath` → save to vault
- `handleEditorMenu` / `handleImageContextMenu` → `renameImageFile` → modal → `fileManager.renameFile`

Settings stored via `loadData()`/`saveData()` in plugin's data.json.

## Obsidian API Notes

- Use `this.app.vault` for file operations (not Node.js fs)
- `this.app.vault.getConfig("attachmentFolderPath")` for attachment folder setting (internal API)
- `this.app.fileManager.renameFile()` auto-updates all links in vault
