'use client';

/**
 * Photo Review (teacher): approve or reject student profile photos.
 *
 * A clear photo of one face is approved automatically by the face check
 * (lib/photo-face-check.ts) and listed on its own Auto-approved tab, which a
 * teacher looks through when they choose: Confirm copies the photo to
 * Microsoft, and the X on a photo asks the student for a new one. Everything
 * the check could not approve waits on Needs review. Only a teacher rejects.
 *
 * The "Needs review" tab doubles as the one-time bulk backfill grid for photos
 * that already existed before the rule came in, which is why it is built around
 * select-many-then-approve rather than one decision per screen.
 *
 * Mobile-first: two columns at 375px, cards big enough to actually judge a face
 * on a phone, and tap-to-enlarge through the shared ImageViewerDialog for the
 * ones that are borderline.
 *
 * The header is one line on purpose. It used to stack a title, a three line
 * description, a full-width Microsoft button, the filters, a full-width search,
 * a how-to alert and a "Select all" row, which put the first face about 500px
 * down a 375px phone. The explanation now sits behind the info button, the
 * Microsoft button is an icon on a phone, and select-all shares the search row.
 *
 * Padding is the LAYOUT's job, not this page's. (teacher)/layout.tsx already
 * applies px: { xs: 2, sm: 3, md: 4 }, and this page used to add another 16px
 * on top, which left 311px of a 375px phone and squeezed the cards down to
 * ~150px. Vertical spacing only here.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Drawer,
  IconButton,
  MenuItem,
  Popover,
  Skeleton,
  Snackbar,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
  ImageViewerDialog,
  alpha,
  useMediaQuery,
  useTheme,
} from '@neram/ui';
import CloseIcon from '@mui/icons-material/Close';
import SendIcon from '@mui/icons-material/Send';
import UndoIcon from '@mui/icons-material/Undo';
import CloudSyncOutlinedIcon from '@mui/icons-material/CloudSyncOutlined';
import BrokenImageOutlinedIcon from '@mui/icons-material/BrokenImageOutlined';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import AutoAwesomeOutlinedIcon from '@mui/icons-material/AutoAwesomeOutlined';
import { useAuthFetch } from '@/components/curriculum/shared';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import { useNavBadges } from '@/components/NavBadgeProvider';
import RejectPhotoDialog from '@/components/photo-review/RejectPhotoDialog';
import type { PhotoStatus } from '@/lib/photo-gate';
import type { ReviewTab } from '@/lib/photo-auto-review';
import { photoOriginLabel, type PhotoOrigin } from '@/lib/photo-origin';
import StudentAvatar from '@/components/students/StudentAvatar';
import PeopleSearchField from '@/components/PeopleSearchField';
import MatchHighlight from '@/components/MatchHighlight';
import { nameMatchRanges, rankPeople, suggestPeople } from '@/lib/people-search';
import {
  matchCountsByTab,
  otherTabsWithMatches,
  searchableName,
  toSearchable,
  type PhotoSearchEntry,
} from '@/lib/photo-review-search';

interface ReviewRow {
  student: { id: string; name: string | null; email: string | null; avatar_url: string | null };
  photo_status: PhotoStatus;
  photo_submitted_at: string | null;
  photo_reviewed_at: string | null;
  photo_rejection_reason: string | null;
  nexus_last_login_at: string | null;
  photo_origin: PhotoOrigin | null;
  /** Who approved it, on approved photos only. */
  review_method: 'teacher' | 'auto' | null;
  /** Why the face check left a pending photo for a teacher. */
  ai_hint: string | null;
}

/** One number per tab, plus the pending photos the face check has not looked at yet. */
type Counts = Record<ReviewTab, number> & { unchecked: number };

interface ReviewData {
  counts: Counts;
  rows: ReviewRow[];
  status: ReviewTab;
  /** Every student on the roster and their tab, so a search can count the other tabs. */
  search_index?: PhotoSearchEntry[];
}

/** Auto-approved sits next to Needs review: it is the other place a teacher might look. */
const TABS: { value: ReviewTab; label: string }[] = [
  { value: 'pending', label: 'Needs review' },
  { value: 'auto', label: 'Auto-approved' },
  { value: 'missing', label: 'No photo' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'approved', label: 'Approved' },
];

const TAB_ORDER: readonly ReviewTab[] = TABS.map((t) => t.value);
const TAB_LABEL = Object.fromEntries(TABS.map((t) => [t.value, t.label])) as Record<
  ReviewTab,
  string
>;

const EMPTY_COUNTS: Counts = {
  pending: 0,
  auto: 0,
  missing: 0,
  rejected: 0,
  approved: 0,
  unchecked: 0,
};

