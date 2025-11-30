# Smart Image Renamer

An Obsidian plugin that automatically renames pasted images based on the active note's filename.

## How it works

When you paste an image into a note:
1. The plugin intercepts the paste event
2. Renames the image to `{NoteName} {N}.{ext}` (e.g., "My Meeting 1.png")
3. Saves it to your configured attachment folder
4. Inserts the markdown link at cursor position

Sequential numbering ensures no overwrites — if "My Meeting 1.png" exists, it creates "My Meeting 2.png".

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

## Features

- Respects Obsidian's attachment folder settings
- Sanitizes filenames (removes invalid characters)
- Works on desktop and mobile
- Zero configuration needed

## License

MIT
