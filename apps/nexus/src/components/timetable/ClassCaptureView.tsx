'use client';

/**
 * Read-only view of what a class turned out to be: the point-by-point record,
 * the tags, and the drawings done in class. Shown to students (and anyone) on a
 * completed class, so "what we drew today" lives in the app next to the class
 * instead of only in the Teams chat.
 *
 * Both endpoints it reads are open to enrolled students: the wrap-up GET returns
 * the class fields and tags to any enrolled user, and the images GET returns the
 * gallery to enrolled users.
 */
import { useEffect, useState } from 'react';
import { Box, Chip, CircularProgress, Dialog, IconButton, Typography } from '@neram/ui';
import CloseIcon from '@mui/icons-material/Close';

interface Props {
  classId: string;
  getToken: () => Promise<string | null>;
}

interface Img {
  id: string;
  url: string;
  caption: string | null;
}

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
  const [zoom, setZoom] = useState<string | null>(null);

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
          setImages(d.images || []);
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
            Class drawings
          </Typography>
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mt: 0.5 }}>
            {images.map((img) => (
              <Box
                key={img.id}
                component="img"
                src={img.url}
                alt={img.caption || 'Class drawing'}
                onClick={() => setZoom(img.url)}
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

      <Dialog open={!!zoom} onClose={() => setZoom(null)} maxWidth="md">
        <Box sx={{ position: 'relative' }}>
          <IconButton
            onClick={() => setZoom(null)}
            aria-label="Close"
            sx={{ position: 'absolute', top: 8, right: 8, bgcolor: 'rgba(0,0,0,0.55)', color: '#fff' }}
          >
            <CloseIcon />
          </IconButton>
          {zoom && (
            <Box component="img" src={zoom} alt="Class drawing" sx={{ display: 'block', maxWidth: '90vw', maxHeight: '85vh' }} />
          )}
        </Box>
      </Dialog>
    </Box>
  );
}