/** Minimum touch target. apps/nexus/CLAUDE.md mandates 48, Material 3 agrees. */
const TAP = 48;

/** TopBar's Toolbar minHeight, so the sticky filters sit directly under it. */
const TOP_BAR_HEIGHT = { xs: 52, sm: 56 };

/**
 * Rounds of the automatic check per run. Each round is capped server side, so
 * this bounds one page visit to about 60 photos, more than any classroom holds.
 */
const AUTO_CHECK_MAX_ROUNDS = 5;

function formatDay(iso: string | null): string {
  if (!iso) return 'never';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'never';
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

export default function PhotoReviewPage() {
  const authFetch = useAuthFetch();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const { loading: authLoading, classrooms, activeClassroom, getTeacherToken } =
    useNexusAuthContext();
  const { refreshBadges } = useNavBadges();

  const [classroomId, setClassroomId] = useState('');
  const [tab, setTab] = useState<ReviewTab>('pending');
  const [data, setData] = useState<ReviewData | null>(null);
  // Counts live apart from `data` on purpose. load() clears `data` to show the
  // skeleton, and when the counts rode along with it all the chips blinked to
  // zero on every tab change and every save. They are the same numbers
  // whichever tab is open, so they have no reason to flicker.
  const [counts, setCounts] = useState<Counts>(EMPTY_COUNTS);
  const [countsReady, setCountsReady] = useState(false);
  const [search, setSearch] = useState('');
  // Beside `counts` rather than inside `data`, for the same reason: load()
  // clears `data`, and the match counts on the chips must not blink per load.
  const [searchIndex, setSearchIndex] = useState<PhotoSearchEntry[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // A failed LOAD is not a transient message. It used to set the same `error` as
  // a failed save and then fall through to the empty state, so a classroom that
  // could not be read announced "Nothing waiting for you. Well done." with the
  // error floating above it. This one replaces the grid and offers a retry.
  const [loadError, setLoadError] = useState<string | null>(null);
  const [viewing, setViewing] = useState<ReviewRow | null>(null);
  const [rejecting, setRejecting] = useState<ReviewRow[] | null>(null);
  const [nudging, setNudging] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [infoAnchor, setInfoAnchor] = useState<HTMLElement | null>(null);
  /** How many photos the automatic check is looking at right now, or null. */
  const [checking, setChecking] = useState<number | null>(null);
  // Photos whose URL 404s. Some stored avatar_urls point at objects that are
  // gone, and a broken <img> in a face-judging grid is worse than useless.
  const [broken, setBroken] = useState<Set<string>>(new Set());

  /** Classrooms already auto-checked on this visit, so a reload cannot re-trigger it. */
  const autoCheckedRef = useRef<Set<string>>(new Set());
  const autoCheckRunningRef = useRef(false);

  useEffect(() => {
    if (activeClassroom?.id && !classroomId) setClassroomId(activeClassroom.id);
  }, [activeClassroom, classroomId]);

  /**
   * Bumped by every load. A teacher can switch tabs while the previous tab is
   * still loading, and the two answers can arrive in either order: when the
   * older one landed last it painted its students under the newer tab's name
   * ("Nobody in No photo matches" beside a No photo chip counting 29). Only the
   * latest load may paint.
   */
  const loadSeqRef = useRef(0);

  const load = useCallback(async () => {
    if (!classroomId) return;
    const seq = ++loadSeqRef.current;
    setData(null);
    setSelected(new Set());
    setBroken(new Set());
    setLoadError(null);
    try {
      const res = (await authFetch(
        `/api/photo-review?classroom=${classroomId}&status=${tab}`,
      )) as ReviewData;
      if (seq !== loadSeqRef.current) return;
      setData(res);
      setCounts({ ...EMPTY_COUNTS, ...(res.counts || {}) });
      setSearchIndex(res.search_index || []);
      setCountsReady(true);
    } catch (e) {
      if (seq !== loadSeqRef.current) return;
      setLoadError(e instanceof Error ? e.message : 'Could not load the review queue.');
      setData({ counts: EMPTY_COUNTS, rows: [], status: tab });
    }
  }, [authFetch, classroomId, tab]);

  useEffect(() => {
    if (!authLoading && classroomId) load();
  }, [authLoading, classroomId, load]);

  /**
   * Run the automatic face check over this classroom's unchecked photos.
   *
   * Most photos are checked the moment a student uploads them. This catches
   * the rest: photos pulled from Microsoft, and checks that timed out. Quiet on
   * failure by design: the queue works without it, so a check that could not
   * run is not something the teacher has to act on.
   */
  const runAutoCheck = useCallback(
    async (expected: number) => {
      if (!classroomId || autoCheckRunningRef.current) return;
      autoCheckRunningRef.current = true;
      setChecking(Math.max(1, expected));
      let approved = 0;
      let kept = 0;
      try {
        const token = await getTeacherToken();
        for (let round = 0; round < AUTO_CHECK_MAX_ROUNDS; round++) {
          const res = await fetch('/api/photo-review/auto-check', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ classroomId }),
          });
          const body = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(body.error || 'Could not check the photos.');
          approved += Number(body.approved) || 0;
          kept += Number(body.keptForReview) || 0;
          // Stop when switched off, when nothing is left, or when a round
          // settled nothing (a check that keeps failing must not spin).
          if (body.blocked || !body.remaining || !body.checked) break;
        }
      } catch (e) {
        console.warn('[photo-review] the automatic face check did not run:', e);
      } finally {
        autoCheckRunningRef.current = false;
        setChecking(null);
      }

      if (approved > 0) {
        setNotice(
          kept > 0
            ? `${plural(approved, 'photo', 'photos')} approved automatically. ${plural(kept, 'needs', 'need')} you.`
            : `${plural(approved, 'photo', 'photos')} approved automatically.`,
        );
      }
      if (approved > 0 || kept > 0) {
        await load();
        refreshBadges();
      }
    },
    [classroomId, getTeacherToken, load, refreshBadges],
  );

  // Once per classroom per visit, and only when there is something to check.
  useEffect(() => {
    if (!classroomId || !countsReady || counts.unchecked <= 0) return;
    if (autoCheckedRef.current.has(classroomId)) return;
    autoCheckedRef.current.add(classroomId);
    void runAutoCheck(counts.unchecked);
  }, [classroomId, countsReady, counts.unchecked, runAutoCheck]);

  const query = search.trim();

  /**
   * The open tab's rows, ranked the way people search is ranked everywhere
   * else: a name that starts with the letters, then a later word that starts
   * with them, then a name that only contains them, earlier hits first. This
   * used to be a plain "contains" filter left in alphabetical order, so "ba"
   * listed Afrin banu above Bavishiya. Only the name on the card is searched.
   */
  const visibleRows = useMemo(() => {
    const rows = data?.rows || [];
    if (!query) return rows;
    return rankPeople(toSearchable(rows), query).map((s) => s.row);
  }, [data, query]);

  /** Matches on every tab while a search is live, for the chips and the empty state. */
  const matchCounts = useMemo(() => matchCountsByTab(searchIndex, query), [searchIndex, query]);
  const otherTabMatches = otherTabsWithMatches(matchCounts, tab, TAB_ORDER);
  const suggestions = useMemo(
    () =>
      matchCounts && TAB_ORDER.every((t) => matchCounts[t] === 0)
        ? suggestPeople(searchIndex, query)
        : [],
    [matchCounts, searchIndex, query],
  );

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

  /**
   * Switching tabs keeps the search, the way GitHub keeps it between Open and
   * Closed. It used to clear it, because a term carried from "Needs review"
   * silently filtered "Approved" and made its count look wrong. It is no longer
   * silent: while a search is live every chip counts matches, not students,
   * and the box keeps its X.
   */
  const changeTab = (next: ReviewTab) => {
    setTab(next);
  };

  const decide = useCallback(
    async (decisions: { studentId: string; decision: PhotoStatus; reason?: string }[]) => {
      if (decisions.length === 0) return;
      setSaving(true);
      setError(null);
      // On Auto-approved an approval is a teacher confirming the machine's call.
      const verb = tab === 'auto' ? 'Confirmed' : 'Approved';
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

        // A partial failure is not a success with a footnote. The route now
        // reports what actually reached the database, and anything it could not
        // write is work the teacher will otherwise never come back to.
        if (typeof body.failed === 'number' && body.failed > 0) {
          setError(
            `${body.failed} of ${decisions.length} could not be saved. Reload and try those again.`,
          );
        }

        // Say plainly whether the approved photo reached Microsoft. It fails for
        // real reasons (an account with no mailbox, consent not granted yet) and
        // a teacher who is told "approved" while Teams still shows initials has
        // been misled.
        const ms: { status: string }[] = Array.isArray(body.microsoft) ? body.microsoft : [];
        if (ms.length > 0) {
          const approved = typeof body.approved === 'number' ? body.approved : ms.length;
          const synced = ms.filter((m) => m.status === 'synced').length;
          const off = ms.filter((m) => m.status === 'disabled').length;
          if (off === ms.length) {
            setNotice(`${verb} ${approved}. Copying photos to Microsoft is switched off.`);
          } else if (synced === ms.length) {
            setNotice(`${verb} ${approved}, and copied to Microsoft.`);
          } else {
            setNotice(
              `${verb} ${approved}. ${synced} copied to Microsoft, ${ms.length - synced} could not be copied.`,
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
    [getTeacherToken, load, refreshBadges, tab],
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
   * comes back as pending, and then goes straight through the face check.
   */
  const checkMicrosoft = useCallback(async () => {
    if (!classroomId) return;
    setSyncing(true);
    setError(null);
    setNotice(null);
    let pulled = 0;
    try {
      const token = await getTeacherToken();
      const res = await fetch('/api/photo-review/sync-microsoft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ classroomId }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'Could not check Microsoft.');

      pulled = body.counts?.pulled ?? 0;
      const parts = [
        pulled > 0
          ? `${plural(pulled, 'new or changed photo', 'new or changed photos')} found on Microsoft.`
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
    if (pulled > 0) void runAutoCheck(pulled);
  }, [classroomId, getTeacherToken, load, refreshBadges, runAutoCheck]);

  const selectedRows = visibleRows.filter((r) => selected.has(r.student.id));
  const showSelectAll = data !== null && !loadError && visibleRows.length > 0;

  const gridColumns = {
    xs: 'repeat(2, 1fr)',
    sm: 'repeat(3, 1fr)',
    md: 'repeat(4, 1fr)',
    lg: 'repeat(5, 1fr)',
  };

  const classroomSelect = (sx: object) =>
    classrooms.length > 1 ? (
      <TextField
        select
        size="small"
        label="Classroom"
        value={classroomId}
        onChange={(e) => setClassroomId(e.target.value)}
        sx={{ '& .MuiInputBase-root': { minHeight: TAP }, ...sx }}
      >
        {classrooms.map((c) => (
          <MenuItem key={c.id} value={c.id} sx={{ minHeight: TAP }}>
            {c.name}
          </MenuItem>
        ))}
      </TextField>
    ) : null;

  const howItWorks = (
    <Box sx={{ p: 2.5, maxWidth: 440 }}>
      <Typography variant="subtitle1" component="h2" sx={{ fontWeight: 700, mb: 1 }}>
        How photo review works
      </Typography>
      <Stack
        component="ul"
        spacing={1}
        sx={{ pl: 2.5, m: 0, '& li': { typography: 'body2', color: 'text.secondary' } }}
      >
        <li>Every student needs a clear photo of their own face.</li>
        <li>
          A new photo that shows one clear face is approved automatically and listed under
          Auto-approved. Look through those when you have a minute.
        </li>
        <li>
          Anything the check is not sure about waits under Needs review, with the reason on the
          card. Only a teacher can ask for a new photo.
        </li>
        <li>Tap a photo to see it full size. Select several to approve or confirm them together.</li>
        <li>
          The label under each name says where the photo came from. Many were picked up from
          Microsoft or Google sign-in, so the student never chose them.
        </li>
        <li>
          A photo you approve or confirm also becomes the student&apos;s Microsoft and Teams
          picture. An automatic approval waits for your Confirm first.
        </li>
      </Stack>
    </Box>
  );

  return (
    <Box sx={{ maxWidth: 1120, mx: 'auto', pb: selected.size ? 14 : 0 }}>
      {/* Row 1: one line. Title and help on the left, classroom and Microsoft on the right. */}
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.5, minHeight: TAP }}>
        <Stack direction="row" alignItems="center" sx={{ flex: 1, minWidth: 0 }}>
          <Typography
            variant="h5"
            component="h1"
            noWrap
            sx={{ fontWeight: 800, fontSize: { xs: '1.2rem', sm: '1.35rem' } }}
          >
            Photo Review
          </Typography>
          <Tooltip title="How photo review works">
            <IconButton
              aria-label="How photo review works"
              onClick={(e) => setInfoAnchor(e.currentTarget)}
              sx={{ width: TAP, height: TAP, color: 'text.secondary', flexShrink: 0 }}
            >
              <InfoOutlinedIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Stack>

        {classroomSelect({ display: { xs: 'none', sm: 'inline-flex' }, width: 220 })}

        {/* Both forms are rendered and one is hidden by breakpoint, so the right
            one paints first time with no media-query flash. A hidden element is
            out of the accessibility tree, so the shared label never doubles up. */}
        <Tooltip title="Check Microsoft for new photos">
          <Box component="span" sx={{ display: { xs: 'inline-flex', sm: 'none' } }}>
            <IconButton
              aria-label="Check Microsoft for new photos"
              onClick={checkMicrosoft}
              disabled={syncing || !classroomId}
              sx={{
                width: TAP,
                height: TAP,
                border: '1px solid',
                borderColor: 'divider',
                color: 'primary.main',
              }}
            >
              {syncing ? <CircularProgress size={20} /> : <CloudSyncOutlinedIcon />}
            </IconButton>
          </Box>
        </Tooltip>
        <Button
          variant="outlined"
          aria-label="Check Microsoft for new photos"
          startIcon={
            syncing ? <CircularProgress size={16} color="inherit" /> : <CloudSyncOutlinedIcon />
          }
          onClick={checkMicrosoft}
          disabled={syncing || !classroomId}
          sx={{
            display: { xs: 'none', sm: 'inline-flex' },
            minHeight: TAP,
            textTransform: 'none',
            flexShrink: 0,
          }}
        >
          {syncing ? 'Checking...' : 'Check Microsoft'}
        </Button>
      </Stack>

      {classroomSelect({ display: { xs: 'flex', sm: 'none' }, width: '100%', mb: 1 })}

      {/* Row 2: the filters, pinned under the TopBar so a teacher deep in a long
          grid can still switch tabs.

          One row that scrolls, never a wrapped one. ToggleButtonGroup's grouped
          border rules (marginLeft: -1px, first and last child radii) are written
          for a single row, so when these labels wrapped at 375px the second row
          came out with square leading corners and a 1px offset. Scrolling keeps
          the segmented control intact and the overflow inside this box rather
          than on the page body. */}
      <Box
        sx={{
          position: 'sticky',
          top: TOP_BAR_HEIGHT,
          // Under the TopBar (appBar, 1100), over the cards.
          zIndex: 1099,
          // Solid and matching <main>, so the grid never shows through as it
          // scrolls underneath.
          bgcolor: (t) => (t.palette.mode === 'light' ? '#FAFAFA' : t.palette.background.default),
          py: 0.75,
          mb: 0.5,
          overflowX: 'auto',
          overscrollBehaviorX: 'contain',
          WebkitOverflowScrolling: 'touch',
          scrollbarWidth: 'none',
          '&::-webkit-scrollbar': { display: 'none' },
        }}
      >
        <ToggleButtonGroup
          value={tab}
          exclusive
          size="small"
          aria-label="Filter students by photo status"
          onChange={(_, v) => v && changeTab(v)}
          sx={{
            flexWrap: 'nowrap',
            width: 'max-content',
            bgcolor: 'background.paper',
            '& .MuiToggleButton-root': {
              textTransform: 'none',
              minHeight: TAP,
              px: 1.75,
              flexShrink: 0,
              whiteSpace: 'nowrap',
              fontWeight: 600,
            },
          }}
        >
          {TABS.map((t) => (
            <ToggleButton
              key={t.value}
              value={t.value}
              // While a search is live each chip counts that tab's matches, so a
              // teacher can see where a student is before switching.
              aria-label={matchCounts ? `${t.label}, ${matchCounts[t.value]} matching` : undefined}
            >
              {t.label}
              {countsReady ? (
                <Chip
                  label={matchCounts ? matchCounts[t.value] : counts[t.value]}
                  size="small"
                  sx={{
                    ml: 0.75,
                    height: 20,
                    minWidth: 26,
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    bgcolor: tab === t.value ? 'primary.main' : 'action.selected',
                    color: tab === t.value ? 'primary.contrastText' : 'text.secondary',
                  }}
                />
              ) : (
                // Same footprint as the chip, so the row does not jump when the
                // real numbers land.
                <Skeleton
                  variant="rounded"
                  width={26}
                  height={20}
                  sx={{ ml: 0.75, borderRadius: 5 }}
                />
              )}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
      </Box>

      {/* Row 3: select-all and search share one line. Select-all used to be a
          row of its own between the search box and the first face. */}
      <Stack direction="row" alignItems="center" spacing={0.5} sx={{ mb: 1.5 }}>
        {showSelectAll && (
          <Stack direction="row" alignItems="center" sx={{ flexShrink: 0 }}>
            <Checkbox
              checked={allVisibleSelected}
              indeterminate={selected.size > 0 && !allVisibleSelected}
              onChange={toggleAll}
              inputProps={{ 'aria-label': `Select all ${visibleRows.length} students` }}
              sx={{ width: TAP, height: TAP }}
            />
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{ pr: 1, whiteSpace: 'nowrap' }}
            >
              All ({visibleRows.length})
            </Typography>
          </Stack>
        )}
        <PeopleSearchField
          value={search}
          onChange={setSearch}
          label="Search students by name"
          placeholder="Search by name"
          resultCount={data === null ? undefined : visibleRows.length}
          sx={{ flex: 1, minWidth: 0, maxWidth: { sm: 360 }, ml: { sm: 'auto !important' } }}
        />
      </Stack>

      {checking !== null && (
        <Stack
          direction="row"
          alignItems="center"
          spacing={1}
          role="status"
          aria-live="polite"
          sx={{ mb: 1.5, color: 'text.secondary' }}
        >
          <CircularProgress size={16} />
          <Typography variant="body2">
            Checking {plural(checking, 'new photo', 'new photos')} for a clear face...
          </Typography>
        </Stack>
      )}

      {tab === 'missing' && (
        <Alert severity="warning" sx={{ mb: 1.5, py: 0 }}>
          Once the photo rule is on, they cannot open Nexus until they add one. Select them to send
          a reminder.
        </Alert>
      )}

      {tab === 'auto' && counts.auto > 0 && (
        <Alert
          severity="success"
          icon={<AutoAwesomeOutlinedIcon fontSize="inherit" />}
          sx={{ mb: 1.5, py: 0 }}
        >
          Approved automatically because one clear face was found. Confirm them to copy them to
          Teams, or use the X on a photo to ask for a new one.
        </Alert>
      )}

      {data === null ? (
        <Box sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: gridColumns }}>
          {[0, 1, 2, 3, 4, 5].map((i) => (
            // Matched to a real card: a 1:1 image plus roughly 66px of text. A
            // 190px skeleton made the whole grid jump when the data landed.
            <Skeleton
              key={i}
              variant="rectangular"
              sx={{ borderRadius: 2, aspectRatio: '1 / 1.42', height: 'auto', width: '100%' }}
            />
          ))}
        </Box>
      ) : loadError ? (
        <Alert
          severity="error"
          sx={{ mb: 1.5 }}
          action={
            <Button
              color="inherit"
              onClick={load}
              sx={{ minHeight: TAP, textTransform: 'none', fontWeight: 700 }}
            >
              Try again
            </Button>
          }
        >
          {loadError}
        </Alert>
      ) : visibleRows.length === 0 ? (
        <Box
          sx={{
            textAlign: 'center',
            py: 6,
            px: 2,
            border: '1.5px dashed',
            borderColor: 'divider',
            borderRadius: 3,
          }}
        >
          <Typography variant="body2" color="text.secondary">
            {query
              ? `Nobody in ${TAB_LABEL[tab]} matches "${query}".`
              : tab === 'pending'
                ? 'Nothing waiting for you. Well done.'
                : tab === 'auto'
                  ? 'No automatic approvals to look at.'
                  : 'No students here.'}
          </Typography>
          {/* A search that finds nobody on this tab is rarely a dead end. The
              student is usually on another tab, or spelled a little
              differently, so offer the way there before offering to give up. */}
          {query && (otherTabMatches.length > 0 || suggestions.length > 0) && (
            <Box
              sx={{
                mt: 1.5,
                display: 'flex',
                flexWrap: 'wrap',
                justifyContent: 'center',
                alignItems: 'center',
                gap: 1,
              }}
            >
              {otherTabMatches.length > 0 ? (
                otherTabMatches.map(({ tab: other, count }) => (
                  <Button
                    key={other}
                    variant="outlined"
                    onClick={() => changeTab(other)}
                    sx={{ minHeight: TAP, textTransform: 'none', fontWeight: 700 }}
                  >
                    Show {count} in {TAB_LABEL[other]}
                  </Button>
                ))
              ) : (
                <>
                  <Typography variant="body2" color="text.secondary">
                    Did you mean
                  </Typography>
                  {suggestions.map((s) => (
                    <Button
                      key={s.id}
                      variant="outlined"
                      onClick={() => {
                        setSearch(s.name);
                        changeTab(s.tab);
                      }}
                      sx={{ minHeight: TAP, textTransform: 'none', fontWeight: 700 }}
                    >
                      {s.name}
                    </Button>
                  ))}
                </>
              )}
            </Box>
          )}
          {query && (
            <Button
              onClick={() => setSearch('')}
              sx={{ mt: 1, minHeight: TAP, textTransform: 'none' }}
            >
              Clear search
            </Button>
          )}
        </Box>
      ) : (
        <Box sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: gridColumns }}>
          {visibleRows.map((r) => {
            const isSelected = selected.has(r.student.id);
            const isBroken = broken.has(r.student.id);
            const hasPhoto = !!r.student.avatar_url && !isBroken;
            // A row that HAS a photo on record can still be rejected when the
            // file will not load. It used to lose its reject button the moment
            // the image 404'd, which left Approve as the only thing a teacher
            // could do to a photo they could not even see.
            const canReject = !!r.student.avatar_url;
            const originLabel = photoOriginLabel(r.photo_origin);
            const name = r.student.name || r.student.email || 'This student';
            return (
              <Box
                key={r.student.id}
                sx={{
                  borderRadius: 2,
                  overflow: 'hidden',
                  border: '2px solid',
                  borderColor: isSelected ? 'primary.main' : 'divider',
                  bgcolor: isSelected
                    ? (t) => alpha(t.palette.primary.main, t.palette.mode === 'dark' ? 0.18 : 0.06)
                    : 'background.paper',
                  transition: 'border-color 180ms ease, background-color 180ms ease',
                }}
              >
                <Box sx={{ position: 'relative', aspectRatio: '1', bgcolor: 'action.hover' }}>
                  {hasPhoto ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={r.student.avatar_url as string}
                      alt={`Profile photo of ${name}`}
                      role="button"
                      tabIndex={0}
                      aria-label={`See ${name}'s photo full size`}
                      onClick={() => setViewing(r)}
                      onKeyDown={(e) => {
                        // The lightbox was mouse and touch only. A bare img
                        // with onClick is invisible to a keyboard.
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setViewing(r);
                        }
                      }}
                      onError={() => setBroken((s) => new Set(s).add(r.student.id))}
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
                      spacing={0.75}
                      sx={{ height: '100%', px: 1 }}
                    >
                      {isBroken ? (
                        <>
                          <BrokenImageOutlinedIcon sx={{ fontSize: 32, color: 'warning.main' }} />
                          <Typography
                            variant="caption"
                            color="warning.main"
                            sx={{ textAlign: 'center', lineHeight: 1.3, fontSize: '0.75rem' }}
                          >
                            Photo did not load
                          </Typography>
                        </>
                      ) : (
                        <StudentAvatar
                          userId={r.student.id}
                          name={r.student.name}
                          size={56}
                          clickable={false}
                          tapToView={false}
                        />
                      )}
                    </Stack>
                  )}

                  <Checkbox
                    checked={isSelected}
                    onChange={() => toggle(r.student.id)}
                    inputProps={{ 'aria-label': `Select ${name}` }}
                    sx={{
                      position: 'absolute',
                      top: 2,
                      left: 2,
                      width: TAP,
                      height: TAP,
                      bgcolor: 'background.paper',
                      boxShadow: 1,
                      '&:hover': { bgcolor: 'background.paper' },
                    }}
                  />

                  {canReject && (
                    <Tooltip title="Ask for a new photo">
                      <IconButton
                        aria-label={`Ask ${name} for a new photo`}
                        onClick={() => setRejecting([r])}
                        sx={{
                          position: 'absolute',
                          bottom: 4,
                          right: 4,
                          width: TAP,
                          height: TAP,
                          bgcolor: 'background.paper',
                          color: 'warning.main',
                          boxShadow: 1,
                          '&:hover': { bgcolor: 'background.paper', color: 'warning.dark' },
                        }}
                      >
                        <CloseIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  )}
                </Box>

                <Box sx={{ p: 1.25 }}>
                  <Typography variant="body2" sx={{ fontWeight: 600, fontSize: 14 }} noWrap>
                    <MatchHighlight
                      text={searchableName(r.student)}
                      ranges={query ? nameMatchRanges(searchableName(r.student), query) : []}
                    />
                  </Typography>
                  {originLabel && (
                    <Chip
                      label={originLabel}
                      size="small"
                      variant="outlined"
                      color={r.photo_origin === 'upload' ? 'primary' : 'default'}
                      sx={{ height: 22, fontSize: '0.75rem', mt: 0.5, maxWidth: '100%' }}
                    />
                  )}
                  {tab === 'pending' && r.ai_hint && (
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{ display: 'block', mt: 0.5, fontSize: '0.75rem' }}
                    >
                      {r.ai_hint}
                    </Typography>
                  )}
                  {tab === 'missing' && (
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{ display: 'block', mt: 0.5, fontSize: '0.75rem' }}
                    >
                      Last opened Nexus: {formatDay(r.nexus_last_login_at)}
                    </Typography>
                  )}
                  {tab === 'rejected' && r.photo_rejection_reason && (
                    <Typography
                      variant="caption"
                      color="warning.main"
                      sx={{ display: 'block', mt: 0.5, fontSize: '0.75rem' }}
                    >
                      {r.photo_rejection_reason}
                    </Typography>
                  )}
                  {tab === 'auto' && (
                    <Button
                      size="small"
                      fullWidth
                      variant="outlined"
                      onClick={() => decide([{ studentId: r.student.id, decision: 'approved' }])}
                      disabled={saving}
                      aria-label={`Confirm ${name}'s photo`}
                      sx={{ mt: 0.75, minHeight: TAP, textTransform: 'none', fontWeight: 700 }}
                    >
                      Confirm
                    </Button>
                  )}
                  {tab === 'approved' && (
                    <Button
                      size="small"
                      fullWidth
                      startIcon={<UndoIcon sx={{ fontSize: 18 }} />}
                      onClick={() => decide([{ studentId: r.student.id, decision: 'pending' }])}
                      disabled={saving}
                      sx={{ mt: 0.5, minHeight: TAP, textTransform: 'none' }}
                    >
                      Undo approval
                    </Button>
                  )}
                </Box>
              </Box>
            );
          })}
        </Box>
      )}

      {/* Sticky action bar.
          Sits above BottomNav (appBar, 1100) on purpose: while a selection is
          live this is the only thing to do, and Clear puts navigation back. */}
      {selected.size > 0 && (
        <Box
          sx={{
            position: 'fixed',
            left: 0,
            right: 0,
            bottom: 0,
            px: { xs: 1.5, sm: 2 },
            pt: 1.25,
            // Clears the home indicator on a notched iPhone, where the buttons
            // otherwise sat underneath it.
            pb: 'calc(10px + env(safe-area-inset-bottom))',
            bgcolor: 'background.paper',
            borderTop: '1px solid',
            borderColor: 'divider',
            boxShadow: '0 -4px 16px rgba(0,0,0,0.10)',
            zIndex: 1200,
          }}
        >
          <Stack
            direction="row"
            alignItems="center"
            spacing={1}
            sx={{ maxWidth: 1120, mx: 'auto' }}
          >
            <Typography
              variant="body2"
              sx={{ fontWeight: 700, flex: 1, minWidth: 0 }}
              noWrap
            >
              {selected.size} selected
            </Typography>
            {/* flexShrink: 0 on both. This row used to be a plain flex with a
                flex: 1 label, and at 375px "Send a reminder" was squeezed until
                its own label wrapped. */}
            <Button
              variant="outlined"
              onClick={() => setSelected(new Set())}
              sx={{ minHeight: TAP, textTransform: 'none', flexShrink: 0 }}
            >
              Clear
            </Button>
            {tab === 'missing' ? (
              <Button
                variant="contained"
                startIcon={!isMobile ? <SendIcon /> : undefined}
                onClick={remindNoPhoto}
                disabled={nudging}
                sx={{ minHeight: TAP, textTransform: 'none', fontWeight: 700, flexShrink: 0 }}
              >
                {nudging ? 'Sending...' : 'Remind'}
              </Button>
            ) : (
              <Button
                variant="contained"
                onClick={() =>
                  decide(selectedRows.map((r) => ({ studentId: r.student.id, decision: 'approved' })))
                }
                disabled={saving}
                sx={{ minHeight: TAP, textTransform: 'none', fontWeight: 700, flexShrink: 0 }}
              >
                {saving
                  ? 'Saving...'
                  : tab === 'auto'
                    ? isMobile
                      ? 'Confirm'
                      : 'Confirm selected'
                    : isMobile
                      ? 'Approve'
                      : 'Approve selected'}
              </Button>
            )}
          </Stack>
        </Box>
      )}

      {/* The result belongs where the button is.
          These were inline alerts at the TOP of the page while the button that
          produces them is fixed to the bottom, so approving a batch from the end
          of a long grid gave a teacher no confirmation at all without scrolling
          back up. */}
      <Snackbar
        open={!!notice}
        autoHideDuration={6000}
        onClose={() => setNotice(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        sx={{ bottom: { xs: selected.size ? 96 : 80, sm: 24 } }}
      >
        <Alert severity="success" onClose={() => setNotice(null)} sx={{ width: '100%' }}>
          {notice}
        </Alert>
      </Snackbar>

      <Snackbar
        open={!!error}
        onClose={() => setError(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        sx={{ bottom: { xs: selected.size ? 96 : 80, sm: 24 } }}
      >
        <Alert severity="error" onClose={() => setError(null)} sx={{ width: '100%' }}>
          {error}
        </Alert>
      </Snackbar>

      {/* The explanation that used to sit above the grid on every visit. A
          bottom sheet on a phone, a popover from the info button elsewhere. */}
      <Drawer
        anchor="bottom"
        open={isMobile && !!infoAnchor}
        onClose={() => setInfoAnchor(null)}
        PaperProps={{
          sx: {
            borderTopLeftRadius: 16,
            borderTopRightRadius: 16,
            pb: 'env(safe-area-inset-bottom)',
          },
        }}
      >
        {howItWorks}
        <Box sx={{ px: 2.5, pb: 2 }}>
          <Button
            fullWidth
            variant="contained"
            onClick={() => setInfoAnchor(null)}
            sx={{ minHeight: TAP, textTransform: 'none', fontWeight: 700 }}
          >
            Got it
          </Button>
        </Box>
      </Drawer>
      <Popover
        open={!isMobile && !!infoAnchor}
        anchorEl={infoAnchor}
        onClose={() => setInfoAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
      >
        {howItWorks}
      </Popover>

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
