'use client';

import NextLink from 'next/link';
import { Chip } from '@neram/ui';
import MenuBookOutlinedIcon from '@mui/icons-material/MenuBookOutlined';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined';
import type { QBPracticeOrigin } from '@neram/database/queries/nexus';
import { drewWithHelp, helpUsedWords, readHelpUsed } from '@/lib/qb-help-used';

/**
 * Where a drawing came from, and what the student had open while they made it.
 *
 * Two chips beside the drawing itself, on the student's own sketchbook page and
 * on the teacher's review, from the same component so the two can never say
 * different things about the same sheet. A month of square thumbnails used to
 * give no way at all to tell which one was JEE 2014 Q81B and which was
 * Tuesday's ten minute sketch.
 *
 * The provenance chip is shown to the student as plainly as to the teacher. A
 * record only one side can see is a record the other side cannot argue with.
 */

interface Props {
  /** The bank question this was practised from, if any. */
  origin?: QBPracticeOrigin | null;
  /** drawing_submissions.qb_help_used. */
  helpUsed?: unknown;
  /** Only a question bank drawing gets a "without help" chip. See helpUsedWords. */
  fromQuestionBank?: boolean;
  size?: 'small' | 'medium';
}

/** Where the student goes to read the question again, or to draw it once more. */
export function practiceHrefFor(origin: QBPracticeOrigin): string {
  const query = new URLSearchParams({ qid: origin.qb_question_id });
  if (origin.part_id) query.set('part', origin.part_id);
  return `/student/question-bank/questions?${query.toString()}`;
}

export default function PractisedFrom({
  origin = null,
  helpUsed,
  fromQuestionBank = false,
  size = 'medium',
}: Props) {
  const height = size === 'small' ? 28 : 36;
  const kinds = readHelpUsed(helpUsed);
  const withHelp = drewWithHelp(helpUsed);

  if (!origin && !fromQuestionBank) return null;

  return (
    <>
      {origin && (
        <Chip
          component={NextLink}
          href={practiceHrefFor(origin)}
          clickable
          icon={<MenuBookOutlinedIcon />}
          label={`Practised: ${origin.label}`}
          variant="outlined"
          sx={{ height, maxWidth: '100%', cursor: 'pointer' }}
        />
      )}
      {fromQuestionBank && (
        <Chip
          icon={
            !withHelp ? (
              <CheckCircleOutlineIcon />
            ) : kinds.includes('solution') ? (
              <VisibilityOutlinedIcon />
            ) : (
              <GroupsOutlinedIcon />
            )
          }
          label={helpUsedWords(helpUsed)}
          // Not a warning. Learning from a worked example or from a classmate
          // is a real way to learn drawing, and colouring it as a problem would
          // push students to lie about it or to stop using the door at all.
          color={withHelp ? 'info' : 'success'}
          variant="outlined"
          sx={{ height, maxWidth: '100%' }}
        />
      )}
    </>
  );
}
