'use client';

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  Collapse,
  FormControlLabel,
  MenuItem,
  Paper,
  Tab,
  Tabs,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
  alpha,
  useMediaQuery,
  useTheme,
} from '@neram/ui';
import CheckCircleOutlinedIcon from '@mui/icons-material/CheckCircleOutlined';
import WarningAmberOutlinedIcon from '@mui/icons-material/WarningAmberOutlined';
import ErrorOutlineOutlinedIcon from '@mui/icons-material/ErrorOutlineOutlined';
import ContentCopyOutlinedIcon from '@mui/icons-material/ContentCopyOutlined';
import CheckOutlinedIcon from '@mui/icons-material/CheckOutlined';
import ExpandMoreOutlinedIcon from '@mui/icons-material/ExpandMoreOutlined';
import {
  TEST_JSON_SPEC,
  validateImportJSON,
  validationReport,
  type ImportRegistryTag,
} from '@/lib/qb-import-schema';
import {
  DEFAULT_MIX,
  MAX_POOL,
  MIX_LABELS,
  MIX_ORDER,
  buildTestPrompt,
  mixBreakdown,
  normalisePoolServe,
  type PromptExam,
  type PromptLanguage,
  type QuestionMix,
} from '@/lib/test-prompt-builder';
import type { TestDraft } from '@/lib/test-wizard-draft';

/**
 * Step 2, JSON branch.
 *
 * Validated in the browser, so a teacher who pasted the wrong thing learns it
 * on the first line instead of after a round trip. The server re-validates the
 * same shapes before anything is written; this is for speed, not for trust.
 *
 * Nothing is uploaded here. The parsed questions flow into the SAME review step
 * the AI branch reaches, which is what keeps one quality bar across both.
 *
 * Above the paste box sits the prompt builder: the teacher's real workflow is
 * a free ChatGPT chat with the chapter PDF attached, so the prompt is built
 * here and the replies come back into the box below, several at a time.
 */

const LEVEL_ICON = {
  ok: CheckCircleOutlinedIcon,
  warning: WarningAmberOutlinedIcon,
  error: ErrorOutlineOutlinedIcon,
} as const;

const LEVEL_COLOR = {
  ok: 'success.main',
  warning: 'warning.dark',
  error: 'error.main',
} as const;

/** Per device, namespaced, versioned. Only the settings, never the chapter name. */
const BUILDER_STORAGE_KEY = 'nexus.test-wizard.prompt-builder.v1';

interface BuilderSettings {
  exam: PromptExam;
  pool: number;
  serve: number;
  mix: QuestionMix;
  language: PromptLanguage;
}

const DEFAULT_SETTINGS: BuilderSettings = {
  exam: 'NATA',
  pool: 150,
  serve: 50,
  mix: { ...DEFAULT_MIX },
  language: 'English',
};

const EXAM_OPTIONS: Array<{ value: PromptExam; label: string }> = [
  { value: 'NATA', label: 'NATA' },
  { value: 'JEE', label: 'JEE Paper 2' },
  { value: 'BOTH', label: 'Both' },
];

const LANGUAGES: PromptLanguage[] = ['English', 'English with Tamil'];

/** Whatever was stored, read defensively: a device may hold an older or hand-edited value. */
function readStoredSettings(raw: string | null): BuilderSettings | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<BuilderSettings>;
    if (!v || typeof v !== 'object') return null;
    const { pool, serve } = normalisePoolServe(v.pool ?? DEFAULT_SETTINGS.pool, v.serve ?? DEFAULT_SETTINGS.serve);
    const mix: QuestionMix = { ...DEFAULT_MIX };
    for (const k of MIX_ORDER) {
      if (typeof v.mix?.[k] === 'boolean') mix[k] = v.mix[k] as boolean;
    }
    return {
      exam: v.exam === 'JEE' || v.exam === 'BOTH' ? v.exam : 'NATA',
      pool,
      serve,
      mix,
      language: v.language === 'English with Tamil' ? 'English with Tamil' : 'English',
    };
  } catch {
    return null;
  }
}

