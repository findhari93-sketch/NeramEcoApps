'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { alpha } from '@mui/material/styles';
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  InputAdornment,
  Skeleton,
  TextField,
  Tooltip,
  Typography,
} from '@neram/ui';
import PlayCircleOutlineIcon from '@mui/icons-material/PlayCircleOutline';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import OpenInFullIcon from '@mui/icons-material/OpenInFull';
import CloseIcon from '@mui/icons-material/Close';
import SearchIcon from '@mui/icons-material/Search';
import MyLocationIcon from '@mui/icons-material/MyLocation';
import SubjectIcon from '@mui/icons-material/Subject';
import { FOCUS_RING } from '@/components/ops/OpsUi';
import { cueClock, type DemoCue, type DemoTranscriptStats } from '@/lib/demo/demo-transcript';

type Video = { url: string | null; error: string | null; loading: boolean };
type Transcript = { cues: DemoCue[]; stats: DemoTranscriptStats | null; error: string | null; loading: boolean };

const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** Index of the cue playing at `t` (last cue that started at or before it), -1 before the first. */
function cueAt(cues: DemoCue[], t: number): number {
  let lo = 0;
  let hi = cues.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (cues[mid].start <= t) {
      found = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return found;
}

/**
 * Video and transcript side by side (wide) or stacked (the desk panel).
 * Clicking a line plays from there; the playing line is highlighted and kept
 * in view until the reader scrolls on their own.
 */
function Player({
  video,
  transcript,
  canPlay,
  wide,
  startAt,
  onLoadVideo,
  onTime,
}: {
  video: Video | null;
  transcript: Transcript | null;
  canPlay: boolean;
  wide: boolean;
  startAt: number;
  onLoadVideo: () => void;
  onTime?: (t: number) => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  // Where to start once the video loads; `play` only when a transcript line asked for it.
  const pendingSeek = useRef<{ t: number; play: boolean } | null>(startAt > 0 ? { t: startAt, play: false } : null);
  const [active, setActive] = useState(-1);
  const [follow, setFollow] = useState(true);
  const [query, setQuery] = useState('');
  const cues = useMemo(() => transcript?.cues ?? [], [transcript]);
  const staff = useMemo(() => new Set((transcript?.stats?.speakers ?? []).filter((s) => s.staff).map((s) => s.name)), [transcript]);
  const q = query.trim().toLowerCase();
  const shown = useMemo(
    () => cues.map((c, i) => ({ c, i })).filter(({ c }) => !q || c.text.toLowerCase().includes(q) || (c.speaker ?? '').toLowerCase().includes(q)),
    [cues, q],
  );

  const seek = (t: number) => {
    setFollow(true);
    setQuery('');
    const v = videoRef.current;
    if (v && v.readyState >= 1) {
      v.currentTime = t;
      void v.play().catch(() => undefined);
    } else {
      pendingSeek.current = { t, play: true };
      if (!video?.url && !video?.loading) onLoadVideo();
    }
  };

  // Keep the playing line in view, inside the list only (never scroll the page).
  useEffect(() => {
    if (!follow || q || active < 0 || !listRef.current) return;
    const list = listRef.current;
    const row = list.querySelector<HTMLElement>(`[data-cue="${active}"]`);
    if (!row) return;
    const top = row.offsetTop - list.offsetTop;
    if (top < list.scrollTop || top + row.offsetHeight > list.scrollTop + list.clientHeight) {
      list.scrollTo({ top: Math.max(0, top - list.clientHeight / 3), behavior: reducedMotion() ? 'auto' : 'smooth' });
    }
  }, [active, follow, q]);

  const stats = transcript?.stats;
  const totalWords = stats ? stats.staffWords + stats.guestWords : 0;

  return (
    <Box sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: wide ? { xs: '1fr', md: 'minmax(0, 3fr) minmax(0, 2fr)' } : '1fr', alignItems: 'start' }}>
      {/* Video */}
      {canPlay && (
        <Box>
          {video?.url ? (
            <Box
              component="video"
              ref={videoRef}
              src={video.url}
              controls
              playsInline
              preload="metadata"
              onLoadedMetadata={() => {
                const p = pendingSeek.current;
                if (p && videoRef.current) {
                  videoRef.current.currentTime = p.t;
                  pendingSeek.current = null;
                  if (p.play) void videoRef.current.play().catch(() => undefined);
                }
              }}
              onTimeUpdate={() => {
                const t = videoRef.current?.currentTime ?? 0;
                onTime?.(t);
                setActive(cueAt(cues, t));
              }}
              sx={{ display: 'block', width: '100%', borderRadius: 1.5, bgcolor: 'common.black', aspectRatio: '16 / 9' }}
            />
          ) : (
            <Box
              sx={{
                aspectRatio: '16 / 9',
                borderRadius: 1.5,
                bgcolor: (t) => alpha(t.palette.text.primary, 0.06),
                display: 'grid',
                placeItems: 'center',
              }}
            >
              <Button
                variant="contained"
                startIcon={<PlayCircleOutlineIcon />}
                onClick={onLoadVideo}
                disabled={video?.loading}
                sx={{ minHeight: 44, ...FOCUS_RING }}
              >
                {video?.loading ? 'Loading the video' : 'Watch the demo'}
              </Button>
            </Box>
          )}
          {video?.error && (
            <Alert severity="error" sx={{ mt: 1 }} role="alert">
              {video.error}
            </Alert>
          )}
        </Box>
      )}

      {/* Transcript */}
      <Box sx={{ minWidth: 0 }}>
        {transcript?.loading && (
          <Box aria-busy="true" aria-label="Loading the transcript">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} height={44} />
            ))}
          </Box>
        )}
        {transcript?.error && (
          <Typography variant="body2" color="text.secondary">
            {transcript.error}
          </Typography>
        )}
        {cues.length > 0 && (
          <>
            {stats && (
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                {stats.minutes} min of talk. The student said {stats.guestWords} words
                {totalWords ? ` (${Math.round((stats.guestWords / totalWords) * 100)}% of the conversation)` : ''}.
              </Typography>
            )}
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', mb: 1 }}>
              <TextField
                size="small"
                fullWidth
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search the transcript"
                inputProps={{ 'aria-label': 'Search the transcript' }}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon fontSize="small" aria-hidden />
                    </InputAdornment>
                  ),
                }}
              />
              {!follow && !q && active >= 0 && (
                <Tooltip title="Back to the line playing now">
                  <IconButton aria-label="Back to the line playing now" onClick={() => setFollow(true)} sx={{ width: 44, height: 44, ...FOCUS_RING }}>
                    <MyLocationIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              )}
            </Box>
            {q && (
              <Typography variant="caption" color="text.secondary" aria-live="polite" sx={{ display: 'block', mb: 0.5 }}>
                {shown.length} {shown.length === 1 ? 'line' : 'lines'} match
              </Typography>
            )}
            <Box
              ref={listRef}
              role="list"
              aria-label="Transcript"
              onWheel={() => setFollow(false)}
              onTouchMove={() => setFollow(false)}
              sx={{
                maxHeight: wide ? { xs: 360, md: 'min(62vh, 560px)' } : 360,
                overflowY: 'auto',
                border: 1,
                borderColor: 'divider',
                borderRadius: 1.5,
                position: 'relative',
              }}
            >
              {shown.map(({ c, i }) => {
                const isStaff = c.speaker ? staff.has(c.speaker) : false;
                const isActive = i === active;
                return (
                  <Box role="listitem" key={i} data-cue={i}>
                    <Box
                      component={canPlay ? 'button' : 'div'}
                      type={canPlay ? 'button' : undefined}
                      onClick={canPlay ? () => seek(c.start) : undefined}
                      aria-current={isActive ? 'true' : undefined}
                      aria-label={canPlay ? `Play from ${cueClock(c.start)}, ${c.speaker ?? 'Unknown speaker'}: ${c.text}` : undefined}
                      sx={{
                        display: 'grid',
                        gridTemplateColumns: '52px 1fr',
                        gap: 1,
                        width: '100%',
                        textAlign: 'left',
                        border: 0,
                        borderLeft: 3,
                        borderLeftColor: isActive ? 'primary.main' : 'transparent',
                        bgcolor: (t) => (isActive ? alpha(t.palette.primary.main, 0.08) : 'transparent'),
                        px: 1.25,
                        py: 1,
                        minHeight: 44,
                        font: 'inherit',
                        color: 'text.primary',
                        cursor: canPlay ? 'pointer' : 'default',
                        transition: 'background-color 150ms',
                        '&:hover': canPlay ? { bgcolor: (t) => alpha(t.palette.primary.main, isActive ? 0.12 : 0.04) } : undefined,
                        ...FOCUS_RING,
                      }}
                    >
                      <Typography variant="caption" color="text.secondary" sx={{ fontVariantNumeric: 'tabular-nums', pt: 0.25 }}>
                        {cueClock(c.start)}
                      </Typography>
                      <Box sx={{ minWidth: 0 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap' }}>
                          <Typography variant="body2" fontWeight={700} color={isStaff ? 'text.primary' : 'primary.main'}>
                            {c.speaker ?? 'Unknown speaker'}
                          </Typography>
                          {c.speaker && (
                            <Typography variant="caption" color="text.secondary">
                              {isStaff ? 'Team' : 'Student'}
                            </Typography>
                          )}
                        </Box>
                        <Typography variant="body2" sx={{ lineHeight: 1.55, overflowWrap: 'anywhere' }}>
                          {c.text}
                        </Typography>
                      </Box>
                    </Box>
                  </Box>
                );
              })}
              {!shown.length && (
                <Typography variant="body2" color="text.secondary" sx={{ p: 1.5 }}>
                  No line matches &quot;{query}&quot;.
                </Typography>
              )}
            </Box>
          </>
        )}
      </Box>
    </Box>
  );
}

