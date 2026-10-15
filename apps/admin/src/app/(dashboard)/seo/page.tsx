'use client';

/**
 * SEO Health. Search Console data and our own crawl, checked every morning,
 * turned into a list of issues that close themselves once fixed.
 *
 * Entered from the sidebar (Marketing Intelligence > SEO Health). One tab
 * level (Issues, Search performance, URLs, Runs), kept in ?tab= so Back and
 * shared links land on the same view. A row opens the URL drawer; closing it
 * returns to the same table. Desktop first, usable from 900px. Admins only.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  FormControl,
  InputLabel,
  Menu,
  MenuItem,
  Paper,
  Select,
  Snackbar,
  Tab,
  Tabs,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
  useTheme,
} from '@neram/ui';
import { DataGrid, type GridColDef } from '@mui/x-data-grid';
import TravelExploreIcon from '@mui/icons-material/TravelExplore';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import ScheduleIcon from '@mui/icons-material/Schedule';
import LinkOffIcon from '@mui/icons-material/LinkOff';
import HourglassEmptyIcon from '@mui/icons-material/HourglassEmpty';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import BuildCircleOutlinedIcon from '@mui/icons-material/BuildCircleOutlined';
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip as RTooltip, XAxis, YAxis } from 'recharts';
import { EmptyState, OpsPageHeader, OpsSkeleton, StatusChip, TARGET_44, type Tone } from '@/components/ops/OpsUi';
import { AdminOnly, KpiCard } from '@/components/marketing-ai/Parts';
import { api, num, shortDate, when } from '@/components/marketing-ai/format';
import { CATEGORY_LABEL, IgnoreDialog, ImportDialog, RULES, SeverityChip, StatCard, UrlDrawer, VerdictChip, shortUrl } from '@/components/seo-audit/Parts';

const TABS = ['issues', 'search', 'urls', 'runs'] as const;
type TabKey = (typeof TABS)[number];

const RUNS = [
  { kind: 'recheck', label: 'Check my fixes', hint: 'Re-crawl pages with open issues, then rebuild the list' },
  { kind: 'daily', label: 'Full morning run', hint: 'Search data, inspection, crawl and rules' },
  { kind: 'search', label: 'Fetch search data', hint: 'Clicks and positions from Search Console' },
  { kind: 'sitemaps', label: 'Resubmit sitemaps', hint: 'Only those that changed or Google stopped reading' },
  { kind: 'inspect', label: 'Inspect URLs', hint: 'Up to 400 URLs through URL Inspection' },
  { kind: 'crawl', label: 'Crawl all pages', hint: 'Re-crawl every sitemap page now' },
  { kind: 'analyze', label: 'Re-check rules', hint: 'Rebuild the issue list from saved data' },
  { kind: 'digest', label: 'Send the email digest', hint: 'To SEO_DIGEST_TO' },
] as const;

const JOB_LABEL: Record<string, string> = { search: 'Search data', sitemaps: 'Sitemap submit', inspect: 'URL Inspection', crawl: 'Crawl', analyze: 'Rules', digest: 'Email digest' };
const RUN_STATUS: Record<string, { label: string; tone: Tone; icon: typeof CheckCircleOutlineIcon }> = {
  ok: { label: 'Done', tone: 'success', icon: CheckCircleOutlineIcon },
  partial: { label: 'Partly done', tone: 'warning', icon: ScheduleIcon },
  failed: { label: 'Failed', tone: 'error', icon: ErrorOutlineIcon },
  running: { label: 'Running', tone: 'info', icon: HourglassEmptyIcon },
  not_connected: { label: 'Not connected', tone: 'neutral', icon: LinkOffIcon },
};

const pctChange = (now: number, prev: number) => (prev > 0 ? ((now - prev) / prev) * 100 : null);

function readTab(): TabKey {
  if (typeof window === 'undefined') return 'issues';
  const t = new URLSearchParams(window.location.search).get('tab');
  return (TABS as readonly string[]).includes(t || '') ? (t as TabKey) : 'issues';
}

export default function SeoHealthPage() {
  const theme = useTheme();
  const [summary, setSummary] = useState<any>(null);
  const [error, setError] = useState<{ message: string; status?: number } | null>(null);
  const [tab, setTab] = useState<TabKey>('issues');
  const [drawerUrl, setDrawerUrl] = useState<string | null>(null);
  const [ignoring, setIgnoring] = useState<{ id: string; title: string } | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [runMenu, setRunMenu] = useState<HTMLElement | null>(null);
  const [running, setRunning] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => setTab(readTab()), []);
  const changeTab = (t: TabKey) => {
    setTab(t);
    const url = new URL(window.location.href);
    url.searchParams.set('tab', t);
    window.history.replaceState(null, '', url.toString());
  };

  const load = useCallback(() => {
    let cancelled = false;
    setError(null);
    api('/api/seo-audit/summary')
      .then((d) => !cancelled && setSummary(d))
      .catch((e) => !cancelled && setError({ message: e.message, status: e.status }));
    return () => {
      cancelled = true;
    };
  }, []);
  useEffect(() => load(), [load, reload]);
  const refresh = () => setReload((n) => n + 1);

  const run = async (kind: string) => {
    setRunMenu(null);
    setRunning(kind);
    setToast(`${RUNS.find((r) => r.kind === kind)?.label} started. This can take up to five minutes.`);
    try {
      const r = await api('/api/seo-audit/run', { method: 'POST', body: JSON.stringify({ kind, force: kind === 'crawl' }) });
      const a = r.analyze ?? (kind === 'analyze' ? r : null);
      const failed = [r, r.search, r.inspect, r.crawl, r.analyze].filter((x: any) => x?.status === 'failed');
      setToast(
        failed.length
          ? `Finished with an error: ${failed[0].error}`
          : kind === 'recheck'
            ? r.checked === 0
              ? 'No open issues to check.'
              : `Checked ${num(r.checked)} pages. ${a?.resolved ?? 0} fixed, ${a?.waiting ?? 0} waiting for Google, ${a?.open ?? 0} still open.`
          : a
            ? `Done. ${a.created ?? 0} new issues, ${a.resolved ?? 0} fixed.`
            : r.status === 'not_connected'
              ? 'Search Console is not connected yet.'
              : 'Done.',
      );
      refresh();
    } catch (e: any) {
      setToast(e.message);
    } finally {
      setRunning(null);
    }
  };

  if (error?.status === 403) return <AdminOnly />;

  const s = summary;
  const critHigh = s ? s.findings.bySeverity.critical + s.findings.bySeverity.high : 0;

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1440, mx: 'auto' }}>
      <OpsPageHeader
        icon={TravelExploreIcon}
        title="SEO Health"
        subtitle="Search Console data and our own crawl of every sitemap page, checked each morning. Fix what is open; an issue closes itself on the next run once it is fixed."
        actions={
          <>
            <Button variant="outlined" startIcon={<UploadFileIcon />} onClick={() => setImportOpen(true)} sx={TARGET_44}>
              Import URLs
            </Button>
            <Button
              variant="contained"
              startIcon={<PlayArrowIcon />}
              endIcon={<ArrowDropDownIcon />}
              onClick={(e) => setRunMenu(e.currentTarget)}
              disabled={!!running}
              aria-haspopup="menu"
              aria-expanded={!!runMenu}
              sx={TARGET_44}
            >
              {running ? 'Running…' : 'Run now'}
            </Button>
            <Menu anchorEl={runMenu} open={!!runMenu} onClose={() => setRunMenu(null)}>
              {RUNS.map((r) => (
                <MenuItem key={r.kind} onClick={() => run(r.kind)} sx={{ minHeight: 48, display: 'block' }}>
                  <Typography variant="body2" fontWeight={600}>
                    {r.label}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {r.hint}
                  </Typography>
                </MenuItem>
              ))}
            </Menu>
          </>
        }
      />

      {error && error.status !== 403 && (
        <Alert severity="error" sx={{ mb: 2 }} action={<Button color="inherit" onClick={refresh} sx={TARGET_44}>Retry</Button>}>
          {error.message}
        </Alert>
      )}

      {s && !s.connection.connected && (
        <Alert severity="info" sx={{ mb: 2 }}>
          <Typography variant="subtitle2" component="p" fontWeight={700}>
            Search Console is not connected yet
          </Typography>
          <Typography variant="body2" component="div">
            Our own crawl and the on-page and AI-answer checks already run. To add search data and Google&apos;s index status: enable the Search Console API in Google Cloud project neramclasses-ab480, create a
            service account with a JSON key, add its email as a user on the neramclasses.com property, then set GSC_SERVICE_ACCOUNT_KEY (base64 of the key) on the admin app. Steps: docs/seo-audit/README.md.
          </Typography>
        </Alert>
      )}

      {/* KPI row */}
      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', lg: 'repeat(5, 1fr)' }, mb: 2 }}>
        {!s ? (
          [0, 1, 2, 3, 4].map((i) => <OpsSkeleton key={i} variant="rounded" height={118} />)
        ) : (
          <>
            <StatCard
              label="Indexed sitemap pages"
              value={s.coverage.inspected ? `${num(s.coverage.indexed)} of ${num(s.coverage.inspected)}` : 'n/a'}
              caption={`${num(s.coverage.expected)} pages in our sitemaps, ${num(s.coverage.inspected)} checked with Google`}
            />
            <StatCard
              label="Issues to fix"
              value={num(critHigh)}
              caption={`${s.findings.bySeverity.critical} critical, ${s.findings.bySeverity.high} high, ${s.findings.bySeverity.medium} medium`}
              tone={s.findings.bySeverity.critical > 0 ? 'error' : undefined}
            />
            {s.search ? (
              <>
                <KpiCard label="Clicks, last 28 days" value={num(s.search.now.clicks)} change={pctChange(s.search.now.clicks, s.search.prev.clicks)} goodWhen="up" previous={num(s.search.prev.clicks)} />
                <KpiCard
                  label="Average position"
                  value={s.search.now.position ? s.search.now.position.toFixed(1) : 'n/a'}
                  change={s.search.now.position && s.search.prev.position ? pctChange(s.search.now.position, s.search.prev.position) : null}
                  goodWhen="down"
                  previous={s.search.prev.position ? s.search.prev.position.toFixed(1) : 'n/a'}
                />
              </>
            ) : (
              <>
                <StatCard label="Clicks, last 28 days" value="n/a" caption="Waiting for Search Console data" />
                <StatCard label="Average position" value="n/a" caption="Waiting for Search Console data" />
              </>
            )}
            <StatCard label="AI-answer checks passing" value={`${s.aeo.passing} of ${s.aeo.checks}`} caption="Crawler access, llms.txt, structured data, answer-first copy" />
          </>
        )}
      </Box>

      {s?.search?.trend?.length > 1 && (
        <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, mb: 2 }}>
          <Typography variant="subtitle1" component="h2" fontWeight={700}>
            Search traffic, last 90 days
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            Final Search Console data up to {shortDate(s.search.end)}.
          </Typography>
          <Box sx={{ height: 240 }} role="img" aria-label={`Clicks and impressions per day. Last 28 days: ${s.search.now.clicks} clicks, ${s.search.now.impressions} impressions.`}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={s.search.trend} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={theme.palette.divider} />
                <XAxis dataKey="date" tickFormatter={shortDate} tick={{ fontSize: 12 }} minTickGap={24} />
                <YAxis yAxisId="c" tick={{ fontSize: 12 }} width={40} />
                <YAxis yAxisId="i" orientation="right" tick={{ fontSize: 12 }} width={48} />
                <RTooltip labelFormatter={(d) => shortDate(String(d))} />
                <Legend />
                <Line yAxisId="c" type="monotone" dataKey="clicks" name="Clicks" stroke={theme.palette.primary.main} strokeWidth={2} dot={false} isAnimationActive={false} />
                <Line yAxisId="i" type="monotone" dataKey="impressions" name="Impressions" stroke={theme.palette.secondary.main} strokeWidth={2} strokeDasharray="5 3" dot={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </Box>
        </Paper>
      )}

      {s?.askGoogle?.length > 0 && <AskGoogleCard items={s.askGoogle} siteUrl={s.connection.siteUrl} accountEmail={s.connection.accountEmail} setToast={setToast} />}

      <Paper variant="outlined" sx={{ borderRadius: 2 }}>
        <Tabs value={tab} onChange={(_, v) => changeTab(v)} variant="scrollable" allowScrollButtonsMobile aria-label="SEO Health views" sx={{ borderBottom: 1, borderColor: 'divider', px: 1 }}>
          <Tab value="issues" label={`Issues${s ? ` (${num(s.findings.issues ?? s.findings.total)})` : ''}`} sx={TARGET_44} />
          <Tab value="search" label="Search performance" sx={TARGET_44} />
          <Tab value="urls" label={`URLs${s ? ` (${num(s.coverage.tracked)})` : ''}`} sx={TARGET_44} />
          <Tab value="runs" label="Runs" sx={TARGET_44} />
        </Tabs>
        <Box sx={{ p: 2 }}>
          {tab === 'issues' && <IssuesTab reload={reload} onOpenUrl={setDrawerUrl} onIgnore={setIgnoring} onChanged={refresh} setToast={setToast} />}
          {tab === 'search' && <SearchTab reload={reload} onOpenUrl={setDrawerUrl} connected={!!s?.connection.connected} />}
          {tab === 'urls' && <UrlsTab reload={reload} onOpenUrl={setDrawerUrl} />}
          {tab === 'runs' && <RunsTab runs={s?.runs} />}
        </Box>
      </Paper>

      <UrlDrawer url={drawerUrl} onClose={() => setDrawerUrl(null)} onIgnore={setIgnoring} />
      <IgnoreDialog
        finding={ignoring}
        onClose={() => setIgnoring(null)}
        onDone={(msg) => {
          setIgnoring(null);
          setToast(msg);
          refresh();
        }}
      />
      <ImportDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onDone={(msg) => {
          setImportOpen(false);
          setToast(msg);
          refresh();
        }}
      />
      <Snackbar open={!!toast} autoHideDuration={8000} onClose={() => setToast(null)} message={toast} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }} />
    </Box>
  );
}

