'use client';

import { useState } from 'react';
import {
  Box,
  Grid,
  TextField,
  Button,
  Typography,
  Chip,
  Divider,
} from '@neram/ui';

interface Lead {
  id: string;
  name: string;
  email: string;
  phone: string;
  course: string;
  status: string;
  createdAt: string;
  address: string;
  parentName: string;
  parentPhone: string;
  previousEducation: string;
  notes: string;
}

interface LeadReviewFormProps {
  lead: Lead;
  onApprove: (data: any) => void;
  onReject: (data: any) => void;
}

export default function LeadReviewForm({
  lead,
  onApprove,
  onReject,
}: LeadReviewFormProps) {
  const [adminNotes, setAdminNotes] = useState('');
  const [assignedCounselor, setAssignedCounselor] = useState('');

  const handleApprove = () => {
    onApprove({
      leadId: lead.id,
      adminNotes,
      assignedCounselor,
    });
  };

  const handleReject = () => {
    onReject({
      leadId: lead.id,
      adminNotes,
    });
  };

  return (
    <Box>
      <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="h6">Lead Information</Typography>
        <Chip
          label={lead.status}
          color={
            lead.status === 'approved'
              ? 'success'
              : lead.status === 'rejected'
              ? 'error'
              : 'warning'
          }
        />
      </Box>

      <Divider sx={{ mb: 3 }} />

      <Grid container spacing={3}>
        <Grid item xs={12} md={6}>
          <Typography variant="body2" color="text.secondary" gutterBottom>
            Student Name
          </Typography>
          <Typography variant="body1" fontWeight="medium" gutterBottom>
            {lead.name}
          </Typography>
        </Grid>

        <Grid item xs={12} md={6}>
          <Typography variant="body2" color="text.secondary" gutterBottom>
            Email
          </Typography>
          <Typography variant="body1" fontWeight="medium" gutterBottom>
            {lead.email}
          </Typography>
        </Grid>

        <Grid item xs={12} md={6}>
          <Typography variant="body2" color="text.secondary" gutterBottom>
            Phone
          </Typography>
          <Typography variant="body1" fontWeight="medium" gutterBottom>
            {lead.phone}
          </Typography>
        </Grid>

        <Grid item xs={12} md={6}>
          <Typography variant="body2" color="text.secondary" gutterBottom>
            Course Interested
          </Typography>
          <Typography variant="body1" fontWeight="medium" gutterBottom>
            {lead.course}
          </Typography>
        </Grid>

        <Grid item xs={12} md={6}>
          <Typography variant="body2" color="text.secondary" gutterBottom>
            Parent Name
          </Typography>
          <Typography variant="body1" fontWeight="medium" gutterBottom>
            {lead.parentName}
          </Typography>
        </Grid>

        <Grid item xs={12} md={6}>
          <Typography variant="body2" color="text.secondary" gutterBottom>
            Parent Phone
          </Typography>
          <Typography variant="body1" fontWeight="medium" gutterBottom>
            {lead.parentPhone}
          </Typography>
        </Grid>

        <Grid item xs={12}>
          <Typography variant="body2" color="text.secondary" gutterBottom>
            Address
          </Typography>
          <Typography variant="body1" fontWeight="medium" gutterBottom>
            {lead.address}
          </Typography>
        </Grid>

        <Grid item xs={12} md={6}>
          <Typography variant="body2" color="text.secondary" gutterBottom>
            Previous Education
          </Typography>
          <Typography variant="body1" fontWeight="medium" gutterBottom>
            {lead.previousEducation}
          </Typography>
        </Grid>

        <Grid item xs={12} md={6}>
          <Typography variant="body2" color="text.secondary" gutterBottom>
            Application Date
          </Typography>
          <Typography variant="body1" fontWeight="medium" gutterBottom>
            {lead.createdAt}
          </Typography>
        </Grid>

        <Grid item xs={12}>
          <Typography variant="body2" color="text.secondary" gutterBottom>
            Student Notes
          </Typography>
          <Typography variant="body1" fontWeight="medium" gutterBottom>
            {lead.notes}
          </Typography>
        </Grid>
      </Grid>

      <Divider sx={{ my: 3 }} />

      <Typography variant="h6" gutterBottom sx={{ mt: 3 }}>
        Review & Action
      </Typography>

      <Grid container spacing={2} sx={{ mt: 1 }}>
        <Grid item xs={12}>
          <TextField
            label="Assign to Counselor"
            fullWidth
            value={assignedCounselor}
            onChange={(e) => setAssignedCounselor(e.target.value)}
            placeholder="Enter counselor name"
          />
        </Grid>

        <Grid item xs={12}>
          <TextField
            label="Admin Notes"
            multiline
            rows={4}
            fullWidth
            value={adminNotes}
            onChange={(e) => setAdminNotes(e.target.value)}
            placeholder="Add notes about this lead review..."
          />
        </Grid>
      </Grid>

      <Box sx={{ mt: 3, display: 'flex', gap: 2 }}>
        <Button
          variant="contained"
          color="success"
          onClick={handleApprove}
          disabled={lead.status !== 'pending'}
        >
          Approve Lead
        </Button>
        <Button
          variant="outlined"
          color="error"
          onClick={handleReject}
          disabled={lead.status !== 'pending'}
        >
          Reject Lead
        </Button>
      </Box>
    </Box>
  );
}
