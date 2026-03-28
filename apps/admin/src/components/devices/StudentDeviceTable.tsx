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
  Skeleton,
  Pagination,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import LaptopIcon from '@mui/icons-material/Laptop';
import PhoneAndroidIcon from '@mui/icons-material/PhoneAndroid';
import LocationOnIcon from '@mui/icons-material/LocationOn';
import VisibilityIcon from '@mui/icons-material/Visibility';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import { useState, useEffect, useCallback } from 'react';
import type { StudentDeviceSummary } from '@neram/database';

interface StudentDeviceTableProps {
  onViewStudent?: (userId: string) => void;
  isMobile?: boolean;
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
  desktop_only: 'Desktop',
  mobile_only: 'Mobile',
  none: 'None',
};

export function StudentDeviceTable({ onViewStudent, isMobile }: StudentDeviceTableProps) {
  const [data, setData] = useState<StudentDeviceSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(isMobile ? 10 : 25);

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

  if (isMobile) {
    const totalPages = Math.ceil(total / rowsPerPage);

    return (
      <Box>
        <TextField
          placeholder="Search name or email..."
          size="small"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          fullWidth
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon fontSize="small" />
              </InputAdornment>
            ),
          }}
          sx={{ mb: 1.5 }}
        />

        {loading ? (
          <Box>
            {Array.from({ length: 4 }).map((_, i) => (
              <Box key={i} sx={{ p: 1.25, borderBottom: '1px solid', borderColor: 'grey.100' }}>
                <Skeleton width="60%" height={16} sx={{ mb: 0.5 }} />
                <Skeleton width="80%" height={12} sx={{ mb: 0.5 }} />
                <Skeleton width="50%" height={12} />
              </Box>
            ))}
          </Box>
        ) : data.length === 0 ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 100 }}>
            <Typography color="text.secondary" sx={{ fontSize: 13 }}>No students found</Typography>
          </Box>
        ) : (
          <>
            {data.map((student) => {
              const lastActiveText = formatLastActive(student.last_active);
              const isOnline = lastActiveText === 'Online';
              const location = student.devices.find((d) => d.last_city)?.last_city;

              return (
                <Box
                  key={student.user_id}
                  onClick={() => onViewStudent?.(student.user_id)}
                  sx={{
                    p: 1.25,
                    borderBottom: '1px solid',
                    borderColor: 'grey.100',
                    cursor: 'pointer',
                    '&:active': { bgcolor: 'grey.50' },
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 1,
                  }}
                >
                  <Avatar
                    src={student.user_avatar || undefined}
                    sx={{ width: 28, height: 28, fontSize: 11, mt: 0.25, flexShrink: 0 }}
                  >
                    {student.user_name?.[0]?.toUpperCase()}
                  </Avatar>

                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    {/* Row 1: Name + Last Active */}
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.25 }}>
                      <Typography
                        sx={{
                          fontWeight: 600,
                          fontSize: 13,
                          lineHeight: 1.3,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          flex: 1,
                          mr: 0.75,
                        }}
                      >
                        {student.user_name}
                      </Typography>
                      <Typography
                        sx={{
                          fontSize: 10,
                          fontWeight: isOnline ? 600 : 400,
                          color: isOnline ? 'success.main' : 'text.disabled',
                          whiteSpace: 'nowrap',
                          flexShrink: 0,
                        }}
                      >
                        {lastActiveText}
                      </Typography>
                    </Box>

                    {/* Row 2: Email */}
                    <Typography
                      sx={{
                        fontSize: 11,
                        color: 'text.secondary',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        mb: 0.5,
                      }}
                    >
                      {student.user_email}
                    </Typography>

                    {/* Row 3: Device icons + Status + Active time */}
                    <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center', flexWrap: 'wrap' }}>
                      {student.devices.map((d) => (
                        d.device_category === 'desktop' ? (
                          <LaptopIcon key={d.id} sx={{ fontSize: 14, color: 'primary.main' }} />
                        ) : (
                          <PhoneAndroidIcon key={d.id} sx={{ fontSize: 14, color: 'secondary.main' }} />
                        )
                      ))}
                      <Chip
                        label={statusLabels[student.device_status]}
                        color={statusColors[student.device_status]}
                        size="small"
                        sx={{ height: 18, fontSize: 9, '& .MuiChip-label': { px: 0.5 } }}
                      />
                      {student.total_active_time > 0 && (
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25, ml: 'auto' }}>
                          <AccessTimeIcon sx={{ fontSize: 11, color: 'text.disabled' }} />
                          <Typography sx={{ fontSize: 10, color: 'text.secondary' }}>
                            {formatTime(student.total_active_time)}
                          </Typography>
                        </Box>
                      )}
                    </Box>

                    {/* Row 4: Location (if available) */}
                    {location && (
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25, mt: 0.25 }}>
                        <LocationOnIcon sx={{ fontSize: 11, color: 'text.disabled' }} />
                        <Typography sx={{ fontSize: 10, color: 'text.disabled' }}>
                          {location}
                        </Typography>
                      </Box>
                    )}
                  </Box>

                  <ChevronRightIcon sx={{ fontSize: 16, color: 'text.disabled', mt: 0.5, flexShrink: 0 }} />
                </Box>
              );
            })}

            {/* Pagination */}
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                px: 1.5,
                py: 1,
                borderTop: '1px solid',
                borderColor: 'grey.200',
              }}
            >
              <Typography sx={{ fontSize: 11, color: 'text.secondary' }}>
                {total} students
              </Typography>
              {totalPages > 1 && (
                <Pagination
                  count={totalPages}
                  page={page + 1}
                  onChange={(_, p) => setPage(p - 1)}
                  size="small"
                  sx={{ '& .MuiPaginationItem-root': { fontSize: 11, minWidth: 28, height: 28 } }}
                />
              )}
            </Box>
          </>
        )}
      </Box>
    );
  }

  // Desktop: original table layout
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
