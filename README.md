# Smart Image Renamer

[![GitHub Release](https://img.shields.io/github/v/release/luca-trifilio/obsidian-smart-image-renamer?style=flat)](https://github.com/luca-trifilio/obsidian-smart-image-renamer/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Tired of `Pasted image 20231201123456.png` cluttering your vault? This Obsidian plugin automatically renames pasted images to match your note's name.

## Features

### Automatic renaming on paste

When you paste an image into a note, it's automatically renamed to `{NoteName} {suffix}.{ext}`.

**Example:** Pasting into "Meeting Notes.md" creates `Meeting Notes 1.png`, `Meeting Notes 2.png`, etc.

### Drag & drop support

Images dropped into notes or Excalidraw drawings are renamed using the same logic.

### Manual rename

Right-click any image and select **"Rename image"** to rename it manually. All references across your vault are updated automatically.

### Bulk rename

Clean up existing images via command palette:
- **Rename images in current note**
- **Rename all images in vault**

Filter by generic names (Pasted image, Screenshot, IMG_...) and choose:
- **Replace**: Note name + sequential number
- **Prepend**: Note name + original name
- **Pattern**: Custom with `{note}`, `{original}`, `{n}` placeholders

### Find orphaned images

Find images not referenced anywhere and delete or move them to a folder.

### Suffix modes

| Mode | Example |
|------|---------|
| **Sequential** (default) | `My Note 1.png`, `My Note 2.png` |
| **Timestamp** | `My Note 20251201-143052.png` |

### Filename sanitization

| Mode | Input | Output |
|------|-------|--------|
| **Normal** (default) | `Caffè & Città` | `Caffè & Città` |
| **Aggressive** | `Caffè & Città` | `caffe_citta` |

Aggressive mode is useful when syncing with systems that don't handle special characters.

## Installation

### Community plugins

1. Open **Settings** → **Community plugins**
2. Click **Browse** and search for "Smart Image Renamer"
3. Click **Install** and **Enable**

### Manual / BRAT

1. Download `main.js`, `manifest.json`, and `styles.css` from the [latest release](https://github.com/luca-trifilio/obsidian-smart-image-renamer/releases/latest)
2. Create folder: `{vault}/.obsidian/plugins/smart-image-renamer/`
3. Copy files into the folder
4. Reload Obsidian and enable the plugin

Or use [BRAT](https://github.com/TfTHacker/obsidian42-brat) with: `luca-trifilio/obsidian-smart-image-renamer`

## Settings

| Setting | Description | Default |
|---------|-------------|---------|
| Suffix mode | Sequential or Timestamp | Sequential |
| Timestamp format | Format string for timestamp mode | `YYYYMMDD-HHmmss` |
| Auto-rename on create | Rename dropped/pasted images automatically | On |
| Suffixes to remove | Strip suffixes from note name when generating image name | `.excalidraw` |
| Aggressive sanitization | URL-friendly filenames | Off |

## Compatibility

- Works on desktop and mobile
- Respects your attachment folder settings
- Supports Excalidraw

## License

MIT

---

[Report Bug](https://github.com/luca-trifilio/obsidian-smart-image-renamer/issues/new?labels=bug) · [Request Feature](https://github.com/luca-trifilio/obsidian-smart-image-renamer/issues/new?labels=enhancement)
