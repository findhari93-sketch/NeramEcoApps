'use client';

/**
 * Google reviews: every centre's Google Business Profile in one place.
 *
 *  - the live Google rating and count per centre (what the website quotes),
 *  - every review, with an AI-drafted reply staff edit and post,
 *  - students' "I posted it" confirmed against real Google reviews,
 *  - success posts: a student's result as an Update on the centre's profile.
 *
 * Read and reply only. No tool can post a review for a student; they post their
 * own from the review link. Until Google approves API access this page shows the
 * setup steps, and replies and posts can still be copied and pasted by hand.
 * Desktop-first like the rest of Admin.
 */

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  Paper,
  Rating,
  Skeleton,
  Snackbar,
  Stack,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tabs,
  TextField,
  Typography,
  UserAvatar,
} from '@neram/ui';
import SyncIcon from '@mui/icons-material/Sync';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesomeOutlined';
import SendIcon from '@mui/icons-material/Send';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import VerifiedOutlinedIcon from '@mui/icons-material/VerifiedOutlined';
import CampaignOutlinedIcon from '@mui/icons-material/CampaignOutlined';
import LinkOffIcon from '@mui/icons-material/LinkOff';
import { StatusChip, a11yRootSx } from '@/components/user360/shared';
import { copyToClipboard } from '@/lib/whatsapp-templates/whatsapp';
import { formatDate } from '@/lib/user360-view';

interface Run {
  id: string;
  started_at: string;
  status: 'running' | 'ok' | 'partial' | 'failed' | 'not_connected';
  locations: number;
  reviews_upserted: number;
  matched: number;
  error: string | null;
  trigger: string;
}

interface CentreRow {
  id: string;
  name: string;
  city: string;
  google_place_id: string | null;
  gbp_location_name: string | null;
  rating: number | string | null;
  review_count: number | null;
  rating_checked_at: string | null;
  unreplied: number;
  lowUnreplied: number;
}

interface ReviewRow {
  id: string;
  center_id: string | null;
  reviewer_name: string | null;
  reviewer_photo_url: string | null;
  star_rating: number | null;
  comment: string | null;
  create_time: string | null;
  reply_comment: string | null;
  reply_update_time: string | null;
  reply_draft: string | null;
  review_request_id: string | null;
}

interface Overview {
  connected: boolean;
  missing: string[];
  runs: Run[];
  centres: CentreRow[];
  reviews: ReviewRow[];
}

const btnSx = { textTransform: 'none', fontWeight: 600, minHeight: 44 } as const;
const RUN_TONE: Record<Run['status'], 'success' | 'warning' | 'error' | 'neutral' | 'info'> = {
  ok: 'success',
  partial: 'warning',
  failed: 'error',
  not_connected: 'neutral',
  running: 'info',
};
const RUN_LABEL: Record<Run['status'], string> = {
  ok: 'Synced',
  partial: 'Partly synced',
  failed: 'Failed',
  not_connected: 'Not connected',
  running: 'Running',
};

type Filter = 'unreplied' | 'low' | 'all';

