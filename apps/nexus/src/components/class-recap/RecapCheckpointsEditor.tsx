'use client';

/**
 * The checkpoint editor, shared by class recaps and Foundation chapter tracks.
 *
 * One component rather than two copies, and that is not tidiness. The copy this
 * replaces dropped the section id on load (`EditSection` had no `id` field and
 * its `toEdit` never carried one), and updateRecapSections decides
 * update-in-place versus re-create on exactly that id. So pressing Save on a
 * published recap archived every live checkpoint, inserted fresh ones, and left
 * every student's passed attempt pointing at an invisible row: they were
 * silently re-locked mid-recap by a teacher fixing a typo. The query layer had
 * a test guarding precisely this, defeated one layer up by the screen that
 * called it.
 *
 * `toEditableSections` below is the fix, and the reason both screens must go
 * through this file: an editor that loads without ids destroys work on its
 * first save, and it does so quietly.
 */

import {
  Box,
  Typography,
  Stack,
  Button,
  TextField,
  IconButton,
  Chip,
  Divider,
  ToggleButtonGroup,
  ToggleButton,
  alpha,
} from '@neram/ui';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import AddIcon from '@mui/icons-material/Add';
import {
  emptyQuestion,
  emptySection,
  formatClock,
  type EditableQuestion,
  type EditableSection,
} from '@/lib/recap-sections';

// Re-exported so a screen imports the editor and its shapes from one place.
// The definitions live in lib/recap-sections.ts, which is pure TypeScript, so
// the id-preserving loader can be unit tested without mounting MUI.
export {
  toEditableSections,
  emptyQuestion,
  emptySection,
  formatClock,
  type EditableQuestion,
  type EditableSection,
} from '@/lib/recap-sections';

const OPTIONS = ['a', 'b', 'c', 'd'] as const;

interface Props {
  sections: EditableSection[];
  onChange: (next: EditableSection[]) => void;
  disabled?: boolean;
  /** Shown in place of the list when there is nothing yet. */
  emptyState?: React.ReactNode;
}

