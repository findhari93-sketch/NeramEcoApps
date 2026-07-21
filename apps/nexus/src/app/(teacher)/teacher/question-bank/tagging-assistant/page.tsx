'use client';

// External-AI tagging assistant: export prompt chunks -> teacher runs them in
// ChatGPT / Gemini / Claude -> pastes the JSON reply back -> reviews suggested
// tags per question -> commits additively via the bulk add_tags endpoint.

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  Box,
  Typography,
  Button,
  IconButton,
  Paper,
  Chip,
  TextField,
  Skeleton,
  Snackbar,
  Alert,
  ToggleButton,
  ToggleButtonGroup,
  Radio,
  RadioGroup,
  FormControlLabel,
  CircularProgress,
  Divider,
} from '@neram/ui';
import ArrowBackOutlinedIcon from '@mui/icons-material/ArrowBackOutlined';
import ContentCopyOutlinedIcon from '@mui/icons-material/ContentCopyOutlined';
import NavigateBeforeOutlinedIcon from '@mui/icons-material/NavigateBeforeOutlined';
import NavigateNextOutlinedIcon from '@mui/icons-material/NavigateNextOutlined';
import DeleteOutlineOutlinedIcon from '@mui/icons-material/DeleteOutlineOutlined';
import AutoAwesomeOutlinedIcon from '@mui/icons-material/AutoAwesomeOutlined';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import TagPicker from '@/components/question-bank/TagPicker';
import {
  buildTaggingPrompt,
  validateTaggingJSON,
  type TaggingRegistryTag,
  type TaggingExportQuestion,
} from '@/lib/qb-tagging-schema';

type Scope = 'untagged' | 'filtered';

interface ReviewTag {
  id: string;
  slug: string;
  label: string;
  on: boolean;
}

interface ReviewRow {
  question_id: string;
  question_text: string | null;
  tags: ReviewTag[];
}

const COMMIT_BATCH = 100;

