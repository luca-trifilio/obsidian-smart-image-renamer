# Release Workflow

Questo documento descrive il processo di release automatizzato del plugin.

## Overview

```
Feature Branch → PR → Beta automatica → Merge → Release stabile
```

## Flusso completo

### 1. Sviluppo

```bash
git checkout -b feature/my-feature
# ... lavora ...
git push origin feature/my-feature
```

### 2. Apertura PR

Quando apri una PR verso `main`:
1. **CI (`ci.yml`)**: Esegue test e build
2. **Beta Release (`beta-release.yml`)**: Crea una pre-release automatica

### 3. Labels obbligatorie

Ogni PR deve avere **una** di queste labels:

| Label | Effetto | Esempio |
|-------|---------|---------|
| `release:patch` | Bump patch version | 0.4.0 → 0.4.1 |
| `release:minor` | Bump minor version | 0.4.0 → 0.5.0 |
| `release:major` | Bump major version | 0.4.0 → 1.0.0 |

### 4. Beta Release

Ad ogni push sulla PR, viene creata automaticamente una beta:

```
Versione corrente: 0.4.0
Label: release:minor
PR #42, commit abc1234

→ Beta tag: v0.5.0-beta.pr42.abc1234
```

**Caratteristiche:**
- La versione beta riflette la versione finale prevista
- Ogni nuovo push elimina la beta precedente della stessa PR
- Commento automatico sulla PR con istruzioni di installazione
- Marcata come "Pre-release" su GitHub

### 5. Testing con BRAT

Per testare la beta:

1. Installa [BRAT](https://github.com/TfTHacker/obsidian42-brat) in Obsidian
2. Vai in Settings → BRAT → Add Beta Plugin
3. Inserisci: `luca-trifilio/obsidian-smart-image-renamer`
4. Seleziona la versione beta dal dropdown

### 6. Merge e Release Stabile

Al merge della PR:

1. **Auto Release (`auto-release.yml`)**:
   - Legge la label
   - Esegue `npm version [patch|minor|major]`
   - Aggiorna `manifest.json` e `versions.json`
   - Crea commit e tag
   - Pubblica release stabile su GitHub

2. **Cleanup (`cleanup-beta.yml`)**:
   - Elimina tutte le beta releases della PR

## Diagramma

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                  │
│   feature/xxx                                                    │
│        │                                                         │
│        ├──── push ────► CI (test + build)                       │
│        │                                                         │
│        └──── PR aperta/aggiornata                               │
│                    │                                             │
│                    ▼                                             │
│        ┌─────────────────────────┐                              │
│        │ beta-release.yml        │                              │
│        │                         │                              │
│        │ 1. Legge label          │                              │
│        │ 2. Calcola versione     │                              │
│        │ 3. Crea pre-release     │                              │
│        │ 4. Commenta su PR       │                              │
│        └─────────────────────────┘                              │
│                    │                                             │
│                    ▼                                             │
│        Testa beta con BRAT                                       │
│                    │                                             │
│        ┌───────────┴───────────┐                                │
│        │                       │                                 │
│        ▼                       ▼                                 │
│    Bug trovato            Tutto OK                               │
│        │                       │                                 │
│        ▼                       ▼                                 │
│    Push fix               Merge PR                               │
│    (nuova beta)                │                                 │
│                                ▼                                 │
│                   ┌─────────────────────────┐                   │
│                   │ auto-release.yml        │                   │
│                   │                         │                   │
│                   │ 1. npm version bump     │                   │
│                   │ 2. Push tag             │                   │
│                   │ 3. GitHub Release       │                   │
│                   └─────────────────────────┘                   │
│                                │                                 │
│                                ▼                                 │
│                   ┌─────────────────────────┐                   │
│                   │ cleanup-beta.yml        │                   │
│                   │                         │                   │
│                   │ Elimina beta releases   │                   │
│                   └─────────────────────────┘                   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## File coinvolti

| File | Descrizione |
|------|-------------|
| `.github/workflows/ci.yml` | Test e build su ogni push |
| `.github/workflows/beta-release.yml` | Crea beta su PR |
| `.github/workflows/auto-release.yml` | Release stabile al merge |
| `.github/workflows/cleanup-beta.yml` | Pulizia beta al merge/close |
| `manifest.json` | Versione del plugin |
| `versions.json` | Mapping versione → minAppVersion |
| `version-bump.mjs` | Script per sync versioni |

## Troubleshooting

### La beta non viene creata
- Verifica che la PR abbia una label `release:*`
- Controlla i log del workflow in Actions

### La release stabile non viene creata
- Verifica che la PR sia stata mergiata (non solo chiusa)
- Verifica che ci sia una label `release:*`
- Controlla che `PAT_TOKEN` sia configurato nei secrets

### Errore "tag already exists"
- Una release con quel tag esiste già
- Elimina manualmente la release/tag o usa una versione diversa
