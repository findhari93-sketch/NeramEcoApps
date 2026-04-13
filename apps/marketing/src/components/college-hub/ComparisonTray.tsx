'use client';

import { useState, useEffect } from 'react';
import { Box, Button, Typography, Stack, Chip, Paper } from '@mui/material';
import CompareArrowsIcon from '@mui/icons-material/CompareArrows';
import CloseIcon from '@mui/icons-material/Close';
import { getCompareList, removeFromCompare } from './CompareButton';
import { useRouter } from 'next/navigation';

export default function ComparisonTray() {
  const [list, setList] = useState<string[]>([]);
  const router = useRouter();

  const refresh = () => setList(getCompareList());

  useEffect(() => {
    refresh();
    window.addEventListener('compare-updated', refresh);
    return () => window.removeEventListener('compare-updated', refresh);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (list.length === 0) return null;

  return (
    <Paper
      elevation={8}
      sx={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 1200,
        p: 2,
        borderTopLeftRadius: 16,
        borderTopRightRadius: 16,
        bgcolor: '#1e293b',
        color: 'white',
      }}
    >
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        flexWrap="wrap"
        gap={1}
      >
        <Stack direction="row" alignItems="center" gap={2} flexWrap="wrap">
          <CompareArrowsIcon sx={{ color: '#60a5fa' }} />
          <Typography variant="body2" fontWeight={600}>
            Comparing {list.length}/3
          </Typography>
          <Stack direction="row" gap={1} flexWrap="wrap">
            {list.map((slug) => (
              <Chip
                key={slug}
                label={slug
                  .replace(/-architecture$/, '')
                  .replace(/-/g, ' ')
                  .replace(/\b\w/g, (c) => c.toUpperCase())}
                size="small"
                onDelete={() => {
                  removeFromCompare(slug);
                  refresh();
                  window.dispatchEvent(new Event('compare-updated'));
                }}
                deleteIcon={<CloseIcon sx={{ fontSize: '14px !important' }} />}
                sx={{
                  bgcolor: '#334155',
                  color: 'white',
                  '& .MuiChip-deleteIcon': { color: '#94a3b8' },
                }}
              />
            ))}
          </Stack>
        </Stack>
        <Button
          variant="contained"
          size="small"
          disabled={list.length < 2}
          onClick={() => router.push(`/colleges/compare?slugs=${list.join(',')}`)}
          sx={{ bgcolor: '#2563eb', whiteSpace: 'nowrap' }}
        >
          Compare Now
        </Button>
      </Stack>
    </Paper>
  );
}
