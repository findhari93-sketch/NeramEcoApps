'use client';

/**
 * Find this paper's solution videos on the channel.
 *
 * The videos are uploaded unlisted with titles that name their question
 * ("Q no 22 - JEE 2014 Solution Video - Math Solution"), which is what used to
 * be copied out of YouTube Studio one link at a time. This reads the channel's
 * uploads a few pages per request (so it can say how far it has got), matches
 * the titles to this paper's questions, and hands the links over as unsaved
 * drafts. The teacher sees every row before pressing Save.
 *
 * Replacements and skipped titles are listed under "Needs a look", with the
 * reason, because those are exactly where a hand-pasted mistake or a title
 * typo shows up.
 */
import { useEffect, useRef, useState } from 'react';
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  LinearProgress,
  Typography,
  useMediaQuery,
  useTheme,
} from '@neram/ui';
import CloseIcon from '@mui/icons-material/Close';
import TravelExploreIcon from '@mui/icons-material/TravelExplore';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import {
  matchPaperVideos,
  type FindPaper,
  type FindResult,
  type FindRow,
  type FoundVideo,
} from '@/lib/youtube-solution-titles';
import { youtubeThumb } from '@/lib/class-resources';

export interface YouTubeFindDialogProps {
  open: boolean;
  onClose: () => void;
  paperId: string;
  rows: FindRow[];
  /** For the example title shown before searching. */
  examType: string | null;
  year: number | null;
  getToken: () => Promise<string | null>;
  /** Whether this person can connect YouTube in Settings (system.settings). */
  canConnect: boolean;
  onFill: (fills: FindResult['fills']) => void;
}

type Phase =
  | { kind: 'intro' }
  | { kind: 'searching'; checked: number; found: number }
  | { kind: 'result'; result: FindResult; checked: number }
  | { kind: 'not-connected'; message: string }
  | { kind: 'error'; message: string };

