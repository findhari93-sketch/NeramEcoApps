'use client';

/**
 * Where a message actually landed, and why it did not land anywhere else.
 *
 * The receipt this replaces said "Reached nobody 3" about three students who
 * were skipped on purpose (they are marked dormant), and said nothing at all
 * about why 23 students got no Teams chat, no Teams alert and no email. So:
 *   - a deliberate skip is its own neutral count, with the names;
 *   - "Reached nobody" counts only real failures;
 *   - every channel that failed says why, once, with how many it hit;
 *   - "Who got what" lists every student, collapsed on a phone.
 */

import { useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  Collapse,
  Divider,
  Typography,
  useMediaQuery,
  useTheme,
} from '@neram/ui';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import { formatReopenUntil } from '@/lib/reopen-deadline';

export interface DeliveryResult {
  studentId: string;
  name: string | null;
  chat: boolean;
  teams: boolean;
  inapp: boolean;
  email: boolean;
  ok: boolean;
  channel: string;
}

export interface DeliveryReceiptData {
  counts: {
    total: number;
    chat: number;
    teams: number;
    inapp: number;
    email: number;
    failed: number;
    skipped?: number;
    unreached?: number;
    group?: { channel: boolean; chat: boolean; errors: string[]; unconfigured: boolean };
  };
  results?: DeliveryResult[];
  reopened?: number;
  closes_at?: string | null;
  skipped_dormant?: Array<{ id: string; name: string | null }>;
  reasons?: Record<'chat' | 'teams' | 'email', Array<{ reason: string; count: number }>> | null;
  graph_skipped?: boolean;
}

const TIER_LABELS: Record<'chat' | 'teams' | 'email', string> = {
  chat: 'Teams chat',
  teams: 'Teams alert',
  email: 'Email',
};

function channelsOf(r: DeliveryResult): string[] {
  return [
    r.chat ? 'Teams chat' : '',
    r.teams ? 'Teams alert' : '',
    r.inapp ? 'Nexus' : '',
    r.email ? 'Email' : '',
  ].filter(Boolean);
}

export default function DeliveryReceipt({ data }: { data: DeliveryReceiptData }) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const [listOpen, setListOpen] = useState(!isMobile);

  const { counts } = data;
  const skipped = counts.skipped ?? data.skipped_dormant?.length ?? 0;
  const unreached = counts.unreached ?? Math.max(0, counts.failed - skipped);
  const reopened = data.reopened ?? 0;
  const results = data.results ?? [];

  return (
    <Box>
      <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 0.5 }}>
        {reopened > 0 && data.closes_at
          ? `Reopened for ${reopened} until ${formatReopenUntil(data.closes_at)}`
          : `Sent to ${counts.total - skipped} student${counts.total - skipped === 1 ? '' : 's'}`}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
        Here is where it actually landed.
      </Typography>

      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2 }}>
        <Chip label={`Teams chat ${counts.chat}`} color={counts.chat ? 'success' : 'default'} />
        <Chip label={`Teams alert ${counts.teams}`} color={counts.teams ? 'success' : 'default'} />
        <Chip label={`Nexus bell ${counts.inapp}`} color={counts.inapp ? 'success' : 'default'} />
        {counts.email > 0 && <Chip label={`Email ${counts.email}`} color="info" />}
        {skipped > 0 && <Chip label={`Skipped (dormant) ${skipped}`} variant="outlined" />}
        {unreached > 0 && <Chip label={`Reached nobody ${unreached}`} color="error" />}
      </Box>

      {data.graph_skipped && (
        <Alert severity="info" sx={{ mb: 1.5 }}>
          This session cannot post to Teams as you, so the Teams chat and the class post were skipped.
          Sign in with Microsoft again and send once more.
        </Alert>
      )}

      {counts.group && (
        <Alert severity={counts.group.channel || counts.group.chat ? 'success' : 'warning'} sx={{ mb: 1.5 }}>
          {counts.group.unconfigured
            ? 'This classroom has no Teams channel or group chat set up, so the class post was skipped.'
            : counts.group.channel || counts.group.chat
              ? `Posted to the class ${[counts.group.channel && 'channel', counts.group.chat && 'group chat']
                  .filter(Boolean)
                  .join(' and ')}.`
              : `The class post did not land. ${counts.group.errors.join('; ')}`}
        </Alert>
      )}

      {(['chat', 'teams', 'email'] as const).map((tier) =>
        (data.reasons?.[tier] ?? []).map((r) => (
          <Alert key={`${tier}:${r.reason}`} severity="warning" sx={{ mb: 1.5 }}>
            {TIER_LABELS[tier]} did not send for {r.count}: {r.reason}
          </Alert>
        )),
      )}

      {skipped > 0 && (
        <Typography variant="body2" sx={{ mb: 1.5 }}>
          Skipped because they are marked dormant:{' '}
          {(data.skipped_dormant ?? []).map((s) => s.name || 'Unknown').join(', ')}.
        </Typography>
      )}

      {results.length > 0 && (
        <>
          <Divider sx={{ my: 1 }} />
          <Button
            onClick={() => setListOpen((v) => !v)}
            aria-expanded={listOpen}
            endIcon={listOpen ? <ExpandLessIcon /> : <ExpandMoreIcon />}
            sx={{ textTransform: 'none', minHeight: 44, px: 0 }}
          >
            Who got what
          </Button>
          <Collapse in={listOpen} timeout={reducedMotion ? 0 : 'auto'}>
            <Box component="ul" sx={{ listStyle: 'none', p: 0, m: 0 }}>
              {results.map((r) => {
                const landed = channelsOf(r);
                return (
                  <Box
                    component="li"
                    key={r.studentId}
                    sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', py: 0.75, minHeight: 44 }}
                  >
                    <Typography variant="body2" sx={{ fontWeight: 600, flex: '1 1 160px' }}>
                      {r.name || 'Unknown student'}
                    </Typography>
                    {r.channel === 'dormant' ? (
                      <Typography variant="caption" color="text.secondary">
                        Skipped, marked dormant
                      </Typography>
                    ) : landed.length === 0 ? (
                      <Chip size="small" color="error" label="Reached nobody" />
                    ) : (
                      landed.map((c) => <Chip key={c} size="small" variant="outlined" label={c} />)
                    )}
                  </Box>
                );
              })}
            </Box>
          </Collapse>
        </>
      )}
    </Box>
  );
}
