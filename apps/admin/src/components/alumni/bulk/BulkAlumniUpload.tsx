'use client';

import { useMemo, useRef, useState } from 'react';
import {
  Box,
  Button,
  Typography,
  Chip,
  Alert,
  CircularProgress,
  Stepper,
  Step,
  StepLabel,
  Stack,
  Select,
  MenuItem,
  FormControl,
  Switch,
  IconButton,
  Tooltip,
  Divider,
} from '@neram/ui';
import { DataGrid, GridColDef, GridRowModel } from '@mui/x-data-grid';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import DownloadIcon from '@mui/icons-material/Download';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import ContentPasteIcon from '@mui/icons-material/ContentPaste';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import AddIcon from '@mui/icons-material/Add';
import PeopleAltIcon from '@mui/icons-material/PeopleAlt';
import { ACCENT, ACCENT_SOFT, INK, MUTED, LINE, HEAD_BG, COURSE_OPTIONS } from '../theme';
import {
  FIELDS,
  FIELD_KEYS,
  FieldKey,
  AlumnusDraft,
  emptyDraft,
  guessField,
  validateDraft,
  draftToPayload,
  buildTemplateCsv,
  buildFailedCsv,
} from './schema';
import { parseFile, parsePasted, ParsedTable } from './parseFile';

interface GridRow extends AlumnusDraft {
  id: string;
  _include: boolean;
  _collegeId: string | null;
  _collegeMatch: { id: string; name: string; city: string | null } | null;
  _useMatch: boolean;
  _dupOf: { userId: string; name: string | null; matchedOn: string; isAlumni: boolean } | null;
}

interface ImportResult {
  successful: number;
  total: number;
  results: { index: number; success: boolean; userId?: string; error?: string }[];
}

interface BulkAlumniUploadProps {
  adminId: string | null;
  onBulkAdded: () => void;
}

const STEPS = ['Upload', 'Map columns', 'Review & fix', 'Done'];

function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function rowToDraft(r: GridRow): AlumnusDraft {
  const d = emptyDraft();
  for (const k of FIELD_KEYS) d[k] = (r[k] as string) || '';
  return d;
}

