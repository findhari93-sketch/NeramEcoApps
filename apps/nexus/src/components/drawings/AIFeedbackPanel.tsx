'use client';

import {
  Box, Typography, Paper,
  Accordion, AccordionSummary, AccordionDetails,
} from '@neram/ui';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import TipsAndUpdatesOutlinedIcon from '@mui/icons-material/TipsAndUpdatesOutlined';
import TrendingUpOutlinedIcon from '@mui/icons-material/TrendingUpOutlined';

interface AIFeedback {
  grade: string;
  feedback: string[];
  composition?: string;
  proportion?: string;
  shading?: string;
  completeness?: string;
  technique?: string;
  improvement_tip?: string;
  progress_note?: string | null;
}

interface AIFeedbackPanelProps {
  submissionId: string;
  existingFeedback: AIFeedback | null;
  getToken: () => Promise<string | null>;
}

const GRADE_COLORS: Record<string, string> = {
  A: '#2e7d32',
  B: '#1565c0',
  C: '#e65100',
  D: '#c62828',
};

const CRITERIA = [
  { key: 'composition', label: 'Composition', icon: '🎯' },
  { key: 'proportion', label: 'Proportion', icon: '📏' },
  { key: 'shading', label: 'Shading', icon: '🌗' },
  { key: 'completeness', label: 'Completeness', icon: '✅' },
  { key: 'technique', label: 'Technique', icon: '✏️' },
];

/**
 * Read-only display of existing AI feedback.
 * AI generation has been disabled. This component only shows
 * previously generated feedback from old submissions.
 */
export default function AIFeedbackPanel({
  existingFeedback,
}: AIFeedbackPanelProps) {
  const feedback = existingFeedback;

  // No existing feedback, show nothing
  if (!feedback) return null;

  return (
    <Box>
      <Typography variant="caption" fontWeight={600} color="text.secondary" sx={{ mb: 1, display: 'block' }}>
        AI FEEDBACK (PREVIOUSLY GENERATED)
      </Typography>

      {/* Grade badge */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2 }}>
        <Box sx={{
          width: 48, height: 48, borderRadius: '50%', display: 'flex',
          alignItems: 'center', justifyContent: 'center',
          bgcolor: GRADE_COLORS[feedback.grade] || '#666',
          color: '#fff', fontWeight: 700, fontSize: '1.3rem',
        }}>
          {feedback.grade}
        </Box>
        <Box>
          <Typography variant="body2" fontWeight={600}>
            Grade: {feedback.grade}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {feedback.grade === 'A' ? 'Excellent work!' :
             feedback.grade === 'B' ? 'Good, with room for improvement' :
             feedback.grade === 'C' ? 'Needs more practice' :
             'Significant improvement needed'}
          </Typography>
        </Box>
      </Box>

      {/* Feedback points */}
      <Paper variant="outlined" sx={{ p: 1.5, mb: 2 }}>
        {feedback.feedback.map((point, i) => (
          <Box key={i} sx={{ display: 'flex', gap: 1, py: 0.5 }}>
            <CheckCircleOutlineIcon sx={{ fontSize: 16, color: 'primary.main', mt: 0.25, flexShrink: 0 }} />
            <Typography variant="body2" sx={{ lineHeight: 1.5 }}>{point}</Typography>
          </Box>
        ))}
      </Paper>

      {/* Criteria breakdown */}
      <Accordion variant="outlined" disableGutters sx={{ mb: 1.5, '&:before': { display: 'none' } }}>
        <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ minHeight: 40 }}>
          <Typography variant="body2" fontWeight={600}>Detailed Breakdown</Typography>
        </AccordionSummary>
        <AccordionDetails sx={{ pt: 0 }}>
          {CRITERIA.map((c) => {
            const value = (feedback as unknown as Record<string, unknown>)[c.key];
            if (!value) return null;
            return (
              <Box key={c.key} sx={{ mb: 1.5 }}>
                <Typography variant="caption" fontWeight={600} color="text.secondary">
                  {c.icon} {c.label.toUpperCase()}
                </Typography>
                <Typography variant="body2" sx={{ mt: 0.25 }}>{value as string}</Typography>
              </Box>
            );
          })}
        </AccordionDetails>
      </Accordion>

      {/* Improvement tip */}
      {feedback.improvement_tip && (
        <Paper variant="outlined" sx={{ p: 1.5, mb: 1.5, bgcolor: '#fff8e1', borderColor: '#ffe082' }}>
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
            <TipsAndUpdatesOutlinedIcon sx={{ color: '#f9a825', fontSize: 20, mt: 0.25 }} />
            <Box>
              <Typography variant="caption" fontWeight={600} color="text.secondary">
                TIP TO IMPROVE
              </Typography>
              <Typography variant="body2" sx={{ mt: 0.25 }}>{feedback.improvement_tip}</Typography>
            </Box>
          </Box>
        </Paper>
      )}

      {/* Progress note */}
      {feedback.progress_note && (
        <Paper variant="outlined" sx={{ p: 1.5, bgcolor: '#e8f5e9', borderColor: '#a5d6a7' }}>
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
            <TrendingUpOutlinedIcon sx={{ color: '#2e7d32', fontSize: 20, mt: 0.25 }} />
            <Box>
              <Typography variant="caption" fontWeight={600} color="text.secondary">
                PROGRESS
              </Typography>
              <Typography variant="body2" sx={{ mt: 0.25 }}>{feedback.progress_note}</Typography>
            </Box>
          </Box>
        </Paper>
      )}
    </Box>
  );
}
