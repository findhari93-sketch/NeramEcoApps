'use client';

/**
 * Point a Study Materials PDF at the Question Bank paper it is the source of.
 *
 * The two are built independently today: a teacher uploads the PDF here so
 * students can read it, and separately builds the paper's structured, tagged
 * questions under Question Bank. Nothing connects them, so "Add a test" on
 * this file has no way to know a bank of questions for it already exists and
 * offers to write a fresh, untagged set from the raw PDF instead.
 *
 * This dialog only sets nexus_qb_original_papers.study_file_id, the same
 * write PaperStudentAccessPanel already makes from the paper's own side
 * (PATCH /api/question-bank/papers/[id]/access). Once linked, the file's test
 * card can offer the paper's own mock instead of a second one.
 */

import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  InputAdornment,
  Skeleton,
  TextField,
  Typography,
  alpha,
  useTheme,
} from '@neram/ui';
import SearchOutlinedIcon from '@mui/icons-material/SearchOutlined';
import CloseIcon from '@mui/icons-material/Close';
import LinkOutlinedIcon from '@mui/icons-material/LinkOutlined';
import type { NexusQBOriginalPaper } from '@neram/database';

const EXAM_LABELS: Record<string, string> = {
  NATA: 'NATA',
  JEE_PAPER_2: 'JEE Paper 2',
};

function paperLabel(paper: NexusQBOriginalPaper): string {
  const exam = EXAM_LABELS[paper.exam_type] || paper.exam_type;
  const parts = [String(paper.year), paper.session, paper.shift].filter(Boolean);
  return `${exam} ${parts.join(' ')}`.trim();
}

export interface LinkedQBPaperResult {
  id: string;
  title: string;
  short_title: string;
}

interface LinkQBPaperDialogProps {
  open: boolean;
  file: { id: string; title: string } | null;
  authFetch: (url: string, init?: RequestInit) => Promise<Response>;
  onClose: () => void;
  /** Called with the newly linked paper so the caller can update its own state without a full reload. */
  onLinked: (paper: LinkedQBPaperResult) => void;
}

export default function LinkQBPaperDialog({ open, file, authFetch, onClose, onLinked }: LinkQBPaperDialogProps) {
  const theme = useTheme();
  const [papers, setPapers] = useState<NexusQBOriginalPaper[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [linkingId, setLinkingId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setSearch('');
    setError(null);
    setLoading(true);
    let cancelled = false;
    (async () => {
      try {
        const res = await authFetch('/api/question-bank/papers');
        const json = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) throw new Error(json?.error || 'Could not load papers');
        setPapers(json.data || []);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load papers');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, authFetch]);

  const filtered = useMemo(() => {
    const list = papers || [];
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter((p) => paperLabel(p).toLowerCase().includes(q));
  }, [papers, search]);

  const link = async (paper: NexusQBOriginalPaper) => {
    if (!file) return;
    setLinkingId(paper.id);
    setError(null);
    try {
      const res = await authFetch(`/api/question-bank/papers/${paper.id}/access`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ study_file_id: file.id }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || 'Could not link that paper');
      onLinked({ id: paper.id, title: paperLabel(paper), short_title: paperLabel(paper) });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not link that paper');
    } finally {
      setLinkingId(null);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontWeight: 800, fontSize: '1.0625rem' }}>Link to a Question Bank paper</Typography>
          <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>
            {file?.title || 'This file'}
          </Typography>
        </Box>
        <IconButton onClick={onClose} aria-label="Close" sx={{ width: 44, height: 44 }}>
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent sx={{ pt: 1 }}>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
          Once linked, this PDF's test can reuse the paper's own tagged questions instead of writing a
          second, separate set.
        </Typography>

        {error && (
          <Alert severity="error" sx={{ mb: 1.5 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        <TextField
          fullWidth
          size="small"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search papers, e.g. JEE 2025"
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchOutlinedIcon fontSize="small" />
              </InputAdornment>
            ),
          }}
          sx={{ mb: 1.5, '& .MuiInputBase-root': { minHeight: 48 } }}
        />

        {loading ? (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} variant="rounded" height={56} />
            ))}
          </Box>
        ) : filtered.length === 0 ? (
          <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 3 }}>
            {search ? 'No papers match that search.' : 'No papers exist yet in Question Bank.'}
          </Typography>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75, maxHeight: 360, overflow: 'auto' }}>
            {filtered.map((paper) => {
              const linkedElsewhere = !!paper.study_file_id && paper.study_file_id !== file?.id;
              const busy = linkingId === paper.id;
              return (
                <Box
                  key={paper.id}
                  component="button"
                  type="button"
                  onClick={() => link(paper)}
                  disabled={linkingId !== null}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1.25,
                    width: '100%',
                    minHeight: 56,
                    px: 1.25,
                    py: 1,
                    textAlign: 'left',
                    cursor: linkingId !== null ? 'default' : 'pointer',
                    font: 'inherit',
                    color: 'inherit',
                    border: `1px solid ${theme.palette.divider}`,
                    borderRadius: 1.5,
                    bgcolor: 'transparent',
                    opacity: linkingId !== null && !busy ? 0.5 : 1,
                    '&:hover:not(:disabled)': {
                      bgcolor: alpha(theme.palette.primary.main, 0.06),
                      borderColor: alpha(theme.palette.primary.main, 0.4),
                    },
                  }}
                >
                  <LinkOutlinedIcon sx={{ fontSize: 20, color: 'primary.main', flexShrink: 0 }} />
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography sx={{ fontSize: '0.9375rem', fontWeight: 600 }} noWrap>
                      {paperLabel(paper)}
                    </Typography>
                    {linkedElsewhere && (
                      <Typography variant="caption" color="warning.main">
                        Already linked to another file, relinking will move it here.
                      </Typography>
                    )}
                  </Box>
                  {busy && <CircularProgress size={18} />}
                </Box>
              );
            })}
          </Box>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} sx={{ textTransform: 'none', minHeight: 44 }}>
          Cancel
        </Button>
      </DialogActions>
    </Dialog>
  );
}
