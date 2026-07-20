'use client';

import { Box, Typography } from '@neram/ui';
import { ImageUploadList } from '@neram/ui';

const MAX_IMAGES = 4;

interface ImageUploadProps {
  images: string[];
  onChange: (urls: string[]) => void;
  getAuthToken: () => Promise<string | null>;
  maxImages?: number;
}

export default function ImageUpload({
  images,
  onChange,
  getAuthToken,
  maxImages = MAX_IMAGES,
}: ImageUploadProps) {
  // Same endpoint/bucket/auth as before: POST /api/questions/upload with a
  // Firebase idToken bearer, multipart 'file', response { url }.
  const upload = async (file: File): Promise<{ url: string }> => {
    const token = await getAuthToken();
    if (!token) throw new Error('Please sign in to upload images');

    const formData = new FormData();
    formData.append('file', file);

    const res = await fetch('/api/questions/upload', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Upload failed');
    }

    const data = await res.json();
    return { url: data.url };
  };

  return (
    <Box>
      <Typography variant="body2" fontWeight={600} sx={{ mb: 0.5 }}>
        Images (optional)
      </Typography>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
        Add diagrams or drawings. Max {maxImages} images, 5MB each.
      </Typography>

      <ImageUploadList
        values={images}
        onChange={onChange}
        upload={upload}
        maxFiles={maxImages}
        maxSizeMB={5}
        accept="image/*"
        helperText="Paste, drop, or choose"
      />
    </Box>
  );
}
