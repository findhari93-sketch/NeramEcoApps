'use client';

import { useState, useCallback } from 'react';
import {
  Box,
  Typography,
  Chip,
  Button,
  LinearProgress,
  Snackbar,
  Alert,
  CircularProgress,
  alpha,
  useTheme,
} from '@neram/ui';
import SaveIcon from '@mui/icons-material/Save';
import KeyboardIcon from '@mui/icons-material/Keyboard';
import type { NexusQBQuestion, NexusQBQuestionOption } from '@neram/database';
import { useBulkImageFlow, type SlotType, type PendingImages, getEffectiveImage } from '@/hooks/useBulkImageFlow';
import { questionNeedsImage, questionMissingImages } from '@/components/question-bank/AnswerKeyGrid';
import BulkImageQuestionCard from './BulkImageQuestionCard';
import type { ImageState } from '@/lib/bulk-upload-schema';

/** Check if ALL image slots are filled (question + options for MCQ) */
function questionHasAllImages(q: NexusQBQuestion, pending: PendingImages): boolean {
  if (!getEffectiveImage(q, 'question', pending)) return false;
  if (q.question_format === 'MCQ' && q.options) {
    const opts = q.options as NexusQBQuestionOption[];
    if (opts.some((o) => !getEffectiveImage(q, o.id as SlotType, pending))) return false;
  }
  return true;
}

interface BulkImageManagerProps {
  questions: NexusQBQuestion[];
  paperId: string;
  getToken: () => Promise<string | null>;
  onQuestionsUpdated: () => void;
}

