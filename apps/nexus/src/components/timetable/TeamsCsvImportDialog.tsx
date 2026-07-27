'use client';

/**
 * Import a Teams attendance report into a class's attendance.
 *
 * This is the fallback for the situation Nexus is actually in: Microsoft refuses
 * every app-only attendance read because the tenant has no Teams application
 * access policy, and only a tenant administrator can grant one. The meeting
 * organizer can still download the attendance report out of the Teams meeting
 * recap, so this dialog reaches real attendance with no Azure configuration at
 * all.
 *
 * Everything up to the commit happens in the browser: decode, parse, match, and
 * re-threshold. That is not an optimisation, it is what makes the review step
 * honest. A teacher can change the "counts as present" threshold and watch the
 * three groups recompute with no round trip, and the file itself never leaves
 * their device unless they press Import.
 *
 * It lives in its own dialog rather than inside AttendanceSheet so the everyday
 * attendance dialog stays a two-button dialog.
 */

import { useCallback, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  Collapse,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
  useMediaQuery,
  useTheme,
} from '@neram/ui';
import UploadFileOutlinedIcon from '@mui/icons-material/UploadFileOutlined';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import {
  parseTeamsAttendanceFile,
  parseTeamsAttendanceText,
  matchParticipants,
  decideAttendance,
  anchorToClassDate,
  type TeamsCsvParse,
  type RosterCandidate,
} from '@/lib/teams-attendance-csv';

/** Present-threshold choices, in seconds. */
const THRESHOLDS = [
  { label: 'Any join', seconds: 0 },
  { label: '5 min', seconds: 300 },
  { label: '15 min', seconds: 900 },
];

const DEFAULT_THRESHOLD = 300;

export interface TeamsCsvImportDialogProps {
  open: boolean;
  onClose: () => void;
  classId: string;
  classroomId: string;
  /** Full class start instant, or a bare YYYY-MM-DD. Anchors the timestamps. */
  classAnchorIso: string | null;
  roster: RosterCandidate[];
  getToken: () => Promise<string | null>;
  onImported: () => void;
}