/** The line under the two numbers: how far the pool stretches. */
function poolAdvice(pool: number, serve: number): { tone: 'ok' | 'warn'; text: string } {
  if (serve >= pool) return { tone: 'warn', text: 'Every student gets all of them, so a retake repeats every question.' };
  const sittings = Math.floor(pool / serve);
  if (sittings >= 2) {
    return { tone: 'ok', text: `Enough for ${sittings} completely different sittings.` };
  }
  return {
    tone: 'warn',
    text: 'A retake will repeat some questions. Write at least twice as many for a fully fresh retake.',
  };
}

/**
 * The prompt builder card.
 *
 * Settings come back from localStorage in an effect, never in a useState
 * initialiser, so the server render and the first client render agree and a
 * blocked storage cannot stop the panel opening.
 */
function PromptBuilder({
  registry,
  initialChapter,
  onSettings,
}: {
  registry: ImportRegistryTag[];
  initialChapter: string;
  /** Lets the panel carry "Each student gets" into the draft once a prompt was copied. */
  onSettings: (s: { serve: number; copied: boolean }) => void;
}) {
  const theme = useTheme();
  const ids = {
    exam: useId(),
    mix: useId(),
    preview: useId(),
  };

  const [chapter, setChapter] = useState(initialChapter);
  const [settings, setSettings] = useState<BuilderSettings>(DEFAULT_SETTINGS);
  // The number fields hold text while being typed in, so "1" on the way to
  // "150" is not clamped away. Committed on blur.
  const [poolText, setPoolText] = useState(String(DEFAULT_SETTINGS.pool));
  const [serveText, setServeText] = useState(String(DEFAULT_SETTINGS.serve));
  const [loaded, setLoaded] = useState(false);
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'manual'>('idle');
  const [specCopied, setSpecCopied] = useState(false);
  const [copiedOnce, setCopiedOnce] = useState(false);
  const previewRef = useRef<HTMLPreElement | null>(null);
  const timers = useRef<number[]>([]);

  useEffect(() => {
    let stored: BuilderSettings | null = null;
    try {
      stored = readStoredSettings(window.localStorage.getItem(BUILDER_STORAGE_KEY));
    } catch {
      // Private mode or blocked storage: the defaults are fine.
    }
    if (stored) {
      setSettings(stored);
      setPoolText(String(stored.pool));
      setServeText(String(stored.serve));
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    try {
      window.localStorage.setItem(BUILDER_STORAGE_KEY, JSON.stringify(settings));
    } catch {
      // Remembering is a convenience; failing to is not an error.
    }
  }, [settings, loaded]);

  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach((t) => window.clearTimeout(t));
  }, []);

  useEffect(() => {
    onSettings({ serve: settings.serve, copied: copiedOnce });
  }, [settings.serve, copiedOnce, onSettings]);

  // What the prompt says is always the committed numbers plus whatever is being
  // typed, normalised, so the preview never shows "Write 0 questions".
  const live = normalisePoolServe(poolText || settings.pool, serveText || settings.serve);
  const prompt = useMemo(
    () =>
      buildTestPrompt({
        chapterTitle: chapter,
        exam: settings.exam,
        pool: live.pool,
        serve: live.serve,
        mix: settings.mix,
        language: settings.language,
        tags: registry,
      }),
    [chapter, settings.exam, settings.mix, settings.language, live.pool, live.serve, registry],
  );
  const shares = useMemo(
    () => new Map(mixBreakdown(settings.mix, live.pool).map((m) => [m.kind, m.percent])),
    [settings.mix, live.pool],
  );
  const advice = poolAdvice(live.pool, live.serve);

  const commitNumbers = () => {
    const next = normalisePoolServe(poolText || settings.pool, serveText || settings.serve);
    setPoolText(String(next.pool));
    setServeText(String(next.serve));
    setSettings((s) => ({ ...s, pool: next.pool, serve: next.serve }));
  };

  const later = (fn: () => void, ms: number) => {
    timers.current.push(window.setTimeout(fn, ms));
  };

  const copyPrompt = async () => {
    let ok = false;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(prompt);
        ok = true;
      }
    } catch {
      ok = false;
    }
    if (!ok && previewRef.current) {
      // No clipboard API (an http page, an old browser, a denied permission):
      // select the preview so a long-press or Ctrl+C finishes the job.
      const range = document.createRange();
      range.selectNodeContents(previewRef.current);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
      try {
        ok = document.execCommand('copy');
      } catch {
        ok = false;
      }
    }
    setCopiedOnce(true);
    setCopyState(ok ? 'copied' : 'manual');
    later(() => setCopyState('idle'), ok ? 1600 : 6000);
  };

  const copySpec = () => {
    navigator.clipboard?.writeText(TEST_JSON_SPEC).then(
      () => {
        setSpecCopied(true);
        later(() => setSpecCopied(false), 1600);
      },
      () => undefined,
    );
  };

  const numberField = {
    type: 'number' as const,
    fullWidth: true,
    size: 'small' as const,
    sx: { '& .MuiInputBase-input': { fontSize: 16 }, '& .MuiInputBase-root': { minHeight: 48 } },
  };

  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 1fr) minmax(0, 1.1fr)' },
        gap: { xs: 2, md: 3 },
        alignItems: 'start',
      }}
    >
      {/* Settings. One field per row on a phone, except the paired numbers. */}
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
        <TextField
          label="Chapter or PDF name"
          value={chapter}
          onChange={(e) => setChapter(e.target.value)}
          fullWidth
          size="small"
          placeholder="For example, Mughal Architecture"
          sx={{ '& .MuiInputBase-input': { fontSize: 16 }, '& .MuiInputBase-root': { minHeight: 48 } }}
        />

        <Box>
          <Typography id={ids.exam} variant="body2" sx={{ fontWeight: 600, mb: 0.75 }}>
            Exam style
          </Typography>
          <ToggleButtonGroup
            exclusive
            fullWidth
            value={settings.exam}
            onChange={(_, v: PromptExam | null) => v && setSettings((s) => ({ ...s, exam: v }))}
            aria-labelledby={ids.exam}
          >
            {EXAM_OPTIONS.map((o) => (
              <ToggleButton key={o.value} value={o.value} sx={{ minHeight: 48, textTransform: 'none', fontSize: 15 }}>
                {o.label}
              </ToggleButton>
            ))}
          </ToggleButtonGroup>
        </Box>

        <Box>
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5 }}>
            <TextField
              {...numberField}
              label="Questions to write"
              value={poolText}
              onChange={(e) => setPoolText(e.target.value)}
              onBlur={commitNumbers}
              inputProps={{ min: 5, max: MAX_POOL, inputMode: 'numeric' }}
            />
            <TextField
              {...numberField}
              label="Each student gets"
              value={serveText}
              onChange={(e) => setServeText(e.target.value)}
              onBlur={commitNumbers}
              inputProps={{ min: 1, max: live.pool, inputMode: 'numeric' }}
            />
          </Box>
          <Box sx={{ display: 'flex', gap: 0.75, alignItems: 'flex-start', mt: 0.75 }} aria-live="polite">
            {advice.tone === 'ok' ? (
              <CheckCircleOutlinedIcon sx={{ fontSize: 18, color: 'success.main', mt: '2px' }} aria-hidden />
            ) : (
              <WarningAmberOutlinedIcon sx={{ fontSize: 18, color: 'warning.dark', mt: '2px' }} aria-hidden />
            )}
            <Typography variant="body2" color="text.secondary">
              {advice.text}
            </Typography>
          </Box>
        </Box>

        <Box role="group" aria-labelledby={ids.mix}>
          <Typography id={ids.mix} variant="body2" sx={{ fontWeight: 600, mb: 0.25 }}>
            Question mix
          </Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', md: '1fr', lg: '1fr 1fr' } }}>
            {MIX_ORDER.map((kind) => {
              const on = settings.mix[kind];
              return (
                <FormControlLabel
                  key={kind}
                  sx={{ minHeight: 48, mr: 0, '& .MuiFormControlLabel-label': { fontSize: 16 } }}
                  control={
                    <Checkbox
                      checked={on}
                      onChange={(e) =>
                        setSettings((s) => ({ ...s, mix: { ...s.mix, [kind]: e.target.checked } }))
                      }
                    />
                  }
                  label={
                    <>
                      {MIX_LABELS[kind]}
                      {on && shares.has(kind) && (
                        <Typography component="span" variant="body2" color="text.secondary" sx={{ ml: 0.75 }}>
                          {shares.get(kind)}%
                        </Typography>
                      )}
                    </>
                  }
                />
              );
            })}
          </Box>
        </Box>

        <TextField
          select
          label="Language"
          value={settings.language}
          onChange={(e) => setSettings((s) => ({ ...s, language: e.target.value as PromptLanguage }))}
          fullWidth
          size="small"
          sx={{ '& .MuiInputBase-input': { fontSize: 16 }, '& .MuiInputBase-root': { minHeight: 48 } }}
        >
          {LANGUAGES.map((l) => (
            <MenuItem key={l} value={l} sx={{ minHeight: 48 }}>
              {l}
            </MenuItem>
          ))}
        </TextField>
      </Box>

      {/* The prompt itself, live, and the one action that matters here. */}
      <Box sx={{ minWidth: 0 }}>
        <Typography id={ids.preview} variant="body2" sx={{ fontWeight: 600, mb: 0.75 }}>
          Prompt
        </Typography>
        <Box
          component="pre"
          ref={previewRef}
          tabIndex={0}
          role="region"
          aria-labelledby={ids.preview}
          data-testid="prompt-preview"
          sx={{
            m: 0,
            p: 1.5,
            maxHeight: { xs: 280, md: 460 },
            overflow: 'auto',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
            fontSize: 13,
            lineHeight: 1.55,
            color: 'text.primary',
            bgcolor: alpha(theme.palette.text.primary, 0.03),
            border: '1px solid',
            borderColor: 'divider',
            borderRadius: 1.5,
            '&:focus-visible': { outline: `2px solid ${theme.palette.primary.main}`, outlineOffset: 2 },
          }}
        >
          {prompt}
        </Box>

        <Button
          fullWidth
          variant="contained"
          onClick={copyPrompt}
          startIcon={copyState === 'copied' ? <CheckOutlinedIcon /> : <ContentCopyOutlinedIcon />}
          sx={{ mt: 1.5, minHeight: 48, textTransform: 'none', fontSize: 16 }}
        >
          {copyState === 'copied' ? 'Copied' : 'Copy prompt'}
        </Button>
        <Box aria-live="polite" sx={{ minHeight: 0 }}>
          {copyState === 'manual' && (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              The prompt is selected. Press Ctrl+C, or long-press and choose Copy.
            </Typography>
          )}
        </Box>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5 }}>
          Paste it into ChatGPT or Gemini with the chapter PDF attached. Type &quot;continue&quot; after each
          reply, then paste every reply into the box below, one after another.
        </Typography>
        <Button
          size="small"
          onClick={copySpec}
          startIcon={specCopied ? <CheckOutlinedIcon sx={{ fontSize: 16 }} /> : <ContentCopyOutlinedIcon sx={{ fontSize: 16 }} />}
          sx={{ textTransform: 'none', mt: 1, minHeight: 44 }}
        >
          {specCopied ? 'Format copied' : 'Copy the JSON format only'}
        </Button>
      </Box>
    </Box>
  );
}

