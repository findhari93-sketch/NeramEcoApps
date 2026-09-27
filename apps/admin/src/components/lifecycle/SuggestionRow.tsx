'use client';

import Link from 'next/link';
import { Box, Paper, Typography, Button, UserAvatar } from '@neram/ui';
import {
  SUGGESTION_LABELS,
  LIFECYCLE_STAGE_LABELS,
  ACTIVITY_SOURCE_LABELS,
  PIPELINE_STAGE_CONFIG,
} from '@neram/database';
import type { SuggestionKind } from '@neram/database';
import PhoneInTalkOutlinedIcon from '@mui/icons-material/PhoneInTalkOutlined';
import Inventory2OutlinedIcon from '@mui/icons-material/Inventory2Outlined';
import LockPersonOutlinedIcon from '@mui/icons-material/LockPersonOutlined';
import SchoolOutlinedIcon from '@mui/icons-material/SchoolOutlined';
import CloseIcon from '@mui/icons-material/Close';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import TaskAltIcon from '@mui/icons-material/TaskAlt';
import { evidenceLines } from '@/lib/lifecycle-evidence';
import { formatIstDate } from '@/lib/ops-format';
import { StatusChip, FOCUS_RING, TARGET_44 } from '@/components/ops/OpsUi';

export interface Suggestion {
  id: string;
  user_id: string;
  kind: SuggestionKind;
  reason: string;
  evidence: Record<string, unknown> | null;
  status: string;
  created_at: string;
  user: { id: string; name: string | null; email: string | null; phone: string | null; avatar_url: string | null; academic_year: string | null } | null;
}

export const KIND_ICON: Record<SuggestionKind, typeof TaskAltIcon> = {
  check_in_student: PhoneInTalkOutlinedIcon,
  archive_lead: Inventory2OutlinedIcon,
  deactivate_account: LockPersonOutlinedIcon,
  graduate_student: SchoolOutlinedIcon,
};

const CRM_STAGE_LABELS: Record<string, string> = Object.fromEntries(
  Object.entries(PIPELINE_STAGE_CONFIG as Record<string, { label: string }>).map(([k, v]) => [k, v.label]),
);

export function personName(s: Suggestion): string {
  const u = s.user;
  if (!u) return 'This person';
  return u.name && u.name !== 'User' ? u.name : u.email || u.phone || 'Unnamed';
}

export default function SuggestionRow({
  item,
  showKind,
  now,
  onAction,
  onMarkDone,
  onDismiss,
}: {
  item: Suggestion;
  showKind: boolean;
  now: Date;
  /** The kind's main action (contacted, archive, turn off sign-in). */
  onAction: (item: Suggestion) => void;
  /** Graduate only: close the suggestion after graduating in Alumni. */
  onMarkDone: (item: Suggestion) => void;
  onDismiss: (item: Suggestion) => void;
}) {
  const name = personName(item);
  const lines = evidenceLines(
    item.evidence,
    { stages: LIFECYCLE_STAGE_LABELS as Record<string, string>, crmStages: CRM_STAGE_LABELS, activitySources: ACTIVITY_SOURCE_LABELS },
    now,
  );
  const label = SUGGESTION_LABELS[item.kind];
  const KindIcon = KIND_ICON[item.kind] || TaskAltIcon;
  const primarySx = { ...TARGET_44, ...FOCUS_RING, textTransform: 'none' as const, flex: { xs: '1 1 auto', md: 'none' } };

  return (
    <Paper
      component="li"
      variant="outlined"
      sx={{
        listStyle: 'none',
        borderRadius: 2,
        p: 1.5,
        display: 'grid',
        gap: { xs: 1.25, md: 2 },
        gridTemplateColumns: { xs: '1fr', md: 'minmax(0,1.3fr) minmax(0,2fr) auto' },
        alignItems: 'start',
      }}
    >
      {/* Person */}
      <Box sx={{ display: 'flex', gap: 1.25, minWidth: 0 }}>
        <UserAvatar src={item.user?.avatar_url} name={name} size={36} tapToView={false} />
        <Box sx={{ minWidth: 0 }}>
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
          <Typography variant="body2" color="text.secondary" sx={{ overflowWrap: 'anywhere' }}>
            {item.user?.email || item.user?.phone || 'No contact on file'}
          </Typography>
          {item.user?.email && item.user?.phone && (
            <Typography variant="body2" color="text.secondary">
              {item.user.phone}
            </Typography>
          )}
        </Box>
      </Box>

      {/* Why */}
      <Box sx={{ minWidth: 0 }}>
        {showKind && (
          <Box sx={{ mb: 0.75 }}>
            <StatusChip icon={KindIcon} label={label?.title || item.kind} tone="info" />
          </Box>
        )}
        <Typography variant="body2" fontWeight={600}>
          {item.reason}
        </Typography>
        {lines.length > 0 && (
          <Box component="dl" sx={{ m: 0, mt: 0.5, display: 'grid', gridTemplateColumns: 'auto 1fr', columnGap: 1.5, rowGap: 0.25 }}>
            {lines.map((l) => (
              <Box key={l.label} sx={{ display: 'contents' }}>
                <Typography component="dt" variant="caption" color="text.secondary" sx={{ lineHeight: 1.7 }}>
                  {l.label}
                </Typography>
                <Typography component="dd" variant="body2" sx={{ m: 0, overflowWrap: 'anywhere' }}>
                  {l.value}
                </Typography>
              </Box>
            ))}
          </Box>
        )}
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
          Suggested {formatIstDate(item.created_at)}
        </Typography>
      </Box>

      {/* Actions */}
      <Box
        sx={{
          display: 'flex',
          flexDirection: { xs: 'row', md: 'column' },
          flexWrap: 'wrap',
          gap: 1,
          alignItems: 'stretch',
          minWidth: { md: 180 },
        }}
      >
        {item.kind === 'graduate_student' ? (
          <>
            <Button component={Link} href="/alumni" variant="contained" startIcon={<SchoolOutlinedIcon />} sx={primarySx}>
              Open Graduate
            </Button>
            <Button variant="outlined" startIcon={<TaskAltIcon />} onClick={() => onMarkDone(item)} sx={primarySx}>
              Mark done
            </Button>
          </>
        ) : (
          <Button
            variant="contained"
            color={item.kind === 'deactivate_account' ? 'error' : 'primary'}
            startIcon={<KindIcon />}
            onClick={() => onAction(item)}
            sx={primarySx}
          >
            {label?.action || 'Accept'}
          </Button>
        )}
        {item.kind === 'check_in_student' && (
          <Button component={Link} href={`/crm/${item.user_id}`} variant="outlined" startIcon={<OpenInNewIcon />} sx={primarySx}>
            Open profile
          </Button>
        )}
        <Button color="inherit" startIcon={<CloseIcon />} onClick={() => onDismiss(item)} sx={primarySx}>
          Dismiss
        </Button>
      </Box>
    </Paper>
  );
}
