'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Box,
  Typography,
  Button,
  Chip,
  Skeleton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Menu,
  IconButton,
  Stack,
  Divider,
  Switch,
  FormControlLabel,
  Snackbar,
  Alert,
  Tooltip,
  CircularProgress,
} from '@neram/ui';
import AddOutlinedIcon from '@mui/icons-material/AddOutlined';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import MoreVertOutlinedIcon from '@mui/icons-material/MoreVert';
import LocalOfferOutlinedIcon from '@mui/icons-material/LocalOfferOutlined';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import type { NexusQBTagWithCount, NexusQBTagGroup } from '@neram/database';

const GROUPS: Array<{ key: NexusQBTagGroup; label: string; hint: string }> = [
  { key: 'exam', label: 'Exam', hint: 'Which exam the question is relevant to' },
  { key: 'subject', label: 'Subject', hint: 'Topic area, e.g. History of Architecture' },
  { key: 'theme', label: 'Theme', hint: 'Cross-cutting themes, e.g. Islamic Architecture' },
];

type Draft = {
  id?: string;
  group_type: NexusQBTagGroup;
  label: string;
  sort_order: number;
  is_active: boolean;
  is_system: boolean;
};

export default function QuestionTagsPage() {
  const { getToken, isTeacher } = useNexusAuthContext();

  const [tags, setTags] = useState<NexusQBTagWithCount[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // Edit/create dialog
  const [draft, setDraft] = useState<Draft | null>(null);
  // Per-chip actions menu
  const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null);
  const [menuTag, setMenuTag] = useState<NexusQBTagWithCount | null>(null);

  const loadTags = useCallback(async () => {
    setLoading(true);
    try {
      const token = await getToken();
      if (!token) return;
      const res = await fetch('/api/question-bank/tags?withCounts=1&includeInactive=1', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed to load tags');
      const json = await res.json();
      setTags(json.data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load tags');
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  useEffect(() => {
    loadTags();
  }, [loadTags]);

  const byGroup = useMemo(() => {
    const map: Record<string, NexusQBTagWithCount[]> = { exam: [], subject: [], theme: [] };
    for (const t of tags) (map[t.group_type] ||= []).push(t);
    return map;
  }, [tags]);

  function openCreate(group: NexusQBTagGroup) {
    setDraft({ group_type: group, label: '', sort_order: 0, is_active: true, is_system: false });
  }
  function openEdit(tag: NexusQBTagWithCount) {
    setMenuAnchor(null);
    setDraft({
      id: tag.id,
      group_type: tag.group_type,
      label: tag.label,
      sort_order: tag.sort_order,
      is_active: tag.is_active,
      is_system: tag.is_system,
    });
  }

  async function saveDraft() {
    if (!draft || !draft.label.trim()) return;
    setSaving(true);
    try {
      const token = await getToken();
      if (!token) return;
      const isEdit = Boolean(draft.id);
      const url = isEdit ? `/api/question-bank/tags/${draft.id}` : '/api/question-bank/tags';
      const method = isEdit ? 'PATCH' : 'POST';
      const body = isEdit
        ? { label: draft.label, sort_order: draft.sort_order, is_active: draft.is_active }
        : { group_type: draft.group_type, label: draft.label, sort_order: draft.sort_order };
      const res = await fetch(url, {
        method,
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Save failed');
      setToast(isEdit ? 'Tag updated' : 'Tag created');
      setDraft(null);
      await loadTags();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(tag: NexusQBTagWithCount) {
    setMenuAnchor(null);
    try {
      const token = await getToken();
      if (!token) return;
      const res = await fetch(`/api/question-bank/tags/${tag.id}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !tag.is_active }),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Update failed');
      setToast(tag.is_active ? 'Tag hidden' : 'Tag restored');
      await loadTags();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed');
    }
  }

  if (!isTeacher) {
    return (
      <Box sx={{ px: { xs: 2, md: 3 }, py: 6, textAlign: 'center' }}>
        <Typography color="text.secondary">Only teachers can manage tags.</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ px: { xs: 2, md: 3 }, py: 2, maxWidth: 900, mx: 'auto' }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
        <LocalOfferOutlinedIcon sx={{ color: 'primary.main' }} />
        <Typography variant="h5" component="h1" sx={{ fontWeight: 700, flex: 1 }}>
          Question Tags
        </Typography>
        <Button
          variant="contained"
          size="small"
          startIcon={<AddOutlinedIcon />}
          onClick={() => openCreate('theme')}
          sx={{ textTransform: 'none', minHeight: 40 }}
        >
          New tag
        </Button>
      </Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2.5 }}>
        Reusable labels applied to bank questions. One question can carry many tags; students and teachers filter by any of them.
      </Typography>

      {loading ? (
        <Stack spacing={3}>
          {GROUPS.map((g) => (
            <Box key={g.key}>
              <Skeleton variant="text" width={120} sx={{ mb: 1 }} />
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                {[80, 110, 96, 130, 72].map((w, i) => (
                  <Skeleton key={i} variant="rounded" width={w} height={32} sx={{ borderRadius: 4 }} />
                ))}
              </Box>
            </Box>
          ))}
        </Stack>
      ) : (
        <Stack spacing={3.5}>
          {GROUPS.map((group) => {
            const groupTags = byGroup[group.key] || [];
            return (
              <Box key={group.key}>
                <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, mb: 1 }}>
                  <Typography variant="overline" sx={{ fontWeight: 700, letterSpacing: 1 }}>
                    {group.label}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ flex: 1 }}>
                    {group.hint}
                  </Typography>
                  <Button
                    size="small"
                    startIcon={<AddOutlinedIcon fontSize="small" />}
                    onClick={() => openCreate(group.key)}
                    sx={{ textTransform: 'none', minHeight: 32 }}
                  >
                    Add
                  </Button>
                </Box>

                {groupTags.length === 0 ? (
                  <Typography variant="body2" color="text.disabled" sx={{ py: 1 }}>
                    No {group.label.toLowerCase()} tags yet.
                  </Typography>
                ) : (
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                    {groupTags.map((tag) => (
                      <Chip
                        key={tag.id}
                        label={
                          <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
                            {tag.is_system && (
                              <Tooltip title="Core tag (cannot be removed)">
                                <LockOutlinedIcon sx={{ fontSize: 13, opacity: 0.6 }} />
                              </Tooltip>
                            )}
                            <span>{tag.label}</span>
                            <Box
                              component="span"
                              sx={{
                                ml: 0.25,
                                px: 0.75,
                                borderRadius: 5,
                                bgcolor: 'action.selected',
                                fontSize: 11,
                                fontWeight: 600,
                                lineHeight: '18px',
                              }}
                            >
                              {tag.question_count}
                            </Box>
                          </Box>
                        }
                        onClick={(e) => {
                          setMenuTag(tag);
                          setMenuAnchor(e.currentTarget);
                        }}
                        deleteIcon={<MoreVertOutlinedIcon />}
                        onDelete={(e: any) => {
                          setMenuTag(tag);
                          setMenuAnchor(e.currentTarget);
                        }}
                        variant={tag.is_active ? 'filled' : 'outlined'}
                        sx={{
                          height: 32,
                          cursor: 'pointer',
                          opacity: tag.is_active ? 1 : 0.5,
                          transition: 'background-color 150ms, box-shadow 150ms',
                          '&:hover': { boxShadow: 1 },
                        }}
                      />
                    ))}
                  </Box>
                )}
              </Box>
            );
          })}
        </Stack>
      )}

      {/* Per-tag actions menu */}
      <Menu anchorEl={menuAnchor} open={Boolean(menuAnchor)} onClose={() => setMenuAnchor(null)}>
        <MenuItem onClick={() => menuTag && openEdit(menuTag)}>Rename / reorder</MenuItem>
        {menuTag && !menuTag.is_system && (
          <MenuItem onClick={() => menuTag && toggleActive(menuTag)}>
            {menuTag.is_active ? 'Hide from pickers' : 'Restore'}
          </MenuItem>
        )}
      </Menu>

      {/* Create / Edit dialog */}
      <Dialog open={Boolean(draft)} onClose={() => !saving && setDraft(null)} fullWidth maxWidth="xs">
        <DialogTitle sx={{ fontWeight: 700 }}>{draft?.id ? 'Edit tag' : 'New tag'}</DialogTitle>
        <DialogContent>
          <Stack spacing={2.5} sx={{ mt: 0.5 }}>
            {!draft?.id && (
              <FormControl fullWidth size="small">
                <InputLabel id="tag-group">Group</InputLabel>
                <Select
                  labelId="tag-group"
                  label="Group"
                  value={draft?.group_type || 'theme'}
                  onChange={(e) => setDraft((d) => (d ? { ...d, group_type: e.target.value as NexusQBTagGroup } : d))}
                >
                  {GROUPS.map((g) => (
                    <MenuItem key={g.key} value={g.key}>
                      {g.label}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            )}
            <TextField
              autoFocus
              fullWidth
              size="small"
              label="Label"
              placeholder="e.g. Islamic Architecture"
              value={draft?.label || ''}
              onChange={(e) => setDraft((d) => (d ? { ...d, label: e.target.value } : d))}
              helperText="A tag with the same name is not allowed twice."
            />
            <TextField
              fullWidth
              size="small"
              type="number"
              label="Sort order"
              value={draft?.sort_order ?? 0}
              onChange={(e) => setDraft((d) => (d ? { ...d, sort_order: Number(e.target.value) || 0 } : d))}
              helperText="Lower numbers appear first."
            />
            {draft?.id && !draft.is_system && (
              <FormControlLabel
                control={
                  <Switch
                    checked={draft.is_active}
                    onChange={(e) => setDraft((d) => (d ? { ...d, is_active: e.target.checked } : d))}
                  />
                }
                label={draft.is_active ? 'Visible in pickers' : 'Hidden'}
              />
            )}
            {draft?.is_system && (
              <Typography variant="caption" color="text.secondary">
                This is a core tag. You can rename or reorder it, but it cannot be hidden.
              </Typography>
            )}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setDraft(null)} disabled={saving} sx={{ textTransform: 'none' }}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={saveDraft}
            disabled={saving || !draft?.label.trim()}
            startIcon={saving ? <CircularProgress size={16} color="inherit" /> : undefined}
            sx={{ textTransform: 'none', minHeight: 40 }}
          >
            {draft?.id ? 'Save' : 'Create tag'}
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={Boolean(toast)}
        autoHideDuration={2500}
        onClose={() => setToast(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity="success" variant="filled" onClose={() => setToast(null)}>
          {toast}
        </Alert>
      </Snackbar>
      <Snackbar open={Boolean(error)} autoHideDuration={4000} onClose={() => setError(null)}>
        <Alert severity="error" variant="filled" onClose={() => setError(null)}>
          {error}
        </Alert>
      </Snackbar>
    </Box>
  );
}
