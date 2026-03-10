'use client';

import { useState, useEffect } from 'react';
import {
  Box, Paper, Typography, Chip, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, CircularProgress, Collapse, IconButton,
} from '@neram/ui';
import DevicesIcon from '@mui/icons-material/Devices';
import LocationOnIcon from '@mui/icons-material/LocationOn';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import WifiIcon from '@mui/icons-material/Wifi';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import PhoneAndroidIcon from '@mui/icons-material/PhoneAndroid';
import DesktopWindowsIcon from '@mui/icons-material/DesktopWindows';
import TabletIcon from '@mui/icons-material/Tablet';

interface DeviceSession {
  id: string;
  device_type: string | null;
  browser: string | null;
  browser_version: string | null;
  os: string | null;
  os_version: string | null;
  screen_width: number | null;
  screen_height: number | null;
  device_pixel_ratio: number | null;
  latitude: number | null;
  longitude: number | null;
  location_accuracy: number | null;
  timezone: string | null;
  connection_type: string | null;
  effective_bandwidth: number | null;
  language: string | null;
  is_pwa: boolean;
  created_at: string;
  last_active: string;
}

interface ErrorLog {
  id: string;
  error_type: string | null;
  error_message: string | null;
  error_stack: string | null;
  page_url: string | null;
  component: string | null;
  device_type: string | null;
  browser: string | null;
  os: string | null;
  created_at: string;
}

