'use client';

/**
 * Official QR codes: the images the bank or Google Pay issued for one exact
 * amount (₹25,000, ₹16,500, ...). The student's Pay step shows the official
 * image when one matches the amount due, and draws its own otherwise.
 */
import { Box, Button, IconButton, ImageUploadField, TextField, Tooltip, Typography } from '@neram/ui';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import { FOCUS_RING, TARGET_44 } from '@/components/ops/OpsUi';

export interface QrCodeRow {
  /** Whole rupees as typed; null means "any amount". */
  amount: string;
  url: string;
}

export function qrRowsToSetting(rows: QrCodeRow[]): { amountPaise: number | null; url: string; label: string | null }[] {
  return rows
    .filter((r) => r.url.trim())
    .map((r) => {
      const rupees = Number(String(r.amount).replace(/[^\d.]/g, ''));
      const amountPaise = Number.isFinite(rupees) && rupees > 0 ? Math.round(rupees * 100) : null;
      return { amountPaise, url: r.url.trim(), label: amountPaise ? `₹${Math.round(rupees).toLocaleString('en-IN')}` : 'Any amount' };
    });
}

export function qrSettingToRows(list: { amountPaise: number | null; url: string }[] | undefined): QrCodeRow[] {
  return (list || []).map((q) => ({ amount: q.amountPaise ? String(Math.round(q.amountPaise / 100)) : '', url: q.url }));
}

async function uploadQr(file: File): Promise<{ url: string; path?: string }> {
  const fd = new FormData();
  fd.append('file', file);
  const res = await fetch('/api/settings/payment-qr-codes/upload', { method: 'POST', body: fd });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || 'Upload failed');
  return { url: json.url, path: json.path };
}

export default function PaymentQrCodesField({ rows, onChange, disabled }: { rows: QrCodeRow[]; onChange: (rows: QrCodeRow[]) => void; disabled?: boolean }) {
  const update = (i: number, patch: Partial<QrCodeRow>) => onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const remove = (i: number) => onChange(rows.filter((_, j) => j !== i));

  return (
    <Box sx={{ display: 'grid', gap: 1.5 }}>
      <Typography variant="body2" color="text.secondary">
        Upload the QR image from GPay or the bank for each amount students pay (for example ₹25,000, ₹16,500, ₹13,500). The payment page shows the
        official image when the amount matches, and draws its own QR otherwise. Leave the amount empty for an any-amount QR.
      </Typography>
      {rows.map((row, i) => (
        <Box
          key={i}
          sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '140px 1fr 44px' }, gap: 1, alignItems: 'start', p: 1.5, border: 1, borderColor: 'divider', borderRadius: 2 }}
        >
          <TextField
            label="Amount (₹)"
            value={row.amount}
            onChange={(e) => update(i, { amount: e.target.value.replace(/[^\d]/g, '') })}
            inputProps={{ inputMode: 'numeric', 'aria-label': `Amount for QR ${i + 1}` }}
            disabled={disabled}
            helperText={row.amount ? ' ' : 'Any amount'}
          />
          <ImageUploadField
            value={row.url || null}
            onChange={(url) => update(i, { url: url || '' })}
            upload={uploadQr}
            label={row.url ? 'QR image' : 'Add the QR image'}
            accept="image/png,image/jpeg,image/webp"
            maxSizeMB={2}
            disabled={disabled}
          />
          <Tooltip title="Remove this QR">
            <span>
              <IconButton onClick={() => remove(i)} disabled={disabled} aria-label={`Remove QR ${i + 1}`} sx={{ ...TARGET_44, ...FOCUS_RING }}>
                <DeleteOutlineIcon />
              </IconButton>
            </span>
          </Tooltip>
        </Box>
      ))}
      <Box>
        <Button type="button" variant="outlined" onClick={() => onChange([...rows, { amount: '', url: '' }])} disabled={disabled} sx={{ ...TARGET_44, ...FOCUS_RING, textTransform: 'none' }}>
          Add a QR code
        </Button>
      </Box>
    </Box>
  );
}
