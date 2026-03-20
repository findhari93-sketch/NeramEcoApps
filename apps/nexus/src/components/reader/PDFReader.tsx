'use client';

import { useState, useRef, useEffect } from 'react';
import { Box, Typography, CircularProgress, IconButton, Tooltip } from '@neram/ui';
import FullscreenIcon from '@mui/icons-material/Fullscreen';
import FullscreenExitIcon from '@mui/icons-material/FullscreenExit';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';

interface PDFReaderProps {
  pdfUrl: string;
  initialPage?: number;
  totalPages?: number;
  onPageChange?: (page: number) => void;
  onRetry?: () => void;
}

/**
 * Secure PDF viewer with fullscreen support and download blocking.
 * Uses iframe with toolbar=0 to hide browser PDF controls (download/print).
 */
export default function PDFReader({ pdfUrl, initialPage, onRetry }: PDFReaderProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Build URL: append #toolbar=0 to hide Chrome PDF viewer toolbar (download/print buttons)
  const buildSrc = () => {
    const pageParam = initialPage && initialPage > 1 ? `&page=${initialPage}` : '';
    // toolbar=0 hides the native PDF viewer controls (download, print, etc.)
    const hasQuery = pdfUrl.includes('?');
    const base = pdfUrl;
    return `${base}#toolbar=0&navpanes=0${pageParam ? `&page=${initialPage}` : ''}`;
  };

  const src = buildSrc();

  // Fullscreen toggle
  const handleFullscreen = async () => {
    if (!containerRef.current) return;
    if (document.fullscreenElement) {
      await document.exitFullscreen();
    } else {
      await containerRef.current.requestFullscreen();
    }
  };

  // Track fullscreen changes
  useEffect(() => {
    const handleFsChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
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
        <Box sx={{ display: 'flex', gap: 1 }}>
          {onRetry && (
            <IconButton
              size="small"
              onClick={() => {
                setError(false);
                setLoading(true);
                onRetry();
              }}
            >
              Retry
            </IconButton>
          )}
        </Box>
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
        bgcolor: isFullscreen ? '#525659' : 'background.default',
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

      {/* PDF iframe — sandbox prevents downloads, toolbar=0 hides Chrome PDF controls */}
      <iframe
        src={src}
        onLoad={() => setLoading(false)}
        onError={() => {
          setLoading(false);
          setError(true);
        }}
        sandbox="allow-same-origin allow-scripts"
        style={{
          width: '100%',
          height: 'calc(100% - 40px)',
          border: 'none',
        }}
        title="PDF Reader"
      />
    </Box>
  );
}
