'use client';

import Link from 'next/link';
import { Box, Button, Paper, Rating, Typography, UserAvatar } from '@neram/ui';
import CheckIcon from '@mui/icons-material/Check';
import PublicIcon from '@mui/icons-material/Public';
import BlockIcon from '@mui/icons-material/Block';
import VisibilityOffOutlinedIcon from '@mui/icons-material/VisibilityOffOutlined';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import PersonOutlineIcon from '@mui/icons-material/PersonOutline';
import SchoolOutlinedIcon from '@mui/icons-material/SchoolOutlined';
import BadgeOutlinedIcon from '@mui/icons-material/BadgeOutlined';
import StarIcon from '@mui/icons-material/Star';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import VerifiedOutlinedIcon from '@mui/icons-material/VerifiedOutlined';
import { PUBLICATION_STATUS_LABELS } from '@neram/database';
import type { PublicationStatus } from '@neram/database';
import { StatusChip } from '@/components/user360/shared';
import {
  ACTION_LABELS,
  EXAM_LABELS,
  actionsForRow,
  consentSummary,
  needsConfirmation,
  publicationLabel,
  testimonialText,
  type ModerationActionKey,
} from '@/lib/testimonial-moderation';
import { formatDate, sentenceCase } from '@/lib/user360-view';
import { ConsentIcon, PublicationStatusIcon, publicationTone } from './moderation-icons';

export interface ModerationTestimonial {
  id: string;
  user_id: string | null;
  student_name: string | null;
  content: unknown;
  rating: number | null;
  exam_type: string | null;
  year: number | null;
  city: string | null;
  source: string | null;
  publication_status: string;
  consent_given_at: string | null;
  consent_by: string | null;
  consent_display_name: string | null;
  submitted_at: string | null;
  moderated_at: string | null;
  moderation_note: string | null;
  is_featured?: boolean | null;
  created_at?: string | null;
}

const ACTION_ICONS: Record<ModerationActionKey, JSX.Element> = {
  approve: <CheckIcon />,
  publish: <PublicIcon />,
  reject: <BlockIcon />,
  withdraw: <VisibilityOffOutlinedIcon />,
  confirm: <VerifiedOutlinedIcon />,
};

const btnSx = { textTransform: 'none', fontWeight: 600, minHeight: 44 } as const;

