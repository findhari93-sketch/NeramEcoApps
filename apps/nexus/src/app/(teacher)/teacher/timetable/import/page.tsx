'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Snackbar,
  Typography,
  alpha,
  useTheme,
} from '@neram/ui';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import UploadFileOutlinedIcon from '@mui/icons-material/UploadFileOutlined';
import DownloadOutlinedIcon from '@mui/icons-material/DownloadOutlined';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import { useRouter } from 'next/navigation';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import { useTimetableView } from '@/hooks/useTimetableView';
import {
  describeParse,
  parseWeekRows,
  type ParseResult,
  type ParsedEntry,
  type RawRow,
} from '@/lib/week-import';
import { RADIUS, tagSx } from '@/components/timetable/timetable-theme';
import { formatTime } from '@/components/timetable/date-utils';

/**
 * Import a week from the spreadsheet the teacher already writes it in.
 *
 * Three steps, all on one screen: drop the file, review what was read, commit.
 * Nothing is written until the teacher presses Import, and imported classes
 * land as drafts so the week still has to be published deliberately.
 *
 * Parsing runs in the browser (see lib/week-import.ts): the file never leaves
 * the device unless the teacher commits, and a misread column costs nothing to
 * correct because there is no upload round trip.
 */
export default function ImportWeekPage() {
  const router = useRouter();
  const theme = useTheme();
  const { activeClassroom, getToken, timetableWindow } = useNexusAuthContext();
  const viewState = useTimetableView([], 'agenda');
  const { week } = viewState;

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [parsing, setParsing] = useState(false);
  const [result, setResult] = useState<ParseResult | null>(null);
  const [importing, setImporting] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' | 'info' }>({
    open: false,
    message: '',
    severity: 'success',
  });

  const importable = useMemo(
    () => (result?.entries || []).filter((e) => e.issues.length === 0),
    [result],
  );
  const problemCount = (result?.entries.length || 0) - importable.length;

  /**
   * The template route is authenticated, so this cannot be a plain link: fetch
   * it with the bearer token and hand the browser a blob.
   */
  const downloadTemplate = useCallback(async () => {
    setDownloading(true);
    try {
      const token = await getToken();
      if (!token) throw new Error('Your session expired. Sign in again.');
      const res = await fetch(
        `/api/timetable/import-week?template=1&week_start=${week.start}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!res.ok) throw new Error('Could not build the template');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `neram-week-${week.start}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setSnackbar({
        open: true,
        message: err instanceof Error ? err.message : 'Could not download the template',
        severity: 'error',
      });
    } finally {
      setDownloading(false);
    }
  }, [getToken, week.start]);

  const handleFile = useCallback(
    async (file: File) => {
      setParsing(true);
      setFileName(file.name);
      setResult(null);
      try {
        // Loaded on demand: the xlsx parser is large and most teachers reach
        // this page without importing anything.
        const XLSX = await import('xlsx');
        const buffer = await file.arrayBuffer();
        const book = XLSX.read(buffer, { type: 'array' });
        const sheet = book.Sheets[book.SheetNames[0]];
        if (!sheet) {
          setResult({
            entries: [],
            validCount: 0,
            classCount: 0,
            holidayCount: 0,
            fatal: 'That file has no sheets in it.',
          });
          return;
        }

        const rows = XLSX.utils.sheet_to_json<RawRow>(sheet, { defval: '', raw: true });
        setResult(
          parseWeekRows(rows, {
            defaultStart: timetableWindow.start,
            defaultEnd: timetableWindow.end,
            rangeStart: week.start,
            rangeEnd: week.end,
          }),
        );
      } catch {
        setResult({
          entries: [],
          validCount: 0,
          classCount: 0,
          holidayCount: 0,
          fatal: 'Could not read that file. Save it as .xlsx or .csv and try again.',
        });
      } finally {
        setParsing(false);
      }
    },
    [timetableWindow, week.start, week.end],
  );

  const commit = async () => {
    if (!activeClassroom || importable.length === 0) return;
    setImporting(true);
    try {
      const token = await getToken();
      const res = await fetch('/api/timetable/import-week', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ classroom_id: activeClassroom.id, entries: importable }),
      });
      const data = await res.json();

      if (res.ok) {
        setSnackbar({ open: true, message: data.message, severity: 'success' });
        // Land the teacher in the planner, where the drafts now are.
        setTimeout(() => router.push('/teacher/timetable'), 1200);
      } else {
        setSnackbar({ open: true, message: data.error || 'Import failed', severity: 'error' });
      }
    } catch {
      setSnackbar({ open: true, message: 'Import failed', severity: 'error' });
    } finally {
      setImporting(false);
    }
  };

  return (
    <Box>
      <Button
        startIcon={<ArrowBackIcon />}
        onClick={() => router.push('/teacher/timetable')}
        sx={{ textTransform: 'none', mb: 2, minHeight: 44 }}
      >
        Back to timetable
      </Button>

      <Typography
        sx={{
          fontSize: '0.6563rem',
          fontWeight: 700,
          letterSpacing: '.1em',
          textTransform: 'uppercase',
          color: 'primary.main',
        }}
      >
        Week of {week.label}
      </Typography>
      <Typography variant="h5" component="h1" sx={{ fontWeight: 800, mt: 0.5 }}>
        Upload the week
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, mb: 3 }}>
        Drop the schedule you already wrote in Excel. Review what we read, then import it as drafts
        and publish when you are ready.
      </Typography>

      {/* Drop zone */}
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
          border: `2px dashed ${dragging ? theme.palette.primary.main : theme.palette.divider}`,
          bgcolor: dragging ? alpha(theme.palette.primary.main, 0.04) : 'background.default',
          borderRadius: RADIUS.card,
          p: 4,
          textAlign: 'center',
          transition: 'border-color 150ms ease, background-color 150ms ease',
        }}
      >
        <UploadFileOutlinedIcon sx={{ fontSize: 32, color: 'primary.main', mb: 1 }} />
        <Typography sx={{ fontWeight: 700, fontSize: '0.875rem' }}>
          Drop an .xlsx or .csv here
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', my: 1 }}>
          Needs a date column and a class column. Time, teacher and holiday columns are optional.
        </Typography>
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
            e.target.value = '';
          }}
        />
        <Box sx={{ display: 'flex', gap: 1.25, justifyContent: 'center', flexWrap: 'wrap' }}>
          <Button
            variant="outlined"
            onClick={() => fileInputRef.current?.click()}
            disabled={parsing}
            sx={{ textTransform: 'none', minHeight: 44, borderRadius: RADIUS.control }}
          >
            {parsing ? 'Reading...' : 'Browse files'}
          </Button>
          {/* Starting from nothing is the hard case: an empty drop zone gives no
              hint of what the file should look like. */}
          <Button
            variant="text"
            startIcon={<DownloadOutlinedIcon />}
            onClick={downloadTemplate}
            disabled={downloading}
            sx={{ textTransform: 'none', minHeight: 44, borderRadius: RADIUS.control }}
          >
            {downloading ? 'Preparing...' : 'Download template'}
          </Button>
        </Box>
        {fileName && (
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1.5 }}>
            {fileName}
          </Typography>
        )}
      </Box>

      {parsing && (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
          <CircularProgress size={24} />
        </Box>
      )}

      {result?.fatal && (
        <Alert severity="error" sx={{ mt: 3, borderRadius: 2 }}>
          {result.fatal}
        </Alert>
      )}

      {/* Preview */}
      {result && !result.fatal && (
        <Box sx={{ mt: 3 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1.5, flexWrap: 'wrap' }}>
            <Typography sx={{ fontWeight: 700, fontSize: '0.875rem' }}>
              {describeParse(result)}
            </Typography>
            {problemCount > 0 && (
              <Box component="span" sx={tagSx(theme, 'error')}>
                <WarningAmberIcon sx={{ fontSize: 13 }} />
                {problemCount} need{problemCount === 1 ? 's' : ''} a look
              </Box>
            )}
          </Box>

          {problemCount > 0 && (
            <Alert severity="warning" sx={{ mb: 2, borderRadius: 2 }}>
              Rows with a problem are listed but will not be imported. Fix them in the file and drop
              it again, or import the rest now and add those by hand.
            </Alert>
          )}

          <Box
            sx={{
              border: `1px solid ${theme.palette.divider}`,
              borderRadius: RADIUS.card,
              overflow: 'hidden',
            }}
          >
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', sm: '90px 1fr 110px 1fr' },
                gap: 1,
                px: 1.75,
                py: 1.125,
                bgcolor: 'background.default',
                fontSize: '0.625rem',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '.04em',
                color: 'text.disabled',
              }}
            >
              <span>Day</span>
              <span>Class</span>
              <Box component="span" sx={{ display: { xs: 'none', sm: 'block' } }}>
                Time
              </Box>
              <Box component="span" sx={{ display: { xs: 'none', sm: 'block' } }}>
                Teacher
              </Box>
            </Box>

            {result.entries.map((entry) => (
              <PreviewRow key={entry.row} entry={entry} />
            ))}
          </Box>

          <Box sx={{ display: 'flex', gap: 1.25, mt: 2.5, flexWrap: 'wrap' }}>
            <Button
              variant="contained"
              disabled={importable.length === 0 || importing || !activeClassroom}
              onClick={commit}
              startIcon={importing ? <CircularProgress size={16} color="inherit" /> : undefined}
              sx={{ textTransform: 'none', fontWeight: 700, minHeight: 48, borderRadius: RADIUS.control }}
            >
              {importing
                ? 'Importing...'
                : `Import ${importable.length} ${importable.length === 1 ? 'row' : 'rows'} as drafts`}
            </Button>
            <Button
              onClick={() => {
                setResult(null);
                setFileName(null);
              }}
              sx={{ textTransform: 'none', minHeight: 48 }}
            >
              Start over
            </Button>
          </Box>
        </Box>
      )}

      <Snackbar
        open={snackbar.open}
        autoHideDuration={5000}
        onClose={() => setSnackbar((s) => ({ ...s, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity={snackbar.severity} onClose={() => setSnackbar((s) => ({ ...s, open: false }))}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}

function PreviewRow({ entry }: { entry: ParsedEntry }) {
  const theme = useTheme();
  const hasIssues = entry.issues.length > 0;
  const isHoliday = entry.kind === 'holiday';

  return (
    <Box
      sx={{
        borderTop: `1px solid ${theme.palette.divider}`,
        px: 1.75,
        py: 1.25,
        bgcolor: hasIssues
          ? alpha(theme.palette.error.main, 0.05)
          : isHoliday
            ? alpha(theme.palette.text.primary, 0.02)
            : 'transparent',
      }}
    >
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', sm: '90px 1fr 110px 1fr' },
          gap: 1,
          alignItems: 'center',
          fontSize: '0.75rem',
        }}
      >
        <Typography sx={{ fontWeight: 700, fontSize: '0.75rem' }}>
          {entry.date
            ? new Date(`${entry.date}T00:00:00`).toLocaleDateString('en-IN', {
                weekday: 'short',
                day: 'numeric',
              })
            : `Row ${entry.row}`}
        </Typography>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap' }}>
          {isHoliday && (
            <Box component="span" sx={tagSx(theme, 'neutral')}>
              Holiday
            </Box>
          )}
          <Typography sx={{ fontSize: '0.75rem' }}>{entry.title || '(untitled)'}</Typography>
        </Box>

        <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>
          {isHoliday || !entry.startTime
            ? 'Not set'
            : `${formatTime(entry.startTime)}${entry.endTime ? ` to ${formatTime(entry.endTime)}` : ''}`}
        </Typography>

        <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary' }} noWrap>
          {entry.teacherName || 'Not set'}
        </Typography>
      </Box>

      {hasIssues && (
        <Box sx={{ mt: 0.75, display: 'flex', flexDirection: 'column', gap: 0.25 }}>
          {entry.issues.map((issue, i) => (
            <Typography key={i} variant="caption" sx={{ color: 'error.dark' }}>
              Row {entry.row}: {issue}
            </Typography>
          ))}
        </Box>
      )}
    </Box>
  );
}
