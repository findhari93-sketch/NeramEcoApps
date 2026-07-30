'use client';

/**
 * Read-only view of what a class turned out to be: the point-by-point record,
 * the tags, and the images from the class. Shown to students (and anyone) on a
 * completed class, so "what we did today" lives in the app next to the class
 * instead of only in the Teams chat.
 *
 * Both endpoints it reads are open to enrolled students: the wrap-up GET returns
 * the class fields and tags to any enrolled user, and the images GET returns the
 * gallery to enrolled users.
 */
import { useEffect, useState } from 'react';
import { Box, Chip, CircularProgress, Typography } from '@neram/ui';
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

export default function ClassCaptureView({ classId, getToken }: Props) {
  const [loading, setLoading] = useState(true);
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

  if (bullets.length === 0 && tags.length === 0 && images.length === 0) return null;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      {bullets.length > 0 && (
        <Box>
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
        <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
          {tags.map((t) => (
            <Chip key={t.id} label={t.label} size="small" variant="outlined" />
          ))}
        </Box>
      )}

      {images.length > 0 && (
        <Box>
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
