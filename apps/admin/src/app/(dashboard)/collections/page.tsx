'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  Alert,
  Box,
  Button,
  Card,
  CardActionArea,
  Chip,
  CircularProgress,
  IconButton,
  MenuItem,
  Paper,
  Skeleton,
  Stack,
  Tab,
  Tabs,
  TextField,
  Tooltip,
  Typography,
  useCopyToClipboard,
} from '@neram/ui';
import { DataGrid, type GridColDef } from '@mui/x-data-grid';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import AddCardIcon from '@mui/icons-material/AddCard';
import SendIcon from '@mui/icons-material/Send';
import RateReviewOutlinedIcon from '@mui/icons-material/RateReviewOutlined';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import CheckIcon from '@mui/icons-material/Check';
import WhatsAppIcon from '@mui/icons-material/WhatsApp';
import { formatDueDate, formatRupees } from '@neram/database/fee-plan';
import ApplicationAndFeesDialog, { type PrefillPaymentLine } from '@/components/students/ApplicationAndFeesDialog';
import FeeReportReviewDialog, { type FeeReport } from '@/components/students/FeeReportReviewDialog';
import RecordPaymentDialog from '@/components/students/RecordPaymentDialog';
import { FeeClaimDrawer, PaymentsToVerifyPanel } from '@/components/collections/PaymentsToVerify';
import { useAdminProfile } from '@/contexts/AdminProfileContext';
import { useAdminBadges } from '@/contexts/AdminBadgesContext';
import { payBalanceMessage, payBalanceUrl } from '@/lib/marketing-links';
import type { FeeClaimSummary } from '@/lib/fee-claims-view';
import {
  checkStatusColor,
  checkStatusLabel,
  collectionStatusColor,
  collectionStatusWords,
  planLabel,
} from '@/components/students/fee-labels';

interface CollectionsRow {
  userId: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  academicYear: string | null;
  plan: 'full' | 'installment' | null;
  agreed: number | null;
  collected: number;
  balance: number | null;
  nextDue: { amount: number; dueDate: string | null; number: number | null } | null;
  daysUntilDue: number | null;
  status: string;
  openReportId: string | null;
  checkStatus: string | null;
  isAlumni: boolean;
  check: { id: string; status: string; createdAt: string; sentAt: string | null; openedAt: string | null; confirmedAt: string | null } | null;
}

interface CollectionsData {
  year: string;
  defaultYear: string;
  years: string[];
  hasNoYear: boolean;
  rows: CollectionsRow[];
  reports: (FeeReport & { userId: string })[];
  totals: {
    students: number;
    agreed: number;
    collected: number;
    toCollect: number;
    overdueAmount: number;
    overdueCount: number;
    dueSoonCount: number;
    noDateCount: number;
    missingFeeCount: number;
    openReports: number;
  };
}

type TabKey = 'owes' | 'missing' | 'reports' | 'checks';
type FilterKey = 'all' | 'collected' | 'balance' | 'overdue' | 'due';

const TABS: TabKey[] = ['owes', 'missing', 'reports', 'checks'];
const FILTERS: FilterKey[] = ['all', 'collected', 'balance', 'overdue', 'due'];

const FILTER_WORDS: Record<FilterKey, string> = {
  all: 'Everyone with a fee',
  collected: 'Students who have paid something',
  balance: 'Students who still owe',
  overdue: 'Overdue',
  due: 'Due in the next 7 days, due today or overdue',
};

function shortDate(iso: string | null | undefined): string {
  return iso ? formatDueDate(iso.slice(0, 10)) : '';
}

/** wa.me wants digits with the country code; Indian 10-digit numbers get 91. */
function waUrl(phone: string | null | undefined, text: string): string {
  let digits = (phone || '').replace(/\D/g, '');
  if (digits.length === 10) digits = `91${digits}`;
  return digits ? `https://wa.me/${digits}?text=${encodeURIComponent(text)}` : `https://wa.me/?text=${encodeURIComponent(text)}`;
}

