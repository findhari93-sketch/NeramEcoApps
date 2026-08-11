'use client';

import { useCallback, useRef } from 'react';
import { ImageUploadField } from '@neram/ui';
import type { ImageState } from '@/lib/bulk-upload-schema';

interface ImageUploadZoneProps {
  /** Current image state */
  image?: ImageState;
  /** Called when image changes (new upload, delete, replace) */
  onChange: (image: ImageState | undefined) => void;
  /** Label shown in the drop zone */
  label?: string;
  /** Height of the zone */
  height?: number | string;
  /** Auth token getter for upload API */
  getToken: () => Promise<string | null>;
  /** Listen for paste events on the whole document */
  enableGlobalPaste?: boolean;
  /** Optional subfolder in storage path (e.g. 'options') */
  subfolder?: string;
  /**
   * Click the thumbnail to open it full screen. On by default here: every image
   * in the question bank exists to be checked against a printed paper, and a
   * 72px square is not enough to tell one answer figure from another.
   */
  previewable?: boolean;
  /** Icon-only controls, for the option-image grid. */
  dense?: boolean;
}

/**
 * Question-bank image upload zone. Thin wrapper over the shared
 * {@link ImageUploadField} that keeps this component's original public prop
 * signature (ImageState in/out) so every existing caller keeps working.
 *
 * The upload closure below hits the SAME endpoint/auth as before
 * (`/api/question-bank/upload-image` with the caller's `getToken` + `subfolder`)
 * and returns `{ url, path }` for the shared widget. Clipboard paste, drag/drop
 * and click-to-choose all come from the shared field.
 */
export default function ImageUploadZone({
  image,
  onChange,
  label = 'Drop image, paste, or click to upload',
  height = 120,
  getToken,
  enableGlobalPaste = false,
  subfolder,
  previewable = true,
  dense = false,
}: ImageUploadZoneProps) {
  // Remember the storage path returned for the last uploaded URL so we can
  // reconstruct the full ImageState (callers may read `storagePath`).
  const lastUploadRef = useRef<{ url: string; path?: string } | null>(null);

  const upload = useCallback(
    async (file: File): Promise<{ url: string; path?: string }> => {
      const token = await getToken();
      if (!token) {
        throw new Error('Auth expired. Please refresh the page and try again.');
      }

      const formData = new FormData();
      formData.append('file', file);
      if (subfolder) formData.append('subfolder', subfolder);

      const res = await fetch('/api/question-bank/upload-image', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      let json: { url?: string; path?: string; error?: string };
      try {
        json = await res.json();
      } catch {
        throw new Error(`Server error (${res.status}). Try again.`);
      }

      if (!res.ok || !json.url) {
        throw new Error(json.error || `Upload failed (${res.status})`);
      }

      lastUploadRef.current = { url: json.url, path: json.path };
      return { url: json.url, path: json.path };
    },
    [getToken, subfolder],
  );

  const handleChange = useCallback(
    (url: string | null) => {
      if (!url) {
        onChange(undefined);
        return;
      }
      const path = lastUploadRef.current?.url === url ? lastUploadRef.current.path : undefined;
      onChange({ url, uploaded: true, storagePath: path });
    },
    [onChange],
  );

  return (
    <ImageUploadField
      value={image?.url ?? null}
      onChange={handleChange}
      upload={upload}
      helperText={label}
      height={typeof height === 'number' ? height : 120}
      enableGlobalPaste={enableGlobalPaste}
      previewable={previewable}
      dense={dense}
    />
  );
}
