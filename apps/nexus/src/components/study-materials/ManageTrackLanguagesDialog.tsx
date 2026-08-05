'use client';

/**
 * Which languages a chapter can be recorded in, edited by an admin.
 *
 * This list used to be a three-item const repeated in five files plus a CHECK
 * constraint, so "we also teach this in Hindi now" was a migration, a code
 * change and a deploy. It is a content decision, and content decisions belong to
 * the people making them.
 *
 * Removing a language does NOT remove recordings already made in it. Every
 * track stores its own label on the row, so students carry on seeing exactly
 * what they saw before; the list only decides what can be added next. The usage
 * count is shown so that is a choice made with the facts rather than a guess.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Box,
  Typography,
  Button,
  IconButton,
  TextField,
  Alert,
  CircularProgress,
  Chip,
  useMediaQuery,
} from '@neram/ui';
import CloseIcon from '@mui/icons-material/Close';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import type { TrackLanguageOption } from '@/lib/track-languages';

interface Props {
  open: boolean;
  getToken: () => Promise<string | null>;
  onClose: () => void;
  onSaved: (languages: TrackLanguageOption[]) => void;
}

export default function ManageTrackLanguagesDialog({ open, getToken, onClose, onSaved }: Props) {
  const fullScreen = useMediaQuery('(max-width:599px)');
  const [rows, setRows] = useState<TrackLanguageOption[]>([]);
  const [usage, setUsage] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newCode, setNewCode] = useState('');
  const [newLabel, setNewLabel] = useState('');

  const authed = useCallback(
    async (url: string, init?: RequestInit) => {
      const token = await getToken();
      const res = await fetch(url, {
        ...init,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          ...(init?.headers || {}),
        },
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'Request failed');
      return body;
    },
    [getToken],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await authed('/api/study-materials/track-languages');
      setRows(data.languages || []);
      setUsage(data.usage || {});
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load the languages');
    } finally {
      setLoading(false);
    }
  }, [authed]);

  useEffect(() => {
    if (open) {
      void load();
      setNewCode('');
      setNewLabel('');
    }
  }, [open, load]);

  const addRow = () => {
    const code = newCode.trim().toLowerCase();
    const label = newLabel.trim();
    if (!code || !label) return;
    if (rows.some((r) => r.code === code)) {
      setError(`${code} is already on the list.`);
      return;
    }
    setRows((prev) => [...prev, { code, label }]);
    setNewCode('');
    setNewLabel('');
    setError(null);
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const data = await authed('/api/study-materials/track-languages', {
        method: 'PUT',
        body: JSON.stringify({ languages: rows }),
      });
      onSaved(data.languages || rows);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the languages');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="xs"
      fullWidth
      fullScreen={fullScreen}
      PaperProps={{ sx: { borderRadius: fullScreen ? 0 : 2 } }}
    >
      <DialogTitle sx={{ pr: 6 }}>
        <Typography component="span" sx={{ fontWeight: 700 }}>
          Languages
        </Typography>
        <Typography variant="caption" color="text.secondary" display="block">
          Offered on every Foundation chapter
        </Typography>
        <IconButton
          onClick={onClose}
          aria-label="Close"
          sx={{ position: 'absolute', top: 8, right: 8, width: 48, height: 48 }}
        >
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent dividers>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
            <CircularProgress size={28} />
          </Box>
        ) : (
          <>
            {rows.map((r, i) => (
              <Box
                key={r.code}
                sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1, flexWrap: 'wrap' }}
              >
                <Typography variant="body2" sx={{ fontWeight: 700, minWidth: 0, flex: 1 }}>
                  {r.label}
                </Typography>
                <Chip size="small" variant="outlined" label={r.code} />
                {!!usage[r.code] && (
                  <Chip
                    size="small"
                    variant="outlined"
                    color="primary"
                    label={`${usage[r.code]} in use`}
                  />
                )}
                <IconButton
                  aria-label={`Remove ${r.label}`}
                  onClick={() => setRows((prev) => prev.filter((_, j) => j !== i))}
                  disabled={rows.length === 1}
                  sx={{ width: 48, height: 48 }}
                >
                  <DeleteOutlineIcon fontSize="small" />
                </IconButton>
              </Box>
            ))}

            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', my: 1.5 }}>
              Removing a language does not remove recordings already made in it. Students keep
              seeing those exactly as before. It only stops the language being offered for new ones.
            </Typography>

            <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start', mt: 2 }}>
              <TextField
                size="small"
                label="Name"
                placeholder="हिन्दी"
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                sx={{ flex: 1 }}
                helperText="What students see"
              />
              <TextField
                size="small"
                label="Code"
                placeholder="hi"
                value={newCode}
                onChange={(e) => setNewCode(e.target.value)}
                sx={{ width: 110 }}
                helperText="2 or 3 letters"
              />
            </Box>
            <Button
              startIcon={<AddRoundedIcon />}
              onClick={addRow}
              disabled={!newCode.trim() || !newLabel.trim()}
              sx={{ textTransform: 'none', minHeight: 48, mt: 0.5 }}
            >
              Add to the list
            </Button>
          </>
        )}
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose} sx={{ textTransform: 'none', minHeight: 48 }}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={save}
          disabled={saving || loading || !rows.length}
          sx={{ textTransform: 'none', minHeight: 48 }}
        >
          {saving ? 'Saving...' : 'Save'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