/* ─────────────────────────── Ask Google ─────────────────────────── */

/**
 * Google's API cannot request indexing for ordinary pages, so this is the one
 * manual step: open the page in Search Console URL Inspection and press
 * "Request indexing" there (about 10 a day). Marking it here takes the page off
 * the list for 14 days. The Search Console account often lives in another
 * browser, so every link can also be copied (one, or all at once).
 */
type AskGoogleItem = { url: string; coverage_state: string | null; reason?: string; waiting?: boolean };

function AskGoogleCard({ items, siteUrl, accountEmail, setToast }: { items: AskGoogleItem[]; siteUrl: string; accountEmail?: string | null; setToast: (m: string) => void }) {
  const [done, setDone] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const inspectUrl = (u: string) =>
    `https://search.google.com/search-console/inspect?resource_id=${encodeURIComponent(siteUrl)}&id=${encodeURIComponent(u)}${accountEmail ? `&authuser=${encodeURIComponent(accountEmail)}` : ''}`;

  const copy = async (text: string, ok: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setToast(ok);
    } catch {
      setToast('Could not copy. Open the link and copy it from the address bar.');
    }
  };

  const markAsked = async (u: string) => {
    setBusy(u);
    try {
      await api('/api/seo-audit/ask-google', { method: 'POST', body: JSON.stringify({ url: u }) });
      setDone((d) => new Set(d).add(u));
    } catch (e: any) {
      setToast(e.message);
    } finally {
      setBusy(null);
    }
  };

  const left = items.filter((i) => !done.has(i.url));
  return (
    <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, mb: 2 }} component="section" aria-labelledby="ask-google-title">
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2, flexWrap: 'wrap', mb: 1.5 }}>
        <Box sx={{ flex: '1 1 420px', minWidth: 0 }}>
          <Typography id="ask-google-title" variant="subtitle1" component="h2" fontWeight={700}>
            Ask Google to index today
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 820 }}>
            These pages work but Google has not indexed them. Open each one in Search Console (or copy the links into the browser signed in to Search Console), press Request indexing (Google allows about 10 a
            day), then mark it asked here. Pages we have already fixed come first, then the most valuable.
          </Typography>
        </Box>
        {left.length > 0 && (
          <Button
            variant="outlined"
            startIcon={<ContentCopyIcon fontSize="small" aria-hidden />}
            onClick={() => copy(left.map((i) => inspectUrl(i.url)).join('\n'), `${left.length} links copied. Paste them in the browser signed in to Search Console.`)}
            sx={TARGET_44}
          >
            Copy all links
          </Button>
        )}
      </Box>
      {left.length === 0 ? (
        <Typography variant="body2" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <CheckCircleOutlineIcon fontSize="small" color="success" aria-hidden /> All asked for today.
        </Typography>
      ) : (
        <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, display: 'grid', gap: 1 }}>
          {left.map((i) => (
            <Box component="li" key={i.url} sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap', py: 0.5, borderTop: 1, borderColor: 'divider' }}>
              <Box sx={{ flex: '1 1 320px', minWidth: 0 }}>
                <Typography variant="body2" fontWeight={600} noWrap title={i.url}>
                  {shortUrl(i.url)}
                </Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', mt: 0.25 }}>
                  {i.waiting && <StatusChip icon={BuildCircleOutlinedIcon} label="Fixed on our side" tone="success" />}
                  <Typography variant="caption" color="text.secondary" title={i.coverage_state ?? undefined}>
                    {i.reason || i.coverage_state || 'Not indexed'}
                  </Typography>
                </Box>
              </Box>
              <Button
                variant="outlined"
                size="small"
                endIcon={<OpenInNewIcon fontSize="small" aria-hidden />}
                href={inspectUrl(i.url)}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`Open ${shortUrl(i.url)} in Search Console (new tab)`}
                sx={TARGET_44}
              >
                Open in Search Console
              </Button>
              <Button
                size="small"
                startIcon={<ContentCopyIcon fontSize="small" aria-hidden />}
                onClick={() => copy(inspectUrl(i.url), 'Link copied. Paste it in the browser signed in to Search Console.')}
                aria-label={`Copy link to Search Console for ${shortUrl(i.url)}`}
                sx={TARGET_44}
              >
                Copy link
              </Button>
              <Button size="small" onClick={() => markAsked(i.url)} disabled={busy === i.url} sx={TARGET_44}>
                {busy === i.url ? 'Saving…' : 'Mark asked'}
              </Button>
            </Box>
          ))}
        </Box>
      )}
    </Paper>
  );
}

