'use client';

import { Box } from '@neram/ui';
import { useEffect } from 'react';

interface ProtectedContentProps {
  children: React.ReactNode;
  disableScreenshot?: boolean;
}

/**
 * Wrapper that prevents content copying, screenshots, and printing.
 * Used for protecting paid educational content (videos, PDFs, etc.)
 */
export default function ProtectedContent({
  children,
  disableScreenshot = false,
}: ProtectedContentProps) {
  useEffect(() => {
    // Disable right-click context menu
    const handleContextMenu = (e: Event) => e.preventDefault();
    document.addEventListener('contextmenu', handleContextMenu);

    // Disable PrintScreen and common screenshot shortcuts
    const handleKeydown = (e: KeyboardEvent) => {
      if (e.key === 'PrintScreen') {
        e.preventDefault();
      }
      // Ctrl+P (print), Ctrl+S (save), Ctrl+Shift+S
      if (e.ctrlKey && (e.key === 'p' || e.key === 's')) {
        e.preventDefault();
      }
      // Ctrl+Shift+I (dev tools)
      if (e.ctrlKey && e.shiftKey && e.key === 'I') {
        e.preventDefault();
      }
    };

    if (disableScreenshot) {
      document.addEventListener('keydown', handleKeydown);
    }

    return () => {
      document.removeEventListener('contextmenu', handleContextMenu);
      if (disableScreenshot) {
        document.removeEventListener('keydown', handleKeydown);
      }
    };
  }, [disableScreenshot]);

  return (
    <Box
      sx={{
        userSelect: 'none',
        WebkitUserSelect: 'none',
        WebkitTouchCallout: 'none',
        '@media print': {
          display: 'none !important',
        },
      }}
    >
      {children}
    </Box>
  );
}
