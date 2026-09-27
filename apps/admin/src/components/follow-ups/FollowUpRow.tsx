'use client';

import Link from 'next/link';
import { Box, Paper, Typography, Button } from '@neram/ui';
import { LIFECYCLE_STAGE_LABELS } from '@neram/database';
import PhoneIcon from '@mui/icons-material/Phone';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import TodayIcon from '@mui/icons-material/Today';
import ScheduleIcon from '@mui/icons-material/Schedule';
import PersonOutlineIcon from '@mui/icons-material/PersonOutline';
import { describeDue, formatIstDate, humanizeKey } from '@/lib/ops-format';
import { StatusChip, FOCUS_RING, TARGET_44 } from '@/components/ops/OpsUi';

export interface FollowUp {
  callback_id: string;
  user_id: string | null;
  person_name: string | null;
  person_phone: string | null;
  status: string;
  due_at: string | null;
  preferred_slot: string | null;
  query_type: string | null;
  notes: string | null;
  attempt_count: number | null;
  last_attempt_at: string | null;
  assigned_to: string | null;
  assigned_to_name: string | null;
  crm_owner_id: string | null;
  owner_name: string | null;
  lifecycle_stage: string | null;
  crm_stage: string | null;
  contacted_status: string | null;
  overdue: boolean;
}

/** Digits and a leading + only, for a tel: link. */
function telHref(phone: string): string {
  const cleaned = phone.replace(/[^\d+]/g, '');
  return `tel:${cleaned}`;
}

function Label({ children }: { children: string }) {
  return (
    <Typography variant="caption" color="text.secondary" sx={{ display: { xs: 'block', md: 'none' }, fontWeight: 600 }}>
      {children}
    </Typography>
  );
}

export default function FollowUpRow({ item, now }: { item: FollowUp; now: Date }) {
  const due = describeDue(item.due_at, now);
  const overdue = item.overdue || due.tone === 'overdue';
  const name = item.person_name || item.person_phone || 'Unnamed caller';
  const stageLabel = item.lifecycle_stage
    ? (LIFECYCLE_STAGE_LABELS as Record<string, string>)[item.lifecycle_stage] || humanizeKey(item.lifecycle_stage)
    : null;
  const attempts = item.attempt_count || 0;

  return (
    <Paper
      component="li"
      variant="outlined"
      sx={{
        listStyle: 'none',
        borderRadius: 2,
        p: 1.5,
        borderLeft: '4px solid',
        borderLeftColor: overdue ? 'error.main' : due.tone === 'today' ? 'warning.main' : 'divider',
        display: 'grid',
        gap: { xs: 1.25, md: 2 },
        gridTemplateColumns: { xs: '1fr', md: 'minmax(0,1.6fr) minmax(0,1.3fr) minmax(0,1.8fr) minmax(0,1.2fr) 104px' },
        alignItems: 'start',
      }}
    >
      {/* Person */}
      <Box sx={{ minWidth: 0 }}>
        {item.user_id ? (
          <Link href={`/crm/${item.user_id}`}>
            <Typography
              component="span"
              variant="body2"
              fontWeight={700}
              sx={{ color: 'primary.main', textDecoration: 'underline', textUnderlineOffset: 2, overflowWrap: 'anywhere' }}
            >
              {name}
            </Typography>
          </Link>
        ) : (
          <Typography variant="body2" fontWeight={700} sx={{ overflowWrap: 'anywhere' }}>
            {name}
          </Typography>
        )}
        <Typography variant="body2" color="text.secondary" sx={{ fontVariantNumeric: 'tabular-nums' }}>
          {item.person_phone || 'No phone on file'}
        </Typography>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 0.5 }}>
          {stageLabel && <StatusChip icon={PersonOutlineIcon} label={stageLabel} />}
          {!item.user_id && <StatusChip icon={PersonOutlineIcon} label="No account" tone="warning" />}
        </Box>
      </Box>

      {/* Due */}
      <Box sx={{ minWidth: 0 }}>
        <Label>Due</Label>
        <Box sx={{ mb: 0.5 }}>
          {overdue ? (
            <StatusChip icon={ErrorOutlineIcon} label="Overdue" tone="error" />
          ) : due.tone === 'today' ? (
            <StatusChip icon={TodayIcon} label="Due today" tone="warning" />
          ) : (
            <StatusChip icon={ScheduleIcon} label="Upcoming" />
          )}
        </Box>
        <Typography variant="body2">{due.text}</Typography>
        {item.preferred_slot && (
          <Typography variant="caption" color="text.secondary">
            Prefers: {humanizeKey(item.preferred_slot)}
          </Typography>
        )}
      </Box>

      {/* Request */}
      <Box sx={{ minWidth: 0 }}>
        <Label>Request</Label>
        <Typography variant="body2" fontWeight={600}>
          {item.query_type ? humanizeKey(item.query_type) : 'Callback'}
          <Typography component="span" variant="body2" color="text.secondary">
            {`, ${humanizeKey(item.status)}`}
          </Typography>
        </Typography>
        {item.notes && (
          <Typography
            variant="body2"
            color="text.secondary"
            title={item.notes}
            sx={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', overflowWrap: 'anywhere' }}
          >
            {item.notes}
          </Typography>
        )}
        <Typography variant="caption" color="text.secondary">
          {attempts === 0
            ? 'Not called yet'
            : `${attempts} ${attempts === 1 ? 'attempt' : 'attempts'}${item.last_attempt_at ? `, last on ${formatIstDate(item.last_attempt_at)}` : ''}`}
        </Typography>
      </Box>

      {/* Owner and assignee */}
      <Box sx={{ minWidth: 0 }}>
        <Label>Staff</Label>
        <Typography variant="body2" sx={{ overflowWrap: 'anywhere' }}>
          <Typography component="span" variant="body2" color="text.secondary">
            Owner:{' '}
          </Typography>
          {item.owner_name || 'None'}
        </Typography>
        <Typography variant="body2" sx={{ overflowWrap: 'anywhere' }}>
          <Typography component="span" variant="body2" color="text.secondary">
            Calling:{' '}
          </Typography>
          {item.assigned_to_name || 'Not assigned'}
        </Typography>
      </Box>

      {/* Actions */}
      <Box sx={{ display: 'flex', gap: 1, flexDirection: { xs: 'row', md: 'column' }, alignItems: 'stretch' }}>
        {item.person_phone ? (
          <Button
            component="a"
            href={telHref(item.person_phone)}
            variant="contained"
            startIcon={<PhoneIcon />}
            aria-label={`Call ${name}`}
            sx={{ ...TARGET_44, ...FOCUS_RING, textTransform: 'none', flex: { xs: 1, md: 'none' } }}
          >
            Call
          </Button>
        ) : null}
        {item.user_id && (
          <Button
            component={Link}
            href={`/crm/${item.user_id}`}
            variant="outlined"
            startIcon={<OpenInNewIcon />}
            aria-label={`Open ${name}`}
            sx={{ ...TARGET_44, ...FOCUS_RING, textTransform: 'none', flex: { xs: 1, md: 'none' } }}
          >
            Open
          </Button>
        )}
      </Box>
    </Paper>
  );
}
