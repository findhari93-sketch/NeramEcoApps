'use client';

import { useState } from 'react';
import { Box, Typography, Button, Collapse, CircularProgress } from '@neram/ui';
import AutoAwesomeOutlinedIcon from '@mui/icons-material/AutoAwesomeOutlined';
import MathText from '@/components/common/MathText';

interface ExplanationPanelProps {
  questionId: string;
  /** The short explanation stored on the question. Shown immediately. */
  brief: string | null;
  /** The worked explanation, when one has already been generated for anyone. */
  detailed?: string | null;
  classroomId?: string | null;
  getToken: () => Promise<string | null>;
}

/**
 * The explanation under a reviewed question, plus the way to ask for more.
 *
 * The brief line answers "why is that the answer". The button answers "I still
 * do not follow", which is a different question and the one a student who got
 * it wrong is actually asking. Kept in one component because both the test
 * review and the study-material test show the same thing.
 *
 * The generated text is cached server-side on the question, so `detailed`
 * arriving already populated is the normal case after the first student asks.
 */
export default function ExplanationPanel({
  questionId,
  brief,
  detailed,
  classroomId,
  getToken,
}: ExplanationPanelProps) {
  const [more, setMore] = useState<string | null>(detailed?.trim() ? detailed : null);
  const [open, setOpen] = useState(Boolean(detailed?.trim()));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function explainMore() {
    if (more) {
      setOpen((v) => !v);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const token = await getToken();
      const res = await fetch('/api/student/tests/explain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ question_id: questionId, classroom_id: classroomId || undefined }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'Could not explain this one');
      setMore(json?.data?.explanation || '');
      setOpen(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not explain this one');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Box sx={{ mt: 0.5 }}>
      {brief && (
        <MathText text={brief} variant="caption" color="text.secondary" sx={{ display: 'block' }} />
      )}

      <Button
        size="small"
        onClick={explainMore}
        disabled={loading}
        startIcon={
          loading ? <CircularProgress size={13} /> : <AutoAwesomeOutlinedIcon sx={{ fontSize: 15 }} />
        }
        sx={{ textTransform: 'none', mt: 0.5, minHeight: 36, px: 1, fontSize: '0.78rem' }}
      >
        {loading
          ? 'Working it out'
          : more
            ? open
              ? 'Hide the detailed explanation'
              : 'Show the detailed explanation'
            : 'Explain this in more detail'}
      </Button>

      {error && (
        <Typography variant="caption" color="error" sx={{ display: 'block', mt: 0.25 }}>
          {error}
        </Typography>
      )}

      <Collapse in={open && Boolean(more)}>
        <Box
          sx={{
            mt: 0.75,
            p: 1.25,
            borderRadius: 1.5,
            bgcolor: 'action.hover',
            borderLeft: 3,
            borderColor: 'primary.main',
          }}
        >
          <MathText
            text={more || ''}
            variant="body2"
            sx={{ whiteSpace: 'pre-wrap', lineHeight: 1.6 }}
          />
        </Box>
      </Collapse>
    </Box>
  );
}
