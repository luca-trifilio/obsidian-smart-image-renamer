# Smart Image Renamer - Project Guide

## Overview
Obsidian plugin that automatically renames pasted images based on the active note's filename.

## Repository
- **GitHub**: https://github.com/luca-trifilio/obsidian-smart-image-renamer
- **Owner**: luca-trifilio (personal account, not Satispay)

## Project Structure
```
├── main.ts                 # Plugin entry point
├── src/
│   ├── types/
│   │   └── settings.ts     # Settings interface and defaults
│   ├── utils/
│   │   ├── constants.ts    # Regex patterns and constants
│   │   └── filename.ts     # Filename generation/sanitization
│   ├── services/
│   │   ├── file-service.ts     # File operations (folders, rename)
│   │   └── image-processor.ts  # Clipboard and image processing
│   └── ui/
│       ├── rename-modal.ts # Manual rename modal
│       └── settings-tab.ts # Settings tab UI
├── tests/
│   ├── __mocks__/
│   │   └── obsidian.ts     # Obsidian API mock
│   ├── utils/              # Unit tests for utils
│   └── services/           # Unit tests for services
├── manifest.json           # Obsidian plugin manifest
├── versions.json           # Version → minAppVersion map
└── version-bump.mjs        # Syncs versions on npm version
```

## Commands
```bash
npm run dev          # Watch mode development
npm run build        # Production build (TypeScript check + esbuild)
npm test             # Run all tests
npm run test:watch   # Watch mode tests
npm run test:coverage # Tests with coverage report
```

## Release Process
```bash
npm version patch|minor|major  # Bumps version, updates manifest.json & versions.json, creates commit+tag
git push && git push --tags    # Triggers GitHub Actions → creates GitHub Release with main.js + manifest.json
```

## Key Settings
- `suffixMode`: 'sequential' | 'timestamp' - How to suffix duplicate image names
- `timestampFormat`: Format string for timestamp mode
- `aggressiveSanitization`: boolean - Normalize and simplify filenames aggressively

## Tech Stack
- TypeScript 5.8
- esbuild (bundler)
- Vitest (testing)
- GitHub Actions (CI/CD)

## Notes
- No styles.css in this plugin
- minAppVersion: 0.15.0
- Bundle size ~10KB minified
