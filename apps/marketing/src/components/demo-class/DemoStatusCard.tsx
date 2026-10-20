'use client';

import type { ReactNode } from 'react';
import { Box, Button, Paper, Typography } from '@neram/ui';
import VideocamIcon from '@mui/icons-material/Videocam';
import PhoneInTalkIcon from '@mui/icons-material/PhoneInTalk';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import FamilyRestroomIcon from '@mui/icons-material/FamilyRestroom';
import LaptopIcon from '@mui/icons-material/Laptop';
import PhoneIphoneIcon from '@mui/icons-material/PhoneIphone';
import {
  formatDemoDate,
  formatDemoPreference,
  formatDemoTime,
  isJoinOpen,
  resolveDemoSchedule,
} from '@neram/database/demo-schedule';
import type { PublicDemoRequest } from '@/lib/demo-request';
import DrawingShareCard from './DrawingShareCard';
import { AddToCalendarRow, CountdownTiles, useDemoClock } from './DemoCountdownParts';
import { demoCountdown } from '@/lib/demo-countdown';

/** Live time left; a quiet placeholder until mounted so server and client match. */
function CardCountdown({ start, minutes }: { start: Date; minutes: number }) {
  const now = useDemoClock(1000);
  if (!now) return <Box sx={{ height: 58 }} />;
  return <CountdownTiles countdown={demoCountdown(start, minutes, now)} />;
}

const STEPS = ['Requested', 'We call you', 'Confirmed', 'Demo day'];

function stepIndex(r: PublicDemoRequest): number {
  if (r.status === 'attended') return 4;
  if (r.status === 'approved') return 2;
  if (r.status === 'contacted') return 1;
  return 1;
}

/** Four-step tracker: Requested, We call you, Confirmed, Demo day. */
export function DemoProgress({ request }: { request: PublicDemoRequest }) {
  const active = stepIndex(request);
  return (
    <Box component="ol" aria-label="Demo booking progress" sx={{ listStyle: 'none', p: 0, m: 0, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 0.5 }}>
      {STEPS.map((label, i) => {
        const done = i < active;
        const current = i === active;
        return (
          <Box component="li" key={label} aria-current={current ? 'step' : undefined} sx={{ textAlign: 'center' }}>
            <Box
              sx={{
                height: 6,
                borderRadius: 3,
                bgcolor: done ? 'success.main' : current ? 'primary.main' : 'action.disabledBackground',
                mb: 0.75,
              }}
            />
            <Typography variant="caption" sx={{ fontWeight: current ? 700 : 500, color: done || current ? 'text.primary' : 'text.secondary', lineHeight: 1.2, display: 'block' }}>
              {done && <CheckCircleIcon aria-hidden sx={{ fontSize: 12, mr: 0.25, verticalAlign: '-2px', color: 'success.main' }} />}
              {label}
            </Typography>
          </Box>
        );
      })}
    </Box>
  );
}

export interface DemoPublicSettings {
  schedule: unknown;
  drawingWhatsApp: string;
  callbackPromise: string;
}

/**
 * The student's view of their demo: where it is in the journey and what they
 * can do next. Shared by the booking page, /demo-class/my and /d/{token}.
 */
