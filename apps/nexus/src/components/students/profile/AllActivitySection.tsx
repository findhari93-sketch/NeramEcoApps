'use client';

/**
 * All activity: the student's history across every app, from the shared User
 * 360 timeline (GET /api/students/[id]/activity).
 *
 * It sits beside the Nexus history section rather than replacing it. That
 * section reads Nexus-only facts the shared timeline does not carry (documents,
 * the application form completion, the Nexus account creation), so removing it
 * would lose data teachers see today.
 *
 * One vertical list, newest first. Each row: an icon for its kind (with the kind
 * named in text too), a relative time with the exact time on hover and for
 * screen readers, and who did it when a staff member did. "Load older" fetches
 * the next page; no infinite scroll, so a thumb never loads a page by accident
 * and the footer stays reachable. Fetches nothing until the section is opened.
 */

import { useCallback, useRef, useState, type ReactNode } from 'react';
import { Alert, Box, Button, CircularProgress, Skeleton, Typography } from '@neram/ui';
import LoginOutlinedIcon from '@mui/icons-material/LoginOutlined';
import CurrencyRupeeOutlinedIcon from '@mui/icons-material/CurrencyRupeeOutlined';
import EventAvailableOutlinedIcon from '@mui/icons-material/EventAvailableOutlined';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import StickyNote2OutlinedIcon from '@mui/icons-material/StickyNote2Outlined';
import PhoneOutlinedIcon from '@mui/icons-material/PhoneOutlined';
import ChatBubbleOutlineOutlinedIcon from '@mui/icons-material/ChatBubbleOutlineOutlined';
import ClassOutlinedIcon from '@mui/icons-material/ClassOutlined';
import LabelOutlinedIcon from '@mui/icons-material/LabelOutlined';
import RateReviewOutlinedIcon from '@mui/icons-material/RateReviewOutlined';
import MergeTypeOutlinedIcon from '@mui/icons-material/MergeTypeOutlined';
import PersonAddAltOutlinedIcon from '@mui/icons-material/PersonAddAltOutlined';
import CalculateOutlinedIcon from '@mui/icons-material/CalculateOutlined';
import AssignmentOutlinedIcon from '@mui/icons-material/AssignmentOutlined';
import TimelineOutlinedIcon from '@mui/icons-material/TimelineOutlined';
import ProfileSection from './ProfileSection';
import { EmptyNote } from './FieldGrid';
import { formatDateTimeIN } from '@/lib/student-profile-fields';
import {
  activityKindInfo,
  relativeTime,
  sourceAppLabel,
  type ActivityIcon,
  type ActivityRow,
} from '@/lib/lifecycle-display';

const ICONS: Record<ActivityIcon, ReactNode> = {
  sign_in: <LoginOutlinedIcon fontSize="small" />,
  payment: <CurrencyRupeeOutlinedIcon fontSize="small" />,
  demo: <EventAvailableOutlinedIcon fontSize="small" />,
  change: <EditOutlinedIcon fontSize="small" />,
  note: <StickyNote2OutlinedIcon fontSize="small" />,
  call: <PhoneOutlinedIcon fontSize="small" />,
  message: <ChatBubbleOutlineOutlinedIcon fontSize="small" />,
  enrollment: <ClassOutlinedIcon fontSize="small" />,
  classification: <LabelOutlinedIcon fontSize="small" />,
  feedback: <RateReviewOutlinedIcon fontSize="small" />,
  merge: <MergeTypeOutlinedIcon fontSize="small" />,
  account: <PersonAddAltOutlinedIcon fontSize="small" />,
  tool: <CalculateOutlinedIcon fontSize="small" />,
  application: <AssignmentOutlinedIcon fontSize="small" />,
  event: <TimelineOutlinedIcon fontSize="small" />,
};

const PAGE_SIZE = 25;

