'use client';

/**
 * The console after End round: how the round went, for the teacher.
 *
 * Tiles for the class, the top five, then everyone ranked (the teacher sees
 * low scores too; nobody else does), with a kind label and a Not active flag.
 * Publish sends each student their own result and the top five; after that the
 * teacher can put the top five on the meeting screen, start the next round in
 * the same meeting, or open the full report.
 */

import { useCallback, useEffect, useState } from 'react';
import { Alert, Box, Button, Chip, CircularProgress, Collapse, IconButton, Paper, Skeleton, Snackbar, Stack, Tooltip, Typography, alpha, useTheme } from '@neram/ui';
import ContentCopyRounded from '@mui/icons-material/ContentCopyRounded';
import CampaignRounded from '@mui/icons-material/CampaignRounded';
import EmojiEventsRounded from '@mui/icons-material/EmojiEventsRounded';
import ExpandMoreRounded from '@mui/icons-material/ExpandMoreRounded';
import OpenInNewRounded from '@mui/icons-material/OpenInNewRounded';
import PlayArrowRounded from '@mui/icons-material/PlayArrowRounded';
import ScreenShareRounded from '@mui/icons-material/ScreenShareRounded';
import StopScreenShareRounded from '@mui/icons-material/StopScreenShareRounded';
import StudentAvatar from '@/components/students/StudentAvatar';
import { copyText } from '@/lib/clipboard';
import { PadClientError, padFetch } from '@/lib/pad/client/pad-fetch';
import type { PadHost } from '@/lib/pad/client/pad-host';
import { roundTitle } from '@/lib/pad/client/teacher-view';
import { RESULT_LABELS, type ResultLabel, type RoundResults as Results, type RoundStudentRow } from '@/lib/pad/round-results';
import { HideNamesButton, useHideNames } from './HideNames';

export interface StageShareControl {
  allowed: boolean;
  sharing: boolean;
  busy: boolean;
  toggle: () => void;
}

const LABEL_COLOUR: Record<ResultLabel, 'success' | 'primary' | 'warning'> = {
  strong: 'success',
  good: 'primary',
  needs_practice: 'warning',
};

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
}

