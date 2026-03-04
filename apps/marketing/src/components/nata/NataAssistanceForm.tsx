'use client';

import { useState } from 'react';
import {
  Box,
  Card,
  CardContent,
  TextField,
  Button,
  Typography,
  MenuItem,
  Alert,
} from '@neram/ui';

interface NataAssistanceFormProps {
  locale: string;
}

const categories = [
  { value: 'general', label: 'General' },
  { value: 'sc', label: 'SC' },
  { value: 'st', label: 'ST' },
  { value: 'obc', label: 'OBC' },
  { value: 'ews', label: 'EWS' },
  { value: 'pwd', label: 'PwD' },
  { value: 'transgender', label: 'Transgender' },
];

export function NataAssistanceForm({ locale }: NataAssistanceFormProps) {
  const [formData, setFormData] = useState({
    student_name: '',
    phone: '',
    district: '',
    school_name: '',
    category: 'general',
  });
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!formData.student_name.trim() || !formData.phone.trim()) {
      setError('Name and phone number are required.');
      return;
    }

    if (!/^[6-9]\d{9}$/.test(formData.phone.trim())) {
      setError('Please enter a valid 10-digit Indian mobile number.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/nata/assistance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Something went wrong. Please try again.');
        return;
      }
      setSuccess(true);
    } catch {
      setError('Network error. Please check your connection and try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (success) {
    return (
      <Card sx={{ textAlign: 'center', p: 4 }}>
        <Typography variant="h4" sx={{ mb: 2 }}>
          ✅
        </Typography>
        <Typography variant="h6" gutterBottom sx={{ fontWeight: 600 }}>
          Request Submitted!
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Our team will contact you shortly to assist with your NATA 2026 application. You will
          receive a call on {formData.phone}.
        </Typography>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent sx={{ p: { xs: 3, md: 4 } }}>
        <Box component="form" onSubmit={handleSubmit}>
          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}

          <TextField
            fullWidth
            required
            label="Student Name"
            name="student_name"
            value={formData.student_name}
            onChange={handleChange}
            sx={{ mb: 2 }}
            inputProps={{ minLength: 2 }}
          />
          <TextField
            fullWidth
            required
            label="Phone Number"
            name="phone"
            value={formData.phone}
            onChange={handleChange}
            placeholder="9876543210"
            type="tel"
            sx={{ mb: 2 }}
            inputProps={{ maxLength: 10 }}
          />
          <TextField
            fullWidth
            label="District"
            name="district"
            value={formData.district}
            onChange={handleChange}
            sx={{ mb: 2 }}
          />
          <TextField
            fullWidth
            label="School Name"
            name="school_name"
            value={formData.school_name}
            onChange={handleChange}
            sx={{ mb: 2 }}
          />
          <TextField
            fullWidth
            select
            label="Category"
            name="category"
            value={formData.category}
            onChange={handleChange}
            sx={{ mb: 3 }}
          >
            {categories.map((cat) => (
              <MenuItem key={cat.value} value={cat.value}>
                {cat.label}
              </MenuItem>
            ))}
          </TextField>

          <Button
            type="submit"
            variant="contained"
            fullWidth
            size="large"
            disabled={submitting}
            sx={{ fontWeight: 600 }}
          >
            {submitting ? 'Submitting...' : 'Get Help with NATA Application'}
          </Button>
        </Box>
      </CardContent>
    </Card>
  );
}
