'use client';

/**
 * Inactivity Watchlist (teacher): who has genuinely gone silent, ranked.
 *
 * Combines assignments, missed classes, Nexus logins and profile photo into one
 * score, then offers a recorded escalation ladder ending in removal from the
 * classroom. The system ranks and prepares; a teacher takes every step.
 *
 * Two honesty rules the UI must keep:
 *   1. When class attendance was never synced, missed classes are shown as "not
 *      measured", never as zero. An unmeasured signal must not look clean.
 *   2. Nothing here claims a student "did not respond" to a meeting. RSVP stores
 *      only opt-outs, so non-response is unrepresentable. See lib/inactivity-score.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  Divider,
  Drawer,
  MenuItem,
  Skeleton,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
  UserAvatar,
  alpha,
} from '@neram/ui';
import SearchIcon from '@mui/icons-material/Search';
import PhoneOutlinedIcon from '@mui/icons-material/PhoneOutlined';
import WhatsAppIcon from '@mui/icons-material/WhatsApp';
import { useAuthFetch } from '@/components/curriculum/shared';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import RemoveStudentDialog from '@/components/RemoveStudentDialog';
import {
  TIER_COLOR,
  TIER_LABEL,
  TIER_ORDER,
  type InactivityTier,
} from '@/lib/inactivity-score';
import {
  STAGE_LABEL,
  canRemove,
  nextAction,
  removalNote,
  type WatchlistAction,
  type WatchlistStage,
} from '@/lib/watchlist-templates';

interface WatchRow {
  student: { id: string; name: string | null; email: string | null; avatar_url: string | null };
  enrollment_id: string;
  tier: InactivityTier;
  score: number;
  reasons: string[];
  neverEngaged: boolean;
  unavailable: string[];
  signals: {
    applicable: number | null;
    submitted: number | null;
    days_since_last: number | null;
    no_shows: number | null;
    classes_measured: number | null;
    nexus_first_login_at: string | null;
    nexus_last_login_at: string | null;
    photo_status: string;
  };
  parent: {
    contact: string | null;
    emergency: string | null;
  };
  watchlist: {
    stage: WatchlistStage;
    stage_set_at: string | null;
    snoozed_until: string | null;
    notes: string | null;
  } | null;
}

interface WatchData {
  stats: Record<InactivityTier, number> & { total: number; attendanceMeasured: boolean };
  rows: WatchRow[];
}

const ACTION_LABEL: Record<WatchlistAction, string> = {
  nudge: 'Send a friendly nudge',
  warn: 'Send a warning',
  parent_contacted: 'Mark parent as contacted',
  final_notice: 'Send a final notice',
  removed: 'Remove from class',
  resolve: 'Mark as back on track',
  snooze: 'Snooze for 2 weeks',
  note: 'Add a note',
};

function formatDay(iso: string | null): string {
  if (!iso) return 'never';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'never';
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Digits only, so a stored "+91 98765 43210" still makes a valid wa.me link. */
function waNumber(phone: string): string {
  return phone.replace(/\D/g, '');
}

/**
 * parent_contact and emergency_contact are free text, so they can hold a name,
 * a note, or a number. Only offer call and WhatsApp when there is actually
 * something dialable, otherwise show the text as written.
 */
function isDialable(value: string): boolean {
  return waNumber(value).length >= 8;
}

