'use client';

import { useMemo, useState } from 'react';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Chip,
  Paper,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
  useMediaQuery,
  useTheme,
} from '@neram/ui';
import ExpandMoreOutlinedIcon from '@mui/icons-material/ExpandMoreOutlined';
import ImportReviewCard, { type ReviewRow } from '@/components/tests/ImportReviewCard';
import { warningsByKey } from '@/lib/test-draft-health';
import { activeQuestions, totalMarks, type DraftQuestion, type TestDraft } from '@/lib/test-wizard-draft';
import DraftHealthRail from './DraftHealthRail';

/**
 * Step 3. Nothing is saved until this is approved.
 *
 * One screen for all four sources, which is the payoff for making every branch
 * converge on DraftQuestion[]. The row is ImportReviewCard, the same card the
 * paste flow already used, so the six dedupe actions and their wording are
 * shared rather than reimplemented.
 *
 * The Questions / JSON toggle is not decoration: the JSON on the right is the
 * thing stored with the test, and being able to see it here is what makes
 * "download, edit anywhere, re-upload" a promise a teacher can check.
 */
export default function StepReview({
  draft,
  onUpdateQuestion,
  onRemoveQuestion,
  onAskForMore,
}: {
  draft: TestDraft;
  onUpdateQuestion: (key: string, patch: Partial<DraftQuestion>) => void;
  onRemoveQuestion: (key: string) => void;
  onAskForMore?: (slug: string, label: string) => void;
}) {
  const theme = useTheme();
  const compact = useMediaQuery(theme.breakpoints.down('md'));
  const [tab, setTab] = useState<'questions' | 'json'>('questions');

  const shown = activeQuestions(draft);
  const warnings = useMemo(() => warningsByKey(draft), [draft]);
  const issueCount = useMemo(
    () => Object.values(warnings).reduce((n, list) => n + list.length, 0),
    [warnings],
  );

  const asJson = useMemo(
    () =>
      JSON.stringify(
        {
          test: { title: draft.title, suggested_folder: draft.folderPath.join(' / ') },
          questions: shown.map((q) => ({
            question: q.question_text,
            options: q.options ? Object.fromEntries(q.options.map((o) => [o.id, o.text])) : undefined,
            answer: q.correct_answer,
            explanation: q.explanation,
            source_quote: q.source_quote,
            difficulty: q.difficulty,
            exam: q.exam_relevance,
            image_ref: q.image_ref,
            tag_slugs: q.tag_slugs,
          })),
        },
        null,
        2,
      ),
    [draft.title, draft.folderPath, shown],
  );

  const rail = <DraftHealthRail draft={draft} onAskForMore={onAskForMore} />;

  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 1fr) 300px' },
        gap: 2.5,
        alignItems: 'start',
      }}
    >
      <Box>
        <Paper variant="outlined" sx={{ p: { xs: 1.5, md: 2 }, borderRadius: 2, mb: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 700, flex: 1, minWidth: 0 }}>
              {shown.length} question{shown.length === 1 ? '' : 's'} · {totalMarks(draft)} marks
            </Typography>
            {issueCount > 0 && (
              <Chip
                size="small"
                color="warning"
                variant="outlined"
                label={`${issueCount} issue${issueCount === 1 ? '' : 's'}`}
              />
            )}
          </Box>
          <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mt: 1, minHeight: 48 }}>
            <Tab value="questions" label="Questions" sx={{ textTransform: 'none', minHeight: 48 }} />
            <Tab value="json" label="JSON" sx={{ textTransform: 'none', minHeight: 48 }} />
          </Tabs>
        </Paper>

        {/* On a phone the rail becomes a band under the header rather than a
            column, so it stays visible while the rows are scrolled. */}
        {compact && (
          <Accordion variant="outlined" sx={{ mb: 2, borderRadius: 2, '&:before': { display: 'none' } }}>
            <AccordionSummary expandIcon={<ExpandMoreOutlinedIcon />} sx={{ minHeight: 48 }}>
              <Typography variant="body2" sx={{ fontWeight: 700 }}>
                Test health{issueCount > 0 ? ` · ${issueCount} to look at` : ' · all clear'}
              </Typography>
            </AccordionSummary>
            <AccordionDetails sx={{ p: 0 }}>{rail}</AccordionDetails>
          </Accordion>
        )}

        {shown.length === 0 ? (
          <Alert severity="warning">
            There are no questions in this test yet. Go back a step and add some.
          </Alert>
        ) : tab === 'json' ? (
          <TextField
            fullWidth
            multiline
            value={asJson}
            InputProps={{ readOnly: true }}
            sx={{ '& .MuiInputBase-input': { fontFamily: 'monospace', fontSize: 12 } }}
          />
        ) : (
          <Stack spacing={1.25}>
            {shown.map((q, i) => {
              const row: ReviewRow = {
                question: q as any,
                action: q.action,
                suggestedAction: q.action,
                candidates: q.candidates as any,
                existingId: q.existing_question_id,
                useInTest: 'new',
              };
              return (
                <ImportReviewCard
                  key={q.key}
                  row={row}
                  index={i}
                  tagLabels={new Map(q.tag_slugs.map((s) => [s, s.replace(/_/g, ' ')]))}
                  onActionChange={(action) => onUpdateQuestion(q.key, { action })}
                  onUseInTestChange={() => undefined}
                  onCompare={() => undefined}
                  onEditTags={() => undefined}
                  warnings={warnings[q.key]}
                  onDelete={() => onRemoveQuestion(q.key)}
                />
              );
            })}
          </Stack>
        )}
      </Box>

      {!compact && <Box>{rail}</Box>}
    </Box>
  );
}
