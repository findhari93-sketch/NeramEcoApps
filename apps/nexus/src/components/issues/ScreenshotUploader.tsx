'use client';

import { useCallback } from 'react';
import { ImageUploadList } from '@neram/ui';
import { compressImage } from '@/lib/image-compress';

interface ScreenshotUploaderProps {
  screenshots: string[];
  onScreenshotsChange: (paths: string[]) => void;
  getToken: () => Promise<string | null>;
  maxCount?: number;
  disabled?: boolean;
}

// The upload endpoint returns only a storage `path`; the public URL is built
// client-side from the `issue-screenshots` bucket. We convert between the two
// so the parent keeps its path-based contract while the shared widget shows URLs.
const BUCKET_PREFIX = 'issue-screenshots/';

function pathToUrl(path: string): string {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  return `${supabaseUrl}/storage/v1/object/public/${BUCKET_PREFIX}${path}`;
}

function urlToPath(url: string): string {
  const idx = url.indexOf(BUCKET_PREFIX);
  return idx >= 0 ? url.slice(idx + BUCKET_PREFIX.length) : url;
}

export default function ScreenshotUploader({
  screenshots,
  onScreenshotsChange,
  getToken,
  maxCount = 3,
  disabled = false,
}: ScreenshotUploaderProps) {
  // Same endpoint/auth as before: compress → POST to the foundation upload
  // route → get back `{ path }`. Return the public URL for the shared widget.
  const upload = useCallback(
    async (file: File): Promise<{ url: string; path?: string }> => {
      const token = await getToken();
      if (!token) throw new Error('Not authenticated');

      const compressed = await compressImage(file);
      const formData = new FormData();
      formData.append('file', compressed, 'screenshot.jpg');

      const res = await fetch('/api/foundation/issues/upload', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Upload failed');
      }

      const { path } = await res.json();
      return { url: pathToUrl(path), path };
    },
    [getToken],
  );

  return (
    <ImageUploadList
      label="Screenshots"
      values={screenshots.map(pathToUrl)}
      onChange={(urls) => onScreenshotsChange(urls.map(urlToPath))}
      upload={upload}
      maxFiles={maxCount}
      accept="image/jpeg,image/png,image/webp"
      disabled={disabled}
    />
  );
}
