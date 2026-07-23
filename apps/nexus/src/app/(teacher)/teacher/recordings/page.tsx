'use client';

/**
 * Every class that has a recording, searchable and filterable by tag.
 *
 * The payoff for naming and tagging a class at wrap-up. Without this, a term is
 * a hundred rows called "Class by Ar Hari Babu" and finding the one about
 * perspective means scrolling the calendar back through months.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Box,
  Button,
  Chip,
  InputAdornment,
  Skeleton,
  Stack,
  TextField,
  Typography,
  alpha,
  useTheme,
} from '@neram/ui';
import SearchIcon from '@mui/icons-material/Search';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import SmartDisplayOutlinedIcon from '@mui/icons-material/SmartDisplayOutlined';
import VideocamOutlinedIcon from '@mui/icons-material/VideocamOutlined';
import { useRouter } from 'next/navigation';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import { RADIUS, SHADOW, tagSx } from '@/components/timetable/timetable-theme';
import { formatTime } from '@/components/timetable/date-utils';

interface TagRow {
  id: string;
  slug: string;
  label: string;
  group_type: string;
}

interface RecordingRow {
  id: string;
  title: string;
  description: string | null;
  scheduled_date: string;
  start_time: string;
  end_time: string;
  recording_url: string | null;
  youtube_url: string | null;
  teacher?: { name: string | null } | null;
  tags: TagRow[];
}

function formatDay(ymd: string): string {
  const d = new Date(`${ymd}T00:00:00+05:30`);
  if (Number.isNaN(d.getTime())) return ymd;
  return d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

export default function RecordingsPage() {
  const theme = useTheme();
  const router = useRouter();
  const { getToken } = useNexusAuthContext();

  const [rows, setRows] = useState<RecordingRow[] | null>(null);
  const [tags, setTags] = useState<TagRow[]>([]);
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);

  // Typing should not fire a request per keystroke.
  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(async () => {
    setRows(null);
    try {
      const token = await getToken();
      if (!token) return;
      const params = new URLSearchParams();
      if (debounced) params.set('q', debounced);
      if (selectedTags.length) params.set('tags', selectedTags.join(','));
      const res = await fetch(`/api/timetable/recordings?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        setRows([]);
        return;
      }
      const data = await res.json();
      setRows(data.recordings || []);
      // Keep the offered tags stable while filtering, or chips vanish as you
      // narrow and the filter becomes impossible to widen again.
      if (data.tags?.length) setTags(data.tags);
    } catch {
      setRows([]);
    }
  }, [getToken, debounced, selectedTags]);

  useEffect(() => {
    load();
  }, [load]);

  const toggleTag = (id: string) =>
    setSelectedTags((prev) => (prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]));

  const grouped = useMemo(() => {
    const bySubject = tags.filter((t) => t.group_type === 'subject');
    const byTheme = tags.filter((t) => t.group_type === 'theme');
    return { bySubject, byTheme };
  }, [tags]);

  const filtering = selectedTags.length > 0 || !!debounced;

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 900, mx: 'auto' }}>
      <Button
        startIcon={<ArrowBackIcon />}
        onClick={() => router.push('/teacher/timetable')}
        sx={{ textTransform: 'none', minHeight: 44, mb: 1, ml: -1 }}
      >
        Back to timetable
      </Button>

      <Typography variant="h5" sx={{ fontWeight: 800, mb: 0.5 }}>
        Recordings
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Every class with a recording. Search the title and the brief, or narrow by tag.
      </Typography>

      <TextField
        fullWidth
        size="small"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search recordings"
        InputProps={{
          startAdornment: (
            <InputAdornment position="start">
              <SearchIcon sx={{ fontSize: 19, color: 'text.disabled' }} />
            </InputAdornment>
          ),
        }}
        sx={{ mb: 1.5 }}
      />

      {[
        { label: 'Subject', list: grouped.bySubject },
        { label: 'Theme', list: grouped.byTheme },
      ].map(
        (group) =>
          group.list.length > 0 && (
            <Box key={group.label} sx={{ mb: 1.25 }}>
              <Typography variant="caption" color="text.disabled" sx={{ display: 'block', mb: 0.5 }}>
                {group.label}
              </Typography>
              <Box sx={{ display: 'flex', gap: 0.625, flexWrap: 'wrap' }}>
                {group.list.map((t) => {
                  const on = selectedTags.includes(t.id);
                  return (
                    <Chip
                      key={t.id}
                      label={t.label}
                      size="small"
                      onClick={() => toggleTag(t.id)}
                      sx={{
                        height: 32,
                        cursor: 'pointer',
                        fontWeight: on ? 700 : 500,
                        bgcolor: on ? alpha(theme.palette.primary.main, 0.14) : 'transparent',
                        color: on ? 'primary.dark' : 'text.secondary',
                        border: `1px solid ${on ? theme.palette.primary.main : theme.palette.divider}`,
                      }}
                    />
                  );
                })}
              </Box>
            </Box>
          ),
      )}

      {filtering && (
        <Button
          size="small"
          onClick={() => {
            setSelectedTags([]);
            setSearch('');
          }}
          sx={{ textTransform: 'none', minHeight: 40, mb: 1 }}
        >
          Clear filters
        </Button>
      )}

      {rows === null ? (
        <Stack spacing={1} sx={{ mt: 1 }}>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} variant="rounded" height={78} sx={{ borderRadius: 2 }} />
          ))}
        </Stack>
      ) : rows.length === 0 ? (
        <Box
          sx={{
            textAlign: 'center',
            py: 6,
            border: `1.5px dashed ${theme.palette.divider}`,
            borderRadius: RADIUS.card,
            mt: 1,
          }}
        >
          <Typography sx={{ fontWeight: 700 }}>
            {filtering ? 'Nothing matches that' : 'No recordings yet'}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            {filtering
              ? 'Try fewer tags, or a different word.'
              : 'A recording appears here once it is attached to a class, either by the auto-sync or by hand.'}
          </Typography>
        </Box>
      ) : (
        <Stack spacing={1} sx={{ mt: 1 }}>
          <Typography variant="caption" color="text.secondary">
            {rows.length} {rows.length === 1 ? 'recording' : 'recordings'}
          </Typography>
          {rows.map((r) => (
            <Box
              key={r.id}
              sx={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 1.5,
                p: 1.75,
                borderRadius: RADIUS.card,
                border: `1px solid ${theme.palette.divider}`,
                bgcolor: 'background.paper',
                boxShadow: SHADOW.card,
              }}
            >
              <Box
                sx={{
                  width: 34,
                  height: 34,
                  flexShrink: 0,
                  borderRadius: 1.25,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  bgcolor: alpha(theme.palette.primary.main, 0.1),
                  color: 'primary.dark',
                }}
              >
                <SmartDisplayOutlinedIcon sx={{ fontSize: 19 }} />
              </Box>

              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography sx={{ fontWeight: 700, fontSize: '0.9rem', lineHeight: 1.3 }}>
                  {r.title}
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                  {formatDay(r.scheduled_date)}, {formatTime(r.start_time)} to {formatTime(r.end_time)}
                  {r.teacher?.name ? `, ${r.teacher.name}` : ''}
                </Typography>
                {r.description && (
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    sx={{
                      mt: 0.5,
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden',
                    }}
                  >
                    {r.description}
                  </Typography>
                )}
                {r.tags.length > 0 && (
                  <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mt: 0.75 }}>
                    {r.tags.map((t) => (
                      <Box key={t.id} component="span" sx={tagSx(theme, 'primary')}>
                        {t.label}
                      </Box>
                    ))}
                  </Box>
                )}
              </Box>

              <Stack spacing={0.75} sx={{ flexShrink: 0 }}>
                {r.youtube_url && (
                  <Button
                    size="small"
                    variant="outlined"
                    href={r.youtube_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    startIcon={<SmartDisplayOutlinedIcon sx={{ fontSize: 15 }} />}
                    sx={{ textTransform: 'none', minHeight: 40, whiteSpace: 'nowrap' }}
                  >
                    YouTube
                  </Button>
                )}
                {r.recording_url && (
                  <Button
                    size="small"
                    variant="outlined"
                    href={r.recording_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    startIcon={<VideocamOutlinedIcon sx={{ fontSize: 15 }} />}
                    sx={{ textTransform: 'none', minHeight: 40, whiteSpace: 'nowrap' }}
                  >
                    Teams
                  </Button>
                )}
              </Stack>
            </Box>
          ))}
        </Stack>
      )}
    </Box>
  );
}
