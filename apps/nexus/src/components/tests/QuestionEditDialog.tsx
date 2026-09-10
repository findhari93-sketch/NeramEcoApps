'use client';

/**
 * Edit one question without leaving the results screen.
 *
 * A thin shell around QuestionEditForm, deliberately. That form is the ONE
 * question editor in Nexus, and the standing rule here is that a surface which
 * needs something different passes context rather than forking the component:
 * the last fork of a shared test component quietly shipped a worse second
 * implementation that nobody noticed for months.
 *
 * All this adds is the fetch. The results tab knows a question id and a
 * percentage; the editor needs the whole row, so it is loaded on open.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Box,
  CircularProgress,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  Typography,
  useMediaQuery,
  useTheme,
} from '@neram/ui';
import CloseIcon from '@mui/icons-material/Close';
import QuestionEditForm from '@/components/question-bank/paper/QuestionEditForm';
import type { NexusQBQuestion } from '@neram/database';

interface Props {
  open: boolean;
  onClose: () => void;
  questionId: string | null;
  authFetch: (url: string, init?: RequestInit) => Promise<any>;
  getToken: () => Promise<string | null>;
  /** Reload the analysis: a corrected answer changes what the panel should say. */
  onSaved: () => void;
}

export default function QuestionEditDialog({
  open,
  onClose,
  questionId,
  authFetch,
  getToken,
  onSaved,
}: Props) {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down('md'));

  const [question, setQuestion] = useState<NexusQBQuestion | null>(null);
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!questionId) return;
    setLoading(true);
    setError(null);
    try {
      const json = await authFetch(`/api/question-bank/questions/${questionId}`);
      setQuestion(json.data || null);
      setTagIds(json.data?.tag_ids || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load that question');
    } finally {
      setLoading(false);
    }
  }, [authFetch, questionId]);

  useEffect(() => {
    if (open) load();
    else setQuestion(null);
  }, [open, load]);

  return (
    <Dialog open={open} onClose={onClose} fullScreen={fullScreen} maxWidth="md" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, pr: 1 }}>
        <Typography component="span" sx={{ fontWeight: 700, flex: 1 }}>
          Edit this question
        </Typography>
        <IconButton onClick={onClose} aria-label="Close" sx={{ minWidth: 44, minHeight: 44 }}>
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers sx={{ px: { xs: 1.5, sm: 3 } }}>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}
        {loading || !question ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
            {loading ? <CircularProgress /> : null}
          </Box>
        ) : (
          <QuestionEditForm
            question={question}
            tagIds={tagIds}
            getToken={getToken}
            onSaved={() => {
              onSaved();
              onClose();
            }}
            onCancel={onClose}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