/**
 * Watch the demo and read what was said, inside Admin. The video plays
 * through a short-lived Graph link (/api/demo-requests/[id]/recording); the
 * transcript comes from demo_transcripts. Both load only when asked for.
 */
export default function DemoReview({
  id,
  name,
  hasRecording,
  hasTranscript,
  webUrl,
}: {
  id: string;
  name: string;
  hasRecording: boolean;
  hasTranscript: boolean;
  webUrl: string | null;
}) {
  const [video, setVideo] = useState<Video | null>(null);
  const [transcript, setTranscript] = useState<Transcript | null>(null);
  const [full, setFull] = useState(false);
  const time = useRef(0);

  // A new demo selected in the desk: start clean.
  useEffect(() => {
    setVideo(null);
    setTranscript(null);
    setFull(false);
    time.current = 0;
  }, [id]);

  const loadVideo = useCallback(async () => {
    setVideo({ url: null, error: null, loading: true });
    try {
      const res = await fetch(`/api/demo-requests/${id}/recording`, { cache: 'no-store' });
      const body = await res.json();
      setVideo(res.ok ? { url: body.url, error: null, loading: false } : { url: null, error: body.error || 'Could not load the video.', loading: false });
    } catch {
      setVideo({ url: null, error: 'Could not reach Admin. Try again.', loading: false });
    }
  }, [id]);

  const loadTranscript = useCallback(async () => {
    setTranscript({ cues: [], stats: null, error: null, loading: true });
    try {
      const res = await fetch(`/api/demo-requests/${id}/transcript`, { cache: 'no-store' });
      const body = await res.json();
      setTranscript(
        res.ok
          ? { cues: body.cues ?? [], stats: body.stats ?? null, error: null, loading: false }
          : { cues: [], stats: null, error: body.error || 'Could not load the transcript.', loading: false },
      );
    } catch {
      setTranscript({ cues: [], stats: null, error: 'Could not reach Admin. Try again.', loading: false });
    }
  }, [id]);

  // The transcript is small and is the quickest way to see what happened: load it with the panel.
  useEffect(() => {
    if (hasTranscript && !transcript) void loadTranscript();
  }, [hasTranscript, transcript, loadTranscript]);

  if (!hasRecording && !hasTranscript) return null;

  return (
    <Box sx={{ mt: 1.5 }}>
      <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap', mb: 1 }}>
        <Chip size="small" variant="outlined" icon={<PlayCircleOutlineIcon />} label={hasRecording ? 'Recording' : 'No recording'} />
        <Chip size="small" variant="outlined" icon={<SubjectIcon />} label={hasTranscript ? 'Transcript' : 'No transcript yet'} />
        <Box sx={{ flex: 1 }} />
        <Button size="small" startIcon={<OpenInFullIcon />} onClick={() => setFull(true)} sx={{ minHeight: 44, ...FOCUS_RING }}>
          Full view
        </Button>
        {webUrl && (
          <Button size="small" startIcon={<OpenInNewIcon />} href={webUrl} target="_blank" rel="noopener noreferrer" sx={{ minHeight: 44, ...FOCUS_RING }}>
            OneDrive
          </Button>
        )}
      </Box>

      {!full && (
        <Player
          video={video}
          transcript={transcript}
          canPlay={hasRecording}
          wide={false}
          startAt={time.current}
          onLoadVideo={loadVideo}
          onTime={(t) => (time.current = t)}
        />
      )}

      <Dialog open={full} onClose={() => setFull(false)} fullWidth maxWidth="lg" aria-labelledby="demo-review-title">
        <DialogTitle id="demo-review-title" sx={{ display: 'flex', alignItems: 'center', gap: 1, pr: 1 }}>
          <Box sx={{ flex: 1, minWidth: 0 }}>Demo with {name}</Box>
          <IconButton aria-label="Close" onClick={() => setFull(false)} sx={{ width: 44, height: 44, ...FOCUS_RING }}>
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers>
          {full && (
            <Player
              video={video}
              transcript={transcript}
              canPlay={hasRecording}
              wide
              startAt={time.current}
              onLoadVideo={loadVideo}
              onTime={(t) => (time.current = t)}
            />
          )}
        </DialogContent>
      </Dialog>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.75 }}>
        Anyone signed in to Admin can watch and read it here. OneDrive needs access to the organizer&apos;s files.
      </Typography>
    </Box>
  );
}
