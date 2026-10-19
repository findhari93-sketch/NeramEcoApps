'use client';

/**
 * The presentational pieces both "payment to verify" cards share: the enrolment
 * link card (direct-enrollment/VerifyPaymentCard) and the pay balance card
 * (collections/FeeClaimVerifyCard). Layout and words only, no fetching, so the
 * two cards look and read the same while their data and decisions differ.
 */
import type { ReactNode } from 'react';
import { Box, Button, Typography } from '@neram/ui';
import RefreshIcon from '@mui/icons-material/Refresh';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import PictureAsPdfOutlinedIcon from '@mui/icons-material/PictureAsPdfOutlined';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';

export const METHOD_LABEL: Record<string, string> = {
  upi_direct: 'UPI (GPay, PhonePe, Paytm)',
  bank_transfer: 'Bank transfer (NEFT, IMPS)',
};

export function methodLabel(method: string | null | undefined): string {
  return (method && METHOD_LABEL[method]) || method || 'Not given';
}

export function dateTime(value: string): string {
  return new Date(value).toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'Asia/Kolkata',
  });
}

export function isPdf(url: string): boolean {
  return /\.pdf$/i.test(url.split('?')[0]);
}

export function firstName(name: string | null | undefined): string {
  return (name || '').trim().split(/\s+/)[0] || 'the student';
}

export function Dt({ children }: { children: ReactNode }) {
  return (
    <Typography component="dt" variant="body2" color="text.secondary">
      {children}
    </Typography>
  );
}

export function Dd({ children, strong }: { children: ReactNode; strong?: boolean }) {
  return (
    <Typography component="dd" variant="body2" sx={{ m: 0, fontWeight: strong ? 700 : 500, minWidth: 0, overflowWrap: 'anywhere' }}>
      {children}
    </Typography>
  );
}

/**
 * The screenshot: a thumbnail that opens full size, an Open PDF button, or a
 * dashed box saying there is none (or that the 10-minute link has expired).
 */
export function ProofPreview({
  proofUrl,
  broken,
  onBroken,
  onReload,
  studentName,
}: {
  proofUrl: string | null;
  broken: boolean;
  onBroken: () => void;
  onReload: () => void;
  studentName: string;
}) {
  return (
    <Box>
      {proofUrl && !broken ? (
        isPdf(proofUrl) ? (
          <Button
            component="a"
            href={proofUrl}
            target="_blank"
            rel="noopener noreferrer"
            variant="outlined"
            startIcon={<PictureAsPdfOutlinedIcon />}
            endIcon={<OpenInNewIcon />}
            fullWidth
            sx={{ minHeight: 44, bgcolor: 'background.paper', textTransform: 'none' }}
          >
            Open PDF
          </Button>
        ) : (
          <Box
            component="a"
            href={proofUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Open the payment screenshot full size in a new tab"
            sx={{
              display: 'block',
              height: 180,
              borderRadius: 1.5,
              overflow: 'hidden',
              border: 1,
              borderColor: 'divider',
              bgcolor: 'background.paper',
              '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 2 },
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={proofUrl}
              alt={`Payment screenshot from ${studentName}`}
              onError={onBroken}
              style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top', display: 'block' }}
            />
          </Box>
        )
      ) : (
        <Box
          sx={{
            height: { xs: 'auto', sm: 180 },
            p: 1.5,
            borderRadius: 1.5,
            border: 1,
            borderStyle: 'dashed',
            borderColor: 'divider',
            bgcolor: 'background.paper',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            textAlign: 'center',
            gap: 1,
          }}
        >
          <Typography variant="body2" color="text.secondary">
            {broken ? 'The screenshot link has expired.' : 'No screenshot was sent.'}
          </Typography>
          {broken && (
            <Button size="small" onClick={onReload} startIcon={<RefreshIcon />} sx={{ minHeight: 44, textTransform: 'none' }}>
              Reload
            </Button>
          )}
        </Box>
      )}
      {proofUrl && !broken && !isPdf(proofUrl) && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5, textAlign: 'center' }}>
          Opens full size
        </Typography>
      )}
    </Box>
  );
}

/** The standing instruction under every payment to verify. */
export function BankMatchHint() {
  return (
    <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start', px: 2, py: 1.25, borderTop: 1, borderColor: 'divider', bgcolor: 'background.paper' }}>
      <InfoOutlinedIcon fontSize="small" color="action" sx={{ mt: 0.25 }} aria-hidden />
      <Typography variant="body2" color="text.secondary">
        Match the UTR and amount in the Manoharan Trust KVB statement or GPay history. A screenshot alone is not proof.
      </Typography>
    </Box>
  );
}