export default function RoundResults({
  host,
  sessionId,
  share,
  onNextRound,
  nextRoundBusy,
}: {
  host: PadHost;
  sessionId: string;
  share: StageShareControl;
  /** Absent in a popped-out window, which has no meeting to start a round in. */
  onNextRound?: () => void;
  nextRoundBusy: boolean;
}) {
  const theme = useTheme();
  const [results, setResults] = useState<Results | null>(null);
  const [failed, setFailed] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [showEveryone, setShowEveryone] = useState(false);
  const [hidden, setHidden] = useHideNames();
  const [copied, setCopied] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setResults(await padFetch<Results>(host, `/api/pad/sessions/${sessionId}/results`));
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, [host, sessionId]);

  useEffect(() => {
    void load();
  }, [load]);

  const publish = async (again: boolean) => {
    setPublishing(true);
    setProblem(null);
    try {
      const out = await padFetch<{ publishedAt: string | null; notified: number }>(host, `/api/pad/sessions/${sessionId}/publish`, {
        method: 'POST',
        body: {},
      });
      setConfirming(false);
      setNotice(
        again
          ? 'Published again. Students now see the updated results.'
          : out.notified > 0
            ? `Published. ${out.notified} ${out.notified === 1 ? 'student was' : 'students were'} sent their result.`
            : 'Published. Students see their result on the pad and in Nexus.',
      );
      await load();
    } catch (err) {
      setProblem(err instanceof PadClientError && err.code === 'INVALID_TRANSITION' ? 'End the round before publishing.' : 'The results could not be published. Please try again.');
    } finally {
      setPublishing(false);
    }
  };

  if (!results) {
    return failed ? (
      <Alert
        severity="warning"
        action={
          <Button color="inherit" size="small" onClick={() => void load()} sx={{ minHeight: 44 }}>
            Try again
          </Button>
        }
      >
        The results could not load.
      </Alert>
    ) : (
      <Stack spacing={1.5} aria-busy="true" aria-label="Loading the results">
        <Skeleton variant="rounded" height={28} width="60%" />
        <Skeleton variant="rounded" height={72} />
        <Skeleton variant="rounded" height={160} />
      </Stack>
    );
  }

  const { session, class: tiles, top, students } = results;
  const published = !!session.results_published_at;
  const ranked = students.filter((row) => row.rank !== null && row.rank !== undefined);
  const unranked = students.filter((row) => row.rank === null || row.rank === undefined);
  const round = roundTitle(session.round_no);

  return (
    <Stack spacing={2}>
      <Box>
        <Typography variant="h6" component="h2" fontWeight={800}>
          {`${round} results`}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {session.ended_at ? `Ended ${formatTime(session.ended_at)}` : 'Still running'}
        </Typography>
      </Box>

      {(tiles.pending_keys ?? 0) > 0 && (
        <Alert severity="info">
          {`${tiles.pending_keys} ${tiles.pending_keys === 1 ? 'question has' : 'questions have'} no answer yet, so ${tiles.pending_keys === 1 ? 'it does' : 'they do'} not count. Set ${tiles.pending_keys === 1 ? 'it' : 'them'} from the full report and the results update.`}
        </Alert>
      )}

      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 1 }}>
        <Tile label="Questions" value={String(tiles.questions)} />
        <Tile label="Class average" value={tiles.average_score === null ? 'None' : `${tiles.average_score}%`} />
        <Tile label="Took part" value={`${tiles.took_part} of ${tiles.joined ?? tiles.took_part}`} />
      </Box>

      <Paper variant="outlined" component="section" aria-labelledby="pad-top-heading" sx={{ p: 1.5 }}>
        <Stack direction="row" alignItems="center" spacing={1}>
          <EmojiEventsRounded sx={{ color: theme.palette.warning.main }} aria-hidden />
          <Typography id="pad-top-heading" variant="subtitle2" component="h3" fontWeight={800} sx={{ flex: 1 }}>
            Top 5
          </Typography>
          <HideNamesButton hidden={hidden} onChange={setHidden} />
        </Stack>
        {top.length === 0 ? (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            Nobody has a correct answer yet.
          </Typography>
        ) : hidden ? (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            Names are hidden.
          </Typography>
        ) : (
          <Stack component="ol" spacing={0.5} sx={{ listStyle: 'none', m: 0, mt: 1, p: 0 }}>
            {top.map((row) => (
              <Stack component="li" key={row.student_id} direction="row" spacing={1} alignItems="center" sx={{ minHeight: 44 }}>
                <RankBadge rank={row.rank} />
                <StudentAvatar userId={row.student_id} name={row.name ?? ''} size={32} sx={{ flexShrink: 0 }} />
                <Typography variant="body2" fontWeight={600} sx={{ flex: 1, minWidth: 0, overflowWrap: 'anywhere' }}>
                  {row.name ?? 'Unnamed student'}
                </Typography>
                <Typography variant="body2" sx={{ fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>{`${row.correct} of ${row.counted}`}</Typography>
              </Stack>
            ))}
          </Stack>
        )}
      </Paper>

      {students.length > 0 && !hidden && (
        <Box>
          <Button
            variant="text"
            onClick={() => setShowEveryone(!showEveryone)}
            aria-expanded={showEveryone}
            endIcon={<ExpandMoreRounded sx={{ transform: showEveryone ? 'rotate(180deg)' : 'none', transition: 'transform 150ms', '@media (prefers-reduced-motion: reduce)': { transition: 'none' } }} />}
            sx={{ minHeight: 44 }}
          >
            {`Everyone (${students.length}), only you see this`}
          </Button>
          <Collapse in={showEveryone} unmountOnExit>
            <Stack component="ol" spacing={0.5} sx={{ listStyle: 'none', m: 0, p: 0 }}>
              {[...ranked, ...unranked].map((row) => (
                <EveryoneRow key={row.student_id} row={row} barColour={alpha(theme.palette.text.primary, 0.08)} fill={theme.palette.primary.main} />
              ))}
            </Stack>
          </Collapse>
        </Box>
      )}

      {problem && (
        <Alert severity="error" onClose={() => setProblem(null)}>
          {problem}
        </Alert>
      )}
      {notice && (
        <Alert severity="success" role="status" onClose={() => setNotice(null)}>
          {notice}
        </Alert>
      )}

      {published ? (
        <Stack spacing={1}>
          <Typography variant="body2" color="text.secondary">{`Published ${formatTime(session.results_published_at as string)}. Students see their own result and the top 5.`}</Typography>
          {session.changed_since_publish && (
            <Alert
              severity="info"
              action={
                <Button color="inherit" size="small" onClick={() => void publish(true)} disabled={publishing} sx={{ minHeight: 44 }}>
                  Publish again
                </Button>
              }
            >
              Results changed after you published.
            </Alert>
          )}
          {share.allowed && (
            <Button
              variant="outlined"
              onClick={share.toggle}
              disabled={share.busy}
              startIcon={share.sharing ? <StopScreenShareRounded /> : <ScreenShareRounded />}
              sx={{ minHeight: 48 }}
            >
              {share.sharing ? 'Stop showing the top 5' : 'Show the top 5 on the meeting screen'}
            </Button>
          )}
        </Stack>
      ) : confirming ? (
        <Alert severity="info" icon={<CampaignRounded />}>
          <Stack spacing={1}>
            <span>
              Each student sees what they attempted, what they got right, their own rank, each question, the top 5 and the class average. Nobody sees anyone else&apos;s score. Each student also gets a Teams chat from
              Neram Assistant with their own result.
            </span>
            <Stack direction="row" spacing={1}>
              <Button
                variant="contained"
                onClick={() => void publish(false)}
                disabled={publishing}
                startIcon={publishing ? <CircularProgress size={18} color="inherit" aria-hidden /> : undefined}
                sx={{ minHeight: 44 }}
              >
                Publish
              </Button>
              <Button color="inherit" onClick={() => setConfirming(false)} sx={{ minHeight: 44 }}>
                Not yet
              </Button>
            </Stack>
          </Stack>
        </Alert>
      ) : (
        <Button variant="contained" size="large" startIcon={<CampaignRounded />} onClick={() => setConfirming(true)} sx={{ minHeight: 56, fontWeight: 800 }}>
          Publish results
        </Button>
      )}

      {onNextRound && (
        <Button
          variant={published ? 'contained' : 'outlined'}
          onClick={onNextRound}
          disabled={nextRoundBusy}
          startIcon={nextRoundBusy ? <CircularProgress size={18} color="inherit" aria-hidden /> : <PlayArrowRounded />}
          sx={{ minHeight: 48, fontWeight: 700 }}
        >
          {`Start ${roundTitle((session.round_no ?? 0) + 1)}`}
        </Button>
      )}
      <ReportLinks host={host} sessionId={session.id} onCopied={setCopied} />
      <Snackbar open={copied !== null} autoHideDuration={4_000} onClose={() => setCopied(null)} message={copied ?? ''} />
    </Stack>
  );
}