export default function BulkImageManager({
  questions,
  paperId,
  getToken,
  onQuestionsUpdated,
}: BulkImageManagerProps) {
  const theme = useTheme();
  const {
    activeSlot,
    setActiveSlot,
    filter,
    setFilter,
    pending,
    setPendingImage,
    clearAllPending,
    pendingCount,
    getPendingEntries,
    advanceToNextEmpty,
    registerSlotRef,
    stats,
  } = useBulkImageFlow(questions);

  const [toast, setToast] = useState<{ message: string; severity: 'success' | 'error' } | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveProgress, setSaveProgress] = useState({ done: 0, total: 0 });

  // Filter questions based on selected mode
  const needsImageQuestions = questions.filter(questionNeedsImage);
  const filteredQuestions =
    filter === 'needs-images'
      ? needsImageQuestions
      : filter === 'missing'
        ? needsImageQuestions.filter(questionMissingImages)
        : questions;

  /** Save all pending images to server */
  const handleSaveAll = useCallback(async () => {
    const entries = getPendingEntries();
    if (entries.length === 0) return;

    setSaving(true);
    setSaveProgress({ done: 0, total: entries.length });

    // Group entries by questionId for batching
    const byQuestion = new Map<string, { slot: SlotType; image: ImageState | null }[]>();
    for (const entry of entries) {
      if (!byQuestion.has(entry.questionId)) {
        byQuestion.set(entry.questionId, []);
      }
      byQuestion.get(entry.questionId)!.push({ slot: entry.slot, image: entry.image });
    }

    let savedCount = 0;
    let errorCount = 0;

    try {
      const token = await getToken();
      if (!token) throw new Error('Auth failed');

      for (const [questionId, slots] of byQuestion) {
        // Build the request body for this question
        const body: Record<string, unknown> = {};
        const optionImages: Record<string, string | null> = {};

        for (const { slot, image } of slots) {
          if (slot === 'question') {
            body.question_image_url = image?.uploaded ? image.url : null;
          } else {
            optionImages[slot] = image?.uploaded ? image.url : null;
          }
        }

        if (Object.keys(optionImages).length > 0) {
          body.option_images = optionImages;
        }

        try {
          const res = await fetch(`/api/question-bank/questions/${questionId}/images`, {
            method: 'PATCH',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
          });

          if (!res.ok) {
            const json = await res.json();
            console.error(`Failed to save Q ${questionId}:`, json.error);
            errorCount++;
          } else {
            savedCount += slots.length;
          }
        } catch {
          errorCount++;
        }

        setSaveProgress((prev) => ({ ...prev, done: prev.done + slots.length }));
      }

      if (errorCount === 0) {
        setToast({ message: `${savedCount} image${savedCount > 1 ? 's' : ''} saved`, severity: 'success' });
        clearAllPending();
        onQuestionsUpdated();
      } else {
        setToast({
          message: `Saved ${savedCount}, ${errorCount} question${errorCount > 1 ? 's' : ''} failed`,
          severity: 'error',
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Save failed';
      setToast({ message, severity: 'error' });
    } finally {
      setSaving(false);
      setSaveProgress({ done: 0, total: 0 });
    }
  }, [getPendingEntries, getToken, clearAllPending, onQuestionsUpdated]);

  const handlePendingChange = useCallback(
    (questionId: string) => (slot: SlotType, image: ImageState | null) => {
      setPendingImage(questionId, slot, image);
      // Auto-advance to next empty slot after paste
      if (image) {
        advanceToNextEmpty(questionId, slot);
      }
    },
    [setPendingImage, advanceToNextEmpty]
  );

  const handleSlotFocus = useCallback(
    (questionId: string) => (slot: SlotType) => {
      setActiveSlot({ questionId, slot });
    },
    [setActiveSlot]
  );

  const progress = stats.total > 0 ? (stats.withImages / stats.total) * 100 : 0;

  return (
    <Box>
      {/* Sticky toolbar */}
      <Box
        sx={{
          position: 'sticky',
          top: 0,
          zIndex: 10,
          bgcolor: 'background.paper',
          pb: 1.5,
          pt: 0.5,
          borderBottom: 1,
          borderColor: 'divider',
          mb: 2,
        }}
      >
        {/* Progress + Save button */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
          <Typography variant="body2" fontWeight={600} sx={{ whiteSpace: 'nowrap' }}>
            {stats.withImages}/{stats.total}
          </Typography>
          <LinearProgress
            variant="determinate"
            value={progress}
            sx={{
              flex: 1,
              height: 8,
              borderRadius: 4,
              bgcolor: alpha(theme.palette.success.main, 0.12),
              '& .MuiLinearProgress-bar': {
                bgcolor: 'success.main',
                borderRadius: 4,
              },
            }}
          />
          <Button
            variant="contained"
            size="small"
            color="primary"
            startIcon={saving ? <CircularProgress size={16} color="inherit" /> : <SaveIcon />}
            onClick={handleSaveAll}
            disabled={pendingCount === 0 || saving}
            sx={{ whiteSpace: 'nowrap', minWidth: 'auto' }}
          >
            {saving
              ? `Saving ${saveProgress.done}/${saveProgress.total}...`
              : pendingCount > 0
                ? `Save All (${pendingCount})`
                : 'Saved'}
          </Button>
        </Box>

        {/* Filter + hint */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
          <Chip
            label={`Needs Images (${needsImageQuestions.length})`}
            size="small"
            onClick={() => setFilter('needs-images')}
            variant={filter === 'needs-images' ? 'filled' : 'outlined'}
            color={filter === 'needs-images' ? 'primary' : 'default'}
            sx={{ fontWeight: 600, fontSize: '0.75rem' }}
          />
          <Chip
            label={`Missing (${needsImageQuestions.filter(questionMissingImages).length})`}
            size="small"
            onClick={() => setFilter('missing')}
            variant={filter === 'missing' ? 'filled' : 'outlined'}
            color={filter === 'missing' ? 'warning' : 'default'}
            sx={{ fontWeight: 600, fontSize: '0.75rem' }}
          />
          <Chip
            label={`All (${questions.length})`}
            size="small"
            onClick={() => setFilter('all')}
            variant={filter === 'all' ? 'filled' : 'outlined'}
            color={filter === 'all' ? 'default' : 'default'}
            sx={{ fontWeight: 600, fontSize: '0.75rem' }}
          />
          <Box sx={{ flex: 1 }} />
          <Box sx={{ display: { xs: 'none', sm: 'flex' }, alignItems: 'center', gap: 0.5 }}>
            <KeyboardIcon sx={{ fontSize: 14, color: 'text.disabled' }} />
            <Typography variant="caption" color="text.disabled">
              Click a slot chip, then Ctrl+V to paste
            </Typography>
          </Box>
        </Box>
      </Box>

      {/* Question cards */}
      {filteredQuestions.length === 0 ? (
        <Box sx={{ textAlign: 'center', py: 6 }}>
          <Typography variant="h6" color="text.secondary" gutterBottom>
            All images are uploaded!
          </Typography>
          <Typography variant="body2" color="text.disabled">
            {filter === 'missing'
              ? 'All detected images are uploaded! Switch to "Needs Images" to review.'
              : filter === 'needs-images'
                ? 'No questions detected as needing images.'
                : 'No questions in this paper.'}
          </Typography>
        </Box>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {filteredQuestions.map((q) => (
            <BulkImageQuestionCard
              key={q.id}
              question={q}
              activeSlot={activeSlot?.questionId === q.id ? activeSlot.slot : null}
              onSlotFocus={handleSlotFocus(q.id)}
              onPendingChange={handlePendingChange(q.id)}
              getToken={getToken}
              registerSlotRef={registerSlotRef}
              pending={pending}
            />
          ))}
        </Box>
      )}

      {/* Toast */}
      <Snackbar
        open={!!toast}
        autoHideDuration={3000}
        onClose={() => setToast(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        {toast ? (
          <Alert
            severity={toast.severity}
            variant="filled"
            onClose={() => setToast(null)}
            sx={{ fontSize: '0.8rem' }}
          >
            {toast.message}
          </Alert>
        ) : undefined}
      </Snackbar>
    </Box>
  );
}
