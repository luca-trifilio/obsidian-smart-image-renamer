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
│   │   ├── settings.ts     # Settings interface and defaults
│   │   └── bulk-rename.ts  # Types for bulk rename feature
│   ├── utils/
│   │   ├── constants.ts    # Regex patterns and constants
│   │   └── filename.ts     # Filename generation/sanitization
│   ├── services/
│   │   ├── file-service.ts       # File operations (folders, rename)
│   │   ├── image-processor.ts    # Clipboard and image processing
│   │   └── bulk-rename-service.ts # Bulk rename operations
│   └── ui/
│       ├── rename-modal.ts         # Manual rename modal
│       ├── bulk-rename-modal.ts    # Bulk rename modal
│       ├── orphaned-images-modal.ts # Orphan cleanup modal
│       └── settings-tab.ts         # Settings tab UI
├── tests/
│   ├── __mocks__/
│   │   └── obsidian.ts     # Obsidian API mock
│   ├── utils/              # Unit tests for utils
│   └── services/           # Unit tests for services
├── docs/
│   └── RELEASE_WORKFLOW.md # Release process documentation
├── .github/workflows/
│   ├── ci.yml              # Test + build on every push
│   ├── beta-release.yml    # Auto beta on PR
│   ├── auto-release.yml    # Stable release on merge
│   └── cleanup-beta.yml    # Cleanup betas on PR close
├── manifest.json           # Obsidian plugin manifest
├── versions.json           # Version → minAppVersion map
├── styles.css              # Plugin CSS styles
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

> **Documentazione completa:** [docs/RELEASE_WORKFLOW.md](docs/RELEASE_WORKFLOW.md)

### Quick Reference

1. Crea feature branch e lavora
2. Push e apri PR verso `main`
3. Aggiungi label: `release:patch`, `release:minor`, o `release:major`
4. **Beta automatica** - Ogni push crea una pre-release testabile con BRAT
5. Testa la beta, se OK → Merge
6. **Release stabile** - Al merge, auto-release bumpa versione e pubblica

### Versioning Beta

```
Versione corrente: 0.4.0
Label: release:minor
PR #42, commit abc1234

→ Beta tag: v0.5.0-beta.pr42.abc1234
→ Release finale: v0.5.0
```

### Workflows

| Workflow | Trigger | Azione |
|----------|---------|--------|
| `ci.yml` | Ogni push | Test + Build + Check label |
| `beta-release.yml` | PR aperta/aggiornata | Crea beta pre-release |
| `auto-release.yml` | PR merged | Bump version + Release stabile |
| `cleanup-beta.yml` | PR chiusa | Elimina beta releases |

## Local Testing
```bash
npm run build
cp main.js manifest.json styles.css ~/Documents/Taccuino\ Cerusico/.obsidian/plugins/smart-image-renamer/
# Reload Obsidian (Cmd+R)
```

## Authentication
- PAT personale in `.env` (non committato)
- Remote usa token embedded: `https://<PAT>@github.com/luca-trifilio/...`

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
- minAppVersion: 0.15.0
- Bundle size ~10KB minified
