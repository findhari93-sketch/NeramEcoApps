'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Box,
  Button,
  CircularProgress,
  Divider,
  Switch,
  Typography,
  alpha,
  useTheme,
} from '@neram/ui';
import VideocamIcon from '@mui/icons-material/Videocam';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import LinkOffIcon from '@mui/icons-material/LinkOff';
import type { ClassCardData } from './ClassCard';
import { formatTime } from './date-utils';
import { RADIUS, tagSx } from './timetable-theme';
import WrapUpSection from './WrapUpSection';

interface LinkedAssignment {
  id: string;
  title: string;
  status: string;
  assignment_type: string;
  due_at: string | null;
}

interface ClassEditPanelProps {
  cls: ClassCardData | null;
  getToken: () => Promise<string | null>;
  /** Teacher-scoped token, needed to create a Teams meeting. */
  getTeacherToken: () => Promise<string | null>;
  onCreateMeeting: (cls: ClassCardData) => void;
  onCreateAssignment: (cls: ClassCardData) => void;
  /** Opens the shared link picker. The page owns it, so the planner card menu
   *  and this panel reach the same dialog. */
  onLinkExisting: (cls: ClassCardData) => void;
  onChanged: () => void;
  onNotify: (message: string, severity?: 'success' | 'error') => void;
  /** Bumped by the page after an outside link or create, to force a reload. */
  refreshKey?: number;
}

/**
 * The planner's right rail: everything about the selected class in one column.
 *
 * Three questions a teacher asks while planning, answered in order: is the
 * meeting set up, what work does this class hand out, and will the recording
 * land on its own afterwards.
 */
