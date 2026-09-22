'use client';

/**
 * What students reported about the open question, at the top of the pane.
 *
 * One card per problem (a part of the question, for all the students who
 * reported it), holding everything needed to judge it without leaving the
 * pane: which part, how many students, their reasons, their words, and the
 * moment in the video they pointed at. Then the two ways to close it.
 *
 * "Not a mistake" asks why first. A student told only "you are wrong" learns
 * nothing and stops reporting, which is the one outcome worse than a mistake
 * nobody noticed.
 */
import { useState } from 'react';
import { Box, Button, Chip, CircularProgress, Link, Paper, TextField, Typography } from '@neram/ui';
import OutlinedFlagIcon from '@mui/icons-material/OutlinedFlag';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import PlayCircleOutlineIcon from '@mui/icons-material/PlayCircleOutline';
import {
  QB_REPORT_TARGET_LABELS,
  QB_REPORT_TYPE_LABELS,
  type QBReportGroup,
  type QBReportOutcome,
} from '@neram/database';
import { formatAgo } from '@/lib/slides-panel';
import StudentAvatar from '@/components/students/StudentAvatar';
import { formatVideoTime, videoAtTime } from '@/lib/video-time';

const NOTE_LIMIT = 500;

export interface SolutionReportsPanelProps {
  groups: QBReportGroup[];
  /** The video a group is about, for "at 2:15" links. Null part is the question's own video. */
  videoUrlFor?: (partLabel: string | null) => string | null;
  /** Resolves true when it closed. */
  onResolve: (group: QBReportGroup, outcome: QBReportOutcome, note: string) => Promise<boolean>;
}

