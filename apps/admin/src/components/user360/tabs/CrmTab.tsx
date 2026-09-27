'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Box,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Skeleton,
  Snackbar,
  Typography,
  UserAvatar,
} from '@neram/ui';
import SupervisorAccountOutlinedIcon from '@mui/icons-material/SupervisorAccountOutlined';
import EventOutlinedIcon from '@mui/icons-material/EventOutlined';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import CallbackSection from '@/components/crm/CallbackSection';
import AdminNotesSection from '@/components/crm/AdminNotesSection';
import AutoMessagesSection from '@/components/crm/AutoMessagesSection';
import DemoClassSection from '@/components/crm/DemoClassSection';
import { formatDateTime, isOverdue, relativeTime, sentenceCase } from '@/lib/user360-view';
import { EmptyNote, SectionCard, TwoColumns, type User360TabProps } from '../shared';

interface Owner {
  id: string;
  name: string | null;
  email: string | null;
  avatar_url: string | null;
}

export default function CrmTab({ data, detail, adminId, adminName, onRefresh, focus }: User360TabProps) {
  const userId = String(data.person?.id);
  const currentOwnerId = data.crm?.owner?.id ?? '';
  const [owners, setOwners] = useState<Owner[] | null>(null);
  const [ownersError, setOwnersError] = useState('');
  const [ownerId, setOwnerId] = useState<string>(currentOwnerId);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [saved, setSaved] = useState(false);
  const selectRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => setOwnerId(currentOwnerId), [currentOwnerId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/crm/owners');
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.error || 'Could not load staff.');
        if (!cancelled) setOwners(json.owners || []);
      } catch (e: any) {
        if (!cancelled) {
          setOwnersError(e.message || 'Could not load staff.');
          setOwners([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Header buttons land here: Assign focuses the owner picker, Note scrolls to notes.
  useEffect(() => {
    const target = focus?.split(':')[0];
    if (target === 'owner' && owners) {
      const el = selectRef.current?.querySelector<HTMLElement>('[role="combobox"], [role="button"]');
      el?.focus();
      selectRef.current?.scrollIntoView({ block: 'center' });
    }
    if (target === 'notes') {
      const notes = document.getElementById('admin-notes-section');
      notes?.scrollIntoView({ block: 'start' });
      notes?.querySelector<HTMLElement>('textarea, input')?.focus();
    }
  }, [focus, owners]);

  const changeOwner = async (next: string) => {
    const previous = ownerId;
    setOwnerId(next);
    setSaving(true);
    setSaveError('');
    try {
      const res = await fetch(`/api/crm/users/${userId}/owner`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ownerId: next || null }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Could not change the owner.');
      setSaved(true);
      onRefresh();
    } catch (e: any) {
      setOwnerId(previous);
      setSaveError(e.message || 'Could not change the owner.');
    } finally {
      setSaving(false);
    }
  };

  const followUps = data.crm?.openFollowUps || [];
  // Keep the current owner selectable even if they are no longer active staff.
  const ownerOptions: Owner[] = owners ? [...owners] : [];
  if (data.crm?.owner && !ownerOptions.some((o) => o.id === data.crm.owner!.id)) {
    ownerOptions.unshift({ id: data.crm.owner.id, name: data.crm.owner.name, email: null, avatar_url: null });
  }

  return (
    <Box sx={{ minWidth: 0 }}>
      <TwoColumns>
        <SectionCard title="Owner" icon={<SupervisorAccountOutlinedIcon />}>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
            The staff member responsible for following up with this person. Changes are recorded in the audit history.
          </Typography>
          {owners === null ? (
            <Skeleton variant="rounded" height={48} />
          ) : (
            <FormControl fullWidth size="medium" ref={selectRef} disabled={saving}>
              <InputLabel id="crm-owner-label" shrink>
                Owner
              </InputLabel>
              <Select
                labelId="crm-owner-label"
                id="crm-owner-select"
                label="Owner"
                displayEmpty
                notched
                value={ownerOptions.some((o) => o.id === ownerId) ? ownerId : ''}
                onChange={(e) => changeOwner(String(e.target.value))}
                sx={{ minHeight: 48 }}
              >
                <MenuItem value="">
                  <em>Nobody (unassigned)</em>
                </MenuItem>
                {ownerOptions.map((o) => (
                  <MenuItem key={o.id} value={o.id} sx={{ minHeight: 44 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <UserAvatar src={o.avatar_url} name={o.name} size={24} clickable={false} />
                      <span>{o.name || o.email || 'Unnamed staff'}</span>
                    </Box>
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          )}
          {ownersError && (
            <Alert severity="warning" sx={{ mt: 1 }}>
              {ownersError}
            </Alert>
          )}
          {saveError && (
            <Alert severity="error" role="alert" sx={{ mt: 1 }} onClose={() => setSaveError('')}>
              {saveError}
            </Alert>
          )}
        </SectionCard>

        <SectionCard title={`Open follow-ups (${followUps.length})`} icon={<EventOutlinedIcon />}>
          {followUps.length === 0 ? (
            <EmptyNote>No open callbacks. Schedule one in the Callbacks section below.</EmptyNote>
          ) : (
            <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, display: 'grid', gap: 1 }}>
              {followUps.map((f: any) => {
                const overdue = isOverdue(f.due_at);
                return (
                  <Box
                    component="li"
                    key={f.callback_id}
                    sx={{ display: 'flex', gap: 1, alignItems: 'flex-start', border: '1px solid', borderColor: overdue ? 'rgba(211,47,47,0.35)' : 'grey.200', borderRadius: 1, p: 1.25 }}
                  >
                    {overdue ? (
                      <WarningAmberIcon sx={{ color: 'error.main', fontSize: 20, mt: 0.25 }} aria-hidden />
                    ) : (
                      <EventOutlinedIcon sx={{ color: 'primary.main', fontSize: 20, mt: 0.25 }} aria-hidden />
                    )}
                    <Box sx={{ minWidth: 0 }}>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        {overdue ? 'Overdue' : 'Due'} {relativeTime(f.due_at)}, {formatDateTime(f.due_at)}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        {[
                          f.status && sentenceCase(String(f.status)),
                          f.query_type && sentenceCase(String(f.query_type)),
                          f.attempt_count ? `${f.attempt_count} attempt${f.attempt_count === 1 ? '' : 's'}` : null,
                          f.assigned_to_name ? `assigned to ${f.assigned_to_name}` : 'not assigned',
                        ]
                          .filter(Boolean)
                          .join(', ')}
                      </Typography>
                      {f.notes && (
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', wordBreak: 'break-word' }}>
                          {f.notes}
                        </Typography>
                      )}
                    </Box>
                  </Box>
                );
              })}
            </Box>
          )}
        </SectionCard>
      </TwoColumns>

      {detail ? (
        <TwoColumns>
          <Box sx={{ minWidth: 0 }}>
            <Box id="crm-section-callbacks">
              <CallbackSection detail={detail} adminId={adminId} adminName={adminName} onStatusChange={onRefresh} />
            </Box>
            <Box id="crm-section-demo">
              <DemoClassSection detail={detail} />
            </Box>
          </Box>
          <Box sx={{ minWidth: 0 }}>
            <Box id="admin-notes-section">
              <Box id="crm-section-notes">
                <AdminNotesSection
                  notes={detail.adminNotes}
                  userId={detail.user.id}
                  adminId={adminId}
                  adminName={adminName}
                  onNoteAdded={onRefresh}
                />
              </Box>
            </Box>
            <Box id="crm-section-auto-messages">
              <AutoMessagesSection userId={detail.user.id} />
            </Box>
          </Box>
        </TwoColumns>
      ) : (
        <Alert severity="warning">Callbacks and notes could not be loaded. Reload the page to try again.</Alert>
      )}

      <Snackbar
        open={saved}
        autoHideDuration={3000}
        onClose={() => setSaved(false)}
        message="Owner saved."
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      />
    </Box>
  );
}
