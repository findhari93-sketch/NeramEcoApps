# Clipboard Paste for Drawing Resources - Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow teachers and students to paste images directly from clipboard (Ctrl+V) instead of saving to disk first, in both the teacher resource modal and the student drawing submission sheet.

**Architecture:** A single new `ClipboardPasteZone` component mounts a document-level paste listener when active and calls an `onFile(file)` callback with the extracted image. It is dropped into two existing components: `ResourceLinkSearch` (teacher Image tab) and `DrawingSubmissionSheet` (student submission), both of which already have upload logic that the callback can reuse directly.

**Tech Stack:** React 18, MUI v5, TypeScript, Vitest + React Testing Library

---

## File Map

| Action | File |
|--------|------|
| Create | `apps/nexus/src/components/drawings/ClipboardPasteZone.tsx` |
| Create | `apps/nexus/src/components/drawings/ClipboardPasteZone.test.tsx` |
| Modify | `apps/nexus/src/components/drawings/ResourceLinkSearch.tsx` |
| Modify | `apps/nexus/src/components/drawings/DrawingSubmissionSheet.tsx` |

---

## Task 1: ClipboardPasteZone component

**Files:**
- Create: `apps/nexus/src/components/drawings/ClipboardPasteZone.tsx`
- Create: `apps/nexus/src/components/drawings/ClipboardPasteZone.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `apps/nexus/src/components/drawings/ClipboardPasteZone.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import ClipboardPasteZone from './ClipboardPasteZone';

function dispatchPaste(type: string, sizebytes = 1024) {
  const blob = new Blob(['x'.repeat(sizebytes)], { type });
  const file = new File([blob], 'image.png', { type });
  const item = { type, getAsFile: () => file } as unknown as DataTransferItem;
  const event = new Event('paste') as ClipboardEvent;
  Object.defineProperty(event, 'clipboardData', {
    value: { items: [item] },
  });
  document.dispatchEvent(event);
  return file;
}

