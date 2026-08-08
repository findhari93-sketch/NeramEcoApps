'use client';

import { useState } from 'react';
import { Box, Paper, Typography } from '@neram/ui';
import QuestionPickerList from '@/components/question-bank/QuestionPickerList';
import type { NexusQBQuestionListItem } from '@neram/database';
import type { DraftQuestion } from '@/lib/test-wizard-draft';

/**
 * Step 2, question-bank branch.
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

export default function SourceBankPanel({
  getToken,
  selected,
  onChange,
}: {
  getToken: () => Promise<string | null>;
  selected: Map<string, NexusQBQuestionListItem>;
  onChange: (next: Map<string, NexusQBQuestionListItem>) => void;
}) {
  const [total, setTotal] = useState<number | null>(null);

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

      <QuestionPickerList
        getToken={getToken}
        selected={selected}
        onChange={onChange}
        showUsage
        onTotalChange={setTotal}
      />
    </Paper>
  );
}