export default function YouTubeFindDialog({
  open,
  onClose,
  paperId,
  rows,
  examType,
  year,
  getToken,
  canConnect,
  onFill,
}: YouTubeFindDialogProps) {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'));
  const [phase, setPhase] = useState<Phase>({ kind: 'intro' });
  const [channel, setChannel] = useState<string | null>(null);
  const [severalPapers, setSeveralPapers] = useState(false);
  const run = useRef(0);

  useEffect(() => {
    if (open) setPhase({ kind: 'intro' });
    else run.current += 1; // closing stops a search in flight
  }, [open]);

  const exam = examType === 'NATA' ? 'NATA' : 'JEE';
  const example = `Q no 22 - ${exam} ${year ?? 2014} Solution Video`;

  const search = async () => {
    const mine = ++run.current;
    setPhase({ kind: 'searching', checked: 0, found: 0 });
    const videos: FoundVideo[] = [];
    let checked = 0;
    let pageToken: string | null = null;
    let paper: FindPaper | null = null;
    let paperCount = 1;
    try {
      const token = await getToken();
      do {
        const qs: string = pageToken ? `?pageToken=${encodeURIComponent(pageToken)}` : '';
        const res: Response = await fetch(`/api/question-bank/papers/${paperId}/youtube-videos${qs}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (run.current !== mine) return;
        const json = await res.json().catch(() => ({}));
        if (res.status === 409) {
          setPhase({ kind: 'not-connected', message: json?.message || 'YouTube is not connected to Nexus.' });
          return;
        }
        if (!res.ok) {
          setPhase({ kind: 'error', message: json?.error || 'Could not search YouTube. Try again in a moment.' });
          return;
        }
        const data = json.data ?? {};
        videos.push(...(data.videos ?? []));
        checked += data.checked ?? 0;
        pageToken = data.nextPageToken ?? null;
        paper = data.paper ?? paper;
        paperCount = data.paperCountThatYear ?? paperCount;
        setChannel(data.channelTitle ?? null);
        setSeveralPapers(paperCount > 1);
        setPhase({ kind: 'searching', checked, found: videos.length });
      } while (pageToken);

      if (!paper) return;
      setPhase({ kind: 'result', checked, result: matchPaperVideos(videos, rows, paper, { paperCountThatYear: paperCount }) });
    } catch {
      if (run.current === mine) setPhase({ kind: 'error', message: 'Could not reach YouTube. Check the connection and try again.' });
    }
  };

  const stop = () => {
    run.current += 1;
    setPhase({ kind: 'intro' });
  };

  const fills = phase.kind === 'result' ? phase.result.fills : [];

  return (
    <Dialog open={open} onClose={onClose} fullScreen={fullScreen} maxWidth="sm" fullWidth aria-labelledby="yt-find-title">
      <DialogTitle id="yt-find-title" sx={{ display: 'flex', alignItems: 'center', gap: 1, pr: 1 }}>
        <TravelExploreIcon sx={{ color: 'primary.main' }} aria-hidden />
        <Box component="span" sx={{ flex: 1 }}>
          Find this paper&apos;s videos on YouTube
        </Box>
        <IconButton aria-label="Close" onClick={onClose} sx={{ width: 44, height: 44 }}>
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent dividers>
        {phase.kind === 'intro' && (
          <Box>
            <Typography variant="body2" sx={{ mb: 1 }}>
              Looks through {channel ?? 'the channel'}&apos;s uploads for titles like this, and fills in the links for
              the questions they name:
            </Typography>
            <Box component="pre" sx={{ m: 0, mb: 1.5, p: 1.5, borderRadius: 1, bgcolor: 'action.hover', fontSize: '0.85rem', whiteSpace: 'pre-wrap' }}>
              {example} - Math Solution
            </Box>
            {severalPapers && (
              <Typography variant="body2" sx={{ mb: 1 }}>
                {year} has several papers, so a title must also name the session and shift, for example &quot;{exam} {year}
                Session 1 FN&quot; or &quot;Session 2 Afternoon&quot;.
              </Typography>
            )}
            <Typography variant="body2" sx={{ mb: 1 }}>
              Numbers can run across the whole paper or start again at 1 in each section (&quot;Q no 12 - Aptitude
              Solution&quot; is then the 12th aptitude question). The section word tells them apart.
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Nothing is saved until you check the rows and press Save.
            </Typography>
          </Box>
        )}

        {phase.kind === 'searching' && (
          <Box sx={{ py: 1 }}>
            <Typography role="status" variant="body2" fontWeight={600} sx={{ mb: 1 }}>
              {phase.checked === 0
                ? 'Searching the channel...'
                : `Checked ${phase.checked} uploads, found ${phase.found} for this paper`}
            </Typography>
            <LinearProgress aria-label="Searching the channel" />
          </Box>
        )}

        {phase.kind === 'result' && <ResultView result={phase.result} example={example} />}

        {phase.kind === 'not-connected' && (
          <Box role="alert">
            <Typography variant="body2" fontWeight={700}>
              {phase.message}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              {canConnect
                ? 'Connect the channel under YouTube backup in Settings, then search again.'
                : 'Ask an admin to connect the channel in Settings. Until then, paste the links with Paste a list.'}
            </Typography>
            {canConnect && (
              <Button href="/teacher/admin/settings" variant="outlined" sx={{ mt: 1.5, minHeight: 44, textTransform: 'none' }}>
                Open Settings
              </Button>
            )}
          </Box>
        )}

        {phase.kind === 'error' && (
          <Typography role="alert" variant="body2" color="error.main">
            {phase.message}
          </Typography>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 1.5, pb: 'calc(12px + env(safe-area-inset-bottom))' }}>
        {phase.kind === 'searching' ? (
          <Button onClick={stop} sx={{ minHeight: 44, textTransform: 'none' }}>
            Stop
          </Button>
        ) : (
          <Button onClick={onClose} sx={{ minHeight: 44, textTransform: 'none' }}>
            {phase.kind === 'intro' || (phase.kind === 'result' && fills.length > 0) ? 'Cancel' : 'Close'}
          </Button>
        )}
        {(phase.kind === 'intro' || phase.kind === 'error') && (
          <Button variant="contained" onClick={search} sx={{ minHeight: 44, textTransform: 'none' }}>
            {phase.kind === 'error' ? 'Try again' : 'Search the channel'}
          </Button>
        )}
        {phase.kind === 'result' && fills.length > 0 && (
          <Button
            variant="contained"
            onClick={() => {
              onFill(fills);
              onClose();
            }}
            sx={{ minHeight: 44, textTransform: 'none' }}
          >
            Fill in {fills.length} link{fills.length === 1 ? '' : 's'}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}

function ResultView({ result, example }: { result: FindResult; example: string }) {
  const { counts } = result;
  const total = result.items.length;
  const look = result.items.filter((i) => i.status === 'replaces' || i.status.startsWith('skipped'));

  if (total === 0) {
    return (
      <Typography variant="body2">
        No videos for this paper on the channel. Check that their titles start like &quot;{example}&quot;.
      </Typography>
    );
  }

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, color: 'success.dark' }}>
        <CheckCircleIcon aria-hidden sx={{ fontSize: 20 }} />
        <Typography variant="body1" fontWeight={700}>
          {total} found for this paper
        </Typography>
      </Box>
      <Typography variant="body2" sx={{ mt: 0.5 }}>
        {counts.new} new, {counts.replaces} replace a saved link, {counts.same} already saved
      </Typography>

      {look.length > 0 && (
        <Box component="section" aria-label="Needs a look" sx={{ mt: 2 }}>
          <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 0.75 }}>
            Needs a look ({look.length})
          </Typography>
          <Box component="ul" sx={{ listStyle: 'none', p: 0, m: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
            {look.map((item) => (
              <Box
                component="li"
                key={`${item.video.videoId}-${item.status}`}
                sx={{ display: 'flex', gap: 1, alignItems: 'flex-start', p: 1, borderRadius: 1.5, border: '1px solid', borderColor: 'divider' }}
              >
                <Box
                  component="img"
                  src={youtubeThumb(item.video.videoId)}
                  alt=""
                  loading="lazy"
                  sx={{ width: 64, height: 36, objectFit: 'cover', borderRadius: 0.5, flexShrink: 0, bgcolor: 'action.hover' }}
                />
                <Box sx={{ minWidth: 0 }}>
                  <Typography variant="body2" fontWeight={700}>
                    Q{item.number}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" component="p" sx={{ m: 0, wordBreak: 'break-word' }}>
                    {item.video.title}
                  </Typography>
                  <Typography variant="body2" sx={{ mt: 0.25 }}>
                    {item.status === 'replaces' ? 'Replaces the saved link. Check it before you save.' : item.reason}
                  </Typography>
                </Box>
              </Box>
            ))}
          </Box>
        </Box>
      )}
    </Box>
  );
}
