// @ts-nocheck
'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Box,
  Paper,
  Typography,
  Button,
  Alert,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  CircularProgress,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
} from '@neram/ui';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import DownloadIcon from '@mui/icons-material/Download';
import Papa from 'papaparse';

interface CsvImporterProps {
  type: 'rank-list' | 'allotment-list' | 'cutoffs';
  systemId: string;
  systemName: string;
  /** Year controlled by parent — single source of truth */
  year: number;
  /** Called when import succeeds */
  onImportComplete?: (result: { count: number }) => void;
}

// Expected columns per import type
const EXPECTED_COLUMNS: Record<string, { required: string[]; optional: string[] }> = {
  'rank-list': {
    required: ['rank', 'aggregate_mark', 'community'],
    optional: ['serial_number', 'application_number', 'candidate_name', 'date_of_birth', 'hsc_aggregate_mark', 'entrance_exam_mark', 'community_rank'],
  },
  'allotment-list': {
    required: ['community', 'college_code', 'branch_code', 'allotted_category'],
    optional: ['serial_number', 'rank', 'aggregate_mark', 'college_id', 'application_number', 'candidate_name', 'date_of_birth', 'college_name', 'branch_name'],
  },
  cutoffs: {
    required: ['college_id', 'round', 'branch_code', 'category', 'closing_mark'],
    optional: ['closing_rank', 'opening_mark', 'opening_rank', 'seats_available', 'seats_filled'],
  },
};

// Column alias map: CSV header (lowercased) → database column name
// Allows users to upload CSVs with original PDF headers (e.g. AGGR_MARK → aggregate_mark)
const COLUMN_ALIASES: Record<string, string> = {
  aggr_mark: 'aggregate_mark',
  s_no: 'serial_number',
  appln_no: 'application_number',
  name: 'candidate_name',
  dob: 'date_of_birth',
  'name_of_the_candidate': 'candidate_name',
  'date_of_birth': 'date_of_birth',
  'application_number': 'application_number',
  'nata_/_jee_mark': 'entrance_exam_mark',
  'nata_jee_mark': 'entrance_exam_mark',
  'entrance_mark': 'entrance_exam_mark',
  'hsc_mark': 'hsc_aggregate_mark',
};

// Columns that must be numeric — "-", "N/A", empty → null
const NUMERIC_COLUMNS: Record<string, string[]> = {
  'rank-list': ['rank', 'aggregate_mark', 'hsc_aggregate_mark', 'entrance_exam_mark', 'community_rank', 'serial_number'],
  'allotment-list': ['rank', 'aggregate_mark', 'serial_number'],
  cutoffs: ['closing_mark', 'closing_rank', 'opening_mark', 'opening_rank', 'seats_available', 'seats_filled'],
};

const TYPE_LABELS: Record<string, string> = {
  'rank-list': 'Rank List',
  'allotment-list': 'Allotment List',
  cutoffs: 'Historical Cutoffs',
};

// Sample rows for template CSV downloads
const TEMPLATE_SAMPLES: Record<string, string[][]> = {
  'rank-list': [
    ['1', '385.50', 'OC', '', '100029', 'Keerthana Venkatraman', '21-03-2005', '195.50', '190.00', ''],
    ['2', '382.00', 'BC', '1', '100030', 'Harini S N', '28-09-2005', '188.00', '194.00', '1001'],
    ['3', '380.20', 'OC', '', '101304', 'Meena KP', '12-05-2005', '192.20', '188.00', ''],
    ['4', '378.10', 'MBC', '1', '101679', 'Student D', '18-12-2005', '185.10', '193.00', '2001'],
    ['5', '375.00', 'SC', '1', '101648', 'Student E', '05-04-2006', '180.00', '195.00', '3001'],
  ],
  'allotment-list': [
    ['OC', '1001', 'ARCH', 'OC', '1', '1', '385.50', '', 'APP2024001', 'STUDENT A', '2006-05-15', 'ABC Architecture College', 'Architecture'],
    ['BC', '1002', 'ARCH', 'BC', '2', '2', '382.00', '', 'APP2024002', 'STUDENT B', '2005-11-20', 'XYZ Architecture School', 'Architecture'],
    ['OC', '1003', 'ARCH', 'OC', '3', '3', '380.20', '', 'APP2024003', 'STUDENT C', '2006-01-10', 'ABC Architecture College', 'Architecture'],
  ],
  cutoffs: [
    ['college-uuid-1', 'Round 1', 'ARCH', 'OC', '370.50', '50', '380.00', '1', '', ''],
    ['college-uuid-1', 'Round 1', 'ARCH', 'BC', '355.20', '120', '365.00', '30', '', ''],
    ['college-uuid-2', 'Round 1', 'ARCH', 'OC', '340.00', '200', '360.00', '80', '', ''],
  ],
};