/** What the student pays now: the next installment, or the plain balance. */
function payNowAmount(r: { nextDue: { amount: number } | null; balance: number | null }): number | null {
  if (r.nextDue && r.nextDue.amount > 0.01) return r.nextDue.amount;
  return r.balance !== null && r.balance > 0.01 ? r.balance : null;
}

function CollectionsPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get('tab');
  const tab: TabKey = TABS.includes(tabParam as TabKey) ? (tabParam as TabKey) : 'owes';
  const filterParam = searchParams.get('filter');
  const filter: FilterKey = FILTERS.includes(filterParam as FilterKey) ? (filterParam as FilterKey) : 'all';
  const yearParam = searchParams.get('year') || '';
  const verifyId = searchParams.get('verify') || null;
  const { supabaseUserId } = useAdminProfile();
  const { refresh: refreshBadges } = useAdminBadges();
  const { copy } = useCopyToClipboard(2000);
  const [copiedFor, setCopiedFor] = useState<string | null>(null);
  const [claims, setClaims] = useState<FeeClaimSummary[]>([]);
  const [claimsLoading, setClaimsLoading] = useState(true);

  const [data, setData] = useState<CollectionsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [notice, setNotice] = useState<{ text: string; severity: 'success' | 'info' | 'error' } | null>(null);
  const [payRow, setPayRow] = useState<CollectionsRow | null>(null);
  const [feesUser, setFeesUser] = useState<{ userId: string; prefill?: PrefillPaymentLine[]; reportId?: string | null } | null>(null);
  const [review, setReview] = useState<(FeeReport & { userId: string }) | null>(null);
  const [sendingFor, setSendingFor] = useState<string | null>(null);

  const setParams = useCallback(
    (next: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [k, v] of Object.entries(next)) {
        if (v === null || v === '') params.delete(k);
        else params.set(k, v);
      }
      const qs = params.toString();
      router.replace(qs ? `/collections?${qs}` : '/collections', { scroll: false });
    },
    [router, searchParams],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/collections${yearParam ? `?year=${encodeURIComponent(yearParam)}` : ''}`);
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'Could not load collections.');
      setData(body as CollectionsData);
    } catch (e: any) {
      setError(e?.message || 'Could not load collections.');
    } finally {
      setLoading(false);
    }
  }, [yearParam]);

  useEffect(() => {
    void load();
  }, [load]);

  // Balance payments students sent from the pay balance page, waiting for staff.
  const loadClaims = useCallback(async () => {
    setClaimsLoading(true);
    try {
      const res = await fetch('/api/fee-claims?status=pending', { cache: 'no-store' });
      const body = await res.json().catch(() => ({}));
      if (res.ok) setClaims(Array.isArray(body.data) ? body.data : []);
    } catch {
      // The section stays hidden; Collections itself still works.
    } finally {
      setClaimsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadClaims();
  }, [loadClaims]);

  const payLink = useCallback(
    () =>
      payBalanceUrl({
        adminOrigin: typeof window === 'undefined' ? null : window.location.origin,
        configured: process.env.NEXT_PUBLIC_MARKETING_URL,
      }),
    [],
  );

  const copyPayLink = async (row: CollectionsRow) => {
    const url = payLink();
    const ok = await copy(url);
    if (ok) {
      setCopiedFor(row.userId);
      window.setTimeout(() => setCopiedFor((cur) => (cur === row.userId ? null : cur)), 2000);
    } else {
      setNotice({ text: `Could not copy. The pay link is ${url}`, severity: 'info' });
    }
  };

  const whatsappPayLink = (row: CollectionsRow) => {
    const amount = payNowAmount(row);
    const first = (row.name || '').trim().split(/\s+/)[0] || null;
    return waUrl(row.phone, payBalanceMessage(first, amount !== null ? formatRupees(amount) : null, payLink()));
  };

  const rows = useMemo(() => data?.rows ?? [], [data]);
  const nameOf = useMemo(() => new Map(rows.map((r) => [r.userId, r.name || r.email || 'Student'])), [rows]);

  const matchesSearch = useCallback(
    (r: CollectionsRow) => {
      const q = search.trim().toLowerCase();
      if (!q) return true;
      return [r.name, r.email, r.phone].some((v) => (v || '').toLowerCase().includes(q));
    },
    [search],
  );

  const owesRows = useMemo(
    () =>
      rows
        .filter((r) => r.agreed !== null)
        .filter((r) => {
          if (filter === 'collected') return r.collected > 0;
          if (filter === 'balance') return (r.balance ?? 0) > 0.01;
          if (filter === 'overdue') return r.status === 'overdue';
          if (filter === 'due') return ['overdue', 'due_today', 'due_soon'].includes(r.status);
          return true;
        })
        .filter(matchesSearch)
        .sort((a, b) => (a.daysUntilDue ?? 9999) - (b.daysUntilDue ?? 9999)),
    [rows, filter, matchesSearch],
  );
  const missingRows = useMemo(() => rows.filter((r) => r.status === 'missing_fee').filter(matchesSearch), [rows, matchesSearch]);
  const checkRows = useMemo(() => rows.filter((r) => r.agreed !== null).filter(matchesSearch), [rows, matchesSearch]);
  const reports = data?.reports ?? [];

  const sendCheck = async (row: CollectionsRow) => {
    setSendingFor(row.userId);
    setNotice(null);
    try {
      const res = await fetch('/api/students/record-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: row.userId }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'Could not send.');
      setNotice({ text: `${row.name || 'Student'}: ${body.message}`, severity: body.delivered ? 'success' : 'info' });
      await load();
    } catch (e: any) {
      setNotice({ text: e?.message || 'Could not send.', severity: 'error' });
    } finally {
      setSendingFor(null);
    }
  };

  const studentCell = (r: CollectionsRow) => (
    <Box sx={{ py: 0.5, minWidth: 0 }}>
      <Typography variant="body2" fontWeight={600} noWrap>
        {r.name || 'No name'}
        {r.isAlumni && (
          <Chip label="Graduated" size="small" variant="outlined" sx={{ ml: 1, height: 18, fontSize: 10 }} />
        )}
      </Typography>
      <Typography variant="caption" color="text.secondary" noWrap component="div">
        {r.phone || r.email || ''}
      </Typography>
    </Box>
  );

  const money = (n: number | null | undefined) => (n === null || n === undefined ? 'Not set' : formatRupees(n));

  const owesColumns: GridColDef<CollectionsRow>[] = [
    { field: 'name', headerName: 'Student', flex: 1.4, minWidth: 200, renderCell: (p) => studentCell(p.row) },
    { field: 'plan', headerName: 'Plan', width: 140, valueGetter: (p) => planLabel(p.row.plan) },
    { field: 'agreed', headerName: 'Agreed', width: 110, type: 'number', renderCell: (p) => money(p.row.agreed) },
    { field: 'collected', headerName: 'Paid', width: 110, type: 'number', renderCell: (p) => money(p.row.collected) },
    {
      field: 'balance',
      headerName: 'Balance',
      width: 110,
      type: 'number',
      renderCell: (p) => <strong style={{ fontVariantNumeric: 'tabular-nums' }}>{money(p.row.balance)}</strong>,
    },
    {
      field: 'nextDue',
      headerName: 'Next due',
      width: 170,
      sortable: false,
      renderCell: (p) =>
        p.row.nextDue ? (
          <Box>
            <Typography variant="body2">{formatRupees(p.row.nextDue.amount)}</Typography>
            <Typography variant="caption" color="text.secondary">
              {p.row.nextDue.dueDate ? formatDueDate(p.row.nextDue.dueDate) : 'No date'}
            </Typography>
          </Box>
        ) : (
          <Typography variant="body2" color="text.secondary">
            Nothing
          </Typography>
        ),
    },
    {
      field: 'status',
      headerName: 'Status',
      width: 150,
      sortComparator: (_a, _b, p1, p2) => {
        const a = (p1.api.getRow(p1.id) as CollectionsRow).daysUntilDue ?? 9999;
        const b = (p2.api.getRow(p2.id) as CollectionsRow).daysUntilDue ?? 9999;
        return a - b;
      },
      renderCell: (p) => (
        <Chip
          size="small"
          label={collectionStatusWords(p.row.status, p.row.daysUntilDue)}
          color={collectionStatusColor(p.row.status)}
          variant={p.row.status === 'overdue' ? 'filled' : 'outlined'}
          sx={{ fontWeight: 600 }}
        />
      ),
    },
    {
      field: 'actions',
      headerName: 'Actions',
      width: 340,
      sortable: false,
      filterable: false,
      renderCell: (p) => (
        <Stack direction="row" spacing={0.5} alignItems="center">
          {(p.row.balance ?? 0) > 0.01 && (
            <Button
              size="small"
              variant="contained"
              onClick={() => setPayRow(p.row)}
              sx={{ textTransform: 'none', fontWeight: 600, boxShadow: 'none', minHeight: 36, mr: 0.5 }}
            >
              Record payment
            </Button>
          )}
          {(p.row.balance ?? 0) > 0.01 && (
            <Tooltip title={copiedFor === p.row.userId ? 'Copied' : 'Copy pay link'}>
              <IconButton
                onClick={() => copyPayLink(p.row)}
                aria-label={
                  copiedFor === p.row.userId
                    ? `Pay link for ${p.row.name || 'student'} copied`
                    : `Copy pay link for ${p.row.name || 'student'}`
                }
                data-testid={`copy-pay-link-${p.row.userId}`}
                sx={{ width: 44, height: 44 }}
              >
                {copiedFor === p.row.userId ? <CheckIcon fontSize="small" color="success" /> : <ContentCopyIcon fontSize="small" />}
              </IconButton>
            </Tooltip>
          )}
          {(p.row.balance ?? 0) > 0.01 && (
            <Tooltip title="Send pay link on WhatsApp">
              <IconButton
                component="a"
                href={whatsappPayLink(p.row)}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`Send pay link to ${p.row.name || 'student'} on WhatsApp`}
                sx={{ width: 44, height: 44, color: 'success.dark' }}
              >
                <WhatsAppIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
          <Button
            size="small"
            component={Link}
            href={`/crm/${p.row.userId}?section=application&from=collections`}
            endIcon={<OpenInNewIcon sx={{ fontSize: 14 }} />}
            sx={{ textTransform: 'none', fontWeight: 600, minHeight: 36 }}
          >
            Open
          </Button>
        </Stack>
      ),
    },
  ];

  const missingColumns: GridColDef<CollectionsRow>[] = [
    { field: 'name', headerName: 'Student', flex: 1.4, minWidth: 220, renderCell: (p) => studentCell(p.row) },
    { field: 'email', headerName: 'Email', flex: 1, minWidth: 200 },
    { field: 'collected', headerName: 'Paid so far', width: 130, renderCell: (p) => money(p.row.collected) },
    {
      field: 'actions',
      headerName: 'Actions',
      width: 220,
      sortable: false,
      renderCell: (p) => (
        <Stack direction="row" spacing={1}>
          <Button
            size="small"
            variant="contained"
            startIcon={<AddCardIcon sx={{ fontSize: 16 }} />}
            onClick={() => setFeesUser({ userId: p.row.userId })}
            sx={{ textTransform: 'none', fontWeight: 600, boxShadow: 'none', minHeight: 36 }}
          >
            Add fees
          </Button>
          <Button size="small" component={Link} href={`/crm/${p.row.userId}?section=application&from=collections`} sx={{ textTransform: 'none', minHeight: 36 }}>
            Open
          </Button>
        </Stack>
      ),
    },
  ];

  const checkColumns: GridColDef<CollectionsRow>[] = [
    { field: 'name', headerName: 'Student', flex: 1.4, minWidth: 220, renderCell: (p) => studentCell(p.row) },
    {
      field: 'checkStatus',
      headerName: 'Check',
      width: 220,
      valueGetter: (p) => checkStatusLabel(p.row.check?.status),
      renderCell: (p) => (
        <Chip
          size="small"
          label={checkStatusLabel(p.row.check?.status)}
          color={checkStatusColor(p.row.check?.status)}
          variant="outlined"
          sx={{ fontWeight: 600 }}
        />
      ),
    },
    { field: 'sent', headerName: 'Sent', width: 120, valueGetter: (p) => shortDate(p.row.check?.sentAt) },
    { field: 'opened', headerName: 'Opened', width: 120, valueGetter: (p) => shortDate(p.row.check?.openedAt) },
    { field: 'confirmed', headerName: 'Confirmed', width: 120, valueGetter: (p) => shortDate(p.row.check?.confirmedAt) },
    {
      field: 'actions',
      headerName: 'Actions',
      width: 170,
      sortable: false,
      renderCell: (p) => (
        <Button
          size="small"
          startIcon={sendingFor === p.row.userId ? <CircularProgress size={14} color="inherit" /> : <SendIcon sx={{ fontSize: 16 }} />}
          onClick={() => sendCheck(p.row)}
          disabled={sendingFor !== null}
          sx={{ textTransform: 'none', fontWeight: 600, minHeight: 36 }}
        >
          {p.row.check ? 'Send again' : 'Send to check'}
        </Button>
      ),
    },
  ];

  const totals = data?.totals;
  const kpis: { key: FilterKey; label: string; value: string; sub: string; tone: string }[] = totals
    ? [
        { key: 'all', label: 'Agreed', value: formatRupees(totals.agreed), sub: `${totals.students - totals.missingFeeCount} students with a fee`, tone: 'text.primary' },
        { key: 'collected', label: 'Collected', value: formatRupees(totals.collected), sub: totals.agreed ? `${Math.round((totals.collected / totals.agreed) * 100)}% of agreed` : 'Nothing agreed yet', tone: 'success.dark' },
        { key: 'balance', label: 'Still to collect', value: formatRupees(totals.toCollect), sub: `${totals.dueSoonCount} due in the next 7 days`, tone: 'warning.dark' },
        { key: 'overdue', label: 'Overdue', value: formatRupees(totals.overdueAmount), sub: `${totals.overdueCount} ${totals.overdueCount === 1 ? 'student' : 'students'}`, tone: 'error.main' },
      ]
    : [];

  const grid = (gridRows: CollectionsRow[], columns: GridColDef<CollectionsRow>[], empty: string, testId: string) => (
    <Paper variant="outlined" sx={{ borderRadius: 1, height: 560, width: '100%' }} data-testid={testId}>
      <DataGrid
        rows={gridRows}
        columns={columns}
        getRowId={(r) => r.userId}
        loading={loading}
        density="standard"
        getRowHeight={() => 'auto'}
        disableRowSelectionOnClick
        pageSizeOptions={[25, 50, 100]}
        initialState={{ pagination: { paginationModel: { pageSize: 50 } } }}
        localeText={{ noRowsLabel: empty }}
        sx={{ border: 0, '& .MuiDataGrid-cell': { py: 0.75, alignItems: 'center', display: 'flex' } }}
      />
    </Paper>
  );

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1440, mx: 'auto' }}>
      <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 0.5 }} flexWrap="wrap" useFlexGap>
        <AccountBalanceWalletIcon color="primary" />
        <Typography variant="h5" component="h1" fontWeight={700}>
          Collections
        </Typography>
        <Box sx={{ flex: 1 }} />
        <TextField
          select
          size="small"
          label="Academic year"
          value={data?.year ?? yearParam}
          onChange={(e) => setParams({ year: e.target.value })}
          sx={{ minWidth: 170 }}
          inputProps={{ 'data-testid': 'collections-year' }}
          disabled={!data}
        >
          {(data?.years ?? (yearParam ? [yearParam] : [])).map((y) => (
            <MenuItem key={y} value={y}>
              {y} batch{data && y === data.defaultYear ? ' (current)' : ''}
            </MenuItem>
          ))}
          {data?.hasNoYear && <MenuItem value="none">No year set</MenuItem>}
        </TextField>
      </Stack>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2.5 }}>
        Fees agreed, money collected and second installments still to come, for one batch.
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} action={<Button color="inherit" size="small" onClick={() => load()}>Try again</Button>}>
          {error}
        </Alert>
      )}
      {notice && (
        <Alert severity={notice.severity} sx={{ mb: 2 }} onClose={() => setNotice(null)} role="status">
          {notice.text}
        </Alert>
      )}

      {/* Balance payments students sent, waiting for a bank match */}
      <PaymentsToVerifyPanel claims={claims} loading={claimsLoading} onOpen={(id) => setParams({ verify: id })} />

      {/* KPI cards: each one filters Who owes */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' }, gap: 2, mb: 3 }}>
        {!totals
          ? [0, 1, 2, 3].map((i) => <Skeleton key={i} variant="rounded" height={104} />)
          : kpis.map((k) => {
              const active = tab === 'owes' && filter === k.key;
              return (
                <Card
                  key={k.key}
                  variant="outlined"
                  sx={{
                    borderRadius: 1,
                    borderColor: active ? 'primary.main' : 'divider',
                    borderWidth: active ? 2 : 1,
                    transition: 'border-color 150ms',
                  }}
                >
                  <CardActionArea
                    onClick={() => setParams({ tab: null, filter: k.key === 'all' ? null : k.key })}
                    aria-pressed={active}
                    aria-label={`${k.label}: ${k.value}. Show ${FILTER_WORDS[k.key].toLowerCase()}`}
                    data-testid={`kpi-${k.key}`}
                    sx={{ p: 2, height: '100%', '&.Mui-focusVisible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 2 } }}
                  >
                    <Typography variant="body2" color="text.secondary" fontWeight={600}>
                      {k.label}
                    </Typography>
                    <Typography variant="h5" fontWeight={700} sx={{ color: k.tone, mt: 0.5, fontVariantNumeric: 'tabular-nums' }}>
                      {k.value}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {k.sub}
                    </Typography>
                  </CardActionArea>
                </Card>
              );
            })}
      </Box>

      <Paper variant="outlined" sx={{ borderRadius: 1, mb: 2 }}>
        <Tabs
          value={tab}
          onChange={(_, v: TabKey) => setParams({ tab: v === 'owes' ? null : v })}
          variant="scrollable"
          allowScrollButtonsMobile
          aria-label="Collections views"
          sx={{ px: 1, '& .MuiTab-root': { textTransform: 'none', fontWeight: 600, minHeight: 48 } }}
        >
          <Tab value="owes" label={`Who owes${totals ? ` (${rows.filter((r) => (r.balance ?? 0) > 0.01).length})` : ''}`} />
          <Tab value="missing" label={`Missing fee details${totals ? ` (${totals.missingFeeCount})` : ''}`} />
          <Tab value="reports" label={`Student reports${totals ? ` (${reports.length})` : ''}`} />
          <Tab value="checks" label="Checks" />
        </Tabs>
      </Paper>

      <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 1.5 }} flexWrap="wrap" useFlexGap>
        {tab !== 'reports' && (
          <TextField
            size="small"
            label="Search students"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            sx={{ minWidth: 260 }}
          />
        )}
        {tab === 'owes' && filter !== 'all' && (
          <Chip
            label={`Showing: ${FILTER_WORDS[filter]}`}
            onDelete={() => setParams({ filter: null })}
            color="primary"
            variant="outlined"
            sx={{ fontWeight: 600 }}
          />
        )}
      </Stack>

      {tab === 'owes' && grid(owesRows, owesColumns, 'No students match this view.', 'grid-owes')}
      {tab === 'missing' && grid(missingRows, missingColumns, 'Every student in this batch has fee details.', 'grid-missing')}
      {tab === 'checks' && grid(checkRows, checkColumns, 'No students with a fee yet.', 'grid-checks')}
      {tab === 'reports' && (
        <Paper variant="outlined" sx={{ borderRadius: 1 }} data-testid="reports-list">
          {loading && !data ? (
            <Box sx={{ p: 2 }}>
              <Skeleton variant="rounded" height={64} sx={{ mb: 1 }} />
              <Skeleton variant="rounded" height={64} />
            </Box>
          ) : reports.length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ p: 3, textAlign: 'center' }}>
              No open fee reports from students in this batch.
            </Typography>
          ) : (
            reports.map((r, i) => (
              <Box
                key={r.id}
                sx={{ display: 'flex', alignItems: 'center', gap: 2, px: 2, py: 1.5, borderTop: i ? '1px solid' : 'none', borderColor: 'divider' }}
              >
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="body2" fontWeight={600}>
                    {nameOf.get(r.userId) || 'Student'}
                  </Typography>
                  <Typography variant="body2" color="text.secondary" noWrap>
                    {r.note}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Sent {shortDate(r.createdAt)}
                    {r.items.length ? `, ${r.items.length} ${r.items.length === 1 ? 'payment' : 'payments'} listed` : ''}
                  </Typography>
                </Box>
                <Button
                  variant="contained"
                  startIcon={<RateReviewOutlinedIcon />}
                  onClick={() => setReview(r)}
                  sx={{ textTransform: 'none', fontWeight: 600, boxShadow: 'none', minHeight: 44 }}
                >
                  Review
                </Button>
              </Box>
            ))
          )}
        </Paper>
      )}

      <FeeClaimDrawer
        claimId={verifyId}
        studentName={claims.find((c) => c.id === verifyId)?.studentName ?? null}
        adminId={supabaseUserId}
        onClose={() => setParams({ verify: null })}
        onChanged={(_decision, message) => {
          setNotice({ text: message, severity: 'success' });
          void load();
          void loadClaims();
          refreshBadges(true);
        }}
      />
      <RecordPaymentDialog
        open={Boolean(payRow)}
        userId={payRow?.userId ?? null}
        studentName={payRow?.name}
        balance={payRow?.balance}
        onClose={() => setPayRow(null)}
        onSaved={(message) => {
          setPayRow(null);
          setNotice({ text: message, severity: 'success' });
          void load();
        }}
      />
      <ApplicationAndFeesDialog
        open={Boolean(feesUser)}
        userId={feesUser?.userId ?? null}
        prefillPaymentLines={feesUser?.prefill}
        resolvesCorrectionId={feesUser?.reportId ?? null}
        onClose={() => {
          setFeesUser(null);
          void load();
        }}
      />
      <FeeReportReviewDialog
        open={Boolean(review)}
        report={review}
        studentName={review ? nameOf.get(review.userId) : null}
        onClose={() => setReview(null)}
        onAccept={(lines, reportId) => {
          const userId = review?.userId;
          setReview(null);
          if (userId) setFeesUser({ userId, prefill: lines, reportId });
        }}
        onRejected={(message) => {
          setReview(null);
          setNotice({ text: message, severity: 'success' });
          void load();
        }}
      />
    </Box>
  );
}

export default function CollectionsPage() {
  return (
    <Suspense
      fallback={
        <Box sx={{ p: 3 }}>
          <Skeleton variant="text" width={200} height={40} />
          <Skeleton variant="rounded" height={104} sx={{ mt: 2 }} />
        </Box>
      }
    >
      <CollectionsPageInner />
    </Suspense>
  );
}
