'use client';

import { useState, useEffect, useCallback } from 'react';
import { Box, Typography, Skeleton, Alert } from '@neram/ui';
import type { QBRecalledSessionCard } from '@neram/database';
import RecalledSessionCard from './RecalledSessionCard';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';

interface RecalledPaperBrowserProps {
  onSessionClick: (paperId: string, session: string) => void;
}

export default function RecalledPaperBrowser({ onSessionClick }: RecalledPaperBrowserProps) {
  const { getToken } = useNexusAuthContext();
  const [sessions, setSessions] = useState<QBRecalledSessionCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSessions = useCallback(async () => {
    try {
      setLoading(true);
      const token = await getToken();
      const res = await fetch('/api/question-bank/recalled-sessions', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to fetch recalled sessions');
      const json = await res.json();
      setSessions(json.data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  // Group sessions by year
  const sessionsByYear = sessions.reduce<Record<number, QBRecalledSessionCard[]>>((acc, s) => {
    const year = s.paper.year;
    if (!acc[year]) acc[year] = [];
    acc[year].push(s);
    return acc;
  }, {});

  const years = Object.keys(sessionsByYear).map(Number).sort((a, b) => b - a);

  if (error) {
    return <Alert severity="error" sx={{ m: 2 }}>{error}</Alert>;
  }

  return (
    <Box sx={{ pb: 2 }}>
      {loading ? (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, px: { xs: 1.5, md: 2 } }}>
          {[1, 2, 3].map(i => (
            <Skeleton key={i} variant="rounded" height={130} sx={{ borderRadius: 2 }} />
          ))}
        </Box>
      ) : sessions.length === 0 ? (
        <Box sx={{ textAlign: 'center', py: 6 }}>
          <Typography variant="body1" color="text.secondary">
            No recalled papers yet
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Student-recalled questions will appear here after teacher review
          </Typography>
        </Box>
      ) : (
        years.map(year => (
          <Box key={year}>
            <Typography
              variant="overline"
              fontWeight={700}
              color="text.secondary"
              sx={{
                px: { xs: 1.5, md: 2 },
                py: 1,
                display: 'block',
                position: 'sticky',
                top: 0,
                bgcolor: 'background.default',
                zIndex: 1,
              }}
            >
              NATA {year}
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, px: { xs: 1.5, md: 2 } }}>
              {sessionsByYear[year].map(session => (
                <RecalledSessionCard
                  key={session.paper.id}
                  session={session}
                  onClick={() => onSessionClick(session.paper.id, session.paper.session || '')}
                />
              ))}
            </Box>
          </Box>
        ))
      )}
    </Box>
  );
}