export default function StudentWatchlistPage() {
  const authFetch = useAuthFetch();
  const {
    loading: authLoading,
    classrooms,
    activeClassroom,
    getTeacherToken,
    isAdmin,
  } = useNexusAuthContext();

  const [classroomId, setClassroomId] = useState('');
  const [data, setData] = useState<WatchData | null>(null);
  const [filter, setFilter] = useState<'all' | InactivityTier>('all');
  const [search, setSearch] = useState('');
  const [showSnoozed, setShowSnoozed] = useState(false);
  const [open, setOpen] = useState<WatchRow | null>(null);
  const [removing, setRemoving] = useState<WatchRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (activeClassroom?.id && !classroomId) setClassroomId(activeClassroom.id);
  }, [activeClassroom, classroomId]);

  const load = useCallback(async () => {
    if (!classroomId) return;
    setData(null);
    setError(null);
    try {
      const res = (await authFetch(
        `/api/students/inactivity?classroom=${classroomId}`,
      )) as WatchData;
      setData(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load the watchlist.');
    }
  }, [authFetch, classroomId]);

  useEffect(() => {
    if (!authLoading && classroomId) load();
  }, [authLoading, classroomId, load]);

  const today = new Date().toISOString().slice(0, 10);

  const visibleRows = useMemo(() => {
    const rows = data?.rows || [];
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (filter !== 'all' && r.tier !== filter) return false;
      if (q && !(r.student.name || r.student.email || '').toLowerCase().includes(q)) return false;
      if (!showSnoozed && r.watchlist?.snoozed_until && r.watchlist.snoozed_until > today) {
        return false;
      }
      return true;
    });
  }, [data, filter, search, showSnoozed, today]);

  const act = useCallback(
    async (row: WatchRow, action: WatchlistAction, extra?: { snoozeUntil?: string }) => {
      setBusy(true);
      setError(null);
      try {
        const token = await getTeacherToken();
        const res = await fetch('/api/students/watchlist', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            classroomId,
            studentIds: [row.student.id],
            action,
            reasons: row.reasons,
            score: row.score,
            tier: row.tier,
            snoozeUntil: extra?.snoozeUntil,
          }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || 'Could not record the action.');
        }
        setNotice(`${ACTION_LABEL[action]}: done for ${row.student.name || 'this student'}.`);
        setOpen(null);
        await load();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not record the action.');
      } finally {
        setBusy(false);
      }
    },
    [classroomId, getTeacherToken, load],
  );

  const stats = data?.stats;
  const stage: WatchlistStage = open?.watchlist?.stage ?? 'none';
  const step = open ? nextAction(stage) : null;
  const removable = open ? canRemove(stage, isAdmin) : false;

  return (
    <Box sx={{ pb: 3 }}>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Who has gone quiet, across assignments, classes, logins and profile photo. You decide every
        step, nothing happens on its own.
      </Typography>

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

      {stats && !stats.attendanceMeasured && (
        <Alert severity="info" sx={{ mb: 1.5 }}>
          Class attendance has not been synced for this period, so missed classes are not counted
          here. Sync attendance from a class page to include it.
        </Alert>
      )}
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

      {/* Stat tiles */}
      <Stack direction="row" spacing={1} sx={{ mb: 2 }} flexWrap="wrap" useFlexGap>
        {(['critical', 'watch', 'nudge', 'ok'] as InactivityTier[]).map((t) => (
          <Box
            key={t}
            sx={{
              flex: '1 1 120px',
              p: 1.5,
              borderRadius: 2,
              border: '1px solid',
              borderColor: 'divider',
              textAlign: 'center',
            }}
          >
            <Typography variant="h6" sx={{ fontWeight: 800, color: TIER_COLOR[t] }}>
              {stats?.[t] ?? 0}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {TIER_LABEL[t]}
            </Typography>
          </Box>
        ))}
      </Stack>

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ mb: 1.5 }}>
        <ToggleButtonGroup
          value={filter}
          exclusive
          size="small"
          onChange={(_, v) => v && setFilter(v)}
          sx={{ flexWrap: 'wrap', '& .MuiToggleButton-root': { textTransform: 'none', minHeight: 44 } }}
        >
          <ToggleButton value="all">All</ToggleButton>
          {TIER_ORDER.map((t) => (
            <ToggleButton key={t} value={t}>
              {TIER_LABEL[t]}
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
          sx={{ flex: 1 }}
        />
      </Stack>

      <Button
        size="small"
        onClick={() => setShowSnoozed((v) => !v)}
        sx={{ mb: 1, minHeight: 40, textTransform: 'none' }}
      >
        {showSnoozed ? 'Hide snoozed students' : 'Show snoozed students'}
      </Button>

      {data === null ? (
        <Stack spacing={1}>
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} variant="rounded" height={82} sx={{ borderRadius: 2 }} />
          ))}
        </Stack>
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
            No students match this filter.
          </Typography>
        </Box>
      ) : (
        <Stack spacing={1}>
          {visibleRows.map((r) => (
            <Box
              key={r.student.id}
              onClick={() => setOpen(r)}
              sx={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 1.25,
                p: 1.5,
                minHeight: 72,
                borderRadius: 2,
                border: '1px solid',
                borderColor: 'divider',
                cursor: 'pointer',
                '&:hover': { bgcolor: alpha(TIER_COLOR[r.tier], 0.04) },
              }}
            >
              <UserAvatar
                src={r.student.avatar_url}
                name={r.student.name}
                size={40}
                tapToView={false}
              />
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Stack direction="row" spacing={0.75} alignItems="center" sx={{ mb: 0.5 }}>
                  <Typography variant="body2" sx={{ fontWeight: 700 }} noWrap>
                    {r.student.name || r.student.email}
                  </Typography>
                  <Chip
                    label={TIER_LABEL[r.tier]}
                    size="small"
                    sx={{
                      height: 20,
                      fontWeight: 700,
                      bgcolor: alpha(TIER_COLOR[r.tier], 0.14),
                      color: TIER_COLOR[r.tier],
                    }}
                  />
                </Stack>
                <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                  {r.reasons.map((reason) => (
                    <Chip
                      key={reason}
                      label={reason}
                      size="small"
                      variant="outlined"
                      sx={{ height: 20, fontSize: '0.68rem' }}
                    />
                  ))}
                </Stack>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                  {STAGE_LABEL[r.watchlist?.stage ?? 'none']}
                  {r.watchlist?.stage_set_at ? ` on ${formatDay(r.watchlist.stage_set_at)}` : ''}
                  {r.watchlist?.snoozed_until ? ` · snoozed to ${formatDay(r.watchlist.snoozed_until)}` : ''}
                </Typography>
              </Box>
            </Box>
          ))}
        </Stack>
      )}

      {/* Detail sheet */}
      <Drawer
        anchor="bottom"
        open={!!open}
        onClose={() => !busy && setOpen(null)}
        PaperProps={{
          sx: { borderTopLeftRadius: 16, borderTopRightRadius: 16, maxHeight: '88dvh' },
        }}
      >
        {open && (
          <Box sx={{ p: 2.5 }}>
            <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 2 }}>
              <UserAvatar
                src={open.student.avatar_url}
                name={open.student.name}
                size={48}
                tapToView={false}
              />
              <Box sx={{ minWidth: 0 }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 800 }} noWrap>
                  {open.student.name || open.student.email}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {TIER_LABEL[open.tier]} · score {open.score} · {STAGE_LABEL[stage]}
                </Typography>
              </Box>
            </Stack>

            <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 0.75 }}>
              What we can see
            </Typography>
            <Stack spacing={0.5} sx={{ mb: 2 }}>
              <Typography variant="body2" color="text.secondary">
                Assignments:{' '}
                {open.signals.applicable === null
                  ? 'no published work yet'
                  : `${open.signals.submitted} of ${open.signals.applicable} submitted` +
                    (open.signals.days_since_last !== null
                      ? `, last one ${open.signals.days_since_last} days ago`
                      : '')}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Missed classes:{' '}
                {open.signals.classes_measured === null
                  ? 'not measured, attendance was never synced'
                  : `${open.signals.no_shows} of ${open.signals.classes_measured} measured classes`}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Opened Nexus: {formatDay(open.signals.nexus_first_login_at)}, last on{' '}
                {formatDay(open.signals.nexus_last_login_at)}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Profile photo: {open.signals.photo_status}
              </Typography>
            </Stack>

            <Divider sx={{ my: 1.5 }} />

            <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 0.75 }}>
              Parent contact
            </Typography>
            {open.parent.contact || open.parent.emergency ? (
              <Stack direction="row" spacing={1} sx={{ mb: 2 }} flexWrap="wrap" useFlexGap>
                {[open.parent.contact, open.parent.emergency]
                  .filter((p): p is string => !!p)
                  .map((contact) =>
                    isDialable(contact) ? (
                      <Stack key={contact} direction="row" spacing={1}>
                        <Button
                          size="small"
                          variant="outlined"
                          startIcon={<PhoneOutlinedIcon />}
                          href={`tel:${contact}`}
                          sx={{ minHeight: 48, textTransform: 'none' }}
                        >
                          {contact}
                        </Button>
                        <Button
                          size="small"
                          variant="outlined"
                          startIcon={<WhatsAppIcon />}
                          href={`https://wa.me/${waNumber(contact)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          sx={{ minHeight: 48, textTransform: 'none' }}
                        >
                          WhatsApp
                        </Button>
                      </Stack>
                    ) : (
                      <Typography key={contact} variant="body2" color="text.secondary">
                        {contact}
                      </Typography>
                    ),
                  )}
              </Stack>
            ) : (
              <Alert severity="warning" sx={{ mb: 2 }}>
                No parent number on file. Add it in Admin before this step.
              </Alert>
            )}

            <Divider sx={{ my: 1.5 }} />

            <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
              Next step
            </Typography>
            <Stack spacing={1}>
              {step && step !== 'removed' && (
                <Button
                  variant="contained"
                  disabled={busy}
                  onClick={() => act(open, step)}
                  sx={{ minHeight: 48, textTransform: 'none', fontWeight: 700 }}
                >
                  {ACTION_LABEL[step]}
                </Button>
              )}

              <Button
                variant="outlined"
                color="error"
                disabled={busy || !removable}
                onClick={() => setRemoving(open)}
                sx={{ minHeight: 48, textTransform: 'none', fontWeight: 700 }}
              >
                Remove from class
              </Button>
              {!removable && (
                <Typography variant="caption" color="text.secondary">
                  Removal opens up after the final notice has been sent.
                </Typography>
              )}

              <Stack direction="row" spacing={1}>
                <Button
                  variant="text"
                  disabled={busy}
                  onClick={() => act(open, 'resolve')}
                  sx={{ minHeight: 44, textTransform: 'none', flex: 1 }}
                >
                  Back on track
                </Button>
                <Button
                  variant="text"
                  disabled={busy}
                  onClick={() =>
                    act(open, 'snooze', {
                      snoozeUntil: new Date(Date.now() + 14 * 86_400_000)
                        .toISOString()
                        .slice(0, 10),
                    })
                  }
                  sx={{ minHeight: 44, textTransform: 'none', flex: 1 }}
                >
                  Snooze 2 weeks
                </Button>
              </Stack>
            </Stack>
          </Box>
        )}
      </Drawer>

      {removing && (
        <RemoveStudentDialog
          open
          classroomId={classroomId}
          students={[
            {
              enrollmentId: removing.enrollment_id,
              name: removing.student.name || removing.student.email || 'Student',
              email: removing.student.email,
              avatar_url: removing.student.avatar_url,
            },
          ]}
          getToken={getTeacherToken}
          // 'other' plus a mandatory note already carries the meaning. Adding an
          // `inactivity` category would change a shared enum for one caller; the
          // machine-readable reason lives on the watchlist event instead.
          defaultReasonCategory="other"
          defaultNotes={removalNote(removing.tier, removing.reasons)}
          onClose={() => setRemoving(null)}
          onRemoved={() => {
            // Record the removal on the ladder too, so the audit trail shows the
            // whole sequence and not just an enrollment that vanished.
            const row = removing;
            setRemoving(null);
            void act(row, 'removed');
          }}
        />
      )}
    </Box>
  );
}