interface DeviceDiagnosticsSectionProps {
  userId: string;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function DeviceIcon({ type }: { type: string | null }) {
  if (type === 'mobile') return <PhoneAndroidIcon sx={{ fontSize: 16, color: 'primary.main' }} />;
  if (type === 'tablet') return <TabletIcon sx={{ fontSize: 16, color: 'secondary.main' }} />;
  return <DesktopWindowsIcon sx={{ fontSize: 16, color: 'text.secondary' }} />;
}

export default function DeviceDiagnosticsSection({ userId }: DeviceDiagnosticsSectionProps) {
  const [sessions, setSessions] = useState<DeviceSession[]>([]);
  const [errors, setErrors] = useState<ErrorLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [showErrors, setShowErrors] = useState(false);
  const [showAllSessions, setShowAllSessions] = useState(false);

  useEffect(() => {
    async function fetchData() {
      try {
        const res = await fetch(`/api/crm/users/${userId}/diagnostics`);
        if (res.ok) {
          const data = await res.json();
          setSessions(data.sessions || []);
          setErrors(data.errors || []);
        }
      } catch {
        // Silently fail
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [userId]);

  const latest = sessions[0] || null;
  const visibleSessions = showAllSessions ? sessions : sessions.slice(0, 5);

  return (
    <Paper elevation={0} sx={{ mb: 2, border: '1px solid', borderColor: 'grey.200', borderRadius: 1, overflow: 'hidden' }}>
      <Box sx={{ px: 3, py: 2, display: 'flex', alignItems: 'center', gap: 1, borderBottom: '1px solid', borderColor: 'grey.100', bgcolor: 'grey.50' }}>
        <DevicesIcon sx={{ color: 'primary.main', fontSize: 20 }} />
        <Typography variant="subtitle1" fontWeight={700}>Device & Diagnostics</Typography>
        {sessions.length > 0 && (
          <Chip label={`${sessions.length} sessions`} size="small" sx={{ ml: 'auto', fontSize: 11 }} />
        )}
      </Box>

      <Box sx={{ p: 3 }}>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
            <CircularProgress size={24} />
          </Box>
        ) : sessions.length === 0 ? (
          <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 2 }}>
            No device data collected yet
          </Typography>
        ) : (
          <>
            {/* Latest Device Info */}
            {latest && (
              <Box sx={{ mb: 3 }}>
                <Typography variant="caption" fontWeight={600} color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: 0.5, mb: 1.5, display: 'block' }}>
                  Latest Session
                </Typography>
                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2 }}>
                  {/* Device */}
                  <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
                    <DeviceIcon type={latest.device_type} />
                    <Box>
                      <Typography variant="body2" fontWeight={600}>
                        {latest.browser} {latest.browser_version} on {latest.os} {latest.os_version}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {latest.screen_width}x{latest.screen_height} ({latest.device_pixel_ratio}x) &middot; {latest.device_type}
                        {latest.is_pwa && <Chip label="PWA" size="small" color="success" sx={{ ml: 1, height: 18, fontSize: 10 }} />}
                      </Typography>
                    </Box>
                  </Box>

                  {/* Location */}
                  <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
                    <LocationOnIcon sx={{ fontSize: 16, color: 'error.main' }} />
                    <Box>
                      {latest.latitude ? (
                        <>
                          <Typography variant="body2" fontWeight={600}>
                            {latest.latitude.toFixed(5)}, {latest.longitude?.toFixed(5)}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            Accuracy: ~{latest.location_accuracy?.toFixed(0)}m &middot; {latest.timezone}
                          </Typography>
                        </>
                      ) : (
                        <Typography variant="body2" color="text.secondary">Location not available</Typography>
                      )}
                    </Box>
                  </Box>

                  {/* Network */}
                  <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
                    <WifiIcon sx={{ fontSize: 16, color: 'info.main' }} />
                    <Box>
                      <Typography variant="body2" fontWeight={600}>
                        {latest.connection_type || 'Unknown'}
                        {latest.effective_bandwidth && ` (${latest.effective_bandwidth} Mbps)`}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {latest.language}
                      </Typography>
                    </Box>
                  </Box>

                  {/* Last Active */}
                  <Box>
                    <Typography variant="caption" color="text.secondary">
                      Last active: {formatDate(latest.last_active)}
                    </Typography>
                  </Box>
                </Box>
              </Box>
            )}

            {/* Session History Table */}
            {sessions.length > 1 && (
              <Box sx={{ mb: 2 }}>
                <Typography variant="caption" fontWeight={600} color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: 0.5, mb: 1, display: 'block' }}>
                  Session History
                </Typography>
                <TableContainer>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell sx={{ fontWeight: 600, fontSize: 11 }}>Date</TableCell>
                        <TableCell sx={{ fontWeight: 600, fontSize: 11 }}>Device</TableCell>
                        <TableCell sx={{ fontWeight: 600, fontSize: 11 }}>Browser</TableCell>
                        <TableCell sx={{ fontWeight: 600, fontSize: 11 }}>Location</TableCell>
                        <TableCell sx={{ fontWeight: 600, fontSize: 11 }}>Network</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {visibleSessions.map((s) => (
                        <TableRow key={s.id} hover>
                          <TableCell sx={{ fontSize: 12 }}>{formatDate(s.created_at)}</TableCell>
                          <TableCell sx={{ fontSize: 12 }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                              <DeviceIcon type={s.device_type} />
                              {s.os} {s.os_version}
                            </Box>
                          </TableCell>
                          <TableCell sx={{ fontSize: 12 }}>{s.browser} {s.browser_version}</TableCell>
                          <TableCell sx={{ fontSize: 12 }}>
                            {s.latitude ? `${s.latitude.toFixed(3)}, ${s.longitude?.toFixed(3)}` : '--'}
                          </TableCell>
                          <TableCell sx={{ fontSize: 12 }}>{s.connection_type || '--'}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
                {sessions.length > 5 && (
                  <Box sx={{ textAlign: 'center', mt: 1 }}>
                    <Typography
                      variant="caption"
                      color="primary"
                      sx={{ cursor: 'pointer', '&:hover': { textDecoration: 'underline' } }}
                      onClick={() => setShowAllSessions(!showAllSessions)}
                    >
                      {showAllSessions ? 'Show less' : `Show all ${sessions.length} sessions`}
                    </Typography>
                  </Box>
                )}
              </Box>
            )}

            {/* Error Logs */}
            {errors.length > 0 && (
              <Box>
                <Box
                  sx={{ display: 'flex', alignItems: 'center', gap: 1, cursor: 'pointer', mb: 1 }}
                  onClick={() => setShowErrors(!showErrors)}
                >
                  <ErrorOutlineIcon sx={{ fontSize: 16, color: 'error.main' }} />
                  <Typography variant="caption" fontWeight={600} color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    Error Logs ({errors.length})
                  </Typography>
                  <IconButton size="small">
                    {showErrors ? <ExpandLessIcon sx={{ fontSize: 16 }} /> : <ExpandMoreIcon sx={{ fontSize: 16 }} />}
                  </IconButton>
                </Box>
                <Collapse in={showErrors}>
                  <TableContainer>
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell sx={{ fontWeight: 600, fontSize: 11 }}>Date</TableCell>
                          <TableCell sx={{ fontWeight: 600, fontSize: 11 }}>Type</TableCell>
                          <TableCell sx={{ fontWeight: 600, fontSize: 11 }}>Message</TableCell>
                          <TableCell sx={{ fontWeight: 600, fontSize: 11 }}>Page</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {errors.slice(0, 20).map((e) => (
                          <TableRow key={e.id} hover>
                            <TableCell sx={{ fontSize: 12 }}>{formatDate(e.created_at)}</TableCell>
                            <TableCell sx={{ fontSize: 12 }}>
                              <Chip
                                label={e.error_type}
                                size="small"
                                color={e.error_type === 'js_error' ? 'error' : 'warning'}
                                sx={{ height: 20, fontSize: 10 }}
                              />
                            </TableCell>
                            <TableCell sx={{ fontSize: 12, maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {e.error_message}
                            </TableCell>
                            <TableCell sx={{ fontSize: 12, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {e.page_url?.replace(/^https?:\/\/[^/]+/, '') || '--'}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </Collapse>
              </Box>
            )}
          </>
        )}
      </Box>
    </Paper>
  );
}
