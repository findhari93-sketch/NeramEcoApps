'use client';

import { useState, useEffect } from 'react';
import {
  Box,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  MenuItem,
  Alert,
  Typography,
  Tab,
  Tabs,
} from '@neram/ui';
import type { UserJourneyDetail } from '@neram/database';

interface EditUserDialogProps {
  open: boolean;
  onClose: () => void;
  detail: UserJourneyDetail;
  adminId: string;
  onSaved: () => void;
}

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel({ children, value, index }: TabPanelProps) {
  return value === index ? <Box sx={{ pt: 2 }}>{children}</Box> : null;
}

export default function EditUserDialog({
  open,
  onClose,
  detail,
  adminId,
  onSaved,
}: EditUserDialogProps) {
  const { user, leadProfile } = detail;
  const [tab, setTab] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // User fields
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [dob, setDob] = useState('');
  const [gender, setGender] = useState('');

  // Lead fields
  const [fatherName, setFatherName] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [pincode, setPincode] = useState('');
  const [address, setAddress] = useState('');
  const [assignedFee, setAssignedFee] = useState('');
  const [discountAmount, setDiscountAmount] = useState('');
  const [adminNotes, setAdminNotes] = useState('');

  useEffect(() => {
    if (open) {
      setFirstName(user.first_name || '');
      setLastName(user.last_name || '');
      setName(user.name || '');
      setEmail(user.email || '');
      setPhone(user.phone || '');
      setDob(user.date_of_birth || '');
      setGender(user.gender || '');

      if (leadProfile) {
        setFatherName(leadProfile.father_name || '');
        setCity(leadProfile.city || '');
        setState(leadProfile.state || '');
        setPincode(leadProfile.pincode || '');
        setAddress(leadProfile.address || '');
        setAssignedFee(leadProfile.assigned_fee?.toString() || '');
        setDiscountAmount(leadProfile.discount_amount?.toString() || '');
        setAdminNotes(leadProfile.admin_notes || '');
      }
    }
  }, [open, user, leadProfile]);

  const handleSave = async () => {
    setSaving(true);
    setError('');

    try {
      const userUpdates: any = {};
      if (firstName !== (user.first_name || '')) userUpdates.first_name = firstName || null;
      if (lastName !== (user.last_name || '')) userUpdates.last_name = lastName || null;
      if (name !== (user.name || '')) userUpdates.name = name;
      if (email !== (user.email || '')) userUpdates.email = email || null;
      if (phone !== (user.phone || '')) userUpdates.phone = phone || null;
      if (dob !== (user.date_of_birth || '')) userUpdates.date_of_birth = dob || null;
      if (gender !== (user.gender || '')) userUpdates.gender = gender || null;

      const leadUpdates: any = leadProfile ? { profileId: leadProfile.id } : null;
      if (leadProfile) {
        if (fatherName !== (leadProfile.father_name || '')) leadUpdates.father_name = fatherName || null;
        if (city !== (leadProfile.city || '')) leadUpdates.city = city || null;
        if (state !== (leadProfile.state || '')) leadUpdates.state = state || null;
        if (pincode !== (leadProfile.pincode || '')) leadUpdates.pincode = pincode || null;
        if (address !== (leadProfile.address || '')) leadUpdates.address = address || null;
        if (assignedFee !== (leadProfile.assigned_fee?.toString() || ''))
          leadUpdates.assigned_fee = assignedFee ? parseFloat(assignedFee) : null;
        if (discountAmount !== (leadProfile.discount_amount?.toString() || ''))
          leadUpdates.discount_amount = discountAmount ? parseFloat(discountAmount) : null;
        if (adminNotes !== (leadProfile.admin_notes || '')) leadUpdates.admin_notes = adminNotes || null;
      }

      const res = await fetch(`/api/crm/users/${user.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userUpdates: Object.keys(userUpdates).length > 0 ? userUpdates : undefined,
          leadUpdates: leadUpdates && Object.keys(leadUpdates).length > 1 ? leadUpdates : undefined,
          adminId,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to save');
      }

      onSaved();
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Edit User Profile</DialogTitle>
      <DialogContent>
        <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ borderBottom: 1, borderColor: 'divider' }}>
          <Tab label="Personal" />
          <Tab label="Location" disabled={!leadProfile} />
          <Tab label="Fee & Notes" disabled={!leadProfile} />
        </Tabs>

        <TabPanel value={tab} index={0}>
          <TextField fullWidth size="small" label="Full Name" value={name} onChange={(e) => setName(e.target.value)} sx={{ mb: 2 }} />
          <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
            <TextField fullWidth size="small" label="First Name" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
            <TextField fullWidth size="small" label="Last Name" value={lastName} onChange={(e) => setLastName(e.target.value)} />
          </Box>
          <TextField fullWidth size="small" label="Email" value={email} onChange={(e) => setEmail(e.target.value)} sx={{ mb: 2 }} />
          <TextField fullWidth size="small" label="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} sx={{ mb: 2 }} />
          <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
            <TextField fullWidth size="small" label="Date of Birth" type="date" InputLabelProps={{ shrink: true }} value={dob} onChange={(e) => setDob(e.target.value)} />
            <TextField fullWidth size="small" label="Gender" select value={gender} onChange={(e) => setGender(e.target.value)}>
              <MenuItem value="">None</MenuItem>
              <MenuItem value="male">Male</MenuItem>
              <MenuItem value="female">Female</MenuItem>
              <MenuItem value="other">Other</MenuItem>
            </TextField>
          </Box>
          {leadProfile && (
            <TextField fullWidth size="small" label="Father's Name" value={fatherName} onChange={(e) => setFatherName(e.target.value)} />
          )}
        </TabPanel>

        <TabPanel value={tab} index={1}>
          <TextField fullWidth size="small" label="Address" multiline rows={2} value={address} onChange={(e) => setAddress(e.target.value)} sx={{ mb: 2 }} />
          <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
            <TextField fullWidth size="small" label="City" value={city} onChange={(e) => setCity(e.target.value)} />
            <TextField fullWidth size="small" label="State" value={state} onChange={(e) => setState(e.target.value)} />
          </Box>
          <TextField fullWidth size="small" label="Pincode" value={pincode} onChange={(e) => setPincode(e.target.value)} />
        </TabPanel>

        <TabPanel value={tab} index={2}>
          <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
            <TextField fullWidth size="small" label="Assigned Fee (₹)" type="number" value={assignedFee} onChange={(e) => setAssignedFee(e.target.value)} />
            <TextField fullWidth size="small" label="Discount (₹)" type="number" value={discountAmount} onChange={(e) => setDiscountAmount(e.target.value)} />
          </Box>
          <TextField fullWidth size="small" label="Admin Notes" multiline rows={3} value={adminNotes} onChange={(e) => setAdminNotes(e.target.value)} />
        </TabPanel>

        {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving...' : 'Save Changes'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
