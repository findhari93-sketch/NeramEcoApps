'use client';

import { useState, useCallback } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Box,
  Alert,
  CircularProgress,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Stepper,
  Step,
  StepLabel,
} from '@neram/ui';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import Papa from 'papaparse';

interface CsvUploadDialogProps {
  open: boolean;
  onClose: () => void;
  year: number;
  onImport: (rows: Record<string, unknown>[]) => Promise<{ successful: number; total: number; errors: { row: number; message: string }[] }>;
}

interface ParsedRow {
  data: Record<string, string>;
  errors: string[];
  rowIndex: number;
}

const REQUIRED_FIELDS = ['state', 'city_brochure', 'latitude', 'longitude', 'year'];
const VALID_CONFIDENCE = ['HIGH', 'MEDIUM', 'LOW'];
const VALID_TIERS = ['Metro', 'Tier-1', 'Tier-2', 'Tier-3', 'International', ''];
const STEPS = ['Upload File', 'Preview & Validate', 'Import'];

export default function CsvUploadDialog({ open, onClose, year, onImport }: CsvUploadDialogProps) {
  const [step, setStep] = useState(0);
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [validRows, setValidRows] = useState<Record<string, unknown>[]>([]);
  const [errorCount, setErrorCount] = useState(0);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ successful: number; total: number; errors: { row: number; message: string }[] } | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const resetState = () => {
    setStep(0);
    setParsedRows([]);
    setValidRows([]);
    setErrorCount(0);
    setImporting(false);
    setImportResult(null);
    setDragOver(false);
  };

  const handleClose = () => {
    resetState();
    onClose();
  };

  const validateRow = (row: Record<string, string>, index: number): ParsedRow => {
    const errors: string[] = [];

    // Check required fields
    for (const field of REQUIRED_FIELDS) {
      if (!row[field]?.trim()) {
        errors.push(`Missing ${field}`);
      }
    }

    // Validate lat/lng
    const lat = parseFloat(row.latitude);
    const lng = parseFloat(row.longitude);
    if (row.latitude && (isNaN(lat) || lat < -90 || lat > 90)) {
      errors.push('Invalid latitude');
    }
    if (row.longitude && (isNaN(lng) || lng < -180 || lng > 180)) {
      errors.push('Invalid longitude');
    }

    // Validate confidence
    if (row.confidence && !VALID_CONFIDENCE.includes(row.confidence.toUpperCase())) {
      errors.push('Invalid confidence (must be HIGH/MEDIUM/LOW)');
    }

    // Validate tier
    if (row.city_population_tier && !VALID_TIERS.includes(row.city_population_tier)) {
      errors.push('Invalid city_population_tier');
    }

    return { data: row, errors, rowIndex: index + 2 }; // +2 for 1-indexed + header
  };

  const handleFileParsed = useCallback((file: File) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const rows = results.data as Record<string, string>[];
        const validated = rows.map((row, i) => validateRow(row, i));
        const errCount = validated.filter((r) => r.errors.length > 0).length;
        const valid = validated
          .filter((r) => r.errors.length === 0)
          .map((r) => ({
            ...r.data,
            year: r.data.year || String(year),
          }));

        setParsedRows(validated);
        setValidRows(valid);
        setErrorCount(errCount);
        setStep(1);
      },
      error: () => {
        setParsedRows([]);
        setErrorCount(0);
      },
    });
  }, [year]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file && file.name.endsWith('.csv')) {
      handleFileParsed(file);
    }
  }, [handleFileParsed]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileParsed(file);
    }
  };

  const handleImport = async () => {
    setImporting(true);
    try {
      const result = await onImport(validRows);
      setImportResult(result);
      setStep(2);
    } catch (err) {
      setImportResult({
        successful: 0,
        total: validRows.length,
        errors: [{ row: 0, message: err instanceof Error ? err.message : 'Import failed' }],
      });
      setStep(2);
    } finally {
      setImporting(false);
    }
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="lg" fullWidth>
      <DialogTitle>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <UploadFileIcon />
          Import Exam Centers from CSV
        </Box>
      </DialogTitle>
      <DialogContent>
        <Stepper activeStep={step} sx={{ mb: 3 }}>
          {STEPS.map((label) => (
            <Step key={label}>
              <StepLabel>{label}</StepLabel>
            </Step>
          ))}
        </Stepper>

        {/* Step 0: Upload */}
        {step === 0 && (
          <Box
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            sx={{
              border: '2px dashed',
              borderColor: dragOver ? 'primary.main' : 'grey.300',
              borderRadius: 2,
              p: 6,
              textAlign: 'center',
              bgcolor: dragOver ? 'primary.50' : 'grey.50',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
            }}
            onClick={() => document.getElementById('csv-file-input')?.click()}
          >
            <UploadFileIcon sx={{ fontSize: 48, color: 'text.secondary', mb: 1 }} />
            <Typography variant="h6" gutterBottom>
              Drag & drop CSV file here
            </Typography>
            <Typography variant="body2" color="text.secondary">
              or click to browse files
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
              Accepts .csv files with columns: state, city_brochure, latitude, longitude, confidence, year, etc.
            </Typography>
            <input
              id="csv-file-input"
              type="file"
              accept=".csv"
              hidden
              onChange={handleFileSelect}
            />
          </Box>
        )}

        {/* Step 1: Preview */}
        {step === 1 && (
          <>
            <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
              <Chip
                icon={<CheckCircleIcon />}
                label={`${validRows.length} valid rows`}
                color="success"
                variant="outlined"
              />
              {errorCount > 0 && (
                <Chip
                  icon={<ErrorIcon />}
                  label={`${errorCount} rows with errors`}
                  color="error"
                  variant="outlined"
                />
              )}
              <Chip label={`Year: ${year}`} variant="outlined" />
            </Box>

            {/* Error rows */}
            {errorCount > 0 && (
              <Alert severity="warning" sx={{ mb: 2 }}>
                {errorCount} row(s) have validation errors and will be skipped.
              </Alert>
            )}

            {/* Preview table */}
            <TableContainer component={Paper} sx={{ maxHeight: 400 }}>
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ width: 50 }}>Row</TableCell>
                    <TableCell>State</TableCell>
                    <TableCell>City</TableCell>
                    <TableCell>Confidence</TableCell>
                    <TableCell>Primary Center</TableCell>
                    <TableCell>TCS</TableCell>
                    <TableCell>Status</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {parsedRows.slice(0, 50).map((row) => (
                    <TableRow
                      key={row.rowIndex}
                      sx={{
                        bgcolor: row.errors.length > 0 ? 'error.50' : undefined,
                      }}
                    >
                      <TableCell>{row.rowIndex}</TableCell>
                      <TableCell>{row.data.state}</TableCell>
                      <TableCell>{row.data.city_brochure}</TableCell>
                      <TableCell>
                        <Chip
                          label={row.data.confidence || 'LOW'}
                          size="small"
                          sx={{
                            bgcolor: row.data.confidence === 'HIGH' ? '#4CAF5014' :
                              row.data.confidence === 'MEDIUM' ? '#FF980014' : '#F4433614',
                            color: row.data.confidence === 'HIGH' ? '#4CAF50' :
                              row.data.confidence === 'MEDIUM' ? '#FF9800' : '#F44336',
                            fontWeight: 600,
                            fontSize: 11,
                            height: 22,
                          }}
                        />
                      </TableCell>
                      <TableCell sx={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {row.data.probable_center_1 || '—'}
                      </TableCell>
                      <TableCell>{row.data.tcs_ion_confirmed === 'True' ? 'Yes' : 'No'}</TableCell>
                      <TableCell>
                        {row.errors.length > 0 ? (
                          <Chip
                            label={row.errors.join(', ')}
                            size="small"
                            color="error"
                            variant="outlined"
                            sx={{ fontSize: 10, height: 20 }}
                          />
                        ) : (
                          <CheckCircleIcon sx={{ color: 'success.main', fontSize: 18 }} />
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
            {parsedRows.length > 50 && (
              <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                Showing first 50 of {parsedRows.length} rows
              </Typography>
            )}
          </>
        )}

        {/* Step 2: Result */}
        {step === 2 && importResult && (
          <Box sx={{ textAlign: 'center', py: 4 }}>
            {importResult.successful > 0 ? (
              <>
                <CheckCircleIcon sx={{ fontSize: 64, color: 'success.main', mb: 2 }} />
                <Typography variant="h5" gutterBottom fontWeight="bold">
                  Import Complete
                </Typography>
                <Typography variant="body1" color="text.secondary">
                  Successfully imported {importResult.successful} of {importResult.total} rows
                </Typography>
              </>
            ) : (
              <>
                <ErrorIcon sx={{ fontSize: 64, color: 'error.main', mb: 2 }} />
                <Typography variant="h5" gutterBottom fontWeight="bold">
                  Import Failed
                </Typography>
              </>
            )}

            {importResult.errors.length > 0 && (
              <Alert severity="error" sx={{ mt: 2, textAlign: 'left' }}>
                <Typography variant="subtitle2" gutterBottom>
                  {importResult.errors.length} error(s):
                </Typography>
                {importResult.errors.slice(0, 10).map((err, i) => (
                  <Typography key={i} variant="body2">
                    Row {err.row}: {err.message}
                  </Typography>
                ))}
              </Alert>
            )}
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        {step === 0 && (
          <Button onClick={handleClose}>Cancel</Button>
        )}
        {step === 1 && (
          <>
            <Button onClick={() => { resetState(); }}>Back</Button>
            <Button
              variant="contained"
              onClick={handleImport}
              disabled={importing || validRows.length === 0}
              startIcon={importing ? <CircularProgress size={16} /> : null}
            >
              {importing ? 'Importing...' : `Import ${validRows.length} Rows`}
            </Button>
          </>
        )}
        {step === 2 && (
          <Button variant="contained" onClick={handleClose}>
            Done
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
