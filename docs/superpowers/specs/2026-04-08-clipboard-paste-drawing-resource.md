# Clipboard Paste for Drawing Resources

**Date:** 2026-04-08
**Status:** Approved

## Context

Teachers review student drawings in Nexus and attach reference resources (videos, images) to guide improvement. Currently, adding a reference image requires saving it to disk first, then uploading via the file picker. Teachers often generate reference images using ChatGPT or similar tools and want to paste them directly without the save-to-disk step.

Students submitting drawings also currently have only a file picker, creating the same friction when they have an image in their clipboard.

This change adds clipboard paste (Ctrl+V) as an additional input method for images in both the teacher resource modal and the student submission sheet.

## New Component: ClipboardPasteZone

**Location:** `apps/nexus/src/components/drawings/ClipboardPasteZone.tsx`

### Props

```typescript
interface ClipboardPasteZoneProps {
  onFile: (file: File) => Promise<void> | void;
  isUploading: boolean;
  disabled?: boolean;        // disables listener + hides zone when true
  maxSizeMB?: number;        // default 10
}
```

### Behavior

- Mounts a `document` paste event listener on mount; removes it on unmount
- Listener is a no-op when `disabled` is true
- On paste event: iterate `clipboardData.items`, find first item where `type.startsWith('image/')`
- Convert matching item to `File` via `item.getAsFile()`
- Validate: must be image type, must be under `maxSizeMB` limit
- Call `onFile(file)` with the validated File
- Show error state if validation fails (wrong type, too large)

### Visual states (ASCII)

```
idle:
  +- - - - - - - - - - - - - - - - - -+
  | [clipboard icon] Paste image here  |
  |            (Ctrl+V)                |
  +- - - - - - - - - - - - - - - - - -+
  (dashed border, muted text)

uploading:
  +------------------------------------+
  | [spinner] Uploading...             |
  +------------------------------------+
  (solid border, primary color)

error:
  +------------------------------------+
  | [!] Only image files supported     |
  +------------------------------------+
  (red border, error text)
```

- When upload completes, the zone is replaced by the image preview (caller controls this via `isUploading` and showing preview state)
- No animation needed beyond the border color change

## Integration: Teacher Side

**File:** `apps/nexus/src/components/drawings/ResourceLinkSearch.tsx`

Image tab layout after change:

```
[ Upload Image button ]

+- - - - - - - - - - - - - - - - - - +
| [clipboard icon] Paste image here   |
|              (Ctrl+V)               |
+- - - - - - - - - - - - - - - - - - +

Or paste an image URL
[ https://example.com/image.jpg ] [Add]
```

- `ClipboardPasteZone` is only mounted (and listener active) when the Image tab is selected
- `onFile` callback: reuses existing file upload logic in ResourceLinkSearch
  - POST to `/api/drawing/upload` with `bucket: drawing-references`
  - On success: adds resulting URL to resources list as `{ type: 'image', url, title: 'Reference Image' }`
- `isUploading` wired to existing upload loading state
- `maxSizeMB={10}` (matches existing file upload limit)

## Integration: Student Side

**File:** `apps/nexus/src/components/drawings/DrawingSubmissionSheet.tsx`

Upload section layout after change:

```
[ Upload Photo button ]

+- - - - - - - - - - - - - - - - - - +
| [clipboard icon] Paste image here   |
|              (Ctrl+V)               |
+- - - - - - - - - - - - - - - - - - +
```

- `onFile` callback: calls same logic as `handleFileSelect`
  - Sets `file` state with the pasted File
  - Creates object URL for preview via `URL.createObjectURL(file)`
  - Clears any existing error
- `isUploading` wired to existing `uploading` state
- `maxSizeMB={10}` (matches existing limit)
- Paste zone is visible whenever the submission sheet is open

## What Is Not Changing

- Upload API routes (`/api/drawing/upload`) - unchanged
- Resource data model (`TutorResource`, `DrawingSubmission`) - unchanged
- Existing file picker buttons - remain as-is, paste is additive
- AI evaluation panel - separate concern, not in scope here

## Verification

1. **Teacher paste flow:**
   - Open a drawing review in Nexus
   - Click Add on Resources, open Image tab
   - Copy an image to clipboard (screenshot, ChatGPT output, etc.)
   - Press Ctrl+V
   - Verify: image uploads, appears as a resource chip in the review panel

2. **Student paste flow:**
   - Open a drawing question as a student
   - Copy a drawing image to clipboard
   - Open the submission sheet
   - Press Ctrl+V
   - Verify: image preview appears, submit completes successfully

3. **Validation:**
   - Paste a non-image (e.g., text) - verify error state shows
   - Paste an image over 10MB - verify error state shows
   - Switch to Library or YouTube tab (teacher) - verify paste no longer triggers upload

4. **No regressions:**
   - File picker upload still works on both sides
   - URL paste input still works on teacher side