export default function DemoStatusCard({
  request: r,
  settings,
  origin,
  actions,
  heading,
}: {
  request: PublicDemoRequest;
  settings: DemoPublicSettings;
  /** Prefix for site links; '' keeps them relative (no hydration mismatch). */
  origin: string;
  actions?: ReactNode;
  heading?: string;
}) {
  const schedule = resolveDemoSchedule(settings.schedule);
  const start = r.scheduledStart ? new Date(r.scheduledStart) : null;
  const now = new Date();
  const confirmed = r.status === 'approved' && start;
  const joinOpen = confirmed ? isJoinOpen(start, r.minutes, now) : false;
  const open = r.status === 'pending' || r.status === 'contacted';
  const closed = ['cancelled', 'rejected', 'no_show'].includes(r.status);

  return (
    <Paper variant="outlined" sx={{ p: { xs: 2, sm: 3 }, borderRadius: 3 }}>
      <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 700, letterSpacing: 0.6 }}>
        {heading || 'Your free demo class'} · {r.ref}
      </Typography>

      {!closed && r.status !== 'attended' && (
        <Box sx={{ mt: 1.5, mb: 2.5 }}>
          <DemoProgress request={r} />
        </Box>
      )}

      {confirmed && (
        <>
          <Typography variant="h5" component="p" fontWeight={800} sx={{ lineHeight: 1.25 }}>
            {formatDemoDate(start)}, {formatDemoTime(start)}
          </Typography>
          <Typography variant="body1" color="text.secondary" sx={{ mt: 0.5 }}>
            {r.minutes} minutes, live on Microsoft Teams{r.hostName ? ` with ${r.hostName}` : ''}
          </Typography>
          {r.scheduleNote && (
            <Typography variant="body2" sx={{ mt: 1 }}>
              Note from our team: {r.scheduleNote}
            </Typography>
          )}
          <Box sx={{ mt: 2 }}>
            <CardCountdown start={start} minutes={r.minutes} />
          </Box>
          <Box sx={{ display: 'grid', gap: 1.25, mt: 2 }}>
            {r.joinUrl && (
              <Button
                variant="contained"
                color="success"
                size="large"
                startIcon={<VideocamIcon />}
                href={r.joinUrl}
                target="_blank"
                rel="noopener noreferrer"
                sx={{ minHeight: 52, fontWeight: 700 }}
              >
                {joinOpen ? 'Join the demo now' : 'Join on Microsoft Teams'}
              </Button>
            )}
            <Box sx={{ mt: 1 }}>
              <AddToCalendarRow
                event={{ ref: r.ref, token: r.token, start, minutes: r.minutes, joinUrl: r.joinUrl, hostName: r.hostName, origin }}
              />
            </Box>
          </Box>
          <Box sx={{ mt: 2.5, p: 2, borderRadius: 2, bgcolor: 'action.hover' }}>
            <Typography variant="subtitle2" component="h3" fontWeight={700}>
              How to join
            </Typography>
            <Box component="ul" sx={{ listStyle: 'none', p: 0, m: 0, mt: 1, display: 'grid', gap: 1.25 }}>
              <Box component="li" sx={{ display: 'flex', gap: 1.25 }}>
                <LaptopIcon aria-hidden fontSize="small" sx={{ mt: '2px', color: 'text.secondary' }} />
                <Typography variant="body2">
                  <b>On a laptop:</b> open the join link in Chrome or Edge and choose Continue on this browser. No download and no
                  account needed.
                </Typography>
              </Box>
              <Box component="li" sx={{ display: 'flex', gap: 1.25 }}>
                <PhoneIphoneIcon aria-hidden fontSize="small" sx={{ mt: '2px', color: 'text.secondary' }} />
                <Typography variant="body2">
                  <b>On a phone:</b> install the free Microsoft Teams app, tap the join link and choose Join as a guest. No
                  sign-in needed.
                </Typography>
              </Box>
            </Box>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1.25 }}>
              A steady internet connection is all you need.
            </Typography>
          </Box>
          <Box sx={{ mt: 1.5, p: 2, borderRadius: 2, bgcolor: 'action.hover' }}>
            <Typography variant="subtitle2" component="h3" fontWeight={700} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <FamilyRestroomIcon aria-hidden fontSize="small" /> Join with your parents
            </Typography>
            <Typography variant="body2" sx={{ mt: 0.5 }}>
              Sit together, see how a real Neram class runs and ask us anything about the course, the exams or the fees.
            </Typography>
          </Box>
        </>
      )}

      {open && (
        <>
          <Typography variant="h6" component="p" fontWeight={800}>
            We will call you to fix the exact time
          </Typography>
          <Typography variant="body1" color="text.secondary" sx={{ mt: 0.5 }}>
            You asked for <b>{formatDemoPreference(r.preferredDate, r.preferredWindow, schedule)}</b>. We usually call{' '}
            {settings.callbackPromise} from +91 91761 37043.
          </Typography>
          <Button
            variant="text"
            startIcon={<PhoneInTalkIcon />}
            href="tel:+919176137043"
            sx={{ mt: 1, minHeight: 44, px: 0 }}
          >
            Save our number: +91 91761 37043
          </Button>
        </>
      )}

      {r.status === 'attended' && (
        <Typography variant="h6" component="p" fontWeight={800}>
          Thank you for attending. We hope you enjoyed the class.
        </Typography>
      )}

      {closed && (
        <>
          <Typography variant="h6" component="p" fontWeight={800}>
            {r.status === 'no_show' ? 'We missed you at the demo' : 'This demo is not scheduled any more'}
          </Typography>
          {r.scheduleNote && (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              {r.scheduleNote}
            </Typography>
          )}
        </>
      )}

      {actions && <Box sx={{ mt: 2.5, display: 'flex', gap: 1, flexWrap: 'wrap' }}>{actions}</Box>}

      {(open || confirmed) && !r.drawingReceived && (
        <Box sx={{ mt: 3 }}>
          <DrawingShareCard number={settings.drawingWhatsApp} refCode={r.ref} />
        </Box>
      )}
    </Paper>
  );
}
