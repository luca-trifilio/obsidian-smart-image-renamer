# Image Captions Feature Plan

Issue: #38

## Overview

Add caption management to images. Support both wiki-link (`![[img|caption]]`) and markdown (`![caption](img)`) syntax. Caption visible in edit mode via CSS.

---

## Syntax Support

### Wiki-link (Obsidian native)
```markdown
![[image.png|My caption here]]
![[image.png|caption|100]]     # with size
```

### Standard Markdown
```markdown
![My caption here](image.png)
![My caption here](image.png "title")
```

**Regex patterns needed:**
```typescript
// Wiki-link: ![[file.ext|caption]] or ![[file.ext|caption|size]]
/!\[\[([^\]|]+\.(?:png|jpg|jpeg|gif|webp|bmp|svg|avif|tiff?|ico))(?:\|([^|\]]*?))?(?:\|(\d+))?\]\]/gi

// Markdown: ![alt](path) or ![alt](path "title")
/!\[([^\]]*)\]\(([^)\s]+\.(?:png|jpg|jpeg|gif|webp|bmp|svg|avif|tiff?|ico))(?:\s+"[^"]*")?\)/gi
```

---

## Implementation Phases

### Phase 1: Core Caption Service

**File:** `src/services/caption-service.ts`

```typescript
interface ImageLink {
  fullMatch: string;
  filePath: string;
  caption: string | null;
  size: string | null;
  type: 'wiki' | 'markdown';
  start: number;  // position in text
  end: number;
}

class CaptionService {
  // Parse all image links in text
  parseImageLinks(content: string): ImageLink[]

  // Find specific image link
  findImageLink(content: string, imagePath: string): ImageLink | null

  // Update caption for an image (returns new content)
  setCaption(content: string, imagePath: string, caption: string): string

  // Remove caption from image
  removeCaption(content: string, imagePath: string): string

  // Generate markdown with caption
  buildImageLink(imagePath: string, caption: string | null, size: string | null, type: 'wiki' | 'markdown'): string
}
```

**Tests:** `tests/services/caption-service.test.ts`
- Parse wiki-link without caption
- Parse wiki-link with caption
- Parse wiki-link with caption and size
- Parse markdown without caption
- Parse markdown with caption
- Set caption on image without existing caption
- Update existing caption
- Remove caption
- Handle multiple images in same file
- Handle edge cases (special chars in caption, etc.)

---

### Phase 2: Caption Modal (Single Image)

**File:** `src/ui/caption-modal.ts`

```
┌─────────────────────────────────────────┐
│ Edit caption                            │
├─────────────────────────────────────────┤
│  ┌──────────────┐                       │
│  │              │                       │
│  │   [preview]  │  screenshot.png       │
│  │              │                       │
│  └──────────────┘                       │
│                                         │
│  Caption:                               │
│  [_________________________________]    │
│                                         │
│           [Save]  [Remove]  [Cancel]    │
└─────────────────────────────────────────┘
```

