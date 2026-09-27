'use client';

import Link from 'next/link';
import { Box, Button, Paper, Typography, Tooltip, UserAvatar } from '@neram/ui';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import EditIcon from '@mui/icons-material/Edit';
import NoteAddIcon from '@mui/icons-material/NoteAdd';
import PersonAddAltOutlinedIcon from '@mui/icons-material/PersonAddAltOutlined';
import WhatsAppIcon from '@mui/icons-material/WhatsApp';
import EmailOutlinedIcon from '@mui/icons-material/EmailOutlined';
import PhoneOutlinedIcon from '@mui/icons-material/PhoneOutlined';
import VerifiedIcon from '@mui/icons-material/Verified';
import ScheduleIcon from '@mui/icons-material/Schedule';
import BlockIcon from '@mui/icons-material/Block';
import BadgeOutlinedIcon from '@mui/icons-material/BadgeOutlined';
import ContentCopyOutlinedIcon from '@mui/icons-material/ContentCopyOutlined';
import LightbulbOutlinedIcon from '@mui/icons-material/LightbulbOutlined';
import SupervisorAccountOutlinedIcon from '@mui/icons-material/SupervisorAccountOutlined';
import CopyablePhone from '@/components/CopyablePhone';
import {
  LIFECYCLE_STAGE_LABELS,
  LIFECYCLE_STAGE_MEANINGS,
  ENGAGEMENT_LABELS,
  ACTIVITY_SOURCE_LABELS,
} from '@neram/database';
import type { User360, LifecycleStage, EngagementState } from '@neram/database';
import { lastActiveText, suggestionLabel, sentenceCase } from '@/lib/user360-view';
import { StatusChip } from './shared';
import { LIFECYCLE_ICONS, LIFECYCLE_TONES, ENGAGEMENT_ICONS, ENGAGEMENT_TONES } from './status-icons';

interface User360HeaderProps {
  data: User360;
  backHref: string;
  backLabel: string;
  onEdit: () => void;
  onAssign: () => void;
  onAddNote: () => void;
  editDisabled?: boolean;
}

const actionSx = { textTransform: 'none', fontWeight: 600, minHeight: 44, borderRadius: 1 } as const;

function whatsappHref(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 10) return null;
  return `https://wa.me/${digits.length === 10 ? `91${digits}` : digits}`;
}

