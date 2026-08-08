'use client';

import { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  Paper,
  Tab,
  Tabs,
  TextField,
  Typography,
  alpha,
  useTheme,
} from '@neram/ui';
import CheckCircleOutlinedIcon from '@mui/icons-material/CheckCircleOutlined';
import WarningAmberOutlinedIcon from '@mui/icons-material/WarningAmberOutlined';
import ErrorOutlineOutlinedIcon from '@mui/icons-material/ErrorOutlineOutlined';
import ContentCopyOutlinedIcon from '@mui/icons-material/ContentCopyOutlined';
import {
  TEST_JSON_SPEC,
  validateImportJSON,
  validationReport,
  type ImportRegistryTag,
} from '@/lib/qb-import-schema';
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

export default function SourceJsonPanel({
  draft,
  registry,
  onPatch,
  onParsed,
}: {
  draft: TestDraft;
  registry: ImportRegistryTag[];
  onPatch: (patch: Partial<TestDraft['json']>) => void;
  onParsed: (payload: { questions: any[]; proposedTags: any[]; title: string; folderPath: string[] }) => void;
}) {
  const theme = useTheme();
  const [tab, setTab] = useState<'file' | 'paste'>('paste');
  const [dragging, setDragging] = useState(false);
  const [copied, setCopied] = useState(false);

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

  const copySpec = useCallback(() => {
    navigator.clipboard?.writeText(TEST_JSON_SPEC).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  }, []);

  const usable = (result?.questions.length ?? 0) > 0;

  return (
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
            placeholder="Paste the JSON reply here"
            value={draft.json.raw}
            onChange={(e) => onPatch({ raw: e.target.value, fileName: null, fileSize: null })}
            sx={{ '& .MuiInputBase-input': { fontFamily: 'monospace', fontSize: 13 } }}
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
          size="small"
          onClick={copySpec}
          startIcon={<ContentCopyOutlinedIcon sx={{ fontSize: 16 }} />}
          sx={{ textTransform: 'none', mt: 1.5, minHeight: 44 }}
        >
          {copied ? 'Format spec copied' : 'View the JSON format spec'}
        </Button>

        <Button
          fullWidth
          variant="contained"
          disabled={!usable}
          onClick={() =>
            result &&
            onParsed({
              questions: result.questions,
              proposedTags: result.proposedTags,
              title: result.test.title,
              folderPath: result.test.folder_path,
            })
          }
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
  );
}
