'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Button,
  Chip,
  Checkbox,
  Skeleton,
  Stack,
  Divider,
  Snackbar,
  Alert,
  CircularProgress,
} from '@neram/ui';
import PageHeader from '@/components/PageHeader';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import { QB_CATEGORY_LABELS, type QBCategory } from '@neram/database';

interface Proposal {
  id: string;
  question_id: string;
  question_text: string | null;
  current_categories: string[];
  proposed_add: string[];
  proposed_remove: string[];
  source: 'keyword' | 'ai' | 'manual';
  confidence: number | null;
  rationale: string | null;
}

const label = (slug: string) => QB_CATEGORY_LABELS[slug as QBCategory] ?? slug;

/**
 * Review queue for staged category re-classifications.
 *
 * Nothing the proposal script produces reaches a student until someone approves
 * it here. Applying goes through the nexus_qb_apply_category_proposals RPC,
 * which writes categories[] and the tag join table together.
 */
export default function ReclassifyPage() {
  const { getToken } = useNexusAuthContext();

  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [summary, setSummary] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [snack, setSnack] = useState<{ open: boolean; msg: string; severity: 'success' | 'error' }>({
    open: false,
    msg: '',
    severity: 'success',
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const token = await getToken();
      const res = await fetch('/api/question-bank/category-proposals?status=pending&page_size=50', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to load proposals');
      const json = await res.json();
      const rows: Proposal[] = json.data || [];
      setProposals(rows);
      setSummary(json.summary || {});
      // Default to everything selected: the keyword pass is high precision, so
      // reviewing is about spotting the exceptions, not ticking 50 boxes.
      setSelected(new Set(rows.map((r) => r.id)));
    } catch (err) {
      setSnack({ open: true, msg: err instanceof Error ? err.message : 'Failed to load', severity: 'error' });
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  useEffect(() => {
    load();
  }, [load]);

  async function submit(action: 'apply' | 'reject') {
    const ids = [...selected];
    if (ids.length === 0) return;
    setBusy(true);
    try {
      const token = await getToken();
      const res = await fetch('/api/question-bank/category-proposals', {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, action }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || 'Request failed');
      }
      const json = await res.json();
      const msg =
        action === 'apply'
          ? `Applied ${json.data?.applied ?? 0} questions` +
            (json.data?.stale ? `, ${json.data.stale} skipped as stale` : '')
          : `Rejected ${json.data?.updated ?? ids.length} proposals`;
      setSnack({ open: true, msg, severity: 'success' });
      await load();
    } catch (err) {
      setSnack({ open: true, msg: err instanceof Error ? err.message : 'Failed', severity: 'error' });
    } finally {
      setBusy(false);
    }
  }

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const allSelected = proposals.length > 0 && selected.size === proposals.length;

  return (
    <Box sx={{ p: { xs: 1.5, md: 3 }, pb: 12, maxWidth: 900, mx: 'auto' }}>
      <PageHeader
        title="Re-classify topics"
        subtitle="Proposed sub-topics for coordinate geometry questions. Nothing changes for students until you apply."
        breadcrumbs={[{ label: 'Question Bank', href: '/teacher/question-bank' }]}
        backHref="/teacher/question-bank"
      />

      {Object.keys(summary).length > 0 && (
        <Stack direction="row" spacing={0.5} sx={{ mb: 2, flexWrap: 'wrap', gap: 0.5 }}>
          {(['pending', 'applied', 'rejected', 'stale'] as const).map((s) =>
            summary[s] ? (
              <Chip key={s} size="small" variant="outlined" label={`${s}: ${summary[s]}`} />
            ) : null,
          )}
        </Stack>
      )}

      {loading ? (
        <Stack spacing={1}>
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} variant="rounded" height={96} />
          ))}
        </Stack>
      ) : proposals.length === 0 ? (
        <Box sx={{ textAlign: 'center', py: 8 }}>
          <Typography variant="body1" fontWeight={600}>
            Nothing waiting for review
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            Run scripts/qb-propose-subtopics.ts to stage a new batch.
          </Typography>
        </Box>
      ) : (
        <>
          <Stack direction="row" alignItems="center" sx={{ mb: 1 }}>
            <Checkbox
              checked={allSelected}
              indeterminate={selected.size > 0 && !allSelected}
              onChange={() =>
                setSelected(allSelected ? new Set() : new Set(proposals.map((p) => p.id)))
              }
              inputProps={{ 'aria-label': 'Select all proposals' }}
            />
            <Typography variant="body2" color="text.secondary">
              {selected.size} of {proposals.length} selected
            </Typography>
          </Stack>

          <Stack spacing={1}>
            {proposals.map((p) => (
              <Box
                key={p.id}
                onClick={() => toggle(p.id)}
                sx={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 0.5,
                  p: 1,
                  border: 1,
                  borderColor: selected.has(p.id) ? 'primary.main' : 'divider',
                  borderRadius: 2,
                  cursor: 'pointer',
                  bgcolor: selected.has(p.id) ? 'action.selected' : 'background.paper',
                }}
              >
                <Checkbox
                  checked={selected.has(p.id)}
                  onClick={(e: React.MouseEvent) => e.stopPropagation()}
                  onChange={() => toggle(p.id)}
                  sx={{ mt: -0.5 }}
                  inputProps={{ 'aria-label': `Select proposal ${p.question_id}` }}
                />
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography
                    variant="body2"
                    sx={{
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden',
                      lineHeight: 1.4,
                      mb: 0.75,
                    }}
                  >
                    {p.question_text || '(image only question)'}
                  </Typography>

                  <Stack direction="row" spacing={0.5} sx={{ flexWrap: 'wrap', gap: 0.5 }}>
                    {p.proposed_add.map((slug) => (
                      <Chip key={`a-${slug}`} size="small" color="success" label={`+ ${label(slug)}`} />
                    ))}
                    {p.proposed_remove.map((slug) => (
                      <Chip
                        key={`r-${slug}`}
                        size="small"
                        color="error"
                        variant="outlined"
                        label={`- ${label(slug)}`}
                      />
                    ))}
                  </Stack>

                  {p.rationale && (
                    <Typography variant="caption" color="text.disabled" sx={{ display: 'block', mt: 0.5 }}>
                      {p.source}: {p.rationale}
                    </Typography>
                  )}
                </Box>
              </Box>
            ))}
          </Stack>
        </>
      )}

      {/* Sticky action bar */}
      {proposals.length > 0 && (
        <Box
          sx={{
            position: 'fixed',
            bottom: 0,
            left: 0,
            right: 0,
            p: 1.5,
            display: 'flex',
            gap: 1,
            bgcolor: 'background.paper',
            borderTop: 1,
            borderColor: 'divider',
            zIndex: 10,
          }}
        >
          <Button
            variant="outlined"
            color="error"
            fullWidth
            disabled={busy || selected.size === 0}
            onClick={() => submit('reject')}
            sx={{ minHeight: 48 }}
          >
            Reject
          </Button>
          <Button
            variant="contained"
            fullWidth
            disabled={busy || selected.size === 0}
            onClick={() => submit('apply')}
            sx={{ minHeight: 48 }}
            startIcon={busy ? <CircularProgress size={16} color="inherit" /> : undefined}
          >
            Apply to {selected.size} question{selected.size === 1 ? '' : 's'}
          </Button>
        </Box>
      )}

      <Snackbar
        open={snack.open}
        autoHideDuration={5000}
        onClose={() => setSnack((s) => ({ ...s, open: false }))}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
      >
        <Alert severity={snack.severity} onClose={() => setSnack((s) => ({ ...s, open: false }))}>
          {snack.msg}
        </Alert>
      </Snackbar>
    </Box>
  );
}
