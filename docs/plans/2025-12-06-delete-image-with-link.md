# Delete Image with Link

## Summary

Add ability to delete image files when removing their links from notes.

**Two triggers:**
1. Context menu "Delete image" on images (rendered + wikilinks)
2. Auto-prompt when user deletes an image link (Backspace/Delete)

## Settings

New setting `deletePromptBehavior`:
- `always` — Always prompt when deleting image link
- `orphan-only` — Prompt only if image not linked elsewhere (default)
- `never` — Disable auto-prompt, context menu only

## Behavior

### Context Menu

Add "Delete image" item to existing context menu (after "Rename image").

**Multi-link warning:** If image linked in >1 notes, show confirmation modal listing affected notes before deletion.

**Deletion method:** `app.vault.trash(file, true)` — respects Obsidian's "Deleted files" setting (system trash / .trash / permanent).

### Auto-prompt on Link Delete

**Technical approach:** `editor-change` event with link tracking.

1. Cache image links per note: `Map<notePath, Set<imagePath>>`
2. On editor change, compare current links vs cache
3. If link removed and setting allows, show prompt
4. Debounce 300ms to avoid spam during fast typing

**Prompt:** Lightweight modal "Delete {filename}?" with Yes/No, auto-dismiss after 5s.

## File Changes

### New Files
- `src/ui/delete-image-modal.ts` — Confirmation modal with backlinks list

### Modified Files
- `main.ts` — Context menu items + editor-change handler + link cache
- `src/types/settings.ts` — Add `deletePromptBehavior` setting
- `src/ui/settings-tab.ts` — Dropdown for new setting
- `src/i18n/` — New translation keys

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

## Testing

- Unit tests for link removal detection logic
- Mock editor state changes to verify cache diff works correctly
- Test debounce behavior

## Open Questions

None — design validated.
