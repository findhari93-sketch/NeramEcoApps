'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  MenuItem,
  TextField,
  Typography,
} from '@neram/ui';
import { pickDemoRoles, formatDemoDateTime } from '@neram/database/demo-schedule';
import type { DemoRequest, DeskSettings } from './types';

/**
 * Create an auto-recorded Teams meeting for a demo that was scheduled without a
 * link (Link later / own link / in person). The time is already fixed, so this
 * only picks who takes it: the meeting invites the team and the student's email,
 * records automatically and the student gets the WhatsApp confirmation.
 */
export default function CreateTeamsMeetingDialog({
  open,
  request,
  settings,
  busy,
  error,
  onClose,
  onSubmit,
}: {
  open: boolean;
  request: DemoRequest;
  settings: DeskSettings;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (body: Record<string, unknown>) => void;
}) {
  const people = settings.hosts;
  const initialTeam = useMemo(
    () => (request.staff_upns?.length ? request.staff_upns : people.map((p) => p.upn)),
    [request.staff_upns, people],
  );
  const initialRoles = useMemo(
    () => pickDemoRoles(settings, initialTeam, { tutor: request.tutor_upn, organizer: request.organizer_upn }),
    [settings, initialTeam, request.tutor_upn, request.organizer_upn],
  );

  const [team, setTeam] = useState<string[]>(initialTeam);
  const [tutorUpn, setTutorUpn] = useState(initialRoles.tutor ?? '');
  const [organizerUpn, setOrganizerUpn] = useState(initialRoles.organizer ?? '');
  const [conflictNote, setConflictNote] = useState('');
  const [parentEmail, setParentEmail] = useState(request.parent_email || '');

  useEffect(() => {
    if (open) {
      setTeam(initialTeam);
      setTutorUpn(initialRoles.tutor ?? '');
      setOrganizerUpn(initialRoles.organizer ?? '');
      setConflictNote('');
      setParentEmail(request.parent_email || '');
    }
  }, [open, initialTeam, initialRoles, request.parent_email]);

  // Keep tutor and organizer inside the chosen team.
  useEffect(() => {
    if (!team.length) return;
    const roles = pickDemoRoles(settings, team, { tutor: tutorUpn, organizer: organizerUpn });
    if (roles.tutor && roles.tutor !== tutorUpn) setTutorUpn(roles.tutor);
    if (roles.organizer && roles.organizer !== organizerUpn) setOrganizerUpn(roles.organizer);
  }, [team, tutorUpn, organizerUpn, settings]);

  const nameOf = (upn: string) => people.find((p) => p.upn === upn)?.name ?? upn;
  const start = request.scheduled_start ? new Date(request.scheduled_start) : null;
  const canSave = team.length > 0 && !!tutorUpn && !!organizerUpn;

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} fullWidth maxWidth="sm" aria-labelledby="create-teams-title">
      <DialogTitle id="create-teams-title">Create Teams meeting</DialogTitle>
      <DialogContent dividers>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          {start ? (
            <>
              For the demo at <b>{formatDemoDateTime(start)}</b>. This creates the Teams meeting on the organizer&apos;s calendar,
              invites the team and the student&apos;s email, records automatically, and sends the WhatsApp confirmation.
            </>
          ) : (
            'This demo has no time yet.'
          )}
        </Typography>

        {people.length === 0 ? (
          <Alert severity="warning">Add the demo team in Demo settings first.</Alert>
        ) : (
          <>
            <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1 }}>
              Who is on this demo
            </Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
              {people.map((p) => (
                <FormControlLabel
                  key={p.upn}
                  control={
                    <Checkbox
                      checked={team.includes(p.upn)}
                      onChange={(e) => setTeam(e.target.checked ? [...team, p.upn] : team.filter((u) => u !== p.upn))}
                    />
                  }
                  label={p.name}
                  sx={{ minHeight: 44, mr: 2 }}
                />
              ))}
            </Box>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2, mt: 1 }}>
              <TextField
                select
                label="Tutor (teaches the demo)"
                value={team.includes(tutorUpn) ? tutorUpn : ''}
                onChange={(e) => setTutorUpn(e.target.value)}
                helperText="Students see this name"
                disabled={!team.length}
              >
                {team.map((u) => (
                  <MenuItem key={u} value={u}>
                    {nameOf(u)}
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                select
                label="Organizer (whose calendar)"
                value={team.includes(organizerUpn) ? organizerUpn : ''}
                onChange={(e) => setOrganizerUpn(e.target.value)}
                helperText="The meeting lives on this calendar"
                disabled={!team.length}
              >
                {team.map((u) => (
                  <MenuItem key={u} value={u}>
                    {nameOf(u)}
                  </MenuItem>
                ))}
              </TextField>
            </Box>
            {!request.email && (
              <Alert severity="info" sx={{ mt: 2 }}>
                No email on this request, so the student gets the link on WhatsApp only. Use &quot;Copy invite message&quot; to send it yourself too.
              </Alert>
            )}
            <TextField
              label="Parent email (optional)"
              type="email"
              value={parentEmail}
              onChange={(e) => setParentEmail(e.target.value)}
              helperText="Gets the calendar invite too"
              fullWidth
              sx={{ mt: 2 }}
            />
            <TextField
              label="If the tutor is busy then: why it still works (optional)"
              value={conflictNote}
              onChange={(e) => setConflictNote(e.target.value)}
              helperText="Only needed when Outlook shows a clash; goes in the activity log"
              fullWidth
              sx={{ mt: 2 }}
              inputProps={{ maxLength: 200 }}
            />
          </>
        )}
        {error && (
          <Alert severity="error" sx={{ mt: 2 }} role="alert">
            {error}
          </Alert>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onClose} disabled={busy} sx={{ minHeight: 44 }}>
          Back
        </Button>
        <Button
          variant="contained"
          disabled={busy || !canSave}
          startIcon={busy ? <CircularProgress size={16} color="inherit" /> : undefined}
          sx={{ minHeight: 44 }}
          onClick={() =>
            onSubmit({
              action: 'create_teams_meeting',
              teamUpns: team,
              tutorUpn,
              organizerUpn,
              parentEmail: parentEmail.trim() || null,
              conflictNote: conflictNote.trim() || undefined,
            })
          }
        >
          {busy ? 'Creating' : 'Create and send'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
