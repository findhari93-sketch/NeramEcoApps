'use client';

import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  Avatar,
  Box,
  Typography,
  TextField,
  InputAdornment,
  TablePagination,
  IconButton,
  Tooltip,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import LaptopIcon from '@mui/icons-material/Laptop';
import PhoneAndroidIcon from '@mui/icons-material/PhoneAndroid';
import LocationOnIcon from '@mui/icons-material/LocationOn';
import VisibilityIcon from '@mui/icons-material/Visibility';
import { useState, useEffect, useCallback } from 'react';
import type { StudentDeviceSummary } from '@neram/database';

interface StudentDeviceTableProps {
  onViewStudent?: (userId: string) => void;
}

function formatTime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function formatLastActive(dateStr: string | null): string {
  if (!dateStr) return 'Never';
  const date = new Date(dateStr);
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 5) return 'Online';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}h ago`;
  const diffD = Math.floor(diffH / 24);
  return `${diffD}d ago`;
}

const statusColors: Record<string, 'success' | 'primary' | 'warning' | 'default'> = {
  both: 'success',
  desktop_only: 'primary',
  mobile_only: 'warning',
  none: 'default',
};

const statusLabels: Record<string, string> = {
  both: 'Both',
  desktop_only: 'Desktop only',
  mobile_only: 'Mobile only',
  none: 'No devices',
};

export function StudentDeviceTable({ onViewStudent }: StudentDeviceTableProps) {
  const [data, setData] = useState<StudentDeviceSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        type: 'students',
        limit: String(rowsPerPage),
        offset: String(page * rowsPerPage),
      });
      if (search) params.set('search', search);

      const res = await fetch(`/api/devices?${params}`);
      if (res.ok) {
        const result = await res.json();
        setData(result.data || []);
        setTotal(result.total || 0);
      }
    } catch {
      // Handle silently
    } finally {
      setLoading(false);
    }
  }, [page, rowsPerPage, search]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Debounce search
  const [searchInput, setSearchInput] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput);
      setPage(0);
    }, 400);
    return () => clearTimeout(timer);
  }, [searchInput]);

  return (
    <Box>
      <TextField
        placeholder="Search by name or email..."
        size="small"
        value={searchInput}
        onChange={(e) => setSearchInput(e.target.value)}
        InputProps={{
          startAdornment: (
            <InputAdornment position="start">
              <SearchIcon fontSize="small" />
            </InputAdornment>
          ),
        }}
        sx={{ mb: 2, width: 320 }}
      />

      <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 2 }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Student</TableCell>
              <TableCell>Devices</TableCell>
              <TableCell>Status</TableCell>
              <TableCell align="right">Active Time</TableCell>
              <TableCell>Last Active</TableCell>
              <TableCell>Location</TableCell>
              <TableCell align="center">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={7}>
                    <Box sx={{ height: 40, bgcolor: 'grey.100', borderRadius: 1 }} />
                  </TableCell>
                </TableRow>
              ))
            ) : data.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} align="center" sx={{ py: 4 }}>
                  <Typography color="text.secondary">No students found</Typography>
                </TableCell>
              </TableRow>
            ) : (
              data.map((student) => (
                <TableRow key={student.user_id} hover>
                  <TableCell>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                      <Avatar
                        src={student.user_avatar || undefined}
                        sx={{ width: 32, height: 32, fontSize: 14 }}
                      >
                        {student.user_name?.[0]?.toUpperCase()}
                      </Avatar>
                      <Box>
                        <Typography variant="body2" fontWeight={600}>
                          {student.user_name}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {student.user_email}
                        </Typography>
                      </Box>
                    </Box>
                  </TableCell>
                  <TableCell>
                    <Box sx={{ display: 'flex', gap: 0.5 }}>
                      {student.devices.map((d) => (
                        <Tooltip
                          key={d.id}
                          title={`${d.device_name || d.device_category} — ${formatTime(d.total_active_seconds)} active`}
                        >
                          {d.device_category === 'desktop' ? (
                            <LaptopIcon fontSize="small" color="primary" />
                          ) : (
                            <PhoneAndroidIcon fontSize="small" color="secondary" />
                          )}
                        </Tooltip>
                      ))}
                      {student.devices.length === 0 && (
                        <Typography variant="caption" color="text.secondary">—</Typography>
                      )}
                    </Box>
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={statusLabels[student.device_status]}
                      color={statusColors[student.device_status]}
                      size="small"
                      sx={{ fontSize: '0.7rem', height: 24 }}
                    />
                  </TableCell>
                  <TableCell align="right">
                    <Typography variant="body2">
                      {formatTime(student.total_active_time)}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography
                      variant="body2"
                      color={
                        student.last_active && formatLastActive(student.last_active) === 'Online'
                          ? 'success.main'
                          : 'text.secondary'
                      }
                    >
                      {formatLastActive(student.last_active)}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    {student.devices.some((d) => d.last_city) ? (
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        <LocationOnIcon sx={{ fontSize: 14, color: 'text.secondary' }} />
                        <Typography variant="caption">
                          {student.devices.find((d) => d.last_city)?.last_city}
                        </Typography>
                      </Box>
                    ) : (
                      <Typography variant="caption" color="text.secondary">—</Typography>
                    )}
                  </TableCell>
                  <TableCell align="center">
                    <IconButton
                      size="small"
                      onClick={() => onViewStudent?.(student.user_id)}
                    >
                      <VisibilityIcon fontSize="small" />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>

      <TablePagination
        component="div"
        count={total}
        page={page}
        onPageChange={(_, p) => setPage(p)}
        rowsPerPage={rowsPerPage}
        onRowsPerPageChange={(e) => {
          setRowsPerPage(parseInt(e.target.value));
          setPage(0);
        }}
        rowsPerPageOptions={[10, 25, 50]}
      />
    </Box>
  );
}
