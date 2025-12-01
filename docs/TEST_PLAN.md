# Test Plan - Smart Image Renamer

## Stato Attuale

### Test Esistenti (235 test)
| File | Coverage | Stato |
|------|----------|-------|
| `tests/utils/filename.test.ts` | sanitizeFilename, formatTimestamp, isImageFile, getExtensionFromMime, getImageLinkAtCursor, extractImagePathFromSrc, removeNoteSuffixes | ✅ Completo |
| `tests/utils/constants.test.ts` | IMAGE_EXTENSIONS, MIME_TO_EXTENSION, TIMESTAMP_PRESETS, IMAGE_LINK_REGEX | ✅ Completo |
| `tests/services/file-service.test.ts` | getAttachmentFolder, ensureFolderExists, getAvailablePath, renameFile, createBinaryFile, resolveImageLink | ✅ Completo |
| `tests/services/image-processor.test.ts` | getImageFromClipboard, processImage, insertMarkdownLink | ✅ Completo |
| `tests/services/bulk-rename-service.test.ts` | isGenericName, scanImagesInNote, scanImagesInVault, generatePreview, executeBulkRename | ✅ Completo |
| `tests/main.test.ts` | Plugin lifecycle, paste/drop handlers, file create, context menu, settings, commands | ✅ Completo |

---

## Piano di Lavoro

### Fase 1: Migliorare i Mock Obsidian

**File:** `tests/__mocks__/obsidian.ts`

Aggiungere:
- [x] `Vault.on()` - Mock per eventi vault (create, delete, rename, modify)
- [x] `Workspace.on()` - Mock per eventi workspace (editor-paste, editor-drop, editor-menu)
- [x] `Workspace.getActiveFile()` - Mock per file attivo
- [x] `MetadataCache.on()` - Mock per eventi metadata
- [x] Event emitter pattern per simulare eventi

```typescript
// Esempio struttura evento
class MockEventEmitter {
  private handlers: Map<string, Function[]> = new Map();

  on(event: string, handler: Function): { unload: () => void } {
    // ...
  }

  trigger(event: string, ...args: any[]): void {
    // ...
  }
}
```

### Fase 2: Test Plugin Lifecycle

**File:** `tests/main.test.ts`

#### 2.1 Inizializzazione Plugin
- [x] `onload()` registra tutti gli eventi necessari
- [x] `onload()` inizializza i servizi (FileService, ImageProcessor, BulkRenameService)
- [x] `onload()` aggiunge i comandi
- [x] `onload()` aggiunge la settings tab
- [x] `isStartupComplete` diventa true dopo 3 secondi

#### 2.2 Cleanup Plugin
- [x] `onunload()` non genera errori

### Fase 3: Test Paste Handler

**File:** `tests/main.test.ts` (sezione handlePaste)

#### 3.1 Casi Positivi
- [x] Paste di immagine PNG viene processato
- [x] Paste di immagine JPEG viene processato
- [x] Paste di immagine GIF viene processato
- [x] Il link markdown viene inserito nell'editor
- [x] La Notice viene mostrata con il nome del file
- [x] Il file viene aggiunto a processingFiles per evitare doppio rename

#### 3.2 Casi Negativi
- [x] Paste senza clipboardData viene ignorato
- [x] Paste senza immagine viene ignorato
- [x] Paste senza file attivo mostra errore
- [x] Errore durante processImage mostra Notice di errore

### Fase 4: Test Drop Handler (Editor)

**File:** `tests/main.test.ts` (sezione handleDrop)

#### 4.1 Casi Positivi
- [x] Drop di immagine singola viene processato
- [x] Drop di immagini multiple viene processato
- [x] Il link markdown viene inserito per ogni immagine
- [x] La Notice viene mostrata per ogni file

#### 4.2 Casi Negativi
- [x] Drop già gestito (defaultPrevented) viene ignorato
- [x] Drop senza dataTransfer viene ignorato
- [x] Drop senza immagini viene ignorato
- [x] Drop senza file attivo mostra errore

