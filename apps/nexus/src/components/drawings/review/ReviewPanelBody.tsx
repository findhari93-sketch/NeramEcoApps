'use client';

/**
 * The feedback rail: everything between the panel header and the action bar.
 *
 * This stack used to be written out twice, once per layout branch, so every
 * change to the rail had to be made in both places or it silently applied to one
 * width only. It is now rendered once and the two densities are `sx`
 * breakpoints.
 *
 * The banners and the voice recorder arrive as nodes because the page already
 * builds them once and they close over its handlers.
 *
 * There is no comment thread here any more. The written feedback and the voice
 * note already are the teacher's words to the student, and a second box for
 * the same thing was never used (15 comments in the life of the feature). What a
 * student wrote is still shown, read only, in the "From the student" card, so
 * nothing they said goes unseen.
 */

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Box, Paper, Typography } from '@neram/ui';
import AIFeedbackWorkspace, { type WorkspaceData } from '@/components/drawings/AIFeedbackWorkspace';
import TagEditor from '@/components/drawings/TagEditor';
import QuietLinksRow, { type QuietLink } from './QuietLinksRow';
import type { AiDraft } from '@/lib/drawing-ai-draft';
import type { AutoDraftState } from '@/hooks/useAutoDraft';

export interface ReviewPanelBodyProps {
  submissionId: string;
  /** The raw submission row, which AIFeedbackWorkspace reads widely. */
  submission: any;
  getToken: () => Promise<string | null>;
  onWorkspaceChange: (data: WorkspaceData) => void;
  isEditMode: boolean;
  sketchTrigger: number;
  evaluationType: 'marks' | 'stars';
  maxMarks: number;

  /** The student's own note on their upload, when they left one. */
  selfNote?: string | null;

  supersededBanner: ReactNode;
  reReviewNotice: ReactNode;
  voiceSection: ReactNode;
  previousAttemptsPanel: ReactNode;

  tagLabels: string[];
  onTagLabelsChange: (labels: string[]) => void;

  aiDraft?: AiDraft | null;
  /** Where Gemini's draft for this sheet stands. */
  draftState?: AutoDraftState | null;
}

interface StudentComment {
  id: string;
  comment_text: string;
}

export default function ReviewPanelBody({
  submissionId, submission, getToken, onWorkspaceChange, isEditMode, sketchTrigger,
  evaluationType, maxMarks, selfNote,
  supersededBanner, reReviewNotice, voiceSection, previousAttemptsPanel,
  tagLabels, onTagLabelsChange, aiDraft = null, draftState = null,
}: ReviewPanelBodyProps) {
  const drafting = draftState?.phase === 'drafting';
  const [studentComments, setStudentComments] = useState<StudentComment[]>([]);
  // getToken is a fresh function every render; an effect keyed on it would
  // refetch forever.
  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const token = await getTokenRef.current();
        const res = await fetch(`/api/drawing/submissions/${submissionId}/comments`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const data = await res.json();
        const fromStudent = ((data.comments || []) as any[])
          .filter((c) => c.author_role === 'student' && typeof c.comment_text === 'string' && c.comment_text.trim())
          .map((c) => ({ id: String(c.id), comment_text: c.comment_text as string }));
        if (!cancelled) setStudentComments(fromStudent);
      } catch {
        // A missing comment never blocks a review.
      }
    })();
    return () => { cancelled = true; };
  }, [submissionId]);

  const tagsMeta = tagLabels.length
    ? tagLabels.join(', ')
    : drafting
      ? 'Gemini adds these with its draft'
      : 'None yet';

  const quietLinks: QuietLink[] = isEditMode
    ? [{
        key: 'tags',
        label: 'Tags',
        meta: tagsMeta,
        content: <TagEditor value={tagLabels} onChange={onTagLabelsChange} />,
      }]
    : [];

  const hasStudentWords = !!selfNote || studentComments.length > 0;

  return (
    <>
      {supersededBanner}
      {reReviewNotice}

      {hasStudentWords && (
        <Paper
          variant="outlined"
          sx={{ p: { xs: 1, md: 1.5 }, mb: { xs: 1.5, md: 2 }, bgcolor: '#f0f7ff' }}
        >
          <Typography variant="caption" fontWeight={700} color="primary.dark">
            From the student
          </Typography>
          {selfNote && (
            <Typography variant="body2" sx={{ mt: 0.25, fontSize: { xs: '0.82rem', md: '0.875rem' } }}>
              {selfNote}
            </Typography>
          )}
          {studentComments.map((c) => (
            <Typography
              key={c.id}
              variant="body2"
              sx={{ mt: 0.5, fontSize: { xs: '0.82rem', md: '0.875rem' }, whiteSpace: 'pre-wrap' }}
            >
              {c.comment_text}
            </Typography>
          ))}
        </Paper>
      )}

      <AIFeedbackWorkspace
        submission={submission}
        getToken={getToken}
        onChange={onWorkspaceChange}
        defaultCollapsed={false}
        readOnly={!isEditMode}
        sketchTrigger={sketchTrigger}
        evaluationType={evaluationType}
        maxMarks={maxMarks}
        voiceSlot={voiceSection}
        aiDraft={aiDraft}
        draftState={draftState}
      />

      {/* Kept open: on a redo round the earlier attempts are the context. */}
      {previousAttemptsPanel}

      {quietLinks.length > 0 && <QuietLinksRow items={quietLinks} />}
    </>
  );
}
