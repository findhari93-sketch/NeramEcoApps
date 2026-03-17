'use client';

import {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from 'react';
import {
  Box,
  Typography,
  IconButton,
  Chip,
  CircularProgress,
  TextField,
  Button,
  alpha,
  useTheme,
  useMediaQuery,
} from '@neram/ui';
import ZoomInIcon from '@mui/icons-material/ZoomIn';
import ZoomOutIcon from '@mui/icons-material/ZoomOut';
import FullscreenIcon from '@mui/icons-material/Fullscreen';
import FullscreenExitIcon from '@mui/icons-material/FullscreenExit';
import NavigateBeforeIcon from '@mui/icons-material/NavigateBefore';
import NavigateNextIcon from '@mui/icons-material/NavigateNext';
import LightModeIcon from '@mui/icons-material/LightMode';
import DarkModeIcon from '@mui/icons-material/DarkMode';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PDFReaderProps {
  pdfUrl: string;
  initialPage?: number;
  totalPages?: number;
  onPageChange?: (page: number) => void;
}

type ReadingMode = 'light' | 'dark' | 'sepia';

type PDFDocumentProxy = any;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'pdf-reader-mode';
const MAX_CACHE = 5;
const SWIPE_THRESHOLD = 50;
const ZOOM_STEP = 0.25;
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 3;
const DEBOUNCE_MS = 3000;

const loadPdfJs = async () => {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.mjs`;
  return pdfjs;
};

const getSavedMode = (): ReadingMode => {
  if (typeof window === 'undefined') return 'light';
  return (localStorage.getItem(STORAGE_KEY) as ReadingMode) || 'light';
};

const getCanvasFilter = (mode: ReadingMode): string => {
  switch (mode) {
    case 'dark':
      return 'invert(1) hue-rotate(180deg)';
    case 'sepia':
      return 'sepia(0.3)';
    default:
      return 'none';
  }
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function PDFReader({
  pdfUrl,
  initialPage = 1,
  totalPages: totalPagesOverride,
  onPageChange,
}: PDFReaderProps) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  // ---- State ----
  const [pdfDoc, setPdfDoc] = useState<PDFDocumentProxy | null>(null);
  const [numPages, setNumPages] = useState(totalPagesOverride ?? 0);
  const [currentPage, setCurrentPage] = useState(initialPage);
  const [pageInput, setPageInput] = useState(String(initialPage));
  const [zoom, setZoom] = useState(1);
  const [readingMode, setReadingMode] = useState<ReadingMode>(getSavedMode);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [renderError, setRenderError] = useState<string | null>(null);

  // ---- Refs ----
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pageCacheRef = useRef<Map<number, ImageBitmap>>(new Map());
  const renderTaskRef = useRef<ReturnType<
    Awaited<ReturnType<PDFDocumentProxy['getPage']>>['render']
  > | null>(null);
  const pageChangeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastReportedPageRef = useRef(initialPage);

  // Touch tracking
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const pinchStartDistRef = useRef<number | null>(null);
  const pinchStartZoomRef = useRef(1);

  // ---- Derived ----
  const effectivePages = totalPagesOverride ?? numPages;

  // ---------- PDF Loading ----------
  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setRenderError(null);
      try {
        const pdfjs = await loadPdfJs();
        const loadingTask = pdfjs.getDocument(pdfUrl);
        const doc = await loadingTask.promise;
        if (cancelled) return;
        setPdfDoc(doc as unknown as PDFDocumentProxy);
        setNumPages(doc.numPages);
      } catch (err) {
        if (!cancelled) {
          setRenderError(
            err instanceof Error ? err.message : 'Failed to load PDF',
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [pdfUrl]);

  // ---------- Render Page ----------
  const renderPage = useCallback(
    async (pageNum: number) => {
      if (!pdfDoc || !canvasRef.current || !containerRef.current) return;

      // Abort any in-flight render
      if (renderTaskRef.current) {
        try {
          renderTaskRef.current.cancel();
        } catch {
          // ignore
        }
        renderTaskRef.current = null;
      }

      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // Check cache
      const cached = pageCacheRef.current.get(pageNum);
      if (cached) {
        canvas.width = cached.width;
        canvas.height = cached.height;
        ctx.drawImage(cached, 0, 0);
        return;
      }

      setLoading(true);
      setRenderError(null);

      try {
        const page = await pdfDoc.getPage(pageNum);
        const containerWidth = containerRef.current.clientWidth;
        const baseScale = containerWidth / page.getViewport({ scale: 1 }).width;
        const scale = baseScale * window.devicePixelRatio;
        const viewport = page.getViewport({ scale });

        canvas.width = viewport.width;
        canvas.height = viewport.height;
        canvas.style.width = `${viewport.width / window.devicePixelRatio}px`;
        canvas.style.height = `${viewport.height / window.devicePixelRatio}px`;

        const task = page.render({ canvasContext: ctx, viewport });
        renderTaskRef.current = task;
        await task.promise;
        renderTaskRef.current = null;

        // Cache the rendered page as ImageBitmap
        try {
          const bmp = await createImageBitmap(canvas);
          const cache = pageCacheRef.current;
          cache.set(pageNum, bmp);
          // Evict oldest if over limit
          if (cache.size > MAX_CACHE) {
            const oldest = cache.keys().next().value;
            if (oldest !== undefined) {
              cache.get(oldest)?.close();
              cache.delete(oldest);
            }
          }
        } catch {
          // ImageBitmap not supported in some environments — ignore
        }
      } catch (err: unknown) {
        if (
          err &&
          typeof err === 'object' &&
          'name' in err &&
          (err as { name: string }).name === 'RenderingCancelledException'
        ) {
          return; // expected when navigating fast
        }
        setRenderError(
          err instanceof Error ? err.message : 'Failed to render page',
        );
      } finally {
        setLoading(false);
      }
    },
    [pdfDoc],
  );

  // Render current page whenever it changes
  useEffect(() => {
    renderPage(currentPage);
  }, [currentPage, renderPage]);

  // Preload adjacent pages
  useEffect(() => {
    if (!pdfDoc) return;
    const toPreload = [currentPage - 1, currentPage + 1].filter(
      (p) => p >= 1 && p <= effectivePages,
    );
    toPreload.forEach((p) => {
      if (!pageCacheRef.current.has(p)) {
        // Render off-screen to populate cache
        const offscreen = document.createElement('canvas');
        const ctx = offscreen.getContext('2d');
        if (!ctx || !containerRef.current) return;
        pdfDoc.getPage(p).then((page: any) => {
          const containerWidth = containerRef.current?.clientWidth ?? 800;
          const baseScale =
            containerWidth / page.getViewport({ scale: 1 }).width;
          const scale = baseScale * window.devicePixelRatio;
          const viewport = page.getViewport({ scale });
          offscreen.width = viewport.width;
          offscreen.height = viewport.height;
          const task = page.render({ canvasContext: ctx, viewport });
          task.promise
            .then(() => createImageBitmap(offscreen))
            .then((bmp: ImageBitmap) => {
              const cache = pageCacheRef.current;
              if (!cache.has(p)) {
                cache.set(p, bmp);
                if (cache.size > MAX_CACHE) {
                  const oldest = cache.keys().next().value;
                  if (oldest !== undefined) {
                    cache.get(oldest)?.close();
                    cache.delete(oldest);
                  }
                }
              }
            })
            .catch(() => {
              /* ignore preload errors */
            });
        });
      }
    });
  }, [currentPage, pdfDoc, effectivePages]);

  // ---------- Navigation helpers ----------
  const goToPage = useCallback(
    (page: number) => {
      const clamped = Math.max(1, Math.min(page, effectivePages));
      setCurrentPage(clamped);
      setPageInput(String(clamped));
    },
    [effectivePages],
  );

  const prevPage = useCallback(
    () => goToPage(currentPage - 1),
    [currentPage, goToPage],
  );
  const nextPage = useCallback(
    () => goToPage(currentPage + 1),
    [currentPage, goToPage],
  );

  // ---------- Debounced onPageChange ----------
  useEffect(() => {
    if (!onPageChange || currentPage === lastReportedPageRef.current) return;
    if (pageChangeTimerRef.current) clearTimeout(pageChangeTimerRef.current);
    pageChangeTimerRef.current = setTimeout(() => {
      onPageChange(currentPage);
      lastReportedPageRef.current = currentPage;
    }, DEBOUNCE_MS);
    return () => {
      if (pageChangeTimerRef.current) clearTimeout(pageChangeTimerRef.current);
    };
  }, [currentPage, onPageChange]);

  // ---------- Keyboard navigation ----------
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        prevPage();
      } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault();
        nextPage();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [prevPage, nextPage]);

  // ---------- Touch / Swipe / Pinch ----------
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      touchStartRef.current = {
        x: e.touches[0].clientX,
        y: e.touches[0].clientY,
      };
    } else if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      pinchStartDistRef.current = Math.hypot(dx, dy);
      pinchStartZoomRef.current = zoom;
      touchStartRef.current = null; // cancel swipe
    }
  }, [zoom]);

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (e.touches.length === 2 && pinchStartDistRef.current !== null) {
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        const dist = Math.hypot(dx, dy);
        const ratio = dist / pinchStartDistRef.current;
        const newZoom = Math.max(
          MIN_ZOOM,
          Math.min(MAX_ZOOM, pinchStartZoomRef.current * ratio),
        );
        setZoom(newZoom);
      }
    },
    [],
  );

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      // Pinch end
      if (pinchStartDistRef.current !== null) {
        pinchStartDistRef.current = null;
        return;
      }

      // Swipe detection
      if (!touchStartRef.current || e.changedTouches.length === 0) return;
      const dx = e.changedTouches[0].clientX - touchStartRef.current.x;
      touchStartRef.current = null;
      if (Math.abs(dx) >= SWIPE_THRESHOLD) {
        if (dx < 0) nextPage();
        else prevPage();
      }
    },
    [nextPage, prevPage],
  );

  // ---------- Click on page edges (desktop) ----------
  const handleCanvasClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (isMobile) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const third = rect.width / 3;
      if (x < third) prevPage();
      else if (x > third * 2) nextPage();
    },
    [isMobile, prevPage, nextPage],
  );

  // ---------- Fullscreen ----------
  const toggleFullscreen = useCallback(() => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  }, []);

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  // ---------- Reading mode ----------
  const changeMode = useCallback((mode: ReadingMode) => {
    setReadingMode(mode);
    localStorage.setItem(STORAGE_KEY, mode);
  }, []);

  // ---------- Zoom ----------
  const zoomIn = useCallback(
    () => setZoom((z) => Math.min(MAX_ZOOM, z + ZOOM_STEP)),
    [],
  );
  const zoomOut = useCallback(
    () => setZoom((z) => Math.max(MIN_ZOOM, z - ZOOM_STEP)),
    [],
  );

  // ---------- Page input ----------
  const handlePageInputBlur = useCallback(() => {
    const parsed = parseInt(pageInput, 10);
    if (!isNaN(parsed)) goToPage(parsed);
    else setPageInput(String(currentPage));
  }, [pageInput, goToPage, currentPage]);

  const handlePageInputKey = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') handlePageInputBlur();
    },
    [handlePageInputBlur],
  );

  // Invalidate cache on zoom (sizes change)
  useEffect(() => {
    const cache = pageCacheRef.current;
    cache.forEach((bmp) => bmp.close());
    cache.clear();
    renderPage(currentPage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoom]);

  // Clean up cache on unmount
  useEffect(() => {
    return () => {
      pageCacheRef.current.forEach((bmp) => bmp.close());
      pageCacheRef.current.clear();
    };
  }, []);

  // ---------- Reading mode chips config ----------
  const modeChips: { label: string; mode: ReadingMode; icon: React.ReactNode }[] =
    useMemo(
      () => [
        { label: 'Light', mode: 'light', icon: <LightModeIcon fontSize="small" /> },
        { label: 'Dark', mode: 'dark', icon: <DarkModeIcon fontSize="small" /> },
        { label: 'Sepia', mode: 'sepia', icon: null },
      ],
      [],
    );

  // ---------- Render ----------

  // Error state with retry
  if (renderError && !pdfDoc) {
    return (
      <Box
        sx={{
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 2,
          p: 3,
        }}
      >
        <Typography color="error" variant="body1" textAlign="center">
          {renderError}
        </Typography>
        <Button
          variant="outlined"
          onClick={() => window.location.reload()}
        >
          Retry
        </Button>
      </Box>
    );
  }

  return (
    <Box
      ref={containerRef}
      sx={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        bgcolor: readingMode === 'dark' ? '#1a1a1a' : '#f5f5f5',
        position: 'relative',
        overflow: 'hidden',
        userSelect: 'none',
      }}
    >
      {/* ---- Toolbar ---- */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: isMobile ? 0.5 : 1,
          px: isMobile ? 1 : 2,
          py: 0.5,
          bgcolor: alpha(theme.palette.background.paper, 0.92),
          backdropFilter: 'blur(8px)',
          borderBottom: `1px solid ${theme.palette.divider}`,
          zIndex: 2,
          flexWrap: 'wrap',
          minHeight: 48,
        }}
      >
        {/* Page input */}
        <TextField
          size="small"
          value={pageInput}
          onChange={(e) => setPageInput(e.target.value)}
          onBlur={handlePageInputBlur}
          onKeyDown={handlePageInputKey}
          inputProps={{
            'aria-label': 'Page number',
            style: {
              width: 40,
              textAlign: 'center',
              padding: '4px 6px',
              fontSize: 14,
            },
          }}
          sx={{ '& .MuiOutlinedInput-root': { height: 32 } }}
        />
        <Typography variant="body2" color="text.secondary" sx={{ mr: 1 }}>
          / {effectivePages || '...'}
        </Typography>

        {/* Zoom */}
        <IconButton size="small" onClick={zoomOut} aria-label="Zoom out">
          <ZoomOutIcon fontSize="small" />
        </IconButton>
        <Typography variant="caption" sx={{ minWidth: 36, textAlign: 'center' }}>
          {Math.round(zoom * 100)}%
        </Typography>
        <IconButton size="small" onClick={zoomIn} aria-label="Zoom in">
          <ZoomInIcon fontSize="small" />
        </IconButton>

        {/* Spacer */}
        <Box sx={{ flex: 1 }} />

        {/* Reading mode chips */}
        {!isMobile &&
          modeChips.map(({ label, mode, icon }) => (
            <Chip
              key={mode}
              label={label}
              icon={icon as React.ReactElement | undefined}
              size="small"
              variant={readingMode === mode ? 'filled' : 'outlined'}
              color={readingMode === mode ? 'primary' : 'default'}
              onClick={() => changeMode(mode)}
              sx={{ cursor: 'pointer' }}
            />
          ))}

        {/* Mobile: compact mode toggle */}
        {isMobile && (
          <IconButton
            size="small"
            onClick={() => {
              const modes: ReadingMode[] = ['light', 'dark', 'sepia'];
              const idx = modes.indexOf(readingMode);
              changeMode(modes[(idx + 1) % modes.length]);
            }}
            aria-label="Toggle reading mode"
          >
            {readingMode === 'dark' ? (
              <DarkModeIcon fontSize="small" />
            ) : (
              <LightModeIcon fontSize="small" />
            )}
          </IconButton>
        )}

        {/* Fullscreen */}
        <IconButton
          size="small"
          onClick={toggleFullscreen}
          aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
        >
          {isFullscreen ? (
            <FullscreenExitIcon fontSize="small" />
          ) : (
            <FullscreenIcon fontSize="small" />
          )}
        </IconButton>
      </Box>

      {/* ---- Canvas area ---- */}
      <Box
        sx={{
          flex: 1,
          overflow: 'auto',
          display: 'flex',
          justifyContent: 'center',
          alignItems: isMobile ? 'flex-start' : 'center',
          position: 'relative',
          WebkitOverflowScrolling: 'touch',
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* Loading overlay */}
        {loading && (
          <Box
            sx={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 1,
              bgcolor: alpha(theme.palette.background.default, 0.6),
            }}
          >
            <CircularProgress size={40} />
          </Box>
        )}

        {/* Render error overlay */}
        {renderError && pdfDoc && (
          <Box
            sx={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 1,
              gap: 1,
              bgcolor: alpha(theme.palette.background.default, 0.8),
            }}
          >
            <Typography color="error" variant="body2">
              {renderError}
            </Typography>
            <Button
              size="small"
              variant="outlined"
              onClick={() => renderPage(currentPage)}
            >
              Retry
            </Button>
          </Box>
        )}

        <canvas
          ref={canvasRef}
          onClick={handleCanvasClick}
          style={{
            display: 'block',
            maxWidth: '100%',
            filter: getCanvasFilter(readingMode),
            transform: `scale(${zoom})`,
            transformOrigin: 'top center',
            cursor: isMobile ? 'default' : 'pointer',
            transition: 'filter 0.3s ease',
          }}
        />
      </Box>

      {/* ---- Bottom page indicator ---- */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 1,
          py: 0.75,
          px: 2,
          bgcolor: alpha(theme.palette.background.paper, 0.92),
          backdropFilter: 'blur(8px)',
          borderTop: `1px solid ${theme.palette.divider}`,
          zIndex: 2,
        }}
      >
        <IconButton
          size="small"
          onClick={prevPage}
          disabled={currentPage <= 1}
          aria-label="Previous page"
        >
          <NavigateBeforeIcon />
        </IconButton>

        <Typography variant="body2" color="text.secondary">
          Page {currentPage} of {effectivePages || '...'}
        </Typography>

        <IconButton
          size="small"
          onClick={nextPage}
          disabled={currentPage >= effectivePages}
          aria-label="Next page"
        >
          <NavigateNextIcon />
        </IconButton>
      </Box>
    </Box>
  );
}
