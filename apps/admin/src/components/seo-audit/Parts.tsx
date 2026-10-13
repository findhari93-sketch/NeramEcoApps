'use client';

/**
 * Pieces of the SEO Health page: rule names and what to do about each, the
 * severity chip, plain stat cards, the URL detail drawer and the dialogs.
 * Colours come from the @neram/ui theme; a status is icon plus text.
 */
import { useEffect, useState, type ElementType } from 'react';
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Drawer,
  IconButton,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@neram/ui';
import CloseIcon from '@mui/icons-material/Close';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import ErrorIcon from '@mui/icons-material/Error';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import LightbulbOutlinedIcon from '@mui/icons-material/LightbulbOutlined';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import { OpsSkeleton, StatusChip, TARGET_44, type Tone } from '@/components/ops/OpsUi';
import { api, num, when } from '@/components/marketing-ai/format';
import { RULES } from '@/lib/seo-audit/rule-guide';

export const SEVERITY: Record<string, { label: string; tone: Tone; icon: ElementType }> = {
  critical: { label: 'Critical', tone: 'error', icon: ErrorIcon },
  high: { label: 'High', tone: 'warning', icon: WarningAmberIcon },
  medium: { label: 'Medium', tone: 'info', icon: InfoOutlinedIcon },
  info: { label: 'Info', tone: 'neutral', icon: LightbulbOutlinedIcon },
};

export const CATEGORY_LABEL: Record<string, string> = {
  indexing: 'Indexing',
  performance: 'Search performance',
  onsite: 'On-page',
  aeo: 'AI answers',
};

export { RULES };

export function SeverityChip({ severity }: { severity: string }) {
  const s = SEVERITY[severity] ?? SEVERITY.info;
  return <StatusChip icon={s.icon} tone={s.tone} label={s.label} />;
}

export const VERDICT: Record<string, { label: string; tone: Tone; icon: ElementType }> = {
  PASS: { label: 'Indexed', tone: 'success', icon: CheckCircleOutlineIcon },
  NEUTRAL: { label: 'Not indexed', tone: 'warning', icon: WarningAmberIcon },
  PARTIAL: { label: 'Partly', tone: 'warning', icon: WarningAmberIcon },
  FAIL: { label: 'Error', tone: 'error', icon: ErrorIcon },
};

export function VerdictChip({ verdict }: { verdict: string | null }) {
  if (!verdict) return <StatusChip icon={HelpOutlineIcon} label="Not checked" />;
  const v = VERDICT[verdict] ?? { label: verdict, tone: 'neutral' as Tone, icon: HelpOutlineIcon };
  return <StatusChip icon={v.icon} tone={v.tone} label={v.label} />;
}

/** The path, without the scheme and our main host, for tight table cells. */
export const shortUrl = (u: string | null | undefined) => (u ? u.replace(/^https?:\/\/(www\.)?neramclasses\.com/, '') || '/' : 'Site-wide');

/** A number with a caption, for stats that have no previous period. */
export function StatCard({ label, value, caption, tone }: { label: string; value: string; caption: string; tone?: Tone }) {
  return (
    <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, minWidth: 0, borderColor: tone === 'error' ? 'error.main' : 'divider' }}>
      <Typography variant="body2" color="text.secondary" fontWeight={600}>
        {label}
      </Typography>
      <Typography variant="h5" component="p" fontWeight={700} sx={{ mt: 0.5, fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </Typography>
      <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 1 }}>
        {caption}
      </Typography>
    </Paper>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: 1, py: 0.5 }}>
      <Typography variant="body2" color="text.secondary">
        {label}
      </Typography>
      <Typography variant="body2" component="div" sx={{ wordBreak: 'break-word' }}>
        {children ?? 'n/a'}
      </Typography>
    </Box>
  );
}

