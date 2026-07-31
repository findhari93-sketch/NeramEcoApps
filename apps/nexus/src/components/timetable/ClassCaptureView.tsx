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
import { useEffect, useState } from 'react';
import { Box, Button, Chip, CircularProgress, Typography } from '@neram/ui';
import { sortClassImages, type ClassImageRef } from '@/lib/class-cover';
import ClassImagesViewer from './ClassImagesViewer';

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
  const [loading, setLoading] = useState(true);
  const [notes, setNotes] = useState('');
  const [notesOpen, setNotesOpen] = useState(false);
  const [bullets, setBullets] = useState<string[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [images, setImages] = useState<Img[]>([]);
  const [zoomIndex, setZoomIndex] = useState<number | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      try {
        const token = await getToken();
        const [w, i] = await Promise.all([
          fetch(`/api/timetable/${classId}/wrap-up`, { headers: { Authorization: `Bearer ${token}` } }),
          fetch(`/api/timetable/${classId}/images`, { headers: { Authorization: `Bearer ${token}` } }),
        ]);
        if (active && w.ok) {
          const d = await w.json();
          setNotes(typeof d.class?.notes === 'string' ? d.class.notes.trim() : '');
          setBullets(Array.isArray(d.class?.summary_bullets) ? d.class.summary_bullets : []);
          setTags(d.tags || []);
        }
        if (active && i.ok) {
          const d = await i.json();
          setImages(sortClassImages(d.images || []));
        }
      } catch {
        /* leave empty */
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [classId, getToken]);

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
