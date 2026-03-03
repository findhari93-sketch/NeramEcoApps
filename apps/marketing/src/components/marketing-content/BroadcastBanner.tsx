'use client';

import { useState, useEffect } from 'react';
import { Box, Typography, IconButton } from '@neram/ui';
import CloseIcon from '@mui/icons-material/Close';
import CampaignIcon from '@mui/icons-material/Campaign';

interface BroadcastItem {
  id: string;
  title: Record<string, string>;
  description: Record<string, string>;
  metadata: {
    link_url?: string | null;
    link_text?: string | null;
    style?: 'info' | 'success' | 'warning' | 'urgent';
  };
}

const styleColors: Record<string, string> = {
  info: 'primary.main',
  success: 'success.main',
  warning: 'warning.main',
  urgent: 'error.main',
};

export default function BroadcastBanner({ locale = 'en' }: { locale?: string }) {
  const [broadcast, setBroadcast] = useState<BroadcastItem | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    async function fetchBroadcast() {
      try {
        const res = await fetch('/api/marketing-content?type=broadcast&limit=1&pinnedOnly=false');
        const json = await res.json();
        const items = json.content || [];
        if (items.length > 0) {
          setBroadcast(items[0]);
        }
      } catch {
        // Silently fail - banner is non-critical
      } finally {
        setLoaded(true);
      }
    }
    fetchBroadcast();
  }, []);

  if (!loaded || !broadcast || dismissed) return null;

  const title = broadcast.title?.[locale] || broadcast.title?.en || '';
  const style = broadcast.metadata?.style || 'info';
  const bgcolor = styleColors[style] || styleColors.info;
  const linkUrl = broadcast.metadata?.link_url;
  const linkText = broadcast.metadata?.link_text || 'Learn more';

  return (
    <Box
      sx={{
        bgcolor,
        color: 'white',
        py: { xs: 1, sm: 1.5 },
        px: 2,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: { xs: 1, sm: 2 },
        flexWrap: 'wrap',
        position: 'relative',
        zIndex: 1100,
      }}
    >
      <CampaignIcon sx={{ fontSize: 20, display: { xs: 'none', sm: 'block' } }} />

      <Typography
        variant="body2"
        fontWeight={600}
        sx={{
          textAlign: 'center',
          maxWidth: { xs: 'calc(100% - 48px)', sm: 'none' },
        }}
      >
        {title}
        {linkUrl && (
          <>
            {' '}
            <Box
              component="a"
              href={linkUrl}
              target="_blank"
              rel="noopener noreferrer"
              sx={{
                color: 'white',
                fontWeight: 700,
                textDecoration: 'underline',
                '&:hover': { opacity: 0.85 },
              }}
            >
              {linkText}
            </Box>
          </>
        )}
      </Typography>

      <IconButton
        size="small"
        onClick={() => setDismissed(true)}
        aria-label="Dismiss banner"
        sx={{
          color: 'white',
          position: { xs: 'absolute', sm: 'static' },
          right: 8,
          top: '50%',
          transform: { xs: 'translateY(-50%)', sm: 'none' },
          '&:hover': { bgcolor: 'rgba(255,255,255,0.15)' },
          minWidth: 48,
          minHeight: 48,
        }}
      >
        <CloseIcon sx={{ fontSize: 18 }} />
      </IconButton>
    </Box>
  );
}
