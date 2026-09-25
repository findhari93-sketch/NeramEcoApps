'use client';

import { useState } from 'react';
import { Box, Button, Paper, Typography } from '@neram/ui';
import QuestionPickerList, { type PickerPaper } from '@/components/question-bank/QuestionPickerList';
import { paperTitles } from '@neram/database';
import type { NexusQBQuestionListItem } from '@neram/database';
import type { DraftQuestion } from '@/lib/test-wizard-draft';

/**
 * Step 2, question-bank branch.
 *
 * One bank, past papers included. "Previous-year paper" used to be a separate
 * source card even though its questions always lived here, and it could not
 * answer "every Islamic Architecture question across every past paper". Past
 * papers are now a Source filter; picking one sitting offers the whole paper as
 * an exam-faithful mock, which is the one job the old card did that a filter
 * cannot (sections, marking and timing kept).
 *
 * Reuse beats regenerate: no AI cost, already-vetted questions. The "used in N
 * tests" chip is the point of the whole screen, because over-recycling is
 * invisible otherwise, and it is why this passes showUsage.
 *
 * The picker itself is the shared QuestionPickerList, the same one the prep-test
 * flow uses. /teacher/tests/new used to carry a forked copy; that fork went with
 * the page this wizard replaced.
 */

/** A bank row already exists, so it is referenced, never re-authored. */
export function bankQuestionToDraft(q: NexusQBQuestionListItem): DraftQuestion {
  return {
    key: `bank-${q.id}`,
    bank_question_id: q.id,
    question_text: q.question_text || '',
    question_format: (q.question_format as DraftQuestion['question_format']) || 'MCQ',
    options: (q.options as DraftQuestion['options']) ?? null,
    correct_answer: q.correct_answer || '',
    explanation: q.explanation_brief || null,
    source_quote: null,
    image_ref: null,
    difficulty: (q.difficulty as DraftQuestion['difficulty']) || 'MEDIUM',
    exam_relevance: (q.exam_relevance as DraftQuestion['exam_relevance']) || 'BOTH',
    tag_ids: (q.tags || []).map((t: any) => t.id),
    tag_slugs: (q.tags || []).map((t: any) => t.slug),
    new_tag_slugs: [],
    marks: 1,
    negative_marks: 0,
    // Never 'create': the question is already in the bank, and re-authoring it
    // would put a second copy there every time it is used in a test.
    action: 'reuse',
    existing_question_id: q.id,
    candidates: [],
  };
}

/**
 * A wizard test marks itself, so only formats a machine can score belong in it.
 * The picker's own caption already said so, but nothing passed the filter, and
 * drawing prompts could be ticked into a test that would score them zero.
 * Module level so the picker's fetch key stays stable between renders.
 */
const SELF_MARKING_FORMATS = ['MCQ', 'NUMERICAL'];

export default function SourceBankPanel({
  getToken,
  selected,
  onChange,
  onUseWholePaper,
}: {
  getToken: () => Promise<string | null>;
  selected: Map<string, NexusQBQuestionListItem>;
  onChange: (next: Map<string, NexusQBQuestionListItem>) => void;
  /** Hands one paper sitting to the exam-faithful mock import. */
  onUseWholePaper: (paperId: string) => void;
}) {
  const [total, setTotal] = useState<number | null>(null);
  const [paper, setPaper] = useState<PickerPaper | null>(null);

  return (
    <Paper variant="outlined" sx={{ p: { xs: 1.5, md: 2.5 }, borderRadius: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, mb: 1.5, flexWrap: 'wrap' }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
          Pick from the question bank
        </Typography>
        {total !== null && (
          <Typography variant="body2" color="text.secondary">
            {total} question{total === 1 ? '' : 's'} match
          </Typography>
        )}
      </Box>

      {paper && (
        <Box
          sx={{
            display: 'flex',
            flexDirection: { xs: 'column', sm: 'row' },
            alignItems: { xs: 'stretch', sm: 'center' },
            gap: 1.5,
            p: 1.5,
            mb: 1.5,
            borderRadius: 2,
            border: '1px solid',
            borderColor: 'primary.light',
            bgcolor: 'action.hover',
          }}
        >
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="body2" sx={{ fontWeight: 700 }}>
              Use {paperTitles(paper).title} as a full mock?
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Keeps the paper&apos;s sections, marking and timing, so students sit it as they would on exam day.
            </Typography>
          </Box>
          <Button
            variant="outlined"
            onClick={() => onUseWholePaper(paper.id)}
            sx={{ minHeight: 48, textTransform: 'none', fontWeight: 600, flexShrink: 0 }}
          >
            Use the whole paper
          </Button>
        </Box>
      )}

      <QuestionPickerList
        getToken={getToken}
        selected={selected}
        onChange={onChange}
        showUsage
        fullFilters
        formats={SELF_MARKING_FORMATS}
        onPaperChange={setPaper}
        onTotalChange={setTotal}
      />
    </Paper>
  );
}
