# Smart Image Renamer

Tired of `Pasted image 20231201123456.png` cluttering your vault? This Obsidian plugin automatically renames pasted images to match your note's name.

## Features

### Automatic Renaming on Paste

When you paste an image into a note, it's automatically renamed to `{NoteName} {suffix}.{ext}`.

**Example:** Pasting into "Meeting Notes.md" creates `Meeting Notes 1.png`, `Meeting Notes 2.png`, etc.

### Drag & Drop Support

Images dropped into notes or Excalidraw drawings are renamed using the same logic.

### Manual Rename

Right-click any image and select **"Rename image"** to rename it manually. All references across your vault are updated automatically.

### Bulk Rename

Clean up existing images via command palette:
- **Rename images in current note**
- **Rename all images in vault**

Filter by generic names (Pasted image, Screenshot, IMG_...) and choose:
- **Replace**: Note name + sequential number
- **Prepend**: Note name + original name
- **Pattern**: Custom with `{note}`, `{original}`, `{n}` placeholders

### Find Orphaned Images

Find images not referenced anywhere and delete or move them to a folder.

### Suffix Modes

| Mode | Example |
|------|---------|
| **Sequential** (default) | `My Note 1.png`, `My Note 2.png` |
| **Timestamp** | `My Note 20251201-143052.png` |

### Filename Sanitization

| Mode | Input | Output |
|------|-------|--------|
| **Normal** (default) | `Caffè & Città` | `Caffè & Città` |
| **Aggressive** | `Caffè & Città` | `caffe_citta` |

Aggressive mode is useful when syncing with systems that don't handle special characters.

## Installation

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
| Aggressive sanitization | URL-friendly filenames | Off |

## Compatibility

- Works on desktop and mobile
- Respects your attachment folder settings
- Supports Excalidraw

## License

MIT
