'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Box, Typography, IconButton } from '@neram/ui';
import CloseIcon from '@mui/icons-material/Close';
import CampaignOutlinedIcon from '@mui/icons-material/CampaignOutlined';
import { tokens as t } from '@/design-system';
import { useDismiss } from './useDismiss';

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

const CSS_VAR = '--broadcast-banner-height';

function setBannerHeight(height: number) {
  document.documentElement.style.setProperty(CSS_VAR, `${height}px`);
}

function clearBannerHeight() {
  document.documentElement.style.setProperty(CSS_VAR, '0px');
}

export default function BroadcastBanner({ locale = 'en' }: { locale?: string }) {
  const [broadcast, setBroadcast] = useState<BroadcastItem | null>(null);
  const [loaded, setLoaded] = useState(false);
  const bannerRef = useRef<HTMLDivElement>(null);

  // Persistent 24-hour dismissal
  const [dismissed, dismiss] = useDismiss('broadcast', broadcast?.id ?? null);

  useEffect(() => {
    async function fetchBroadcast() {
      try {
        const res = await fetch('/api/marketing-content?type=broadcast&limit=1&pinnedOnly=false');
        const json = await res.json();
        const items = json.content || [];
        if (items.length > 0) {
          setBroadcast(items[0] as BroadcastItem);
        }
      } catch {
        // Silently fail - banner is non-critical
      } finally {
        setLoaded(true);
      }
    }
    fetchBroadcast();
  }, []);

  // Measure banner height and set CSS variable so the Header can offset itself
  useEffect(() => {
    if (!bannerRef.current) {
      clearBannerHeight();
      return;
    }
    const el = bannerRef.current;
    const observer = new ResizeObserver(() => {
      setBannerHeight(el.offsetHeight);
    });
    setBannerHeight(el.offsetHeight);
    observer.observe(el);
    return () => {
      observer.disconnect();
      clearBannerHeight();
    };
  }, [broadcast, dismissed]);

  const handleDismiss = useCallback(() => {
    clearBannerHeight();
    dismiss();
  }, [dismiss]);

  if (!loaded || !broadcast || dismissed) return null;

  const title = broadcast.title?.[locale] || broadcast.title?.en || '';
  const linkUrl = broadcast.metadata?.link_url;
  const linkText = broadcast.metadata?.link_text || 'Learn more';

  // Design handoff: one gold banner for every broadcast (navy text on gold500 is 8.6:1).
  return (
    <Box
      ref={bannerRef}
      role="region"
      aria-label="Announcement"
      sx={{
        bgcolor: t.gold500,
        color: t.navy900,
        minHeight: 44,
        py: 1.25,
        pl: 2,
        pr: 6,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 1.25,
        boxSizing: 'border-box',
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 1400,
      }}
    >
      <CampaignOutlinedIcon aria-hidden sx={{ fontSize: 20, flexShrink: 0 }} />

      <Typography sx={{ m: 0, fontSize: 14, fontWeight: 600, lineHeight: 1.35, color: 'inherit' }}>
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
                color: 'inherit',
                fontWeight: 700,
                textDecoration: 'underline',
                textUnderlineOffset: '2px',
                '&:focus-visible': { outline: `2px solid ${t.navy900}`, outlineOffset: 2 },
              }}
            >
              {linkText}
            </Box>
          </>
        )}
      </Typography>

      <IconButton
        onClick={handleDismiss}
        aria-label="Dismiss banner"
        sx={{
          position: 'absolute',
          right: 4,
          top: '50%',
          transform: 'translateY(-50%)',
          width: 40,
          height: 40,
          color: 'inherit',
          borderRadius: `${t.radius}px`,
          '&:hover': { bgcolor: 'rgba(6,13,31,0.08)' },
          '&.Mui-focusVisible': { outline: `2px solid ${t.navy900}` },
        }}
      >
        <CloseIcon sx={{ fontSize: 20 }} />
      </IconButton>
    </Box>
  );
}
