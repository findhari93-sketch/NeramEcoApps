'use client';

/**
 * Your grading profile: what your corrections say, and the rules you keep.
 *
 * Entered from a rule under a criterion while scoring. Back returns to
 * Sketchbooks (Drawing Reviews, its former header link, was retired in
 * September 2026).
 *
 * Counts and plain sentences, never percentages; see
 * lib/drawing-grading-profile.ts for why. Rules can be removed here, and added
 * by hand for the standards a teacher already knows they hold.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import NextLink from 'next/link';
import {
  Alert, Box, Button, Chip, IconButton, MenuItem, Paper, Skeleton, Snackbar, Stack, TextField, Tooltip, Typography,
} from '@neram/ui';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import RuleOutlinedIcon from '@mui/icons-material/RuleOutlined';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import { SHARED_CRITERIA, BRIEF_CRITERION } from '@/lib/drawing-rubric';
import { criterionTitle, type GradingProfile } from '@/lib/drawing-grading-profile';

interface RuleRow {
  id: string;
  criterion_key: string | null;
  text: string;
  created_at: string;
}

const CRITERION_OPTIONS = Array.from(
  new Map([...SHARED_CRITERIA, ...Object.values(BRIEF_CRITERION)].map((c) => [c.key, c.title])).entries(),
);

export default function GradingProfilePage() {
  const { getTeacherToken, loading: authLoading } = useNexusAuthContext();
  const tokenRef = useRef(getTeacherToken);
  tokenRef.current = getTeacherToken;

  const [profile, setProfile] = useState<GradingProfile | null>(null);
  const [rules, setRules] = useState<RuleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [draftKey, setDraftKey] = useState('');
  const [adding, setAdding] = useState(false);
  const [snack, setSnack] = useState<string | null>(null);

  const call = useCallback(async (path: string, init?: RequestInit) => {
    const token = await tokenRef.current();
    const res = await fetch(path, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || 'Something went wrong');
    return body;
  }, []);

  const load = useCallback(async () => {
    try {
      const body = await call('/api/drawing/grading-profile');
      setProfile(body.profile);
      setRules(body.rules ?? []);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load your grading profile');
    } finally {
      setLoading(false);
    }
  }, [call]);

  useEffect(() => {
    if (!authLoading) void load();
  }, [authLoading, load]);

  const addRule = async () => {
    setAdding(true);
    try {
      const body = await call('/api/drawing/grading-profile', {
        method: 'POST',
        body: JSON.stringify({ text: draft, criterion_key: draftKey || null }),
      });
      setRules((prev) => [body.rule, ...prev]);
      setDraft('');
      setDraftKey('');
      setSnack('Rule kept. It shows under that criterion while you score.');
    } catch (e) {
      setSnack(e instanceof Error ? e.message : 'Could not keep that rule');
    } finally {
      setAdding(false);
    }
  };

  const removeRule = async (rule: RuleRow) => {
    const before = rules;
    setRules((prev) => prev.filter((r) => r.id !== rule.id));
    try {
      await call(`/api/drawing/grading-rules/${rule.id}`, { method: 'DELETE' });
      setSnack('Rule removed.');
    } catch (e) {
      setRules(before);
      setSnack(e instanceof Error ? e.message : 'Could not remove that rule');
    }
  };

  return (
    <Box sx={{ px: { xs: 2, sm: 3 }, py: 2, maxWidth: 720, mx: 'auto' }}>
      <Button
        component={NextLink}
        href="/teacher/sketchbook"
        startIcon={<ArrowBackIcon />}
        sx={{ minHeight: 44, textTransform: 'none', ml: -1, mb: 1 }}
      >
        Sketchbooks
      </Button>

      <Typography variant="h5" component="h1" fontWeight={700}>
        Your grading profile
      </Typography>

      {loading ? (
        <Stack spacing={1.5} sx={{ mt: 2 }}>
          <Skeleton variant="text" width="70%" />
          <Skeleton variant="rounded" height={96} />
          <Skeleton variant="rounded" height={96} />
        </Stack>
      ) : error ? (
        <Alert severity="error" sx={{ mt: 2 }} action={<Button onClick={() => { setLoading(true); void load(); }}>Try again</Button>}>
          {error}
        </Alert>
      ) : (
        <>
          <Typography variant="body1" color="text.secondary" sx={{ mt: 0.5, mb: 3 }} data-testid="profile-headline">
            {profile?.headline}
          </Typography>

          <Typography variant="subtitle1" component="h2" fontWeight={700} sx={{ mb: 1 }}>
            Your rules
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
            Shown under the criterion while you score. A rule never changes a score by itself.
          </Typography>

          <Paper variant="outlined" sx={{ p: 1.5, mb: 1.5, borderRadius: 2 }}>
            <Stack spacing={1}>
              <TextField
                label="Add a rule"
                placeholder="A real error too small to move a band stays in the band"
                value={draft}
                onChange={(e) => setDraft(e.target.value.slice(0, 400))}
                multiline
                minRows={2}
                fullWidth
                inputProps={{ style: { fontSize: 16 } }}
              />
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                <TextField
                  select
                  label="Applies to"
                  value={draftKey}
                  onChange={(e) => setDraftKey(e.target.value)}
                  sx={{ minWidth: { sm: 240 } }}
                  fullWidth
                  SelectProps={{ displayEmpty: true }}
                  InputLabelProps={{ shrink: true }}
                >
                  <MenuItem value="">Every criterion</MenuItem>
                  {CRITERION_OPTIONS.map(([key, title]) => (
                    <MenuItem key={key} value={key}>{title}</MenuItem>
                  ))}
                </TextField>
                <Button
                  variant="contained"
                  onClick={addRule}
                  disabled={adding || draft.trim().length < 3}
                  sx={{ minHeight: 48, flexShrink: 0, textTransform: 'none', '&.Mui-disabled': { background: 'none', bgcolor: 'action.disabledBackground', color: 'text.disabled', boxShadow: 'none' } }}
                >
                  {adding ? 'Keeping' : 'Keep rule'}
                </Button>
              </Stack>
            </Stack>
          </Paper>

          {rules.length === 0 ? (
            <Box sx={{ textAlign: 'center', py: 3, px: 2, border: '1.5px dashed', borderColor: 'divider', borderRadius: 2, mb: 3 }}>
              <Typography variant="body2" color="text.secondary">
                No rules yet. Tick &quot;Keep this as a rule&quot; when you give a reason for a score, or add one above.
              </Typography>
            </Box>
          ) : (
            <Stack spacing={1} sx={{ mb: 3 }} data-testid="rule-list">
              {rules.map((rule) => (
                <Paper key={rule.id} variant="outlined" sx={{ p: 1.25, pl: 1.5, borderRadius: 2, display: 'flex', alignItems: 'flex-start', gap: 1 }}>
                  <RuleOutlinedIcon aria-hidden sx={{ fontSize: 18, mt: '3px', color: 'primary.main' }} />
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="body2" sx={{ lineHeight: 1.5, overflowWrap: 'anywhere' }}>{rule.text}</Typography>
                    <Chip
                      size="small"
                      label={rule.criterion_key ? criterionTitle(rule.criterion_key) : 'Every criterion'}
                      sx={{ mt: 0.5, height: 22, fontSize: 12 }}
                    />
                  </Box>
                  <Tooltip title="Remove rule">
                    <IconButton aria-label={`Remove rule: ${rule.text}`} onClick={() => removeRule(rule)} sx={{ width: 44, height: 44, flexShrink: 0 }}>
                      <DeleteOutlineIcon />
                    </IconButton>
                  </Tooltip>
                </Paper>
              ))}
            </Stack>
          )}

          {profile && profile.criteria.length > 0 && (
            <>
              <Typography variant="subtitle1" component="h2" fontWeight={700} sx={{ mb: 1 }}>
                What your reasons say
              </Typography>
              <Stack spacing={1}>
                {profile.criteria.map((c) => (
                  <Paper key={c.criterion_key} variant="outlined" sx={{ p: 1.5, borderRadius: 2 }}>
                    <Stack direction="row" alignItems="baseline" spacing={1} sx={{ mb: 0.5 }}>
                      <Typography variant="body1" fontWeight={700} sx={{ flex: 1, minWidth: 0 }}>{c.title}</Typography>
                      <Typography variant="body2" color="text.secondary" sx={{ flexShrink: 0 }}>
                        {c.corrections} {c.corrections === 1 ? 'reason' : 'reasons'}
                      </Typography>
                    </Stack>
                    <Typography variant="body2" color="text.secondary">{c.lean}</Typography>
                    {c.sentences.length > 0 && (
                      <Box component="ul" sx={{ m: 0, mt: 1, pl: 2.5 }}>
                        {c.sentences.map((sentence) => (
                          <Typography component="li" variant="body2" key={sentence} sx={{ lineHeight: 1.5, overflowWrap: 'anywhere' }}>
                            {sentence}
                          </Typography>
                        ))}
                      </Box>
                    )}
                  </Paper>
                ))}
              </Stack>
            </>
          )}
        </>
      )}

      <Snackbar open={!!snack} autoHideDuration={4000} onClose={() => setSnack(null)} message={snack ?? ''} />
    </Box>
  );
}