/**
 * "Open the full report", inside Teams where Teams can (signed in as this
 * teacher, never the browser's account), else the Nexus page in a new tab; and
 * a small copy of the link, for sharing or opening elsewhere.
 */
function ReportLinks({ host, sessionId, onCopied }: { host: PadHost; sessionId: string; onCopied: (message: string) => void }) {
  const path = `/teacher/answer-pad/sessions/${sessionId}`;
  const [opening, setOpening] = useState(false);
  const copy = async () => {
    const ok = await copyText(`${window.location.origin}${path}`);
    onCopied(ok ? 'Link copied' : 'The link could not be copied. Open the report and copy it from there.');
  };
  return (
    <Stack direction="row" alignItems="center" spacing={0.5} sx={{ alignSelf: 'flex-start' }}>
      {host.openReport ? (
        <Button
          variant="text"
          onClick={async () => {
            setOpening(true);
            try {
              await host.openReport?.(sessionId);
            } catch {
              window.open(path, '_blank', 'noopener,noreferrer');
            } finally {
              setOpening(false);
            }
          }}
          disabled={opening}
          endIcon={<OpenInNewRounded />}
          sx={{ minHeight: 44 }}
        >
          Open the full report
        </Button>
      ) : (
        <Button variant="text" href={path} target="_blank" rel="noopener noreferrer" endIcon={<OpenInNewRounded />} sx={{ minHeight: 44 }}>
          Open the full report
        </Button>
      )}
      <Tooltip title="Copy link">
        <IconButton aria-label="Copy the report link" onClick={() => void copy()} sx={{ width: 44, height: 44 }}>
          <ContentCopyRounded fontSize="small" />
        </IconButton>
      </Tooltip>
    </Stack>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <Stack spacing={0.25} sx={{ p: 1, borderRadius: 2, border: '1px solid', borderColor: 'divider', minWidth: 0 }}>
      <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.2 }}>
        {label}
      </Typography>
      <Typography variant="h6" component="p" fontWeight={800} sx={{ fontVariantNumeric: 'tabular-nums', overflowWrap: 'anywhere' }}>
        {value}
      </Typography>
    </Stack>
  );
}

