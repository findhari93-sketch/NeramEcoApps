'use client';

/**
 * "Watch before class" on the class panel's Class tab, for both roles.
 *
 * Student: the videos, each with their own Watched or Started tick. Tapping one
 *          opens the watch page inside Nexus.
 * Teacher: the same videos with "12 of 30 watched" under each, Edit (the
 *          picker, saved straight away), and See who.
 *
 * Fetches for itself when the panel opens, the way ClassResourcesSection does,
 * so the weekly timetable payload (the busiest response in the app) stays as
 * it is. Renders nothing when the feature is off, or a student's class has no
 * videos.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Box, Button, Dialog, IconButton, Skeleton, Typography, useMediaQuery, useTheme } from '@neram/ui';
import CloseIcon from '@mui/icons-material/Close';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import PeopleAltOutlinedIcon from '@mui/icons-material/PeopleAltOutlined';
import { RADIUS } from '../timetable-theme';
import PrewatchVideoRow, { PrewatchStateBadge } from './PrewatchVideoRow';
import PrewatchPickerDialog from './PrewatchPickerDialog';
import PrewatchWhoWatchedSheet from './PrewatchWhoWatchedSheet';
import PrewatchPlayer from './PrewatchPlayer';
import { candidateOfItem, picksOf } from './prewatch-client';
import type { PrewatchItem } from '@/lib/prewatch';
import type { PrewatchCandidate } from '@/lib/prewatch-suggest';

interface PrewatchSectionProps {
  classId: string;
  classTitle: string;
  role: 'teacher' | 'student';
  isUpcoming: boolean;
  courseTopicId?: string | null;
  classroomId?: string | null;
  getToken: () => Promise<string | null>;
  onNotify: (message: string, severity?: 'success' | 'error' | 'warning') => void;
}

interface Loaded {
  enabled: boolean;
  canEdit: boolean;
  items: PrewatchItem[];
  total: number;
}

export default function PrewatchSection({
  classId,
  classTitle,
  role,
  isUpcoming,
  courseTopicId,
  classroomId,
  getToken,
  onNotify,
}: PrewatchSectionProps) {
  const router = useRouter();
  const [data, setData] = useState<Loaded | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [whoOpen, setWhoOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  // Staff preview in a dialog: the watch page is a student route.
  const [preview, setPreview] = useState<PrewatchItem | null>(null);
  const theme = useTheme();
  const phone = useMediaQuery(theme.breakpoints.down('sm'));
  const isTeacher = role === 'teacher';

  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;

  // Keyed on the class only: a fresh getToken each render must not refetch.
  const load = useCallback(async () => {
    try {
      const token = await getTokenRef.current();
      if (!token) return;
      const res = await fetch(`/api/timetable/${classId}/prewatch`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) {
        setData({ enabled: false, canEdit: false, items: [], total: 0 });
        return;
      }
      const body = await res.json();
      setData({ enabled: !!body.enabled, canEdit: !!body.canEdit, items: body.items || [], total: body.total ?? 0 });
    } catch {
      setData({ enabled: false, canEdit: false, items: [], total: 0 });
    }
  }, [classId]);

  useEffect(() => {
    setData(null);
    void load();
  }, [load]);

  const save = async (next: PrewatchCandidate[]) => {
    setSaving(true);
    try {
      const token = await getToken();
      const res = await fetch(`/api/timetable/${classId}/prewatch`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ items: picksOf(next) }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        onNotify(body.error || 'Could not save the videos', 'error');
        return;
      }
      setData({ enabled: true, canEdit: true, items: body.items || [], total: body.total ?? 0 });
      onNotify(next.length ? 'Videos saved. New links appear when you share the class.' : 'Videos removed.', 'success');
    } catch {
      onNotify('Could not save the videos', 'error');
    } finally {
      setSaving(false);
    }
  };

  // Still loading: a quiet placeholder that holds the space, never a spinner.
  if (!data) {
    return isTeacher ? <Skeleton variant="rounded" height={56} aria-label="Loading videos to watch" /> : null;
  }
  if (!data.enabled) return null;
  if (!data.items.length && !(isTeacher && data.canEdit && isUpcoming)) return null;

  const heading = isUpcoming ? 'Watch before class' : 'Videos for this class';
  const watchHref = (item: PrewatchItem) => `/student/timetable/${classId}/watch/${item.id}`;

  return (
    <Box component="section" aria-labelledby={`prewatch-${classId}`}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.75 }}>
        <Typography id={`prewatch-${classId}`} variant="caption" color="text.secondary" sx={{ fontWeight: 700, flex: 1 }}>
          {heading}
          {isUpcoming && !isTeacher ? ' (optional)' : ''}
        </Typography>
        {isTeacher && data.items.length > 0 && (
          <Button
            size="small"
            startIcon={<PeopleAltOutlinedIcon />}
            onClick={() => setWhoOpen(true)}
            sx={{ textTransform: 'none', minHeight: 44 }}
          >
            See who
          </Button>
        )}
        {isTeacher && data.canEdit && data.items.length > 0 && (
          <Button
            size="small"
            startIcon={<EditOutlinedIcon />}
            onClick={() => setPickerOpen(true)}
            disabled={saving}
            sx={{ textTransform: 'none', minHeight: 44 }}
          >
            Edit
          </Button>
        )}
      </Box>

      {data.items.length > 0 ? (
        <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, display: 'flex', flexDirection: 'column', gap: 0.75 }}>
          {data.items.map((item) => (
            <Box component="li" key={item.id}>
              <PrewatchVideoRow
                dense
                video={{ ...item, subtitle: item.source_label }}
                onOpen={() => (isTeacher ? setPreview(item) : router.push(watchHref(item)))}
                openLabel={`Play ${item.title}`}
                trailing={!isTeacher ? <PrewatchStateBadge state={item.state} /> : undefined}
                footer={
                  isTeacher && item.summary ? (
                    <Typography variant="caption" sx={{ display: 'block', fontWeight: 600, color: 'text.primary', mt: 0.25 }}>
                      {item.summary.watched} of {item.summary.total} watched
                      {item.summary.started ? `, ${item.summary.started} started` : ''}
                    </Typography>
                  ) : undefined
                }
              />
            </Box>
          ))}
        </Box>
      ) : (
        <Button
          variant="outlined"
          onClick={() => setPickerOpen(true)}
          disabled={saving}
          sx={{ textTransform: 'none', minHeight: 44, borderRadius: RADIUS.control, borderStyle: 'dashed', width: '100%' }}
        >
          Add videos to watch before class
        </Button>
      )}

      {isTeacher && (
        <>
          <PrewatchPickerDialog
            open={pickerOpen}
            onClose={() => setPickerOpen(false)}
            value={data.items.map(candidateOfItem)}
            onDone={(next) => void save(next)}
            context={{
              q: classTitle,
              courseTopicId,
              classroomIds: classroomId ? [classroomId] : [],
              excludeClassId: classId,
            }}
            getToken={getToken}
          />
          <Dialog
            open={!!preview}
            onClose={() => setPreview(null)}
            fullScreen={phone}
            maxWidth="md"
            fullWidth
            aria-label={preview ? `Preview: ${preview.title}` : 'Preview'}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 2, py: 1, borderBottom: 1, borderColor: 'divider' }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 700, flex: 1, minWidth: 0, overflowWrap: 'anywhere' }}>
                {preview?.title}
              </Typography>
              <IconButton onClick={() => setPreview(null)} aria-label="Close preview" sx={{ width: 48, height: 48 }}>
                <CloseIcon />
              </IconButton>
            </Box>
            {preview && <PrewatchPlayer classId={classId} resourceId={preview.id} getToken={getToken} />}
            <Typography variant="caption" color="text.secondary" sx={{ px: 2, py: 1.25 }}>
              Your own watching is not counted. Students see this inside Nexus with their progress saved.
            </Typography>
          </Dialog>
          <PrewatchWhoWatchedSheet
            open={whoOpen}
            onClose={() => setWhoOpen(false)}
            classId={classId}
            items={data.items}
            getToken={getToken}
          />
        </>
      )}
    </Box>
  );
}
