'use client';

/**
 * The class images block in the wrap-up editor: attach pictures, remove them, and
 * star the one that stands for the class.
 *
 * Why this is not the shared @neram/ui ImageUploadList: that component is keyed on
 * URL strings (`values: string[]`), and the cover is keyed on row id. Threading a
 * `coverUrl` through it would need a lossy url-to-row lookup, which stars two rows
 * whenever two images share a url, and its url-diffing remove has the same flaw
 * (it sends no DELETE at all for a duplicate). Working in ids removes that whole
 * class of bug.
 *
 * The add tile is still the shared ImageUploadField, so click, drop, clipboard
 * paste, camera and the size checks all keep coming from one place.
 */

import { useState } from 'react';
import { Box, IconButton, Tooltip, Typography, useTheme } from '@neram/ui';
import { ImageUploadField } from '@neram/ui';
import CloseIcon from '@mui/icons-material/Close';
import StarIcon from '@mui/icons-material/Star';
import StarOutlineIcon from '@mui/icons-material/StarOutline';

export interface ClassImage {
  id: string;
  url: string;
  thumb_url?: string | null;
  caption: string | null;
  sort_order: number;
  source: string;
}

interface ClassImagesEditorProps {
  images: ClassImage[];
  coverImageId: string | null;
  /** Uploads one file and returns the created row, or null on failure. */
  upload: (file: File) => Promise<{ url: string; path?: string }>;
  onRemove: (image: ClassImage) => void;
  onSetCover: (imageId: string | null) => void;
  maxFiles?: number;
  disabled?: boolean;
}

const THUMB_PX = 88;

export default function ClassImagesEditor({
  images,
  coverImageId,
  upload,
  onRemove,
  onSetCover,
  maxFiles = 8,
  disabled = false,
}: ClassImagesEditorProps) {
  const theme = useTheme();
  const [busyId, setBusyId] = useState<string | null>(null);

  const canAdd = images.length < maxFiles;

  // Which tile shows a filled star. Mirrors resolveClassCover: the starred image,
  // else the first, so the teacher always sees what students will see rather than
  // an empty row of outlines.
  const effectiveCoverId = coverImageId && images.some((i) => i.id === coverImageId)
    ? coverImageId
    : images[0]?.id ?? null;

  const toggleCover = async (image: ClassImage) => {
    setBusyId(image.id);
    try {
      // Starring the tile that is already the explicit cover clears it, so a
      // teacher can go back to "just use the first one".
      onSetCover(coverImageId === image.id ? null : image.id);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
        {images.map((image, i) => {
          const isCover = image.id === effectiveCoverId;
          return (
            <Box
              key={image.id}
              sx={{
                position: 'relative',
                width: THUMB_PX,
                height: THUMB_PX,
                borderRadius: 1.5,
                overflow: 'hidden',
                border: isCover ? `2px solid ${theme.palette.primary.main}` : '1px solid',
                borderColor: isCover ? 'primary.main' : 'divider',
              }}
            >
              <Box
                component="img"
                src={image.thumb_url || image.url}
                alt={image.caption || `Class image ${i + 1}`}
                loading="lazy"
                sx={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />

              {!disabled && (
                <IconButton
                  size="small"
                  onClick={() => onRemove(image)}
                  aria-label={`Remove class image ${i + 1}`}
                  sx={{
                    position: 'absolute',
                    top: 2,
                    right: 2,
                    bgcolor: 'rgba(0,0,0,0.55)',
                    color: '#fff',
                    width: 24,
                    height: 24,
                    '&:hover': { bgcolor: 'rgba(0,0,0,0.75)' },
                  }}
                >
                  <CloseIcon sx={{ fontSize: 15 }} />
                </IconButton>
              )}

              {!disabled && (
                <Tooltip
                  title={isCover ? 'This is the cover students see first' : 'Make this the cover'}
                  arrow
                  enterTouchDelay={0}
                  leaveTouchDelay={2500}
                >
                  <IconButton
                    size="small"
                    disabled={busyId === image.id}
                    onClick={() => toggleCover(image)}
                    aria-label={isCover ? `Class image ${i + 1} is the cover` : `Make class image ${i + 1} the cover`}
                    aria-pressed={isCover}
                    sx={{
                      position: 'absolute',
                      bottom: 2,
                      left: 2,
                      // The badge stays small; the touch target does not.
                      width: 26,
                      height: 26,
                      bgcolor: 'rgba(0,0,0,0.55)',
                      color: isCover ? theme.palette.warning.light : '#fff',
                      '&:hover': { bgcolor: 'rgba(0,0,0,0.75)' },
                      '&::after': {
                        content: '""',
                        position: 'absolute',
                        top: '50%',
                        left: '50%',
                        transform: 'translate(-50%, -50%)',
                        width: 44,
                        height: 44,
                      },
                    }}
                  >
                    {isCover ? <StarIcon sx={{ fontSize: 16 }} /> : <StarOutlineIcon sx={{ fontSize: 16 }} />}
                  </IconButton>
                </Tooltip>
              )}
            </Box>
          );
        })}

        {canAdd && !disabled && (
          <Box sx={{ width: 200, maxWidth: '100%' }}>
            <ImageUploadField
              value={null}
              onChange={() => {
                /* the uploader appends the created row itself */
              }}
              upload={upload}
              helperText="Paste (Ctrl+V), drop, or choose"
              height={THUMB_PX}
              enableGlobalPaste
            />
          </Box>
        )}
      </Box>

      <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
        {images.length}/{maxFiles}
        {images.length > 1 ? '. Tap a star to pick the cover students see first.' : ''}
      </Typography>
    </Box>
  );
}
