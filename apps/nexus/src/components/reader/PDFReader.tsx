'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Box, Typography, CircularProgress, IconButton, Tooltip, Button } from '@neram/ui';
import FullscreenIcon from '@mui/icons-material/Fullscreen';
import FullscreenExitIcon from '@mui/icons-material/FullscreenExit';

interface PDFReaderProps {
  pdfUrl: string;
  initialPage?: number;
  totalPages?: number;
  onPageChange?: (page: number) => void;
  onRetry?: () => void;
  /**
   * When set, a faint diagonal watermark (e.g. the student's name + phone) is baked onto every
   * rendered page so it survives screenshots. Leave undefined for trusted viewers (teachers).
   */
  watermark?: string;
}

/**
 * Secure PDF viewer. Renders the document with pdf.js into <canvas> pages (NOT the browser's
 * native <iframe> PDF viewer), so there is no built-in toolbar, no "Save as", no Print, and
 * right-click is genuinely blocked. Pages render lazily as they scroll into view. An optional
 * watermark is drawn directly onto each canvas.
 *
 * Note: no browser-rendered document can be 100% leak-proof (screenshots, devtools). This removes
 * every casual download path and ties any screenshot to the viewer via the watermark.
 */
export default function PDFReader({
  pdfUrl,
  initialPage,
  onPageChange,
  onRetry,
  watermark,
}: PDFReaderProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [numPages, setNumPages] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const pdfRef = useRef<any>(null);
  const renderedRef = useRef<Set<number>>(new Set());
  const pageElsRef = useRef<Map<number, HTMLDivElement>>(new Map());

  // --- Load the document ---------------------------------------------------
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    setNumPages(0);
    renderedRef.current = new Set();
    pageElsRef.current = new Map();

    (async () => {
      try {
        const pdfjsLib: any = await import('pdfjs-dist');
        // Match the worker setup already used elsewhere in the app (question-bank bulk upload).
        const cdn = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjsLib.version}`;
        pdfjsLib.GlobalWorkerOptions.workerSrc = `${cdn}/build/pdf.worker.min.mjs`;
        const doc = await pdfjsLib.getDocument({
          url: pdfUrl,
          // Render special glyphs / standard fonts faithfully.
          cMapUrl: `${cdn}/cmaps/`,
          cMapPacked: true,
          standardFontDataUrl: `${cdn}/standard_fonts/`,
        }).promise;
        if (cancelled) {
          doc.destroy();
          return;
        }
        pdfRef.current = doc;
        setNumPages(doc.numPages);
        setLoading(false);
      } catch {
        if (!cancelled) {
          setError(true);
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      const doc = pdfRef.current;
      pdfRef.current = null;
      if (doc) {
        try {
          doc.destroy();
        } catch {
          /* noop */
        }
      }
    };
  }, [pdfUrl]);

  // --- Draw a tiled diagonal watermark onto a rendered canvas --------------
  const drawWatermark = useCallback((canvas: HTMLCanvasElement, text: string) => {
    const ctx = canvas.getContext('2d');
    if (!ctx || !text) return;
    const w = canvas.width;
    const h = canvas.height;
    ctx.setTransform(1, 0, 0, 1, 0, 0); // device pixels
    ctx.save();
    ctx.globalAlpha = 0.1;
    ctx.fillStyle = '#6b7280';
    const fontSize = Math.max(14, Math.round(w / 30));
    ctx.font = `600 ${fontSize}px "Helvetica Neue", Arial, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.translate(w / 2, h / 2);
    ctx.rotate(-Math.PI / 6);
    ctx.translate(-w / 2, -h / 2);
    const stepX = Math.max(240, w / 2);
    const stepY = Math.max(160, h / 6);
    for (let y = -h * 0.25; y < h * 1.5; y += stepY) {
      for (let x = -w * 0.25; x < w * 1.5; x += stepX) {
        ctx.fillText(text, x, y);
      }
    }
    ctx.restore();
  }, []);

  // --- Render a single page into its canvas (idempotent) -------------------
  const renderPage = useCallback(
    async (pageNum: number) => {
      const doc = pdfRef.current;
      const host = pageElsRef.current.get(pageNum);
      if (!doc || !host || renderedRef.current.has(pageNum)) return;
      renderedRef.current.add(pageNum);
      try {
        const page = await doc.getPage(pageNum);
        const containerWidth = host.clientWidth || 800;
        const baseViewport = page.getViewport({ scale: 1 });
        const scale = containerWidth / baseViewport.width;
        const outputScale = Math.min(window.devicePixelRatio || 1, 2);
        const viewport = page.getViewport({ scale });

        const canvas = document.createElement('canvas');
        canvas.width = Math.floor(viewport.width * outputScale);
        canvas.height = Math.floor(viewport.height * outputScale);
        canvas.style.width = '100%';
        canvas.style.height = 'auto';
        canvas.style.display = 'block';
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        await page.render({
          canvasContext: ctx,
          viewport,
          transform: outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : undefined,
        }).promise;

        if (watermark) drawWatermark(canvas, watermark);

        host.innerHTML = '';
        host.appendChild(canvas);
      } catch {
        renderedRef.current.delete(pageNum); // allow a retry on next intersection
      }
    },
    [watermark, drawWatermark]
  );

  // --- Lazy-render pages as they approach the viewport ---------------------
  useEffect(() => {
    if (!numPages || !scrollRef.current) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const pageNum = Number((entry.target as HTMLElement).dataset.page);
          if (entry.isIntersecting) {
            renderPage(pageNum);
            if (entry.intersectionRatio > 0.5) onPageChange?.(pageNum);
          }
        }
      },
      { root: scrollRef.current, rootMargin: '400px 0px', threshold: [0, 0.5] }
    );
    pageElsRef.current.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [numPages, renderPage, onPageChange]);

  // --- Jump to the initial page once pages exist ---------------------------
  useEffect(() => {
    if (!numPages || !initialPage || initialPage <= 1) return;
    const el = pageElsRef.current.get(initialPage);
    if (el) el.scrollIntoView({ block: 'start' });
  }, [numPages, initialPage]);

  // --- Fullscreen ----------------------------------------------------------
  const handleFullscreen = async () => {
    if (!containerRef.current) return;
    if (document.fullscreenElement) {
      await document.exitFullscreen();
    } else {
      await containerRef.current.requestFullscreen();
    }
  };
  useEffect(() => {
    const onFsChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  if (error) {
    return (
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          gap: 2,
          p: 3,
          textAlign: 'center',
        }}
      >
        <Typography variant="body2" color="text.secondary">
          Could not load the PDF
        </Typography>
        {onRetry && (
          <Button
            size="small"
            variant="outlined"
            onClick={() => {
              setError(false);
              setLoading(true);
              onRetry();
            }}
          >
            Retry
          </Button>
        )}
      </Box>
    );
  }

  return (
    <Box
      ref={containerRef}
      onContextMenu={(e) => e.preventDefault()}
      sx={{
        position: 'relative',
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        bgcolor: isFullscreen ? '#525659' : 'background.default',
        userSelect: 'none',
        WebkitUserSelect: 'none',
        WebkitTouchCallout: 'none',
      }}
    >
      {/* Toolbar */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          gap: 0.5,
          px: 1.5,
          py: 0.5,
          borderBottom: '1px solid',
          borderColor: 'divider',
          bgcolor: 'background.paper',
          minHeight: 40,
          flexShrink: 0,
        }}
      >
        <Typography
          variant="caption"
          sx={{ flex: 1, fontWeight: 600, color: 'text.secondary', fontSize: '0.75rem' }}
        >
          PDF Viewer
        </Typography>
        <Tooltip title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}>
          <IconButton size="small" onClick={handleFullscreen}>
            {isFullscreen ? <FullscreenExitIcon fontSize="small" /> : <FullscreenIcon fontSize="small" />}
          </IconButton>
        </Tooltip>
      </Box>

      {/* Loading overlay */}
      {loading && (
        <Box
          sx={{
            position: 'absolute',
            top: 40,
            left: 0,
            right: 0,
            bottom: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1,
            bgcolor: 'background.default',
          }}
        >
          <CircularProgress size={36} />
        </Box>
      )}

      {/* Scrollable page list (pdf.js canvases render here) */}
      <Box
        ref={scrollRef}
        sx={{
          flex: 1,
          minHeight: 0,
          overflow: 'auto',
          bgcolor: isFullscreen ? '#525659' : 'action.hover',
          py: 2,
          px: { xs: 1, sm: 2 },
        }}
      >
        <Box sx={{ maxWidth: 900, mx: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
          {Array.from({ length: numPages }, (_, i) => i + 1).map((pageNum) => (
            <Box
              key={pageNum}
              sx={{
                position: 'relative',
                width: '100%',
                minHeight: 400,
                bgcolor: 'background.paper',
                borderRadius: 1,
                boxShadow: 2,
                overflow: 'hidden',
              }}
            >
              {/* Placeholder spinner (behind the canvas; covered once the opaque page renders). */}
              <Box
                sx={{
                  position: 'absolute',
                  inset: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <CircularProgress size={22} sx={{ opacity: 0.5 }} />
              </Box>
              {/* Canvas mount: React keeps this empty; pdf.js appends the <canvas> imperatively. */}
              <Box
                data-page={pageNum}
                ref={(el: HTMLDivElement | null) => {
                  if (el) pageElsRef.current.set(pageNum, el);
                  else pageElsRef.current.delete(pageNum);
                }}
                sx={{ position: 'relative', width: '100%' }}
              />
            </Box>
          ))}
        </Box>
      </Box>
    </Box>
  );
}
