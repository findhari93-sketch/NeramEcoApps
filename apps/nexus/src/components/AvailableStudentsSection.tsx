'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Paper,
  Chip,
  TextField,
  Button,
  Checkbox,
  CircularProgress,
  IconButton,
  Alert,
} from '@neram/ui';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import RefreshIcon from '@mui/icons-material/Refresh';
import PersonAddAltOutlinedIcon from '@mui/icons-material/PersonAddAltOutlined';
import GraphAvatar from '@/components/GraphAvatar';
import { timeAgo } from '@/components/catchup/shared';
import { useDirectoryEnroll } from '@/components/students/useDirectoryEnroll';
import { rankPeople } from '@/lib/people-search';

interface DirectoryStudent {
  ms_oid: string;
  name: string;
  email: string;
  inDatabase: boolean;
  /** When the Microsoft account was created, so the newest joiners read first. */
  createdAt: string | null;
}

interface PastStudent extends DirectoryStudent {
  academicYear: string | null;
  lastClassroom: string | null;
  removalReason: string | null;
  removedAt: string | null;
}

interface Props {
  classroomId: string;
  getToken: () => Promise<string | null>;
  /** Called after one or more students are enrolled, so the parent refreshes its roster. */
  onEnrolled: () => void;
  /**
   * Inside the Add student sheet: always open, no collapsible header and no
   * border, because the sheet already is the container.
   */
  embedded?: boolean;
}

const REMOVAL_LABEL: Record<string, string> = {
  course_completed: 'Course completed',
  fee_nonpayment: 'Fees unpaid',
  college_admitted: 'Joined college',
  self_withdrawal: 'Left on their own',
  disciplinary: 'Removed by staff',
  other: 'Removed',
};

function pastMeta(student: PastStudent): string {
  return [
    student.academicYear,
    student.removalReason ? REMOVAL_LABEL[student.removalReason] ?? 'Removed' : null,
    student.lastClassroom,
  ]
    .filter(Boolean)
    .join(' · ');
}

/**
 * "Not yet in class": Microsoft accounts not enrolled in this classroom.
 *
 * New accounts come first, newest at the top, because that is who a teacher
 * opens this for. Past students (active in no classroom, never graduated) sit in
 * a collapsed group underneath: they used to top the list and bury the new ones.
 * Every add goes through useDirectoryEnroll, which asks before linking or
 * creating when the account may belong to a student already enrolled.
 */
