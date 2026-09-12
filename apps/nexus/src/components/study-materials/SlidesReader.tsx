'use client';

/**
 * A chapter's PowerPoint slides, read as pages in the same secure reader as the
 * chapter PDF: canvas pages, the student's watermark, no download or print.
 *
 * The server answers with a short-lived signed link to a PDF made from the deck
 * (see lib/study-slides.ts), served from Storage rather than through a Vercel
 * function. Most opens answer at once. The first open after a teacher edits the
 * deck converts it again, which can take a while, so a skeleton holds the space
 * and after a few seconds says why it is waiting.
 *
 * A student is never left with nothing to read: when the slides cannot be shown,
 * going back to the PDF is the main action.
 */

import { useEffect, useRef, useState } from 'react';
import { Box, Typography, Button, Skeleton, useMediaQuery } from '@neram/ui';
import SlideshowOutlinedIcon from '@mui/icons-material/SlideshowOutlined';
import PDFReader from '@/components/reader/PDFReader';
import {
  SLIDES_OPEN_FAILED,
  SLIDES_SLOW_NOTICE,
  SLIDES_SLOW_NOTICE_MS,
  slidesUnavailableText,
  slidesViewFromResponse,
  type SlidesView,
} from '@/lib/slides-view';

interface SlidesReaderProps {
  fileId: string;
  getToken: () => Promise<string | null>;
  /** The student's identity, drawn onto every slide. Leave undefined for a teacher preview. */
  watermark?: string;
  /** Back to the chapter PDF, offered whenever the slides cannot be shown. */
  onReadPdf?: () => void;
  /** Change it to fetch the slides again, for example after a teacher presses Refresh now. */
  reloadKey?: string | number;
}

export default function SlidesReader({ fileId, getToken, watermark, onReadPdf, reloadKey }: SlidesReaderProps) {
  const reduceMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const [view, setView] = useState<SlidesView>({ phase: 'loading' });
  const [slow, setSlow] = useState(false);
  const [attempt, setAttempt] = useState(0);

  // getToken is not guaranteed a stable identity. Read through a ref, a new
  // function from a parent render cannot start a second request.
  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;

  useEffect(() => {
    let active = true;
    setView({ phase: 'loading' });
    setSlow(false);
    const notice = window.setTimeout(() => {
      if (active) setSlow(true);
    }, SLIDES_SLOW_NOTICE_MS);

    (async () => {
      try {
        const token = await getTokenRef.current();
        const res = await fetch(`/api/study-materials/files/${fileId}/slides`, {
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store',
        });
        const body = await res.json().catch(() => null);
        if (active) setView(slidesViewFromResponse(res.ok, body));
      } catch {
        if (active) setView({ phase: 'error', message: SLIDES_OPEN_FAILED });
      } finally {
        window.clearTimeout(notice);
      }
    })();

    return () => {
      active = false;
      window.clearTimeout(notice);
    };
  }, [fileId, reloadKey, attempt]);

  const retry = () => setAttempt((n) => n + 1);

  if (view.phase === 'ready') {
    // A page that fails to load usually means the signed link lapsed while the
    // chapter sat open, so Retry asks the server for a fresh one.
    return <PDFReader pdfUrl={view.url} watermark={watermark} label="Slides" onRetry={retry} />;
  }

  if (view.phase === 'loading') {
    return (
      <Box
        aria-busy="true"
        sx={{ flex: 1, minWidth: 0, minHeight: 0, overflow: 'hidden', py: 2, px: { xs: 1, sm: 2 }, bgcolor: 'action.hover' }}
      >
        <Box sx={{ maxWidth: 900, mx: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
          {[0, 1, 2].map((i) => (
            <Box key={i} sx={{ position: 'relative' }}>
              <Skeleton
                variant="rounded"
                animation={reduceMotion ? false : 'pulse'}
                sx={{ width: '100%', height: 'auto', aspectRatio: '16 / 9' }}
              />
              {/* Laid over the first slide, so the notice arriving moves nothing. */}
              {i === 0 && (
                <Typography
                  role="status"
                  variant="body2"
                  sx={{
                    position: 'absolute',
                    inset: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    textAlign: 'center',
                    px: 3,
                    color: 'text.secondary',
                  }}
                >
                  {slow ? SLIDES_SLOW_NOTICE : ''}
                </Typography>
              )}
            </Box>
          ))}
        </Box>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        flex: 1,
        minWidth: 0,
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 1.5,
        p: 3,
        textAlign: 'center',
      }}
    >
      <SlideshowOutlinedIcon sx={{ fontSize: 40, color: 'text.secondary' }} />
      <Typography variant="body1" sx={{ maxWidth: 360 }}>
        {view.phase === 'error' ? view.message : slidesUnavailableText(view.reason)}
      </Typography>
      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', justifyContent: 'center' }}>
        {onReadPdf && (
          <Button variant="contained" onClick={onReadPdf} sx={{ minHeight: 44 }}>
            Read the PDF
          </Button>
        )}
        {view.phase === 'error' && (
          <Button variant="outlined" onClick={retry} sx={{ minHeight: 44 }}>
            Try again
          </Button>
        )}
      </Box>
    </Box>
  );
}
