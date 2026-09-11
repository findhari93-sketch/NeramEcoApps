'use client';

/**
 * Everything about a paper that is not its questions or its students.
 *
 * This all used to sit above the tabs, where a teacher had to scroll past the
 * paper's origin, a row of six buttons and an editing warning before reaching
 * a single question. It is the Settings tab now, the way a form keeps its
 * settings out of the way of its questions and responses.
 */

import { Alert, Box, Button, Chip, IconButton, Paper, Stack, Typography } from '@neram/ui';
import CloseOutlinedIcon from '@mui/icons-material/CloseOutlined';
import ContentCopyOutlinedIcon from '@mui/icons-material/ContentCopyOutlined';
import DeleteOutlineOutlinedIcon from '@mui/icons-material/DeleteOutlineOutlined';
import HistoryOutlinedIcon from '@mui/icons-material/HistoryOutlined';
import SendOutlinedIcon from '@mui/icons-material/SendOutlined';
import { describeTestOrigin, type TestOriginFacts } from '@/lib/test-origin';

export interface SettingsPlacement {
  id: string;
  context_type: string;
  context_id: string;
  passing_pct: number | null;
  is_visible: boolean;
  available_from: string | null;
  available_until: string | null;
}

/**
 * What each run of this paper is called.
 *
 * A "run" is one scheduled use: who it is for, when it closes, and how they
 * did. The class-linked contexts were missing here once, so a class test
 * rendered as the raw string `class_test` on the very screen a teacher goes to
 * to find out where a paper is being used.
 */
const CONTEXT_LABELS: Record<string, string> = {
  classroom_assignment: 'Class test (whole class, no class linked)',
  class_test: 'Class test',
  exam: 'Exam',
  class_prep_test: 'Before class',
  catchup_class: 'Catch-up',
  student_practice: 'Practice (always open)',
  study_file: 'Study chapter',
  foundation_section: 'Foundation section',
  module_item: 'Module section',
  class_recap_section: 'Recap checkpoint',
};

function fmtDateTime(iso: string | null): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return iso;
  }
}

function SectionHeading({ children, hint }: { children: string; hint?: string }) {
  return (
    <Box sx={{ mb: 1 }}>
      <Typography component="h2" variant="subtitle1" sx={{ fontWeight: 700 }}>
        {children}
      </Typography>
      {hint && (
        <Typography variant="body2" color="text.secondary">
          {hint}
        </Typography>
      )}
    </Box>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, py: 1 }}>
      <Typography variant="body2" color="text.secondary">
        {label}
      </Typography>
      <Typography variant="body2" sx={{ fontWeight: 600, textAlign: 'right' }}>
        {value}
      </Typography>
    </Box>
  );
}

