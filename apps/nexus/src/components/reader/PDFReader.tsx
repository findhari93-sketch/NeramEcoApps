'use client';

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Box, Typography, CircularProgress, IconButton, Tooltip, Button } from '@neram/ui';
import FullscreenIcon from '@mui/icons-material/Fullscreen';
import FullscreenExitIcon from '@mui/icons-material/FullscreenExit';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import PDFAnnotationLayer, { type AnnotationTool } from './PDFAnnotationLayer';
import PDFAnnotationToolbar, { ANNOTATION_COLORS } from './PDFAnnotationToolbar';
import { currentPageFromTops, needsRerenderForWidth, pageAspectRatio } from './pdf-layout';
import type { NexusStudyAnnotationDTO, NexusStudyAnnotationPoint } from '@neram/database/types';

/** Personal ink annotations for this file. Omit entirely for a plain, non-annotatable reader. */
export interface PDFReaderAnnotations {
  items: NexusStudyAnnotationDTO[];
  onCreateStroke?: (
    page: number,
    kind: 'pen' | 'highlighter',
    points: NexusStudyAnnotationPoint[],
    color: string,
  ) => Promise<string | null>;
  onCreateNote?: (
    page: number,
    anchor: NexusStudyAnnotationPoint,
    text: string,
    color: string,
  ) => Promise<string | null>;
  onUpdateNote?: (id: string, text: string) => void;
  onDelete?: (id: string) => void;
}

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
  annotations?: PDFReaderAnnotations;
  /** Names the document in the toolbar, for example "Slides". */
  label?: string;
}

/** Read by screen readers, not drawn. */
const visuallyHidden = {
  position: 'absolute',
  width: '1px',
  height: '1px',
  p: 0,
  m: '-1px',
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
  border: 0,
} as const;