export default function ModerationCard({
  t,
  busy,
  onAction,
}: {
  t: ModerationTestimonial;
  busy: boolean;
  onAction: (t: ModerationTestimonial, action: ModerationActionKey) => void;
}) {
  const status = t.publication_status as PublicationStatus;
  const consent = consentSummary(t);
  const isLearner = t.source === 'learner';
  const unconfirmed = needsConfirmation(t);
  const actions = actionsForRow(t);
  const text = testimonialText(t.content);
  const facts = [
    t.exam_type ? EXAM_LABELS[t.exam_type] || t.exam_type : null,
    t.year ? String(t.year) : null,
    t.city || null,
  ].filter(Boolean);

  return (
    <Paper
      component="article"
      aria-label={`Testimonial from ${t.student_name || 'a learner'}`}
      elevation={0}
      sx={{ border: '1px solid', borderColor: status === 'pending_moderation' || unconfirmed ? 'rgba(237,108,2,0.45)' : 'grey.200', borderRadius: 1, p: 2, minWidth: 0 }}
    >
      <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <UserAvatar name={t.student_name} size={40} clickable={false} />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography component="h3" variant="subtitle1" sx={{ fontWeight: 700, lineHeight: 1.3, wordBreak: 'break-word' }}>
            {t.student_name || 'Learner'}
          </Typography>
          <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', mt: 0.5, alignItems: 'center' }}>
            <StatusChip
              icon={<PublicationStatusIcon status={status} unconfirmed={unconfirmed} />}
              label={publicationLabel(t, PUBLICATION_STATUS_LABELS) || sentenceCase(String(status))}
              tone={publicationTone(status, unconfirmed)}
            />
            <StatusChip
              icon={isLearner ? <SchoolOutlinedIcon /> : <BadgeOutlinedIcon />}
              label={isLearner ? 'From a learner' : 'Staff entered'}
            />
            {t.is_featured && <StatusChip icon={<StarIcon />} label="Featured" tone="warning" />}
          </Box>
        </Box>
        <Box sx={{ textAlign: { xs: 'left', sm: 'right' }, width: { xs: '100%', sm: 'auto' } }}>
          {t.rating ? (
            <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
              <Rating value={Number(t.rating)} readOnly size="small" aria-hidden />
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                {t.rating} of 5
              </Typography>
            </Box>
          ) : (
            <Typography variant="body2" color="text.secondary">
              No rating
            </Typography>
          )}
          {facts.length > 0 && (
            <Typography variant="body2" color="text.secondary">
              {facts.join(', ')}
            </Typography>
          )}
        </Box>
      </Box>

      <Typography
        component="blockquote"
        variant="body1"
        sx={{ m: 0, mt: 1.5, pl: 1.5, borderLeft: '3px solid', borderColor: 'grey.300', whiteSpace: 'pre-line', wordBreak: 'break-word', fontSize: 15, lineHeight: 1.6 }}
      >
        {text || 'No text'}
      </Typography>

      <Box
        sx={{
          display: 'flex',
          gap: 1,
          alignItems: 'flex-start',
          mt: 1.5,
          p: 1.25,
          borderRadius: 1,
          bgcolor: consent.canPublish ? 'rgba(46,125,50,0.06)' : 'rgba(211,47,47,0.06)',
          border: '1px solid',
          borderColor: consent.canPublish ? 'rgba(46,125,50,0.25)' : 'rgba(211,47,47,0.3)',
        }}
      >
        <ConsentIcon state={consent.state} />
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="body2" sx={{ fontWeight: 700 }}>
            {consent.label}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {consent.detail}
          </Typography>
        </Box>
      </Box>

      {unconfirmed && (
        <Box sx={{ display: 'flex', gap: 0.75, mt: 1, alignItems: 'flex-start' }}>
          <InfoOutlinedIcon sx={{ fontSize: 18, color: '#8a4b00', mt: '2px' }} aria-hidden />
          <Typography variant="body2" sx={{ color: '#8a4b00' }}>
            Shown on the testimonials page, but not counted on the reviews page or in the rating until a staff member
            confirms it is genuine.
          </Typography>
        </Box>
      )}

      {t.moderation_note && (
        <Box sx={{ display: 'flex', gap: 0.75, mt: 1, alignItems: 'flex-start' }}>
          <InfoOutlinedIcon sx={{ fontSize: 18, color: 'text.secondary', mt: '2px' }} aria-hidden />
          <Typography variant="body2" color="text.secondary">
            Staff note: {t.moderation_note}
            {t.moderated_at ? ` (${formatDate(t.moderated_at)})` : ''}
          </Typography>
        </Box>
      )}

      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
        {t.submitted_at ? `Sent ${formatDate(t.submitted_at)}` : t.created_at ? `Added ${formatDate(t.created_at)}` : ''}
        {t.moderated_at && !t.moderation_note ? `, last reviewed ${formatDate(t.moderated_at)}` : ''}
      </Typography>

      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mt: 1.5, alignItems: 'center' }}>
        {actions.map((a) => {
          const blocked = a === 'publish' && !consent.canPublish;
          return (
            <Button
              key={a}
              variant={a === 'publish' || a === 'confirm' || (a === 'approve' && !actions.includes('publish')) ? 'contained' : 'outlined'}
              color={a === 'reject' || a === 'withdraw' ? 'error' : a === 'publish' || a === 'confirm' ? 'success' : 'primary'}
              startIcon={ACTION_ICONS[a]}
              disabled={busy || blocked}
              onClick={() => onAction(t, a)}
              aria-describedby={blocked ? `no-consent-${t.id}` : undefined}
              sx={{ ...btnSx, boxShadow: 'none' }}
            >
              {ACTION_LABELS[a]}
            </Button>
          );
        })}
        <Button component={Link} href={`/testimonials/${t.id}`} startIcon={<EditOutlinedIcon />} sx={btnSx}>
          Edit
        </Button>
        {t.user_id && (
          <Button component={Link} href={`/crm/${t.user_id}?tab=feedback&from=testimonials`} startIcon={<PersonOutlineIcon />} sx={btnSx}>
            Open person
          </Button>
        )}
      </Box>
      {actions.includes('publish') && !consent.canPublish && (
        <Typography id={`no-consent-${t.id}`} variant="caption" sx={{ display: 'block', mt: 0.75, color: 'error.dark' }}>
          Publish is off because the learner did not agree to publication. Approve keeps it private.
        </Typography>
      )}
    </Paper>
  );
}
