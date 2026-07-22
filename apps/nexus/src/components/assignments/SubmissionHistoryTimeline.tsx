'use client';

/**
 * One timeline for an assignment's redo history, used on the teacher review
 * screens and the student assignment page, for both drawing and document
 * assignments. Each attempt is a tappable card; tapping opens that round
 * full-screen (drawing image toggle + feedback, or the submitted files) so a
 * teacher can judge the redo fast and a student can revisit what was asked.
 *
 * Fed by AttemptView[] (see lib/submission-history.ts). Purely presentational:
 * the parent decides which attempts to pass and highlights the current one.
 */
import { useEffect, useState } from 'react';
import {
  Box,
  Stack,
  Typography,
  Paper,
  Chip,
  Dialog,
  IconButton,
  ToggleButtonGroup,
  ToggleButton,
  useMediaQuery,
  useTheme,
  alpha,
} from '@neram/ui';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ReplayIcon from '@mui/icons-material/Replay';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import CloseIcon from '@mui/icons-material/Close';
import GradeDisplay from './GradeDisplay';
import SubmissionFiles from './SubmissionFiles';
import { reactionEmoji } from '@/lib/assignment-reactions';
import {
  type AttemptView,
  attemptGradeValue,
  attemptStatusLabel,
} from '@/lib/submission-history';

const REDO_AMBER = '#B54700';

function statusColor(status: string): string {
  if (status === 'completed' || status === 'reviewed') return 'success.main';
  if (status === 'redo') return 'warning.main';
  return 'primary.main';
}

function chipColor(status: string): 'success' | 'warning' | 'default' {
  if (status === 'completed' || status === 'reviewed') return 'success';
  if (status === 'redo') return 'warning';
  return 'default';
}

function formatWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString('en-IN', {
      day: 'numeric',
      month: 'short',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  } catch {
    return iso;
  }
}

/** The document thumbnail: first image file, or a file glyph. */
function DocThumb({ attempt }: { attempt: AttemptView }) {
  const firstImage = (attempt.files || []).find(
    (f) => f.mime !== 'application/pdf' && (f as any).url,
  ) as any;
  if (firstImage?.url) {
    return (
      <Box
        component="img"
        src={firstImage.url}
        alt={`Attempt ${attempt.index}`}
        sx={{ width: 56, height: 56, objectFit: 'cover', borderRadius: 1, flexShrink: 0 }}
      />
    );
  }
  return (
    <Box
      sx={{
        width: 56,
        height: 56,
        borderRadius: 1,
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        bgcolor: 'action.hover',
      }}
    >
      <DescriptionOutlinedIcon sx={{ color: 'text.secondary' }} />
    </Box>
  );
}

interface SubmissionHistoryTimelineProps {
  attempts: AttemptView[];
  /** Header label, e.g. "Submission history" or "Your previous attempts". */
  title?: string;
}

export default function SubmissionHistoryTimeline({
  attempts,
  title = 'Submission history',
}: SubmissionHistoryTimelineProps) {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'));
  const [open, setOpen] = useState<AttemptView | null>(null);

  if (!attempts.length) return null;

  return (
    <Box>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
          {title}
        </Typography>
        <Chip
          label={`${attempts.length} attempt${attempts.length > 1 ? 's' : ''}`}
          size="small"
          sx={{ height: 20, fontWeight: 600 }}
        />
      </Stack>

      <Box sx={{ position: 'relative' }}>
        {/* Vertical connector */}
        <Box
          sx={{
            position: 'absolute',
            left: 16,
            top: 20,
            bottom: 20,
            width: 2,
            bgcolor: 'divider',
            zIndex: 0,
          }}
        />

        {attempts.map((a) => {
          const gradeValue = attemptGradeValue(a);
          const emoji = reactionEmoji(a.reaction);
          return (
            <Box key={a.key} sx={{ position: 'relative', pl: 5, pb: 2 }}>
              {/* Timeline dot */}
              <Box
                sx={{
                  position: 'absolute',
                  left: 8,
                  top: 8,
                  width: 18,
                  height: 18,
                  borderRadius: '50%',
                  bgcolor: statusColor(a.status),
                  zIndex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {a.status === 'completed' || a.status === 'reviewed' ? (
                  <CheckCircleIcon sx={{ fontSize: 13, color: '#fff' }} />
                ) : a.status === 'redo' ? (
                  <ReplayIcon sx={{ fontSize: 12, color: '#fff' }} />
                ) : (
                  <AccessTimeIcon sx={{ fontSize: 12, color: '#fff' }} />
                )}
              </Box>

              <Paper
                variant="outlined"
                role="button"
                tabIndex={0}
                onClick={() => setOpen(a)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setOpen(a);
                  }
                }}
                sx={{
                  p: 1.25,
                  cursor: 'pointer',
                  minHeight: 44,
                  border: a.isLatest ? '2px solid' : '1px solid',
                  borderColor: a.isLatest ? 'primary.main' : 'divider',
                  transition: 'background-color 200ms ease, border-color 200ms ease',
                  '&:hover': { bgcolor: 'action.hover' },
                }}
              >
                <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start' }}>
                  {a.kind === 'drawing' && a.drawing ? (
                    <Box
                      component="img"
                      src={a.drawing.reviewed_image_url || a.drawing.original_image_url}
                      alt={`Attempt ${a.index}`}
                      sx={{ width: 56, height: 56, objectFit: 'cover', borderRadius: 1, flexShrink: 0 }}
                    />
                  ) : (
                    <DocThumb attempt={a} />
                  )}

                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap', mb: 0.25 }}>
                      <Typography variant="body2" fontWeight={700}>
                        Attempt #{a.index}
                      </Typography>
                      <Chip
                        label={attemptStatusLabel(a.status)}
                        size="small"
                        color={chipColor(a.status)}
                        sx={{ height: 20, fontSize: '0.68rem', fontWeight: 600 }}
                      />
                      {a.isLatest && (
                        <Chip label="Latest" size="small" variant="outlined" sx={{ height: 20, fontSize: '0.68rem' }} />
                      )}
                    </Box>

                    <Stack direction="row" alignItems="center" spacing={0.75} sx={{ mb: 0.25 }}>
                      {gradeValue != null && (
                        <GradeDisplay evaluationType={a.evaluationType} value={gradeValue} maxMarks={a.maxMarks} />
                      )}
                      {emoji && <Typography component="span" sx={{ fontSize: '1rem' }}>{emoji}</Typography>}
                    </Stack>

                    {a.feedback && (
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        sx={{
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical',
                          overflow: 'hidden',
                        }}
                      >
                        {a.feedback}
                      </Typography>
                    )}

                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.25 }}>
                      {formatWhen(a.submitted_at)}
                    </Typography>
                  </Box>
                </Box>
              </Paper>
            </Box>
          );
        })}
      </Box>

      <AttemptDetailDialog
        attempt={open}
        onClose={() => setOpen(null)}
        fullScreen={fullScreen}
      />
    </Box>
  );
}

