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

Quando apri una PR verso `main`, il workflow `pr.yml` esegue in sequenza:

1. **Validate** → Verifica presenza label `release:*`
2. **Build-Test** → Lint, test, build (con cache artifacts)
3. **Beta-Release** → Crea pre-release per testing

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

Al merge della PR, il workflow `release.yml` esegue in sequenza:

1. **Build** → Lint, test (verifica finale)
2. **Release** → `npm version`, push tag, GitHub Release
3. **Cleanup** → Elimina tutte le beta releases della PR

Se la PR viene chiusa senza merge, viene eseguito solo il cleanup.

## Diagramma

```
┌─────────────────────────────────────────────────────────────────────┐
│  PR Pipeline (pr.yml)                                               │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│   feature/xxx                                                       │
│        │                                                            │
│        └──── PR aperta/aggiornata                                   │
│                    │                                                │
│        ┌───────────┴───────────┐                                    │
│        ▼                       │                                    │
│  ┌──────────┐                  │                                    │
│  │ validate │──── fail ────────┼────► ❌ Missing label              │
│  └────┬─────┘                  │                                    │
│       │ pass                   │                                    │
│       ▼                        │                                    │
│  ┌────────────┐                │                                    │
│  │ build-test │──── fail ──────┼────► ❌ Test/Lint failed           │
│  └────┬───────┘                │                                    │
│       │ pass                   │                                    │
│       ▼                        │                                    │
│  ┌──────────────┐              │                                    │
│  │ beta-release │              │                                    │
│  │              │              │                                    │
│  │ • Calc version              │                                    │
│  │ • Create release            │                                    │
│  │ • Comment PR │              │                                    │
│  └──────────────┘              │                                    │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
                    │
        Testa beta con BRAT
                    │
        ┌───────────┴───────────┐
        │                       │
        ▼                       ▼
    Bug trovato            Tutto OK
        │                       │
        ▼                       ▼
    Push fix               Merge PR
    (nuova beta)                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│  Release Pipeline (release.yml)                                     │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌───────┐     ┌─────────┐     ┌─────────┐                         │
│  │ build │────►│ release │────►│ cleanup │                         │
│  │       │     │         │     │         │                         │
│  │ lint  │     │ version │     │ delete  │                         │
│  │ test  │     │ tag     │     │ betas   │                         │
│  └───────┘     │ publish │     └─────────┘                         │
│                └─────────┘                                          │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

## File coinvolti

| File | Descrizione |
|------|-------------|
| `.github/workflows/pr.yml` | Pipeline PR: validate → build → beta |
| `.github/workflows/release.yml` | Pipeline release: build → release → cleanup |
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
