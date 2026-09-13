'use client';

/**
 * Band wording for one brief type, in the teacher's own words.
 *
 * Entered from Drawing evaluation references (one link per brief type); Back
 * returns there.
 *
 * This is the one piece of AI drawing evaluation that cannot be generated: the
 * old review text is mostly pasted model output and reads as praise at every
 * band. So the screen turns it into a finishable task. A count of bands
 * written, and under each band the sentences teachers already typed while
 * scoring that criterion at that band, ready to use or rewrite. The switch at
 * the top stays refused until every band is written and five reference sheets
 * are set.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import NextLink from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  Alert, Box, Button, Chip, CircularProgress, LinearProgress, Paper, Skeleton, Stack, TextField, Typography,
} from '@neram/ui';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import type { BriefReadiness } from '@/lib/drawing-brief-readiness';

const BAND_NAMES: Record<string, string> = { '1': 'Needs work', '2': 'Below average', '3': 'Good', '4': 'Very good', '5': 'Excellent' };
const BANDS = ['1', '2', '3', '4', '5'] as const;

interface Criterion {
  key: string;
  title: string;
  observable_checks: string[];
  band_descriptions: Record<string, string>;
}

interface Detail {
  brief_type: { id: string; key: string; title: string; is_active: boolean };
  criteria: Criterion[];
  readiness: BriefReadiness;
  suggestions: Record<string, Record<string, string[]>>;
  can_edit: boolean;
}

const isPlaceholder = (text: string | undefined) => !text || !text.trim() || text.trim().startsWith('TODO');
/** Stored wording as the fields show it: a placeholder is an empty field. */
const normalise = (bands: Record<string, string>) =>
  Object.fromEntries(BANDS.map((b) => [b, isPlaceholder(bands[b]) ? '' : bands[b]])) as Record<string, string>;

