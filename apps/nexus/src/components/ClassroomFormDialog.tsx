'use client';

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Box,
  Typography,
  Divider,
  CircularProgress,
} from '@neram/ui';
import LinkIcon from '@mui/icons-material/Link';
import LinkOffIcon from '@mui/icons-material/LinkOff';

interface TeamsTeam {
  id: string;
  displayName: string;
  description: string | null;
}

interface ClassroomFormDialogProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: { name: string; type: string; description: string; ms_team_id: string | null }) => Promise<void>;
  initialData?: { name: string; type: string; description: string | null; ms_team_id?: string | null; ms_team_name?: string | null };
  mode: 'create' | 'edit';
  getToken?: () => Promise<string | null>;
}

export default function ClassroomFormDialog({
  open,
  onClose,
  onSubmit,
  initialData,
  mode,
  getToken,
}: ClassroomFormDialogProps) {
  const [name, setName] = useState('');
  const [type, setType] = useState('nata');
  const [description, setDescription] = useState('');
  const [msTeamId, setMsTeamId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Teams linking state
  const [teamsTeams, setTeamsTeams] = useState<TeamsTeam[]>([]);
  const [teamsLoading, setTeamsLoading] = useState(false);
  const [teamsError, setTeamsError] = useState<string | null>(null);
  const [teamsFetched, setTeamsFetched] = useState(false);

  useEffect(() => {
    if (open && initialData) {
      setName(initialData.name);
      setType(initialData.type);
      setDescription(initialData.description || '');
      setMsTeamId(initialData.ms_team_id || null);
    } else if (open) {
      setName('');
      setType('nata');
      setDescription('');
      setMsTeamId(null);
    }
    // Reset teams fetch state when dialog opens
    if (open) {
      setTeamsFetched(false);
      setTeamsTeams([]);
      setTeamsError(null);
    }
  }, [open, initialData]);

  const fetchTeamsTeams = async () => {
    if (!getToken || teamsFetched) return;
    setTeamsLoading(true);
    setTeamsError(null);
    try {
      const token = await getToken();
      if (!token) return;
      const res = await fetch('/api/classrooms/teams-teams', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to load Teams');
      const data = await res.json();
      setTeamsTeams(data.teams || []);
      setTeamsFetched(true);
    } catch (err) {
      setTeamsError(err instanceof Error ? err.message : 'Failed to load Teams');
    } finally {
      setTeamsLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!name.trim()) return;
    setSubmitting(true);
    try {
      await onSubmit({ name: name.trim(), type, description: description.trim(), ms_team_id: msTeamId });
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  const linkedTeamName = teamsTeams.find((t) => t.id === msTeamId)?.displayName
    || initialData?.ms_team_name
    || (msTeamId ? 'Linked Team' : null);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth="sm"
      PaperProps={{ sx: { mx: { xs: 2 }, width: { xs: 'calc(100% - 32px)' } } }}
    >
      <DialogTitle>{mode === 'create' ? 'Create Classroom' : 'Edit Classroom'}</DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
          <TextField
            label="Classroom Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            fullWidth
            required
            placeholder="e.g., NATA 2026"
            inputProps={{ style: { minHeight: 24 } }}
          />
          <FormControl fullWidth>
            <InputLabel shrink>Type</InputLabel>
            <Select
              value={type}
              label="Type"
              onChange={(e) => setType(e.target.value)}
            >
              <MenuItem value="nata">NATA</MenuItem>
              <MenuItem value="jee">JEE</MenuItem>
              <MenuItem value="revit">Revit</MenuItem>
              <MenuItem value="other">Other</MenuItem>
            </Select>
          </FormControl>
          <TextField
            label="Description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            fullWidth
            multiline
            rows={3}
            placeholder="Optional description..."
          />

          {/* Microsoft Teams Linking */}
          <Divider />
          <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
            Microsoft Teams
          </Typography>

          {msTeamId && linkedTeamName ? (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, p: 1.5, bgcolor: 'primary.50', borderRadius: 1, border: '1px solid', borderColor: 'primary.200' }}>
              <LinkIcon color="primary" sx={{ fontSize: 20 }} />
              <Typography variant="body2" sx={{ flex: 1, fontWeight: 500 }}>
                {linkedTeamName}
              </Typography>
              <Button
                size="small"
                color="error"
                startIcon={<LinkOffIcon />}
                onClick={() => setMsTeamId(null)}
                sx={{ textTransform: 'none', minHeight: 36 }}
              >
                Unlink
              </Button>
            </Box>
          ) : (
            <>
              {!teamsFetched && !teamsLoading && (
                <Button
                  variant="outlined"
                  onClick={fetchTeamsTeams}
                  startIcon={<LinkIcon />}
                  sx={{ textTransform: 'none', minHeight: 48 }}
                >
                  Link to a Teams Team
                </Button>
              )}
              {teamsLoading && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 1 }}>
                  <CircularProgress size={20} />
                  <Typography variant="body2" color="text.secondary">Loading your Teams...</Typography>
                </Box>
              )}
              {teamsError && (
                <Typography variant="body2" color="error">{teamsError}</Typography>
              )}
              {teamsFetched && teamsTeams.length === 0 && (
                <Typography variant="body2" color="text.secondary">No Teams teams found.</Typography>
              )}
              {teamsFetched && teamsTeams.length > 0 && (
                <FormControl fullWidth>
                  <InputLabel id="teams-team-label" shrink>Select Teams Team</InputLabel>
                  <Select
                    labelId="teams-team-label"
                    label="Select Teams Team"
                    displayEmpty
                    value={msTeamId || ''}
                    onChange={(e) => setMsTeamId(e.target.value || null)}
                    notched
                    sx={{ minHeight: 48 }}
                  >
                    <MenuItem value="">
                      <em>-- No Team --</em>
                    </MenuItem>
                    {teamsTeams.map((t) => (
                      <MenuItem key={t.id} value={t.id}>
                        {t.displayName}
                        {t.description && (
                          <Typography variant="caption" color="text.secondary" sx={{ ml: 1 }}>
                            — {t.description}
                          </Typography>
                        )}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              )}
            </>
          )}
          <Typography variant="caption" color="text.secondary">
            Linking enables Teams Channel Meetings for classes in this classroom.
          </Typography>
        </Box>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} disabled={submitting}>Cancel</Button>
        <Button
          variant="contained"
          onClick={handleSubmit}
          disabled={!name.trim() || submitting}
        >
          {submitting ? 'Saving...' : mode === 'create' ? 'Create' : 'Save'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