export default function SourceJsonPanel({
  draft,
  registry,
  onPatch,
  onParsed,
}: {
  draft: TestDraft;
  registry: ImportRegistryTag[];
  onPatch: (patch: Partial<TestDraft['json']>) => void;
  onParsed: (payload: {
    questions: any[];
    proposedTags: any[];
    title: string;
    folderPath: string[];
    /** How many each student gets, when the reply or the copied prompt said. */
    serve?: number | null;
  }) => void;
}) {
  const theme = useTheme();
  const reduceMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const builderBodyId = useId();
  const [tab, setTab] = useState<'file' | 'paste'>('paste');
  const [dragging, setDragging] = useState(false);
  // Open for a fresh paste, folded away once there is something to read, so a
  // teacher returning with replies lands on the box that takes them.
  const [builderOpen, setBuilderOpen] = useState(() => !draft.json.raw.trim());
  const builderServe = useRef<{ serve: number; copied: boolean }>({ serve: 0, copied: false });
  const onBuilderSettings = useCallback((s: { serve: number; copied: boolean }) => {
    builderServe.current = s;
  }, []);

  const result = useMemo(
    () => (draft.json.raw.trim() ? validateImportJSON(draft.json.raw, registry) : null),
    [draft.json.raw, registry],
  );
  const checks = useMemo(() => (result ? validationReport(result) : []), [result]);

  const readFile = useCallback(
    async (file: File) => {
      const text = await file.text();
      onPatch({ raw: text, fileName: file.name, fileSize: file.size });
    },
    [onPatch],
  );

  const usable = (result?.questions.length ?? 0) > 0;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
      <Paper variant="outlined" sx={{ borderRadius: 2, overflow: 'hidden' }}>
        <Button
          fullWidth
          onClick={() => setBuilderOpen((o) => !o)}
          aria-expanded={builderOpen}
          aria-controls={builderBodyId}
          endIcon={
            <ExpandMoreOutlinedIcon
              sx={{
                transform: builderOpen ? 'rotate(180deg)' : 'none',
                transition: 'transform 200ms',
                '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
              }}
            />
          }
          sx={{
            justifyContent: 'space-between',
            textAlign: 'left',
            textTransform: 'none',
            color: 'text.primary',
            minHeight: 56,
            px: { xs: 2, md: 2.5 },
            borderRadius: 0,
          }}
        >
          <Box component="span" sx={{ display: 'block' }}>
            <Typography component="span" variant="subtitle1" sx={{ fontWeight: 700, display: 'block' }}>
              Write with ChatGPT or Gemini
            </Typography>
            <Typography component="span" variant="body2" color="text.secondary" sx={{ display: 'block' }}>
              Build the prompt, attach the chapter PDF in the chat, then paste the replies below.
            </Typography>
          </Box>
        </Button>
        <Collapse in={builderOpen} id={builderBodyId} timeout={reduceMotion ? 0 : 'auto'}>
          <Box sx={{ px: { xs: 2, md: 2.5 }, pb: { xs: 2, md: 2.5 }, pt: 0.5 }}>
            <PromptBuilder registry={registry} initialChapter={draft.title} onSettings={onBuilderSettings} />
          </Box>
        </Collapse>
      </Paper>

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 1fr) 300px' },
          gap: 2.5,
          alignItems: 'start',
        }}
      >
        <Paper variant="outlined" sx={{ p: { xs: 2, md: 2.5 }, borderRadius: 2 }}>
          <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2, minHeight: 48 }}>
            <Tab value="paste" label="Paste text" sx={{ textTransform: 'none', minHeight: 48 }} />
            <Tab value="file" label="Upload file" sx={{ textTransform: 'none', minHeight: 48 }} />
          </Tabs>

          {tab === 'paste' ? (
            <TextField
              fullWidth
              multiline
              minRows={8}
              placeholder="Paste the JSON reply here. You can paste several replies one after another."
              value={draft.json.raw}
              onChange={(e) => onPatch({ raw: e.target.value, fileName: null, fileSize: null })}
              inputProps={{ 'aria-label': 'JSON replies' }}
              sx={{ '& .MuiInputBase-input': { fontFamily: 'monospace', fontSize: 16 } }}
            />
          ) : (
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
                if (file) readFile(file);
              }}
              sx={{
                border: '1.5px dashed',
                borderColor: dragging ? 'primary.main' : 'divider',
                bgcolor: dragging ? alpha(theme.palette.primary.main, 0.04) : 'transparent',
                borderRadius: 2,
                p: 4,
                textAlign: 'center',
              }}
            >
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                Drop a .json file here
              </Typography>
              <Button component="label" variant="outlined" sx={{ textTransform: 'none', minHeight: 48 }}>
                Choose a file
                <input
                  type="file"
                  accept="application/json,.json"
                  hidden
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) readFile(file);
                  }}
                />
              </Button>
            </Box>
          )}

          {draft.json.fileName && (
            <Chip
              sx={{ mt: 1.5 }}
              label={`${draft.json.fileName}${usable ? ' · parsed' : ''}`}
              color={usable ? 'success' : 'default'}
              variant="outlined"
              onDelete={() => onPatch({ raw: '', fileName: null, fileSize: null })}
            />
          )}

          {checks.length > 0 && (
            <Box sx={{ mt: 2.5 }}>
              <Typography
                variant="caption"
                sx={{ fontWeight: 700, letterSpacing: 1, color: 'text.secondary', display: 'block', mb: 1 }}
              >
                VALIDATION
              </Typography>
              {checks.map((c, i) => {
                const Icon = LEVEL_ICON[c.level];
                return (
                  <Box key={`${c.level}-${i}`} sx={{ display: 'flex', gap: 1, alignItems: 'flex-start', mb: 0.75 }}>
                    <Icon sx={{ fontSize: 18, color: LEVEL_COLOR[c.level], mt: '1px', flexShrink: 0 }} />
                    <Typography variant="body2" color="text.secondary">
                      {c.message}
                    </Typography>
                  </Box>
                );
              })}
            </Box>
          )}

          <Button
            fullWidth
            variant="contained"
            disabled={!usable}
            onClick={() => {
              if (!result) return;
              // The reply's own test.serve wins. Failing that, the number from a
              // prompt copied here this session, since that is what was asked for.
              const fromBuilder = builderServe.current.copied ? builderServe.current.serve : null;
              onParsed({
                questions: result.questions,
                proposedTags: result.proposedTags,
                title: result.test.title,
                folderPath: result.test.folder_path,
                serve: result.test.serve ?? fromBuilder,
              });
            }}
            sx={{ textTransform: 'none', minHeight: 48, mt: 2 }}
          >
            Continue to review
          </Button>
        </Paper>

        <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
          <Typography
            variant="caption"
            sx={{ fontWeight: 700, letterSpacing: 1, color: 'text.secondary', display: 'block', mb: 1.5 }}
          >
            MAPPED PREVIEW
          </Typography>
          {!result || result.questions.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              Nothing parsed yet.
            </Typography>
          ) : (
            <>
              {result.questions.slice(0, 3).map((q, i) => (
                <Box key={q.key} sx={{ mb: 1.5 }}>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    {i + 1} · {q.question_text.slice(0, 90)}
                    {q.question_text.length > 90 ? '…' : ''}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {q.question_format === 'NUMERICAL' ? `Answer: ${q.correct_answer}` : `Correct: ${q.correct_answer}`}
                  </Typography>
                </Box>
              ))}
              {result.questions.length > 3 && (
                <Typography variant="caption" color="text.secondary">
                  and {result.questions.length - 3} more
                </Typography>
              )}
              <Alert severity="info" sx={{ mt: 2 }}>
                This exact JSON is stored with the test. Download it later, edit it anywhere, and re-upload it
                as a new version.
              </Alert>
            </>
          )}
        </Paper>
      </Box>
    </Box>
  );
}
