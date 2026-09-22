'use client';

import Link from 'next/link';
import { Box, Typography } from '@neram/ui';
import BrushOutlinedIcon from '@mui/icons-material/BrushOutlined';
import NotificationsOffOutlinedIcon from '@mui/icons-material/NotificationsOffOutlined';
import NotificationsActiveOutlinedIcon from '@mui/icons-material/NotificationsActiveOutlined';
import { useStudentStageFacts } from '@/components/students/StudentStageFactsProvider';
import StudentStageAvatar from '@/components/students/StudentStageAvatar';
import type { StageKey } from '@/lib/student-stage';
import { reminderSummary, type RhythmStatus, type StripDay } from '@/lib/sketchbook-status';
import { sketchbookReviewHref } from '@/lib/review-context';
import RhythmStrip from './RhythmStrip';

export interface RhythmStudent {
  userId: string;
  name: string | null;
  email: string | null;
  avatarUrl: string | null;
  msOid: string | null;
  enrolledAt: string | null;
  start: string;
  status: RhythmStatus;
  label: string;
  quietDays: number;
  lastDrawingDate: string | null;
  week: { count: number; goal: number };
  strip: StripDay[];
  run: number;
  /** Automatic steps in this quiet stretch (what "Needs a call" counts). */
  remindersThisCycle: number;
  /** Every reminder in this quiet stretch, automatic and teacher-pressed. */
  remindersSentThisCycle: number;
  lastRemindedOn: string | null;
  /** sendNudge channel of the newest reminder, e.g. `chat+inapp`. */
  lastReminderChannel: string | null;
  latestSketch: { id: string; thumbUrl: string | null; submittedAt: string } | null;
}

/** Text colours dark enough for 4.5:1 on paper. The label always says the status in words. */
const STATUS_TEXT: Record<RhythmStatus, string> = {
  needs_call: 'error.main',
  needs_nudge: 'warning.dark',
  behind: 'info.dark',
  not_started: 'text.secondary',
  on_track: 'success.dark',
};

const THUMB = 44;

function sketchDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' });
}

/**
 * One student on Class rhythm, in about 56px: face, name and "1/3" on the first
 * line, the two-week strip and where they stand on the second, and their newest
 * sketch on the right. Whether Nexus reminded them is a sentence on the second
 * line from 600px up, and a bell mark beside "1/3" on a phone. The row opens their sketchbook; the thumbnail opens that
 * sketch. Two links side by side, never one inside the other.
 */
