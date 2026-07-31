'use client';

/**
 * Import questions from an external AI and build a test out of them.
 *
 * Four steps: copy a prompt, paste the reply, review what came back (tags and
 * duplicates), name and file the test. The teacher attaches the chapter PDF in
 * ChatGPT or Gemini themselves, which is why this is a copy/paste contract
 * rather than an in-app model call.
 *
 * Mirrors the tagging assistant's shape deliberately: same prompt-then-paste
 * rhythm, same "a bad row is dropped, never fatal" handling.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Box,
  Typography,
  Button,
  IconButton,
  Paper,
  TextField,
  MenuItem,
  Chip,
  Alert,
  Snackbar,
  Stepper,
  Step,
  StepLabel,
  CircularProgress,
  Divider,
  Switch,
  FormControlLabel,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  LinearProgress,
} from '@neram/ui';
import ArrowBackOutlinedIcon from '@mui/icons-material/ArrowBackOutlined';
import ContentCopyOutlinedIcon from '@mui/icons-material/ContentCopyOutlined';
import AutoAwesomeOutlinedIcon from '@mui/icons-material/AutoAwesomeOutlined';
import CheckCircleOutlinedIcon from '@mui/icons-material/CheckCircleOutlined';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import TagPicker from '@/components/question-bank/TagPicker';
import ImportReviewCard, { type ReviewRow, type RowAction } from '@/components/tests/ImportReviewCard';
import {
  buildImportPrompt,
  validateImportJSON,
  type ImportExam,
  type ImportRegistryTag,
  type ProposedTag,
} from '@/lib/qb-import-schema';

const STEPS = ['Copy prompt', 'Paste reply', 'Review', 'Create test'];

export default function ImportTestPage() {
  const router = useRouter();
  const { getToken, isTeacher } = useNexusAuthContext();

  const [step, setStep] = useState(0);
  const [registry, setRegistry] = useState<ImportRegistryTag[]>([]);
  const [registryLoaded, setRegistryLoaded] = useState(false);

  // Step 1
  const [chapter, setChapter] = useState('');
  const [exam, setExam] = useState<ImportExam>('NATA');
  const [count, setCount] = useState(30);
  const [folderPath, setFolderPath] = useState('');

  // Step 2
  const [pasted, setPasted] = useState('');
  const [problems, setProblems] = useState<{ errors: string[]; warnings: string[] }>({ errors: [], warnings: [] });

  // Step 3
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [proposedTags, setProposedTags] = useState<Array<ProposedTag & { approved: boolean }>>([]);
  const [checking, setChecking] = useState(false);
  const [tagEditFor, setTagEditFor] = useState<number | null>(null);

  // Step 4
  const [title, setTitle] = useState('');
  const [passingPct, setPassingPct] = useState(60);
  const [publish, setPublish] = useState(true);
  const [creating, setCreating] = useState(false);

  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const authFetch = useCallback(
    async (url: string, init?: RequestInit) => {
      const token = await getToken();
      if (!token) throw new Error('Not signed in');
      const res = await fetch(url, {
        ...init,
        headers: {
          Authorization: `Bearer ${token}`,
          ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
          ...(init?.headers || {}),
        },
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || 'Request failed');
      }
      return res.json();
    },
    [getToken],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const json = await authFetch('/api/question-bank/tags');
        if (cancelled) return;
        setRegistry(
          (json.data || []).map((t: any) => ({
            id: t.id,
            slug: t.slug,
            label: t.label,
            group_type: t.group_type,
          })),
        );
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load tags');
      } finally {
        if (!cancelled) setRegistryLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authFetch]);

  /** Label for a tag id or a pending new-tag slug, for the review chips. */
  const tagLabels = useMemo(() => {
    const map = new Map<string, string>();
    for (const t of registry) map.set(t.slug, t.label);
    for (const p of proposedTags) map.set(p.slug, `${p.label} (new)`);
    return map;
  }, [registry, proposedTags]);

  const folderSegments = useMemo(
    () => folderPath.split('/').map((s) => s.trim()).filter(Boolean),
    [folderPath],
  );

  async function copyPrompt() {
    try {
      const prompt = buildImportPrompt(registry, {
        chapter: chapter.trim() || undefined,
        exam,
        count,
        folderPath: folderSegments,
      });
      await navigator.clipboard.writeText(prompt);
      setToast('Prompt copied. Open ChatGPT or Gemini, attach your PDF, and paste it.');
      setStep(1);
    } catch {
      setError('Could not copy to the clipboard. Select the prompt text and copy it manually.');
    }
  }

  /** Parse the paste, then ask the server which of these we already have. */
  async function checkAndPreview() {
    setChecking(true);
    setError(null);
    try {
      const result = validateImportJSON(pasted, registry);
      setProblems({ errors: result.errors, warnings: result.warnings });

      if (result.questions.length === 0) {
        setRows([]);
        setProposedTags([]);
        return;
      }

      setProposedTags(result.proposedTags.map((t) => ({ ...t, approved: true })));
      if (!title.trim()) {
        setTitle(result.test.title || (chapter.trim() ? `${chapter.trim()} Test` : ''));
      }
      if (!folderPath.trim() && result.test.folder_path.length > 0) {
        setFolderPath(result.test.folder_path.join(' / '));
      }

      const dedupe = await authFetch('/api/question-bank/import/preview', {
        method: 'POST',
        body: JSON.stringify({
          questions: result.questions.map((q) => ({
            key: q.key,
            question_text: q.question_text,
            exam_relevance: q.exam_relevance,
          })),
        }),
      });

      const byKey = new Map<string, any>();
      for (const r of dedupe.data?.results || []) byKey.set(r.key, r);

      setRows(
        result.questions.map((q) => {
          const verdict = byKey.get(q.key);
          const candidates = verdict?.candidates || [];
          // The server's suggestion is a preselection, not a decision. 'review'
          // means it genuinely could go either way, so it defaults to adding a
          // new question: the reversible choice.
          const suggested: RowAction = verdict?.suggested_action === 'reuse' ? 'reuse' : 'create';
          return {
            question: q,
            action: suggested,
            candidates,
            existingId: candidates[0]?.id ?? null,
          };
        }),
      );
      setStep(2);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not check the paste');
    } finally {
      setChecking(false);
    }
  }

  const counts = useMemo(() => {
    const c = { create: 0, reuse: 0, merge: 0, skip: 0 };
    for (const r of rows) c[r.action] += 1;
    return c;
  }, [rows]);

  const keptCount = rows.length - counts.skip;

  async function createTest() {
    setCreating(true);
    setError(null);
    try {
      const json = await authFetch('/api/question-bank/import/commit', {
        method: 'POST',
        body: JSON.stringify({
          title: title.trim(),
          folder_path: folderSegments,
          passing_pct: passingPct,
          is_published: publish,
          new_tags: proposedTags.filter((t) => t.approved).map((t) => ({ slug: t.slug, label: t.label })),
          questions: rows.map((r) => ({
            action: r.action,
            existing_question_id: r.existingId,
            question_text: r.question.question_text,
            question_format: r.question.question_format,
            options: r.question.options,
            correct_answer: r.question.correct_answer,
            explanation: r.question.explanation,
            difficulty: r.question.difficulty,
            exam_relevance: r.question.exam_relevance,
            tag_ids: r.question.tag_ids,
            // Only slugs whose proposal survived review may be created.
            new_tag_slugs: r.question.new_tag_slugs.filter((s) =>
              proposedTags.some((p) => p.slug === s && p.approved),
            ),
          })),
        }),
      });

      const d = json.data;
      setToast(
        `Test created with ${d.question_count} question${d.question_count !== 1 ? 's' : ''}: ` +
          `${d.created} new, ${d.reused} reused, ${d.merged} merged, ${d.tags_created} new tag${d.tags_created !== 1 ? 's' : ''}.`,
      );
      router.push(`/teacher/tests/${d.test_id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the test');
      setCreating(false);
    }
  }

  if (!isTeacher) {
    return (
      <Box sx={{ px: { xs: 2, md: 3 }, py: 6, textAlign: 'center' }}>
        <Typography color="text.secondary">Only teachers can import questions.</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ px: { xs: 2, md: 3 }, py: 2, maxWidth: 900, mx: 'auto', pb: 10 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 1 }}>
        <IconButton onClick={() => router.push('/teacher/tests')} aria-label="Back to Tests" sx={{ minWidth: 44, minHeight: 44 }}>
          <ArrowBackOutlinedIcon />
        </IconButton>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="h5" component="h1" sx={{ fontWeight: 700 }}>
            Import from AI
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Turn a chapter PDF into a tagged, deduplicated test
          </Typography>
        </Box>
      </Box>

      <Stepper activeStep={step} alternativeLabel sx={{ my: 2, display: { xs: 'none', sm: 'flex' } }}>
        {STEPS.map((label) => (
          <Step key={label}>
            <StepLabel>{label}</StepLabel>
          </Step>
        ))}
      </Stepper>
      {/* The full stepper does not fit at 375px, so mobile gets the same
          information as one honest line rather than a squashed row of dots. */}
      <Typography variant="subtitle2" sx={{ display: { xs: 'block', sm: 'none' }, fontWeight: 700, my: 1.5 }}>
        Step {step + 1} of {STEPS.length}: {STEPS[step]}
      </Typography>

      {!registryLoaded && <LinearProgress sx={{ mb: 2, borderRadius: 1 }} />}

      {/* ---- Step 1: prompt ---- */}
      {step === 0 && (
        <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1.5 }}>
            Tell the AI what to write
          </Typography>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <TextField
              label="Chapter or topic"
              placeholder="History of Architecture"
              value={chapter}
              onChange={(e) => setChapter(e.target.value)}
              fullWidth
              size="small"
              helperText="Used in the prompt and to name the test"
            />
            <Box sx={{ display: 'flex', gap: 2, flexDirection: { xs: 'column', sm: 'row' } }}>
              <TextField
                select
                label="Target exam"
                value={exam}
                onChange={(e) => setExam(e.target.value as ImportExam)}
                size="small"
                sx={{ flex: 1 }}
              >
                <MenuItem value="NATA">NATA</MenuItem>
                <MenuItem value="JEE">JEE Paper 2</MenuItem>
                <MenuItem value="BOTH">Both</MenuItem>
              </TextField>
              <TextField
                label="How many questions"
                type="number"
                value={count}
                onChange={(e) => setCount(Math.min(Math.max(Number(e.target.value) || 1, 1), 200))}
                size="small"
                sx={{ flex: 1 }}
                inputProps={{ min: 1, max: 200, inputMode: 'numeric' }}
              />
            </Box>
            <TextField
              label="Folder"
              placeholder="Foundation / History of Architecture"
              value={folderPath}
              onChange={(e) => setFolderPath(e.target.value)}
              fullWidth
              size="small"
              helperText="Separate levels with a slash. Folders are created if they do not exist."
            />
          </Box>

          <Alert severity="info" sx={{ mt: 2 }}>
            Copy the prompt, open ChatGPT or Gemini, attach your chapter PDF, then paste the prompt. Bring the
            reply back here.
          </Alert>

          <Box sx={{ display: 'flex', gap: 1, mt: 2, flexWrap: 'wrap' }}>
            <Button
              variant="contained"
              startIcon={<ContentCopyOutlinedIcon />}
              onClick={copyPrompt}
              disabled={registry.length === 0}
              sx={{ textTransform: 'none', minHeight: 48 }}
            >
              Copy prompt
            </Button>
            <Button onClick={() => setStep(1)} sx={{ textTransform: 'none', minHeight: 48 }}>
              I already have the JSON
            </Button>
          </Box>
          {registryLoaded && registry.length === 0 && (
            <Alert severity="warning" sx={{ mt: 2 }}>
              No tags found in the registry, so the AI has nothing to tag against. Add tags first.
            </Alert>
          )}
        </Paper>
      )}

      {/* ---- Step 2: paste ---- */}
      {step === 1 && (
        <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
            Paste the AI reply
          </Typography>
          <TextField
            multiline
            minRows={8}
            maxRows={18}
            fullWidth
            label="AI reply"
            placeholder='{"test":{"title":"..."},"questions":[{"question":"...","options":{"a":"..."},"answer":"b"}]}'
            value={pasted}
            onChange={(e) => setPasted(e.target.value)}
            sx={{ '& textarea': { fontFamily: 'monospace', fontSize: '0.8rem' } }}
          />

          {problems.errors.length > 0 && (
            <Alert severity="error" sx={{ mt: 1.5 }}>
              {problems.errors.slice(0, 5).map((e, i) => (
                <Typography key={i} variant="body2">
                  {e}
                </Typography>
              ))}
              {problems.errors.length > 5 && (
                <Typography variant="body2">and {problems.errors.length - 5} more.</Typography>
              )}
            </Alert>
          )}

          <Box sx={{ display: 'flex', gap: 1, mt: 2, flexWrap: 'wrap' }}>
            <Button onClick={() => setStep(0)} sx={{ textTransform: 'none', minHeight: 48 }}>
              Back
            </Button>
            <Button
              variant="contained"
              onClick={checkAndPreview}
              disabled={!pasted.trim() || checking}
              startIcon={checking ? <CircularProgress size={16} color="inherit" /> : undefined}
              sx={{ textTransform: 'none', minHeight: 48 }}
            >
              {checking ? 'Checking for duplicates' : 'Check and preview'}
            </Button>
          </Box>
        </Paper>
      )}

      {/* ---- Step 3: review ---- */}
      {step === 2 && (
        <Box>
          <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, mb: 2 }}>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, alignItems: 'center', mb: 1 }}>
              <Chip label={`${counts.create} new`} color="primary" size="small" />
              {counts.reuse > 0 && <Chip label={`${counts.reuse} reused`} color="info" size="small" />}
              {counts.merge > 0 && <Chip label={`${counts.merge} merged`} color="success" size="small" />}
              {counts.skip > 0 && <Chip label={`${counts.skip} dropped`} size="small" variant="outlined" />}
            </Box>
            <Typography variant="caption" color="text.secondary">
              Anything already in the bank is preselected to be reused, so the test still gets the question and
              the bank does not grow a duplicate.
            </Typography>

            {problems.warnings.length > 0 && (
              <Alert severity="warning" sx={{ mt: 1.5 }}>
                {problems.warnings.length} note{problems.warnings.length !== 1 ? 's' : ''}:{' '}
                {problems.warnings.slice(0, 3).join(' ')}
                {problems.warnings.length > 3 ? ` and ${problems.warnings.length - 3} more.` : ''}
              </Alert>
            )}
          </Paper>

          {proposedTags.length > 0 && (
            <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, mb: 2 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 0.5 }}>
                New tags suggested
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
                Tap to approve or reject. Rejected tags are simply not applied. New tags are always theme tags.
              </Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
                {proposedTags.map((t) => (
                  <Chip
                    key={t.slug}
                    label={`${t.label} (${t.usage})`}
                    clickable
                    color={t.approved ? 'secondary' : 'default'}
                    variant={t.approved ? 'filled' : 'outlined'}
                    onClick={() =>
                      setProposedTags((prev) =>
                        prev.map((p) => (p.slug === t.slug ? { ...p, approved: !p.approved } : p)),
                      )
                    }
                    sx={{ height: 30 }}
                  />
                ))}
              </Box>
            </Paper>
          )}

          {rows.length === 0 ? (
            <Paper variant="outlined" sx={{ p: 4, borderRadius: 2, textAlign: 'center' }}>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Nothing usable in that reply. Check the errors above, then paste again.
              </Typography>
              <Button variant="outlined" onClick={() => setStep(1)} sx={{ textTransform: 'none', minHeight: 44 }}>
                Back to paste
              </Button>
            </Paper>
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {rows.map((r, i) => (
                <ImportReviewCard
                  key={r.question.key}
                  row={r}
                  index={i}
                  tagLabels={tagLabels}
                  onActionChange={(action) =>
                    setRows((prev) => prev.map((p, pi) => (pi === i ? { ...p, action } : p)))
                  }
                  onRemove={() =>
                    setRows((prev) =>
                      prev.map((p, pi) =>
                        pi === i ? { ...p, action: p.action === 'skip' ? 'create' : 'skip' } : p,
                      ),
                    )
                  }
                  onEditTags={() => setTagEditFor(i)}
                />
              ))}
            </Box>
          )}

          {rows.length > 0 && (
            <Box sx={{ display: 'flex', gap: 1, mt: 2, flexWrap: 'wrap' }}>
              <Button onClick={() => setStep(1)} sx={{ textTransform: 'none', minHeight: 48 }}>
                Back
              </Button>
              <Button
                variant="contained"
                onClick={() => setStep(3)}
                disabled={keptCount === 0}
                sx={{ textTransform: 'none', minHeight: 48 }}
              >
                Continue with {keptCount} question{keptCount !== 1 ? 's' : ''}
              </Button>
            </Box>
          )}
        </Box>
      )}

      {/* ---- Step 4: create ---- */}
      {step === 3 && (
        <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1.5 }}>
            Name and file the test
          </Typography>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <TextField
              label="Test name"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              fullWidth
              size="small"
              required
              placeholder="Foundation History of Architecture Book Test"
            />
            <TextField
              label="Folder"
              value={folderPath}
              onChange={(e) => setFolderPath(e.target.value)}
              fullWidth
              size="small"
              placeholder="Foundation / History of Architecture"
              helperText={
                folderSegments.length > 0
                  ? `Filed under ${folderSegments.join(' > ')}`
                  : 'Leave blank to put it in Unfiled'
              }
            />
            <TextField
              label="Pass mark (%)"
              type="number"
              value={passingPct}
              onChange={(e) => setPassingPct(Math.min(Math.max(Number(e.target.value) || 1, 1), 100))}
              size="small"
              sx={{ maxWidth: 200 }}
              inputProps={{ min: 1, max: 100, inputMode: 'numeric' }}
              helperText={`Pass at ${Math.max(1, Math.round((passingPct / 100) * keptCount))} of ${keptCount}`}
            />
            <FormControlLabel
              control={<Switch checked={publish} onChange={(e) => setPublish(e.target.checked)} />}
              label="Publish now so it can be assigned"
            />
          </Box>

          <Divider sx={{ my: 2 }} />
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            {counts.create} new question{counts.create !== 1 ? 's' : ''} added to the bank,{' '}
            {counts.reuse + counts.merge} reused from it, {proposedTags.filter((t) => t.approved).length} new tag
            {proposedTags.filter((t) => t.approved).length !== 1 ? 's' : ''} created.
          </Typography>

          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            <Button onClick={() => setStep(2)} disabled={creating} sx={{ textTransform: 'none', minHeight: 48 }}>
              Back
            </Button>
            <Button
              variant="contained"
              onClick={createTest}
              disabled={creating || !title.trim() || keptCount === 0}
              startIcon={
                creating ? <CircularProgress size={16} color="inherit" /> : <AutoAwesomeOutlinedIcon />
              }
              sx={{ textTransform: 'none', minHeight: 48 }}
            >
              {creating ? 'Creating' : `Create test with ${keptCount} question${keptCount !== 1 ? 's' : ''}`}
            </Button>
          </Box>
        </Paper>
      )}

      {/* Per-question tag editing, so a teacher can fix one bad tag without
          rejecting the whole import. */}
      <Dialog open={tagEditFor !== null} onClose={() => setTagEditFor(null)} fullWidth maxWidth="sm">
        <DialogTitle>Tags for this question</DialogTitle>
        <DialogContent>
          {tagEditFor !== null && (
            <Box sx={{ pt: 1 }}>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                {rows[tagEditFor]?.question.question_text}
              </Typography>
              <TagPicker
                value={rows[tagEditFor]?.question.tag_ids || []}
                onChange={(ids) =>
                  setRows((prev) =>
                    prev.map((p, pi) =>
                      pi === tagEditFor
                        ? {
                            ...p,
                            question: {
                              ...p.question,
                              tag_ids: ids,
                              // Registry slugs are rebuilt from the picker's ids;
                              // pending new-tag slugs are kept as they are, since
                              // they have no id to pick from yet.
                              tag_slugs: [
                                ...ids
                                  .map((id) => registry.find((t) => t.id === id)?.slug)
                                  .filter((s): s is string => Boolean(s)),
                                ...p.question.new_tag_slugs,
                              ],
                            },
                          }
                        : p,
                    ),
                  )
                }
                getToken={getToken}
                label="Tags"
                allowCreate
              />
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => setTagEditFor(null)}
            variant="contained"
            startIcon={<CheckCircleOutlinedIcon />}
            sx={{ textTransform: 'none', minHeight: 44 }}
          >
            Done
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={Boolean(toast)}
        autoHideDuration={5000}
        onClose={() => setToast(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity="success" variant="filled" onClose={() => setToast(null)}>
          {toast}
        </Alert>
      </Snackbar>
      <Snackbar open={Boolean(error)} autoHideDuration={6000} onClose={() => setError(null)}>
        <Alert severity="error" variant="filled" onClose={() => setError(null)}>
          {error}
        </Alert>
      </Snackbar>
    </Box>
  );
}
