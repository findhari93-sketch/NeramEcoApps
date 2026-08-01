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
import UploadFileOutlinedIcon from '@mui/icons-material/UploadFileOutlined';
import LibraryAddOutlinedIcon from '@mui/icons-material/LibraryAddOutlined';
import { NEXUS_TEACHER_TEST_KINDS, type NexusTestKind, type NexusQBQuestionListItem } from '@neram/database';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import TagPicker from '@/components/question-bank/TagPicker';
import QuestionPickerList from '@/components/question-bank/QuestionPickerList';
import ImportReviewCard, { ROW_ACTIONS, type ReviewRow, type RowAction } from '@/components/tests/ImportReviewCard';
import CompareQuestionsDialog from '@/components/tests/CompareQuestionsDialog';
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
  const [dragging, setDragging] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);

  // Step 3
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [proposedTags, setProposedTags] = useState<Array<ProposedTag & { approved: boolean }>>([]);
  const [checking, setChecking] = useState(false);
  const [tagEditFor, setTagEditFor] = useState<number | null>(null);
  const [compareFor, setCompareFor] = useState<number | null>(null);

  // Step 4
  const [title, setTitle] = useState('');
  const [testKind, setTestKind] = useState<NexusTestKind>('classroom_assigned');
  const [passingPct, setPassingPct] = useState(60);
  const [publish, setPublish] = useState(true);
  const [creating, setCreating] = useState(false);
  const [bankPickerOpen, setBankPickerOpen] = useState(false);
  const [extraQuestions, setExtraQuestions] = useState<Map<string, NexusQBQuestionListItem>>(new Map());
  // Held separately from `extraQuestions` so cancelling the dialog does not
  // commit a half-made selection.
  const [bankDraft, setBankDraft] = useState<Map<string, NexusQBQuestionListItem>>(new Map());

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
            // Remembered so that dropping a row and putting it back restores
            // the suggestion. Un-skipping used to reset to 'create', which
            // turned a skipped duplicate into a second copy in the bank.
            suggestedAction: suggested,
            candidates,
            existingId: candidates[0]?.id ?? null,
            useInTest: 'new' as const,
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
    const c: Record<RowAction, number> = { create: 0, reuse: 0, merge: 0, replace: 0, keep_both: 0, skip: 0 };
    for (const r of rows) c[r.action] += 1;
    return c;
  }, [rows]);

  /** Questions the test will actually hold: everything not dropped, plus bank picks. */
  const keptCount = rows.length - counts.skip + extraQuestions.size;
  /** Questions the bank gains. keep_both writes a new row even when the test uses the old one. */
  const bankAdditions = counts.create + counts.keep_both;

  /** Read a dropped or chosen file into the paste box. */
  const readJsonFile = useCallback((file: File) => {
    const name = file.name.toLowerCase();
    if (!name.endsWith('.json') && !name.endsWith('.txt')) {
      setError('That is not a JSON file. Save the AI reply as .json or .txt and try again.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setPasted(String(reader.result || ''));
      setFileName(file.name);
      setProblems({ errors: [], warnings: [] });
    };
    reader.onerror = () => setError('Could not read that file.');
    reader.readAsText(file);
  }, []);

  async function createTest() {
    setCreating(true);
    setError(null);
    try {
      const json = await authFetch('/api/question-bank/import/commit', {
        method: 'POST',
        body: JSON.stringify({
          title: title.trim(),
          test_kind: testKind,
          folder_path: folderSegments,
          passing_pct: passingPct,
          is_published: publish,
          new_tags: proposedTags.filter((t) => t.approved).map((t) => ({ slug: t.slug, label: t.label })),
          extra_question_ids: [...extraQuestions.keys()],
          questions: rows.map((r) => ({
            action: r.action,
            existing_question_id: r.existingId,
            use_in_test: r.useInTest,
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
      const parts = [
        `${d.created} new`,
        d.reused ? `${d.reused} reused` : '',
        d.merged ? `${d.merged} topped up` : '',
        d.replaced ? `${d.replaced} replaced` : '',
        d.kept_both ? `${d.kept_both} kept alongside` : '',
      ].filter(Boolean);
      setToast(
        `Test created with ${d.question_count} question${d.question_count !== 1 ? 's' : ''}: ` +
          `${parts.join(', ')}, ${d.tags_created} new tag${d.tags_created !== 1 ? 's' : ''}.`,
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
            Paste the AI reply, or drop the file
          </Typography>

          <Box
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              const file = e.dataTransfer.files?.[0];
              if (file) readJsonFile(file);
            }}
            sx={{
              p: 2,
              mb: 1.5,
              borderRadius: 2,
              border: 2,
              borderStyle: 'dashed',
              borderColor: dragging ? 'primary.main' : 'divider',
              bgcolor: dragging ? 'action.hover' : 'transparent',
              textAlign: 'center',
              transition: 'border-color 150ms ease, background-color 150ms ease',
            }}
          >
            <UploadFileOutlinedIcon sx={{ fontSize: 26, color: 'text.disabled' }} />
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              {fileName ? `Loaded ${fileName}` : 'Drop a .json or .txt file here'}
            </Typography>
            <Button component="label" size="small" sx={{ textTransform: 'none', mt: 0.5, minHeight: 44 }}>
              Choose a file
              <input
                type="file"
                accept=".json,.txt,application/json,text/plain"
                hidden
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) readJsonFile(file);
                  // Cleared so choosing the same file twice still fires onChange.
                  e.target.value = '';
                }}
              />
            </Button>
          </Box>

          <TextField
            multiline
            minRows={8}
            maxRows={18}
            fullWidth
            label="AI reply"
            placeholder='{"test":{"title":"..."},"questions":[{"question":"...","options":{"a":"..."},"answer":"b"}]}'
            value={pasted}
            onChange={(e) => {
              setPasted(e.target.value);
              if (fileName) setFileName(null);
            }}
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
              {counts.merge > 0 && <Chip label={`${counts.merge} topped up`} color="success" size="small" />}
              {counts.replace > 0 && <Chip label={`${counts.replace} replaced`} color="warning" size="small" />}
              {counts.keep_both > 0 && <Chip label={`${counts.keep_both} kept both`} color="secondary" size="small" />}
              {counts.skip > 0 && <Chip label={`${counts.skip} dropped`} size="small" variant="outlined" />}
            </Box>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
              Anything already in the bank is preselected to be reused, so the test still gets the question and
              the bank does not grow a duplicate. Open Compare on a match to see both side by side and change
              that.
            </Typography>

            {/* The vocabulary, once, rather than a caption per card. Every option
                also repeats its effect in the menu where it is chosen. */}
            <Box sx={{ mt: 1.25, pt: 1.25, borderTop: 1, borderColor: 'divider' }}>
              {(['create', 'reuse', 'replace', 'keep_both'] as RowAction[]).map((a) => (
                <Typography key={a} variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                  <strong>{ROW_ACTIONS[a].label}</strong> {ROW_ACTIONS[a].effect}
                </Typography>
              ))}
            </Box>

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
                  onUseInTestChange={(which) =>
                    setRows((prev) => prev.map((p, pi) => (pi === i ? { ...p, useInTest: which } : p)))
                  }
                  onCompare={() => setCompareFor(i)}
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
              select
              label="Test type"
              value={testKind}
              onChange={(e) => setTestKind(e.target.value as NexusTestKind)}
              fullWidth
              size="small"
              helperText="Students see this on the test, so they know what they are sitting"
            >
              {NEXUS_TEACHER_TEST_KINDS.map((k) => (
                <MenuItem key={k.value} value={k.value}>
                  {k.label} <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 1 }}>{k.hint}</Typography>
                </MenuItem>
              ))}
            </TextField>
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

          {/* Imported questions are rarely the whole paper. The bank already holds
              1000+, and composeTest takes references, so adding some costs nothing
              and creates no duplicates. */}
          <Box sx={{ mb: 2 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 0.5 }}>
              Add questions from the bank
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
              {extraQuestions.size > 0
                ? `${extraQuestions.size} bank question${extraQuestions.size !== 1 ? 's' : ''} will go in after the imported ones.`
                : 'Optional. Mix questions already in the bank into this test.'}
            </Typography>
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
              <Button
                variant="outlined"
                size="small"
                startIcon={<LibraryAddOutlinedIcon />}
                onClick={() => {
                  setBankDraft(new Map(extraQuestions));
                  setBankPickerOpen(true);
                }}
                sx={{ textTransform: 'none', minHeight: 44 }}
              >
                {extraQuestions.size > 0 ? 'Change the bank questions' : 'Pick from the bank'}
              </Button>
              {extraQuestions.size > 0 && (
                <Button
                  size="small"
                  onClick={() => setExtraQuestions(new Map())}
                  sx={{ textTransform: 'none', minHeight: 44 }}
                >
                  Remove all
                </Button>
              )}
            </Box>
          </Box>

          <Divider sx={{ my: 2 }} />
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            {bankAdditions} new question{bankAdditions !== 1 ? 's' : ''} added to the bank,{' '}
            {counts.reuse + counts.merge + counts.replace + extraQuestions.size} taken from it,{' '}
            {proposedTags.filter((t) => t.approved).length} new tag
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

      {/* Side by side with the bank match, where the decision is actually made. */}
      <CompareQuestionsDialog
        open={compareFor !== null}
        onClose={() => setCompareFor(null)}
        incoming={compareFor !== null ? rows[compareFor]?.question ?? null : null}
        candidates={compareFor !== null ? rows[compareFor]?.candidates ?? [] : []}
        selectedId={compareFor !== null ? rows[compareFor]?.existingId ?? null : null}
        onSelectCandidate={(id) =>
          setRows((prev) => prev.map((p, pi) => (pi === compareFor ? { ...p, existingId: id } : p)))
        }
        action={compareFor !== null ? rows[compareFor]?.action ?? 'create' : 'create'}
        onActionChange={(action) =>
          setRows((prev) => prev.map((p, pi) => (pi === compareFor ? { ...p, action } : p)))
        }
        useInTest={compareFor !== null ? rows[compareFor]?.useInTest ?? 'new' : 'new'}
        onUseInTestChange={(which) =>
          setRows((prev) => prev.map((p, pi) => (pi === compareFor ? { ...p, useInTest: which } : p)))
        }
      />

      {/* Bank questions mixed into the imported ones. */}
      <Dialog open={bankPickerOpen} onClose={() => setBankPickerOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Add questions from the bank</DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 1 }}>
            <QuestionPickerList
              getToken={getToken}
              selected={bankDraft}
              onChange={setBankDraft}
              initialSearch={chapter.trim()}
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setBankPickerOpen(false)} sx={{ textTransform: 'none', minHeight: 44 }}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={() => {
              setExtraQuestions(bankDraft);
              setBankPickerOpen(false);
            }}
            sx={{ textTransform: 'none', minHeight: 44 }}
          >
            Add {bankDraft.size > 0 ? bankDraft.size : ''} question{bankDraft.size !== 1 ? 's' : ''}
          </Button>
        </DialogActions>
      </Dialog>

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
