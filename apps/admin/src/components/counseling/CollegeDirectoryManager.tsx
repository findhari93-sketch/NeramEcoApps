// @ts-nocheck
'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Box,
  Typography,
  Paper,
  Alert,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  IconButton,
  Tooltip,
  Chip,
  TextField,
  Collapse,
  LinearProgress,
} from '@neram/ui';
import SchoolIcon from '@mui/icons-material/School';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import SearchIcon from '@mui/icons-material/Search';
import Papa from 'papaparse';

interface DirectoryEntry {
  id: string;
  college_code: string;
  college_name: string;
  city: string | null;
  district: string | null;
}

interface CollegeDirectoryManagerProps {
  systemId: string;
  systemName: string;
}

export default function CollegeDirectoryManager({ systemId, systemName }: CollegeDirectoryManagerProps) {
  const [entries, setEntries] = useState<DirectoryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [search, setSearch] = useState('');
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [count, setCount] = useState<number | null>(null);

  const fetchEntries = useCallback(async () => {
    if (!systemId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/counseling/college-directory?systemId=${systemId}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to fetch');
      setEntries(data.entries || []);
      setCount(data.count ?? (data.entries || []).length);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [systemId]);

  // Eager count fetch on mount (lightweight — still fetches all but only stores count when collapsed)
  useEffect(() => {
    if (systemId) fetchEntries();
  }, [systemId, fetchEntries]);

  const handleCsvUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImporting(true);
    setError(null);
    setSuccess(null);

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (result) => {
        try {
          // Normalize headers (case-insensitive)
          const rows = result.data.map((row: any) => {
            const normalized: Record<string, string> = {};
            for (const [key, value] of Object.entries(row)) {
              normalized[key.toLowerCase().trim()] = String(value || '').trim();
            }
            return {
              college_code: normalized.college_code || normalized.code || normalized.institution_code || '',
              college_name: normalized.college_name || normalized.name || normalized.institution_name || '',
              city: normalized.city || undefined,
              district: normalized.district || undefined,
            };
          }).filter((r: any) => r.college_code && r.college_name);

          if (rows.length === 0) {
            setError('No valid rows found. CSV must have college_code and college_name columns.');
            setImporting(false);
            return;
          }

          const res = await fetch('/api/counseling/college-directory', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ systemId, entries: rows }),
          });

          const data = await res.json();
          if (!res.ok) throw new Error(data.error || 'Import failed');

          setSuccess(`Imported ${data.upserted} college(s) successfully.`);
          fetchEntries();
        } catch (err: any) {
          setError(err.message);
        } finally {
          setImporting(false);
          if (fileInputRef.current) fileInputRef.current.value = '';
        }
      },
      error: (err) => {
        setError(`CSV parse error: ${err.message}`);
        setImporting(false);
      },
    });
  }, [systemId, fetchEntries]);

  const handleDelete = useCallback(async (id: string, name: string) => {
    if (!confirm(`Delete "${name}" from directory?`)) return;
    try {
      const res = await fetch(`/api/counseling/college-directory?id=${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Delete failed');
      setEntries(prev => prev.filter(e => e.id !== id));
      setCount(prev => prev != null ? prev - 1 : null);
    } catch (err: any) {
      setError(err.message);
    }
  }, []);

  const filteredEntries = entries.filter(e => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (
      e.college_code.toLowerCase().includes(s) ||
      e.college_name.toLowerCase().includes(s) ||
      (e.city && e.city.toLowerCase().includes(s))
    );
  });

  return (
    <Paper
      elevation={0}
      sx={{
        borderRadius: 1,
        border: '1px solid',
        borderColor: 'grey.200',
        overflow: 'hidden',
      }}
    >
      {/* Header - always visible */}
      <Box
        sx={{
          p: 1.5,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          cursor: 'pointer',
          '&:hover': { bgcolor: 'grey.50' },
        }}
        onClick={() => setExpanded(!expanded)}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <SchoolIcon sx={{ color: '#1565C0', fontSize: 20 }} />
          <Typography variant="body1" fontWeight={600}>
            College Directory
          </Typography>
          <Chip
            label={loading && count === null ? '...' : (count ?? entries.length)}
            size="small"
            sx={{ height: 20, fontSize: 11, bgcolor: '#1565C014', color: '#1565C0' }}
          />
        </Box>
        <IconButton size="small">
          {expanded ? <KeyboardArrowUpIcon /> : <KeyboardArrowDownIcon />}
        </IconButton>
      </Box>

      <Collapse in={expanded}>
        <Box sx={{ px: 1.5, pb: 1.5 }}>
          {(loading || importing) && <LinearProgress sx={{ mb: 1 }} />}
          {error && <Alert severity="error" sx={{ mb: 1 }} onClose={() => setError(null)}>{error}</Alert>}
          {success && <Alert severity="success" sx={{ mb: 1 }} onClose={() => setSuccess(null)}>{success}</Alert>}

          {/* Toolbar: Search + Upload */}
          <Box sx={{ display: 'flex', gap: 1, mb: 1, alignItems: 'center' }}>
            <TextField
              size="small"
              placeholder="Search by code, name, or city..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              InputProps={{
                startAdornment: <SearchIcon sx={{ fontSize: 18, color: 'text.secondary', mr: 0.5 }} />,
              }}
              sx={{ flex: 1, '& .MuiOutlinedInput-root': { height: 36 } }}
            />
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              style={{ display: 'none' }}
              onChange={handleCsvUpload}
            />
            <Tooltip title="Upload CSV (columns: college_code, college_name, city)">
              <IconButton
                size="small"
                onClick={() => fileInputRef.current?.click()}
                disabled={importing}
                sx={{ border: '1px solid', borderColor: 'grey.300', borderRadius: 1 }}
              >
                <UploadFileIcon sx={{ fontSize: 18 }} />
              </IconButton>
            </Tooltip>
          </Box>

          {/* Table */}
          {filteredEntries.length > 0 ? (
            <TableContainer sx={{ maxHeight: 400 }}>
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 600, width: 80 }}>Code</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>College Name</TableCell>
                    <TableCell sx={{ fontWeight: 600, width: 120 }}>City</TableCell>
                    <TableCell sx={{ width: 40 }} />
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filteredEntries.map((entry) => (
                    <TableRow key={entry.id} hover>
                      <TableCell>
                        <Chip
                          label={entry.college_code}
                          size="small"
                          sx={{ height: 22, fontSize: 12, fontWeight: 600 }}
                        />
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" sx={{ fontSize: 13 }}>
                          {entry.college_name}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" color="text.secondary" sx={{ fontSize: 12 }}>
                          {entry.city || '-'}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <IconButton
                          size="small"
                          onClick={() => handleDelete(entry.id, entry.college_name)}
                          sx={{ opacity: 0.5, '&:hover': { opacity: 1, color: 'error.main' } }}
                        >
                          <DeleteOutlineIcon sx={{ fontSize: 16 }} />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          ) : !loading ? (
            <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 3 }}>
              No colleges in directory{systemName ? ` for ${systemName}` : ''}. Upload a CSV to get started.
            </Typography>
          ) : null}
        </Box>
      </Collapse>
    </Paper>
  );
}
