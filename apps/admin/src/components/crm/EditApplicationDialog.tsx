'use client';

import { useState, useEffect } from 'react';
import {
  Box,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Alert,
} from '@neram/ui';
import type { UserJourneyDetail } from '@neram/database';
import ApplicationDetailsFields, {
  EMPTY_DETAILS,
  detailsFormFromLead,
  detailsUpdatesFromForm,
  type ApplicationDetailsForm,
} from './ApplicationDetailsFields';

interface EditApplicationDialogProps {
  open: boolean;
  onClose: () => void;
  detail: UserJourneyDetail;
  adminId: string;
  onSaved: () => void;
}

const EMPTY_FORM = EMPTY_DETAILS;
type FormState = ApplicationDetailsForm;

/**
 * Edit a student's application, or fill one in for a student who has none.
 *
 * The second case is how a student who joined without applying (or whose form was
 * never found) gets a class and exam year in Nexus: staff enter what the student
 * told them, and Nexus reads the current class and exam year from here.
 */
export default function EditApplicationDialog({
  open,
  onClose,
  detail,
  adminId,
  onSaved,
}: EditApplicationDialogProps) {
  const { leadProfile } = detail;
  const isNew = !leadProfile;
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [formData, setFormData] = useState<FormState>(EMPTY_FORM);

  useEffect(() => {
    if (!open) return;
    setFormData(detailsFormFromLead(leadProfile as Record<string, any> | null));
    setError('');
  }, [open, leadProfile]);

  const handleChange = (field: keyof FormState, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');

    try {
      const { updates, error: fieldError } = detailsUpdatesFromForm(formData, leadProfile as Record<string, any> | null);
      if (fieldError) {
        setError(fieldError);
        return;
      }

      if (isNew) {
        // A new application starts from nothing, so a blank is simply not sent.
        for (const [field, value] of Object.entries(updates)) if (value === null) delete updates[field];
        if (Object.keys(updates).length === 0) {
          setError('Fill in at least one field.');
          return;
        }
      } else if (Object.keys(updates).length === 0) {
        onClose();
        return;
      }

      const res = await fetch(`/api/crm/users/${detail.user.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          adminId,
          leadUpdates: isNew ? updates : { profileId: leadProfile!.id, ...updates },
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || (isNew ? 'Failed to save the application' : 'Failed to update application'));
      }

      onClose();
      onSaved();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{ sx: { borderRadius: 1.5 } }}
    >
      <DialogTitle sx={{ fontWeight: 700, fontSize: 18, pb: 1 }}>
        {isNew ? 'Fill application form' : 'Edit Application'}
      </DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
          {isNew && (
            <Alert severity="info" sx={{ borderRadius: 0.75 }}>
              This student has no application. Fill in what they told you. Nexus sets their class and exam
              year from the current class and the target exam year.
            </Alert>
          )}

          <ApplicationDetailsFields value={formData} onChange={handleChange} isNew={isNew} />

          {error && <Alert severity="error" sx={{ borderRadius: 0.75 }}>{error}</Alert>}
        </Box>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2.5 }}>
        <Button
          onClick={onClose}
          sx={{ borderRadius: 1.5, textTransform: 'none', fontWeight: 500 }}
        >
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={handleSave}
          disabled={saving}
          sx={{ borderRadius: 1.5, textTransform: 'none', fontWeight: 600, boxShadow: 'none', px: 3, '&:hover': { boxShadow: 'none' } }}
        >
          {saving ? 'Saving...' : isNew ? 'Save application' : 'Save Changes'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
