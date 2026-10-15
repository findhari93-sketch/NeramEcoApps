'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  Alert, Box, Button, Chip, MenuItem, Skeleton, Stack, TextField, Typography,
} from '@mui/material';
import ForumOutlinedIcon from '@mui/icons-material/ForumOutlined';
import PhoneOutlinedIcon from '@mui/icons-material/PhoneOutlined';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import { useCollegeDashboard } from '../context';
import { Card, EmptyState, PageHeader, formatDay } from '../ui';
import { LEAD_STATUSES, leadStatusLabel } from '@/lib/college-dashboard/leads';
import { can } from '@/lib/college-dashboard/permissions';

interface Lead {
  id: string;
  name: string;
  phone: string;
  parent_phone: string | null;
  email: string | null;
  city: string | null;
  nata_score: number | null;
  jee_score: number | null;
  message: string | null;
  status: string;
  college_note: string | null;
  created_at: string;
  phone_masked: boolean;
}

const FILTERS = [{ value: 'all', label: 'All' }, ...LEAD_STATUSES];

function LeadCard({ lead, editable, highlight, onSave }: { lead: Lead; editable: boolean; highlight: boolean; onSave: (patch: Partial<Lead>) => Promise<boolean> }) {
  const [note, setNote] = useState(lead.college_note ?? '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const noteChanged = note.trim() !== (lead.college_note ?? '');

  const save = async (patch: Partial<Lead>) => {
    setSaving(true);
    setSaved(false);
    const ok = await onSave(patch);
    setSaving(false);
    setSaved(ok);
  };

  const details = [
    lead.city,
    lead.nata_score != null ? `NATA ${lead.nata_score}` : null,
    lead.jee_score != null ? `JEE ${lead.jee_score}` : null,
  ].filter(Boolean);

  return (
    <Card sx={highlight ? { borderColor: 'primary.main', boxShadow: (t: any) => `0 0 0 2px ${t.palette.primary.light}` } : undefined}>
      <Box id={`lead-${lead.id}`} sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, gap: 2 }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Stack direction="row" alignItems="center" gap={1} flexWrap="wrap">
            <Typography sx={{ fontWeight: 700, fontSize: 17 }}>{lead.name}</Typography>
            <Typography sx={{ fontSize: 13, color: 'text.secondary' }}>{formatDay(lead.created_at)}</Typography>
          </Stack>
          {details.length > 0 && <Typography sx={{ fontSize: 14, color: 'text.secondary' }}>{details.join(' · ')}</Typography>}
          <Stack direction="row" gap={1} flexWrap="wrap" sx={{ mt: 1.25 }}>
            {lead.phone_masked ? (
              <Chip icon={<LockOutlinedIcon />} label={lead.phone} variant="outlined" sx={{ fontFamily: 'monospace' }} />
            ) : (
              <Button component="a" href={`tel:+91${lead.phone}`} variant="outlined" startIcon={<PhoneOutlinedIcon />} sx={{ minHeight: 44, textTransform: 'none' }}>
                Call {lead.phone}
              </Button>
            )}
            {lead.parent_phone &&
              (lead.phone_masked ? (
                <Chip label={`Parent ${lead.parent_phone}`} variant="outlined" sx={{ fontFamily: 'monospace' }} />
              ) : (
                <Button component="a" href={`tel:+91${lead.parent_phone}`} variant="text" startIcon={<PhoneOutlinedIcon />} sx={{ minHeight: 44, textTransform: 'none' }}>
                  Parent {lead.parent_phone}
                </Button>
              ))}
            {lead.email && (
              <Button component="a" href={`mailto:${lead.email}`} variant="text" sx={{ minHeight: 44, textTransform: 'none' }}>
                {lead.email}
              </Button>
            )}
          </Stack>
          {lead.message && (
            <Typography sx={{ mt: 1.25, fontSize: 14.5, bgcolor: 'grey.50', p: 1.25, borderRadius: 1.5, whiteSpace: 'pre-wrap' }}>
              {lead.message}
            </Typography>
          )}
        </Box>
        <Stack gap={1.25} sx={{ width: { md: 300 }, flexShrink: 0 }}>
          <TextField
            select
            label="What happened"
            value={LEAD_STATUSES.some((s) => s.value === lead.status) ? lead.status : 'new'}
            onChange={(e) => void save({ status: e.target.value })}
            disabled={!editable || saving}
            size="small"
            fullWidth
          >
            {LEAD_STATUSES.map((s) => (
              <MenuItem key={s.value} value={s.value} sx={{ minHeight: 44 }}>{s.label}</MenuItem>
            ))}
          </TextField>
          <TextField
            label="Private note for your team"
            value={note}
            onChange={(e) => { setNote(e.target.value); setSaved(false); }}
            disabled={!editable || saving}
            multiline
            minRows={2}
            size="small"
            fullWidth
          />
          {editable && (noteChanged || saved) && (
            <Stack direction="row" justifyContent="flex-end" alignItems="center" gap={1}>
              {saved && !noteChanged && <Typography sx={{ fontSize: 13, color: 'success.dark' }} role="status">Saved</Typography>}
              {noteChanged && (
                <Button size="small" variant="contained" onClick={() => void save({ college_note: note })} disabled={saving} sx={{ minHeight: 40 }}>
                  Save note
                </Button>
              )}
            </Stack>
          )}
        </Stack>
      </Box>
    </Card>
  );
}

