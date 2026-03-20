'use client';

import { useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  Box,
  Typography,
  Button,
  Paper,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  Alert,
  Chip,
  Snackbar,
  Skeleton,
  IconButton,
  alpha,
  useTheme,
  LinearProgress,
} from '@neram/ui';
import ArrowBackOutlinedIcon from '@mui/icons-material/ArrowBackOutlined';
import CloudUploadOutlinedIcon from '@mui/icons-material/CloudUploadOutlined';
import DownloadOutlinedIcon from '@mui/icons-material/DownloadOutlined';
import CheckCircleOutlinedIcon from '@mui/icons-material/CheckCircleOutlined';
import WarningAmberOutlinedIcon from '@mui/icons-material/WarningAmberOutlined';
import ErrorOutlinedIcon from '@mui/icons-material/ErrorOutlined';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import {
  parseCSV,
  parseJSON,
  generateCSVTemplate,
  type SolutionEntry,
} from '@/lib/solution-csv-parser';

type UploadState = 'idle' | 'preview' | 'uploading' | 'done';

interface UploadResult {
  updated: number;
  updated_labels: string[];
  not_found: string[];
  errors: string[];
}

export default function BulkSolutionUploadPage() {
  const router = useRouter();
  const theme = useTheme();
  const { getToken } = useNexusAuthContext();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [state, setState] = useState<UploadState>('idle');
  const [entries, setEntries] = useState<SolutionEntry[]>([]);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [fileName, setFileName] = useState('');
  const [result, setResult] = useState<UploadResult | null>(null);
  const [error, setError] = useState('');
  const [snackbar, setSnackbar] = useState('');

  // Drag state
  const [dragOver, setDragOver] = useState(false);

  const handleDownloadTemplate = useCallback(() => {
    const csv = generateCSVTemplate();
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'solution-upload-template.csv';
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  const processFile = useCallback((file: File) => {
    setError('');
    setFileName(file.name);

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      if (!text) {
        setError('Could not read file');
        return;
      }

      let parsed: { entries: SolutionEntry[]; errors: string[] };

      if (file.name.endsWith('.json')) {
        parsed = parseJSON(text);
      } else {
        parsed = parseCSV(text);
      }

      setEntries(parsed.entries);
      setParseErrors(parsed.errors);
      setState('preview');
    };

    reader.onerror = () => {
      setError('Failed to read file');
    };

    reader.readAsText(file);
  }, []);

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) processFile(file);
      // Reset input so same file can be re-selected
      if (e.target) e.target.value = '';
    },
    [processFile]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files?.[0];
      if (file) {
        const ext = file.name.split('.').pop()?.toLowerCase();
        if (ext === 'csv' || ext === 'json') {
          processFile(file);
        } else {
          setError('Only .csv and .json files are accepted');
        }
      }
    },
    [processFile]
  );

  const handleUpload = useCallback(async () => {
    if (entries.length === 0) return;
    setState('uploading');
    setError('');

    try {
      const token = await getToken();
      if (!token) {
        setError('Authentication failed');
        setState('preview');
        return;
      }

      const res = await fetch('/api/question-bank/solutions/bulk-upload', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ solutions: entries }),
      });

      const json = await res.json();
      if (!res.ok) {
        setError(json.error || 'Upload failed');
        setState('preview');
        return;
      }

      setResult(json.data);
      setState('done');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
      setState('preview');
    }
  }, [entries, getToken]);

  const handleReset = useCallback(() => {
    setState('idle');
    setEntries([]);
    setParseErrors([]);
    setFileName('');
    setResult(null);
    setError('');
  }, []);

  const getIdentifierLabel = (entry: SolutionEntry) => {
    if (entry.match_by === 'nta_question_id') {
      return entry.nta_question_id || '-';
    }
    const parts = [entry.exam_type, entry.year];
    if (entry.session) parts.push(`S${entry.session}`);
    if (entry.question_number != null) parts.push(`#${entry.question_number}`);
    return parts.join(' / ');
  };

  const truncate = (text: string | undefined, max: number) => {
    if (!text) return '-';
    return text.length > max ? text.slice(0, max) + '...' : text;
  };

  return (
    <Box sx={{ px: { xs: 2, md: 3 }, py: 2, maxWidth: 960, mx: 'auto' }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2.5 }}>
        <IconButton
          size="small"
          onClick={() => router.push('/teacher/question-bank')}
        >
          <ArrowBackOutlinedIcon />
        </IconButton>
        <Typography variant="h5" component="h1" fontWeight={700}>
          Bulk Solution Upload
        </Typography>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
          {error}
        </Alert>
      )}

      {/* Download Template */}
      {(state === 'idle' || state === 'preview') && (
        <Box sx={{ mb: 2 }}>
          <Button
            variant="outlined"
            startIcon={<DownloadOutlinedIcon />}
            onClick={handleDownloadTemplate}
            size="small"
          >
            Download CSV Template
          </Button>
        </Box>
      )}

      {/* Upload Zone */}
      {state === 'idle' && (
        <Paper
          variant="outlined"
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          sx={{
            p: { xs: 3, md: 5 },
            textAlign: 'center',
            cursor: 'pointer',
            borderStyle: 'dashed',
            borderWidth: 2,
            borderRadius: 2.5,
            borderColor: dragOver ? 'primary.main' : 'divider',
            bgcolor: dragOver
              ? alpha(theme.palette.primary.main, 0.04)
              : 'background.paper',
            transition: 'all 0.2s',
            '&:hover': {
              borderColor: 'primary.light',
              bgcolor: alpha(theme.palette.primary.main, 0.02),
            },
          }}
        >
          <CloudUploadOutlinedIcon
            sx={{
              fontSize: { xs: 48, md: 64 },
              color: dragOver ? 'primary.main' : 'text.disabled',
              mb: 1.5,
            }}
          />
          <Typography variant="h6" fontWeight={600} sx={{ mb: 0.5 }}>
            Drop your file here
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            or click to browse. Accepts .csv and .json files.
          </Typography>
          <Button variant="contained" size="small" component="span">
            Choose File
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.json"
            hidden
            onChange={handleFileSelect}
          />
        </Paper>
      )}

      {/* Preview Table */}
      {state === 'preview' && (
        <Box>
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1,
              mb: 1.5,
              flexWrap: 'wrap',
            }}
          >
            <Chip label={fileName} size="small" variant="outlined" />
            <Chip
              label={`${entries.length} valid`}
              size="small"
              color="success"
              variant="outlined"
            />
            {parseErrors.length > 0 && (
              <Chip
                label={`${parseErrors.length} errors`}
                size="small"
                color="error"
                variant="outlined"
              />
            )}
            <Box sx={{ flexGrow: 1 }} />
            <Button size="small" variant="text" onClick={handleReset}>
              Clear
            </Button>
          </Box>

          {parseErrors.length > 0 && (
            <Alert severity="warning" sx={{ mb: 1.5 }}>
              <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
                {parseErrors.length} row(s) had errors and were skipped:
              </Typography>
              <Box
                component="ul"
                sx={{ m: 0, pl: 2, maxHeight: 120, overflowY: 'auto' }}
              >
                {parseErrors.map((err, i) => (
                  <li key={i}>
                    <Typography variant="caption">{err}</Typography>
                  </li>
                ))}
              </Box>
            </Alert>
          )}

          {entries.length > 0 && (
            <Paper
              variant="outlined"
              sx={{ borderRadius: 2, overflow: 'auto', mb: 2 }}
            >
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 600, whiteSpace: 'nowrap' }}>
                      Match By
                    </TableCell>
                    <TableCell sx={{ fontWeight: 600, whiteSpace: 'nowrap' }}>
                      Identifier
                    </TableCell>
                    <TableCell sx={{ fontWeight: 600, whiteSpace: 'nowrap' }}>
                      Video URL
                    </TableCell>
                    <TableCell sx={{ fontWeight: 600, whiteSpace: 'nowrap' }}>
                      Brief
                    </TableCell>
                    <TableCell sx={{ fontWeight: 600, whiteSpace: 'nowrap' }}>
                      Detailed
                    </TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {entries.map((entry, i) => (
                    <TableRow key={i}>
                      <TableCell>
                        <Chip
                          label={
                            entry.match_by === 'nta_question_id'
                              ? 'NTA ID'
                              : 'Source'
                          }
                          size="small"
                          color={
                            entry.match_by === 'nta_question_id'
                              ? 'primary'
                              : 'secondary'
                          }
                          variant="outlined"
                        />
                      </TableCell>
                      <TableCell sx={{ whiteSpace: 'nowrap' }}>
                        {getIdentifierLabel(entry)}
                      </TableCell>
                      <TableCell>
                        {entry.solution_video_url ? (
                          <Typography
                            variant="caption"
                            sx={{
                              color: 'primary.main',
                              wordBreak: 'break-all',
                            }}
                          >
                            {truncate(entry.solution_video_url, 40)}
                          </Typography>
                        ) : (
                          '-'
                        )}
                      </TableCell>
                      <TableCell>
                        <Typography variant="caption">
                          {truncate(entry.explanation_brief, 50)}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="caption">
                          {truncate(entry.explanation_detailed, 50)}
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Paper>
          )}

          <Box
            sx={{
              display: 'flex',
              gap: 1.5,
              justifyContent: { xs: 'stretch', sm: 'flex-end' },
              flexDirection: { xs: 'column', sm: 'row' },
            }}
          >
            <Button variant="outlined" onClick={handleReset}>
              Cancel
            </Button>
            <Button
              variant="contained"
              onClick={handleUpload}
              disabled={entries.length === 0}
              startIcon={<CloudUploadOutlinedIcon />}
            >
              Upload {entries.length} Solution{entries.length !== 1 ? 's' : ''}
            </Button>
          </Box>
        </Box>
      )}

      {/* Uploading State */}
      {state === 'uploading' && (
        <Paper
          variant="outlined"
          sx={{ p: 3, textAlign: 'center', borderRadius: 2.5 }}
        >
          <CloudUploadOutlinedIcon
            sx={{ fontSize: 48, color: 'primary.main', mb: 1.5 }}
          />
          <Typography variant="h6" fontWeight={700} sx={{ mb: 1 }}>
            Uploading Solutions...
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Matching questions and updating solutions. This may take a moment.
          </Typography>
          <Box sx={{ maxWidth: 400, mx: 'auto' }}>
            <LinearProgress sx={{ height: 6, borderRadius: 3 }} />
          </Box>
        </Paper>
      )}

      {/* Results */}
      {state === 'done' && result && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {/* Updated */}
          {result.updated > 0 && (
            <Alert
              severity="success"
              icon={<CheckCircleOutlinedIcon />}
              sx={{ borderRadius: 2 }}
            >
              <Typography variant="subtitle2" fontWeight={600}>
                {result.updated} question{result.updated !== 1 ? 's' : ''}{' '}
                updated successfully
              </Typography>
            </Alert>
          )}

          {/* Not Found */}
          {result.not_found.length > 0 && (
            <Alert
              severity="warning"
              icon={<WarningAmberOutlinedIcon />}
              sx={{ borderRadius: 2 }}
            >
              <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 0.5 }}>
                {result.not_found.length} question
                {result.not_found.length !== 1 ? 's' : ''} not found
              </Typography>
              <Box
                component="ul"
                sx={{ m: 0, pl: 2, maxHeight: 160, overflowY: 'auto' }}
              >
                {result.not_found.map((label, i) => (
                  <li key={i}>
                    <Typography variant="caption">{label}</Typography>
                  </li>
                ))}
              </Box>
            </Alert>
          )}

          {/* Errors */}
          {result.errors.length > 0 && (
            <Alert
              severity="error"
              icon={<ErrorOutlinedIcon />}
              sx={{ borderRadius: 2 }}
            >
              <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 0.5 }}>
                {result.errors.length} error{result.errors.length !== 1 ? 's' : ''}
              </Typography>
              <Box
                component="ul"
                sx={{ m: 0, pl: 2, maxHeight: 160, overflowY: 'auto' }}
              >
                {result.errors.map((err, i) => (
                  <li key={i}>
                    <Typography variant="caption">{err}</Typography>
                  </li>
                ))}
              </Box>
            </Alert>
          )}

          {/* No matches at all */}
          {result.updated === 0 &&
            result.not_found.length === 0 &&
            result.errors.length === 0 && (
              <Alert severity="info" sx={{ borderRadius: 2 }}>
                No solutions were processed.
              </Alert>
            )}

          {/* Actions */}
          <Box
            sx={{
              display: 'flex',
              gap: 1.5,
              justifyContent: { xs: 'stretch', sm: 'flex-end' },
              flexDirection: { xs: 'column', sm: 'row' },
            }}
          >
            <Button variant="outlined" onClick={handleReset}>
              Upload More
            </Button>
            <Button
              variant="contained"
              onClick={() => router.push('/teacher/question-bank')}
            >
              Back to Question Bank
            </Button>
          </Box>
        </Box>
      )}

      <Snackbar
        open={!!snackbar}
        autoHideDuration={3000}
        onClose={() => setSnackbar('')}
        message={snackbar}
      />
    </Box>
  );
}
