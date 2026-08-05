'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Collapse,
  Divider,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@neram/ui';
import UploadFileOutlinedIcon from '@mui/icons-material/UploadFileOutlined';
import ContentCopyOutlinedIcon from '@mui/icons-material/ContentCopyOutlined';
import DownloadOutlinedIcon from '@mui/icons-material/DownloadOutlined';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import {
  buildImportPrompt,
  validateImportJSON,
  type ImportExam,
  type ImportRegistryTag,
  type ImportValidationResult,
} from '@/lib/qb-import-schema';

/**
 * Put a question set written outside the app onto a chapter.
 *
 * The sibling mode asks Gemini for 40 questions and caps there. This one exists
 * because a teacher who has already written 150 in their own session with the
 * chapter PDF had no way to land them without leaving Study Materials entirely,
 * building the test in another module, and coming back to link it.
 *
 * The prompt lives above the drop zone rather than in a first step of its own.
 * Somebody arriving with the file in hand should not have to click past an
 * instruction they already followed, and somebody arriving without it should not
 * have to guess what format to ask for. Collapsed, it is one line either way.
 *
 * The parse runs here, in the browser, so the count and the skipped rows appear
 * instantly. It is shown for confidence, not trusted: the route re-reads the
 * same text with the same function before it writes anything.
 */

export interface UploadedTestSummary {
  test_id: string;
  title: string;
  created: number;
  reused: number;
  pool_size: number;
  serve: number;
  skipped: number;
}

interface Props {
  file: { id: string; title: string };
  authFetch: (url: string, init?: RequestInit) => Promise<any>;
  onCreated: (summary: UploadedTestSummary) => void;
  onBusyChange: (busy: boolean) => void;
  onCancel: () => void;
}

const EXAMS = [
  { value: 'NATA', label: 'NATA' },
  { value: 'JEE', label: 'JEE Paper 2' },
  { value: 'BOTH', label: 'Both' },
] as const;

/** Errors and warnings are listed to here, then counted. The house pattern. */
const MAX_LISTED_PROBLEMS = 5;

function fileSlug(title: string): string {
  return (
    String(title || 'chapter')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'chapter'
  );
}