function LeadsInner() {
  const { api, collegeAdmin } = useCollegeDashboard();
  const params = useSearchParams();
  const highlight = params.get('highlight');
  const [leads, setLeads] = useState<Lead[] | null>(null);
  const [tier, setTier] = useState('free');
  const [filter, setFilter] = useState('all');
  const [error, setError] = useState('');
  const editable = can(collegeAdmin?.role, 'manage_leads');

  const load = useCallback(async () => {
    const r = await api<{ data: Lead[]; tier: string }>('/api/college-dashboard/leads');
    if (r.ok) {
      setLeads(r.data.data);
      setTier(r.data.tier);
    } else setError(r.data.error ?? 'Could not load enquiries.');
  }, [api]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (leads && highlight) document.getElementById(`lead-${highlight}`)?.scrollIntoView({ block: 'center' });
  }, [leads, highlight]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: leads?.length ?? 0 };
    for (const l of leads ?? []) c[l.status] = (c[l.status] ?? 0) + 1;
    return c;
  }, [leads]);

  const shown = (leads ?? []).filter((l) => filter === 'all' || l.status === filter);

  return (
    <Stack gap={2}>
      <PageHeader
        title="Admission enquiries"
        intro="Students who asked about admission at your college and agreed to share their details with you. Call them soon: most students decide within a few days."
      />
      {tier !== 'gold' && tier !== 'platinum' && (
        <Alert severity="info" icon={<LockOutlinedIcon />}>
          Phone numbers are partly hidden on your current plan. Gold and Platinum plans show full numbers. Contact Neram Classes to upgrade.
        </Alert>
      )}
      {error && <Alert severity="error">{error}</Alert>}

      <Stack direction="row" gap={1} sx={{ overflowX: 'auto', pb: 0.5 }} role="group" aria-label="Filter by status">
        {FILTERS.map((f) => (
          <Chip
            key={f.value}
            label={`${f.label}${counts[f.value] ? ` (${counts[f.value]})` : ''}`}
            onClick={() => setFilter(f.value)}
            color={filter === f.value ? 'primary' : 'default'}
            variant={filter === f.value ? 'filled' : 'outlined'}
            aria-pressed={filter === f.value}
            sx={{ minHeight: 40, flexShrink: 0 }}
          />
        ))}
      </Stack>

      {!leads && !error && [0, 1].map((i) => <Skeleton key={i} variant="rounded" height={150} />)}
      {leads && shown.length === 0 && (
        <EmptyState
          icon={<ForumOutlinedIcon />}
          title={leads.length ? `No enquiries marked ${leadStatusLabel(filter).toLowerCase()}` : 'No enquiries yet'}
          text={leads.length ? 'Choose another filter above.' : 'When a student asks about admission on your college page and agrees to share their details, they appear here and we email your team.'}
        />
      )}
      {shown.map((lead) => (
        <LeadCard
          key={lead.id}
          lead={lead}
          editable={editable}
          highlight={lead.id === highlight}
          onSave={async (patch) => {
            const r = await api('/api/college-dashboard/leads', { method: 'PATCH', body: { id: lead.id, ...patch } });
            if (r.ok) setLeads((cur) => (cur ?? []).map((l) => (l.id === lead.id ? { ...l, ...patch } : l)));
            else setError(r.data.error ?? 'Could not save.');
            return r.ok;
          }}
        />
      ))}
    </Stack>
  );
}

export default function CollegeDashboardLeadsPage() {
  return (
    <Suspense fallback={null}>
      <LeadsInner />
    </Suspense>
  );
}