### Fase 5: Test Global Drop Handler (Excalidraw)

**File:** `tests/main.test.ts` (sezione handleGlobalDrop)

#### 5.1 Rilevamento Excalidraw
- [x] File `.excalidraw.md` viene riconosciuto come Excalidraw
- [x] File `.excalidraw` (case insensitive) viene riconosciuto
- [x] File markdown normale NON viene riconosciuto come Excalidraw

#### 5.2 Flag forceRenameNext
- [x] Il flag viene settato a true quando drop su Excalidraw
- [x] Il flag viene resettato dopo 5 secondi se non usato
- [x] Il flag viene resettato dopo l'uso in handleFileCreate

#### 5.3 Casi Negativi
- [x] Drop senza immagini viene ignorato
- [x] Drop senza file attivo viene ignorato

### Fase 6: Test File Create Handler

**File:** `tests/main.test.ts` (sezione handleFileCreate)

#### 6.1 Controlli Iniziali
- [x] Skip durante startup (isStartupComplete = false)
- [x] Skip se autoRenameOnCreate è disabilitato
- [x] Skip se non è un TFile
- [x] Skip se non è un'immagine
- [x] Skip se già in processingFiles

#### 6.2 Logica Generic Name
- [x] File con nome generico ("Pasted image...") viene rinominato
- [x] File con nome generico ("Screenshot...") viene rinominato
- [x] File con nome generico ("image1", "IMG_001") viene rinominato
- [x] File con nome NON generico viene saltato (se forceRenameNext = false)
- [x] File con nome NON generico viene rinominato (se forceRenameNext = true)

#### 6.3 Generazione Nome
- [x] Il nome viene generato dal file attivo
- [x] Il suffisso .excalidraw viene rimosso
- [x] Il suffisso .canvas viene rimosso
- [x] La sanitization viene applicata secondo le impostazioni
- [x] Il suffisso sequenziale viene aggiunto (modalità sequential)
- [x] Il timestamp viene aggiunto (modalità timestamp)

#### 6.4 Gestione Errori
- [x] Errore "file already exists" mostra Notice user-friendly
- [x] Altri errori mostrano Notice generica
- [x] processingFiles viene pulito anche in caso di errore

### Fase 7: Test Context Menu

**File:** `tests/main.test.ts` (sezione handleEditorMenu)

#### 7.1 Menu su Immagine (via pendingImageFile)
- [x] "Rename image" appare nel menu se pendingImageFile è settato
- [x] Click su "Rename image" apre RenameImageModal

#### 7.2 Menu su Wikilink
- [x] "Rename image" appare se cursore su wikilink immagine
- [x] "Rename image" NON appare se cursore su wikilink non-immagine
- [x] "Rename image" NON appare se cursore fuori da wikilink

### Fase 8: Test Settings

**File:** `tests/main.test.ts` (sezione settings)

- [x] `loadSettings()` carica le impostazioni salvate
- [x] `loadSettings()` usa DEFAULT_SETTINGS se non ci sono dati salvati
- [x] `saveSettings()` salva le impostazioni
- [x] `saveSettings()` aggiorna tutti i servizi

### Fase 9: Test Integrazione E2E-like

**File:** `tests/integration/rename-flow.test.ts`

#### 9.1 Flusso Paste Completo
- [x] Utente incolla immagine → file salvato con nome corretto → link inserito

#### 9.2 Flusso Drop su Nota
- [x] Utente trascina immagine su nota → file salvato → link inserito

#### 9.3 Flusso Drop su Excalidraw
- [x] Utente trascina immagine su Excalidraw → file creato → rinominato automaticamente

#### 9.4 Flusso Bulk Rename
- [x] Utente apre modal → seleziona immagini → rename eseguito → link aggiornati

---

## Priorità di Implementazione

