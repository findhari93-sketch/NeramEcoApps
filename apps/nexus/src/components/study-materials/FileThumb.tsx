'use client';

/**
 * Shared file-card primitives for the Study Materials feature (teacher + student pages).
 *
 * - FileThumb: a Microsoft Graph thumbnail cover (PDF first page / image) with a glyph fallback.
 * - FileIcon: the file-type glyph (red PDF, blue image, generic otherwise).
 * - formatSize: human-readable byte size.
 */

import { useState } from 'react';
import { Box } from '@neram/ui';
import PictureAsPdfOutlinedIcon from '@mui/icons-material/PictureAsPdfOutlined';
import ImageOutlinedIcon from '@mui/icons-material/ImageOutlined';
import InsertDriveFileOutlinedIcon from '@mui/icons-material/InsertDriveFileOutlined';

/** Standard cover box used by grid cards. */
export const coverSx = {
  width: '100%',
  height: 92,
  borderRadius: 2,
  overflow: 'hidden',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  bgcolor: 'action.hover',
  mb: 1,
} as const;

/** File-type glyph. */
export function FileIcon({ kind, size = 30 }: { kind: string; size?: number }) {
  if (kind === 'pdf') return <PictureAsPdfOutlinedIcon sx={{ fontSize: size, color: '#d32f2f' }} />;
  if (kind === 'image') return <ImageOutlinedIcon sx={{ fontSize: size, color: '#1976d2' }} />;
  return <InsertDriveFileOutlinedIcon sx={{ fontSize: size, color: 'text.secondary' }} />;
}

/**
 * File cover: a Graph thumbnail (PDF first page / image) with a glyph fallback.
 * Pass `sx` to override the default cover box (e.g. a compact square for list rows),
 * and `iconSize` to size the fallback glyph.
 */
export function FileThumb({
  kind,
  src,
  sx,
  iconSize,
}: {
  kind: string;
  src: string | null;
  sx?: object;
  iconSize?: number;
}) {
  const [failed, setFailed] = useState(false);
  const canPreview = (kind === 'pdf' || kind === 'image') && !!src && !failed;
  return (
    <Box sx={{ ...coverSx, ...(sx || {}) }}>
      {canPreview ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src!}
          alt=""
          loading="lazy"
          onError={() => setFailed(true)}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
      ) : (
        <FileIcon kind={kind} size={iconSize} />
      )}
    </Box>
  );
}

/** Human-readable byte size, e.g. "2.4 MB". */
export function formatSize(bytes: number | null | undefined): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
