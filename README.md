# Smart Image Renamer

An Obsidian plugin that automatically renames pasted images based on the active note's filename.

## Features

### Automatic Image Renaming on Paste

When you paste an image into a note:
1. The plugin intercepts the paste event
2. Renames the image to `{NoteName} {suffix}.{ext}` (e.g., "My Meeting 1.png")
3. Saves it to your configured attachment folder
4. Inserts the markdown link at cursor position

Sequential numbering ensures no overwrites — if "My Meeting 1.png" exists, it creates "My Meeting 2.png".

### Manual Image Renaming

Right-click on any image (either the rendered image or the `![[image.png]]` link) and select **"Rename image"** to rename it. The plugin automatically:
- Updates all references to the image across your vault
- Sanitizes the filename to remove invalid characters

### Suffix Modes

Choose how images are numbered:

| Mode | Example |
|------|---------|
| **Sequential** (default) | `My Note 1.png`, `My Note 2.png`, ... |
| **Timestamp** | `My Note 20251201-143052.png` |

Timestamp format is customizable (e.g., `YYYY-MM-DD_HH-mm-ss`).

### Filename Sanitization

The plugin sanitizes filenames to ensure compatibility:

| Setting | Input | Output |
|---------|-------|--------|
| **Off** (default) | `Caffè & Città` | `Caffè & Città` (only invalid chars removed) |
| **Aggressive** | `Caffè & Città` | `caffe_citta` |

**Aggressive mode** converts to URL-friendly format:
- Lowercase
- Spaces → underscores
- Accents removed (é → e, ñ → n)

This is useful if you sync your vault with systems that don't handle special characters well.

## Installation

### From Community Plugins (recommended)
1. Open Settings → Community plugins
2. Search for "Smart Image Renamer"
3. Install and enable

### Manual
1. Download `main.js` and `manifest.json` from the latest release
2. Create folder: `{vault}/.obsidian/plugins/smart-image-renamer/`
3. Copy files into the folder
4. Reload Obsidian and enable the plugin

## Settings

| Setting | Description | Default |
|---------|-------------|---------|
| **Suffix mode** | Sequential (1, 2, 3...) or Timestamp | Sequential |
| **Timestamp format** | Format for timestamp suffix | `YYYYMMDD-HHmmss` |
| **Aggressive sanitization** | Convert to URL-friendly filenames | Off |

## How It Works

- Respects Obsidian's attachment folder settings (same folder, subfolder, or specific folder)
- Works on desktop and mobile
- Uses Obsidian's built-in `fileManager.renameFile()` to update all references automatically

## Development

```bash
# Install dependencies
npm install

# Build for production
npm run build

# Watch mode for development
npm run dev
```

## License

MIT