export default function BulkAlumniUpload({ adminId, onBulkAdded }: BulkAlumniUploadProps) {
  const [step, setStep] = useState(0);
  const [error, setError] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [showPaste, setShowPaste] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const [table, setTable] = useState<ParsedTable | null>(null);
  const [mapping, setMapping] = useState<Record<string, FieldKey | ''>>({});

  const [rows, setRows] = useState<GridRow[]>([]);
  const [validating, setValidating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [failedCsv, setFailedCsv] = useState<string>('');
  const blankCounter = useRef(0);

  // ---------- Step 1: upload ----------
  function ingest(parsed: ParsedTable) {
    if (!parsed.headers.length || !parsed.rows.length) {
      setError('No rows found in that file. Check it has a header row and at least one record.');
      return;
    }
    const map: Record<string, FieldKey | ''> = {};
    const used = new Set<FieldKey>();
    for (const h of parsed.headers) {
      const g = guessField(h);
      if (g && !used.has(g)) {
        map[h] = g;
        used.add(g);
      } else {
        map[h] = '';
      }
    }
    setTable(parsed);
    setMapping(map);
    setError('');
    // Skip the mapping step when name is mapped and every recognizable column resolved.
    const mappedName = Object.values(map).includes('name');
    const allClean = parsed.headers.every((h) => map[h] !== '' || guessField(h) === null);
    if (mappedName && allClean) {
      buildRows(parsed, map);
    } else {
      setStep(1);
    }
  }

  async function handleFile(file: File) {
    try {
      const parsed = await parseFile(file);
      ingest(parsed);
    } catch (e: any) {
      setError(e?.message || 'Could not read that file.');
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };

  const loadPaste = () => {
    if (!pasteText.trim()) return;
    try {
      ingest(parsePasted(pasteText));
    } catch (e: any) {
      setError(e?.message || 'Could not parse pasted text.');
    }
  };

  // ---------- Step 2 -> 3: build grid rows ----------
  function buildRows(parsed: ParsedTable, map: Record<string, FieldKey | ''>) {
    const built: GridRow[] = parsed.rows.map((r, i) => {
      const base = emptyDraft();
      for (const [header, key] of Object.entries(map)) {
        if (key) base[key] = r[header] ?? '';
      }
      return {
        id: `row-${i}`,
        ...base,
        _include: true,
        _collegeId: null,
        _collegeMatch: null,
        _useMatch: false,
        _dupOf: null,
      };
    });
    setRows(built);
    setStep(2);
    void runValidation(built);
  }

  const continueFromMapping = () => {
    if (!table) return;
    if (!Object.values(mapping).includes('name')) {
      setError('Map one column to Full name before continuing.');
      return;
    }
    setError('');
    buildRows(table, mapping);
  };

  // ---------- Server dry-run: college match + duplicate flags ----------
  async function runValidation(current: GridRow[]) {
    setValidating(true);
    try {
      // Key rows by array position so the response maps straight back onto state.
      const body = current.map((r, i) => ({ index: i, name: r.name, email: r.email, phone: r.phone, college: r.college }));
      const res = await fetch('/api/crm/alumni/bulk/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: body }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Validation failed');
      const matches: Record<number, { collegeMatch: any; duplicateOf: any }> = data.matches || {};
      setRows((prev) =>
        prev.map((r, i) => {
          const m = matches[i];
          if (!m) return r;
          const hasErr = validateDraft(rowToDraft(r)).errors.length > 0;
          return {
            ...r,
            _collegeMatch: m.collegeMatch || null,
            _collegeId: m.collegeMatch?.id || null,
            _useMatch: !!m.collegeMatch,
            _dupOf: m.duplicateOf || null,
            _include: m.duplicateOf ? false : !hasErr,
          };
        }),
      );
    } catch (e: any) {
      setError(e?.message || 'Could not validate rows. You can still review and import.');
    } finally {
      setValidating(false);
    }
  }

  // ---------- Grid editing ----------
  const processRowUpdate = (newRow: GridRowModel, oldRow: GridRowModel): GridRowModel => {
    const updated = { ...newRow } as GridRow;
    // Editing the college text invalidates the previous catalog match.
    if (newRow.college !== oldRow.college) {
      updated._collegeMatch = null;
      updated._collegeId = null;
      updated._useMatch = false;
    }
    setRows((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
    return updated;
  };

  const patchRow = (id: string, patch: Partial<GridRow>) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };

  const deleteRow = (id: string) => setRows((prev) => prev.filter((r) => r.id !== id));

  const addBlankRow = () => {
    blankCounter.current += 1;
    setRows((prev) => [
      { id: `blank-${blankCounter.current}`, ...emptyDraft(), _include: true, _collegeId: null, _collegeMatch: null, _useMatch: false, _dupOf: null },
      ...prev,
    ]);
  };

  // ---------- Derived counts ----------
  const counts = useMemo(() => {
    let errors = 0;
    let dupes = 0;
    let ready = 0;
    for (const r of rows) {
      const hasErr = validateDraft(rowToDraft(r)).errors.length > 0;
      if (hasErr) errors++;
      if (r._dupOf) dupes++;
      if (r._include && !hasErr) ready++;
    }
    return { total: rows.length, errors, dupes, ready };
  }, [rows]);

  // ---------- Import ----------
  const handleImport = async () => {
    if (!adminId) {
      setError('Admin session not ready, try again in a moment.');
      return;
    }
    const toSend = rows.filter((r) => r._include && validateDraft(rowToDraft(r)).errors.length === 0);
    if (!toSend.length) {
      setError('No rows are ready to import.');
      return;
    }
    setImporting(true);
    setError('');
    try {
      const payloadRows = toSend.map((r) => draftToPayload(rowToDraft(r), r._useMatch ? r._collegeId : null));
      const res = await fetch('/api/crm/alumni/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminId, rows: payloadRows }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Import failed');

      const failed = (data.results || []).filter((x: any) => !x.success);
      if (failed.length) {
        setFailedCsv(
          buildFailedCsv(
            failed.map((f: any) => ({ draft: rowToDraft(toSend[f.index]), reason: f.error || 'Unknown error' })),
          ),
        );
      } else {
        setFailedCsv('');
      }
      setResult(data);
      setStep(3);
      if (data.successful > 0) onBulkAdded();
    } catch (e: any) {
      setError(e?.message || 'Import failed');
    } finally {
      setImporting(false);
    }
  };

  const resetAll = () => {
    setStep(0);
    setTable(null);
    setMapping({});
    setRows([]);
    setResult(null);
    setFailedCsv('');
    setError('');
    setPasteText('');
    setShowPaste(false);
  };

  // ---------- Grid columns ----------
  const columns: GridColDef[] = useMemo(() => {
    const fieldCols: GridColDef[] = FIELDS.map((f) => ({
      field: f.key,
      headerName: f.label,
      width: f.width || 160,
      editable: true,
      sortable: false,
      ...(f.key === 'course_branch'
        ? { type: 'singleSelect' as const, valueOptions: COURSE_OPTIONS }
        : {}),
    }));

    const matchCol: GridColDef = {
      field: '_match',
      headerName: 'Catalog college',
      width: 210,
      sortable: false,
      renderCell: (p) => {
        const r = p.row as GridRow;
        if (!r.college?.trim()) return <Typography variant="caption" sx={{ color: MUTED }}>(none)</Typography>;
        if (!r._collegeMatch) {
          return <Typography variant="caption" sx={{ color: MUTED }}>Saved as typed</Typography>;
        }
        return (
          <Stack direction="row" spacing={0.5} alignItems="center">
            <Switch
              size="small"
              checked={r._useMatch}
              onChange={(e) => patchRow(r.id, { _useMatch: e.target.checked })}
            />
            <Tooltip title={r._useMatch ? `Linked to ${r._collegeMatch.name}` : 'Using typed text'}>
              <Typography variant="caption" sx={{ color: r._useMatch ? INK : MUTED, maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {r._collegeMatch.name}
              </Typography>
            </Tooltip>
          </Stack>
        );
      },
    };

    const statusCol: GridColDef = {
      field: '_status',
      headerName: 'Status',
      width: 190,
      sortable: false,
      renderCell: (p) => {
        const r = p.row as GridRow;
        const { errors, warnings } = validateDraft(rowToDraft(r));
        if (errors.length) {
          return (
            <Tooltip title={errors.join('. ')}>
              <Chip size="small" icon={<ErrorOutlineIcon />} color="error" variant="outlined" label={errors[0]} sx={{ maxWidth: 180 }} />
            </Tooltip>
          );
        }
        if (r._dupOf) {
          const who = r._dupOf.name || 'an existing record';
          return (
            <Tooltip title={`Matches ${who} on ${r._dupOf.matchedOn}${r._dupOf.isAlumni ? ' (already an alumnus)' : ''}`}>
              <Chip size="small" icon={<WarningAmberIcon />} color="warning" variant="outlined" label="Possible duplicate" />
            </Tooltip>
          );
        }
        if (warnings.length) {
          return (
            <Tooltip title={warnings.join('. ')}>
              <Chip size="small" icon={<WarningAmberIcon />} color="warning" variant="outlined" label="Check" />
            </Tooltip>
          );
        }
        return <CheckCircleIcon sx={{ color: 'success.main', fontSize: 20 }} />;
      },
    };

    const includeCol: GridColDef = {
      field: '_include',
      headerName: 'Import',
      width: 90,
      sortable: false,
      renderCell: (p) => {
        const r = p.row as GridRow;
        const hasErr = validateDraft(rowToDraft(r)).errors.length > 0;
        return (
          <Switch
            size="small"
            checked={r._include && !hasErr}
            disabled={hasErr}
            onChange={(e) => patchRow(r.id, { _include: e.target.checked })}
          />
        );
      },
    };

    const actionCol: GridColDef = {
      field: '_actions',
      headerName: '',
      width: 56,
      sortable: false,
      renderCell: (p) => (
        <IconButton size="small" onClick={() => deleteRow((p.row as GridRow).id)}>
          <DeleteOutlineIcon fontSize="small" sx={{ color: MUTED }} />
        </IconButton>
      ),
    };

    return [statusCol, includeCol, ...fieldCols, matchCol, actionCol];
  }, []);

  // ---------- Render ----------
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Stepper activeStep={step} sx={{ mb: 2.5 }}>
        {STEPS.map((s) => (
          <Step key={s}>
            <StepLabel>{s}</StepLabel>
          </Step>
        ))}
      </Stepper>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
          {error}
        </Alert>
      )}

      {/* Step 1: Upload */}
      {step === 0 && (
        <Box>
          <Box
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileRef.current?.click()}
            sx={{
              border: '2px dashed',
              borderColor: dragOver ? ACCENT : LINE,
              borderRadius: 2,
              p: 5,
              textAlign: 'center',
              bgcolor: dragOver ? ACCENT_SOFT : HEAD_BG,
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            <UploadFileIcon sx={{ fontSize: 44, color: MUTED, mb: 1 }} />
            <Typography variant="subtitle1" fontWeight={700} color={INK}>
              Drag and drop a file, or click to browse
            </Typography>
            <Typography variant="body2" sx={{ color: MUTED, mt: 0.5 }}>
              Accepts .csv, .xlsx, .xls. First row must be the column headers.
            </Typography>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.xlsx,.xls,.txt"
              hidden
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }}
            />
          </Box>

          <Stack direction="row" spacing={1.5} sx={{ mt: 2, flexWrap: 'wrap' }}>
            <Button
              size="small"
              startIcon={<DownloadIcon />}
              onClick={() => downloadCsv('neram-alumni-template.csv', buildTemplateCsv())}
              sx={{ textTransform: 'none', color: INK }}
            >
              Download template
            </Button>
            <Button
              size="small"
              startIcon={<ContentPasteIcon />}
              onClick={() => setShowPaste((v) => !v)}
              sx={{ textTransform: 'none', color: INK }}
            >
              Paste from a spreadsheet
            </Button>
          </Stack>

          {showPaste && (
            <Box sx={{ mt: 1.5 }}>
              <textarea
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                placeholder="Paste rows copied from Excel or Google Sheets (include the header row)."
                style={{ width: '100%', minHeight: 120, padding: 10, borderRadius: 8, borderColor: LINE, borderWidth: 1, borderStyle: 'solid', fontFamily: 'inherit', fontSize: 13 }}
              />
              <Button variant="outlined" size="small" onClick={loadPaste} disabled={!pasteText.trim()} sx={{ textTransform: 'none', mt: 1 }}>
                Load pasted rows
              </Button>
            </Box>
          )}
        </Box>
      )}

      {/* Step 2: Map columns */}
      {step === 1 && table && (
        <Box>
          <Typography variant="body2" sx={{ color: MUTED, mb: 1.5 }}>
            Match each column from your file to an alumni field. We guessed where we could. Set unwanted columns to Ignore.
          </Typography>
          <Stack spacing={1}>
            {table.headers.map((h) => (
              <Stack key={h} direction="row" spacing={1.5} alignItems="center" sx={{ p: 1, border: `1px solid ${LINE}`, borderRadius: 1.5 }}>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="body2" fontWeight={600} color={INK} noWrap>{h}</Typography>
                  <Typography variant="caption" sx={{ color: MUTED }} noWrap>
                    e.g. {table.rows[0]?.[h] || '(blank)'}
                  </Typography>
                </Box>
                <FormControl size="small" sx={{ minWidth: 190 }}>
                  <Select
                    value={mapping[h] ?? ''}
                    displayEmpty
                    onChange={(e) => setMapping((m) => ({ ...m, [h]: e.target.value as FieldKey | '' }))}
                  >
                    <MenuItem value=""><em>Ignore this column</em></MenuItem>
                    {FIELDS.map((f) => (
                      <MenuItem key={f.key} value={f.key}>{f.label}{f.required ? ' *' : ''}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Stack>
            ))}
          </Stack>
          <Stack direction="row" justifyContent="space-between" sx={{ mt: 2 }}>
            <Button onClick={resetAll} sx={{ textTransform: 'none', color: MUTED }}>Start over</Button>
            <Button variant="contained" onClick={continueFromMapping} sx={{ textTransform: 'none', bgcolor: ACCENT, '&:hover': { bgcolor: '#92400E' } }}>
              Continue
            </Button>
          </Stack>
        </Box>
      )}

      {/* Step 3: Review & fix */}
      {step === 2 && (
        <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: 0, flex: 1 }}>
          <Stack direction="row" spacing={1} sx={{ mb: 1.5, flexWrap: 'wrap', alignItems: 'center' }}>
            <Chip icon={<PeopleAltIcon />} label={`${counts.total} rows`} variant="outlined" size="small" />
            <Chip icon={<CheckCircleIcon />} label={`${counts.ready} ready`} color="success" variant="outlined" size="small" />
            {counts.errors > 0 && <Chip icon={<ErrorOutlineIcon />} label={`${counts.errors} to fix`} color="error" variant="outlined" size="small" />}
            {counts.dupes > 0 && <Chip icon={<WarningAmberIcon />} label={`${counts.dupes} duplicates`} color="warning" variant="outlined" size="small" />}
            {validating && <Chip icon={<CircularProgress size={12} />} label="Checking colleges and duplicates" size="small" />}
            <Box sx={{ flex: 1 }} />
            <Button size="small" startIcon={<AddIcon />} onClick={addBlankRow} sx={{ textTransform: 'none', color: INK }}>
              Add row
            </Button>
          </Stack>

          <Alert severity="info" sx={{ mb: 1.5 }}>
            Double-click any cell to edit. Rows with errors cannot be imported until fixed. Duplicates are off by default, turn Import on to add them anyway.
          </Alert>

          <Box sx={{ flex: 1, minHeight: 360 }}>
            <DataGrid
              rows={rows}
              columns={columns}
              density="compact"
              disableRowSelectionOnClick
              processRowUpdate={processRowUpdate}
              onProcessRowUpdateError={() => {}}
              getRowClassName={(p) => {
                const r = p.row as GridRow;
                const hasErr = validateDraft(rowToDraft(r)).errors.length > 0;
                if (hasErr) return 'row-error';
                if (r._dupOf) return 'row-dupe';
                return '';
              }}
              pageSizeOptions={[25, 50, 100]}
              initialState={{ pagination: { paginationModel: { pageSize: 25 } } }}
              sx={{
                border: `1px solid ${LINE}`,
                '& .MuiDataGrid-columnHeaders': { bgcolor: HEAD_BG },
                '& .row-error': { bgcolor: 'rgba(211,47,47,0.06)' },
                '& .row-dupe': { bgcolor: 'rgba(237,108,2,0.06)' },
              }}
            />
          </Box>

          <Divider sx={{ my: 1.5 }} />
          <Stack direction="row" justifyContent="space-between" alignItems="center">
            <Button onClick={resetAll} sx={{ textTransform: 'none', color: MUTED }}>Start over</Button>
            <Button
              variant="contained"
              onClick={handleImport}
              disabled={importing || counts.ready === 0}
              startIcon={importing ? <CircularProgress size={16} color="inherit" /> : <PeopleAltIcon />}
              sx={{ textTransform: 'none', minWidth: 180, bgcolor: ACCENT, '&:hover': { bgcolor: '#92400E' } }}
            >
              {importing ? 'Importing...' : `Import ${counts.ready} alumni`}
            </Button>
          </Stack>
        </Box>
      )}

      {/* Step 4: Done */}
      {step === 3 && result && (
        <Box sx={{ textAlign: 'center', py: 4 }}>
          {result.successful > 0 ? (
            <CheckCircleIcon sx={{ fontSize: 60, color: 'success.main', mb: 1.5 }} />
          ) : (
            <ErrorOutlineIcon sx={{ fontSize: 60, color: 'error.main', mb: 1.5 }} />
          )}
          <Typography variant="h6" fontWeight={800} color={INK}>
            {result.successful > 0 ? 'Import complete' : 'Nothing imported'}
          </Typography>
          <Typography variant="body2" sx={{ color: MUTED, mt: 0.5 }}>
            Added {result.successful} of {result.total} rows.
            {result.total - result.successful > 0 ? ` ${result.total - result.successful} failed.` : ''}
          </Typography>

          {failedCsv && (
            <Alert severity="warning" sx={{ mt: 2, textAlign: 'left' }}>
              Some rows failed. Download them, fix the reasons, and re-upload.
            </Alert>
          )}

          <Stack direction="row" spacing={1.5} justifyContent="center" sx={{ mt: 2.5 }}>
            {failedCsv && (
              <Button variant="outlined" startIcon={<DownloadIcon />} onClick={() => downloadCsv('neram-alumni-failed-rows.csv', failedCsv)} sx={{ textTransform: 'none' }}>
                Download failed rows
              </Button>
            )}
            <Button variant="contained" onClick={resetAll} sx={{ textTransform: 'none', bgcolor: ACCENT, '&:hover': { bgcolor: '#92400E' } }}>
              Import another file
            </Button>
          </Stack>
        </Box>
      )}
    </Box>
  );
}