export default function ClassEditPanel({
  cls,
  getToken,
  onCreateMeeting,
  onCreateAssignment,
  onLinkExisting,
  onChanged,
  onNotify,
  refreshKey = 0,
}: ClassEditPanelProps) {
  const theme = useTheme();
  const [assignments, setAssignments] = useState<LinkedAssignment[]>([]);
  const [loading, setLoading] = useState(false);
  const [autoSync, setAutoSync] = useState(true);
  const [busy, setBusy] = useState(false);

  const classId = cls?.id ?? null;

  useEffect(() => {
    setAutoSync((cls as any)?.auto_sync_recording !== false);
  }, [cls]);

  const loadAssignments = useCallback(async () => {
    if (!classId) return;
    setLoading(true);
    try {
      const token = await getToken();
      if (!token) return;
      const res = await fetch(`/api/timetable/${classId}/assignments`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setAssignments(data.assignments || []);
      }
    } catch {
      /* the empty state covers this */
    } finally {
      setLoading(false);
    }
    // refreshKey is a deliberate dependency: linking happens in a dialog the
    // page owns, so the panel has no other way to learn about it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classId, getToken, refreshKey]);

  useEffect(() => {
    loadAssignments();
  }, [loadAssignments]);

  const unlinkAssignment = async (assignmentId: string) => {
    if (!classId) return;
    setBusy(true);
    try {
      const token = await getToken();
      const res = await fetch(`/api/timetable/${classId}/assignments`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ assignment_id: assignmentId }),
      });
      if (res.ok) {
        onNotify('Assignment unlinked. It is still in the assignments space.');
        await loadAssignments();
      }
    } finally {
      setBusy(false);
    }
  };

  const toggleAutoSync = async (next: boolean) => {
    if (!cls) return;
    setAutoSync(next); // optimistic: the switch should not lag the tap
    try {
      const token = await getToken();
      const res = await fetch('/api/timetable', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          id: cls.id,
          classroom_id: cls.classroom?.id,
          auto_sync_recording: next,
        }),
      });
      if (!res.ok) {
        setAutoSync(!next);
        onNotify('Could not change the recording setting', 'error');
      } else {
        onChanged();
      }
    } catch {
      setAutoSync(!next);
      onNotify('Could not change the recording setting', 'error');
    }
  };

  if (!cls) {
    return (
      <Box
        sx={{
          border: `1px dashed ${theme.palette.divider}`,
          borderRadius: RADIUS.card,
          p: 4,
          textAlign: 'center',
        }}
      >
        <Typography variant="body2" color="text.secondary">
          Pick a day to set up its class.
        </Typography>
      </Box>
    );
  }

  const isDraft = (cls as any).publish_state === 'draft';
  const hasMeeting = !!cls.teams_meeting_id;
  // Built in IST explicitly: a 9 PM class must not read as "ended" to a browser
  // in another timezone, nor stay open past midnight here.
  const hasEnded = new Date(`${cls.scheduled_date}T${cls.end_time}+05:30`).getTime() < Date.now();

  return (
    <Box
      sx={{
        border: `1px solid ${theme.palette.divider}`,
        borderRadius: RADIUS.card,
        bgcolor: 'background.paper',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <Box sx={{ p: 2, borderBottom: `1px solid ${theme.palette.divider}` }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.75 }}>
          <Typography
            sx={{
              fontSize: '0.6563rem',
              fontWeight: 700,
              letterSpacing: '.1em',
              textTransform: 'uppercase',
              color: 'primary.main',
            }}
          >
            Editing
          </Typography>
          {isDraft && (
            <Box component="span" sx={tagSx(theme, 'neutral')}>
              Draft
            </Box>
          )}
        </Box>
        <Typography sx={{ fontWeight: 800, fontSize: '1rem', lineHeight: 1.25 }}>
          {cls.title}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {[cls.teacher?.name, `${formatTime(cls.start_time)} to ${formatTime(cls.end_time)}`]
            .filter(Boolean)
            .join(' · ')}
        </Typography>
      </Box>

      {/* Teams meeting */}
      <Box sx={{ p: 2, borderBottom: `1px solid ${theme.palette.divider}` }}>
        <SectionLabel>Teams meeting</SectionLabel>
        {hasMeeting ? (
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1.125,
              bgcolor: alpha(theme.palette.success.main, 0.1),
              borderRadius: RADIUS.control,
              px: 1.375,
              py: 1.125,
            }}
          >
            <VideocamIcon sx={{ fontSize: 18, color: 'success.dark' }} />
            <Typography variant="body2" sx={{ fontWeight: 700, color: 'success.dark', flex: 1 }}>
              {cls.teams_meeting_scope === 'channel_meeting' ? 'Synced from Teams' : 'Meeting ready'}
            </Typography>
          </Box>
        ) : (
          <Button
            fullWidth
            variant="outlined"
            startIcon={<VideocamIcon />}
            onClick={() => onCreateMeeting(cls)}
            sx={{ textTransform: 'none', minHeight: 44, borderRadius: RADIUS.control }}
          >
            Create Teams meeting
          </Button>
        )}
      </Box>

      {/* Assignment */}
      <Box sx={{ p: 2, borderBottom: `1px solid ${theme.palette.divider}` }}>
        <SectionLabel>Assignment</SectionLabel>

        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
            <CircularProgress size={20} />
          </Box>
        ) : assignments.length > 0 ? (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {assignments.map((a) => (
              <Box
                key={a.id}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1.125,
                  border: `1px solid ${theme.palette.divider}`,
                  borderRadius: RADIUS.control,
                  p: 1.375,
                }}
              >
                <Box
                  sx={{
                    width: 26,
                    height: 26,
                    borderRadius: 1,
                    flexShrink: 0,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    bgcolor: alpha(theme.palette.primary.main, 0.1),
                    color: 'primary.dark',
                  }}
                >
                  <DescriptionOutlinedIcon sx={{ fontSize: 15 }} />
                </Box>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography sx={{ fontWeight: 700, fontSize: '0.7813rem', lineHeight: 1.3 }} noWrap>
                    {a.title}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {a.status === 'published' ? 'Published' : 'Draft'}
                    {a.due_at
                      ? `, due ${new Date(a.due_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`
                      : ''}
                  </Typography>
                </Box>
                <Button
                  size="small"
                  onClick={() => unlinkAssignment(a.id)}
                  disabled={busy}
                  aria-label={`Unlink ${a.title}`}
                  sx={{ minWidth: 40, minHeight: 40, color: 'text.disabled' }}
                >
                  <LinkOffIcon fontSize="small" />
                </Button>
              </Box>
            ))}
          </Box>
        ) : (
          <Box
            sx={{
              border: `1px dashed ${theme.palette.divider}`,
              borderRadius: RADIUS.control,
              p: 1.5,
              textAlign: 'center',
            }}
          >
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.125 }}>
              No assignment linked yet
            </Typography>
            <Box sx={{ display: 'flex', gap: 0.875, justifyContent: 'center', flexWrap: 'wrap' }}>
              {/* Never disabled. Whether anything is linkable is the dialog's
                  story to tell, and it tells it in words. */}
              <Button
                size="small"
                variant="outlined"
                onClick={() => onLinkExisting(cls)}
                sx={{ textTransform: 'none', minHeight: 44, borderRadius: RADIUS.control }}
              >
                Link existing
              </Button>
              <Button
                size="small"
                variant="contained"
                onClick={() => onCreateAssignment(cls)}
                sx={{ textTransform: 'none', minHeight: 44, borderRadius: RADIUS.control }}
              >
                Create new
              </Button>
            </Box>
          </Box>
        )}

        {/* Attaching more work to a class that already has some. */}
        {!loading && assignments.length > 0 && (
          <Box sx={{ display: 'flex', gap: 0.875, mt: 1.25, flexWrap: 'wrap' }}>
            <Button
              size="small"
              onClick={() => onLinkExisting(cls)}
              sx={{ textTransform: 'none', minHeight: 40, borderRadius: RADIUS.control }}
            >
              Link another
            </Button>
            <Button
              size="small"
              onClick={() => onCreateAssignment(cls)}
              sx={{ textTransform: 'none', minHeight: 40, borderRadius: RADIUS.control }}
            >
              Create new
            </Button>
          </Box>
        )}
      </Box>

      {/* Recording */}
      <Box sx={{ p: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
        <Box>
          <SectionLabel>Recording</SectionLabel>
          <Typography variant="caption" color="text.secondary">
            {autoSync ? 'Auto-sync after class' : 'Attach it yourself later'}
          </Typography>
        </Box>
        <Switch
          checked={autoSync}
          onChange={(e) => toggleAutoSync(e.target.checked)}
          inputProps={{ 'aria-label': 'Auto-sync the recording after class' }}
        />
      </Box>

      {/* Wrap up. Only after the class has ended: beforehand there is nothing to
          report, and the create dialog already covers editing a future class. */}
      {hasEnded && (
        <>
          <Divider />
          <Box sx={{ p: 2 }}>
            <SectionLabel>Wrap up</SectionLabel>
            <WrapUpSection
              cls={cls}
              getToken={getToken}
              onSaved={onChanged}
              onNotify={onNotify}
            />
          </Box>
        </>
      )}

      <Divider />
    </Box>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <Typography
      sx={{
        fontSize: '0.625rem',
        fontWeight: 700,
        letterSpacing: '.06em',
        textTransform: 'uppercase',
        color: 'text.disabled',
        mb: 1,
        display: 'block',
      }}
    >
      {children}
    </Typography>
  );
}