// ------------------------------------------------------------------
// Drill-down: one attempt full-screen (drawing image toggle or files) + feedback.
// ------------------------------------------------------------------

function AttemptDetailDialog({
  attempt,
  onClose,
  fullScreen,
}: {
  attempt: AttemptView | null;
  onClose: () => void;
  fullScreen: boolean;
}) {
  const [view, setView] = useState<'original' | 'reviewed' | 'corrected'>('original');
  useEffect(() => {
    setView('original');
  }, [attempt?.key]);

  const gradeValue = attempt ? attemptGradeValue(attempt) : null;
  const emoji = reactionEmoji(attempt?.reaction);
  const d = attempt?.drawing;

  const drawingViews: { key: 'original' | 'reviewed' | 'corrected'; label: string; url: string | null }[] = d
    ? ([
        { key: 'original', label: 'Drawing', url: d.original_image_url },
        { key: 'reviewed', label: 'Teacher marks', url: d.reviewed_image_url },
        { key: 'corrected', label: 'Reference', url: d.corrected_image_url },
      ].filter((v) => v.url) as any)
    : [];
  const activeUrl = drawingViews.find((v) => v.key === view)?.url || drawingViews[0]?.url || null;

  return (
    <Dialog open={!!attempt} onClose={onClose} fullScreen={fullScreen} maxWidth="sm" fullWidth>
      {attempt && (
      <>
      <Stack direction="row" alignItems="center" sx={{ p: 1.5, borderBottom: '1px solid', borderColor: 'divider' }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
            Attempt #{attempt.index}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {formatWhen(attempt.submitted_at)} . {attemptStatusLabel(attempt.status)}
          </Typography>
        </Box>
        <IconButton onClick={onClose} aria-label="Close" sx={{ minWidth: 44, minHeight: 44 }}>
          <CloseIcon />
        </IconButton>
      </Stack>

      <Box sx={{ p: 2 }}>
        {attempt.kind === 'drawing' && d ? (
          <>
            {drawingViews.length > 1 && (
              <ToggleButtonGroup
                value={view}
                exclusive
                fullWidth
                size="small"
                onChange={(_, v) => v && setView(v)}
                sx={{ mb: 1.5 }}
              >
                {drawingViews.map((v) => (
                  <ToggleButton key={v.key} value={v.key} sx={{ minHeight: 40, textTransform: 'none' }}>
                    {v.label}
                  </ToggleButton>
                ))}
              </ToggleButtonGroup>
            )}
            {activeUrl && (
              <Box
                component="img"
                src={activeUrl}
                alt={`Attempt ${attempt.index}`}
                sx={{ width: '100%', borderRadius: 2, border: '1px solid', borderColor: 'divider', mb: 1.5 }}
              />
            )}
            {attempt.drawing?.annotations && attempt.drawing.annotations.length > 0 && (
              <Box sx={{ mb: 1.5 }}>
                <Typography variant="caption" sx={{ fontWeight: 700, color: REDO_AMBER }}>
                  What to fix
                </Typography>
                <Stack component="ul" sx={{ m: 0, mt: 0.5, pl: 2.5 }} spacing={0.25}>
                  {attempt.drawing.annotations.map((an, i) => (
                    <Typography key={i} component="li" variant="body2">
                      {an.label}
                    </Typography>
                  ))}
                </Stack>
              </Box>
            )}
          </>
        ) : (
          <Box sx={{ mb: 1.5 }}>
            <SubmissionFiles files={(attempt.files as any) || []} />
          </Box>
        )}

        {(gradeValue != null || emoji) && (
          <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
            {gradeValue != null && (
              <GradeDisplay evaluationType={attempt.evaluationType} value={gradeValue} maxMarks={attempt.maxMarks} showStarLabel />
            )}
            {emoji && <Typography component="span" sx={{ fontSize: '1.25rem' }}>{emoji}</Typography>}
          </Stack>
        )}

        {attempt.feedback && (
          <Box
            sx={{
              p: 1.5,
              borderRadius: 2,
              bgcolor: alpha('#607D8B', 0.08),
              border: '1px solid',
              borderColor: 'divider',
            }}
          >
            <Typography variant="caption" sx={{ fontWeight: 700 }} color="text.secondary">
              Teacher feedback
            </Typography>
            <Typography variant="body2" sx={{ mt: 0.25, whiteSpace: 'pre-wrap' }}>
              {attempt.feedback}
            </Typography>
          </Box>
        )}
      </Box>
      </>
      )}
    </Dialog>
  );
}
