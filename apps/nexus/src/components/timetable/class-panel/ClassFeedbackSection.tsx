'use client';

import { useState } from 'react';
import { Box, Collapse, Rating, Typography } from '@neram/ui';
import StarRoundedIcon from '@mui/icons-material/StarRounded';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import MeetingRecap from '../MeetingRecap';
import type { ClassPanelTabProps } from './types';

/**
 * What the class was worth, in the students' own words.
 *
 * Ratings from the "Rate Class" flow land in nexus_class_reviews; this is where
 * a teacher reads them, average, per-student stars and comments, alongside
 * attendance. Students do not get this: "What we did" plus their own attendance
 * badge and Rate Class already cover their after-class view.
 */
export default function ClassFeedbackSection({
  cls,
  classroomId,
  role,
  getToken,
  averageRating,
}: ClassPanelTabProps) {
  const [expanded, setExpanded] = useState(false);

  if (role !== 'teacher') return null;

  return (
    <>
      <Box
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        onClick={() => setExpanded(!expanded)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setExpanded(!expanded);
          }
        }}
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          py: 1,
          minHeight: 48,
          cursor: 'pointer',
          borderRadius: 1,
          '&:hover': { bgcolor: 'action.hover' },
          '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: -2 },
        }}
      >
        <StarRoundedIcon sx={{ color: 'warning.main' }} />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
            Class feedback
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {averageRating != null
              ? `${averageRating}/5 average · tap for reviews & attendance`
              : 'No student ratings yet · tap for attendance'}
          </Typography>
        </Box>
        {averageRating != null && <Rating value={averageRating} precision={0.1} size="small" readOnly />}
        {expanded ? (
          <ExpandLessIcon sx={{ color: 'text.secondary' }} />
        ) : (
          <ExpandMoreIcon sx={{ color: 'text.secondary' }} />
        )}
      </Box>

      <Collapse in={expanded} unmountOnExit>
        <Box sx={{ mt: 1 }}>
          <MeetingRecap classId={cls.id} classroomId={classroomId} getToken={getToken} role={role} />
        </Box>
      </Collapse>
    </>
  );
}
