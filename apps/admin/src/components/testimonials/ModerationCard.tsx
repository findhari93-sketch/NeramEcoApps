'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Box, Button, Collapse, Paper, Rating, Typography } from '@neram/ui';
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
import MicNoneOutlinedIcon from '@mui/icons-material/MicNoneOutlined';
import PhoneOutlinedIcon from '@mui/icons-material/PhoneOutlined';
import WarningAmberOutlinedIcon from '@mui/icons-material/WarningAmberOutlined';
import { LOW_RATING_THRESHOLD, PUBLICATION_STATUS_LABELS } from '@neram/database';
import type { PublicationStatus } from '@neram/database';
import { StatusChip } from '@/components/user360/shared';
import PersonAvatar from '@/components/person/PersonAvatar';
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
import ReviewEditDialog from './ReviewEditDialog';

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
  // Verified reviews from a review link (20261117090000).
  student_photo?: string | null;
  rank?: number | null;
  percentile?: number | null;
  college_admitted?: string | null;
  is_verified_student?: boolean | null;
  original_text?: string | null;
  voice_transcript?: string | null;
  input_mode?: 'typed' | 'voice' | null;
  staff_edited?: boolean | null;
  edited_at?: string | null;
  review_request_id?: string | null;
  review_request?: {
    student_corrections: Record<string, string> | null;
    phone: string | null;
    google_clicked_at: string | null;
    google_posted_self_reported_at: string | null;
    secondary_platform: string | null;
    secondary_clicked_at: string | null;
  } | null;
}

