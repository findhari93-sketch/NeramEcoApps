'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Box,
  Typography,
  Collapse,
  IconButton,
  alpha,
  useTheme,
  Chip,
  Skeleton,
} from '@neram/ui';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import SubtitlesOutlinedIcon from '@mui/icons-material/SubtitlesOutlined';
import type { TranscriptEntry } from '@neram/database/types';

interface TranscriptProps {
  chapterId: string;
  currentTime: number;
  getToken: () => Promise<string | null>;
  onSeek: (seconds: number) => void;
}

export default function Transcript({ chapterId, currentTime, getToken, onSeek }: TranscriptProps) {
  const theme = useTheme();
  const [entries, setEntries] = useState<TranscriptEntry[]>([]);
  const [languages, setLanguages] = useState<string[]>([]);
  const [selectedLang, setSelectedLang] = useState('en');
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const activeEntryRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const autoScrollEnabled = useRef(true);

  const fetchTranscript = useCallback(async (lang: string) => {
    setLoading(true);
    try {
      const token = await getToken();
      if (!token) return;
      const res = await fetch(
        `/api/foundation/chapters/${chapterId}/transcript?lang=${lang}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (res.ok) {
        const data = await res.json();
        setEntries(data.entries || []);
        setLanguages(data.available_languages || []);
        setLoaded(true);
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [chapterId, getToken]);

  // Fetch when expanded for the first time
  useEffect(() => {
    if (expanded && !loaded) {
      fetchTranscript(selectedLang);
    }
  }, [expanded, loaded, selectedLang, fetchTranscript]);

  // Auto-scroll to active entry
  useEffect(() => {
    if (expanded && autoScrollEnabled.current && activeEntryRef.current && scrollContainerRef.current) {
      const container = scrollContainerRef.current;
      const entry = activeEntryRef.current;
      const containerRect = container.getBoundingClientRect();
      const entryRect = entry.getBoundingClientRect();

      // Only scroll if entry is not visible
      if (entryRect.top < containerRect.top || entryRect.bottom > containerRect.bottom) {
        entry.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }, [currentTime, expanded]);

  // Pause auto-scroll when user manually scrolls, re-enable after 5s
  const handleScroll = useCallback(() => {
    autoScrollEnabled.current = false;
    const timer = setTimeout(() => {
      autoScrollEnabled.current = true;
    }, 5000);
    return () => clearTimeout(timer);
  }, []);

  const handleLangChange = (lang: string) => {
    setSelectedLang(lang);
    setLoaded(false);
    fetchTranscript(lang);
  };

  const formatTimestamp = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  // Find the active entry based on current time
  const activeIndex = entries.findIndex(
    (e) => currentTime >= e.start && currentTime < e.end
  );

  const langLabel: Record<string, string> = {
    en: 'English',
    ta: 'Tamil',
    hi: 'Hindi',
    te: 'Telugu',
    kn: 'Kannada',
    ml: 'Malayalam',
  };

  return (
    <Box sx={{ mt: 2 }}>
      {/* Toggle header */}
      <Box
        onClick={() => setExpanded(!expanded)}
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          cursor: 'pointer',
          py: 1,
          px: 1.5,
          borderRadius: 2,
          bgcolor: alpha(theme.palette.primary.main, 0.04),
          border: `1px solid ${alpha(theme.palette.primary.main, 0.1)}`,
          '&:hover': { bgcolor: alpha(theme.palette.primary.main, 0.08) },
          transition: 'background-color 150ms',
        }}
      >
        <SubtitlesOutlinedIcon sx={{ fontSize: '1.1rem', color: 'text.secondary' }} />
        <Typography variant="body2" sx={{ fontWeight: 600, flex: 1, fontSize: '0.85rem' }}>
          Transcript
        </Typography>
        {languages.length > 0 && (
          <Chip
            label={langLabel[selectedLang] || selectedLang}
            size="small"
            sx={{ height: 22, fontSize: '0.7rem' }}
          />
        )}
        <IconButton size="small" sx={{ p: 0.25 }}>
          {expanded ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
        </IconButton>
      </Box>

      <Collapse in={expanded}>
        <Box sx={{ mt: 1 }}>
          {/* Language chips */}
          {languages.length > 1 && (
            <Box sx={{ display: 'flex', gap: 0.5, mb: 1, flexWrap: 'wrap' }}>
              {languages.map((lang) => (
                <Chip
                  key={lang}
                  label={langLabel[lang] || lang}
                  size="small"
                  variant={lang === selectedLang ? 'filled' : 'outlined'}
                  color={lang === selectedLang ? 'primary' : 'default'}
                  onClick={() => handleLangChange(lang)}
                  sx={{ fontSize: '0.75rem', cursor: 'pointer' }}
                />
              ))}
            </Box>
          )}

          {/* Transcript entries */}
          {loading ? (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} variant="rectangular" height={32} sx={{ borderRadius: 1 }} />
              ))}
            </Box>
          ) : entries.length === 0 ? (
            <Typography variant="body2" sx={{ color: 'text.disabled', py: 2, textAlign: 'center', fontSize: '0.85rem' }}>
              No transcript available for this chapter yet.
            </Typography>
          ) : (
            <Box
              ref={scrollContainerRef}
              onScroll={handleScroll}
              sx={{
                maxHeight: 300,
                overflow: 'auto',
                borderRadius: 1.5,
                border: `1px solid ${theme.palette.divider}`,
              }}
            >
              {entries.map((entry, idx) => {
                const isActive = idx === activeIndex;
                return (
                  <Box
                    key={idx}
                    ref={isActive ? activeEntryRef : undefined}
                    onClick={() => onSeek(entry.start)}
                    sx={{
                      display: 'flex',
                      gap: 1.5,
                      px: 1.5,
                      py: 0.75,
                      cursor: 'pointer',
                      bgcolor: isActive
                        ? alpha(theme.palette.primary.main, 0.08)
                        : 'transparent',
                      borderLeft: isActive
                        ? `3px solid ${theme.palette.primary.main}`
                        : '3px solid transparent',
                      '&:hover': {
                        bgcolor: alpha(theme.palette.primary.main, 0.04),
                      },
                      transition: 'background-color 150ms',
                    }}
                  >
                    <Typography
                      variant="caption"
                      sx={{
                        fontFamily: 'monospace',
                        color: isActive ? theme.palette.primary.main : 'text.secondary',
                        fontWeight: isActive ? 700 : 400,
                        minWidth: 36,
                        flexShrink: 0,
                        pt: 0.1,
                        fontSize: '0.7rem',
                      }}
                    >
                      {formatTimestamp(entry.start)}
                    </Typography>
                    <Typography
                      variant="body2"
                      sx={{
                        fontSize: '0.8rem',
                        lineHeight: 1.5,
                        color: isActive ? 'text.primary' : 'text.secondary',
                        fontWeight: isActive ? 500 : 400,
                      }}
                    >
                      {entry.text}
                    </Typography>
                  </Box>
                );
              })}
            </Box>
          )}
        </Box>
      </Collapse>
    </Box>
  );
}
