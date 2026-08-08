'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  FormControlLabel,
  IconButton,
  MenuItem,
  Paper,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@neram/ui';
import AddOutlinedIcon from '@mui/icons-material/AddOutlined';
import RemoveOutlinedIcon from '@mui/icons-material/RemoveOutlined';
import AutoAwesomeOutlinedIcon from '@mui/icons-material/AutoAwesomeOutlined';
import { TEST_JSON_SPEC } from '@/lib/qb-import-schema';
import type { DraftFormat, TestDraft } from '@/lib/test-wizard-draft';
import CostEstimateRail, { type CostEstimateState } from './CostEstimateRail';

/**
 * Step 2, AI branch.
 *
 * Count, difficulty and question types are set BEFORE anything is spent, and
 * the cost of that exact configuration is shown beside them. Changing any
 * control re-quotes.
 */

const FORMAT_CHOICES: Array<{ value: DraftFormat; label: string }> = [
  { value: 'MCQ', label: 'MCQ' },
  { value: 'NUMERICAL', label: 'Numeric' },
  { value: 'DRAWING_PROMPT', label: 'Drawing' },
];

const MIN_COUNT = 5;
const MAX_COUNT = 60;

interface RecapOption {
  scheduled_class_id: string;
  title: string;
}

export default function SourceAiPanel({
  draft,
  onPatch,
  onGenerated,
  authFetch,
  classroomId,
}: {
  draft: TestDraft;
  onPatch: (patch: Partial<TestDraft['ai']>) => void;
  onGenerated: (payload: { questions: any[]; proposedTags: any[]; title: string; folderPath: string[] }) => void;
  authFetch: (url: string, init?: RequestInit) => Promise<any>;
  classroomId: string | null;
}) {
  const { ai } = draft;
  const [estimate, setEstimate] = useState<CostEstimateState | null>(null);
  const [estimating, setEstimating] = useState(false);
  const [estimateFailed, setEstimateFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [manualPrompt, setManualPrompt] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [recaps, setRecaps] = useState<RecapOption[] | null>(null);

  // ── Re-quote whenever the controls change ────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    setEstimating(true);
    const timer = setTimeout(async () => {
      try {
        const json = await authFetch('/api/question-bank/tests/generate/estimate', {
          method: 'POST',
          body: JSON.stringify({
            mode: ai.mode,
            count: ai.count,
            formats: ai.formats,
            steer_chars: ai.steer.length,
          }),
        });
        if (!cancelled) {
          setEstimate(json.data);
          setEstimateFailed(false);
        }
      } catch {
        // A missing quote must not block generating. The server enforces the
        // budget either way; this rail is information, not a gate. It is marked
        // failed rather than left null so the rail can say so instead of
        // showing a skeleton that never resolves.
        if (!cancelled) {
          setEstimate(null);
          setEstimateFailed(true);
        }
      } finally {
        if (!cancelled) setEstimating(false);
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [ai.mode, ai.count, ai.formats, ai.steer.length, authFetch]);

  // ── Classes whose recording already has a transcript ─────────────────────
  useEffect(() => {
    if (ai.mode !== 'recording' || recaps !== null || !classroomId) return;
    let cancelled = false;
    (async () => {
      try {
        const json = await authFetch(`/api/class-recaps?classroomId=${classroomId}`);
        if (cancelled) return;
        const rows = (json.recaps || json.data || [])
          .filter((r: any) => r.scheduled_class_id)
          .map((r: any) => ({ scheduled_class_id: r.scheduled_class_id, title: r.title || 'Untitled class' }));
        setRecaps(rows);
      } catch {
        if (!cancelled) setRecaps([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ai.mode, recaps, classroomId, authFetch]);

  const copySpec = useCallback(() => {
    navigator.clipboard?.writeText(TEST_JSON_SPEC).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
      },
      () => setError('Could not copy to the clipboard'),
    );
  }, []);

  const generate = useCallback(async () => {
    setBusy(true);
    setError(null);
    setManualPrompt(null);
    try {
      const json = await authFetch('/api/question-bank/tests/generate', {
        method: 'POST',
        body: JSON.stringify({
          mode: ai.mode,
          topic: ai.topic,
          class_id: ai.classId,
          file_id: ai.fileId,
          steer: ai.steer,
          count: ai.count,
          difficulty: ai.difficulty,
          formats: ai.formats,
        }),
      });
      onGenerated({
        questions: json.data.questions || [],
        proposedTags: json.data.proposed_tags || [],
        title: json.data.test?.title || '',
        folderPath: json.data.test?.folder_path || [],
      });
    } catch (err: any) {
      // A 409 is manual mode or a spent budget. Not a failure: the prompt comes
      // back so the teacher can run it elsewhere and return via Upload JSON.
      if (err?.manualPrompt) setManualPrompt(err.manualPrompt);
      setError(err instanceof Error ? err.message : 'Could not generate questions');
    } finally {
      setBusy(false);
    }
  }, [ai, authFetch, onGenerated]);

  const missingSource =
    (ai.mode === 'topic' && !ai.topic.trim()) ||
    (ai.mode === 'recording' && !ai.classId) ||
    (ai.mode === 'pdf' && !ai.fileId);

  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 1fr) 300px' },
        gap: 2.5,
        alignItems: 'start',
      }}
    >
      <Paper
        variant="outlined"
        sx={{ p: { xs: 2, md: 2.5 }, borderRadius: 2, gridColumn: { md: 1 }, gridRow: { md: 1 } }}
      >
        <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1.5 }}>
          What should the AI read?
        </Typography>

        <ToggleButtonGroup
          exclusive
          size="small"
          value={ai.mode}
          onChange={(_, v) => v && onPatch({ mode: v })}
          sx={{ flexWrap: 'wrap', mb: 2 }}
        >
          <ToggleButton value="topic" sx={{ textTransform: 'none', minHeight: 48, px: 2 }}>
            Topic prompt
          </ToggleButton>
          <ToggleButton value="recording" sx={{ textTransform: 'none', minHeight: 48, px: 2 }}>
            Class recording
          </ToggleButton>
          <ToggleButton value="pdf" sx={{ textTransform: 'none', minHeight: 48, px: 2 }}>
            Chapter PDF
          </ToggleButton>
        </ToggleButtonGroup>

        {ai.mode === 'topic' && (
          <TextField
            fullWidth
            size="small"
            label="Topic"
            placeholder="Two-point perspective, vanishing points and eye level"
            value={ai.topic}
            onChange={(e) => onPatch({ topic: e.target.value })}
            sx={{ mb: 2, '& .MuiInputBase-input': { fontSize: 16 } }}
          />
        )}

        {ai.mode === 'recording' && (
          <Box sx={{ mb: 2 }}>
            {recaps === null ? (
              <CircularProgress size={20} />
            ) : recaps.length === 0 ? (
              <Alert severity="info">
                No class in this classroom has a captured transcript yet. Transcripts are captured on the
                class page after a recording arrives.
              </Alert>
            ) : (
              <TextField
                select
                fullWidth
                size="small"
                label="Class recording"
                value={ai.classId || ''}
                onChange={(e) => onPatch({ classId: e.target.value })}
                sx={{ '& .MuiInputBase-input': { fontSize: 16 } }}
              >
                {recaps.map((r) => (
                  <MenuItem key={r.scheduled_class_id} value={r.scheduled_class_id} sx={{ minHeight: 48 }}>
                    {r.title}
                  </MenuItem>
                ))}
              </TextField>
            )}
            {ai.classId && (
              <Chip size="small" label="transcript ready" color="success" variant="outlined" sx={{ mt: 1 }} />
            )}
          </Box>
        )}

        {ai.mode === 'pdf' && !ai.fileId && (
          <Alert severity="info" sx={{ mb: 2 }}>
            Start this from the chapter itself, in Study materials. The chapter page knows which PDF to
            send, and it is one press from there.
          </Alert>
        )}

        <TextField
          fullWidth
          size="small"
          multiline
          minRows={2}
          label="Steer it (optional)"
          placeholder="Focus on vanishing points and eye level, avoid history questions"
          value={ai.steer}
          onChange={(e) => onPatch({ steer: e.target.value })}
          sx={{ mb: 2.5, '& .MuiInputBase-input': { fontSize: 16 } }}
        />

        <Box sx={{ display: 'grid', gap: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2 }}>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              Questions
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <IconButton
                aria-label="Fewer questions"
                onClick={() => onPatch({ count: Math.max(MIN_COUNT, ai.count - 5) })}
                disabled={ai.count <= MIN_COUNT}
                sx={{ minWidth: 48, minHeight: 48 }}
              >
                <RemoveOutlinedIcon />
              </IconButton>
              <Typography sx={{ fontWeight: 700, minWidth: 32, textAlign: 'center' }}>{ai.count}</Typography>
              <IconButton
                aria-label="More questions"
                onClick={() => onPatch({ count: Math.min(MAX_COUNT, ai.count + 5) })}
                disabled={ai.count >= MAX_COUNT}
                sx={{ minWidth: 48, minHeight: 48 }}
              >
                <AddOutlinedIcon />
              </IconButton>
            </Box>
          </Box>

          <Box>
            <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.75 }}>
              Difficulty
            </Typography>
            <ToggleButtonGroup
              exclusive
              size="small"
              value={ai.difficulty}
              onChange={(_, v) => v && onPatch({ difficulty: v })}
            >
              {(['easy', 'mixed', 'hard'] as const).map((d) => (
                <ToggleButton key={d} value={d} sx={{ textTransform: 'capitalize', minHeight: 48, px: 2.5 }}>
                  {d}
                </ToggleButton>
              ))}
            </ToggleButtonGroup>
          </Box>

          <Box>
            <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.25 }}>
              Question types
            </Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
              {FORMAT_CHOICES.map((f) => (
                <FormControlLabel
                  key={f.value}
                  sx={{ minHeight: 48, mr: 1 }}
                  control={
                    <Checkbox
                      checked={ai.formats.includes(f.value)}
                      onChange={(e) =>
                        onPatch({
                          formats: e.target.checked
                            ? [...ai.formats, f.value]
                            : ai.formats.filter((x) => x !== f.value),
                        })
                      }
                    />
                  }
                  label={f.label}
                />
              ))}
            </Box>
          </Box>
        </Box>

      </Paper>

      {/* Second in the DOM, so on a phone the cost sits between the controls
          and the button: the number is read on the way to pressing it rather
          than scrolled past. On desktop it spans both rows as a right rail. */}
      <Box sx={{ gridColumn: { md: 2 }, gridRow: { md: '1 / span 2' } }}>
        <CostEstimateRail
          estimate={estimate}
          loading={estimating}
          unavailable={estimateFailed}
          onCopySpec={copySpec}
          copied={copied}
        />
      </Box>

      <Box sx={{ gridColumn: { md: 1 }, gridRow: { md: 2 } }}>
        {error && (
          <Alert severity={manualPrompt ? 'info' : 'error'} sx={{ mb: 2 }}>
            {error}
            {manualPrompt && (
              <Button
                size="small"
                onClick={() => navigator.clipboard?.writeText(manualPrompt)}
                sx={{ textTransform: 'none', display: 'block', mt: 1, minHeight: 44 }}
              >
                Copy the prompt and run it yourself
              </Button>
            )}
          </Alert>
        )}

        <Button
          fullWidth
          variant="contained"
          onClick={generate}
          disabled={busy || missingSource || estimate?.allowed === false}
          startIcon={busy ? <CircularProgress size={16} color="inherit" /> : <AutoAwesomeOutlinedIcon />}
          sx={{ textTransform: 'none', minHeight: 48 }}
        >
          {busy ? 'Writing questions' : `Generate ${ai.count} questions`}
        </Button>
      </Box>
    </Box>
  );
}