export default function BandWordingPage() {
  const params = useParams<{ key: string }>();
  const briefKey = decodeURIComponent(params.key);
  const router = useRouter();
  const { isAdmin, loading: authLoading, getToken } = useNexusAuthContext();
  const tokenRef = useRef(getToken);
  tokenRef.current = getToken;

  const [detail, setDetail] = useState<Detail | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Record<string, string>>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [savedKey, setSavedKey] = useState<string | null>(null);
  const [switching, setSwitching] = useState(false);
  const [switchMessage, setSwitchMessage] = useState<{ severity: 'success' | 'error'; text: string; blockers?: string[] } | null>(null);

  const call = useCallback(async (path: string, init?: RequestInit) => {
    const token = await tokenRef.current();
    const res = await fetch(path, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    });
    const body = await res.json().catch(() => ({}));
    return { ok: res.ok, body };
  }, []);

  const load = useCallback(async () => {
    const { ok, body } = await call(`/api/drawing/brief-types/${encodeURIComponent(briefKey)}`);
    if (!ok) { setError(body.error || 'Could not load this brief type'); return; }
    setDetail(body);
    setDrafts(Object.fromEntries((body.criteria as Criterion[]).map((c) => [c.key, normalise(c.band_descriptions)])));
    setError(null);
  }, [call, briefKey]);

  useEffect(() => {
    if (!authLoading && !isAdmin) router.replace('/teacher');
  }, [authLoading, isAdmin, router]);

  useEffect(() => {
    if (!authLoading && isAdmin) void load();
  }, [authLoading, isAdmin, load]);

  const writtenLive = useMemo(() => {
    if (!detail) return 0;
    return detail.criteria.reduce((sum, c) => sum + BANDS.filter((b) => !isPlaceholder(drafts[c.key]?.[b])).length, 0);
  }, [detail, drafts]);

  const dirty = (c: Criterion) => {
    const saved = normalise(c.band_descriptions);
    return BANDS.some((b) => (drafts[c.key]?.[b] ?? '') !== saved[b]);
  };

  const setBand = (criterionKey: string, band: string, text: string) => {
    setSavedKey(null);
    setDrafts((prev) => ({ ...prev, [criterionKey]: { ...prev[criterionKey], [band]: text.slice(0, 600) } }));
  };

  const applySentence = (criterionKey: string, band: string, sentence: string) => {
    const current = drafts[criterionKey]?.[band] ?? '';
    setBand(criterionKey, band, isPlaceholder(current) ? sentence : `${current.trim()} ${sentence}`);
  };

  const save = async (c: Criterion) => {
    setSaving(c.key);
    const { ok, body } = await call(`/api/drawing/brief-types/${encodeURIComponent(briefKey)}`, {
      method: 'PUT',
      body: JSON.stringify({ criterion_key: c.key, band_descriptions: drafts[c.key] ?? {} }),
    });
    setSaving(null);
    if (!ok) { setSwitchMessage({ severity: 'error', text: body.error || 'Could not save that wording' }); return; }
    setSavedKey(c.key);
    if (body.deactivated) {
      setSwitchMessage({ severity: 'error', text: `${detail?.brief_type.title} was switched off, because a band is now empty. Write it and switch it back on.` });
    }
    await load();
  };

  const toggle = async (active: boolean) => {
    setSwitching(true);
    setSwitchMessage(null);
    const { ok, body } = await call(`/api/drawing/brief-types/${encodeURIComponent(briefKey)}/activate`, {
      method: 'POST',
      body: JSON.stringify({ active }),
    });
    setSwitching(false);
    if (!ok) {
      setSwitchMessage({ severity: 'error', text: body.error || 'Could not change it', blockers: body.blockers });
      return;
    }
    setSwitchMessage({
      severity: 'success',
      text: active
        ? 'Switched on. It can now be evaluated. Whether evaluations run at all is still the AI usage switch.'
        : 'Switched off. Nothing of this brief will be evaluated.',
    });
    await load();
  };

  return (
    <Box sx={{ px: { xs: 2, md: 3 }, py: 2, maxWidth: 900, mx: 'auto' }}>
      <Button component={NextLink} href="/teacher/admin/drawing-anchors" startIcon={<ArrowBackIcon />} sx={{ minHeight: 44, textTransform: 'none', ml: -1, mb: 1 }}>
        Drawing evaluation references
      </Button>

      {error && <Alert severity="error">{error}</Alert>}
      {!detail && !error && (
        <Stack spacing={2}>
          <Skeleton variant="text" width="50%" height={40} />
          <Skeleton variant="rounded" height={120} />
          <Skeleton variant="rounded" height={320} />
        </Stack>
      )}

      {detail && (
        <>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ xs: 'flex-start', sm: 'center' }}>
            <Typography variant="h5" component="h1" fontWeight={700} sx={{ flex: 1 }}>
              Band wording for {detail.brief_type.title}
            </Typography>
            <Chip
              label={detail.brief_type.is_active ? 'Switched on' : 'Off'}
              color={detail.brief_type.is_active ? 'success' : 'default'}
              variant={detail.brief_type.is_active ? 'filled' : 'outlined'}
            />
          </Stack>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, mb: 2, maxWidth: 680 }}>
            Write each band in your own words. Under each band are sentences you typed while scoring that criterion at that band, to use or rewrite. Nothing here is generated.
          </Typography>

          <Paper variant="outlined" sx={{ p: 2, mb: 3, borderRadius: 2 }}>
            <Stack direction="row" alignItems="baseline" spacing={1} sx={{ mb: 1 }}>
              <Typography variant="h6" component="p" fontWeight={700} data-testid="bands-progress">
                {writtenLive} of {detail.readiness.bandsTotal} bands written
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {detail.readiness.anchorsSet} of 5 reference sheets set
              </Typography>
            </Stack>
            <LinearProgress
              variant="determinate"
              value={detail.readiness.bandsTotal ? (writtenLive / detail.readiness.bandsTotal) * 100 : 0}
              aria-label="Band wording written"
              sx={{ height: 8, borderRadius: 4, mb: 1.5 }}
            />
            {detail.readiness.blockers.length > 0 && (
              <Box component="ul" sx={{ m: 0, mb: 1.5, pl: 2.5 }} data-testid="brief-blockers">
                {detail.readiness.blockers.map((b) => (
                  <Typography component="li" variant="body2" color="text.secondary" key={b}>{b}</Typography>
                ))}
              </Box>
            )}
            {detail.can_edit && (
              detail.brief_type.is_active ? (
                <Button variant="outlined" color="inherit" onClick={() => toggle(false)} disabled={switching} sx={{ minHeight: 44, textTransform: 'none' }}>
                  Switch off
                </Button>
              ) : (
                <Button variant="contained" onClick={() => toggle(true)} disabled={switching} sx={{ minHeight: 44, textTransform: 'none' }}>
                  {switching ? 'Checking' : 'Switch on for evaluation'}
                </Button>
              )
            )}
            {switchMessage && (
              <Alert severity={switchMessage.severity} sx={{ mt: 1.5 }} role="status">
                {switchMessage.text}
                {switchMessage.blockers && switchMessage.blockers.length > 0 && (
                  <Box component="ul" sx={{ m: 0, mt: 0.5, pl: 2.5 }}>
                    {switchMessage.blockers.map((b) => <li key={b}>{b}</li>)}
                  </Box>
                )}
              </Alert>
            )}
          </Paper>

          <Stack spacing={2}>
            {detail.criteria.map((c) => {
              const written = BANDS.filter((b) => !isPlaceholder(drafts[c.key]?.[b])).length;
              return (
                <Paper key={c.key} variant="outlined" sx={{ p: { xs: 1.5, md: 2 }, borderRadius: 2 }} data-testid={`criterion-${c.key}`}>
                  <Stack direction="row" alignItems="baseline" spacing={1} sx={{ mb: 0.5 }}>
                    <Typography variant="subtitle1" component="h2" fontWeight={700} sx={{ flex: 1 }}>{c.title}</Typography>
                    <Typography variant="body2" color="text.secondary">{written} of 5</Typography>
                  </Stack>
                  {c.observable_checks.length > 0 && (
                    <Box component="details" sx={{ mb: 1.5, '& summary': { cursor: 'pointer', minHeight: 32, display: 'flex', alignItems: 'center', fontSize: 14, color: 'primary.main', fontWeight: 600 } }}>
                      <summary>What it checks</summary>
                      <Box component="ul" sx={{ m: 0, mt: 0.5, pl: 2.5 }}>
                        {c.observable_checks.map((check) => (
                          <Typography component="li" variant="body2" color="text.secondary" key={check}>{check}</Typography>
                        ))}
                      </Box>
                    </Box>
                  )}

                  <Stack spacing={1.5}>
                    {BANDS.map((band) => {
                      const sentences = (detail.suggestions[c.key]?.[band] ?? []).slice(0, 4);
                      return (
                        <Box key={band}>
                          <TextField
                            label={`Band ${band}, ${BAND_NAMES[band]}`}
                            value={drafts[c.key]?.[band] ?? ''}
                            onChange={(e) => setBand(c.key, band, e.target.value)}
                            placeholder={`What a ${band} looks like for ${c.title.toLowerCase()}`}
                            multiline
                            minRows={2}
                            fullWidth
                            disabled={!detail.can_edit}
                            inputProps={{ style: { fontSize: 16 } }}
                          />
                          {detail.can_edit && sentences.length > 0 && (
                            <Box sx={{ mt: 0.75 }}>
                              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
                                You wrote, while giving a {band}:
                              </Typography>
                              <Stack spacing={0.5}>
                                {sentences.map((sentence) => (
                                  <Button
                                    key={sentence}
                                    size="small"
                                    variant="outlined"
                                    onClick={() => applySentence(c.key, band, sentence)}
                                    sx={{ justifyContent: 'flex-start', textAlign: 'left', textTransform: 'none', minHeight: 44, fontWeight: 400, lineHeight: 1.35 }}
                                  >
                                    Use: {sentence}
                                  </Button>
                                ))}
                              </Stack>
                            </Box>
                          )}
                        </Box>
                      );
                    })}
                  </Stack>

                  {detail.can_edit && (
                    <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mt: 1.5 }}>
                      <Button
                        variant="contained"
                        onClick={() => save(c)}
                        disabled={!dirty(c) || saving === c.key}
                        sx={{ minHeight: 44, textTransform: 'none' }}
                      >
                        {saving === c.key ? <CircularProgress size={18} color="inherit" /> : `Save ${c.title}`}
                      </Button>
                      {savedKey === c.key && !dirty(c) && (
                        <Typography variant="body2" color="success.main" role="status">Saved</Typography>
                      )}
                    </Stack>
                  )}
                </Paper>
              );
            })}
          </Stack>
        </>
      )}
    </Box>
  );
}