/* ───────────────────────────── Issues ───────────────────────────── */

function IssuesTab({
  reload,
  onOpenUrl,
  onIgnore,
  onChanged,
  setToast,
}: {
  reload: number;
  onOpenUrl: (u: string) => void;
  onIgnore: (f: { id: string; title: string }) => void;
  onChanged: () => void;
  setToast: (m: string) => void;
}) {
  const [status, setStatus] = useState<'open' | 'waiting' | 'ignored' | 'fixed'>('open');
  const [category, setCategory] = useState('');
  // Info items (long titles, thin pages) are content work, so they sit behind the filter.
  const [severity, setSeverity] = useState('issues');
  const [rows, setRows] = useState<any[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setRows(null);
    setError(null);
    const q = new URLSearchParams({ status });
    if (category) q.set('category', category);
    if (severity) q.set('severity', severity);
    api(`/api/seo-audit/findings?${q}`)
      .then((d) => !cancelled && setRows(d.findings))
      .catch((e) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [status, category, severity, reload]);

  const reopen = async (id: string) => {
    try {
      await api('/api/seo-audit/findings', { method: 'PATCH', body: JSON.stringify({ id, action: 'reopen' }) });
      setToast('Reopened.');
      onChanged();
    } catch (e: any) {
      setToast(e.message);
    }
  };

  const columns: GridColDef[] = useMemo(
    () => [
      { field: 'severity', headerName: 'Severity', width: 120, sortComparator: (a, b) => ['critical', 'high', 'medium', 'info'].indexOf(a) - ['critical', 'high', 'medium', 'info'].indexOf(b), renderCell: (p) => <SeverityChip severity={p.value} /> },
      { field: 'rule_id', headerName: 'Check', width: 170, valueGetter: (p) => `${p.row.rule_id} ${RULES[p.row.rule_id]?.name ?? ''}` },
      { field: 'title', headerName: 'Issue', flex: 1, minWidth: 260 },
      {
        field: 'url',
        headerName: 'Page',
        flex: 1,
        minWidth: 220,
        renderCell: (p) => (
          <Typography variant="body2" noWrap title={p.value ?? ''} sx={{ color: 'primary.main', fontWeight: 600 }}>
            {shortUrl(p.value)}
          </Typography>
        ),
      },
      { field: 'category', headerName: 'Area', width: 150, valueGetter: (p) => CATEGORY_LABEL[p.row.category] ?? p.row.category },
      { field: 'first_seen', headerName: 'Since', width: 120, valueFormatter: (p) => when(p.value as string) },
      {
        field: 'actions',
        headerName: '',
        width: 110,
        sortable: false,
        renderCell: (p) =>
          p.row.status === 'open' ? (
            <Button
              size="small"
              onClick={(e) => {
                e.stopPropagation();
                onIgnore({ id: p.row.id, title: p.row.title });
              }}
              sx={TARGET_44}
            >
              Ignore
            </Button>
          ) : p.row.status === 'ignored' ? (
            <Button
              size="small"
              onClick={(e) => {
                e.stopPropagation();
                reopen(p.row.id);
              }}
              sx={TARGET_44}
            >
              Reopen
            </Button>
          ) : null,
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [onIgnore],
  );

  return (
    <>
      <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center', mb: 2 }}>
        <ToggleButtonGroup size="small" exclusive value={status} onChange={(_, v) => v && setStatus(v)} aria-label="Issue status">
          <ToggleButton value="open" sx={{ minHeight: 44, px: 2 }}>
            Open
          </ToggleButton>
          <ToggleButton value="waiting" sx={{ minHeight: 44, px: 2 }}>
            Waiting for Google
          </ToggleButton>
          <ToggleButton value="ignored" sx={{ minHeight: 44, px: 2 }}>
            Ignored
          </ToggleButton>
          <ToggleButton value="fixed" sx={{ minHeight: 44, px: 2 }}>
            Fixed
          </ToggleButton>
        </ToggleButtonGroup>
        <FormControl size="small" sx={{ minWidth: 190 }}>
          <InputLabel id="seo-area">Area</InputLabel>
          <Select labelId="seo-area" label="Area" value={category} onChange={(e) => setCategory(String(e.target.value))}>
            <MenuItem value="">All areas</MenuItem>
            {Object.entries(CATEGORY_LABEL).map(([k, v]) => (
              <MenuItem key={k} value={k}>
                {v}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 160 }}>
          <InputLabel id="seo-severity">Severity</InputLabel>
          <Select labelId="seo-severity" label="Severity" value={severity} onChange={(e) => setSeverity(String(e.target.value))}>
            <MenuItem value="issues">Critical to medium</MenuItem>
            <MenuItem value="">All, with info</MenuItem>
            <MenuItem value="critical">Critical</MenuItem>
            <MenuItem value="high">High</MenuItem>
            <MenuItem value="medium">Medium</MenuItem>
            <MenuItem value="info">Info</MenuItem>
          </Select>
        </FormControl>
        <Typography variant="body2" color="text.secondary" sx={{ ml: 'auto' }}>
          Click a row for the page details and how to fix it.
        </Typography>
      </Box>

      {error && <Alert severity="error">{error}</Alert>}
      {rows && rows.length === 0 && !error ? (
        <EmptyState
          icon={CheckCircleOutlineIcon}
          title={status === 'open' ? 'Nothing to fix' : status === 'waiting' ? 'Nothing waiting on Google' : status === 'ignored' ? 'No ignored issues' : 'Nothing fixed yet'}
          body={
            status === 'open'
              ? 'No open issues match these filters. If this is the first visit, run "Crawl all pages" from Run now.'
              : status === 'waiting'
                ? 'Issues we fixed but Google has not re-crawled yet show here. They close by themselves once Google catches up.'
                : undefined
          }
        />
      ) : (
        <Box sx={{ height: 640 }}>
          <DataGrid
            rows={rows ?? []}
            columns={columns}
            loading={!rows && !error}
            density="compact"
            pageSizeOptions={[25, 50, 100]}
            initialState={{ pagination: { paginationModel: { pageSize: 50 } } }}
            onRowClick={(p) => p.row.url && onOpenUrl(p.row.url)}
            disableRowSelectionOnClick
            sx={{ '& .MuiDataGrid-row': { cursor: 'pointer' } }}
          />
        </Box>
      )}
    </>
  );
}

/* ─────────────────────────── Search performance ─────────────────────────── */

function SearchTab({ reload, onOpenUrl, connected }: { reload: number; onOpenUrl: (u: string) => void; connected: boolean }) {
  const [view, setView] = useState<'pages' | 'queries' | 'striking'>('pages');
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setData(null);
    api('/api/seo-audit/search')
      .then((d) => !cancelled && setData(d))
      .catch((e) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [reload]);

  const pos = (v: number) => (v ? v.toFixed(1) : 'n/a');
  const columns: Record<typeof view, GridColDef[]> = {
    pages: [
      { field: 'page', headerName: 'Page', flex: 1, minWidth: 280, valueFormatter: (p) => shortUrl(p.value as string) },
      { field: 'clicks', headerName: 'Clicks', width: 100, type: 'number' },
      { field: 'prev_clicks', headerName: 'Clicks before', width: 120, type: 'number' },
      { field: 'impressions', headerName: 'Impressions', width: 120, type: 'number' },
      { field: 'ctr', headerName: 'CTR', width: 90, type: 'number', valueFormatter: (p) => `${((p.value as number) * 100).toFixed(1)}%` },
      { field: 'avg_position', headerName: 'Position', width: 100, type: 'number', valueFormatter: (p) => pos(p.value as number) },
    ],
    queries: [
      { field: 'query', headerName: 'Search', flex: 1, minWidth: 240 },
      { field: 'clicks', headerName: 'Clicks', width: 100, type: 'number' },
      { field: 'impressions', headerName: 'Impressions', width: 120, type: 'number' },
      { field: 'position', headerName: 'Position', width: 100, type: 'number', valueFormatter: (p) => pos(p.value as number) },
      { field: 'pages', headerName: 'Our pages', width: 110, type: 'number' },
      { field: 'page', headerName: 'Main page', flex: 1, minWidth: 220, valueFormatter: (p) => shortUrl(p.value as string) },
    ],
    striking: [
      { field: 'query', headerName: 'Search', flex: 1, minWidth: 240 },
      { field: 'page', headerName: 'Page', flex: 1, minWidth: 220, valueFormatter: (p) => shortUrl(p.value as string) },
      { field: 'impressions', headerName: 'Impressions', width: 120, type: 'number' },
      { field: 'clicks', headerName: 'Clicks', width: 100, type: 'number' },
      { field: 'avg_position', headerName: 'Position', width: 100, type: 'number', valueFormatter: (p) => pos(p.value as number) },
    ],
  };

  if (error) return <Alert severity="error">{error}</Alert>;
  if (data && !data.end) {
    return (
      <EmptyState
        icon={TravelExploreIcon}
        title="No search data yet"
        body={connected ? 'Run "Fetch search data" from Run now. The first run reads the last 30 days and the morning runs fill in 90 days of history.' : 'Connect Search Console to see clicks, impressions and positions per page and per search.'}
      />
    );
  }

  const rows = data ? (data[view] as any[]).map((r, i) => ({ id: `${view}-${i}`, ...r })) : [];
  return (
    <>
      <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center', mb: 2 }}>
        <ToggleButtonGroup size="small" exclusive value={view} onChange={(_, v) => v && setView(v)} aria-label="Search view">
          <ToggleButton value="pages" sx={{ minHeight: 44, px: 2 }}>
            Pages
          </ToggleButton>
          <ToggleButton value="queries" sx={{ minHeight: 44, px: 2 }}>
            Searches
          </ToggleButton>
          <ToggleButton value="striking" sx={{ minHeight: 44, px: 2 }}>
            Close to the top
          </ToggleButton>
        </ToggleButtonGroup>
        <Typography variant="body2" color="text.secondary">
          {view === 'striking' ? 'Searches where a page sits at position 5 to 20: the quickest wins.' : `Last 28 days to ${data ? shortDate(data.end) : '…'}.`}
        </Typography>
      </Box>
      <Box sx={{ height: 640 }}>
        <DataGrid
          rows={rows}
          columns={columns[view]}
          loading={!data}
          density="compact"
          pageSizeOptions={[25, 50, 100]}
          initialState={{ pagination: { paginationModel: { pageSize: 50 } } }}
          onRowClick={(p) => p.row.page && onOpenUrl(p.row.page)}
          disableRowSelectionOnClick
          sx={{ '& .MuiDataGrid-row': { cursor: 'pointer' } }}
        />
      </Box>
    </>
  );
}

/* ───────────────────────────── URLs ───────────────────────────── */

function UrlsTab({ reload, onOpenUrl }: { reload: number; onOpenUrl: (u: string) => void }) {
  const [rows, setRows] = useState<any[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [problems, setProblems] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setRows(null);
    api('/api/seo-audit/urls')
      .then((d) => !cancelled && setRows(d.urls.map((u: any) => ({ id: u.url, ...u }))))
      .catch((e) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [reload]);

  const shown = useMemo(
    () => (rows ?? []).filter((r) => !problems || (r.verdict && r.verdict !== 'PASS') || (r.http_status && r.http_status !== 200) || r.crawl_error || r.inspect_error),
    [rows, problems],
  );

  const columns: GridColDef[] = [
    { field: 'url', headerName: 'Page', flex: 1, minWidth: 280, valueFormatter: (p) => shortUrl(p.value as string) },
    { field: 'source', headerName: 'Found in', width: 110, valueGetter: (p) => (p.row.expected_index ? 'Sitemap' : p.row.source === 'import' ? 'Imported' : 'Search') },
    { field: 'verdict', headerName: 'Google', width: 150, renderCell: (p) => <VerdictChip verdict={p.value} /> },
    { field: 'coverage_state', headerName: 'Google says', flex: 1, minWidth: 200 },
    { field: 'http_status', headerName: 'HTTP', width: 80, valueGetter: (p) => p.row.http_status ?? (p.row.crawl_error ? 'Error' : '') },
    { field: 'inspected_at', headerName: 'Inspected', width: 130, valueFormatter: (p) => when(p.value as string) },
    { field: 'crawled_at', headerName: 'Crawled', width: 130, valueFormatter: (p) => when(p.value as string) },
  ];

  if (error) return <Alert severity="error">{error}</Alert>;
  if (rows && rows.length === 0) {
    return <EmptyState icon={TravelExploreIcon} title="No URLs tracked yet" body='Run "Crawl all pages" from Run now to read our sitemaps.' />;
  }
  return (
    <>
      <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', mb: 2, flexWrap: 'wrap' }}>
        <ToggleButtonGroup size="small" exclusive value={problems ? 'problems' : 'all'} onChange={(_, v) => v && setProblems(v === 'problems')} aria-label="Which URLs">
          <ToggleButton value="all" sx={{ minHeight: 44, px: 2 }}>
            All URLs
          </ToggleButton>
          <ToggleButton value="problems" sx={{ minHeight: 44, px: 2 }}>
            Not indexed or failing
          </ToggleButton>
        </ToggleButtonGroup>
        <Typography variant="body2" color="text.secondary">
          {num(shown.length)} shown
        </Typography>
      </Box>
      <Box sx={{ height: 640 }}>
        <DataGrid
          rows={shown}
          columns={columns}
          loading={!rows}
          density="compact"
          pageSizeOptions={[25, 50, 100]}
          initialState={{ pagination: { paginationModel: { pageSize: 50 } } }}
          onRowClick={(p) => onOpenUrl(p.row.url)}
          disableRowSelectionOnClick
          sx={{ '& .MuiDataGrid-row': { cursor: 'pointer' } }}
        />
      </Box>
    </>
  );
}

/* ───────────────────────────── Runs ───────────────────────────── */

function summarise(kind: string, c: any): string {
  if (!c) return '';
  if (c.missing) return `Missing: ${c.missing.join(', ')}`;
  switch (kind) {
    case 'search':
      return `${num(c.rows)} rows${c.ranges?.length ? `, ${c.ranges.join(', ')}` : ''}`;
    case 'inspect':
      return c.skipped ? c.skipped : `${num(c.inspected)} inspected${c.errors ? `, ${c.errors} failed` : ''}${c.firstError ? ` (${c.firstError})` : ''}`;
    case 'crawl':
      return `${num(c.crawled)} pages crawled, ${num(c.remaining)} left, ${num(c.linksChecked)} links checked, ${num(c.sitemapUrls)} in sitemaps`;
    case 'analyze':
      return `${num(c.findings)} issues: ${c.created} new, ${c.resolved} fixed, ${c.reopened} reopened`;
    case 'sitemaps':
      return c.submitted?.length
        ? `Submitted ${c.submitted.map((d: any) => `${d.url.replace(/^https?:\/\//, '')} (${d.reason})`).join(', ')}`
        : `Nothing to submit. ${(c.sitemaps ?? []).map((m: any) => `${m.url.replace(/^https?:\/\//, '')}: ${num(m.pages)} pages`).join(', ')}`;
    case 'digest':
      return c.sent ? `Sent to ${c.recipients}` : c.reason ?? 'Not sent';
    default:
      return '';
  }
}

function RunsTab({ runs }: { runs: any[] | undefined }) {
  if (!runs) return <OpsSkeleton variant="rounded" height={200} />;
  return (
    <Box sx={{ display: 'grid', gap: 1.5 }}>
      <Typography variant="body2" color="text.secondary">
        The morning run starts at 08:30 IST: search data, sitemap resubmission, URL Inspection, crawl of pages not crawled this week, then the rules. The email digest goes out on Mondays at 09:00 IST.
      </Typography>
      {runs.map((r) => {
        const st = r.status ? RUN_STATUS[r.status] : null;
        return (
          <Paper key={r.kind} variant="outlined" sx={{ p: 2, borderRadius: 2, display: 'grid', gridTemplateColumns: { xs: '1fr', md: '180px 160px 1fr' }, gap: 1, alignItems: 'center' }}>
            <Typography variant="subtitle2" component="h3" fontWeight={700}>
              {JOB_LABEL[r.kind]}
            </Typography>
            <Box>{st ? <StatusChip icon={st.icon} tone={st.tone} label={st.label} /> : <StatusChip icon={ScheduleIcon} label="Never run" />}</Box>
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="body2">{r.started_at ? `${when(r.started_at)} (${r.trigger === 'manual' ? 'run by hand' : 'scheduled'})` : 'No runs yet'}</Typography>
              <Typography variant="body2" color={r.error ? 'error.main' : 'text.secondary'} sx={{ wordBreak: 'break-word' }}>
                {r.error ?? summarise(r.kind, r.counts)}
              </Typography>
            </Box>
          </Paper>
        );
      })}
    </Box>
  );
}