/** Everything about one URL. Opened from a finding or a URL row; Close returns to the table. */
export function UrlDrawer({ url, onClose, onIgnore }: { url: string | null; onClose: () => void; onIgnore: (finding: { id: string; title: string }) => void }) {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!url) return;
    let cancelled = false;
    setData(null);
    setError(null);
    api(`/api/seo-audit/url?u=${encodeURIComponent(url)}`)
      .then((d) => !cancelled && setData(d))
      .catch((e) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [url]);

  const u = data?.url;
  return (
    <Drawer anchor="right" open={!!url} onClose={onClose} PaperProps={{ sx: { width: { xs: '100%', md: 560 } } }}>
      <Box sx={{ p: 2, display: 'flex', alignItems: 'flex-start', gap: 1, borderBottom: 1, borderColor: 'divider' }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="overline" color="text.secondary">
            URL details
          </Typography>
          <Typography variant="subtitle1" component="h2" fontWeight={700} sx={{ wordBreak: 'break-all' }}>
            {shortUrl(url)}
          </Typography>
        </Box>
        {url && /^https?:/.test(url) && (
          <IconButton aria-label="Open the page in a new tab" href={url} target="_blank" rel="noopener noreferrer" sx={{ width: 44, height: 44 }}>
            <OpenInNewIcon />
          </IconButton>
        )}
        <IconButton aria-label="Close" onClick={onClose} sx={{ width: 44, height: 44 }}>
          <CloseIcon />
        </IconButton>
      </Box>

      <Box sx={{ p: 2, overflowY: 'auto' }}>
        {error && <Alert severity="error">{error}</Alert>}
        {!data && !error && (
          <Box>
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <OpsSkeleton key={i} variant="text" height={28} />
            ))}
          </Box>
        )}
        {data && (
          <>
            {data.findings.length > 0 && (
              <Box sx={{ mb: 3 }}>
                <Typography variant="subtitle2" component="h3" fontWeight={700} sx={{ mb: 1 }}>
                  Open issues
                </Typography>
                {data.findings.map((f: any) => (
                  <Paper key={f.id} variant="outlined" sx={{ p: 1.5, mb: 1, borderRadius: 2 }}>
                    <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
                      <SeverityChip severity={f.severity} />
                      <Typography variant="body2" fontWeight={600} sx={{ flex: 1, minWidth: 160 }}>
                        {f.title}
                      </Typography>
                      {f.status === 'open' && (
                        <Button size="small" onClick={() => onIgnore({ id: f.id, title: f.title })} sx={TARGET_44}>
                          Ignore
                        </Button>
                      )}
                    </Box>
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                      {RULES[f.rule_id]?.fix}
                    </Typography>
                  </Paper>
                ))}
              </Box>
            )}

            <Typography variant="subtitle2" component="h3" fontWeight={700}>
              Google (URL Inspection)
            </Typography>
            {u?.inspected_at ? (
              <Box sx={{ mb: 2 }}>
                <Field label="Status">
                  <VerdictChip verdict={u.verdict} />
                </Field>
                <Field label="Coverage">{u.coverage_state}</Field>
                <Field label="Google's canonical">{u.google_canonical}</Field>
                <Field label="Our canonical">{u.user_canonical}</Field>
                <Field label="Last Google crawl">{when(u.last_crawl_time)}</Field>
                <Field label="Checked">{when(u.inspected_at)}</Field>
              </Box>
            ) : (
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Not inspected yet. It is queued for the next daily run.{u?.inspect_error ? ` Last attempt: ${u.inspect_error}` : ''}
              </Typography>
            )}

            <Divider sx={{ my: 2 }} />
            <Typography variant="subtitle2" component="h3" fontWeight={700}>
              Our crawl
            </Typography>
            {u?.crawled_at ? (
              <Box sx={{ mb: 2 }}>
                <Field label="HTTP status">
                  {u.http_status ?? u.crawl_error}
                  {u.redirect_to ? ` to ${u.redirect_to}` : ''}
                </Field>
                <Field label="Title">{u.title ? `${u.title} (${u.title.length} characters)` : 'Missing'}</Field>
                <Field label="Description">{u.meta_description || 'Missing'}</Field>
                <Field label="Canonical">{u.canonical || 'Missing'}</Field>
                <Field label="Robots">{[u.robots_meta, u.x_robots_tag && `header: ${u.x_robots_tag}`].filter(Boolean).join(', ') || 'Not set (indexable)'}</Field>
                <Field label="H1 headings">{u.h1_count}</Field>
                <Field label="Words">{num(u.word_count)}</Field>
                <Field label="Structured data">{(u.jsonld_types ?? []).join(', ') || 'None'}</Field>
                <Field label="In sitemap">{u.expected_index ? `Yes (${u.sitemap})` : 'No'}</Field>
                <Field label="Crawled">{when(u.crawled_at)}</Field>
              </Box>
            ) : (
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Not crawled yet.
              </Typography>
            )}

            <Divider sx={{ my: 2 }} />
            <Typography variant="subtitle2" component="h3" fontWeight={700} sx={{ mb: 1 }}>
              Searches it showed for (28 days)
            </Typography>
            {data.queries.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                No search data for this page yet.
              </Typography>
            ) : (
              <Table size="small" aria-label="Searches this page showed for">
                <TableHead>
                  <TableRow>
                    <TableCell>Search</TableCell>
                    <TableCell align="right">Clicks</TableCell>
                    <TableCell align="right">Impressions</TableCell>
                    <TableCell align="right">Position</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {data.queries.map((q: any) => (
                    <TableRow key={q.query}>
                      <TableCell sx={{ wordBreak: 'break-word' }}>{q.query}</TableCell>
                      <TableCell align="right">{num(q.clicks)}</TableCell>
                      <TableCell align="right">{num(q.impressions)}</TableCell>
                      <TableCell align="right">{q.position ? q.position.toFixed(1) : 'n/a'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </>
        )}
      </Box>
    </Drawer>
  );
}

/** Ignore with an optional note: for findings that are intended. */
export function IgnoreDialog({ finding, onClose, onDone }: { finding: { id: string; title: string } | null; onClose: () => void; onDone: (msg: string) => void }) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => setNote(''), [finding]);
  const save = async () => {
    if (!finding) return;
    setBusy(true);
    try {
      await api('/api/seo-audit/findings', { method: 'PATCH', body: JSON.stringify({ id: finding.id, action: 'ignore', note }) });
      onDone('Ignored. It reopens by itself if the issue changes.');
    } catch (e: any) {
      onDone(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open={!!finding} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Ignore this finding?</DialogTitle>
      <DialogContent>
        <Typography variant="body2" sx={{ mb: 2 }}>
          {finding?.title}. Use this when the issue is intended, for example a page that should stay noindex.
        </Typography>
        <TextField label="Why (optional)" value={note} onChange={(e) => setNote(e.target.value)} fullWidth multiline minRows={2} inputProps={{ maxLength: 500 }} />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} sx={TARGET_44}>
          Cancel
        </Button>
        <Button variant="contained" onClick={save} disabled={busy} sx={TARGET_44}>
          {busy ? 'Saving…' : 'Ignore'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

/** Paste URLs from a Search Console report export; they are checked first on the next run. */
export function ImportDialog({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: (msg: string) => void }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await api('/api/seo-audit/import', { method: 'POST', body: JSON.stringify({ text }) });
      setText('');
      onDone(`${r.found} URLs queued: ${r.added} new, ${r.requeued} already tracked. Run "Crawl all pages" or wait for the morning run.`);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>Import URLs from Search Console</DialogTitle>
      <DialogContent>
        <Typography variant="body2" sx={{ mb: 2 }}>
          In Search Console, open Indexing &gt; Pages, click a reason (for example Server error (5xx)), then Export. Paste the file contents or a list of URLs here. They go to the front of the inspection and crawl queues.
        </Typography>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}
        <TextField
          label="URLs or CSV"
          value={text}
          onChange={(e) => setText(e.target.value)}
          fullWidth
          multiline
          minRows={8}
          placeholder="https://neramclasses.com/..."
          inputProps={{ spellCheck: false, style: { fontFamily: 'monospace', fontSize: 13 } }}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} sx={TARGET_44}>
          Cancel
        </Button>
        <Button variant="contained" onClick={save} disabled={busy || !text.trim()} sx={TARGET_44}>
          {busy ? 'Importing…' : 'Import'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