export default function AllActivitySection({
  studentId,
  classroomId,
  getToken,
}: {
  studentId: string;
  classroomId: string | null;
  getToken: () => Promise<string | null>;
}) {
  const [rows, setRows] = useState<ActivityRow[]>([]);
  const [nextBefore, setNextBefore] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  const load = useCallback(
    async (before: string | null) => {
      if (!classroomId || inFlight.current) return;
      inFlight.current = true;
      setLoading(true);
      setError(null);
      try {
        const token = await getToken();
        if (!token) return;
        const qs = new URLSearchParams({ classroom: classroomId, limit: String(PAGE_SIZE) });
        if (before) qs.set('before', before);
        const res = await fetch(`/api/students/${studentId}/activity?${qs}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json().catch(() => null);
        if (!res.ok || !data) throw new Error(data?.error || 'Could not load the activity history.');
        setRows((prev) => (before ? [...prev, ...(data.entries as ActivityRow[])] : (data.entries as ActivityRow[])));
        setNextBefore(data.nextBefore ?? null);
        setLoaded(true);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not load the activity history.');
      } finally {
        inFlight.current = false;
        setLoading(false);
      }
    },
    [classroomId, getToken, studentId],
  );

  const firstOpen = useCallback(() => {
    void load(null);
  }, [load]);

  const headline = loaded
    ? rows.length
      ? `Latest ${relativeTime(rows[0].occurred_at)}`
      : 'Nothing recorded'
    : 'Every app, newest first';

  return (
    <ProfileSection id="profile-all-activity" title="All activity" headline={headline} onFirstOpen={firstOpen}>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Sign-ins, tools, the application, calls, messages and classroom changes from every Neram app.
      </Typography>

      {!loaded && loading ? (
        <Box aria-busy="true" aria-label="Loading activity" sx={{ display: 'grid', gap: 2, '@media (prefers-reduced-motion: reduce)': { '& .MuiSkeleton-root': { animation: 'none' } } }}>
          {[0, 1, 2, 3].map((i) => (
            <Box key={i} sx={{ display: 'flex', gap: 1.5 }}>
              <Skeleton variant="circular" width={36} height={36} />
              <Box sx={{ flex: 1 }}>
                <Skeleton width="60%" />
                <Skeleton width="40%" />
              </Box>
            </Box>
          ))}
        </Box>
      ) : loaded && rows.length === 0 ? (
        <EmptyNote>Nothing recorded yet across the apps.</EmptyNote>
      ) : (
        <Box component="ol" sx={{ listStyle: 'none', m: 0, p: 0, display: 'grid', gap: 0 }}>
          {rows.map((row, i) => (
            <ActivityItem key={`${row.occurred_at}-${row.kind}-${i}`} row={row} last={i === rows.length - 1} />
          ))}
        </Box>
      )}

      {error && (
        <Alert
          severity="warning"
          sx={{ mt: 2 }}
          action={
            <Button color="inherit" onClick={() => void load(loaded ? nextBefore : null)} sx={{ minHeight: 44 }}>
              Try again
            </Button>
          }
        >
          {error}
        </Alert>
      )}

      {loaded && nextBefore && (
        <Button
          variant="outlined"
          onClick={() => void load(nextBefore)}
          disabled={loading}
          startIcon={loading ? <CircularProgress size={16} color="inherit" /> : undefined}
          sx={{ mt: 2, minHeight: 48, width: { xs: '100%', sm: 'auto' }, textTransform: 'none' }}
        >
          {loading ? 'Loading older activity' : 'Load older'}
        </Button>
      )}

      <Box aria-live="polite" sx={{ position: 'relative' }}>
        <Box component="span" sx={srOnly}>
          {loaded ? `${rows.length} activity entries shown.` : ''}
        </Box>
      </Box>
    </ProfileSection>
  );
}

function ActivityItem({ row, last }: { row: ActivityRow; last: boolean }) {
  const info = activityKindInfo(row.kind, row.event);
  const app = sourceAppLabel(row.source_app);
  return (
    <Box component="li" sx={{ display: 'flex', gap: 1.5, alignItems: 'stretch', minWidth: 0 }}>
      {/* The rail: icon, then a thin line down to the next row. */}
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
        <Box
          aria-hidden
          sx={{
            width: 36,
            height: 36,
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            bgcolor: 'action.hover',
            color: 'primary.main',
          }}
        >
          {ICONS[info.icon]}
        </Box>
        {!last && <Box aria-hidden sx={{ flex: 1, width: '2px', bgcolor: 'divider', my: 0.5, minHeight: 12 }} />}
      </Box>

      <Box sx={{ minWidth: 0, pb: last ? 0 : 2, pt: 0.75 }}>
        <Typography variant="body2" sx={{ fontWeight: 600, wordBreak: 'break-word' }}>
          {row.title}
        </Typography>
        <Typography variant="caption" color="text.secondary" component="div" sx={{ wordBreak: 'break-word' }}>
          {info.label} ·{' '}
          <Box component="time" dateTime={row.occurred_at} title={formatDateTimeIN(row.occurred_at)}>
            {relativeTime(row.occurred_at)}
          </Box>
          {row.actor_name ? ` · by ${row.actor_name}` : ''}
          {app ? ` · ${app}` : ''}
        </Typography>
        {row.detail && (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25, wordBreak: 'break-word' }}>
            {row.detail}
          </Typography>
        )}
      </Box>
    </Box>
  );
}

const srOnly = {
  position: 'absolute',
  width: '1px',
  height: '1px',
  padding: 0,
  margin: '-1px',
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
  border: 0,
} as const;
