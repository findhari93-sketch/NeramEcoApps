'use client';

import { useState, useEffect } from 'react';
import { Box, Typography, Chip, IconButton } from '@neram/ui';
import CloseIcon from '@mui/icons-material/Close';
import AccessTimeIcon from '@mui/icons-material/AccessTime';

interface DateItem {
  id: string;
  title: Record<string, string>;
  description: Record<string, string>;
  metadata: {
    target_date: string;
    original_date?: string | null;
    is_extended?: boolean;
    event_type: string;
  };
}

function calculateTimeLeft(targetDate: string) {
  const diff = new Date(targetDate).getTime() - Date.now();
  if (diff <= 0) return null;
  return {
    days: Math.floor(diff / (1000 * 60 * 60 * 24)),
    hours: Math.floor((diff / (1000 * 60 * 60)) % 24),
    minutes: Math.floor((diff / (1000 * 60)) % 60),
    seconds: Math.floor((diff / 1000) % 60),
  };
}

export default function ImportantDateBanner({ locale = 'en' }: { locale?: string }) {
  const [dateItem, setDateItem] = useState<DateItem | null>(null);
  const [timeLeft, setTimeLeft] = useState<ReturnType<typeof calculateTimeLeft>>(null);
  const [dismissed, setDismissed] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    async function fetchDate() {
      try {
        const res = await fetch('/api/marketing-content?type=important_date&limit=1&pinnedOnly=false');
        const json = await res.json();
        const items = json.content || [];
        if (items.length > 0) {
          setDateItem(items[0]);
        }
      } catch {
        // Silently fail - banner is non-critical
      } finally {
        setLoaded(true);
      }
    }
    fetchDate();
  }, []);

  useEffect(() => {
    if (!dateItem) return;
    const update = () => setTimeLeft(calculateTimeLeft(dateItem.metadata.target_date));
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [dateItem]);

  if (!loaded || !dateItem || !timeLeft || dismissed) return null;

  const title = dateItem.title?.[locale] || dateItem.title?.en || '';
  const isUrgent = timeLeft.days < 3;

  return (
    <Box
      sx={{
        bgcolor: isUrgent ? 'error.main' : 'primary.main',
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
      <AccessTimeIcon sx={{ fontSize: 18, display: { xs: 'none', sm: 'block' } }} />

      <Typography variant="body2" fontWeight={600} sx={{ textAlign: 'center' }}>
        {title}
      </Typography>

      {dateItem.metadata.is_extended && (
        <Chip
          label="Extended!"
          size="small"
          sx={{
            bgcolor: 'rgba(255,255,255,0.2)',
            color: 'white',
            fontWeight: 700,
            fontSize: 11,
            height: 22,
          }}
        />
      )}

      {/* Compact countdown */}
      <Typography
        variant="body2"
        fontWeight={800}
        sx={{
          fontFamily: 'monospace',
          bgcolor: 'rgba(0,0,0,0.15)',
          px: 1.5,
          py: 0.5,
          borderRadius: 1,
          fontSize: { xs: 12, sm: 14 },
        }}
      >
        {timeLeft.days}d {String(timeLeft.hours).padStart(2, '0')}h{' '}
        {String(timeLeft.minutes).padStart(2, '0')}m{' '}
        {String(timeLeft.seconds).padStart(2, '0')}s
      </Typography>

      {/* Original date strikethrough */}
      {dateItem.metadata.is_extended && dateItem.metadata.original_date && (
        <Typography
          variant="caption"
          sx={{
            textDecoration: 'line-through',
            opacity: 0.7,
            display: { xs: 'none', md: 'inline' },
          }}
        >
          Was: {new Date(dateItem.metadata.original_date).toLocaleDateString('en-IN', {
            day: 'numeric',
            month: 'short',
          })}
        </Typography>
      )}

      {/* Dismiss button */}
      <IconButton
        size="small"
        onClick={() => setDismissed(true)}
        sx={{
          color: 'white',
          position: { xs: 'absolute', sm: 'static' },
          right: 8,
          top: '50%',
          transform: { xs: 'translateY(-50%)', sm: 'none' },
          '&:hover': { bgcolor: 'rgba(255,255,255,0.15)' },
        }}
      >
        <CloseIcon sx={{ fontSize: 18 }} />
      </IconButton>
    </Box>
  );
}
