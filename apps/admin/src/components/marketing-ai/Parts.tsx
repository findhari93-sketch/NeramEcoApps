'use client';

/**
 * Small shared pieces for the Marketing Intelligence screens: KPI card, the
 * confirm dialog every live change goes through, the evidence table, and the
 * admin-only notice. Colours come from the @neram/ui theme palette only.
 */
import { useState, type ReactNode } from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@neram/ui';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import RemoveIcon from '@mui/icons-material/Remove';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import { EmptyState, StatusChip, TARGET_44 } from '@/components/ops/OpsUi';
import { inr, num, pct } from './format';

/**
 * A metric with its change against the previous period. `goodWhen` says which
 * direction is good, because CPA going up is bad while conversions going up is
 * good. The change is arrow plus text plus colour, never colour alone.
 */
export function KpiCard({ label, value, change, goodWhen, previous }: { label: string; value: string; change: number | null; goodWhen: 'up' | 'down' | 'none'; previous: string }) {
  const flat = change === null || Math.abs(change) < 0.5;
  const good = !flat && goodWhen !== 'none' && (goodWhen === 'up' ? change! > 0 : change! < 0);
  const tone = flat || goodWhen === 'none' ? 'neutral' : good ? 'success' : 'error';
  const Icon = flat ? RemoveIcon : change! > 0 ? ArrowUpwardIcon : ArrowDownwardIcon;
  return (
    <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, minWidth: 0 }}>
      <Typography variant="body2" color="text.secondary" fontWeight={600}>
        {label}
      </Typography>
      <Typography variant="h5" component="p" fontWeight={700} sx={{ mt: 0.5, fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </Typography>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1, flexWrap: 'wrap' }}>
        <StatusChip icon={Icon} tone={tone} label={change === null ? 'No baseline' : `${change > 0 ? '+' : ''}${change.toFixed(1)}%`} />
        <Typography variant="caption" color="text.secondary">
          was {previous}
        </Typography>
      </Box>
    </Paper>
  );
}

export interface EvidenceRow {
  key: string;
  label: string;
  impressions: number;
  clicks: number;
  cost: number;
  conversions: number;
  ctr: number | null;
  cpc: number | null;
  cpa: number | null;
}

/** The observed numbers behind a recommendation, straight from Google Ads data. */
export function EvidenceTable({ evidence }: { evidence: { window: { from: string; to: string; days: number }; rows: EvidenceRow[]; facts?: Record<string, unknown> } }) {
  return (
    <Box>
      <Paper variant="outlined" sx={{ overflowX: 'auto' }}>
        <Table size="small" aria-label="Observed Google Ads data">
          <TableHead>
            <TableRow>
              <TableCell>Item</TableCell>
              <TableCell align="right">Clicks</TableCell>
              <TableCell align="right">Cost</TableCell>
              <TableCell align="right">Conv.</TableCell>
              <TableCell align="right">CTR</TableCell>
              <TableCell align="right">CPC</TableCell>
              <TableCell align="right">CPA</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {evidence.rows.map((r) => (
              <TableRow key={r.key + r.label}>
                <TableCell sx={{ maxWidth: 220, wordBreak: 'break-word' }}>{r.label}</TableCell>
                <TableCell align="right">{num(r.clicks)}</TableCell>
                <TableCell align="right">{inr(r.cost)}</TableCell>
                <TableCell align="right">{num(r.conversions, 1)}</TableCell>
                <TableCell align="right">{pct(r.ctr)}</TableCell>
                <TableCell align="right">{inr(r.cpc)}</TableCell>
                <TableCell align="right">{r.cpa === null ? 'none' : inr(r.cpa)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Paper>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.75 }}>
        {evidence.window.from} to {evidence.window.to} ({evidence.window.days} days), from Google Ads.
        {evidence.facts &&
          Object.entries(evidence.facts)
            .filter(([, v]) => v !== null && v !== undefined)
            .map(([k, v]) => ` ${k.replace(/_/g, ' ')}: ${typeof v === 'number' && /inr|cpa|budget|cap/.test(k) ? inr(v) : String(v)}.`)
            .join('')}
      </Typography>
    </Box>
  );
}

/**
 * Every live change and every undo is confirmed here first. `withNote` adds an
 * optional reason field (used for rejections, so the record says why).
 */
export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  tone = 'primary',
  withNote,
  notePlaceholder,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  title: string;
  body: ReactNode;
  confirmLabel: string;
  tone?: 'primary' | 'error' | 'warning';
  withNote?: boolean;
  notePlaceholder?: string;
  onCancel: () => void;
  onConfirm: (note: string) => Promise<void>;
}) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const close = () => {
    if (busy) return;
    setNote('');
    setError(null);
    onCancel();
  };
  return (
    <Dialog open={open} onClose={close} maxWidth="sm" fullWidth aria-labelledby="mi-confirm-title">
      <DialogTitle id="mi-confirm-title">{title}</DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'grid', gap: 2 }}>
          <Box>{body}</Box>
          {withNote && (
            <TextField label="Reason (optional)" placeholder={notePlaceholder} value={note} onChange={(e) => setNote(e.target.value)} multiline minRows={2} fullWidth inputProps={{ maxLength: 500 }} />
          )}
          {error && <Alert severity="error">{error}</Alert>}
        </Box>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={close} disabled={busy} sx={TARGET_44}>
          Cancel
        </Button>
        <Button
          variant="contained"
          color={tone}
          disabled={busy}
          sx={TARGET_44}
          startIcon={busy ? <CircularProgress size={16} color="inherit" /> : undefined}
          onClick={async () => {
            setBusy(true);
            setError(null);
            try {
              await onConfirm(note.trim());
              setNote('');
            } catch (e: any) {
              setError(e?.message || 'Something went wrong');
            } finally {
              setBusy(false);
            }
          }}
        >
          {confirmLabel}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

/** Shown in place of a page when a teacher (or anyone not an admin) opens it. */
export function AdminOnly() {
  return <EmptyState icon={LockOutlinedIcon} title="Admins only" body="Marketing Intelligence shows ad spend and can change Google Ads campaigns, so it is open to admin accounts only." />;
}

/** Banner for mock mode and for live mode with changes switched off. */
export function ModeBanner({ mode, mutationsAllowed, missing }: { mode: 'mock' | 'live'; mutationsAllowed: boolean; missing: string[] }) {
  if (mode === 'mock')
    return (
      <Alert severity="info" sx={{ mb: 2 }}>
        Showing a sample account. Connect Google Ads by setting GOOGLE_ADS_MODE=live and the credentials in docs/marketing-intelligence/README.md. Changes here never reach Google.
      </Alert>
    );
  if (missing.length)
    return (
      <Alert severity="error" sx={{ mb: 2 }}>
        Google Ads is not connected. Missing: {missing.join(', ')}.
      </Alert>
    );
  if (!mutationsAllowed)
    return (
      <Alert severity="warning" sx={{ mb: 2 }}>
        Live data, dry runs only. Approved changes are checked by Google but not applied, because MARKETING_AI_ALLOW_MUTATIONS is off in this environment.
      </Alert>
    );
  return null;
}
