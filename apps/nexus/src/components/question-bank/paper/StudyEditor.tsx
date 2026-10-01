'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Autocomplete,
  Box,
  Button,
  CircularProgress,
  IconButton,
  Skeleton,
  TextField,
  Typography,
} from '@neram/ui';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import type { NexusQBQuestionStudy, QBStudyEditorData } from '@neram/database';

/**
 * "What to study" for one question, for a teacher.
 *
 * Shows what the classifier wrote (and how sure it was), and lets a teacher
 * set the primary chapter, the chapters it also uses, and the concepts with
 * the NCERT or Foundation section that teaches each. Saving marks it reviewed,
 * so students see it at once, and a new primary chapter replaces the old one
 * in the question's categories.
 *
 * Loads only when opened: most edits never touch it.
 */

interface ConceptDraft {
  name: string;
  why: string;
  /** 'ncert:c11.2.4' or 'foundation:<section id>' or '' */
  ref: string;
}

interface RefOption {
  value: string;
  label: string;
  group: string;
}

export interface StudyEditorProps {
  questionId: string;
  isMath: boolean;
  getToken: () => Promise<string | null>;
  /** The server moved the question's chapter; keep the form's categories in step. */
  onCategoriesChange?: (categories: string[]) => void;
}

function toDrafts(row: NexusQBQuestionStudy | null): ConceptDraft[] {
  return (row?.concepts || []).map((c) => ({
    name: c.name,
    why: c.why || '',
    ref: c.ncert_ref ? `ncert:${c.ncert_ref}` : c.foundation_section_id ? `foundation:${c.foundation_section_id}` : '',
  }));
}

export function statusLine(row: NexusQBQuestionStudy | null): string {
  if (!row) return 'Not set yet. Students see the chapter reading from its tag only.';
  if (row.source === 'staff') return 'Written by a teacher. Students see this.';
  const sure = row.confidence !== null ? `, ${Math.round(row.confidence * 100)}% sure` : '';
  if (row.reviewed_at) return `Suggested by AI${sure}, approved. Students see this.`;
  return `Suggested by AI${sure}. Save to approve it for students.`;
}