describe('ClipboardPasteZone', () => {
  it('renders the paste hint text', () => {
    render(<ClipboardPasteZone onFile={vi.fn()} isUploading={false} />);
    expect(screen.getByText(/paste image here/i)).toBeDefined();
  });

  it('calls onFile when an image is pasted', () => {
    const onFile = vi.fn();
    render(<ClipboardPasteZone onFile={onFile} isUploading={false} />);
    const file = dispatchPaste('image/png');
    expect(onFile).toHaveBeenCalledWith(file);
  });

  it('does not call onFile when a non-image is pasted', () => {
    const onFile = vi.fn();
    render(<ClipboardPasteZone onFile={onFile} isUploading={false} />);
    dispatchPaste('text/plain');
    expect(onFile).not.toHaveBeenCalled();
  });

  it('shows error and does not call onFile when pasted image exceeds maxSizeMB', () => {
    const onFile = vi.fn();
    render(
      <ClipboardPasteZone onFile={onFile} isUploading={false} maxSizeMB={0.000001} />
    );
    dispatchPaste('image/png', 2000);
    expect(onFile).not.toHaveBeenCalled();
    expect(screen.getByText(/under/i)).toBeDefined();
  });

  it('shows uploading state when isUploading is true', () => {
    render(<ClipboardPasteZone onFile={vi.fn()} isUploading={true} />);
    expect(screen.getByText(/uploading/i)).toBeDefined();
  });

  it('renders nothing when disabled', () => {
    const { container } = render(
      <ClipboardPasteZone onFile={vi.fn()} isUploading={false} disabled />
    );
    expect(container.firstChild).toBeNull();
  });

  it('does not call onFile after unmount', () => {
    const onFile = vi.fn();
    const { unmount } = render(<ClipboardPasteZone onFile={onFile} isUploading={false} />);
    unmount();
    dispatchPaste('image/png');
    expect(onFile).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd apps/nexus && pnpm test ClipboardPasteZone --run
```

Expected: all tests fail with "Cannot find module './ClipboardPasteZone'"

- [ ] **Step 3: Implement ClipboardPasteZone**

Create `apps/nexus/src/components/drawings/ClipboardPasteZone.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import { Box, Typography, CircularProgress } from '@neram/ui';
import ContentPasteIcon from '@mui/icons-material/ContentPaste';

interface ClipboardPasteZoneProps {
  onFile: (file: File) => Promise<void> | void;
  isUploading: boolean;
  disabled?: boolean;
  maxSizeMB?: number;
}

export default function ClipboardPasteZone({
  onFile,
  isUploading,
  disabled = false,
  maxSizeMB = 10,
}: ClipboardPasteZoneProps) {
  const [error, setError] = useState('');

  useEffect(() => {
    if (disabled) return;

    const handlePaste = (e: ClipboardEvent) => {
      const items = Array.from(e.clipboardData?.items ?? []);
      const imageItem = items.find((item) => item.type.startsWith('image/'));
      if (!imageItem) return;

      const file = imageItem.getAsFile();
      if (!file) return;

      if (file.size > maxSizeMB * 1024 * 1024) {
        setError(`Image must be under ${maxSizeMB}MB`);
        return;
      }

      setError('');
      onFile(file);
    };

    document.addEventListener('paste', handlePaste);
    return () => document.removeEventListener('paste', handlePaste);
  }, [disabled, maxSizeMB, onFile]);

  if (disabled) return null;

  return (
    <Box
      sx={{
        border: '1.5px dashed',
        borderColor: error ? 'error.main' : 'divider',
        borderRadius: 1,
        py: 1.5,
        px: 2,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 1,
        color: error ? 'error.main' : 'text.secondary',
        bgcolor: error ? 'error.50' : 'transparent',
      }}
    >
      {isUploading ? (
        <>
          <CircularProgress size={16} />
          <Typography variant="caption">Uploading...</Typography>
        </>
      ) : (
        <>
          <ContentPasteIcon sx={{ fontSize: 16 }} />
          <Typography variant="caption">
            {error || 'Paste image here (Ctrl+V)'}
          </Typography>
        </>
      )}
    </Box>
  );
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd apps/nexus && pnpm test ClipboardPasteZone --run
```

Expected: 7 tests pass

- [ ] **Step 5: Commit**

```bash
git add apps/nexus/src/components/drawings/ClipboardPasteZone.tsx apps/nexus/src/components/drawings/ClipboardPasteZone.test.tsx
git commit -m "feat(nexus): add ClipboardPasteZone component for image paste support"
```

---

## Task 2: Integrate into ResourceLinkSearch (teacher side)

**Files:**
- Modify: `apps/nexus/src/components/drawings/ResourceLinkSearch.tsx`

- [ ] **Step 1: Add import**

In `ResourceLinkSearch.tsx`, add to the existing imports after line 17:

```tsx
import ClipboardPasteZone from './ClipboardPasteZone';
```

- [ ] **Step 2: Replace the Image tab upload section**

Find the Image tab block (currently lines 344-411). Replace the `<Box sx={{ display: 'flex', gap: 1.5, mb: 2 }}>` upload button section (lines 367-378) with the button plus the paste zone:

```tsx
{/* === Image Tab === */}
{tab === 2 && (
  <Box>
    <input
      ref={fileRef}
      type="file"
      accept="image/*"
      style={{ display: 'none' }}
      onChange={(e) => {
        const file = e.target.files?.[0];
        if (file) handleImageUpload(file);
      }}
    />

    <TextField
      placeholder="Title for the reference image (optional)"
      size="small"
      fullWidth
      value={imageTitle}
      onChange={(e) => setImageTitle(e.target.value)}
      sx={{ mb: 2 }}
    />

    <Box sx={{ display: 'flex', gap: 1.5, mb: 1.5 }}>
      <Button
        variant="outlined"
        startIcon={<CloudUploadOutlinedIcon />}
        onClick={() => fileRef.current?.click()}
        disabled={uploading}
        sx={{ flex: 1, textTransform: 'none', minHeight: 48 }}
      >
        {uploading ? 'Uploading...' : 'Upload Image'}
      </Button>
    </Box>

    <ClipboardPasteZone
      onFile={handleImageUpload}
      isUploading={uploading}
      maxSizeMB={10}
    />

    {uploading && <LinearProgress sx={{ mt: 1.5, mb: 1 }} />}

    {/* Or paste URL */}
    <Box sx={{ pt: 2, mt: 1.5, borderTop: '1px solid', borderColor: 'divider' }}>
      <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
        Or paste an image URL
      </Typography>
      <Box sx={{ display: 'flex', gap: 1 }}>
        <TextField
          placeholder="https://example.com/image.jpg"
          size="small"
          fullWidth
          value={imageUrl}
          onChange={(e) => setImageUrl(e.target.value)}
          InputProps={{
            startAdornment: <InputAdornment position="start"><LinkIcon sx={{ fontSize: 18 }} /></InputAdornment>,
          }}
        />
        <Button
          variant="outlined" size="small"
          onClick={addImageUrl}
          disabled={!imageUrl.trim()}
          sx={{ textTransform: 'none', minWidth: 60 }}
        >
          Add
        </Button>
      </Box>
      {imageUrl && (
        <Box component="img" src={imageUrl} alt="Preview" sx={{ mt: 1, maxHeight: 150, borderRadius: 1, objectFit: 'contain' }} />
      )}
    </Box>
  </Box>
)}
```

Note: `ClipboardPasteZone` has no `disabled` prop here — it always listens while this tab is mounted, and React unmounts the tab content when `tab !== 2`, so the listener automatically cleans up via `useEffect` return.

- [ ] **Step 3: Verify it renders without TypeScript errors**

```bash
cd apps/nexus && pnpm type-check 2>&1 | grep -i "ResourceLinkSearch\|ClipboardPasteZone"
```

Expected: no output (no errors for these files)

- [ ] **Step 4: Commit**

```bash
git add apps/nexus/src/components/drawings/ResourceLinkSearch.tsx
git commit -m "feat(nexus): add clipboard paste to teacher resource image tab"
```

---

## Task 3: Integrate into DrawingSubmissionSheet (student side)

**Files:**
- Modify: `apps/nexus/src/components/drawings/DrawingSubmissionSheet.tsx`

- [ ] **Step 1: Add import and extract handleFile helper**

In `DrawingSubmissionSheet.tsx`, add import after line 9:

```tsx
import ClipboardPasteZone from './ClipboardPasteZone';
```

Then replace the existing `handleFileSelect` function (lines 32-46) with:

```tsx
const handleFile = (f: File) => {
  if (!f.type.startsWith('image/')) {
    setError('Please select an image file');
    return;
  }
  if (f.size > 10 * 1024 * 1024) {
    setError('Image must be under 10MB');
    return;
  }
  setFile(f);
  setPreview(URL.createObjectURL(f));
  setError('');
};

const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
  const selected = e.target.files?.[0];
  if (selected) handleFile(selected);
};
```

- [ ] **Step 2: Add ClipboardPasteZone to the upload section**

Find the `!preview` branch (lines 120-138). Replace it with:

```tsx
{!preview ? (
  <Box sx={{ mb: 2 }}>
    <Box sx={{ display: 'flex', gap: 1.5, mb: 1.5 }}>
      <Button
        variant="outlined"
        startIcon={<CameraAltOutlinedIcon />}
        onClick={() => { if (fileRef.current) { fileRef.current.capture = 'environment'; fileRef.current.click(); } }}
        sx={{ flex: 1, minHeight: 48, textTransform: 'none' }}
      >
        Camera
      </Button>
      <Button
        variant="outlined"
        startIcon={<PhotoLibraryOutlinedIcon />}
        onClick={() => { if (fileRef.current) { fileRef.current.removeAttribute('capture'); fileRef.current.click(); } }}
        sx={{ flex: 1, minHeight: 48, textTransform: 'none' }}
      >
        Gallery
      </Button>
    </Box>
    <ClipboardPasteZone
      onFile={handleFile}
      isUploading={uploading}
      maxSizeMB={10}
    />
  </Box>
) : (
```

Note: `ClipboardPasteZone` is only rendered when `!preview`, so once the student selects or pastes an image (and preview is set), the listener is unmounted and no longer active.

- [ ] **Step 3: Verify no TypeScript errors**

```bash
cd apps/nexus && pnpm type-check 2>&1 | grep -i "DrawingSubmissionSheet\|ClipboardPasteZone"
```

Expected: no output (no errors for these files)

- [ ] **Step 4: Commit**

```bash
git add apps/nexus/src/components/drawings/DrawingSubmissionSheet.tsx
git commit -m "feat(nexus): add clipboard paste to student drawing submission sheet"
```

---

## Task 4: Full verification

- [ ] **Step 1: Run all unit tests**

```bash
cd apps/nexus && pnpm test --run
```

Expected: all tests pass, no failures

- [ ] **Step 2: Type-check the full app**

```bash
cd apps/nexus && pnpm type-check
```

Expected: exit 0, no errors

- [ ] **Step 3: Manual smoke test — teacher side**

1. Run `pnpm dev:nexus` and open a drawing review at `/teacher/drawing-reviews/[any-id]`
2. Click the `+ Add` button next to RESOURCES
3. Click the Image tab
4. Copy any image to clipboard (screenshot, right-click > copy image)
5. Press Ctrl+V

Expected: the paste zone briefly shows "Uploading...", then the image appears as a chip in the resources list

- [ ] **Step 4: Manual smoke test — student side**

1. Open a drawing question as a student at `/student/drawings/[questionId]`
2. Tap the submit button to open the bottom drawer
3. Copy an image to clipboard
4. Press Ctrl+V

Expected: the image preview appears in the sheet, the Submit Drawing button becomes active

- [ ] **Step 5: Smoke test — tab isolation (teacher)**

1. In the Add Resource dialog, go to Library tab
2. Copy an image to clipboard and press Ctrl+V
3. Verify: nothing happens (paste zone component is unmounted)
4. Switch to YouTube tab, repeat
5. Verify: nothing happens

- [ ] **Step 6: Smoke test — non-image paste**

1. Open the Image tab
2. Copy some text and press Ctrl+V
3. Verify: nothing happens (no upload triggered, no error shown)

- [ ] **Step 7: Final commit if not already done**

All changes should already be committed per task steps. Verify:

```bash
git status
```

Expected: working tree clean