/**
 * Secure PDF viewer. Renders the document with pdf.js into <canvas> pages (NOT the browser's
 * native <iframe> PDF viewer), so there is no built-in toolbar, no "Save as", no Print, and
 * right-click is genuinely blocked. Pages render lazily as they scroll into view. An optional
 * watermark is drawn directly onto each canvas.
 *
 * Page placeholders take the document's own page shape, so a deck of 16:9 slides does not sit
 * in 400px white gaps on a phone. When the reader's width changes enough (a phone turned on its
 * side), the pages on screen are drawn again at the new size so they stay sharp.
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
  annotations,
  label = 'PDF Viewer',
}: PDFReaderProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [numPages, setNumPages] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  /** Page 1's width over height, used for every placeholder until its page is drawn. */
  const [pageAspect, setPageAspect] = useState<number | null>(null);
  const [currentPage, setCurrentPage] = useState(1);

  const containerRef = useRef<HTMLDivElement | null>(null);
  // Also kept as state (not just a ref) so it can be passed as the Drawer's portal
  // `container`: a bare ref can't trigger the re-render needed to hand the toolbar
  // a real DOM node once it exists.
  const [containerEl, setContainerEl] = useState<HTMLDivElement | null>(null);
  const setRootRef = useCallback((node: HTMLDivElement | null) => {
    containerRef.current = node;
    setContainerEl(node);
  }, []);
  const scrollRef = useRef<HTMLDivElement>(null);
  const pdfRef = useRef<any>(null);
  const renderedRef = useRef<Set<number>>(new Set());
  const pageElsRef = useRef<Map<number, HTMLDivElement>>(new Map());
  /** Pages near the viewport, so a width change redraws only what can be seen. */
  const visibleRef = useRef<Set<number>>(new Set());
  /** The width pages were last drawn at. */
  const renderedWidthRef = useRef<number | null>(null);

  // --- Annotate mode (Pen / Highlighter / Note / Eraser) --------------------
  const canAnnotate = !!annotations;
  const [annotateMode, setAnnotateMode] = useState(false);
  const [tool, setTool] = useState<AnnotationTool>('highlighter');
  const [annotateColor, setAnnotateColor] = useState<string>(ANNOTATION_COLORS[0]);
  const lastCreatedIdRef = useRef<string | null>(null);

  // Leaving annotate mode when the file itself changes, not just re-rendering: a stale
  // "last created" id from a different file must never be undo-able against this one.
  useEffect(() => {
    setAnnotateMode(false);
    lastCreatedIdRef.current = null;
  }, [pdfUrl]);

  const annotationsByPage = useMemo(() => {
    const map = new Map<number, NexusStudyAnnotationDTO[]>();
    for (const a of annotations?.items || []) {
      const list = map.get(a.page_number);
      if (list) list.push(a);
      else map.set(a.page_number, [a]);
    }
    return map;
  }, [annotations?.items]);

  const handleCreateStroke = useCallback(
    async (page: number, kind: 'pen' | 'highlighter', points: NexusStudyAnnotationPoint[]) => {
      const id = await annotations?.onCreateStroke?.(page, kind, points, annotateColor);
      lastCreatedIdRef.current = id || null;
    },
    [annotations, annotateColor],
  );

  const handleCreateNote = useCallback(
    async (page: number, anchor: NexusStudyAnnotationPoint, text: string) => {
      const id = await annotations?.onCreateNote?.(page, anchor, text, annotateColor);
      lastCreatedIdRef.current = id || null;
    },
    [annotations, annotateColor],
  );

  const handleUndo = useCallback(() => {
    if (!lastCreatedIdRef.current) return;
    annotations?.onDelete?.(lastCreatedIdRef.current);
    lastCreatedIdRef.current = null;
  }, [annotations]);

  // --- Load the document ---------------------------------------------------
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    setNumPages(0);
    setPageAspect(null);
    setCurrentPage(1);
    renderedRef.current = new Set();
    pageElsRef.current = new Map();
    visibleRef.current = new Set();
    renderedWidthRef.current = null;

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

        // The first page's shape sizes every placeholder, so pages do not jump as they draw.
        let aspect: number | null = null;
        try {
          const first = await doc.getPage(1);
          const vp = first.getViewport({ scale: 1 });
          aspect = pageAspectRatio(vp.width, vp.height);
        } catch {
          // Placeholders fall back to a fixed height.
        }

        if (cancelled) {
          doc.destroy();
          return;
        }
        pdfRef.current = doc;
        setPageAspect(aspect);
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
        if (host.clientWidth) renderedWidthRef.current = host.clientWidth;
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

        // Emptied and filled in one task, so the placeholder shape never shows in between.
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
            visibleRef.current.add(pageNum);
            renderPage(pageNum);
            if (entry.intersectionRatio > 0.5) onPageChange?.(pageNum);
          } else {
            visibleRef.current.delete(pageNum);
          }
        }
      },
      { root: scrollRef.current, rootMargin: '400px 0px', threshold: [0, 0.5] }
    );
    pageElsRef.current.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [numPages, renderPage, onPageChange]);

  // --- Draw again at the new size when the width changes enough -------------
  // Canvases scale with CSS at once, so nothing jumps; this only makes them sharp.
  // Pages off screen are drawn afresh when they next scroll into view.
  useEffect(() => {
    const el = scrollRef.current;
    if (!numPages || !el || typeof ResizeObserver === 'undefined') return;
    let timer: number | undefined;
    const ro = new ResizeObserver(() => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        const width = pageElsRef.current.get(1)?.clientWidth ?? 0;
        if (!needsRerenderForWidth(renderedWidthRef.current, width)) return;
        renderedRef.current = new Set();
        visibleRef.current.forEach((p) => {
          renderPage(p);
        });
      }, 200);
    });
    ro.observe(el);
    return () => {
      ro.disconnect();
      window.clearTimeout(timer);
    };
  }, [numPages, renderPage]);

  // --- Track the page on screen for the "3 / 12" indicator -------------------
  useEffect(() => {
    const el = scrollRef.current;
    if (!numPages || !el) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      // A hidden reader measures nothing and would report the last page.
      if (!el.clientHeight) return;
      const top = el.getBoundingClientRect().top;
      const tops: number[] = [];
      for (let p = 1; p <= numPages; p++) {
        const host = pageElsRef.current.get(p);
        tops.push(host ? host.getBoundingClientRect().top - top : Number.POSITIVE_INFINITY);
      }
      const page = currentPageFromTops(tops, el.clientHeight);
      if (page) setCurrentPage(page);
    };
    const onScroll = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };
    update();
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      el.removeEventListener('scroll', onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [numPages]);

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
          width: '100%',
          gap: 2,
          p: 3,
          textAlign: 'center',
        }}
      >
        <Typography variant="body2" color="text.secondary">
          {label === 'Slides' ? 'Could not load the slides' : 'Could not load the PDF'}
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
            sx={{ minHeight: 44 }}
          >
            Retry
          </Button>
        )}
      </Box>
    );
  }

  return (
    <Box
      ref={setRootRef}
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
          {label}
        </Typography>
        {numPages > 0 && (
          <Typography
            variant="caption"
            aria-live="polite"
            sx={{ color: 'text.secondary', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', px: 0.5 }}
          >
            <span aria-hidden="true">
              {currentPage} / {numPages}
            </span>
            <Box component="span" sx={visuallyHidden}>
              Page {currentPage} of {numPages}
            </Box>
          </Typography>
        )}
        {canAnnotate && (
          <Tooltip title={annotateMode ? 'Stop marking up' : 'Highlight, underline or add a note'}>
            <IconButton
              size="small"
              color={annotateMode ? 'primary' : 'default'}
              onClick={() => setAnnotateMode((v) => !v)}
              aria-label={annotateMode ? 'Stop marking up' : 'Highlight, underline or add a note'}
              sx={{ width: 40, height: 40 }}
            >
              <EditOutlinedIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        )}
        <Tooltip title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}>
          <IconButton
            size="small"
            onClick={handleFullscreen}
            aria-label={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
            sx={{ width: 40, height: 40 }}
          >
            {isFullscreen ? <FullscreenExitIcon fontSize="small" /> : <FullscreenIcon fontSize="small" />}
          </IconButton>
        </Tooltip>
      </Box>

      {canAnnotate && (
        <PDFAnnotationToolbar
          open={annotateMode}
          container={containerEl}
          tool={tool}
          color={annotateColor}
          canUndo={!!lastCreatedIdRef.current}
          onToolChange={setTool}
          onColorChange={setAnnotateColor}
          onUndo={handleUndo}
          onDone={() => setAnnotateMode(false)}
        />
      )}

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
              {/* Canvas mount: React keeps this empty; pdf.js appends the <canvas> imperatively.
                  While empty it holds the page's shape; once the canvas is in, the canvas sets the height. */}
              <Box
                data-page={pageNum}
                ref={(el: HTMLDivElement | null) => {
                  if (el) pageElsRef.current.set(pageNum, el);
                  else pageElsRef.current.delete(pageNum);
                }}
                sx={{
                  position: 'relative',
                  width: '100%',
                  '&:empty': pageAspect ? { aspectRatio: `${pageAspect}` } : { minHeight: 400 },
                }}
              />
              {annotations && (
                <PDFAnnotationLayer
                  annotations={annotationsByPage.get(pageNum) || []}
                  active={annotateMode}
                  tool={tool}
                  color={annotateColor}
                  onCreateStroke={(kind, points) => handleCreateStroke(pageNum, kind, points)}
                  onCreateNote={(anchor, text) => handleCreateNote(pageNum, anchor, text)}
                  onUpdateNote={(id, text) => annotations.onUpdateNote?.(id, text)}
                  onDelete={(id) => annotations.onDelete?.(id)}
                />
              )}
            </Box>
          ))}
        </Box>
      </Box>
    </Box>
  );
}