const CORRECTION_LABELS: Record<string, string> = {
  college_admitted: 'College',
  air_rank: 'AIR',
  percentile: 'Percentile',
  exam_year: 'Exam year',
  city: 'City',
};

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
  onEdited,
}: {
  t: ModerationTestimonial;
  busy: boolean;
  onAction: (t: ModerationTestimonial, action: ModerationActionKey) => void;
  /** Called after a staff edit is saved, so the list can reload. */
  onEdited?: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [showTranscript, setShowTranscript] = useState(false);
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
  const result = [t.rank ? `AIR ${t.rank}` : t.percentile != null ? `${t.percentile} percentile` : null, t.college_admitted || null]
    .filter(Boolean)
    .join(' · ');
  const fromLink = Boolean(t.review_request_id || t.is_verified_student);
  const lowRating = isLearner && t.rating != null && Number(t.rating) <= LOW_RATING_THRESHOLD && status === 'pending_moderation';
  const corrections = Object.entries(t.review_request?.student_corrections || {}).filter(([, v]) => v);
  const ownWordsDiffer = Boolean(t.original_text && text && t.original_text.trim() !== text.trim());
  const rr = t.review_request;
  const googleLine = rr?.google_posted_self_reported_at
    ? `Says they posted on Google ${formatDate(rr.google_posted_self_reported_at)}`
    : rr?.google_clicked_at
      ? `Opened Google ${formatDate(rr.google_clicked_at)}, not confirmed posted`
      : 'Has not opened Google yet';

  return (
    <Paper
      component="article"
      aria-label={`Testimonial from ${t.student_name || 'a learner'}`}
      elevation={0}
      sx={{ border: '1px solid', borderColor: status === 'pending_moderation' || unconfirmed ? 'rgba(237,108,2,0.45)' : 'grey.200', borderRadius: 1, p: 2, minWidth: 0 }}
    >
      <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <PersonAvatar userId={t.user_id} name={t.student_name} src={t.student_photo} size={40} />
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
            {t.is_verified_student && <StatusChip icon={<VerifiedOutlinedIcon />} label="Verified student" tone="success" />}
            {t.input_mode === 'voice' && <StatusChip icon={<MicNoneOutlinedIcon />} label="Spoken" />}
            {t.staff_edited && <StatusChip icon={<EditOutlinedIcon />} label={`Edited by staff${t.edited_at ? ` ${formatDate(t.edited_at)}` : ''}`} />}
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
          {result && (
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              {result}
            </Typography>
          )}
        </Box>
      </Box>

      {lowRating && (
        <Box
          role="note"
          sx={{ display: 'flex', gap: 1, alignItems: 'flex-start', mt: 1.5, p: 1.25, borderRadius: 1, bgcolor: 'rgba(237,108,2,0.08)', border: '1px solid rgba(237,108,2,0.35)', flexWrap: 'wrap' }}
        >
          <WarningAmberOutlinedIcon sx={{ color: '#8a4b00' }} aria-hidden />
          <Box sx={{ minWidth: 0, flex: 1 }}>
            <Typography variant="body2" sx={{ fontWeight: 700, color: '#8a4b00' }}>
              {t.rating} star{Number(t.rating) === 1 ? '' : 's'}. Call this student first.
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Find out what went wrong and fix it if you can. They were shown the Google step too, so a good conversation now matters more than this page.
            </Typography>
          </Box>
          {rr?.phone && (
            <Button component="a" href={`tel:${rr.phone}`} startIcon={<PhoneOutlinedIcon />} size="small" sx={{ ...btnSx, flexShrink: 0 }}>
              Call
            </Button>
          )}
        </Box>
      )}

      <Typography
        component="blockquote"
        variant="body1"
        sx={{ m: 0, mt: 1.5, pl: 1.5, borderLeft: '3px solid', borderColor: 'grey.300', whiteSpace: 'pre-line', wordBreak: 'break-word', fontSize: 15, lineHeight: 1.6 }}
      >
        {text || 'No text'}
      </Typography>

      {fromLink && (ownWordsDiffer || t.voice_transcript || corrections.length > 0 || rr) && (
        <Box sx={{ mt: 1.5, p: 1.25, borderRadius: 1, bgcolor: 'grey.50', border: '1px solid', borderColor: 'grey.200' }}>
          <Typography variant="overline" color="text.secondary" sx={{ lineHeight: 1.6 }}>
            From the review link
          </Typography>
          {ownWordsDiffer && (
            <Box sx={{ mt: 0.5 }}>
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                The student&apos;s own words
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: 'pre-line' }}>
                {t.original_text}
              </Typography>
            </Box>
          )}
          {corrections.length > 0 && (
            <Typography variant="body2" sx={{ mt: 0.75 }}>
              <strong>Student corrected:</strong> {corrections.map(([k, v]) => `${CORRECTION_LABELS[k] || k} to ${v}`).join(', ')}
            </Typography>
          )}
          {t.voice_transcript && (
            <>
              <Button
                size="small"
                onClick={() => setShowTranscript((v) => !v)}
                aria-expanded={showTranscript}
                startIcon={<MicNoneOutlinedIcon />}
                sx={{ ...btnSx, mt: 0.5, px: 0.5 }}
              >
                {showTranscript ? 'Hide what they said' : 'Show what they said'}
              </Button>
              <Collapse in={showTranscript}>
                <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: 'pre-line' }}>
                  {t.voice_transcript}
                </Typography>
              </Collapse>
            </>
          )}
          {rr && (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>
              {googleLine}
              {rr.secondary_platform ? `. ${rr.secondary_clicked_at ? 'Opened' : 'Shown'} ${rr.secondary_platform === 'justdial' ? 'Justdial' : 'Sulekha'}` : ''}.
            </Typography>
          )}
        </Box>
      )}

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
        {isLearner ? (
          <Button onClick={() => setEditing(true)} startIcon={<EditOutlinedIcon />} sx={btnSx} disabled={busy}>
            Edit review
          </Button>
        ) : (
          <Button component={Link} href={`/testimonials/${t.id}`} startIcon={<EditOutlinedIcon />} sx={btnSx}>
            Edit
          </Button>
        )}
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
      {isLearner && (
        <ReviewEditDialog
          open={editing}
          onClose={() => setEditing(false)}
          onSaved={() => onEdited?.()}
          review={{
            id: t.id,
            text,
            original_text: t.original_text ?? null,
            rating: t.rating,
            display_name: t.consent_display_name || t.student_name || '',
            college_admitted: t.college_admitted ?? null,
            rank: t.rank ?? null,
            percentile: t.percentile ?? null,
          }}
        />
      )}
    </Paper>
  );
}
