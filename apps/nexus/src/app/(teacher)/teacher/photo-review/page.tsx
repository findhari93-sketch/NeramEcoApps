'use client';

/**
 * Photo Review (teacher): approve or reject student profile photos.
 *
 * Every photo is judged by a human, there is no AI check. The "Needs review"
 * tab doubles as the one-time bulk backfill grid for photos that already
 * existed before the rule came in, which is why it is built around
 * select-many-then-approve rather than one decision per screen.
 *
 * Mobile-first: two columns at 375px, cards big enough to actually judge a face
 * on a phone, and tap-to-enlarge through the shared ImageViewerDialog for the
 * ones that are borderline.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  IconButton,
  MenuItem,
  Skeleton,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
  ImageViewerDialog,
  alpha,
} from '@neram/ui';
import CloseIcon from '@mui/icons-material/Close';
import SendIcon from '@mui/icons-material/Send';
import UndoIcon from '@mui/icons-material/Undo';
import SearchIcon from '@mui/icons-material/Search';
import CloudSyncOutlinedIcon from '@mui/icons-material/CloudSyncOutlined';
import { useAuthFetch } from '@/components/curriculum/shared';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import { useNavBadges } from '@/components/NavBadgeProvider';
import RejectPhotoDialog from '@/components/photo-review/RejectPhotoDialog';
import type { PhotoStatus } from '@/lib/photo-gate';
import { photoOriginLabel, type PhotoOrigin } from '@/lib/photo-origin';
import StudentAvatar from '@/components/students/StudentAvatar';

interface ReviewRow {
  student: { id: string; name: string | null; email: string | null; avatar_url: string | null };
  photo_status: PhotoStatus;
  photo_submitted_at: string | null;
  photo_reviewed_at: string | null;
  photo_rejection_reason: string | null;
  nexus_last_login_at: string | null;
  photo_origin: PhotoOrigin | null;
}

interface ReviewData {
  counts: Record<PhotoStatus, number>;
  rows: ReviewRow[];
  status: PhotoStatus;
}

const TABS: { value: PhotoStatus; label: string }[] = [
  { value: 'pending', label: 'Needs review' },
  { value: 'missing', label: 'No photo' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'approved', label: 'Approved' },
];

const EMPTY_COUNTS: Record<PhotoStatus, number> = {
  pending: 0,
  missing: 0,
  rejected: 0,
  approved: 0,
};

function formatDay(iso: string | null): string {
  if (!iso) return 'never';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'never';
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

export default function PhotoReviewPage() {
  const authFetch = useAuthFetch();
  const { loading: authLoading, classrooms, activeClassroom, getTeacherToken } =
    useNexusAuthContext();
  const { refreshBadges } = useNavBadges();

  const [classroomId, setClassroomId] = useState('');
  const [tab, setTab] = useState<PhotoStatus>('pending');
  const [data, setData] = useState<ReviewData | null>(null);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewing, setViewing] = useState<ReviewRow | null>(null);
  const [rejecting, setRejecting] = useState<ReviewRow[] | null>(null);
  const [nudging, setNudging] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  // Photos whose URL 404s. Some stored avatar_urls point at objects that are
  // gone, and a broken <img> in a face-judging grid is worse than useless.
  const [broken, setBroken] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (activeClassroom?.id && !classroomId) setClassroomId(activeClassroom.id);
  }, [activeClassroom, classroomId]);

  const load = useCallback(async () => {
    if (!classroomId) return;
    setData(null);
    setSelected(new Set());
    setBroken(new Set());
    setError(null);
    try {
      const res = (await authFetch(
        `/api/photo-review?classroom=${classroomId}&status=${tab}`,
      )) as ReviewData;
      setData(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load the review queue.');
      setData({ counts: EMPTY_COUNTS, rows: [], status: tab });
    }
  }, [authFetch, classroomId, tab]);

  useEffect(() => {
    if (!authLoading && classroomId) load();
  }, [authLoading, classroomId, load]);

  const visibleRows = useMemo(() => {
    const rows = data?.rows || [];
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      (r.student.name || r.student.email || '').toLowerCase().includes(q),
    );
  }, [data, search]);

  const toggle = (id: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const allVisibleSelected =
    visibleRows.length > 0 && visibleRows.every((r) => selected.has(r.student.id));

  const toggleAll = () =>
    setSelected((s) => {
      const next = new Set(s);
      if (allVisibleSelected) visibleRows.forEach((r) => next.delete(r.student.id));
      else visibleRows.forEach((r) => next.add(r.student.id));
      return next;
    });

  const decide = useCallback(
    async (decisions: { studentId: string; decision: PhotoStatus; reason?: string }[]) => {
      if (decisions.length === 0) return;
      setSaving(true);
      setError(null);
      try {
        const token = await getTeacherToken();
        const res = await fetch('/api/photo-review', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ decisions }),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(body.error || 'Could not save the decision.');
        }
        setRejecting(null);

        // Say plainly whether the approved photo reached Microsoft. It fails for
        // real reasons (an account with no mailbox, consent not granted yet) and
        // a teacher who is told "approved" while Teams still shows initials has
        // been misled.
        const ms: { status: string }[] = Array.isArray(body.microsoft) ? body.microsoft : [];
        if (ms.length > 0) {
          const synced = ms.filter((m) => m.status === 'synced').length;
          const off = ms.filter((m) => m.status === 'disabled').length;
          if (off === ms.length) {
            setNotice(`Approved ${ms.length}. Copying photos to Microsoft is switched off.`);
          } else if (synced === ms.length) {
            setNotice(`Approved ${ms.length}, and copied to Microsoft.`);
          } else {
            setNotice(
              `Approved ${ms.length}. ${synced} copied to Microsoft, ${ms.length - synced} could not be copied.`,
            );
          }
        }

        await load();
        refreshBadges();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not save the decision.');
      } finally {
        setSaving(false);
      }
    },
    [getTeacherToken, load, refreshBadges],
  );

  /** Remind the "No photo" students. They are exactly who the gate will block. */
  const remindNoPhoto = useCallback(async () => {
    const ids = visibleRows.filter((r) => selected.has(r.student.id)).map((r) => r.student.id);
    if (ids.length === 0) return;
    setNudging(true);
    setError(null);
    try {
      const token = await getTeacherToken();
      const res = await fetch('/api/assignments/nudge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          studentIds: ids,
          subject: 'Add your profile photo',
          template: 'photo_required',
          body:
            'Please add a clear photo of your face to your Nexus profile. ' +
            'Open Nexus, go to Profile, and tap the camera on your picture. ' +
            'Soon you will need an approved photo to open Nexus.',
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Could not send the reminder.');
      }
      const body = await res.json();
      setNotice(`Reminder sent to ${body.counts?.total ?? ids.length} students.`);
      setSelected(new Set());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send the reminder.');
    } finally {
      setNudging(false);
    }
  }, [getTeacherToken, selected, visibleRows]);

  /**
   * Pull Microsoft photos for this roster now. Students often set their picture
   * on myaccount.microsoft.com instead of here, and the weekly background job is
   * too slow a loop for a teacher sitting in front of the queue. Anything new
   * comes back as "Needs review", so the decision stays with the teacher.
   */
  const checkMicrosoft = useCallback(async () => {
    if (!classroomId) return;
    setSyncing(true);
    setError(null);
    setNotice(null);
    try {
      const token = await getTeacherToken();
      const res = await fetch('/api/photo-review/sync-microsoft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ classroomId }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'Could not check Microsoft.');

      const pulled = body.counts?.pulled ?? 0;
      const parts = [
        pulled > 0
          ? `${pulled} new or changed ${pulled === 1 ? 'photo' : 'photos'} added to Needs review.`
          : 'No new photos on Microsoft.',
      ];
      if (body.withoutMicrosoftAccount > 0) {
        parts.push(`${body.withoutMicrosoftAccount} without a Microsoft account were not checked.`);
      }
      if (body.skipped > 0) {
        parts.push(`${body.skipped} were not checked this time, run it again to finish.`);
      }
      setNotice(parts.join(' '));
      await load();
      refreshBadges();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not check Microsoft.');
    } finally {
      setSyncing(false);
    }
  }, [classroomId, getTeacherToken, load, refreshBadges]);

  const counts = data?.counts || EMPTY_COUNTS;
  const selectedRows = visibleRows.filter((r) => selected.has(r.student.id));

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 960, mx: 'auto', pb: selected.size ? 12 : 3 }}>
      <Typography variant="h5" sx={{ fontWeight: 800, fontSize: { xs: '1.3rem', sm: '1.5rem' } }}>
        Photo Review
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Every student needs a clear photo of their own face. You decide, nothing is automatic. An
        approved photo becomes their Microsoft and Teams picture too.
      </Typography>

      <Button
        variant="outlined"
        size="small"
        startIcon={<CloudSyncOutlinedIcon />}
        onClick={checkMicrosoft}
        disabled={syncing || !classroomId}
        sx={{ mb: 2, minHeight: 44, textTransform: 'none' }}
      >
        {syncing ? 'Checking Microsoft...' : 'Check Microsoft for new photos'}
      </Button>

      {classrooms.length > 1 && (
        <TextField
          select
          size="small"
          label="Classroom"
          value={classroomId}
          onChange={(e) => setClassroomId(e.target.value)}
          sx={{ mb: 2, minWidth: 220 }}
        >
          {classrooms.map((c) => (
            <MenuItem key={c.id} value={c.id}>
              {c.name}
            </MenuItem>
          ))}
        </TextField>
      )}

      <ToggleButtonGroup
        value={tab}
        exclusive
        size="small"
        onChange={(_, v) => v && setTab(v)}
        sx={{
          mb: 1.5,
          flexWrap: 'wrap',
          '& .MuiToggleButton-root': { textTransform: 'none', minHeight: 44, px: 1.5 },
        }}
      >
        {TABS.map((t) => (
          <ToggleButton key={t.value} value={t.value}>
            {t.label}
            <Chip
              label={counts[t.value]}
              size="small"
              sx={{ ml: 0.75, height: 18, fontSize: '0.65rem', fontWeight: 700 }}
            />
          </ToggleButton>
        ))}
      </ToggleButtonGroup>

      <TextField
        size="small"
        placeholder="Search students"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        InputProps={{
          startAdornment: <SearchIcon sx={{ fontSize: 18, mr: 0.5, color: 'text.disabled' }} />,
        }}
        sx={{ mb: 1.5, width: '100%' }}
      />

      {error && (
        <Alert severity="error" sx={{ mb: 1.5 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}
      {notice && (
        <Alert severity="success" sx={{ mb: 1.5 }} onClose={() => setNotice(null)}>
          {notice}
        </Alert>
      )}

      {tab === 'missing' && (
        <Alert severity="warning" sx={{ mb: 1.5 }}>
          These students have no photo. Once the photo rule is switched on, they cannot open Nexus
          until they add one. Remind them before you switch it on.
        </Alert>
      )}
      {tab === 'pending' && counts.pending > 0 && (
        <Alert severity="info" sx={{ mb: 1.5 }}>
          Tap a photo to see it full size. Select the good ones and approve them together. The
          label under each name says where the photo came from. Most were picked up automatically
          from Microsoft or Google sign-in, so the student never chose them.
        </Alert>
      )}

      {data === null ? (
        <Box
          sx={{
            display: 'grid',
            gap: 1.25,
            gridTemplateColumns: {
              xs: 'repeat(2, 1fr)',
              sm: 'repeat(3, 1fr)',
              md: 'repeat(4, 1fr)',
            },
          }}
        >
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} variant="rounded" height={190} sx={{ borderRadius: 2 }} />
          ))}
        </Box>
      ) : visibleRows.length === 0 ? (
        <Box
          sx={{
            textAlign: 'center',
            py: 6,
            border: '1.5px dashed',
            borderColor: 'divider',
            borderRadius: 3,
          }}
        >
          <Typography variant="body2" color="text.disabled">
            {tab === 'pending' ? 'Nothing waiting for you. Well done.' : 'No students here.'}
          </Typography>
        </Box>
      ) : (
        <>
          <Stack direction="row" alignItems="center" sx={{ mb: 0.5, px: 0.5 }}>
            <Checkbox
              checked={allVisibleSelected}
              indeterminate={selected.size > 0 && !allVisibleSelected}
              onChange={toggleAll}
              sx={{ p: 1 }}
            />
            <Typography variant="caption" color="text.secondary">
              Select all ({visibleRows.length})
            </Typography>
          </Stack>

          <Box
            sx={{
              display: 'grid',
              gap: 1.25,
              gridTemplateColumns: {
                xs: 'repeat(2, 1fr)',
                sm: 'repeat(3, 1fr)',
                md: 'repeat(4, 1fr)',
              },
            }}
          >
            {visibleRows.map((r) => {
              const isSelected = selected.has(r.student.id);
              const isBroken = broken.has(r.student.id);
              const hasPhoto = !!r.student.avatar_url && !isBroken;
              const originLabel = photoOriginLabel(r.photo_origin);
              return (
                <Box
                  key={r.student.id}
                  sx={{
                    borderRadius: 2,
                    overflow: 'hidden',
                    border: '2px solid',
                    borderColor: isSelected ? 'primary.main' : 'divider',
                    bgcolor: isSelected ? alpha('#1565C0', 0.05) : 'background.paper',
                  }}
                >
                  <Box sx={{ position: 'relative', aspectRatio: '1', bgcolor: 'action.hover' }}>
                    {hasPhoto ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={r.student.avatar_url as string}
                        alt={r.student.name || 'Student photo'}
                        onClick={() => setViewing(r)}
                        onError={() =>
                          setBroken((s) => new Set(s).add(r.student.id))
                        }
                        style={{
                          width: '100%',
                          height: '100%',
                          objectFit: 'cover',
                          display: 'block',
                          cursor: 'zoom-in',
                        }}
                      />
                    ) : (
                      <Stack
                        alignItems="center"
                        justifyContent="center"
                        spacing={0.5}
                        sx={{ height: '100%', px: 1 }}
                      >
                        <StudentAvatar
                          userId={r.student.id}
                          name={r.student.name}
                          size={56}
                          clickable={false}
                          tapToView={false}
                        />
                        {isBroken && (
                          <Typography
                            variant="caption"
                            color="warning.dark"
                            sx={{ textAlign: 'center', lineHeight: 1.3 }}
                          >
                            Photo did not load
                          </Typography>
                        )}
                      </Stack>
                    )}

                    <Checkbox
                      checked={isSelected}
                      onChange={() => toggle(r.student.id)}
                      sx={{
                        position: 'absolute',
                        top: 2,
                        left: 2,
                        p: 1.5,
                        bgcolor: alpha('#fff', 0.82),
                        borderRadius: '50%',
                        '&:hover': { bgcolor: alpha('#fff', 0.95) },
                      }}
                    />

                    {hasPhoto && (
                      <IconButton
                        aria-label={`Ask ${r.student.name || 'this student'} for a new photo`}
                        onClick={() => setRejecting([r])}
                        sx={{
                          position: 'absolute',
                          bottom: 4,
                          right: 4,
                          width: 44,
                          height: 44,
                          bgcolor: alpha('#fff', 0.9),
                          color: 'warning.dark',
                          '&:hover': { bgcolor: alpha('#fff', 1) },
                        }}
                      >
                        <CloseIcon fontSize="small" />
                      </IconButton>
                    )}
                  </Box>

                  <Box sx={{ p: 1 }}>
                    <Typography variant="body2" sx={{ fontWeight: 600, fontSize: 14 }} noWrap>
                      {r.student.name || r.student.email}
                    </Typography>
                    {originLabel && (
                      <Chip
                        label={originLabel}
                        size="small"
                        variant="outlined"
                        color={r.photo_origin === 'upload' ? 'primary' : 'default'}
                        sx={{ height: 20, fontSize: '0.65rem', mt: 0.25, maxWidth: '100%' }}
                      />
                    )}
                    {tab === 'missing' && (
                      <Typography variant="caption" color="text.secondary">
                        Last opened Nexus: {formatDay(r.nexus_last_login_at)}
                      </Typography>
                    )}
                    {tab === 'rejected' && r.photo_rejection_reason && (
                      <Typography variant="caption" color="warning.dark" sx={{ display: 'block' }}>
                        {r.photo_rejection_reason}
                      </Typography>
                    )}
                    {tab === 'approved' && (
                      <Button
                        size="small"
                        startIcon={<UndoIcon sx={{ fontSize: 16 }} />}
                        onClick={() =>
                          decide([{ studentId: r.student.id, decision: 'pending' }])
                        }
                        disabled={saving}
                        sx={{ minHeight: 36, textTransform: 'none', px: 0.5 }}
                      >
                        Undo approval
                      </Button>
                    )}
                  </Box>
                </Box>
              );
            })}
          </Box>
        </>
      )}

      {/* Sticky action bar */}
      {selected.size > 0 && (
        <Box
          sx={{
            position: 'fixed',
            left: 0,
            right: 0,
            bottom: 0,
            p: 1.5,
            bgcolor: 'background.paper',
            borderTop: '1px solid',
            borderColor: 'divider',
            display: 'flex',
            alignItems: 'center',
            gap: 1.5,
            zIndex: 1200,
          }}
        >
          <Typography variant="body2" sx={{ fontWeight: 600, flex: 1 }}>
            {selected.size} selected
          </Typography>
          <Button
            variant="outlined"
            onClick={() => setSelected(new Set())}
            sx={{ minHeight: 48, textTransform: 'none' }}
          >
            Clear
          </Button>
          {tab === 'missing' ? (
            <Button
              variant="contained"
              startIcon={<SendIcon />}
              onClick={remindNoPhoto}
              disabled={nudging}
              sx={{ minHeight: 48, textTransform: 'none', fontWeight: 700 }}
            >
              {nudging ? 'Sending...' : 'Send a reminder'}
            </Button>
          ) : (
            <Button
              variant="contained"
              onClick={() =>
                decide(selectedRows.map((r) => ({ studentId: r.student.id, decision: 'approved' })))
              }
              disabled={saving}
              sx={{ minHeight: 48, textTransform: 'none', fontWeight: 700 }}
            >
              {saving ? 'Saving...' : 'Approve selected'}
            </Button>
          )}
        </Box>
      )}

      <ImageViewerDialog
        open={!!viewing}
        onClose={() => setViewing(null)}
        src={viewing?.student.avatar_url || ''}
        name={viewing?.student.name}
      />

      <RejectPhotoDialog
        open={!!rejecting}
        studentNames={(rejecting || []).map((r) => r.student.name || 'This student')}
        saving={saving}
        onClose={() => setRejecting(null)}
        onConfirm={(reason) =>
          decide(
            (rejecting || []).map((r) => ({
              studentId: r.student.id,
              decision: 'rejected' as PhotoStatus,
              reason,
            })),
          )
        }
      />
    </Box>
  );
}
