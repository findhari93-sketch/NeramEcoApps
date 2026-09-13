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
 * builds them once and they close over its handlers. Phase 1 replaces the middle
 * of this stack with the staged rail (01 SCORE / 02 SAY IT / 03 SEND); keeping
 * the ordering in one file is what makes that a single edit.
 */

import type { ReactNode } from 'react';
import { Box, Paper, Typography } from '@neram/ui';
import AIFeedbackWorkspace, { type WorkspaceData } from '@/components/drawings/AIFeedbackWorkspace';
import CommentSection from '@/components/drawings/CommentSection';
import TagEditor from '@/components/drawings/TagEditor';
import QuietLinksRow, { type QuietLink } from './QuietLinksRow';

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
}

export default function ReviewPanelBody({
  submissionId, submission, getToken, onWorkspaceChange, isEditMode, sketchTrigger,
  evaluationType, maxMarks, selfNote,
  supersededBanner, reReviewNotice, voiceSection, previousAttemptsPanel,
  tagLabels, onTagLabelsChange,
}: ReviewPanelBodyProps) {
  const quietLinks: QuietLink[] = [
    ...(isEditMode
      ? [{
          key: 'tags',
          label: 'Tags',
          meta: tagLabels.length ? String(tagLabels.length) : undefined,
          content: <TagEditor value={tagLabels} onChange={onTagLabelsChange} />,
        }]
      : []),
    {
      key: 'comments',
      label: 'Comments',
      content: <CommentSection submissionId={submissionId} getToken={getToken} canComment={true} />,
    },
  ];

  return (
    <>
      {supersededBanner}
      {reReviewNotice}

      {selfNote && (
        <Paper
          variant="outlined"
          sx={{ p: { xs: 1, md: 1.5 }, mb: { xs: 1.5, md: 2 }, bgcolor: '#f0f7ff' }}
        >
          <Typography variant="caption" fontWeight={600} color="primary.dark">
            Student&apos;s Note
          </Typography>
          <Typography variant="body2" sx={{ mt: 0.25, fontSize: { xs: '0.82rem', md: '0.875rem' } }}>
            {selfNote}
          </Typography>
        </Paper>
      )}

      {/* 01 Score and 02 Say it live together in the workspace, with the voice
          note beside the written feedback. The action bar below is 03 Send. */}
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
      />

      {/* Kept open: on a redo round the earlier attempts are the context. */}
      {previousAttemptsPanel}

      <QuietLinksRow items={quietLinks} />
    </>
  );
}