export default function TeamsCsvImportDialog({
  open,
  onClose,
  classId,
  classroomId,
  classAnchorIso,
  roster,
  getToken,
  onImported,
}: TeamsCsvImportDialogProps) {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'));
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [dragging, setDragging] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [parse, setParse] = useState<TeamsCsvParse | null>(null);
  const [threshold, setThreshold] = useState(DEFAULT_THRESHOLD);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openGroup, setOpenGroup] = useState<string | null>('marked');

  const reset = () => {
    setParse(null);
    setFileName(null);
    setError(null);
    setThreshold(DEFAULT_THRESHOLD);
    setOpenGroup('marked');
  };

  const handleFile = useCallback(async (file: File) => {
    setParsing(true);
    setError(null);
    setFileName(file.name);
    try {
      setParse(await parseTeamsAttendanceFile(file));
    } finally {
      setParsing(false);
    }
  }, []);

  /**
   * Paste is a first-class input, not a nicety: on a phone the attendance report
   * is often already open in another app, and copying the table out of it is far
   * easier than saving a file and finding it again in a picker. Pasted text is
   * already decoded, so it skips the UTF-16 sniffing entirely.
   */
  const handlePaste = useCallback((event: React.ClipboardEvent) => {
    const text = event.clipboardData?.getData('text/plain');
    if (!text || !text.trim()) return;
    event.preventDefault();
    setFileName('Pasted text');
    setError(null);
    setParse(parseTeamsAttendanceText(text));
  }, []);

  // Matching is independent of the threshold, so it does not recompute when the
  // teacher moves the toggle.
  const summary = useMemo(
    () => (parse ? matchParticipants(parse.participants, roster) : null),
    [parse, roster],
  );

  const rosterById = useMemo(
    () => new Map(roster.map((r) => [r.student_id, r])),
    [roster],
  );

  const decided = useMemo(() => {
    if (!summary) return [];
    return summary.matched.map((match) => ({
      match,
      attended: decideAttendance(match.participant.durationSeconds, threshold),
    }));
  }, [summary, threshold]);

  const willBeMarked = decided.filter((d) => d.attended);
  const belowThreshold = decided.filter((d) => !d.attended);

  const handleImport = async () => {
    if (!summary || decided.length === 0) return;
    setImporting(true);
    setError(null);
    try {
      const token = await getToken();
      if (!token) {
        setError('Sign in again to import this report.');
        return;
      }

      const anchor = classAnchorIso;
      const rows = decided.map(({ match, attended }) => ({
        student_id: match.studentId,
        attended,
        duration_minutes:
          match.participant.durationSeconds === null
            ? null
            : Math.round(match.participant.durationSeconds / 60),
        // Timestamps are best effort. The file carries no offset, so anything
        // that cannot be anchored near this class is sent as null rather than as
        // a confidently wrong instant.
        joined_at: anchor ? anchorToClassDate(match.participant.firstJoinText, anchor) : null,
        left_at: anchor ? anchorToClassDate(match.participant.lastLeaveText, anchor) : null,
      }));

      const res = await fetch('/api/timetable/attendance-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          class_id: classId,
          classroom_id: classroomId,
          action: 'import_teams_csv',
          threshold_seconds: threshold,
          rows,
          meta: {
            file_name: fileName,
            matched: summary.matched.length,
            unmatched: summary.unmatched.length,
            encoding: parse?.encoding,
          },
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || 'Could not import this report.');
        return;
      }

      onImported();
      reset();
      onClose();
    } catch {
      setError('Could not import this report.');
    } finally {
      setImporting(false);
    }
  };

  const handleClose = () => {
    if (importing) return;
    reset();
    onClose();
  };

  return (
    <Dialog open={open} onClose={handleClose} fullWidth maxWidth="sm" fullScreen={fullScreen}>
      <DialogTitle sx={{ pb: 1 }}>
        <Typography variant="h6" sx={{ fontWeight: 600 }}>
          Upload the Teams report
        </Typography>
        <Typography variant="caption" color="text.secondary">
          Works without any Teams admin setup
        </Typography>
      </DialogTitle>

      <DialogContent onPaste={handlePaste}>
        {error && (
          <Alert severity="error" sx={{ mb: 1.5 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        {!parse && (
          <>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              In Teams, open this meeting, go to Attendance, and download the report. Drop that file
              here, or paste the table straight into this box.
            </Typography>

            <Box
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                const file = e.dataTransfer.files?.[0];
                if (file) handleFile(file);
              }}
              sx={{
                border: '2px dashed',
                borderColor: dragging ? 'primary.main' : 'divider',
                bgcolor: dragging ? 'action.hover' : 'background.default',
                borderRadius: 2,
                p: 3,
                textAlign: 'center',
                transition: 'border-color 150ms ease, background-color 150ms ease',
              }}
            >
              <UploadFileOutlinedIcon sx={{ fontSize: 32, color: 'primary.main', mb: 1 }} />
              <Typography sx={{ fontWeight: 700, fontSize: '0.875rem' }}>
                Drop the attendance report here
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', my: 1 }}>
                Usually named meetingAttendanceReport.csv
              </Typography>
              <input
                ref={fileInputRef}
                type="file"
                // Validated by name below as well: some Android pickers hide
                // files whose MIME type they do not recognise.
                accept=".csv,.txt,text/csv,text/plain"
                hidden
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFile(file);
                  e.target.value = '';
                }}
              />
              <Button
                variant="outlined"
                onClick={() => fileInputRef.current?.click()}
                disabled={parsing}
                sx={{ textTransform: 'none', minHeight: 48 }}
              >
                {parsing ? 'Reading...' : 'Browse files'}
              </Button>
            </Box>
          </>
        )}

        {parse?.fatal && (
          <Alert severity="error" sx={{ mt: 1.5 }} onClose={reset}>
            {parse.fatal}
          </Alert>
        )}

        {parse && !parse.fatal && summary && (
          <>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', mb: 1.5 }}>
              <Typography variant="body2" sx={{ fontWeight: 600, minWidth: 0, wordBreak: 'break-word' }}>
                {fileName}
              </Typography>
              <Button size="small" onClick={reset} sx={{ textTransform: 'none', minHeight: 44 }}>
                Choose another
              </Button>
            </Box>

            {parse.warnings.map((warning) => (
              <Alert key={warning} severity="info" sx={{ mb: 1 }}>
                {warning}
              </Alert>
            ))}

            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
              Teams lists everyone who joined, even for a few seconds. Counts as present after:
            </Typography>
            <ToggleButtonGroup
              value={threshold}
              exclusive
              size="small"
              onChange={(_, value) => value !== null && setThreshold(value)}
              sx={{ mb: 2, flexWrap: 'wrap' }}
            >
              {THRESHOLDS.map((option) => (
                <ToggleButton
                  key={option.seconds}
                  value={option.seconds}
                  sx={{ textTransform: 'none', minHeight: 48, px: 2 }}
                >
                  {option.label}
                </ToggleButton>
              ))}
            </ToggleButtonGroup>

            <Group
              id="marked"
              openGroup={openGroup}
              setOpenGroup={setOpenGroup}
              label="Will be marked present"
              count={willBeMarked.length}
              colour="success"
            >
              {willBeMarked.map(({ match }) => (
                <PersonRow
                  key={match.studentId ?? match.participant.rawName}
                  name={rosterById.get(match.studentId!)?.name || match.participant.rawName}
                  detail={[
                    match.participant.identifier,
                    formatDuration(match.participant.durationSeconds),
                    match.matchedBy === 'name' ? 'matched on name' : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                />
              ))}
            </Group>

            <Group
              id="below"
              openGroup={openGroup}
              setOpenGroup={setOpenGroup}
              label="Joined, but under the threshold"
              count={belowThreshold.length}
              colour="warning"
            >
              {belowThreshold.map(({ match }) => (
                <PersonRow
                  key={match.studentId ?? match.participant.rawName}
                  name={rosterById.get(match.studentId!)?.name || match.participant.rawName}
                  detail={[
                    match.participant.identifier,
                    formatDuration(match.participant.durationSeconds),
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                />
              ))}
            </Group>

            <Group
              id="unmatched"
              openGroup={openGroup}
              setOpenGroup={setOpenGroup}
              label="Not on this roster"
              count={summary.unmatched.length}
              colour="default"
            >
              {summary.unmatched.map((match) => (
                <PersonRow
                  key={`${match.participant.rawName}-${match.participant.identifier ?? ''}`}
                  name={match.participant.rawName || 'Unnamed participant'}
                  detail={[
                    match.participant.identifier,
                    match.ambiguous ? 'two students share this name, so we did not guess' : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                />
              ))}
            </Group>

            <Group
              id="missing"
              openGroup={openGroup}
              setOpenGroup={setOpenGroup}
              label="On the roster, not in the report"
              count={summary.missingFromFile.length}
              colour="default"
            >
              {summary.missingFromFile.map((student) => (
                <PersonRow
                  key={student.student_id}
                  name={student.name || 'Unnamed student'}
                  detail="Left as they are, so you can still mark them by hand"
                />
              ))}
            </Group>

            <Divider sx={{ my: 1.5 }} />
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
              Importing marks this class as synced, so the nightly Teams sync will leave it alone.
              Anything you toggle by hand afterwards always wins.
            </Typography>
          </>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2, gap: 1 }}>
        <Button onClick={handleClose} disabled={importing} sx={{ minHeight: 48 }}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={handleImport}
          disabled={importing || decided.length === 0}
          sx={{ textTransform: 'none', minHeight: 48 }}
        >
          {importing
            ? 'Importing...'
            : `Import ${decided.length} ${decided.length === 1 ? 'student' : 'students'}`}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

/**
 * A collapsible group with its count in the summary line.
 *
 * Counts stay visible when collapsed, so nothing is hidden, but only one group
 * is expanded at a time. On a 375px screen four expanded lists would bury the
 * import button below several screens of scrolling.
 */
function Group({
  id,
  openGroup,
  setOpenGroup,
  label,
  count,
  colour,
  children,
}: {
  id: string;
  openGroup: string | null;
  setOpenGroup: (id: string | null) => void;
  label: string;
  count: number;
  colour: 'success' | 'warning' | 'default';
  children: React.ReactNode;
}) {
  const isOpen = openGroup === id;
  return (
    <Box sx={{ mb: 1 }}>
      <Box
        role="button"
        tabIndex={0}
        onClick={() => setOpenGroup(isOpen ? null : id)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') setOpenGroup(isOpen ? null : id);
        }}
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          minHeight: 48,
          px: 1,
          borderRadius: 1,
          cursor: count > 0 ? 'pointer' : 'default',
          '&:hover': { bgcolor: count > 0 ? 'action.hover' : 'transparent' },
        }}
      >
        <Chip
          label={count}
          size="small"
          color={colour === 'default' ? undefined : colour}
          sx={{ minWidth: 40 }}
        />
        <Typography variant="body2" sx={{ flex: 1, minWidth: 0 }}>
          {label}
        </Typography>
        {count > 0 && (
          <ExpandMoreIcon
            sx={{
              fontSize: 20,
              transform: isOpen ? 'rotate(180deg)' : 'none',
              transition: 'transform 150ms ease',
            }}
          />
        )}
      </Box>
      <Collapse in={isOpen && count > 0}>
        <Box sx={{ pl: 1, pr: 1, pb: 1 }}>{children}</Box>
      </Collapse>
    </Box>
  );
}

/**
 * One person. Stacked, never a table: the detail line wraps underneath the name
 * instead of pushing it off a 375px screen.
 */
function PersonRow({ name, detail }: { name: string; detail: string }) {
  return (
    <Box sx={{ py: 0.75, borderBottom: '1px solid', borderColor: 'divider' }}>
      <Typography variant="body2" sx={{ fontWeight: 500, wordBreak: 'break-word' }}>
        {name}
      </Typography>
      {detail && (
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ display: 'block', wordBreak: 'break-word' }}
        >
          {detail}
        </Typography>
      )}
    </Box>
  );
}

function formatDuration(seconds: number | null): string | null {
  if (seconds === null) return 'duration not readable';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}
