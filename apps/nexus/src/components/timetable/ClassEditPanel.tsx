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
import type { ClassCardData } from './ClassCard';
import { formatTime, hasClassEnded } from './date-utils';
import { RADIUS, tagSx } from './timetable-theme';
import WrapUpSection from './WrapUpSection';
import ClassAssignmentsSection from './ClassAssignmentsSection';
import ClassPrepTestSection from './ClassPrepTestSection';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';

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
  /** Opens the prep-test dialog. The page owns it, like the assignment picker. */
  onSetPrepTest: (cls: ClassCardData) => void;
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
  onSetPrepTest,
  onChanged,
  onNotify,
  refreshKey = 0,
}: ClassEditPanelProps) {
  const theme = useTheme();
  const { featureFlags } = useNexusAuthContext();
  // Staff flag, so it defaults on per the registry invariant. Switch it off from
  // /teacher/admin/features to hide the section without a deploy.
  const prepTestEnabled = featureFlags?.['staff.class-prep-test'] !== false;
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
  // hasClassEnded builds the boundary in IST explicitly: a 9 PM class must not
  // read as "ended" to a browser in another timezone, nor stay open past
  // midnight here.
  const hasEnded = hasClassEnded(cls);

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

      {/* Assignment. The list itself is ClassAssignmentsSection, shared with
          the class detail panel so Day, Week and Month get the same affordance
          this rail used to keep to itself. */}
      <Box sx={{ p: 2, borderBottom: `1px solid ${theme.palette.divider}` }}>
        <ClassAssignmentsSection
          cls={cls}
          getToken={getToken}
          editable
          assignments={loading ? [] : (assignments as any)}
          onLinkExisting={onLinkExisting}
          onCreateAssignment={onCreateAssignment}
          onNotify={onNotify}
          header={<SectionLabel>Assignment</SectionLabel>}
        />
      </Box>

      {/* Test before the class. Sits directly under Assignment because the two
          together are what a student owes before they may join, and a teacher
          setting one almost always wants to check the other. */}
      {prepTestEnabled && (
        <Box sx={{ p: 2, borderBottom: `1px solid ${theme.palette.divider}` }}>
          <ClassPrepTestSection
            cls={cls}
            getToken={getToken}
            editable
            refreshKey={refreshKey}
            onSetTest={onSetPrepTest}
            onNotify={onNotify}
            header={<SectionLabel>Test before class</SectionLabel>}
          />
        </Box>
      )}

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