export default function RecapCheckpointsEditor({ sections, onChange, disabled, emptyState }: Props) {
  const patchSection = (i: number, patch: Partial<EditableSection>) =>
    onChange(sections.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));

  const patchQuestion = (si: number, qi: number, patch: Partial<EditableQuestion>) =>
    onChange(
      sections.map((s, idx) =>
        idx === si
          ? { ...s, questions: s.questions.map((q, j) => (j === qi ? { ...q, ...patch } : q)) }
          : s,
      ),
    );

  const addSection = () => onChange([...sections, emptySection(sections.length)]);
  const removeSection = (i: number) => onChange(sections.filter((_, idx) => idx !== i));
  const addQuestion = (si: number) =>
    patchSection(si, { questions: [...sections[si].questions, emptyQuestion()] });
  const removeQuestion = (si: number, qi: number) =>
    patchSection(si, { questions: sections[si].questions.filter((_, j) => j !== qi) });

  if (!sections.length) {
    return (
      <Box
        sx={{
          p: 3,
          borderRadius: 2,
          border: '1px dashed',
          borderColor: 'divider',
          textAlign: 'center',
          color: 'text.secondary',
        }}
      >
        {emptyState || <Typography variant="body2">No checkpoints yet.</Typography>}
      </Box>
    );
  }

  return (
    <>
      <Stack spacing={2.5}>
        {sections.map((s, si) => (
          <Box
            key={s.id || `new-${si}`}
            sx={{
              p: 2,
              borderRadius: 2.5,
              border: '1px solid',
              borderColor: 'divider',
              bgcolor: 'background.paper',
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5, flexWrap: 'wrap' }}>
              <Chip label={`Checkpoint ${si + 1}`} size="small" sx={{ fontWeight: 700 }} />
              <Typography variant="caption" color="text.secondary">
                {formatClock(s.start_timestamp_seconds)} to {formatClock(s.end_timestamp_seconds)}
              </Typography>
              <Box sx={{ flex: 1 }} />
              <IconButton
                onClick={() => removeSection(si)}
                disabled={disabled}
                aria-label={`Remove checkpoint ${si + 1}`}
                sx={{ width: 48, height: 48 }}
              >
                <DeleteOutlineIcon fontSize="small" />
              </IconButton>
            </Box>

            <TextField
              fullWidth
              size="small"
              label="Checkpoint title"
              value={s.title}
              disabled={disabled}
              onChange={(e) => patchSection(si, { title: e.target.value })}
              sx={{ mb: 1.5 }}
            />

            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ mb: 1.5 }}>
              <TextField
                size="small"
                type="number"
                label="Start (sec)"
                value={s.start_timestamp_seconds}
                disabled={disabled}
                helperText={formatClock(s.start_timestamp_seconds)}
                onChange={(e) =>
                  patchSection(si, { start_timestamp_seconds: Number(e.target.value) })
                }
              />
              <TextField
                size="small"
                type="number"
                label="End (sec)"
                value={s.end_timestamp_seconds}
                disabled={disabled}
                helperText={formatClock(s.end_timestamp_seconds)}
                onChange={(e) => patchSection(si, { end_timestamp_seconds: Number(e.target.value) })}
              />
              <TextField
                size="small"
                type="number"
                label="Min correct to pass"
                placeholder="all"
                value={s.min_questions_to_pass ?? ''}
                disabled={disabled}
                helperText="Blank = all"
                onChange={(e) =>
                  patchSection(si, {
                    min_questions_to_pass: e.target.value === '' ? null : Number(e.target.value),
                  })
                }
              />
            </Stack>

            <Divider sx={{ my: 1.5 }} />

            <Stack spacing={2}>
              {s.questions.map((q, qi) => (
                <Box
                  key={qi}
                  sx={{
                    p: 1.5,
                    borderRadius: 2,
                    bgcolor: alpha('#1A2027', 0.02),
                    border: '1px solid',
                    borderColor: 'divider',
                  }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                    <Typography variant="caption" sx={{ fontWeight: 700 }}>
                      Question {qi + 1}
                    </Typography>
                    <Box sx={{ flex: 1 }} />
                    <IconButton
                      onClick={() => removeQuestion(si, qi)}
                      disabled={disabled}
                      aria-label={`Remove question ${qi + 1}`}
                      sx={{ width: 48, height: 48 }}
                    >
                      <DeleteOutlineIcon fontSize="small" />
                    </IconButton>
                  </Box>

                  <TextField
                    fullWidth
                    size="small"
                    label="Question"
                    multiline
                    value={q.question_text}
                    disabled={disabled}
                    onChange={(e) => patchQuestion(si, qi, { question_text: e.target.value })}
                    sx={{ mb: 1 }}
                  />

                  <Stack spacing={1}>
                    {OPTIONS.map((opt) => (
                      <TextField
                        key={opt}
                        fullWidth
                        size="small"
                        label={`Option ${opt.toUpperCase()}`}
                        value={q[`option_${opt}` as const]}
                        disabled={disabled}
                        onChange={(e) =>
                          patchQuestion(si, qi, {
                            [`option_${opt}`]: e.target.value,
                          } as Partial<EditableQuestion>)
                        }
                      />
                    ))}
                  </Stack>

                  {/* Four buttons rather than a dropdown. Which option is right
                      is the one field on this card a teacher checks every time,
                      and a select hides the current answer behind a tap. */}
                  <Box sx={{ mt: 1.5 }}>
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{ display: 'block', mb: 0.5 }}
                    >
                      Correct answer
                    </Typography>
                    <ToggleButtonGroup
                      exclusive
                      size="small"
                      value={q.correct_option}
                      disabled={disabled}
                      onChange={(_, v) =>
                        v && patchQuestion(si, qi, { correct_option: v as EditableQuestion['correct_option'] })
                      }
                    >
                      {OPTIONS.map((o) => (
                        <ToggleButton
                          key={o}
                          value={o}
                          aria-label={`Option ${o.toUpperCase()} is correct`}
                          sx={{ minWidth: 48, minHeight: 48, textTransform: 'none', fontWeight: 700 }}
                        >
                          {o.toUpperCase()}
                        </ToggleButton>
                      ))}
                    </ToggleButtonGroup>
                  </Box>

                  <TextField
                    fullWidth
                    size="small"
                    label="Explanation (optional)"
                    value={q.explanation}
                    disabled={disabled}
                    onChange={(e) => patchQuestion(si, qi, { explanation: e.target.value })}
                    sx={{ mt: 1.5 }}
                  />
                </Box>
              ))}

              <Button
                size="small"
                startIcon={<AddIcon />}
                disabled={disabled}
                onClick={() => addQuestion(si)}
                sx={{ alignSelf: 'flex-start', textTransform: 'none', minHeight: 48 }}
              >
                Add question
              </Button>
            </Stack>
          </Box>
        ))}
      </Stack>

      <Button
        startIcon={<AddIcon />}
        disabled={disabled}
        onClick={addSection}
        sx={{ mt: 2, textTransform: 'none', minHeight: 48 }}
      >
        Add checkpoint
      </Button>
    </>
  );
}