**Behavior:**
- Opens from context menu on image
- Shows image preview (like issue #12)
- Input pre-filled if caption exists
- "Remove" button only shown if caption exists
- Enter = Save, Esc = Cancel

**i18n keys:**
```typescript
captionModal: {
  title: 'Edit caption',
  placeholder: 'Enter caption...',
  save: 'Save',
  remove: 'Remove',
  cancel: 'Cancel'
}
```

---

### Phase 3: Context Menu Integration

**File:** `main.ts` (extend existing)

Add to image context menu:
```typescript
menu.addItem((item) => {
  item.setTitle(t('contextMenu.editCaption'))
    .setIcon('text-cursor-input')
    .onClick(() => {
      new CaptionModal(this.app, file, sourceNote, captionService).open();
    });
});
```

**Position:** After "Rename image", before separator.

---

### Phase 4: Extend Rename Modal

**File:** `src/ui/rename-modal.ts` (modify)

Add caption field below name input:

```
│  Name:    [screenshot-2024________]     │
│  Caption: [Dashboard overview_____]     │  ← NEW
```

**Changes:**
- Add `captionEl: HTMLInputElement`
- Load existing caption on open
- Save caption along with rename
- Optional: checkbox "Keep existing caption" when renaming

---

### Phase 5: On-Paste Caption Prompt

**File:** `src/services/image-processor.ts` (modify)

**New setting:** `promptCaptionOnPaste: boolean` (default: false)

**Flow when enabled:**
1. Image pasted → renamed as usual
2. After insert, show inline popover near cursor:
   ```
   ┌────────────────────────────────┐
   │ Caption: [______________] [✓] │
   └────────────────────────────────┘
   ```
3. Enter/click = save caption, Esc = skip
4. Auto-dismiss after 5s if no interaction

**Alternative (simpler):** Open CaptionModal after paste instead of inline popover.

---

### Phase 6: Bulk Caption Modal

**File:** `src/ui/bulk-caption-modal.ts`

```
┌─────────────────────────────────────────────────────────┐
│ Bulk edit captions                                      │
├─────────────────────────────────────────────────────────┤
│ Scope: [Current note ▾]    Filter: [All ▾]              │
├─────────────────────────────────────────────────────────┤
│ ┌─────┐ screenshot-1.png                                │
│ │ img │ [Dashboard overview___________________]         │
│ └─────┘                                                 │
│ ┌─────┐ screenshot-2.png                                │
│ │ img │ [_______________________________________]       │
│ └─────┘                                                 │
│ ┌─────┐ diagram.png                      ✓ Has caption  │
│ │ img │ [System architecture______________]             │
│ └─────┘                                                 │
├─────────────────────────────────────────────────────────┤
│                              [Save all]  [Cancel]       │
└─────────────────────────────────────────────────────────┘
```

**Filters:**
- All
- Without caption
- With caption

**Scope:**
- Current note
- Vault (if no active note)

**Behavior:**
- Live preview of changes
- Only save modified captions
- Show count of changes

---

### Phase 7: Command Palette

**Commands:**
| Command | Action |
|---------|--------|
| `Smart Renamer: Edit caption` | Open CaptionModal for image under cursor |
| `Smart Renamer: Bulk edit captions` | Open BulkCaptionModal |
| `Smart Renamer: Remove all captions` | Remove captions from all images in note (with confirm) |

---

### Phase 8: CSS for Edit Mode Caption Display

**File:** `styles.css`

```css
/* Display caption below image in edit mode */
.cm-embed-image {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.cm-embed-image::after {
  content: attr(alt);
  display: block;
  font-size: 0.85em;
  color: var(--text-muted);
  text-align: center;
  margin-top: 4px;
  font-style: italic;
}

/* Hide if no caption */
.cm-embed-image:not([alt])::after,
.cm-embed-image[alt=""]::after {
  display: none;
}
```

**Note:** This may require a post-processor to inject `alt` attribute from parsed caption. Investigate Obsidian's `MarkdownPostProcessor` API.

---

## Settings

**New settings in `src/types/settings.ts`:**

```typescript
interface SmartImageRenamerSettings {
  // ... existing

  // Caption settings
  promptCaptionOnPaste: boolean;      // default: false
  defaultCaptionType: 'wiki' | 'markdown';  // default: 'wiki'
}
```

**Settings UI:**

```
┌─────────────────────────────────────────────────────────┐
│ Caption settings                          [heading]     │
├─────────────────────────────────────────────────────────┤
│ Prompt for caption on paste               [toggle: off] │
│ Show caption input after pasting image                  │
├─────────────────────────────────────────────────────────┤
│ Default caption syntax                    [dropdown]    │
│ Wiki-link or standard markdown            wiki ▾        │
└─────────────────────────────────────────────────────────┘
```

---

## File Structure (Final)

```
src/
├── services/
│   ├── caption-service.ts        # NEW: Caption CRUD
│   └── ...
├── ui/
│   ├── caption-modal.ts          # NEW: Single caption edit
│   ├── bulk-caption-modal.ts     # NEW: Bulk caption edit
│   └── ...
├── utils/
│   ├── constants.ts              # UPDATE: Add caption regex
│   └── ...
└── types/
    └── settings.ts               # UPDATE: Add caption settings
```

---

## Implementation Order

| Step | Task | Dependencies |
|------|------|--------------|
| 1 | `caption-service.ts` + tests | None |
| 2 | `caption-modal.ts` | Step 1 |
| 3 | Context menu integration | Step 2 |
| 4 | CSS caption display | None (parallel) |
| 5 | Extend `rename-modal.ts` | Step 1 |
| 6 | Settings UI | None (parallel) |
| 7 | On-paste prompt | Steps 1, 2, 6 |
| 8 | `bulk-caption-modal.ts` | Step 1 |
| 9 | Command palette | Steps 2, 8 |

**Estimated steps:** 9 PRs or 1 large PR with incremental commits.

---

## Testing Strategy

### Unit Tests
- `caption-service.test.ts` - All parsing/mutation logic
- `caption-modal.test.ts` - Modal behavior (if testable)

### Manual Testing
- [ ] Add caption via context menu
- [ ] Edit existing caption
- [ ] Remove caption
- [ ] Caption survives rename
- [ ] Bulk edit captions
- [ ] On-paste prompt (if enabled)
- [ ] Caption visible in edit mode
- [ ] Caption visible in reading mode
- [ ] Works with wiki-link syntax
- [ ] Works with markdown syntax
- [ ] Works with sized images `![[img|caption|100]]`

---

## Open Questions (Resolved)

| Question | Decision |
|----------|----------|
| Wiki-link or markdown? | Both |
| Markdown in captions? | No, plain text only (v1) |
| Auto-generate from filename? | No |
| Integrate with existing plugins? | No, standalone |
| Caption in edit mode? | Yes, via CSS |

---

## Future Enhancements (Out of Scope)

- Markdown formatting in captions (bold, links)
- Caption templates
- AI-generated captions
- Caption search/index
- Export captions to alt text for accessibility