export default function ChapterTestUploadPanel({ file, authFetch, onCreated, onBusyChange, onCancel }: Props) {
  const [registry, setRegistry] = useState<ImportRegistryTag[]>([]);
  const [registryReady, setRegistryReady] = useState(false);

  const [promptOpen, setPromptOpen] = useState(false);
  const [exam, setExam] = useState<ImportExam>('NATA');
  const [count, setCount] = useState(40);
  const [copied, setCopied] = useState(false);

  const [pasted, setPasted] = useState('');
  const [fileName, setFileName] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  const [parsed, setParsed] = useState<ImportValidationResult | null>(null);
  const [serve, setServe] = useState(20);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /**
   * Kept apart from `error`, which is cleared on every action. A missing tag
   * registry degrades the import rather than stopping it, so the notice has to
   * survive to the confirm step where its consequence actually lands.
   */
  const [registryWarning, setRegistryWarning] = useState<string | null>(null);

  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => onBusyChange(busy), [busy, onBusyChange]);
  useEffect(() => () => { if (copyTimer.current) clearTimeout(copyTimer.current); }, []);

  // The tag vocabulary, needed both to write the prompt and to resolve the
  // slugs that come back in it. Fetched when this mode is opened rather than
  // with the dialog, so the AI path never pays for it.
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
      } catch {
        // Not fatal. Without the registry the prompt cannot list the real tag
        // slugs and a reply's tags will not resolve, so the questions import
        // untagged rather than not at all.
        if (!cancelled) {
          setRegistryWarning('The tag list could not be loaded, so these questions will import untagged.');
        }
      } finally {
        if (!cancelled) setRegistryReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authFetch]);

  const prompt = useMemo(
    () => buildImportPrompt(registry, { chapter: file.title, exam, count }),
    [registry, file.title, exam, count],
  );

  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
      if (copyTimer.current) clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('Could not reach the clipboard. Use Download instead.');
    }
  }

  function downloadPrompt() {
    const blob = new Blob([prompt], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${fileSlug(file.title)}-prompt.txt`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  /** Read a dropped or chosen file into the paste box. */
  const readJsonFile = useCallback((chosen: File) => {
    const name = chosen.name.toLowerCase();
    if (!name.endsWith('.json') && !name.endsWith('.txt')) {
      setError('That is not a JSON file. Save the reply as .json or .txt and try again.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setPasted(String(reader.result || ''));
      setFileName(chosen.name);
      setError(null);
    };
    reader.onerror = () => setError('Could not read that file.');
    reader.readAsText(chosen);
  }, []);

  function readQuestions() {
    setError(null);
    const result = validateImportJSON(pasted, registry);
    if (result.questions.length === 0) {
      setError(result.errors[0] || 'No usable questions in that file.');
      return;
    }
    setParsed(result);
    setServe(Math.min(20, result.questions.length));
  }

  async function create() {
    if (!parsed) return;
    setBusy(true);
    setError(null);
    try {
      const json = await authFetch(`/api/study-materials/files/${file.id}/test/import`, {
        method: 'POST',
        body: JSON.stringify({
          // The raw text, not the rows parsed above. The server reads it again.
          payload: pasted,
          serve,
          source: fileName ? 'file_upload' : 'paste',
          file_name: fileName,
        }),
      });
      onCreated(json.data as UploadedTestSummary);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the test');
    } finally {
      setBusy(false);
    }
  }

  /* ─────────────────────────── Confirm ──────────────────────────────────── */

  if (parsed) {
    const kept = parsed.questions.length;
    const problems = [...parsed.errors, ...parsed.warnings];
    return (
      <Stack spacing={2}>
        <Alert severity="success" sx={{ '& .MuiAlert-message': { fontSize: 13 } }}>
          <strong>{kept}</strong> question{kept === 1 ? '' : 's'} read
          {fileName ? ` from ${fileName}` : ''}.
        </Alert>

        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
          <Chip size="small" color="primary" variant="outlined" label={`${kept} in the test`} />
          {parsed.errors.length > 0 && (
            <Chip size="small" color="warning" variant="outlined" label={`${parsed.errors.length} skipped`} />
          )}
        </Stack>

        {problems.length > 0 && (
          <Box>
            <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary' }}>
              What was skipped or changed
            </Typography>
            <Stack spacing={0.25} sx={{ mt: 0.5 }}>
              {problems.slice(0, MAX_LISTED_PROBLEMS).map((p, i) => (
                <Typography key={i} variant="caption" sx={{ color: 'text.secondary' }}>
                  {p}
                </Typography>
              ))}
              {problems.length > MAX_LISTED_PROBLEMS && (
                <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                  and {problems.length - MAX_LISTED_PROBLEMS} more.
                </Typography>
              )}
            </Stack>
          </Box>
        )}

        <TextField
          label="Asked each time"
          type="number"
          size="small"
          fullWidth
          value={serve}
          onChange={(e) => setServe(Math.max(1, Math.min(kept, Number(e.target.value) || 0)))}
          inputProps={{ min: 1, max: kept, inputMode: 'numeric' }}
          helperText={
            serve < kept
              ? `Each student is asked ${serve} of the ${kept}, drawn fresh every attempt.`
              : `Every student is asked all ${kept}, reordered each attempt.`
          }
        />

        {registryWarning && <Alert severity="warning">{registryWarning}</Alert>}
        {error && <Alert severity="error">{error}</Alert>}

        <Divider />
        <Stack direction="row" spacing={1} justifyContent="flex-end">
          <Button onClick={() => setParsed(null)} disabled={busy} sx={{ minHeight: 48 }}>
            Back
          </Button>
          <Button
            variant="contained"
            onClick={create}
            disabled={busy}
            startIcon={busy ? <CircularProgress size={16} color="inherit" /> : undefined}
            sx={{ minHeight: 48 }}
          >
            {busy ? 'Creating...' : 'Create the test'}
          </Button>
        </Stack>
      </Stack>
    );
  }

  /* ──────────────────────── Prompt and paste ────────────────────────────── */

  return (
    <Stack spacing={2}>
      <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
        <Button
          fullWidth
          onClick={() => setPromptOpen((v) => !v)}
          endIcon={
            <ExpandMoreIcon
              sx={{ transform: promptOpen ? 'rotate(180deg)' : 'none', transition: 'transform 150ms ease' }}
            />
          }
          sx={{ justifyContent: 'space-between', textTransform: 'none', minHeight: 48, px: 1.5 }}
        >
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            Need the prompt for this chapter?
          </Typography>
        </Button>

        <Collapse in={promptOpen}>
          <Box sx={{ px: 1.5, pb: 1.5 }}>
            <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: 1.5 }}>
              Copy this, open ChatGPT, Gemini or Claude, attach this chapter&apos;s PDF, and paste it. Bring the
              reply back here.
            </Typography>

            <ToggleButtonGroup
              exclusive
              fullWidth
              size="small"
              value={exam}
              onChange={(_, v) => v && setExam(v)}
              sx={{ mb: 1.5, '& .MuiToggleButton-root': { minHeight: 44 } }}
            >
              {EXAMS.map((e) => (
                <ToggleButton key={e.value} value={e.value}>
                  {e.label}
                </ToggleButton>
              ))}
            </ToggleButtonGroup>

            <TextField
              label="Questions to ask for"
              type="number"
              size="small"
              fullWidth
              value={count}
              onChange={(e) => setCount(Math.max(5, Math.min(200, Number(e.target.value) || 0)))}
              inputProps={{ min: 5, max: 200, inputMode: 'numeric' }}
              sx={{ mb: 1.5 }}
            />

            <Stack direction="row" spacing={1}>
              <Button
                variant="contained"
                size="small"
                fullWidth
                disabled={!registryReady}
                startIcon={<ContentCopyOutlinedIcon />}
                onClick={copyPrompt}
                sx={{ textTransform: 'none', minHeight: 48 }}
              >
                {copied ? 'Copied' : 'Copy prompt'}
              </Button>
              <Button
                size="small"
                disabled={!registryReady}
                startIcon={<DownloadOutlinedIcon />}
                onClick={downloadPrompt}
                sx={{ textTransform: 'none', minHeight: 48, whiteSpace: 'nowrap' }}
              >
                .txt
              </Button>
            </Stack>
          </Box>
        </Collapse>
      </Box>

      <Box
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const dropped = e.dataTransfer.files?.[0];
          if (dropped) readJsonFile(dropped);
        }}
        sx={{
          p: 2,
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
        <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>
          {fileName ? `Loaded ${fileName}` : 'Drop a .json or .txt file here'}
        </Typography>
        <Button component="label" size="small" sx={{ textTransform: 'none', mt: 0.5, minHeight: 48 }}>
          Choose a file
          <input
            type="file"
            accept=".json,.txt,application/json,text/plain"
            hidden
            onChange={(e) => {
              const chosen = e.target.files?.[0];
              if (chosen) readJsonFile(chosen);
              // Cleared so choosing the same file twice still fires onChange.
              e.target.value = '';
            }}
          />
        </Button>
      </Box>

      <TextField
        multiline
        minRows={5}
        maxRows={12}
        fullWidth
        label="Or paste the JSON"
        placeholder='{"questions":[{"question":"...","options":{"a":"..."},"answer":"b"}]}'
        value={pasted}
        onChange={(e) => {
          setPasted(e.target.value);
          if (fileName) setFileName(null);
        }}
        // 16px, because anything smaller makes iOS zoom the whole dialog on focus.
        sx={{ '& textarea': { fontFamily: 'monospace', fontSize: 16 } }}
      />

      {registryWarning && <Alert severity="warning">{registryWarning}</Alert>}
      {error && <Alert severity="error">{error}</Alert>}

      <Divider />
      <Stack direction="row" spacing={1} justifyContent="flex-end">
        <Button onClick={onCancel} sx={{ minHeight: 48 }}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={readQuestions}
          disabled={!pasted.trim() || !registryReady}
          sx={{ minHeight: 48 }}
        >
          Read the questions
        </Button>
      </Stack>
    </Stack>
  );
}