export default function RhythmRow({ student: s }: { student: RhythmStudent }) {
  const { factsFor } = useStudentStageFacts();
  const stage = ((factsFor(s.userId)?.stage as StageKey) || 'unset') as StageKey;
  const name = s.name || 'Student';
  const met = s.week.count >= s.week.goal;
  const reminded = reminderSummary({
    status: s.status,
    sentThisCycle: s.remindersSentThisCycle,
    lastSentOn: s.lastRemindedOn,
    lastChannel: s.lastReminderChannel,
  });

  return (
    <Box component="li" sx={{ display: 'flex', alignItems: 'center', gap: 1, borderBottom: 1, borderColor: 'divider' }} data-testid="rhythm-row">
      <Box
        component={Link}
        href={`/teacher/sketchbook/${s.userId}`}
        aria-label={`${name}. ${s.label}. ${s.week.count} of ${s.week.goal} days this week.${reminded ? ` ${reminded}.` : ''}`}
        sx={{
          flex: 1,
          minWidth: 0,
          display: 'flex',
          alignItems: 'center',
          gap: 1.5,
          minHeight: 56,
          px: 1,
          py: 0.75,
          textDecoration: 'none',
          color: 'inherit',
          borderRadius: 1,
          '&:hover': { bgcolor: 'action.hover' },
          '&:focus-visible': { outline: '3px solid', outlineColor: 'primary.main', outlineOffset: -3 },
        }}
      >
        <StudentStageAvatar stage={stage} userId={s.userId} name={s.name} msOid={s.msOid} fallbackSrc={s.avatarUrl} size={36} />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1 }}>
            <Typography
              variant="body1"
              noWrap
              title={name}
              sx={{ fontWeight: 600, flex: 1, minWidth: 0, lineHeight: 1.35 }}
              data-testid="rhythm-row-name"
            >
              {name}
            </Typography>
            {reminded && (
              // Phones: the reminder story as one mark on the name line, because a
              // sentence would add a third line to every quiet row. Crossed-out bell =
              // never reminded, bell and a number = reminded that many times. The full
              // sentence is the tooltip and part of the row's accessible name.
              <Box
                component="span"
                aria-hidden
                title={reminded}
                data-testid="rhythm-row-reminder-mark"
                sx={{
                  display: { xs: 'inline-flex', sm: 'none' },
                  alignItems: 'center',
                  gap: 0.25,
                  flexShrink: 0,
                  alignSelf: 'center',
                  color: s.remindersSentThisCycle > 0 ? 'text.secondary' : 'warning.dark',
                }}
              >
                {s.remindersSentThisCycle > 0 ? <NotificationsActiveOutlinedIcon sx={{ fontSize: 18 }} /> : <NotificationsOffOutlinedIcon sx={{ fontSize: 18 }} />}
                {s.remindersSentThisCycle > 0 && (
                  <Typography component="span" variant="caption" sx={{ fontWeight: 700, lineHeight: 1 }}>{s.remindersSentThisCycle}</Typography>
                )}
              </Box>
            )}
            <Typography
              component="span"
              variant="body2"
              aria-hidden
              sx={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: met ? 'success.dark' : 'text.secondary', flexShrink: 0 }}
            >
              {s.week.count}/{s.week.goal}
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', columnGap: 1, rowGap: 0.25, flexWrap: 'wrap', mt: 0.25 }}>
            <RhythmStrip strip={s.strip} />
            <Typography component="span" variant="caption" aria-hidden sx={{ fontWeight: 600, color: STATUS_TEXT[s.status], lineHeight: 1.3 }} data-testid="rhythm-row-label">
              {s.label}
            </Typography>
            {reminded && (
              <Typography
                component="span"
                variant="caption"
                aria-hidden
                sx={{ display: { xs: 'none', sm: 'inline' }, color: 'text.secondary', lineHeight: 1.3 }}
                data-testid="rhythm-row-reminders"
              >
                {reminded}
              </Typography>
            )}
          </Box>
        </Box>
      </Box>

      {s.latestSketch?.thumbUrl ? (
        <Box
          component={Link}
          href={sketchbookReviewHref(s.latestSketch.id, s.userId)}
          aria-label={`Open ${name}'s latest drawing, ${sketchDate(s.latestSketch.submittedAt)}`}
          sx={{
            width: THUMB,
            height: THUMB,
            flexShrink: 0,
            mr: 1,
            borderRadius: 1,
            overflow: 'hidden',
            border: 1,
            borderColor: 'divider',
            bgcolor: 'grey.100',
            '&:focus-visible': { outline: '3px solid', outlineColor: 'primary.main', outlineOffset: 2 },
          }}
        >
          {/* A plain img on purpose: next/image would bill an optimisation per thumbnail. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={s.latestSketch.thumbUrl}
            alt=""
            loading="lazy"
            decoding="async"
            width={THUMB}
            height={THUMB}
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          />
        </Box>
      ) : (
        <Box
          aria-hidden
          sx={{
            width: THUMB,
            height: THUMB,
            flexShrink: 0,
            mr: 1,
            borderRadius: 1,
            border: '1px dashed',
            borderColor: 'divider',
            display: 'grid',
            placeItems: 'center',
            color: 'text.disabled',
          }}
        >
          <BrushOutlinedIcon sx={{ fontSize: 18 }} />
        </Box>
      )}
    </Box>
  );
}