export default function TaggingAssistantPage() {
  const router = useRouter();
  const { getToken, isTeacher } = useNexusAuthContext();

  // Registry
  const [registry, setRegistry] = useState<TaggingRegistryTag[]>([]);

  // Export state
  const [scope, setScope] = useState<Scope>('untagged');
  const [filterTagIds, setFilterTagIds] = useState<string[]>([]);
  const [filterSearch, setFilterSearch] = useState('');
  const [chunkSize, setChunkSize] = useState<number>(100);
  const [chunk, setChunk] = useState(1);
  const [total, setTotal] = useState<number | null>(null);
  const [exporting, setExporting] = useState(false);
  // id -> question text, accumulated across every chunk fetched this session.
  const [textCache, setTextCache] = useState<Map<string, string | null>>(new Map());
  const [knownIds, setKnownIds] = useState<Set<string>>(new Set());

  // Import / review state
  const [pasted, setPasted] = useState('');
  const [rows, setRows] = useState<ReviewRow[] | null>(null);
  const [problems, setProblems] = useState<{ errors: string[]; warnings: string[] }>({ errors: [], warnings: [] });
  const [committing, setCommitting] = useState(false);

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

  // Load registry + untagged total once.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [tagsJson, countJson] = await Promise.all([
          authFetch('/api/question-bank/tags'),
          authFetch('/api/question-bank/tagging-export?scope=untagged&page=1&page_size=1'),
        ]);
        if (cancelled) return;
        setRegistry(
          (tagsJson.data || []).map((t: any) => ({ id: t.id, slug: t.slug, label: t.label, group_type: t.group_type })),
        );
        setTotal(countJson.data?.total ?? 0);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authFetch]);

  const totalChunks = total != null ? Math.max(1, Math.ceil(total / chunkSize)) : null;

  function exportQuery(page: number): string {
    const p = new URLSearchParams();
    p.set('scope', scope);
    p.set('page', String(page));
    p.set('page_size', String(chunkSize));
    if (scope === 'filtered') {
      if (filterTagIds.length) p.set('tag_ids', filterTagIds.join(','));
      if (filterSearch.trim()) p.set('search', filterSearch.trim());
    }
    return p.toString();
  }

  async function copyChunkPrompt() {
    setExporting(true);
    setError(null);
    try {
      const json = await authFetch(`/api/question-bank/tagging-export?${exportQuery(chunk)}`);
      const questions: TaggingExportQuestion[] = json.data?.questions || [];
      setTotal(json.data?.total ?? 0);
      if (questions.length === 0) {
        setToast('Nothing to export in this chunk.');
        return;
      }
      setTextCache((prev) => {
        const next = new Map(prev);
        for (const q of questions) next.set(q.id, q.question_text ?? null);
        return next;
      });
      setKnownIds((prev) => {
        const next = new Set(prev);
        for (const q of questions) next.add(q.id);
        return next;
      });
      const prompt = buildTaggingPrompt(questions, registry);
      await navigator.clipboard.writeText(prompt);
      setToast(`Prompt for ${questions.length} questions copied. Paste it into your AI chat.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to build the prompt');
    } finally {
      setExporting(false);
    }
  }

  function runValidation() {
    const result = validateTaggingJSON(pasted, registry, knownIds.size > 0 ? knownIds : undefined);
    setProblems({ errors: result.errors, warnings: result.warnings });
    setRows(
      result.pairs.map((p) => ({
        question_id: p.question_id,
        question_text: textCache.get(p.question_id) ?? null,
        tags: p.tag_ids.map((id, i) => {
          const reg = registry.find((t) => t.id === id);
          return { id, slug: p.tag_slugs[i], label: reg?.label || p.tag_slugs[i], on: true };
        }),
      })),
    );
  }

  function toggleTag(qid: string, tagId: string) {
    setRows((prev) =>
      (prev || []).map((r) =>
        r.question_id === qid
          ? { ...r, tags: r.tags.map((t) => (t.id === tagId ? { ...t, on: !t.on } : t)) }
          : r,
      ),
    );
  }

  function removeRow(qid: string) {
    setRows((prev) => (prev || []).filter((r) => r.question_id !== qid));
  }

  const commitCount = useMemo(
    () => (rows || []).filter((r) => r.tags.some((t) => t.on)).length,
    [rows],
  );

  async function commit() {
    const assignments = (rows || [])
      .map((r) => ({ question_id: r.question_id, tag_ids: r.tags.filter((t) => t.on).map((t) => t.id) }))
      .filter((a) => a.tag_ids.length > 0);
    if (assignments.length === 0) return;
    setCommitting(true);
    setError(null);
    try {
      let applied = 0;
      let skipped = 0;
      for (let i = 0; i < assignments.length; i += COMMIT_BATCH) {
        const json = await authFetch('/api/question-bank/questions/bulk-update', {
          method: 'PATCH',
          body: JSON.stringify({ action: 'add_tags', assignments: assignments.slice(i, i + COMMIT_BATCH) }),
        });
        applied += json.data?.updated || 0;
        skipped += json.data?.skipped || 0;
      }
      setRows(null);
      setPasted('');
      setProblems({ errors: [], warnings: [] });
      setToast(
        `Tags applied to ${applied} question${applied !== 1 ? 's' : ''}${skipped > 0 ? `, ${skipped} unknown id${skipped !== 1 ? 's' : ''} skipped` : ''}. Copy the next chunk to continue.`,
      );
      // Untagged pool just shrank; refresh the count.
      if (scope === 'untagged') {
        try {
          const countJson = await authFetch('/api/question-bank/tagging-export?scope=untagged&page=1&page_size=1');
          setTotal(countJson.data?.total ?? 0);
          setChunk(1);
        } catch {
          // count refresh is best-effort
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to apply tags');
    } finally {
      setCommitting(false);
    }
  }

  if (!isTeacher) {
    return (
      <Box sx={{ px: { xs: 2, md: 3 }, py: 6, textAlign: 'center' }}>
        <Typography color="text.secondary">Only teachers can use the tagging assistant.</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ px: { xs: 2, md: 3 }, py: 2, maxWidth: 900, mx: 'auto' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
        <IconButton onClick={() => router.push('/teacher/question-bank')} aria-label="Back to Question Bank">
          <ArrowBackOutlinedIcon />
        </IconButton>
        <Box sx={{ flex: 1 }}>
          <Typography variant="h5" component="h1" sx={{ fontWeight: 700 }}>
            Tagging assistant
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Copy a prompt, run it in ChatGPT, Gemini or Claude, paste the reply back
          </Typography>
        </Box>
      </Box>

      {/* Step 1: Export */}
      <Paper variant="outlined" sx={{ p: 2, mt: 2, borderRadius: 2 }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
          1. Copy a prompt chunk
        </Typography>
        <RadioGroup value={scope} onChange={(e) => { setScope(e.target.value as Scope); setChunk(1); }} row>
          <FormControlLabel
            value="untagged"
            control={<Radio size="small" />}
            label={`Untagged only${total != null && scope === 'untagged' ? ` (${total})` : ''}`}
          />
          <FormControlLabel value="filtered" control={<Radio size="small" />} label="Filtered" />
        </RadioGroup>
        {scope === 'filtered' && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, mt: 1 }}>
            <TextField
              size="small"
              fullWidth
              placeholder="Search question text"
              value={filterSearch}
              onChange={(e) => { setFilterSearch(e.target.value); setChunk(1); }}
            />
            <TagPicker value={filterTagIds} onChange={(ids) => { setFilterTagIds(ids); setChunk(1); }} getToken={getToken} label="Filter by tags" />
          </Box>
        )}
        <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 1.5, mt: 1.5 }}>
          <ToggleButtonGroup
            size="small"
            exclusive
            value={chunkSize}
            onChange={(_, v) => {
              if (v) {
                setChunkSize(v);
                setChunk(1);
              }
            }}
          >
            <ToggleButton value={50} sx={{ textTransform: 'none', px: 1.5 }}>
              50 / chunk
            </ToggleButton>
            <ToggleButton value={100} sx={{ textTransform: 'none', px: 1.5 }}>
              100 / chunk
            </ToggleButton>
          </ToggleButtonGroup>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <IconButton
              size="small"
              disabled={chunk <= 1}
              onClick={() => setChunk((c) => Math.max(1, c - 1))}
              aria-label="Previous chunk"
              sx={{ minWidth: 44, minHeight: 44 }}
            >
              <NavigateBeforeOutlinedIcon />
            </IconButton>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              Chunk {chunk}
              {totalChunks != null && scope === 'untagged' ? ` of ${totalChunks}` : ''}
            </Typography>
            <IconButton
              size="small"
              disabled={totalChunks != null && scope === 'untagged' && chunk >= totalChunks}
              onClick={() => setChunk((c) => c + 1)}
              aria-label="Next chunk"
              sx={{ minWidth: 44, minHeight: 44 }}
            >
              <NavigateNextOutlinedIcon />
            </IconButton>
          </Box>
          <Button
            variant="contained"
            startIcon={exporting ? <CircularProgress size={16} color="inherit" /> : <ContentCopyOutlinedIcon />}
            disabled={exporting || registry.length === 0}
            onClick={copyChunkPrompt}
            sx={{ textTransform: 'none', minHeight: 44 }}
          >
            Copy prompt
          </Button>
        </Box>
        {scope === 'untagged' && (
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
            Applied questions leave the untagged pool, so after applying, start again from chunk 1.
          </Typography>
        )}
      </Paper>

      {/* Step 2: Paste */}
      <Paper variant="outlined" sx={{ p: 2, mt: 2, borderRadius: 2 }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
          2. Paste the AI reply
        </Typography>
        <TextField
          multiline
          minRows={4}
          maxRows={10}
          fullWidth
          placeholder='{"assignments":[{"question_id":"...","tag_slugs":["history_of_architecture"]}]}'
          value={pasted}
          onChange={(e) => setPasted(e.target.value)}
          sx={{ '& textarea': { fontFamily: 'monospace', fontSize: '0.8rem' } }}
        />
        <Button
          variant="outlined"
          onClick={runValidation}
          disabled={!pasted.trim() || registry.length === 0}
          sx={{ textTransform: 'none', minHeight: 44, mt: 1.5 }}
        >
          Check and preview
        </Button>
      </Paper>

      {/* Step 3: Review + commit */}
      {rows !== null && (
        <Paper variant="outlined" sx={{ p: 2, mt: 2, borderRadius: 2, mb: 10 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
            3. Review and apply
          </Typography>

          {problems.errors.map((e, i) => (
            <Alert key={`e${i}`} severity="error" sx={{ mb: 1 }}>
              {e}
            </Alert>
          ))}
          {problems.warnings.length > 0 && (
            <Alert severity="warning" sx={{ mb: 1 }}>
              {problems.warnings.length} note{problems.warnings.length !== 1 ? 's' : ''}:{' '}
              {problems.warnings.slice(0, 3).join(' ')}
              {problems.warnings.length > 3 ? ` (+${problems.warnings.length - 3} more)` : ''}
            </Alert>
          )}

          {rows.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              Nothing valid to apply. Fix the paste and check again.
            </Typography>
          ) : (
            <>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
                Tap a tag to exclude it. Existing tags on a question are never removed.
              </Typography>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                {rows.map((r) => (
                  <Paper key={r.question_id} variant="outlined" sx={{ p: 1.25, borderRadius: 1.5 }}>
                    <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography
                          variant="body2"
                          sx={{
                            display: '-webkit-box',
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: 'vertical',
                            overflow: 'hidden',
                            mb: 0.75,
                          }}
                        >
                          {r.question_text || `Question ${r.question_id.slice(0, 8)}...`}
                        </Typography>
                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                          {r.tags.map((t) => (
                            <Chip
                              key={t.id}
                              label={t.label}
                              size="small"
                              clickable
                              color={t.on ? 'primary' : 'default'}
                              variant={t.on ? 'filled' : 'outlined'}
                              onClick={() => toggleTag(r.question_id, t.id)}
                              sx={{ height: 26 }}
                            />
                          ))}
                        </Box>
                      </Box>
                      <IconButton
                        size="small"
                        aria-label="Remove row"
                        onClick={() => removeRow(r.question_id)}
                        sx={{ minWidth: 44, minHeight: 44 }}
                      >
                        <DeleteOutlineOutlinedIcon sx={{ fontSize: 18 }} />
                      </IconButton>
                    </Box>
                  </Paper>
                ))}
              </Box>
              <Divider sx={{ my: 2 }} />
              <Button
                variant="contained"
                fullWidth
                startIcon={committing ? <CircularProgress size={16} color="inherit" /> : <AutoAwesomeOutlinedIcon />}
                disabled={committing || commitCount === 0}
                onClick={commit}
                sx={{ textTransform: 'none', minHeight: 48 }}
              >
                Apply tags to {commitCount} question{commitCount !== 1 ? 's' : ''}
              </Button>
            </>
          )}
        </Paper>
      )}

      {registry.length === 0 && total === null && (
        <Box sx={{ mt: 2 }}>
          <Skeleton variant="rectangular" height={120} sx={{ borderRadius: 2 }} />
        </Box>
      )}

      <Snackbar
        open={Boolean(toast)}
        autoHideDuration={4000}
        onClose={() => setToast(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity="success" variant="filled" onClose={() => setToast(null)}>
          {toast}
        </Alert>
      </Snackbar>
      <Snackbar open={Boolean(error)} autoHideDuration={5000} onClose={() => setError(null)}>
        <Alert severity="error" variant="filled" onClose={() => setError(null)}>
          {error}
        </Alert>
      </Snackbar>
    </Box>
  );
}