function csvEscape(val: string): string {
  if (val.includes(',') || val.includes('"') || val.includes('\n')) {
    return `"${val.replace(/"/g, '""')}"`;
  }
  return val;
}

function downloadTemplate(type: string) {
  const cols = EXPECTED_COLUMNS[type];
  const allHeaders = [...cols.required, ...cols.optional];
  const samples = TEMPLATE_SAMPLES[type] || [];
  const csvContent = [
    allHeaders.join(','),
    ...samples.map((row) => row.map(csvEscape).join(',')),
  ].join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${type}-template.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

/** Validate and clean a single CSV row: convert non-numeric strings to null for numeric columns */
function validateAndCleanRow(
  row: Record<string, any>,
  type: string,
  rowIndex: number
): { cleaned: Record<string, any>; warnings: string[] } {
  const warnings: string[] = [];
  const cleaned: Record<string, any> = {};
  const numericCols = NUMERIC_COLUMNS[type] || [];
  const cols = EXPECTED_COLUMNS[type];

  for (const [key, value] of Object.entries(row)) {
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (numericCols.includes(key)) {
        if (trimmed === '-' || trimmed === 'N/A' || trimmed === '' || trimmed === 'NA') {
          if (cols.required.includes(key)) {
            warnings.push(`Row ${rowIndex + 1}: Required field "${key}" has invalid value "${value}"`);
          }
          cleaned[key] = null;
        } else {
          const num = Number(trimmed);
          if (isNaN(num)) {
            warnings.push(`Row ${rowIndex + 1}: "${key}" expected number, got "${value}"`);
            cleaned[key] = null;
          } else {
            cleaned[key] = num;
          }
        }
      } else {
        cleaned[key] = trimmed;
      }
    } else if (value === null || value === undefined) {
      cleaned[key] = null;
    } else {
      cleaned[key] = value;
    }
  }
  return { cleaned, warnings };
}