function RankBadge({ rank }: { rank: number | null | undefined }) {
  return (
    <Box
      aria-label={rank ? `Rank ${rank}` : 'Not ranked'}
      sx={{
        width: 28,
        height: 28,
        flexShrink: 0,
        borderRadius: '50%',
        display: 'grid',
        placeItems: 'center',
        fontWeight: 800,
        fontSize: 13,
        fontVariantNumeric: 'tabular-nums',
        bgcolor: rank === 1 ? 'warning.main' : 'action.selected',
        color: rank === 1 ? 'warning.contrastText' : 'text.primary',
      }}
    >
      {rank ?? '-'}
    </Box>
  );
}

function EveryoneRow({ row, barColour, fill }: { row: RoundStudentRow; barColour: string; fill: string }) {
  const name = row.name ?? 'Unnamed student';
  return (
    <Stack component="li" direction="row" spacing={1} alignItems="center" sx={{ minHeight: 48 }}>
      <RankBadge rank={row.rank} />
      <StudentAvatar userId={row.student_id} name={name} size={28} sx={{ flexShrink: 0 }} />
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography variant="body2" fontWeight={600} sx={{ overflowWrap: 'anywhere' }}>
          {name}
        </Typography>
        <Stack direction="row" spacing={0.75} alignItems="center" useFlexGap flexWrap="wrap">
          <Typography variant="caption" sx={{ fontVariantNumeric: 'tabular-nums' }}>
            {row.counted > 0
              ? `${row.correct} of ${row.attempted} right${row.no_answer > 0 ? `, ${row.no_answer} not attempted` : ''}`
              : 'Nothing graded'}
          </Typography>
          {row.label && <Chip size="small" color={LABEL_COLOUR[row.label]} variant="outlined" label={RESULT_LABELS[row.label]} />}
          {row.not_active && <Chip size="small" variant="outlined" label="Not active" />}
          {row.excused > 0 && (
            <Typography variant="caption" color="text.secondary">
              {`${row.excused} excused`}
            </Typography>
          )}
        </Stack>
        {row.score_pct !== null && (
          <Box sx={{ mt: 0.5, height: 6, borderRadius: 3, bgcolor: barColour }} aria-hidden>
            <Box sx={{ width: `${row.score_pct}%`, height: '100%', borderRadius: 3, bgcolor: fill }} />
          </Box>
        )}
      </Box>
    </Stack>
  );
}
