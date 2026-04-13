'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Box, Typography, Stack, Paper, Chip, CircularProgress,
  Alert, Select, MenuItem, FormControl, Table, TableBody,
  TableCell, TableContainer, TableHead, TableRow,
} from '@mui/material';
import PeopleIcon from '@mui/icons-material/People';
import LockIcon from '@mui/icons-material/Lock';
import { useCollegeDashboard } from '../context';

interface Lead {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  city: string | null;
  nata_score: number | null;
  status: string;
  created_at: string;
  phone_masked: boolean;
}

const STATUS_OPTIONS = ['new', 'contacted', 'qualified', 'dropped'];

const STATUS_COLORS: Record<string, 'warning' | 'info' | 'success' | 'error' | 'default'> = {
  new: 'warning',
  contacted: 'info',
  qualified: 'success',
  dropped: 'error',
};

export default function CollegeDashboardLeadsPage() {
  const { session } = useCollegeDashboard();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [tier, setTier] = useState('free');
  const [loading, setLoading] = useState(true);
  const [updateMsg, setUpdateMsg] = useState('');

  const load = useCallback(async () => {
    if (!session?.access_token) return;
    setLoading(true);
    try {
      const res = await fetch('/api/college-dashboard/leads', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (res.ok) {
        const json = await res.json();
        setLeads(json.data ?? []);
        setTier(json.tier ?? 'free');
      }
    } finally {
      setLoading(false);
    }
  }, [session?.access_token]);

  useEffect(() => { load(); }, [load]);

  const updateStatus = async (id: string, status: string) => {
    if (!session?.access_token) return;
    await fetch('/api/college-dashboard/leads', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ id, status }),
    });
    setUpdateMsg('Status updated.');
    setLeads((prev) => prev.map((l) => (l.id === id ? { ...l, status } : l)));
    setTimeout(() => setUpdateMsg(''), 2000);
  };

  const phoneMasked = tier === 'free' || tier === 'silver';

  return (
    <Stack gap={3}>
      <Stack direction="row" alignItems="center" justifyContent="space-between">
        <Stack direction="row" alignItems="center" gap={1.5}>
          <Box
            sx={{
              width: 42, height: 42, bgcolor: '#16a34a',
              borderRadius: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <PeopleIcon sx={{ color: 'white' }} />
          </Box>
          <Box>
            <Typography variant="h5" fontWeight={700}>
              Leads ({leads.length})
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Students who expressed interest in your college
            </Typography>
          </Box>
        </Stack>
      </Stack>

      {phoneMasked && (
        <Alert severity="info" icon={<LockIcon />}>
          Phone numbers are partially masked on your current tier. Upgrade to Gold or Platinum to see full phone numbers.
        </Alert>
      )}

      {updateMsg && (
        <Alert severity="success" sx={{ py: 0.5 }}>{updateMsg}</Alert>
      )}

      {loading && <CircularProgress />}

      {!loading && leads.length === 0 && (
        <Paper variant="outlined" sx={{ p: 4, textAlign: 'center' }}>
          <PeopleIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
          <Typography color="text.secondary">
            No leads yet. Leads appear here when students click &quot;I&apos;m Interested&quot; on your college page.
          </Typography>
        </Paper>
      )}

      {!loading && leads.length > 0 && (
        <Paper variant="outlined" sx={{ borderRadius: 2, overflow: 'hidden' }}>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ bgcolor: 'grey.50' }}>
                  <TableCell sx={{ fontWeight: 600 }}>Name</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Phone</TableCell>
                  <TableCell sx={{ fontWeight: 600, display: { xs: 'none', md: 'table-cell' } }}>City</TableCell>
                  <TableCell sx={{ fontWeight: 600, display: { xs: 'none', sm: 'table-cell' } }}>NATA Score</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Status</TableCell>
                  <TableCell sx={{ fontWeight: 600, display: { xs: 'none', sm: 'table-cell' } }}>Date</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {leads.map((lead) => (
                  <TableRow key={lead.id} hover>
                    <TableCell>
                      <Typography variant="body2" fontWeight={500}>{lead.name}</Typography>
                      {lead.email && (
                        <Typography variant="caption" color="text.secondary">{lead.email}</Typography>
                      )}
                    </TableCell>
                    <TableCell>
                      <Stack direction="row" alignItems="center" gap={0.5}>
                        <Typography variant="body2" fontFamily="monospace">
                          {lead.phone}
                        </Typography>
                        {lead.phone_masked && (
                          <LockIcon sx={{ fontSize: 12, color: 'text.disabled' }} />
                        )}
                      </Stack>
                    </TableCell>
                    <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>
                      <Typography variant="body2">{lead.city ?? 'N/A'}</Typography>
                    </TableCell>
                    <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>
                      <Typography variant="body2">{lead.nata_score ?? 'N/A'}</Typography>
                    </TableCell>
                    <TableCell>
                      <FormControl size="small" sx={{ minWidth: 110 }}>
                        <Select
                          value={lead.status}
                          onChange={(e) => updateStatus(lead.id, e.target.value)}
                          sx={{ fontSize: 12 }}
                          renderValue={(v) => (
                            <Chip
                              label={v}
                              size="small"
                              color={STATUS_COLORS[v] ?? 'default'}
                              sx={{ fontSize: 11, height: 20 }}
                            />
                          )}
                        >
                          {STATUS_OPTIONS.map((s) => (
                            <MenuItem key={s} value={s} sx={{ fontSize: 13 }}>
                              {s.charAt(0).toUpperCase() + s.slice(1)}
                            </MenuItem>
                          ))}
                        </Select>
                      </FormControl>
                    </TableCell>
                    <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>
                      <Typography variant="caption" color="text.secondary">
                        {new Date(lead.created_at).toLocaleDateString('en-IN')}
                      </Typography>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      )}
    </Stack>
  );
}