export default function AvailableStudentsSection({ classroomId, getToken, onEnrolled, embedded = false }: Props) {
  const [expanded, setExpanded] = useState(embedded);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [students, setStudents] = useState<DirectoryStudent[]>([]);
  const [past, setPast] = useState<PastStudent[]>([]);
  const [showPast, setShowPast] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const { enroll: enrollDirectory, dialog } = useDirectoryEnroll({ classroomId, getToken });

  const fetchAvailable = useCallback(async () => {
    setLoading(true);
    setError(null);
    setUnavailable(false);
    try {
      const token = await getToken();
      if (!token) return;
      const res = await fetch(`/api/classrooms/${classroomId}/available-students`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 502) {
        setUnavailable(true);
        setStudents([]);
        setPast([]);
        return;
      }
      if (!res.ok) throw new Error('Failed to load available students');
      const data = await res.json();
      setStudents(data.students || []);
      setPast(data.past || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load available students');
    } finally {
      setLoading(false);
      setLoaded(true);
    }
  }, [classroomId, getToken]);

  // Lazy-load the directory the first time the section is expanded.
  useEffect(() => {
    if (expanded && !loaded && !loading) fetchAvailable();
  }, [expanded, loaded, loading, fetchAvailable]);

  const toggleSelect = (msOid: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(msOid)) next.delete(msOid);
      else next.add(msOid);
      return next;
    });
  };

  // An empty query keeps the order the route returns; a typed one leads with the closest match.
  const filtered = rankPeople(students, query);
  const filteredPast = rankPeople(past, query);

  const enroll = async (toAdd: DirectoryStudent[]) => {
    if (toAdd.length === 0) return;
    setAdding(true);
    setError(null);
    try {
      const outcome = await enrollDirectory(toAdd.map(({ ms_oid, name, email }) => ({ ms_oid, name, email })));
      const added = new Set(outcome.added);
      setStudents((prev) => prev.filter((s) => !added.has(s.ms_oid)));
      setPast((prev) => prev.filter((s) => !added.has(s.ms_oid)));
      setSelected(new Set());
      if (outcome.errors.length > 0) setError(outcome.errors.join(' '));
      if (added.size > 0) onEnrolled();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add students');
    } finally {
      setAdding(false);
    }
  };

  // A directory ACCOUNT, not yet a student of this classroom: it may have no users
  // row, so it has no cohort ring to show. GraphAvatar still puts the Microsoft
  // photo beside the name, which is what the faceless-name guard exists to ensure.
  const renderRow = (account: DirectoryStudent, meta: string, actionLabel: string) => (
    <Box
      key={account.ms_oid}
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1.5,
        p: 1,
        borderRadius: 2,
        minHeight: 56,
        bgcolor: selected.has(account.ms_oid) ? 'action.selected' : 'transparent',
        '&:hover': { bgcolor: 'action.hover' },
      }}
    >
      {/* 14px padding around the 20px icon makes a 48px tap target. */}
      <Checkbox
        checked={selected.has(account.ms_oid)}
        size="small"
        onChange={() => toggleSelect(account.ms_oid)}
        inputProps={{ 'aria-label': `Select ${account.name}` }}
        sx={{ p: '14px', m: -1 }}
      />
      <GraphAvatar msOid={account.ms_oid} name={account.name} size={36} clickable={false} tapToView={false} />
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
            {account.name}
          </Typography>
          {!account.inDatabase && (
            <Chip label="New" size="small" color="info" variant="outlined" sx={{ height: 18, fontSize: '0.6rem' }} />
          )}
        </Box>
        {account.email && (
          <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>
            {account.email}
          </Typography>
        )}
        {/* Wraps rather than truncating: year, reason and classroom all matter. */}
        {meta && (
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
            {meta}
          </Typography>
        )}
      </Box>
      <Button
        size="small"
        variant="outlined"
        disabled={adding}
        onClick={() => enroll([account])}
        sx={{ minHeight: 48, textTransform: 'none', flexShrink: 0 }}
      >
        {actionLabel}
      </Button>
    </Box>
  );

  const body = (
    <Box sx={{ px: embedded ? 0 : 1.5, pb: 1.5 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', flex: 1 }}>
          New Microsoft accounts that are not in this classroom yet, newest first. Add them to grant Nexus access.
        </Typography>
        {embedded && (
          <IconButton
            onClick={() => fetchAvailable()}
            disabled={loading}
            aria-label="Refresh directory"
            sx={{ width: 48, height: 48, flexShrink: 0 }}
          >
            <RefreshIcon fontSize="small" />
          </IconButton>
        )}
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 1.5 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {unavailable ? (
        <Alert severity="info" sx={{ mb: 1 }}>
          {embedded
            ? 'The organisation directory is temporarily unavailable. Try Refresh in a minute.'
            : 'The organisation directory is temporarily unavailable. Use the "Add Student" button to search and add a student by name or email.'}
        </Alert>
      ) : loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
          <CircularProgress size={24} />
        </Box>
      ) : (
        <>
          {(students.length > 0 || past.length > 0) && (
            <TextField
              fullWidth
              size="small"
              placeholder="Filter by name or email..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              sx={{ mb: 1.5 }}
              inputProps={{ style: { minHeight: 24 } }}
            />
          )}

          {selected.size > 0 && (
            <Button
              fullWidth
              variant="contained"
              size="small"
              startIcon={adding ? <CircularProgress size={16} color="inherit" /> : <PersonAddAltOutlinedIcon />}
              disabled={adding}
              onClick={() => enroll([...students, ...past].filter((s) => selected.has(s.ms_oid)))}
              sx={{ mb: 1.5, minHeight: 48 }}
            >
              Add {selected.size} to class
            </Button>
          )}

          {students.length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 2 }}>
              {past.length > 0
                ? 'No new accounts. Past students are listed below.'
                : 'Everyone in the directory is already in this class.'}
            </Typography>
          ) : (
            <Box
              sx={{
                display: 'flex',
                flexDirection: 'column',
                gap: 0.5,
                // The sheet scrolls as a whole; a second scroll box inside it traps the thumb.
                ...(embedded ? {} : { maxHeight: 360, overflow: 'auto' }),
              }}
            >
              {filtered.map((s) =>
                renderRow(s, s.createdAt ? `Account created ${timeAgo(s.createdAt)}` : '', 'Add')
              )}
              {filtered.length === 0 && (
                <Typography variant="caption" color="text.secondary" sx={{ textAlign: 'center', py: 2 }}>
                  No matches for &quot;{query}&quot;.
                </Typography>
              )}
            </Box>
          )}

          {past.length > 0 && (
            <Box sx={{ mt: 1.5, pt: 1, borderTop: 1, borderColor: 'divider' }}>
              <Button
                fullWidth
                onClick={() => setShowPast((v) => !v)}
                aria-expanded={showPast}
                endIcon={showPast ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                sx={{
                  justifyContent: 'space-between',
                  minHeight: 48,
                  textTransform: 'none',
                  fontWeight: 600,
                  color: 'text.secondary',
                }}
              >
                Past students ({past.length})
              </Button>
              {showPast && (
                <>
                  <Alert severity="info" sx={{ my: 1 }}>
                    These students left a class earlier but were never graduated, so their Microsoft
                    accounts are still active. Graduate them in the Admin app to free their licenses.
                    Add someone back only if they have rejoined.
                  </Alert>
                  <Box
                    sx={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 0.5,
                      ...(embedded ? {} : { maxHeight: 360, overflow: 'auto' }),
                    }}
                  >
                    {filteredPast.map((s) => renderRow(s, pastMeta(s), 'Add back'))}
                    {filteredPast.length === 0 && (
                      <Typography variant="caption" color="text.secondary" sx={{ textAlign: 'center', py: 2 }}>
                        No past students match &quot;{query}&quot;.
                      </Typography>
                    )}
                  </Box>
                </>
              )}
            </Box>
          )}
        </>
      )}
    </Box>
  );

  if (embedded) {
    return (
      <Box>
        {body}
        {dialog}
      </Box>
    );
  }

  return (
    <Paper variant="outlined" sx={{ mb: 2, borderRadius: 2, overflow: 'hidden' }}>
      {/* Header. A real button, so the section opens from a keyboard, with the
          refresh control beside it rather than nested inside it. */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, px: 0.5, minHeight: 48 }}>
        <Button
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          startIcon={<PersonAddAltOutlinedIcon fontSize="small" />}
          endIcon={expanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
          sx={{
            flex: 1,
            minHeight: 48,
            justifyContent: 'flex-start',
            textTransform: 'none',
            fontWeight: 600,
            color: 'text.primary',
            '& .MuiButton-endIcon': { ml: 'auto' },
          }}
        >
          Not yet in class
          {loaded && !unavailable && (
            <Chip
              component="span"
              label={students.length}
              size="small"
              color={students.length > 0 ? 'primary' : 'default'}
              sx={{ ml: 1, height: 20, fontSize: '0.7rem' }}
            />
          )}
        </Button>
        {expanded && (
          <IconButton
            onClick={() => fetchAvailable()}
            disabled={loading}
            aria-label="Refresh directory"
            sx={{ width: 48, height: 48 }}
          >
            <RefreshIcon fontSize="small" />
          </IconButton>
        )}
      </Box>

      {expanded && body}

      {dialog}
    </Paper>
  );
}