export default function GoogleReviewsPage() {
  const [tab, setTab] = useState<'reviews' | 'posts'>('reviews');
  const [filter, setFilter] = useState<Filter>('unreplied');
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [toast, setToast] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const res = await fetch(`/api/gbp/overview?filter=${filter}`, { cache: 'no-store' });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Could not load Google reviews.');
      setData(body);
    } catch (e: any) {
      setError(e.message || 'Could not load Google reviews.');
    }
  }, [filter]);

  useEffect(() => {
    void load();
  }, [load]);

  const sync = async () => {
    setSyncing(true);
    try {
      const res = await fetch('/api/gbp/sync', { method: 'POST' });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'Sync failed.');
      setToast(`Synced ${body.locations} centre${body.locations === 1 ? '' : 's'}, ${body.reviewsUpserted} reviews, ${body.matched} students confirmed.`);
    } catch (e: any) {
      setToast(e.message || 'Sync failed.');
    } finally {
      setSyncing(false);
      void load();
    }
  };

  const centreName = (id: string | null) => data?.centres.find((c) => c.id === id)?.city || '';
  const lastRun = data?.runs[0];

  return (
    <Box sx={{ ...a11yRootSx, minWidth: 0 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 2, flexWrap: 'wrap', mb: 2 }}>
        <Box sx={{ minWidth: 0, maxWidth: 780 }}>
          <Typography variant="h4" component="h1" fontWeight="bold">
            Google reviews
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Every centre&apos;s Google rating and reviews in one place. Reply to each review, and see which students posted the
            review they sent us. Students always post their own reviews; we read and reply.
          </Typography>
        </Box>
        <Button variant="contained" startIcon={syncing ? <CircularProgress size={18} color="inherit" /> : <SyncIcon />} onClick={sync} disabled={syncing || !data?.connected} sx={{ ...btnSx, boxShadow: 'none' }}>
          {syncing ? 'Syncing...' : 'Sync now'}
        </Button>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }} action={<Button onClick={load} sx={btnSx}>Try again</Button>}>{error}</Alert>}

      {!data ? (
        <Stack spacing={2}>
          <Skeleton variant="rounded" height={96} />
          <Skeleton variant="rounded" height={240} />
        </Stack>
      ) : (
        <>
          {!data.connected ? (
            <Alert severity="info" sx={{ mb: 2 }} icon={<LinkOffIcon />}>
              <Typography sx={{ fontWeight: 700 }}>Not connected to Google yet</Typography>
              <Box component="ol" sx={{ pl: 2.5, my: 1, '& li': { mb: 0.5 } }}>
                <li>Request Business Profile API access from Google (approval takes a few days).</li>
                <li>Enable &quot;My Business Business Information API&quot; and &quot;Google My Business API&quot; in the Google Cloud project, and create an OAuth client.</li>
                <li>Get a refresh token for an account that manages the profiles (scope business.manage).</li>
                <li>
                  Add these to the Admin project on Vercel: <strong>{data.missing.join(', ')}</strong>.
                </li>
              </Box>
              Until then you can still draft replies here and paste them into Google yourself, and copy success posts.
            </Alert>
          ) : (
            lastRun && (
              <Paper variant="outlined" sx={{ p: 2, mb: 2, display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
                <StatusChip icon={<SyncIcon />} label={RUN_LABEL[lastRun.status]} tone={RUN_TONE[lastRun.status]} />
                <Typography variant="body2">
                  Last sync {formatDate(lastRun.started_at)}: {lastRun.locations} centres, {lastRun.reviews_upserted} reviews, {lastRun.matched} students confirmed.
                </Typography>
                {lastRun.error && (
                  <Typography variant="body2" color="error.dark" sx={{ width: '100%' }}>
                    {lastRun.error}
                  </Typography>
                )}
              </Paper>
            )
          )}

          <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid', borderColor: 'grey.200', borderRadius: 1, mb: 3 }}>
            <Table size="small" aria-label="Centres on Google">
              <TableHead>
                <TableRow sx={{ '& th': { fontWeight: 700, bgcolor: 'grey.50' } }}>
                  <TableCell>Centre</TableCell>
                  <TableCell>Google profile</TableCell>
                  <TableCell>Rating</TableCell>
                  <TableCell>Needs a reply</TableCell>
                  <TableCell>Checked</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {data.centres.map((c) => {
                  const rating = Number(c.rating);
                  return (
                    <TableRow key={c.id} hover>
                      <TableCell>
                        <Typography sx={{ fontWeight: 600 }}>{c.city}</Typography>
                        <Typography variant="body2" color="text.secondary">{c.name}</Typography>
                      </TableCell>
                      <TableCell>
                        {c.gbp_location_name ? (
                          <StatusChip icon={<VerifiedOutlinedIcon />} label="Linked" tone="success" />
                        ) : c.google_place_id ? (
                          <StatusChip icon={<SyncIcon />} label="Links on next sync" tone="info" />
                        ) : (
                          <Button component={Link} href={`/centres/${c.id}`} size="small" sx={btnSx}>
                            Add Place ID
                          </Button>
                        )}
                      </TableCell>
                      <TableCell>
                        {rating > 0 && (c.review_count ?? 0) > 0 ? (
                          <Stack direction="row" spacing={0.75} alignItems="center">
                            <Typography sx={{ fontWeight: 700 }}>{rating.toFixed(1)}</Typography>
                            <Rating value={rating} precision={0.1} readOnly size="small" aria-hidden />
                            <Typography variant="body2" color="text.secondary">({c.review_count})</Typography>
                          </Stack>
                        ) : (
                          <Typography variant="body2" color="text.secondary">No reviews yet</Typography>
                        )}
                      </TableCell>
                      <TableCell>
                        {c.unreplied ? (
                          <Typography variant="body2" sx={{ fontWeight: 600, color: c.lowUnreplied ? 'warning.dark' : 'text.primary' }}>
                            {c.unreplied}
                            {c.lowUnreplied ? ` (${c.lowUnreplied} low)` : ''}
                          </Typography>
                        ) : (
                          <Typography variant="body2" color="text.secondary">None</Typography>
                        )}
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" color="text.secondary">{c.rating_checked_at ? formatDate(c.rating_checked_at) : ''}</Typography>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>

          <Tabs
            value={tab}
            onChange={(_, v) => setTab(v)}
            aria-label="Google reviews sections"
            sx={{ borderBottom: '1px solid', borderColor: 'grey.200', mb: 2, '& .MuiTab-root': { minHeight: 48, textTransform: 'none', fontWeight: 600 } }}
          >
            <Tab value="reviews" label="Reviews" />
            <Tab value="posts" label="Success posts" />
          </Tabs>

          {tab === 'reviews' ? (
            <>
              <Box sx={{ display: 'flex', gap: 1, mb: 2 }} role="group" aria-label="Which reviews">
                {(['unreplied', 'low', 'all'] as Filter[]).map((f) => (
                  <Chip
                    key={f}
                    label={f === 'unreplied' ? 'Needs a reply' : f === 'low' ? '3 stars or fewer' : 'All'}
                    clickable
                    color={filter === f ? 'primary' : 'default'}
                    variant={filter === f ? 'filled' : 'outlined'}
                    aria-pressed={filter === f}
                    onClick={() => setFilter(f)}
                    sx={{ minHeight: 36, fontWeight: 600 }}
                  />
                ))}
              </Box>
              {data.reviews.length === 0 ? (
                <Paper variant="outlined" sx={{ p: 4, textAlign: 'center' }}>
                  <Typography sx={{ fontWeight: 600 }}>
                    {data.connected ? 'Nothing here. Every review in this view has a reply.' : 'Reviews appear here after the first sync.'}
                  </Typography>
                </Paper>
              ) : (
                <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', xl: '1fr 1fr' } }}>
                  {data.reviews.map((r) => (
                    <ReviewCard key={r.id} review={r} centre={centreName(r.center_id)} connected={data.connected} onDone={(m) => { setToast(m); void load(); }} />
                  ))}
                </Box>
              )}
            </>
          ) : (
            <SuccessPosts onToast={setToast} />
          )}
        </>
      )}
      <Snackbar open={Boolean(toast)} autoHideDuration={4000} onClose={() => setToast('')} message={toast} />
    </Box>
  );
}

function ReviewCard({ review, centre, connected, onDone }: { review: ReviewRow; centre: string; connected: boolean; onDone: (message: string) => void }) {
  const [text, setText] = useState(review.reply_draft || '');
  const [busy, setBusy] = useState<'draft' | 'post' | 'save' | null>(null);
  const [error, setError] = useState('');
  const low = review.star_rating != null && review.star_rating <= 3;

  const draft = async () => {
    setBusy('draft');
    setError('');
    try {
      const res = await fetch(`/api/gbp/reviews/${review.id}/draft`, { method: 'POST' });
      const body = await res.json().catch(() => ({}));
      if (res.status === 409 && body.manualPrompt) {
        setError('AI is in manual mode. The prompt was copied: paste it into a chat app.');
        await copyToClipboard(body.manualPrompt);
        return;
      }
      if (!res.ok) throw new Error(body.error || 'Could not draft.');
      setText(body.draft);
    } catch (e: any) {
      setError(e.message || 'Could not draft.');
    } finally {
      setBusy(null);
    }
  };

  const send = async (saveOnly: boolean) => {
    setBusy(saveOnly ? 'save' : 'post');
    setError('');
    try {
      const res = await fetch(`/api/gbp/reviews/${review.id}/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ comment: text, save_only: saveOnly }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok && !body.saved) throw new Error(body.error || 'Could not save.');
      onDone(saveOnly || body.saved ? 'Reply saved as a draft.' : 'Reply posted on Google.');
    } catch (e: any) {
      setError(e.message || 'Could not save.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <Paper component="article" variant="outlined" sx={{ p: 2, borderColor: low && !review.reply_comment ? 'rgba(237,108,2,0.45)' : 'grey.200' }} aria-label={`Google review by ${review.reviewer_name || 'a Google user'}`}>
      <Stack direction="row" spacing={1.5} alignItems="center">
        <UserAvatar name={review.reviewer_name || 'Google user'} src={review.reviewer_photo_url} size={36} clickable={false} />
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography sx={{ fontWeight: 700 }}>{review.reviewer_name || 'A Google user'}</Typography>
          <Typography variant="body2" color="text.secondary">
            {[centre, review.create_time ? formatDate(review.create_time) : null].filter(Boolean).join(' · ')}
          </Typography>
        </Box>
        {review.star_rating != null && <Rating value={review.star_rating} readOnly size="small" aria-label={`${review.star_rating} stars`} />}
      </Stack>
      {review.review_request_id && (
        <Box sx={{ mt: 1 }}>
          <StatusChip icon={<VerifiedOutlinedIcon />} label="Matched to a student's review link" tone="success" />
        </Box>
      )}
      <Typography sx={{ mt: 1.5, whiteSpace: 'pre-line' }}>{review.comment || <em>Stars only, no text.</em>}</Typography>

      {review.reply_comment ? (
        <Box sx={{ mt: 1.5, p: 1.25, bgcolor: 'grey.50', borderRadius: 1 }}>
          <Typography variant="overline" color="text.secondary">Our reply{review.reply_update_time ? `, ${formatDate(review.reply_update_time)}` : ''}</Typography>
          <Typography variant="body2" sx={{ whiteSpace: 'pre-line' }}>{review.reply_comment}</Typography>
        </Box>
      ) : (
        <>
          <Divider sx={{ my: 1.5 }} />
          {low && (
            <Alert severity="warning" sx={{ mb: 1.5 }}>
              Low rating. Call this student or parent first if you can, then reply with an apology. Never ask them to change it.
            </Alert>
          )}
          <TextField label="Reply" value={text} onChange={(e) => setText(e.target.value)} multiline minRows={3} fullWidth inputProps={{ maxLength: 4000 }} />
          {error && <Alert severity="error" sx={{ mt: 1 }}>{error}</Alert>}
          <Stack direction="row" spacing={1} sx={{ mt: 1, flexWrap: 'wrap', gap: 1 }}>
            <Button startIcon={busy === 'draft' ? <CircularProgress size={16} /> : <AutoAwesomeIcon />} onClick={draft} disabled={!!busy} sx={btnSx}>
              {text ? 'Redraft with AI' : 'Draft with AI'}
            </Button>
            {connected ? (
              <Button variant="contained" startIcon={<SendIcon />} onClick={() => send(false)} disabled={!!busy || text.trim().length < 5} sx={{ ...btnSx, boxShadow: 'none' }}>
                {busy === 'post' ? 'Posting...' : 'Post reply on Google'}
              </Button>
            ) : (
              <Button
                variant="contained"
                startIcon={<ContentCopyIcon />}
                onClick={async () => {
                  await copyToClipboard(text);
                  await send(true);
                }}
                disabled={!!busy || text.trim().length < 5}
                sx={{ ...btnSx, boxShadow: 'none' }}
              >
                Copy and save
              </Button>
            )}
            <Button onClick={() => send(true)} disabled={!!busy || text.trim().length < 5} sx={btnSx}>
              Save draft
            </Button>
          </Stack>
        </>
      )}
    </Paper>
  );
}

interface Candidate {
  testimonial_id: string;
  student_name: string;
  centre_name: string | null;
  can_publish: boolean;
  summary: string;
}

interface PostRow {
  id: string;
  summary: string;
  status: 'draft' | 'posted' | 'failed';
  error: string | null;
  created_at: string;
  posted_at: string | null;
}

function SuccessPosts({ onToast }: { onToast: (m: string) => void }) {
  const [data, setData] = useState<{ candidates: Candidate[]; posts: PostRow[]; connected: boolean } | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/gbp/posts', { cache: 'no-store' });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Could not load.');
      setData(body);
    } catch (e: any) {
      setError(e.message || 'Could not load.');
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const save = async (c: Candidate, publish: boolean) => {
    setBusy(c.testimonial_id);
    try {
      const summary = drafts[c.testimonial_id] ?? c.summary;
      if (!publish) await copyToClipboard(summary);
      const res = await fetch('/api/gbp/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ testimonialId: c.testimonial_id, summary, publish }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok && !body.post) throw new Error(body.error || 'Could not save.');
      onToast(publish && res.ok ? 'Posted on Google.' : body.error ? body.error : 'Copied. Paste it as a Google profile Update.');
      void load();
    } catch (e: any) {
      onToast(e.message || 'Could not save.');
    } finally {
      setBusy(null);
    }
  };

  if (error) return <Alert severity="error">{error}</Alert>;
  if (!data) return <Skeleton variant="rounded" height={200} />;

  return (
    <Box>
      <Typography color="text.secondary" sx={{ mb: 2, maxWidth: 760 }}>
        Celebrate a student&apos;s result on their centre&apos;s Google profile. These are posts from Neram, not reviews, so we can
        publish them ourselves. Each comes from a published, verified review, using only facts staff checked.
      </Typography>
      {data.candidates.length === 0 ? (
        <Paper variant="outlined" sx={{ p: 4, textAlign: 'center' }}>
          <CampaignOutlinedIcon sx={{ fontSize: 40, color: 'text.disabled' }} aria-hidden />
          <Typography sx={{ fontWeight: 600, mt: 1 }}>No new results to post. Publish verified reviews in Testimonials first.</Typography>
        </Paper>
      ) : (
        <Stack spacing={2}>
          {data.candidates.map((c) => (
            <Paper key={c.testimonial_id} variant="outlined" sx={{ p: 2 }}>
              <Typography sx={{ fontWeight: 700 }}>{c.student_name}</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                {c.centre_name ? `For ${c.centre_name}` : 'No centre'}
                {!c.can_publish ? ' (not linked to a Google profile yet, copy and post by hand)' : ''}
              </Typography>
              <TextField
                label="Post text"
                value={drafts[c.testimonial_id] ?? c.summary}
                onChange={(e) => setDrafts((d) => ({ ...d, [c.testimonial_id]: e.target.value }))}
                multiline
                minRows={3}
                fullWidth
                inputProps={{ maxLength: 1500 }}
              />
              <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
                <Button startIcon={<ContentCopyIcon />} onClick={() => save(c, false)} disabled={busy === c.testimonial_id} sx={btnSx}>
                  Copy and mark drafted
                </Button>
                <Button
                  variant="contained"
                  startIcon={<SendIcon />}
                  onClick={() => save(c, true)}
                  disabled={busy === c.testimonial_id || !data.connected || !c.can_publish}
                  sx={{ ...btnSx, boxShadow: 'none' }}
                >
                  Post to Google
                </Button>
              </Stack>
            </Paper>
          ))}
        </Stack>
      )}
      {data.posts.length > 0 && (
        <Box sx={{ mt: 3 }}>
          <Typography component="h2" sx={{ fontWeight: 700, mb: 1 }}>Earlier posts</Typography>
          <Stack spacing={1}>
            {data.posts.map((p) => (
              <Paper key={p.id} variant="outlined" sx={{ p: 1.5, display: 'flex', gap: 1.5, alignItems: 'flex-start' }}>
                <StatusChip icon={<CampaignOutlinedIcon />} label={p.status === 'posted' ? 'Posted' : p.status === 'failed' ? 'Failed' : 'Drafted'} tone={p.status === 'posted' ? 'success' : p.status === 'failed' ? 'error' : 'neutral'} />
                <Box sx={{ minWidth: 0 }}>
                  <Typography variant="body2">{p.summary}</Typography>
                  <Typography variant="caption" color="text.secondary">
                    {formatDate(p.posted_at || p.created_at)}
                    {p.error ? `, ${p.error}` : ''}
                  </Typography>
                </Box>
              </Paper>
            ))}
          </Stack>
        </Box>
      )}
    </Box>
  );
}
