'use client';

import { Box, Typography } from '@neram/ui';
import VerifiedIcon from '@mui/icons-material/Verified';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import PhoneIphoneOutlinedIcon from '@mui/icons-material/PhoneIphoneOutlined';
import WindowOutlinedIcon from '@mui/icons-material/WindowOutlined';
import type { User360 } from '@neram/database';
import { IDENTITY_PROVIDER_LABELS, relativeTime, formatDate } from '@/lib/user360-view';
import { EmptyNote } from './shared';

/**
 * Every sign-in the person has, with a verified marker. Reads user_identities;
 * falls back to the has_firebase / has_microsoft flags when that table has no
 * row yet (people who have not signed in since identities were recorded).
 */
export default function IdentityList({ data, compact }: { data: User360; compact?: boolean }) {
  const p = data.person || {};
  const rows = data.identities || [];
  const fallback: Array<{ provider: string; label: string }> = [];
  if (!rows.length) {
    if (p.has_firebase || p.firebase_uid) fallback.push({ provider: 'firebase', label: IDENTITY_PROVIDER_LABELS.firebase });
    if (p.has_microsoft || p.ms_oid) fallback.push({ provider: 'microsoft', label: IDENTITY_PROVIDER_LABELS.microsoft });
  }

  const verifiedRow = (ok: boolean, text: string) => (
    <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
      {ok ? (
        <VerifiedIcon sx={{ fontSize: 16, color: 'success.main' }} aria-hidden />
      ) : (
        <HelpOutlineIcon sx={{ fontSize: 16, color: 'text.secondary' }} aria-hidden />
      )}
      <Typography variant="body2" color={ok ? 'success.dark' : 'text.secondary'}>
        {text}
      </Typography>
    </Box>
  );

  return (
    <Box sx={{ display: 'grid', gap: 1.25 }}>
      {rows.map((r: any) => {
        const Icon = r.provider === 'microsoft' ? WindowOutlinedIcon : PhoneIphoneOutlinedIcon;
        const identifier = r.email || r.phone || r.provider_uid;
        const emailVerified = r.email && p.email && String(r.email).toLowerCase() === String(p.email).toLowerCase() && p.email_verified;
        const phoneVerified = r.phone && p.phone_verified;
        const isMicrosoft = r.provider === 'microsoft';
        return (
          <Box key={`${r.provider}:${r.provider_uid}`} sx={{ display: 'flex', gap: 1.25, alignItems: 'flex-start' }}>
            <Icon sx={{ fontSize: 22, color: 'text.secondary', mt: 0.25 }} aria-hidden />
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                {IDENTITY_PROVIDER_LABELS[r.provider] || r.provider}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ wordBreak: 'break-all' }}>
                {identifier}
              </Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', columnGap: 1.5 }}>
                {isMicrosoft
                  ? verifiedRow(true, 'Verified by Microsoft')
                  : verifiedRow(Boolean(emailVerified || phoneVerified), emailVerified || phoneVerified ? 'Verified' : 'Not verified')}
                {!compact && (
                  <Typography variant="caption" color="text.secondary" sx={{ alignSelf: 'center' }}>
                    Added {formatDate(r.created_at)}
                    {r.last_used_at ? `, last used ${relativeTime(r.last_used_at)}` : ''}
                  </Typography>
                )}
              </Box>
            </Box>
          </Box>
        );
      })}
      {fallback.map((f) => (
        <Box key={f.provider} sx={{ display: 'flex', gap: 1.25, alignItems: 'flex-start' }}>
          {f.provider === 'microsoft' ? (
            <WindowOutlinedIcon sx={{ fontSize: 22, color: 'text.secondary', mt: 0.25 }} aria-hidden />
          ) : (
            <PhoneIphoneOutlinedIcon sx={{ fontSize: 22, color: 'text.secondary', mt: 0.25 }} aria-hidden />
          )}
          <Box>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              {f.label}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Linked on the account. No sign-in recorded since identities were tracked.
            </Typography>
          </Box>
        </Box>
      ))}
      {!rows.length && !fallback.length && <EmptyNote>No sign-in method on record.</EmptyNote>}
    </Box>
  );
}