export default function StudyEditor({ questionId, isMath, getToken, onCategoriesChange }: StudyEditorProps) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<QBStudyEditorData | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const [primary, setPrimary] = useState<string | null>(null);
  const [alsoUses, setAlsoUses] = useState<string[]>([]);
  const [concepts, setConcepts] = useState<ConceptDraft[]>([]);

  const hydrate = useCallback((d: QBStudyEditorData) => {
    setData(d);
    setPrimary(d.row?.primary_slug ?? d.categories.find((c) => d.chapters.some((ch) => ch.slug === c)) ?? null);
    setAlsoUses(d.row?.also_uses ?? []);
    setConcepts(toDrafts(d.row));
  }, []);

  useEffect(() => {
    if (!open || data) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const token = await getToken();
        const res = await fetch(`/api/question-bank/questions/${questionId}/study`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Could not load');
        if (!cancelled) hydrate(json.data);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, data, questionId, getToken, hydrate]);

  const chapterLabel = useMemo(() => new Map((data?.chapters || []).map((c) => [c.slug, c.label])), [data]);
  const refOptions: RefOption[] = useMemo(
    () => [
      ...(data?.ncert || []).map((n) => ({ value: `ncert:${n.ref}`, label: `NCERT ${n.label}`, group: 'NCERT' })),
      ...(data?.foundation || []).map((f) => ({ value: `foundation:${f.id}`, label: f.label, group: 'Foundation book' })),
    ],
    [data],
  );
  const refById = useMemo(() => new Map(refOptions.map((o) => [o.value, o])), [refOptions]);

  const updateConcept = (i: number, patch: Partial<ConceptDraft>) =>
    setConcepts((prev) => prev.map((c, j) => (j === i ? { ...c, ...patch } : c)));

  const save = async () => {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const token = await getToken();
      const res = await fetch(`/api/question-bank/questions/${questionId}/study`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          primary_slug: isMath ? primary : (data?.row?.primary_slug ?? null),
          also_uses: isMath ? alsoUses.filter((s) => s !== primary) : [],
          concepts: concepts
            .filter((c) => c.name.trim())
            .map((c) => ({
              name: c.name.trim(),
              why: c.why.trim() || null,
              ncert_ref: c.ref.startsWith('ncert:') ? c.ref.slice(6) : null,
              foundation_section_id: c.ref.startsWith('foundation:') ? c.ref.slice(11) : null,
            })),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Could not save');
      hydrate(json.data);
      onCategoriesChange?.(json.data.categories);
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Accordion
      expanded={open}
      onChange={(_, v) => setOpen(v)}
      disableGutters
      variant="outlined"
      sx={{ mb: 1 }}
    >
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        <Typography variant="body2" fontWeight={600}>
          What to study
        </Typography>
      </AccordionSummary>
      <AccordionDetails>
        {loading || (!data && !error) ? (
          <Box>
            <Skeleton variant="rounded" height={40} sx={{ mb: 1 }} />
            <Skeleton variant="rounded" height={40} />
          </Box>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            {error && <Alert severity="error">{error}</Alert>}
            {data && (
              <>
                <Typography variant="caption" color="text.secondary">
                  {statusLine(data.row)}
                </Typography>
                {data.row?.rationale && data.row.source === 'ai' && (
                  <Typography variant="caption" color="text.secondary">
                    AI reasoning: {data.row.rationale}
                  </Typography>
                )}

                {isMath && (
                  <>
                    <Autocomplete
                      options={data.chapters.map((c) => c.slug)}
                      groupBy={(slug) => data.chapters.find((c) => c.slug === slug)?.group ?? ''}
                      getOptionLabel={(slug) => chapterLabel.get(slug) ?? slug}
                      value={primary}
                      onChange={(_, v) => setPrimary(v)}
                      renderInput={(p) => (
                        <TextField {...p} label="Main chapter" size="small" helperText="Drives the chapter filter" />
                      )}
                    />
                    <Autocomplete
                      multiple
                      options={data.chapters.map((c) => c.slug).filter((s) => s !== primary)}
                      groupBy={(slug) => data.chapters.find((c) => c.slug === slug)?.group ?? ''}
                      getOptionLabel={(slug) => chapterLabel.get(slug) ?? slug}
                      value={alsoUses.filter((s) => s !== primary)}
                      onChange={(_, v) => setAlsoUses(v.slice(0, 3))}
                      renderInput={(p) => (
                        <TextField {...p} label="Also uses" size="small" helperText="Shown to students, not filtered on" />
                      )}
                    />
                  </>
                )}

                <Typography variant="caption" fontWeight={600} color="text.secondary">
                  Concepts
                </Typography>
                {concepts.length === 0 && (
                  <Typography variant="caption" color="text.secondary">
                    None yet.
                  </Typography>
                )}
                {concepts.map((c, i) => (
                  <Box key={i} sx={{ display: 'flex', flexDirection: 'column', gap: 1, p: 1, border: 1, borderColor: 'divider', borderRadius: 1 }}>
                    <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
                      <TextField
                        label="Concept"
                        size="small"
                        fullWidth
                        value={c.name}
                        onChange={(e) => updateConcept(i, { name: e.target.value })}
                      />
                      <IconButton
                        aria-label={`Remove concept ${c.name || i + 1}`}
                        onClick={() => setConcepts((prev) => prev.filter((_, j) => j !== i))}
                        sx={{ width: 44, height: 44 }}
                      >
                        <DeleteOutlineIcon />
                      </IconButton>
                    </Box>
                    <TextField
                      label="Why it is needed"
                      size="small"
                      fullWidth
                      value={c.why}
                      onChange={(e) => updateConcept(i, { why: e.target.value })}
                    />
                    <Autocomplete
                      options={refOptions}
                      groupBy={(o) => o.group}
                      getOptionLabel={(o) => o.label}
                      isOptionEqualToValue={(a, b) => a.value === b.value}
                      value={refById.get(c.ref) ?? null}
                      onChange={(_, v) => updateConcept(i, { ref: v?.value ?? '' })}
                      renderInput={(p) => <TextField {...p} label="Where to learn it" size="small" />}
                    />
                  </Box>
                ))}
                {concepts.length < 6 && (
                  <Button
                    startIcon={<AddIcon />}
                    onClick={() => setConcepts((prev) => [...prev, { name: '', why: '', ref: '' }])}
                    sx={{ alignSelf: 'flex-start', textTransform: 'none', minHeight: 44 }}
                  >
                    Add concept
                  </Button>
                )}

                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                  <Button
                    variant="contained"
                    onClick={save}
                    disabled={saving || (isMath && !primary)}
                    startIcon={saving ? <CircularProgress size={16} color="inherit" /> : undefined}
                    sx={{ minHeight: 44, textTransform: 'none' }}
                  >
                    Save and approve
                  </Button>
                  {saved && (
                    <Typography variant="caption" color="success.main" role="status">
                      Saved. Students see this now.
                    </Typography>
                  )}
                </Box>
              </>
            )}
          </Box>
        )}
      </AccordionDetails>
    </Accordion>
  );
}
