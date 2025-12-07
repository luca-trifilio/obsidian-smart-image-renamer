# Delete Image with Link

**Branch:** `feat/delete-image-with-link`
**PR:** #36
**Status:** ✅ Ready for review

## Summary

Add ability to delete image files when removing their links from notes.

**Two triggers:**
1. ✅ Context menu "Delete image" on images (rendered + wikilinks)
2. 🔧 Auto-prompt when user deletes an image link (Backspace/Delete)

## Settings

New setting `deletePromptBehavior`:
- `always` — Always prompt when deleting image link
- `orphan-only` — Prompt only if image not linked elsewhere (default)
- `never` — Disable auto-prompt, context menu only

## Behavior

### Context Menu

Add "Delete image" item to existing context menu (after "Rename image").

**Multi-link warning:** If image linked in >1 notes, show confirmation modal listing affected notes before deletion.

**Deletion method:** `app.fileManager.trashFile(file)` — respects Obsidian's "Deleted files" setting.

### Auto-prompt on Link Delete

**Technical approach:** `editor-change` event with link tracking.

1. Cache image links per note: `Map<notePath, Set<imagePath>>`
2. On editor change, compare current links vs cache
3. If link removed and setting allows, show prompt
4. Debounce 300ms to avoid spam during fast typing

**Prompt:** Lightweight modal "Delete {filename}?" with Yes/No.

## File Changes

### New Files
- `src/services/link-tracker-service.ts` — Link cache + removal detection
- `src/ui/delete-image-modal.ts` — Confirmation modal with backlinks list
- `tests/types/settings.test.ts` — Tests for new setting
- `tests/services/link-tracker-service.test.ts` — Tests for link tracker

### Modified Files
- `main.ts` — Context menu items + editor-change handler + link cache init
- `src/types/settings.ts` — Add `deletePromptBehavior` setting
- `src/ui/settings-tab.ts` — Dropdown for new setting
- `src/services/index.ts` — Export LinkTrackerService
- `src/ui/index.ts` — Export DeleteImageModal
- `src/i18n/locales/en.json` — New translation keys
- `src/i18n/locales/it.json` — New translation keys
- `tests/__mocks__/obsidian.ts` — Add debounce mock

## i18n Keys

```
menu.deleteImage: Delete image
deleteImage.title: Delete image
deleteImage.confirm: Delete this image?
deleteImage.linkedIn: This image is linked in {count} notes:
deleteImage.orphanPrompt: Image no longer linked. Delete file?
settings.deletePrompt.name: Auto-delete prompt
settings.deletePrompt.desc: When to prompt for deleting image files after removing links
settings.deletePrompt.always: Always ask
settings.deletePrompt.orphanOnly: Only if orphaned
settings.deletePrompt.never: Never
```

## Implementation Progress

### ✅ Completed
- `deletePromptBehavior` setting in `src/types/settings.ts`
- `LinkTrackerService` in `src/services/link-tracker-service.ts`
- `DeleteImageModal` in `src/ui/delete-image-modal.ts`
- Context menu "Delete image" (rendered images + wikilinks)
- Settings dropdown in `src/ui/settings-tab.ts`
- i18n keys (EN + IT)
- Unit tests for settings and link tracker
- Supporto wikilinks `![[image.png]]` + markdown `![](image.png)`
- URL-decode per path con spazi (`%20`)
- Auto-prompt on link delete
- Cache initialization on plugin startup (3s delay)
- Rimosso auto-dismiss (modale resta finché l'utente sceglie)

## Testing

### Unit Tests
- ✅ `tests/types/settings.test.ts` — deletePromptBehavior setting
- ✅ `tests/services/link-tracker-service.test.ts` — link extraction e detection
  - Wikilinks e markdown syntax
  - URL-decode
  - Cache update/clear

### Manual Testing
- [x] Context menu → Delete image → funziona
- [x] Delete link in editor → prompt appare
- [x] Setting "always" → prompt sempre
- [ ] Setting "orphan-only" → prompt solo se orfana
- [ ] Setting "never" → nessun prompt

## Open Questions

Nessuna.