export default function SolutionReportsPanel({ groups, videoUrlFor, onResolve }: SolutionReportsPanelProps) {
  if (groups.length === 0) return null;
  return (
    <Box component="section" aria-label="Student reports" sx={{ mb: 2, display: 'flex', flexDirection: 'column', gap: 1 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
        <OutlinedFlagIcon aria-hidden sx={{ fontSize: 20, color: 'error.main' }} />
        <Typography variant="subtitle2" fontWeight={700}>
          Students reported a problem
        </Typography>
      </Box>
      {groups.map((group) => (
        <ReportGroupCard
          key={`${group.target}|${group.part_label ?? ''}`}
          group={group}
          videoUrl={group.target === 'video' ? videoUrlFor?.(group.part_label) ?? null : null}
          onResolve={onResolve}
        />
      ))}
    </Box>
  );
}

function firstName(name: string | null): string {
  return (name || '').trim().split(/\s+/)[0] || 'A student';
}

/**
 * One problem, and the two ways to close it. Shared with the Reports queue,
 * which adds where the question lives (context) and "Open in paper".
 * A closed problem shows how it was closed instead of the buttons.
 */
export function ReportGroupCard({
  group,
  videoUrl,
  onResolve,
  context,
  extraActions,
}: {
  group: QBReportGroup;
  videoUrl: string | null;
  onResolve: SolutionReportsPanelProps['onResolve'];
  context?: React.ReactNode;
  extraActions?: React.ReactNode;
}) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [explaining, setExplaining] = useState(false);
  const [why, setWhy] = useState('');

  const title = `${QB_REPORT_TARGET_LABELS[group.target]}${group.part_label ? `, part ${group.part_label}` : ''}`;
  const people = `${group.students} student${group.students === 1 ? '' : 's'}`;
  // Only the reports that say something beyond the reason chip.
  const notes = group.notes.filter((n) => n.note || n.video_seconds != null);

  const resolve = async (outcome: QBReportOutcome, note: string) => {
    setBusy(true);
    setFailed(false);
    try {
      const ok = await onResolve(group, outcome, note);
      if (!ok) setFailed(true);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Paper
      component="article"
      variant="outlined"
      aria-label={`${title}: ${people}`}
      sx={{
        p: 1.5,
        borderLeft: '3px solid',
        borderLeftColor: group.status === 'open' || group.status === 'in_review' ? 'error.main' : 'divider',
        borderRadius: 1.5,
      }}
    >
      {context}
      <Box sx={{ display: 'flex', alignItems: 'baseline', flexWrap: 'wrap', columnGap: 1 }}>
        <Typography variant="body2" fontWeight={700}>
          {title}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {people}
        </Typography>
      </Box>

      {group.changed_since_reported && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.5, color: 'success.dark' }}>
          <CheckCircleIcon aria-hidden sx={{ fontSize: 16 }} />
          <Typography variant="caption" fontWeight={600}>
            Changed since they reported it. If that fixed it, mark it fixed.
          </Typography>
        </Box>
      )}

      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, mt: 1 }}>
        {group.reasons.map((r) => (
          <Chip
            key={r.reason}
            size="small"
            variant="outlined"
            label={`${QB_REPORT_TYPE_LABELS[r.reason] ?? r.reason} (${r.count})`}
            sx={{ fontWeight: 600 }}
          />
        ))}
      </Box>

      {notes.length > 0 && (
        <Box component="ul" sx={{ listStyle: 'none', p: 0, m: 0, mt: 1, display: 'flex', flexDirection: 'column', gap: 0.75 }}>
          {notes.map((n) => (
            <Box component="li" key={n.report_id} sx={{ pl: 1, borderLeft: '2px solid', borderColor: 'divider' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                <StudentAvatar userId={n.student_id} name={n.student_name} src={n.student_avatar_url ?? null} size={24} />
                <Typography variant="caption" color="text.secondary" component="p" sx={{ m: 0 }}>
                  {firstName(n.student_name)}, {formatAgo(n.created_at)}
                </Typography>
              </Box>
              {n.note && (
                <Typography variant="body2" sx={{ wordBreak: 'break-word' }}>
                  {n.note}
                </Typography>
              )}
              {n.video_seconds != null && videoUrl && (
                <Link
                  href={videoAtTime(videoUrl, n.video_seconds)}
                  target="_blank"
                  rel="noopener noreferrer"
                  underline="hover"
                  sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, minHeight: 44, fontSize: '0.8125rem', fontWeight: 600 }}
                >
                  <PlayCircleOutlineIcon aria-hidden sx={{ fontSize: 18 }} />
                  Watch at {formatVideoTime(n.video_seconds)}
                </Link>
              )}
              {n.video_seconds != null && !videoUrl && (
                <Typography variant="caption" color="text.secondary">
                  At {formatVideoTime(n.video_seconds)} in the video
                </Typography>
              )}
            </Box>
          ))}
        </Box>
      )}

      {failed && (
        <Typography role="alert" variant="caption" color="error.main" component="p" sx={{ mt: 1, mb: 0 }}>
          That did not save. Try again.
        </Typography>
      )}

      {group.status === 'resolved' || group.status === 'dismissed' ? (
        <Box sx={{ mt: 1.5 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, color: group.status === 'resolved' ? 'success.dark' : 'text.primary' }}>
            <CheckCircleIcon aria-hidden sx={{ fontSize: 16 }} />
            <Typography variant="body2" fontWeight={600}>
              {group.status === 'resolved' ? 'Fixed' : 'Not a mistake'}
              {group.resolved_at ? `, ${formatAgo(group.resolved_at)}` : ''}
            </Typography>
          </Box>
          {group.resolution_note && (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, wordBreak: 'break-word' }}>
              {group.resolution_note}
            </Typography>
          )}
          {extraActions && <Box sx={{ mt: 1, display: 'flex', gap: 1, flexWrap: 'wrap' }}>{extraActions}</Box>}
        </Box>
      ) : explaining ? (
        <Box sx={{ mt: 1.5, display: 'flex', flexDirection: 'column', gap: 1 }}>
          <TextField
            label="Tell them why"
            multiline
            minRows={2}
            size="small"
            fullWidth
            value={why}
            onChange={(e) => setWhy(e.target.value.slice(0, NOTE_LIMIT))}
            helperText={`The ${people} who reported it get this from you.`}
            inputProps={{ sx: { fontSize: { xs: 16, sm: 14 } } }}
            autoFocus
          />
          <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
            <Button onClick={() => setExplaining(false)} disabled={busy} sx={{ minHeight: 44, textTransform: 'none' }}>
              Cancel
            </Button>
            <Button
              variant="contained"
              disabled={busy || !why.trim()}
              onClick={() => resolve('not_a_mistake', why.trim())}
              startIcon={busy ? <CircularProgress size={16} color="inherit" /> : undefined}
              sx={{ minHeight: 44, textTransform: 'none' }}
            >
              Send to {people}
            </Button>
          </Box>
        </Box>
      ) : (
        <Box sx={{ mt: 1.5, display: 'flex', gap: 1, flexWrap: 'wrap' }}>
          <Button
            variant="contained"
            disabled={busy}
            onClick={() => resolve('fixed', '')}
            startIcon={busy ? <CircularProgress size={16} color="inherit" /> : undefined}
            sx={{ minHeight: 44, textTransform: 'none' }}
          >
            Mark fixed
          </Button>
          <Button
            variant="outlined"
            disabled={busy}
            onClick={() => setExplaining(true)}
            sx={{ minHeight: 44, textTransform: 'none' }}
          >
            Not a mistake
          </Button>
          {extraActions}
        </Box>
      )}
    </Paper>
  );
}
