'use client';

/**
 * Read-only view of what a class turned out to be: the teacher's full note, the
 * point-by-point record, the tags, and the images from the class. Shown to
 * students (and anyone) on a completed class, so "what we did today" lives in the
 * app next to the class instead of only in the Teams chat.
 *
 * The note comes first and the bullets after: someone catching up three weeks
 * later wants the prose account, and the points are the summary of it. Until now
 * the note was written on every wrapped-up class and rendered on none of them,
 * which made the longest and most useful thing a teacher writes invisible to
 * exactly the student it was written for.
 *
 * Both endpoints it reads are open to enrolled students: the wrap-up GET returns
 * the class fields and tags to any enrolled user, and the images GET returns the
 * gallery to enrolled users.
 */
import { useState } from 'react';
import { Box, Button, Chip, CircularProgress, Typography } from '@neram/ui';
import { sortClassImages, type ClassImageRef } from '@/lib/class-cover';
import ClassImagesViewer from './ClassImagesViewer';
import { useNexusSWR } from '@/lib/nexus-swr';

interface Props {
  classId: string;
  getToken: () => Promise<string | null>;
}

type Img = ClassImageRef;

interface Tag {
  id: string;
  label: string;
  group_type: string;
}

/**
 * Longer than this and the note is clamped behind a toggle. Roughly six lines on
 * a 375px screen, enough to tell whether it is worth opening without burying the
 * bullets and images under a wall of text.
 */
const CLAMP_OVER_CHARS = 320;

export default function ClassCaptureView({ classId, getToken }: Props) {
  const [notesOpen, setNotesOpen] = useState(false);
  const [zoomIndex, setZoomIndex] = useState<number | null>(null);

  // The exact two URLs WrapUpSection asks for, one component up the tree. That
  // used to be four requests for two resources on every open of this tab; SWR
  // dedupes them into two, and into zero on a revisit inside the cache window.
  const { data: wrapUp, isLoading: wrapUpLoading } = useNexusSWR<{
    class?: { notes?: unknown; summary_bullets?: unknown };
    tags?: Tag[];
  }>(classId ? `/api/timetable/${classId}/wrap-up` : null, getToken);

  const { data: imageData, isLoading: imagesLoading } = useNexusSWR<{ images?: Img[] }>(
    classId ? `/api/timetable/${classId}/images` : null,
    getToken,
  );

  const loading = wrapUpLoading || imagesLoading;
  const notes = typeof wrapUp?.class?.notes === 'string' ? wrapUp.class.notes.trim() : '';
  const bullets = Array.isArray(wrapUp?.class?.summary_bullets)
    ? (wrapUp?.class?.summary_bullets as string[])
    : [];
  const tags = wrapUp?.tags ?? [];
  const images = sortClassImages(imageData?.images ?? []);

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 1 }}>
        <CircularProgress size={18} />
      </Box>
    );
  }

  if (!notes && bullets.length === 0 && tags.length === 0 && images.length === 0) return null;

  const clamped = notes.length > CLAMP_OVER_CHARS && !notesOpen;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      {notes && (
        <Box data-testid="class-wrapup-notes">
          <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
            The full note
          </Typography>
          <Typography
            variant="body1"
            sx={{
              mt: 0.5,
              // Long-form reading, not metadata: 16px, generous line height, and
              // any pasted URL wraps instead of widening the drawer at 375px.
              lineHeight: 1.6,
              whiteSpace: 'pre-line',
              overflowWrap: 'anywhere',
              ...(clamped
                ? {
                    display: '-webkit-box',
                    WebkitLineClamp: 6,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                  }
                : {}),
            }}
          >
            {notes}
          </Typography>
          {notes.length > CLAMP_OVER_CHARS && (
            <Button
              size="small"
              onClick={() => setNotesOpen((v) => !v)}
              sx={{ textTransform: 'none', minHeight: 44, px: 0 }}
            >
              {notesOpen ? 'Show less' : 'Read the full note'}
            </Button>
          )}
        </Box>
      )}

      {bullets.length > 0 && (
        <Box data-testid="class-wrapup-bullets">
          <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
            What we did
          </Typography>
          <Box component="ul" sx={{ m: 0, mt: 0.5, pl: 2.5 }}>
            {bullets.map((b, i) => (
              <Typography key={i} component="li" variant="body2" sx={{ mb: 0.25 }}>
                {b}
              </Typography>
            ))}
          </Box>
        </Box>
      )}

      {tags.length > 0 && (
        <Box data-testid="class-wrapup-tags" sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
          {tags.map((t) => (
            <Chip key={t.id} label={t.label} size="small" variant="outlined" />
          ))}
        </Box>
      )}

      {images.length > 0 && (
        <Box data-testid="class-wrapup-images">
          <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
            Class images
          </Typography>
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mt: 0.5 }}>
            {images.map((img, i) => (
              <Box
                key={img.id}
                component="img"
                src={img.thumb_url || img.url}
                alt={img.caption || 'Class image'}
                loading="lazy"
                onClick={() => setZoomIndex(i)}
                sx={{
                  width: 80,
                  height: 80,
                  objectFit: 'cover',
                  borderRadius: 1,
                  cursor: 'pointer',
                  border: '1px solid',
                  borderColor: 'divider',
                }}
              />
            ))}
          </Box>
        </Box>
      )}

      {zoomIndex !== null && (
        <ClassImagesViewer
          open
          onClose={() => setZoomIndex(null)}
          images={images}
          startIndex={zoomIndex}
        />
      )}
    </Box>
  );
}