export default function TestSettingsView({
  isPublished,
  timerText,
  questionsCount,
  questionsToServe,
  totalMarks,
  passingMarks,
  attemptsCount,
  origin,
  placements,
  busy,
  duplicating,
  isMirrored,
  canAssign,
  onAssign,
  onSeeResults,
  onRemovePlacement,
  onDuplicate,
  onDelete,
}: {
  isPublished: boolean;
  timerText: string;
  questionsCount: number;
  questionsToServe: number | null | undefined;
  totalMarks: number | null;
  passingMarks: number | null;
  attemptsCount: number;
  origin: TestOriginFacts | null;
  placements: SettingsPlacement[];
  busy: boolean;
  duplicating: boolean;
  isMirrored: boolean;
  canAssign: boolean;
  onAssign: () => void;
  onSeeResults: (placementId: string) => void;
  onRemovePlacement: (placementId: string) => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const o = describeTestOrigin(origin);
  const pooled = questionsToServe != null && questionsToServe < questionsCount;

  return (
    <Stack spacing={3.5} sx={{ pb: 4 }}>
      <Box component="section">
        <SectionHeading hint="A run is one scheduled use of this paper: who it is for, when it closes, and how they did. The same paper can have many runs.">
          Where this paper is used
        </SectionHeading>
        {placements.length === 0 ? (
          <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
              No runs yet. Assign it to your class or add it to the practice pool.
            </Typography>
            <Button
              variant="contained"
              startIcon={<SendOutlinedIcon />}
              onClick={onAssign}
              disabled={busy || !canAssign}
              sx={{ textTransform: 'none', minHeight: 44 }}
            >
              Assign
            </Button>
          </Paper>
        ) : (
          <Stack spacing={1}>
            {placements.map((p) => (
              <Paper
                key={p.id}
                variant="outlined"
                sx={{ p: 1.25, borderRadius: 1.5, display: 'flex', alignItems: 'center', gap: 1 }}
              >
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    {CONTEXT_LABELS[p.context_type] || p.context_type}
                  </Typography>
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 0.25 }}>
                    {p.available_from && (
                      <Chip size="small" variant="outlined" label={`Opens ${fmtDateTime(p.available_from)}`} sx={{ height: 22 }} />
                    )}
                    {p.available_until && (
                      <Chip size="small" variant="outlined" label={`Due ${fmtDateTime(p.available_until)}`} sx={{ height: 22 }} />
                    )}
                    {p.passing_pct != null && (
                      <Chip size="small" variant="outlined" label={`Pass ${p.passing_pct}%`} sx={{ height: 22 }} />
                    )}
                    {!p.is_visible && <Chip size="small" label="Hidden" sx={{ height: 22 }} />}
                  </Box>
                </Box>
                <Button
                  onClick={() => onSeeResults(p.id)}
                  sx={{ textTransform: 'none', minHeight: 44, flexShrink: 0 }}
                >
                  See students
                </Button>
                {(p.context_type === 'classroom_assignment' || p.context_type === 'student_practice') && (
                  <IconButton
                    aria-label="Remove this run"
                    onClick={() => onRemovePlacement(p.id)}
                    disabled={busy}
                    sx={{ width: 44, height: 44 }}
                  >
                    <CloseOutlinedIcon sx={{ fontSize: 18 }} />
                  </IconButton>
                )}
              </Paper>
            ))}
          </Stack>
        )}
      </Box>

      <Box component="section">
        <SectionHeading>About this paper</SectionHeading>
        {isMirrored && (
          <Alert severity="info" sx={{ mb: 1.5 }}>
            This quiz is mirrored from a legacy section. Publishing or deleting here does not change what students see
            inside Foundation, Modules or Class Recaps.
          </Alert>
        )}
        <Paper variant="outlined" sx={{ px: 2, py: 0.5, borderRadius: 2, mb: 1.5 }}>
          <Fact label="Status" value={isPublished ? 'Published' : 'Hidden from students'} />
          <Fact label="Timer" value={timerText} />
          <Fact
            label="Questions"
            value={pooled ? `Pool of ${questionsCount}, ${questionsToServe} asked each sitting` : String(questionsCount)}
          />
          {totalMarks != null && <Fact label="Total marks" value={String(totalMarks)} />}
          {passingMarks != null && <Fact label="Pass marks" value={String(passingMarks)} />}
          <Fact label="Attempts recorded" value={String(attemptsCount)} />
        </Paper>

        {/* Where the paper came from. `origin` is null for tests built before the
            import archive existed, and the describer says so rather than guessing. */}
        <Box
          sx={{
            p: 1.5,
            borderRadius: 2,
            border: '1px solid',
            borderColor: o.hasLoss ? 'warning.main' : 'divider',
            display: 'flex',
            alignItems: 'flex-start',
            gap: 1,
          }}
        >
          <HistoryOutlinedIcon
            sx={{ fontSize: 18, mt: '2px', flexShrink: 0, color: o.hasLoss ? 'warning.main' : 'text.secondary' }}
          />
          <Box sx={{ minWidth: 0, flex: 1 }}>
            <Typography variant="body2" sx={{ fontWeight: 700 }}>
              {o.headline}
            </Typography>
            {o.details.length > 0 && (
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.25 }}>
                {o.details.join(' ')}
              </Typography>
            )}
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.25 }}>
              Its questions live in the question bank and can be reused by any other test.
            </Typography>
          </Box>
        </Box>
      </Box>

      {attemptsCount > 0 && (
        <Box component="section">
          <SectionHeading>Changing the paper after students sat it</SectionHeading>
          <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
            <Typography variant="body2" sx={{ mb: 1.5 }}>
              {attemptsCount} attempt{attemptsCount === 1 ? '' : 's'} recorded. Fixing a wrong answer or a typo on
              one question is fine from the Questions tab, and a corrected answer offers a re-grade. To add, remove or
              reorder questions, edit a duplicate and swap it in when you are ready, so the scores already given keep
              their meaning.
            </Typography>
            <Button
              variant="outlined"
              startIcon={<ContentCopyOutlinedIcon />}
              onClick={onDuplicate}
              disabled={busy || duplicating}
              sx={{ textTransform: 'none', minHeight: 44 }}
            >
              {duplicating ? 'Duplicating' : 'Duplicate to edit'}
            </Button>
          </Paper>
        </Box>
      )}

      <Box component="section">
        <SectionHeading>Delete this test</SectionHeading>
        <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, borderColor: 'error.light' }}>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
            Removes the test and its runs for students. Attempt history is kept.
          </Typography>
          <Button
            variant="outlined"
            color="error"
            startIcon={<DeleteOutlineOutlinedIcon />}
            onClick={onDelete}
            disabled={busy}
            sx={{ textTransform: 'none', minHeight: 44 }}
          >
            Delete test
          </Button>
        </Paper>
      </Box>
    </Stack>
  );
}