export default function User360Header({
  data,
  backHref,
  backLabel,
  onEdit,
  onAssign,
  onAddNote,
  editDisabled,
}: User360HeaderProps) {
  const p = data.person || {};
  const stage = p.lifecycle_stage as LifecycleStage | undefined;
  const engagement = p.engagement as EngagementState | undefined;
  const isDeactivated = p.account_status === 'deactivated' || p.is_disabled === true;
  const StageIcon = stage ? LIFECYCLE_ICONS[stage] : BadgeOutlinedIcon;
  const EngIcon = engagement ? ENGAGEMENT_ICONS[engagement] : null;
  const wa = whatsappHref(p.phone);
  const owner = data.crm?.owner;

  return (
    <Paper
      elevation={0}
      sx={{ border: '1px solid', borderColor: 'grey.200', borderRadius: 1, p: { xs: 1.5, md: 2 }, pb: 1, minWidth: 0 }}
    >
      <Button
        component={Link}
        href={backHref}
        startIcon={<ArrowBackIcon />}
        size="small"
        sx={{ ...actionSx, color: 'text.secondary', mb: 1, px: 1 }}
      >
        {backLabel}
      </Button>

      <Box sx={{ display: 'flex', gap: 2, alignItems: 'flex-start', flexWrap: { xs: 'wrap', md: 'nowrap' } }}>
        <UserAvatar src={p.avatar_url} name={p.name} size={56} />

        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography component="h1" variant="h5" sx={{ fontWeight: 700, lineHeight: 1.25, wordBreak: 'break-word' }}>
            {p.name || 'Unnamed user'}
          </Typography>

          {/* Status row: each one is an icon plus words */}
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, mt: 0.75, alignItems: 'center' }}>
            {stage ? (
              <Tooltip title={LIFECYCLE_STAGE_MEANINGS[stage]} arrow>
                <Box component="span" sx={{ display: 'inline-flex', maxWidth: '100%' }}>
                  <StatusChip icon={<StageIcon />} label={LIFECYCLE_STAGE_LABELS[stage]} tone={LIFECYCLE_TONES[stage]} />
                </Box>
              </Tooltip>
            ) : (
              <StatusChip icon={<BadgeOutlinedIcon />} label={sentenceCase(String(p.user_type || 'user'))} tone="neutral" />
            )}
            {isDeactivated && <StatusChip icon={<BlockIcon />} label="Deactivated" tone="error" />}
            {engagement && EngIcon && (
              <StatusChip icon={<EngIcon />} label={ENGAGEMENT_LABELS[engagement]} tone={ENGAGEMENT_TONES[engagement]} />
            )}
            <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, color: 'text.secondary', minWidth: 0 }}>
              <ScheduleIcon sx={{ fontSize: 16 }} aria-hidden />
              <Typography variant="body2" color="text.secondary">
                Last active: {lastActiveText(p.last_meaningful_activity_at ?? p.last_login_at, p.last_meaningful_activity_source, ACTIVITY_SOURCE_LABELS)}
              </Typography>
            </Box>
          </Box>

          {stage && (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              {LIFECYCLE_STAGE_MEANINGS[stage]}
            </Typography>
          )}

          <Box sx={{ display: 'flex', flexWrap: 'wrap', columnGap: 2, rowGap: 0.5, mt: 0.75, alignItems: 'center' }}>
            {p.email && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, minWidth: 0, maxWidth: '100%' }}>
                <EmailOutlinedIcon sx={{ fontSize: 16, color: 'text.secondary' }} aria-hidden />
                <Typography variant="body2" color="text.secondary" sx={{ wordBreak: 'break-all' }}>
                  {p.email}
                </Typography>
                {p.email_verified && (
                  <VerifiedIcon sx={{ fontSize: 15, color: 'success.main' }} aria-label="Email verified" titleAccess="Email verified" />
                )}
              </Box>
            )}
            {p.phone && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <PhoneOutlinedIcon sx={{ fontSize: 16, color: 'text.secondary' }} aria-hidden />
                <CopyablePhone phone={p.phone} mono variant="body2" textSx={{ color: 'text.secondary' }} />
                {p.phone_verified && (
                  <VerifiedIcon sx={{ fontSize: 15, color: 'success.main' }} aria-label="Phone verified" titleAccess="Phone verified" />
                )}
              </Box>
            )}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <SupervisorAccountOutlinedIcon sx={{ fontSize: 16, color: 'text.secondary' }} aria-hidden />
              <Typography variant="body2" color="text.secondary">
                Owner: {owner?.name || 'Nobody yet'}
              </Typography>
            </Box>
          </Box>
        </Box>

        <Box
          sx={{
            display: 'flex',
            gap: 1,
            flexWrap: 'wrap',
            justifyContent: { xs: 'flex-start', md: 'flex-end' },
            width: { xs: '100%', md: 'auto' },
            flexShrink: 0,
          }}
        >
          {wa && (
            <Button
              variant="outlined"
              color="success"
              startIcon={<WhatsAppIcon />}
              href={wa}
              target="_blank"
              rel="noopener noreferrer"
              sx={actionSx}
            >
              Message
            </Button>
          )}
          <Button variant="outlined" startIcon={<PersonAddAltOutlinedIcon />} onClick={onAssign} sx={actionSx}>
            Assign
          </Button>
          <Button variant="outlined" startIcon={<NoteAddIcon />} onClick={onAddNote} sx={actionSx}>
            Note
          </Button>
          <Button variant="contained" startIcon={<EditIcon />} onClick={onEdit} disabled={editDisabled} sx={{ ...actionSx, boxShadow: 'none' }}>
            Edit
          </Button>
        </Box>
      </Box>

      {(data.openDuplicates > 0 || data.suggestions?.length > 0) && (
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mt: 1.5 }}>
          {data.openDuplicates > 0 && (
            <Button
              component={Link}
              href={`/duplicates?user=${encodeURIComponent(String(p.id || ''))}`}
              startIcon={<ContentCopyOutlinedIcon />}
              color="warning"
              variant="outlined"
              sx={{ ...actionSx, color: '#8a4b00', borderColor: 'rgba(237,108,2,0.5)' }}
            >
              Open duplicates: {data.openDuplicates}
            </Button>
          )}
          {data.suggestions?.map((s: any) => (
            <Box
              key={s.id}
              role="note"
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                px: 1.5,
                py: 0.75,
                minHeight: 44,
                borderRadius: 1,
                bgcolor: 'rgba(2,136,209,0.06)',
                border: '1px solid rgba(2,136,209,0.25)',
                maxWidth: '100%',
              }}
            >
              <LightbulbOutlinedIcon sx={{ fontSize: 18, color: 'info.dark' }} aria-hidden />
              <Typography variant="body2" sx={{ minWidth: 0 }}>
                <Box component="span" sx={{ fontWeight: 700 }}>Suggested: {suggestionLabel(s.kind)}.</Box>{' '}
                <Box component="span" sx={{ color: 'text.secondary' }}>{s.reason}</Box>
              </Typography>
            </Box>
          ))}
        </Box>
      )}
    </Paper>
  );
}