export default function CsvImporter({ type, systemId, systemName, year, onImportComplete }: CsvImporterProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [parsedData, setParsedData] = useState<any[] | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ success: boolean; message: string } | null>(null);
  const [fileName, setFileName] = useState('');

  // Preview pagination
  const [previewPage, setPreviewPage] = useState(0);
  const [previewRowsPerPage, setPreviewRowsPerPage] = useState(50);
  const [warningRows, setWarningRows] = useState<Set<number>>(new Set());

  // Confirmation dialog
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [existingCount, setExistingCount] = useState<number | null>(null);
  const [checkingExisting, setCheckingExisting] = useState(false);

  const expectedCols = EXPECTED_COLUMNS[type];

  // Reset import result when year changes
  useEffect(() => {
    setImportResult(null);
  }, [year]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setImportResult(null);
    setErrors([]);
    setPreviewPage(0);

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: true,
      transformHeader: (header: string) => {
        // Normalize: lowercase, trim, replace spaces with underscores
        // This handles PDF headers like "NAME OF THE CANDIDATE" → "name_of_the_candidate"
        const lower = header.trim().toLowerCase().replace(/\s+/g, '_');
        return COLUMN_ALIASES[lower] || lower;
      },
      complete: (results) => {
        const { data, meta, errors: parseErrors } = results;
        const newErrors: string[] = [];
        const warningRowSet = new Set<number>();

        if (parseErrors.length > 0) {
          parseErrors.slice(0, 5).forEach((e) => {
            newErrors.push(`Row ${(e.row ?? 0) + 1}: ${e.message}`);
            if (e.row != null) warningRowSet.add(e.row);
          });
        }

        // Check required columns
        const csvHeaders = meta.fields || [];
        const missingCols = expectedCols.required.filter((col) => !csvHeaders.includes(col));
        if (missingCols.length > 0) {
          newErrors.push(`Missing required columns: ${missingCols.join(', ')}`);
        }

        // Validate and clean data
        const allWarnings: string[] = [];
        const validatedData = (data as any[]).map((row, idx) => {
          const { cleaned, warnings } = validateAndCleanRow(row, type, idx);
          if (warnings.length > 0) warningRowSet.add(idx);
          allWarnings.push(...warnings);
          return cleaned;
        });

        if (allWarnings.length > 0) {
          const shown = allWarnings.slice(0, 10);
          if (allWarnings.length > 10) {
            shown.push(`... and ${allWarnings.length - 10} more validation warnings`);
          }
          newErrors.push(...shown);
        }

        setErrors(newErrors);
        setWarningRows(warningRowSet);
        setHeaders(csvHeaders);
        setParsedData(validatedData);
      },
      error: (error) => {
        setErrors([`Parse error: ${error.message}`]);
      },
    });
  }, [expectedCols, type]);

  /** Check for existing data before importing — shows confirmation dialog */
  const handlePreImportCheck = useCallback(async () => {
    if (!parsedData || parsedData.length === 0 || !systemId) return;

    setCheckingExisting(true);
    try {
      const res = await fetch('/api/counseling/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type,
          systemId,
          year,
          entries: [],
          dryRun: true,
        }),
      });
      const result = await res.json();
      setExistingCount(result.existingCount ?? 0);
    } catch {
      setExistingCount(null);
    } finally {
      setCheckingExisting(false);
      setShowConfirmDialog(true);
    }
  }, [parsedData, systemId, year, type]);

  /** Execute the actual import */
  const handleImport = useCallback(async () => {
    if (!parsedData || parsedData.length === 0 || !systemId) return;

    setImporting(true);
    setImportResult(null);
    setErrors([]);

    try {
      // Filter out empty rows
      const cleanedEntries = parsedData.filter((row) => {
        return expectedCols.required.some((col) => row[col] != null && row[col] !== '');
      });

      const res = await fetch('/api/counseling/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type,
          systemId,
          year,
          entries: cleanedEntries,
          createdBy: 'admin',
        }),
      });

      const result = await res.json();

      if (!res.ok) {
        throw new Error(result.error || 'Import failed');
      }

      const verifiedCount = result.verifiedCount;
      const importedCount = result.inserted || result.upserted || 0;

      setImportResult({
        success: true,
        message: verifiedCount != null
          ? `Successfully imported ${importedCount} rows. Verified: ${verifiedCount} entries now in database for year ${year}.`
          : result.message,
      });
      onImportComplete?.({ count: verifiedCount || importedCount });
      // Signal counseling overview to refresh its year-wise data summary
      try {
        localStorage.setItem('counseling_data_changed', Date.now().toString());
        window.dispatchEvent(new CustomEvent('counseling-data-changed'));
      } catch {}
    } catch (err: any) {
      setImportResult({ success: false, message: err.message || 'Import failed' });
    } finally {
      setImporting(false);
    }
  }, [parsedData, systemId, year, type, expectedCols, onImportComplete]);

  const handleReset = () => {
    setParsedData(null);
    setHeaders([]);
    setErrors([]);
    setWarningRows(new Set());
    setImportResult(null);
    setFileName('');
    setPreviewPage(0);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <Box>
      {/* Header */}
      <Typography variant="h6" fontWeight={600} sx={{ mb: 1 }}>
        Import {TYPE_LABELS[type]}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Upload a CSV file for {systemName}. Required columns:{' '}
        <strong>{expectedCols.required.join(', ')}</strong>
      </Typography>

      {/* Template + Upload (year comes from parent) */}
      <Box sx={{ display: 'flex', gap: 2, alignItems: 'flex-end', mb: 2, flexWrap: 'wrap' }}>
        <Button
          variant="text"
          size="small"
          startIcon={<DownloadIcon />}
          onClick={() => downloadTemplate(type)}
          sx={{ textTransform: 'none' }}
        >
          Download Template
        </Button>
        <Button
          variant="outlined"
          startIcon={<CloudUploadIcon />}
          onClick={() => fileInputRef.current?.click()}
          disabled={importing}
        >
          {fileName || 'Choose CSV File'}
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv"
          style={{ display: 'none' }}
          onChange={handleFileSelect}
        />
        {parsedData && (
          <Button variant="text" size="small" onClick={handleReset}>
            Reset
          </Button>
        )}
      </Box>

      {/* Data quality summary */}
      {parsedData && (
        <Box sx={{ display: 'flex', gap: 1, mb: 1.5, alignItems: 'center', flexWrap: 'wrap' }}>
          <Chip label={`${parsedData.length} rows`} size="small" color="primary" />
          {errors.length > 0 && (
            <Chip label={`${errors.length} warnings`} size="small" color="warning" />
          )}
          <Typography variant="caption" color="text.secondary">
            Importing for year {year} into {systemName}
          </Typography>
        </Box>
      )}

      {/* Errors / Warnings — each as a separate item */}
      {errors.length > 0 && (
        <Box sx={{ mb: 2, display: 'flex', flexDirection: 'column', gap: 1 }}>
          {errors.map((e, i) => (
            <Alert key={i} severity="warning" variant="outlined" sx={{ py: 0.5 }}>
              <Typography variant="body2" component="span" sx={{ fontWeight: 500 }}>
                Warning {i + 1}:
              </Typography>{' '}
              {e}
            </Alert>
          ))}
        </Box>
      )}

      {/* Import Result */}
      {importResult && (
        <Alert
          severity={importResult.success ? 'success' : 'error'}
          icon={importResult.success ? <CheckCircleIcon /> : undefined}
          sx={{ mb: 2 }}
        >
          {importResult.message}
        </Alert>
      )}

      {/* Preview with pagination */}
      {parsedData && parsedData.length > 0 && (
        <Paper elevation={0} sx={{ border: '1px solid', borderColor: 'grey.200', borderRadius: 1, overflow: 'hidden' }}>
          <Box sx={{ p: 1.5, display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid', borderColor: 'grey.200' }}>
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
              <Typography variant="body2" fontWeight={600}>
                Preview ({parsedData.length} rows)
              </Typography>
              {headers.map((h) => (
                <Chip
                  key={h}
                  label={h}
                  size="small"
                  color={expectedCols.required.includes(h) ? 'primary' : 'default'}
                  variant={expectedCols.required.includes(h) ? 'filled' : 'outlined'}
                  sx={{ fontSize: '0.7rem' }}
                />
              ))}
            </Box>
            <Button
              variant="contained"
              size="small"
              onClick={handlePreImportCheck}
              disabled={importing || checkingExisting || errors.some((e) => e.includes('Missing required'))}
              startIcon={importing || checkingExisting ? <CircularProgress size={16} /> : undefined}
            >
              {checkingExisting ? 'Checking...' : importing ? 'Importing...' : `Import ${parsedData.length} rows for ${year}`}
            </Button>
          </Box>

          <TableContainer sx={{ maxHeight: 500 }}>
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 600, fontSize: '0.75rem' }}>#</TableCell>
                  {headers.slice(0, 8).map((h) => (
                    <TableCell key={h} sx={{ fontWeight: 600, fontSize: '0.75rem', whiteSpace: 'nowrap' }}>
                      {h}
                    </TableCell>
                  ))}
                  {headers.length > 8 && (
                    <TableCell sx={{ fontWeight: 600, fontSize: '0.75rem' }}>
                      +{headers.length - 8} more
                    </TableCell>
                  )}
                </TableRow>
              </TableHead>
              <TableBody>
                {parsedData
                  .slice(
                    previewPage * previewRowsPerPage,
                    previewPage * previewRowsPerPage + previewRowsPerPage
                  )
                  .map((row, idx) => {
                    const globalIdx = previewPage * previewRowsPerPage + idx;
                    const hasWarning = warningRows.has(globalIdx);
                    return (
                      <TableRow key={globalIdx} sx={hasWarning ? { bgcolor: '#fff3e0', outline: '2px solid', outlineColor: 'warning.main', outlineOffset: -1 } : undefined}>
                        <TableCell sx={{ fontSize: '0.75rem', color: hasWarning ? 'warning.dark' : 'text.secondary', fontWeight: hasWarning ? 700 : 400 }}>{globalIdx + 1}</TableCell>
                        {headers.slice(0, 8).map((h) => (
                          <TableCell key={h} sx={{ fontSize: '0.75rem', whiteSpace: 'nowrap' }}>
                            {row[h] != null ? String(row[h]) : '-'}
                          </TableCell>
                        ))}
                        {headers.length > 8 && (
                          <TableCell sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>...</TableCell>
                        )}
                      </TableRow>
                    );
                  })}
              </TableBody>
            </Table>
          </TableContainer>

          <TablePagination
            rowsPerPageOptions={[25, 50, 100, 250]}
            component="div"
            count={parsedData.length}
            rowsPerPage={previewRowsPerPage}
            page={previewPage}
            onPageChange={(_, p) => setPreviewPage(p)}
            onRowsPerPageChange={(e) => {
              setPreviewRowsPerPage(parseInt(e.target.value, 10));
              setPreviewPage(0);
            }}
          />
        </Paper>
      )}

      {/* Confirmation Dialog */}
      <Dialog open={showConfirmDialog} onClose={() => setShowConfirmDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Confirm Import</DialogTitle>
        <DialogContent>
          <DialogContentText>
            You are about to import <strong>{parsedData?.length || 0} rows</strong> for year <strong>{year}</strong>.
          </DialogContentText>
          {existingCount != null && existingCount > 0 && (
            <Alert severity="warning" sx={{ mt: 2 }}>
              <strong>{existingCount} existing entries</strong> for this system + year will be{' '}
              <strong>permanently deleted</strong> and replaced with the new data.
            </Alert>
          )}
          {existingCount === 0 && (
            <Alert severity="info" sx={{ mt: 2 }}>
              No existing data found for this system + year. This is a fresh import.
            </Alert>
          )}
          {existingCount == null && (
            <Alert severity="info" sx={{ mt: 2 }}>
              Could not check for existing data. Proceeding will replace any existing entries.
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowConfirmDialog(false)}>Cancel</Button>
          <Button
            variant="contained"
            color={existingCount && existingCount > 0 ? 'warning' : 'primary'}
            onClick={() => {
              setShowConfirmDialog(false);
              handleImport();
            }}
          >
            {existingCount && existingCount > 0
              ? `Replace ${existingCount} entries`
              : `Import ${parsedData?.length || 0} rows`}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
