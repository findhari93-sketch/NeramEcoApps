'use client';

/**
 * A student's own drawing, as their teacher left it: the stars or marks, the
 * words, the overlay and the teacher reference, and where the drawing came from.
 * Only released reviews reach here (lib/sketchbook-payload, and the owner branch
 * of GET /api/drawing/submissions/[id]), so a held or draft review never shows.
 */

import Link from 'next/link';
import { Alert, Box, Button, Paper, Rating, Typography } from '@neram/ui';
import AssignmentOutlinedIcon from '@mui/icons-material/AssignmentOutlined';
import CollectionsOutlinedIcon from '@mui/icons-material/CollectionsOutlined';
import ImageToggleTabs from '@/components/drawings/ImageToggleTabs';
import type { SketchbookEntry } from '@/lib/sketchbook-payload';

interface StudentDrawingReviewProps {
  entry: SketchbookEntry;
  submission: { original_image_url: string; tutor_feedback: string | null; reviewed_image_url: string | null; corrected_image_url: string | null } | null;
  practisedFrom: { item_id: string; title: string; image_url: string } | null;
}

export default function StudentDrawingReview({ entry, submission, practisedFrom }: StudentDrawingReviewProps) {
  const r = entry.review;
  const maxMarks = entry.assignment?.max_marks ?? null;
  const shown = r.state === 'reviewed' || r.state === 'redo';

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mb: 2 }}>
      {entry.assignment && (
        <Button
          component={Link}
          href={`/student/assignments/${entry.assignment.id}`}
          variant="outlined"
          startIcon={<AssignmentOutlinedIcon />}
          sx={{ minHeight: 48, alignSelf: 'flex-start' }}
        >
          {entry.assignment.title ? `Open ${entry.assignment.title}` : 'Open the assignment'}
        </Button>
      )}

      {r.state === 'waiting' && <Alert severity="info">Your teacher has not reviewed this yet.</Alert>}
      {r.state === 'redo' && (
        <Alert severity="info">
          Your teacher asked you to draw this again.{entry.assignment ? ' Open the assignment to see what to change.' : ''}
        </Alert>
      )}

      {shown && (
        <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
          <Typography variant="subtitle1" component="h2" sx={{ fontWeight: 700, mb: 1 }}>
            Your teacher&apos;s review
          </Typography>
          {r.marks != null && maxMarks ? (
            <Typography variant="body1" sx={{ fontWeight: 600 }}>{r.marks} of {maxMarks} marks</Typography>
          ) : r.rating ? (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Rating value={r.rating} readOnly aria-hidden />
              <Typography variant="body1" sx={{ fontWeight: 600 }}>{r.rating} out of 5 stars</Typography>
            </Box>
          ) : null}
          {submission?.tutor_feedback && (
            <Typography variant="body1" sx={{ mt: 1.5, whiteSpace: 'pre-line', lineHeight: 1.6 }}>
              {submission.tutor_feedback}
            </Typography>
          )}
          {submission && (submission.reviewed_image_url || submission.corrected_image_url) && (
            <Box sx={{ mt: 2 }}>
              <ImageToggleTabs
                originalImageUrl={submission.original_image_url}
                overlayImageUrl={submission.reviewed_image_url}
                correctedImageUrl={submission.corrected_image_url}
                isEditMode={false}
                studentView
                tabLabels={{ corrected: 'Teacher reference' }}
              />
            </Box>
          )}
        </Paper>
      )}

      {practisedFrom ? (
        <Box
          component={Link}
          href={`/student/inspiration/${practisedFrom.item_id}`}
          sx={{
            display: 'flex', alignItems: 'center', gap: 1.5, p: 1, minHeight: 56, borderRadius: 2,
            border: 1, borderColor: 'divider', color: 'text.primary', textDecoration: 'none',
            '&:focus-visible': { outline: '3px solid', outlineColor: 'primary.main', outlineOffset: 2 },
          }}
        >
          <Box component="img" src={practisedFrom.image_url} alt="" sx={{ width: 48, height: 48, objectFit: 'cover', borderRadius: 1, flexShrink: 0 }} />
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontWeight: 600 }}>Practised from Inspiration</Typography>
            <Typography variant="body2" noWrap>{practisedFrom.title}</Typography>
          </Box>
          <CollectionsOutlinedIcon aria-hidden sx={{ ml: 'auto', color: 'text.secondary' }} />
        </Box>
      ) : entry.inspiration_item_id ? (
        <Typography variant="body2" color="text.secondary">
          Practised from an Inspiration drawing that is no longer shown.
        </Typography>
      ) : null}
    </Box>
  );
}
