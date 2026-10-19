'use client';

import Link from 'next/link';
import { Box, Paper, Typography, Button } from '@neram/ui';
import { LIFECYCLE_STAGE_LABELS } from '@neram/database';
import PhoneIcon from '@mui/icons-material/Phone';
import WhatsAppIcon from '@mui/icons-material/WhatsApp';
import WhatshotIcon from '@mui/icons-material/Whatshot';
import PhoneDisabledIcon from '@mui/icons-material/PhoneDisabled';
import PaymentsIcon from '@mui/icons-material/Payments';
import { INTEREST_LABELS } from '@neram/database/demo-follow-up';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import TodayIcon from '@mui/icons-material/Today';
import ScheduleIcon from '@mui/icons-material/Schedule';
import PersonOutlineIcon from '@mui/icons-material/PersonOutline';
import SchoolOutlinedIcon from '@mui/icons-material/SchoolOutlined';
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutline';
import { describeDue, formatIstDate, humanizeKey } from '@/lib/ops-format';
import { aintraSessionFromNotes, examYearLabel, followUpKindLabel, followUpSourceLabel } from '@/lib/follow-up-source';
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
  demo_registration_id: string | null;
  interest_level: 'hot' | 'warm' | 'cold' | null;
  flags: string[] | null;
  exam_year?: number | null;
  exam_year_source?: string | null;
  lifecycle_status?: string | null;
  source?: string | null;
}

/** WhatsApp link: the last ten digits get the 91 prefix. */
function waLink(phone: string): string {
  const raw = phone.replace(/\D/g, '');
  // Last ten digits, so 0-prefixed and 91-prefixed numbers both work.
  const digits = raw.length >= 10 ? `91${raw.slice(-10)}` : raw;
  return `https://wa.me/${digits}`;
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

export default function FollowUpRow({
  item,
  now,
  onLogOutcome,
  onSendLink,
  onClose,
}: {
  item: FollowUp;
  now: Date;
  onLogOutcome?: () => void;
  onSendLink?: () => void;
  /** Close a request that has no account (no call to log against). */
  onClose?: () => void;
}) {
  const due = describeDue(item.due_at, now);
  const overdue = item.overdue || due.tone === 'overdue';
  const name = item.person_name || item.person_phone || 'Unnamed caller';
  const stageLabel = item.lifecycle_stage
    ? (LIFECYCLE_STAGE_LABELS as Record<string, string>)[item.lifecycle_stage] || humanizeKey(item.lifecycle_stage)
    : null;
  const attempts = item.attempt_count || 0;
  const examLabel = examYearLabel(item.exam_year, item.exam_year_source);
  const sourceLabel = followUpSourceLabel({
    query_type: item.query_type,
    source: item.source,
    assigned_by_staff: !item.query_type && !item.source && item.status === 'scheduled',
  });
  const chatSession = aintraSessionFromNotes(item.notes);

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
        gridTemplateColumns: { xs: '1fr', md: 'minmax(0,1.6fr) minmax(0,1.3fr) minmax(0,1.8fr) minmax(0,1.2fr) 136px' },
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
          {examLabel && <StatusChip icon={SchoolOutlinedIcon} label={examLabel} />}
          {!item.user_id && <StatusChip icon={PersonOutlineIcon} label="No account" tone="warning" />}
          {item.interest_level && (
            <StatusChip
              icon={WhatshotIcon}
              label={INTEREST_LABELS[item.interest_level]}
              tone={item.interest_level === 'hot' ? 'error' : item.interest_level === 'warm' ? 'warning' : undefined}
            />
          )}
          {item.flags?.includes('hard_to_reach') && <StatusChip icon={PhoneDisabledIcon} label="Hard to reach" tone="warning" />}
          {item.flags?.includes('payment_pending') && <StatusChip icon={PaymentsIcon} label="Payment not received" tone="error" />}
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
          {followUpKindLabel(item.query_type)}
          <Typography component="span" variant="body2" color="text.secondary">
            {`, ${humanizeKey(item.status)}`}
          </Typography>
        </Typography>
        {sourceLabel && (
          <Typography variant="body2" color="text.secondary">
            From: {sourceLabel}
            {chatSession && (
              <>
                {', '}
                <Link href={`/aintra-inbox?c=${encodeURIComponent(chatSession)}&range=all`}>
                  <Typography
                    component="span"
                    variant="body2"
                    sx={{ color: 'primary.main', textDecoration: 'underline', textUnderlineOffset: 2, display: 'inline-flex', alignItems: 'center', gap: 0.5 }}
                  >
                    <ChatBubbleOutlineIcon aria-hidden sx={{ fontSize: 14 }} />
                    open the chat
                  </Typography>
                </Link>
              </>
            )}
          </Typography>
        )}
        {item.demo_registration_id && (
          <Link href={`/demo-classes?id=${item.demo_registration_id}`}>
            <Typography
              component="span"
              variant="body2"
              sx={{ color: 'primary.main', textDecoration: 'underline', textUnderlineOffset: 2 }}
            >
              See the demo
            </Typography>
          </Link>
        )}
        {item.notes && !chatSession && (
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
        {item.person_phone ? (
          <Button
            component="a"
            href={waLink(item.person_phone)}
            target="_blank"
            rel="noopener noreferrer"
            variant="outlined"
            startIcon={<WhatsAppIcon />}
            aria-label={`WhatsApp ${name}`}
            sx={{ ...TARGET_44, ...FOCUS_RING, textTransform: 'none', flex: { xs: 1, md: 'none' } }}
          >
            WhatsApp
          </Button>
        ) : null}
        {onLogOutcome && (
          <Button
            variant="outlined"
            onClick={onLogOutcome}
            aria-label={`Log outcome for ${name}`}
            sx={{ ...TARGET_44, ...FOCUS_RING, textTransform: 'none', flex: { xs: 1, md: 'none' } }}
          >
            Log outcome
          </Button>
        )}
        {onClose && (
          <Button
            variant="outlined"
            color="inherit"
            onClick={onClose}
            aria-label={`Close the request from ${name}`}
            sx={{ ...TARGET_44, ...FOCUS_RING, textTransform: 'none', flex: { xs: 1, md: 'none' } }}
          >
            Close
          </Button>
        )}
        {onSendLink && (
          <Button
            onClick={onSendLink}
            aria-label={`Send enrolment link to ${name}`}
            sx={{ ...TARGET_44, ...FOCUS_RING, textTransform: 'none', flex: { xs: 1, md: 'none' } }}
          >
            Enrolment link
          </Button>
        )}
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
