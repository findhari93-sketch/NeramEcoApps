'use client';

import Link from 'next/link';
import { Box, Paper, Typography, Button, Divider, UserAvatar } from '@neram/ui';
import { DUPLICATE_REASON_LABELS } from '@neram/database';
import VerifiedIcon from '@mui/icons-material/Verified';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import LinkIcon from '@mui/icons-material/Link';
import MergeTypeIcon from '@mui/icons-material/MergeType';
import PersonOffOutlinedIcon from '@mui/icons-material/PersonOffOutlined';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import DoNotDisturbAltIcon from '@mui/icons-material/DoNotDisturbAlt';
import CompareArrowsIcon from '@mui/icons-material/CompareArrows';
import { formatIstDate } from '@/lib/ops-format';
import { StatusChip, SignInChips, FOCUS_RING, TARGET_44 } from '@/components/ops/OpsUi';
import type { DuplicatePair, CandidatePerson } from './types';

function reasonLabel(reason: string): string {
  return (DUPLICATE_REASON_LABELS as Record<string, string>)[reason] || reason.replace(/_/g, ' ');
}

export function ConfidenceChip({ confidence }: { confidence: 'strong' | 'likely' }) {
  return confidence === 'strong' ? (
    <StatusChip icon={VerifiedIcon} label="Strong match" tone="success" />
  ) : (
    <StatusChip icon={HelpOutlineIcon} label="Likely match" tone="warning" />
  );
}

export function ReasonChip({ reason }: { reason: string }) {
  return <StatusChip icon={LinkIcon} label={reasonLabel(reason)} tone="info" />;
}

function Line({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <Box sx={{ display: 'flex', gap: 1, minWidth: 0 }}>
      <Typography variant="caption" color="text.secondary" sx={{ width: 92, flexShrink: 0, lineHeight: 1.7 }}>
        {label}
      </Typography>
      <Typography
        variant="body2"
        sx={{ minWidth: 0, overflowWrap: 'anywhere', color: value ? 'text.primary' : 'text.secondary' }}
      >
        {value || 'Not set'}
      </Typography>
    </Box>
  );
}

function PersonColumn({ person, side }: { person: CandidatePerson | null; side: string }) {
  if (!person) {
    return (
      <Box sx={{ flex: 1, minWidth: 0, p: 1.5, borderRadius: 1.5, bgcolor: 'action.hover' }}>
        <StatusChip icon={PersonOffOutlinedIcon} label={`Record ${side} no longer exists`} tone="warning" />
      </Box>
    );
  }
  const name = person.name && person.name !== 'User' ? person.name : person.phone || person.email || 'Unnamed';
  return (
    <Box sx={{ flex: 1, minWidth: 0, p: 1.5, borderRadius: 1.5, bgcolor: 'action.hover' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1, minWidth: 0 }}>
        <UserAvatar src={person.avatar_url} name={name} size={32} tapToView={false} />
        <Box sx={{ minWidth: 0 }}>
          <Link href={`/crm/${person.id}`} style={{ display: 'inline-block', maxWidth: '100%' }}>
            <Typography
              component="span"
              variant="body2"
              fontWeight={700}
              sx={{
                display: 'block',
                overflowWrap: 'anywhere',
                color: 'primary.main',
                textDecoration: 'underline',
                textUnderlineOffset: 2,
              }}
            >
              {name}
            </Typography>
          </Link>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', textTransform: 'capitalize' }}>
            {(person.user_type || 'user').replace(/_/g, ' ')}
            {person.academic_year ? `, batch ${person.academic_year}` : ''}
          </Typography>
        </Box>
      </Box>
      <Line label="Email" value={person.email} />
      {person.personal_email && <Line label="Personal email" value={person.personal_email} />}
      <Line label="Phone" value={person.phone} />
      <Line label="Created" value={formatIstDate(person.created_at)} />
      <Line label="Last sign-in" value={person.last_login_at ? formatIstDate(person.last_login_at) : 'Never signed in'} />
      <Box sx={{ mt: 1 }}>
        <SignInChips person={person} />
      </Box>
    </Box>
  );
}

export default function PairCard({
  pair,
  onReview,
  onDismiss,
}: {
  pair: DuplicatePair;
  onReview: (pair: DuplicatePair) => void;
  onDismiss: (pair: DuplicatePair) => void;
}) {
  const bothExist = !!pair.a && !!pair.b;
  return (
    <Paper component="article" variant="outlined" sx={{ borderRadius: 2, overflow: 'hidden' }} aria-label="Possible duplicate pair">
      <Box
        sx={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: 1,
          px: 2,
          py: 1.25,
          borderBottom: '1px solid',
          borderColor: 'divider',
        }}
      >
        <ReasonChip reason={pair.reason} />
        <ConfidenceChip confidence={pair.confidence} />
        {pair.status === 'merged' && <StatusChip icon={CheckCircleOutlineIcon} label="Merged" tone="success" />}
        {pair.status === 'dismissed' && <StatusChip icon={DoNotDisturbAltIcon} label="Not the same person" />}
        <Typography variant="caption" color="text.secondary" sx={{ ml: { sm: 'auto' } }}>
          Found {formatIstDate(pair.detected_at)}
          {pair.resolved_at ? `, closed ${formatIstDate(pair.resolved_at)}` : ''}
        </Typography>
      </Box>

      <Box
        sx={{
          display: 'flex',
          flexDirection: { xs: 'column', md: 'row' },
          alignItems: 'stretch',
          gap: 1,
          p: 1.5,
        }}
      >
        <PersonColumn person={pair.a} side="A" />
        <Box
          aria-hidden
          sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'text.secondary', py: { xs: 0, md: 0 } }}
        >
          <CompareArrowsIcon sx={{ transform: { xs: 'rotate(90deg)', md: 'none' } }} />
        </Box>
        <PersonColumn person={pair.b} side="B" />
      </Box>

      {pair.note && (
        <Box sx={{ px: 2, pb: 1.5 }}>
          <Typography variant="body2" color="text.secondary">
            Note: {pair.note}
          </Typography>
        </Box>
      )}

      {pair.status === 'open' && (
        <>
          <Divider />
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, px: 2, py: 1.25, justifyContent: 'flex-end' }}>
            <Button
              variant="outlined"
              color="inherit"
              startIcon={<PersonOffOutlinedIcon />}
              onClick={() => onDismiss(pair)}
              sx={{ ...TARGET_44, ...FOCUS_RING, textTransform: 'none', flex: { xs: '1 1 100%', sm: '0 0 auto' } }}
            >
              Not the same person
            </Button>
            {bothExist && (
              <Button
                variant="contained"
                startIcon={<MergeTypeIcon />}
                onClick={() => onReview(pair)}
                sx={{ ...TARGET_44, ...FOCUS_RING, textTransform: 'none', flex: { xs: '1 1 100%', sm: '0 0 auto' } }}
              >
                Review and merge
              </Button>
            )}
          </Box>
        </>
      )}
    </Paper>
  );
}
