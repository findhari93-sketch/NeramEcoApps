'use client';

import { useState } from 'react';
import { Box, Typography, CircularProgress, Button } from '@neram/ui';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';

interface PDFReaderProps {
  pdfUrl: string;
  initialPage?: number;
  totalPages?: number;
  onPageChange?: (page: number) => void;
  onRetry?: () => void;
}

/**
 * Native browser PDF viewer using <iframe>.
 * Provides pinch-to-zoom, swipe, search, and all standard PDF features
 * via the browser's built-in PDF renderer (Chrome PDF Viewer, etc.).
 */
export default function PDFReader({ pdfUrl, initialPage, onRetry }: PDFReaderProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  // Append #page=N for browsers that support it (Chrome, Edge, Firefox)
  const src = initialPage && initialPage > 1
    ? `${pdfUrl}#page=${initialPage}`
    : pdfUrl;

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
          <Button
            size="small"
            variant="text"
            href={pdfUrl}
            target="_blank"
            rel="noopener noreferrer"
            startIcon={<OpenInNewIcon />}
          >
            Open PDF
          </Button>
        </Box>
      </Box>
    );
  }

  return (
    <Box sx={{ position: 'relative', width: '100%', height: '100%' }}>
      {loading && (
        <Box
          sx={{
            position: 'absolute',
            inset: 0,
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
      <iframe
        src={src}
        onLoad={() => setLoading(false)}
        onError={() => {
          setLoading(false);
          setError(true);
        }}
        style={{
          width: '100%',
          height: '100%',
          border: 'none',
        }}
        title="PDF Reader"
      />
    </Box>
  );
}
