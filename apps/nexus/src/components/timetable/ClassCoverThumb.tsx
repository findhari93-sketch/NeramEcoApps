'use client';

/**
 * The picture that stands in front of a class in every list.
 *
 * A week of finished classes reads as a wall of titles. One image per class turns
 * it into something a student can scan: they pick the class whose picture draws
 * them in, tap it to see it full size, and flip through the rest.
 *
 * Only render this for a class that has ENDED and is not cancelled. A tile on a
 * class that has not happened yet promises content that does not exist, and reads
 * as a broken image. Callers own that gate, because they are the ones that
 * already know a row's state.
 */

import { useState } from 'react';
import { Box, Typography, useTheme } from '@neram/ui';
import PhotoLibraryOutlinedIcon from '@mui/icons-material/PhotoLibraryOutlined';
import { coverThumbSrc, resolveClassCover, sortClassImages, type ClassImageRef } from '@/lib/class-cover';
import { classSubjectKey, subjectTint } from './timetable-theme';
import ClassImagesViewer from './ClassImagesViewer';

const SIZES = { sm: 48, md: 72 } as const;

interface ClassCoverThumbProps {
  cls: {
    title?: string | null;
    topic?: { title?: string | null; category?: string | null } | null;
    course_topic?: { title?: string | null } | null;
    cover_image_id?: string | null;
    class_images?: ClassImageRef[] | null;
  };
  size?: keyof typeof SIZES;
}

export default function ClassCoverThumb({ cls, size = 'sm' }: ClassCoverThumbProps) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const [failed, setFailed] = useState(false);

  const px = SIZES[size];
  const ordered = sortClassImages(cls.class_images || []);
  const cover = resolveClassCover(ordered, cls.cover_image_id);
  const subject = classSubjectKey(cls);
  const tint = subjectTint(theme, subject);

  const showImage = !!cover && !failed;
  const label = showImage
    ? `See the ${ordered.length === 1 ? 'picture' : `${ordered.length} pictures`} from ${cls.title || 'this class'}`
    : `No pictures from ${cls.title || 'this class'} yet`;

  const frameSx = {
    position: 'relative' as const,
    flexShrink: 0,
    width: px,
    height: px,
    borderRadius: 1.5,
    overflow: 'hidden',
    border: '1px solid',
    borderColor: 'divider',
  };

  // Nothing to open, so this is a plain tile: the subject's colour and initial,
  // which at least tells a student what the class was about.
  if (!showImage) {
    return (
      <Box
        aria-label={label}
        sx={{
          ...frameSx,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          bgcolor: tint.bg,
          color: tint.fg,
        }}
      >
        {subject ? (
          <Typography
            aria-hidden
            sx={{ fontWeight: 800, fontSize: size === 'sm' ? '1.125rem' : '1.5rem', lineHeight: 1, userSelect: 'none' }}
          >
            {subject.trim().charAt(0).toUpperCase()}
          </Typography>
        ) : (
          <PhotoLibraryOutlinedIcon sx={{ fontSize: size === 'sm' ? 20 : 26 }} />
        )}
      </Box>
    );
  }

  return (
    <>
      <Box
        component="button"
        type="button"
        aria-label={label}
        // The rows this sits inside are themselves buttons that listen for click,
        // Enter and Space. Without both guards, opening the viewer would also
        // select the class behind it.
        onClick={(e: React.MouseEvent) => {
          e.stopPropagation();
          setOpen(true);
        }}
        onKeyDown={(e: React.KeyboardEvent) => {
          if (e.key === 'Enter' || e.key === ' ') e.stopPropagation();
        }}
        sx={{
          ...frameSx,
          p: 0,
          cursor: 'pointer',
          appearance: 'none',
          bgcolor: tint.bg,
          display: 'block',
          '&:focus-visible': {
            outline: `2px solid ${theme.palette.primary.main}`,
            outlineOffset: 2,
          },
        }}
      >
        <Box
          component="img"
          src={coverThumbSrc(cover)}
          alt=""
          width={px}
          height={px}
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
          sx={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
        />

        {ordered.length > 1 && (
          <Typography
            aria-hidden
            sx={{
              position: 'absolute',
              bottom: 2,
              right: 2,
              px: 0.5,
              borderRadius: 0.75,
              fontSize: '0.5938rem',
              fontWeight: 700,
              lineHeight: 1.5,
              color: '#fff',
              bgcolor: 'rgba(0,0,0,0.6)',
              // Never eat the tap meant for the tile underneath.
              pointerEvents: 'none',
            }}
          >
            {ordered.length}
          </Typography>
        )}
      </Box>

      {open && (
        <ClassImagesViewer
          open={open}
          onClose={() => setOpen(false)}
          images={ordered}
          startIndex={Math.max(
            ordered.findIndex((img) => img.id === cover.id),
            0,
          )}
          title={cls.title}
        />
      )}
    </>
  );
}