1. **Alta** - Fase 1 (Mock) + Fase 6 (handleFileCreate) - Core della nuova funzionalità
2. **Alta** - Fase 5 (handleGlobalDrop) - Excalidraw support
3. **Media** - Fase 3 (handlePaste) + Fase 4 (handleDrop) - Funzionalità esistenti
4. **Media** - Fase 2 (Lifecycle) + Fase 8 (Settings)
5. **Bassa** - Fase 7 (Context Menu) + Fase 9 (Integration)

---

## Metriche Target - SUPERATE ✅✅

| Metrica | Prima | Target | Risultato |
|---------|-------|--------|-----------|
| Test totali | 120 | 200+ | **235** ✅ |
| Coverage main.ts | 0% | 80%+ | **100%** ✅ |
| Coverage services | ~90% | 95%+ | **96.51%** ✅ |
| Coverage utils | ~95% | 95%+ | **100%** ✅ |
| Coverage types | - | - | **100%** ✅ |

### Note sulla Coverage
- UI files (modals, settings-tab) hanno 0% coverage - sono difficili da testare senza DOM reale
- La logica applicativa critica è completamente coperta dai test
- Alcuni branch non coperti sono casi "unreachable" (es. default in switch con TypeScript)

---

## Note Tecniche

### Simulazione Eventi
Per testare gli handler, dobbiamo:
1. Creare mock event objects (ClipboardEvent, DragEvent)
2. Simulare il trigger degli eventi tramite i mock
3. Verificare le chiamate ai servizi e le Notice

### Test Asincroni
Molti handler sono async. Usare:
- `await` per aspettare il completamento
- `vi.useFakeTimers()` per controllare setTimeout
- `vi.advanceTimersByTime()` per simulare il passaggio del tempo

### Isolamento Test
Ogni test deve:
- Resettare tutti i mock con `vi.clearAllMocks()`
- Resettare lo stato del plugin (processingFiles, flags)
- Usare `beforeEach` per setup pulito

---

## Strategie per Test E2E / UI

### Stato Attuale: Unit/Component Testing (Raccomandato)
Attualmente usiamo Vitest + JSDOM + mock dell'API Obsidian. Questo approccio:
- ✅ **Pro**: Velocissimo (~1s per 235 test), stabile, facile CI/CD
- ✅ **Pro**: Coverage 100% della logica applicativa
- ⚠️ **Limite**: Non testa l'integrazione reale con l'UI di Obsidian

### Opzioni per Test E2E (Futuro)

#### Opzione A: WebdriverIO + wdio-obsidian-service
Il pacchetto `wdio-obsidian-service` è progettato specificamente per testare plugin Obsidian:
- Scarica automaticamente Obsidian
- Crea un vault temporaneo
- Installa il plugin e lancia i test
- **Repo**: github.com/jesse-r-s-hines/wdio-obsidian-service

#### Opzione B: Playwright con Electron
Playwright supporta l'automazione di app Electron:
- Richiede setup manuale del percorso dell'eseguibile Obsidian
- Setup laborioso ma controllo totale
- **Docs**: playwright.dev/docs/api/class-electron

### Valutazione ROI

| Strategia | Velocità | Stabilità | Copertura | Effort Setup |
|-----------|----------|-----------|-----------|--------------|
| Unit (attuale) | ⚡⚡⚡ | ⚡⚡⚡ | Logica | ✅ Fatto |
| E2E WebdriverIO | ⚡ | ⚡⚡ | UI+Logica | Medio |
| E2E Playwright | ⚡ | ⚡ | UI+Logica | Alto |

### Raccomandazione
**Per questo plugin, i test Unit/Component attuali sono sufficienti** perché:
1. La logica applicativa è completamente coperta (100% main.ts)
2. I componenti UI sono semplici wrapper su Modal di Obsidian
3. I test E2E richiederebbero effort sproporzionato rispetto al beneficio
4. Eventuali bug UI possono essere scoperti con test manuali durante lo sviluppo

**Se in futuro si volesse aggiungere E2E**, iniziare con `wdio-obsidian-service` per il suo setup facilitato.
