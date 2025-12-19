'use client';

import { useState } from 'react';
import {
  Box,
  Typography,
  Paper,
  Grid,
  TextField,
  Button,
  Avatar,
  Divider,
  Chip,
} from '@neram/ui';
import { useMicrosoftAuth } from '@neram/auth';

export default function ProfilePage() {
  const { user } = useMicrosoftAuth();

  const [formData, setFormData] = useState({
    name: user?.name || '',
    email: user?.email || '',
    phone: '+91 9876543210',
    grade: '12th Grade',
    stream: 'Science',
    parentName: 'John Doe Sr.',
    parentPhone: '+91 9876543211',
    address: '123 Main Street, City, State',
  });

  const [isEditing, setIsEditing] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Handle form submission
    console.log('Profile updated:', formData);
    setIsEditing(false);
  };

  const enrolledCourses = [
    { name: 'Mathematics', status: 'Active' },
    { name: 'Physics', status: 'Active' },
    { name: 'Chemistry', status: 'Active' },
    { name: 'Biology', status: 'Active' },
  ];

  return (
    <Box>
      <Box sx={{ mb: 4 }}>
        <Typography variant="h4" component="h1" gutterBottom sx={{ fontWeight: 700 }}>
          My Profile
        </Typography>
        <Typography variant="body1" color="text.secondary">
          Manage your personal information and preferences
        </Typography>
      </Box>

      <Grid container spacing={3}>
        {/* Profile Card */}
        <Grid item xs={12} md={4}>
          <Paper sx={{ p: 3, textAlign: 'center' }}>
            <Avatar
              sx={{
                width: 120,
                height: 120,
                margin: '0 auto',
                mb: 2,
                fontSize: '3rem',
                bgcolor: 'primary.main',
              }}
            >
              {user?.name?.charAt(0) || 'S'}
            </Avatar>
            <Typography variant="h6" gutterBottom sx={{ fontWeight: 600 }}>
              {formData.name}
            </Typography>
            <Typography variant="body2" color="text.secondary" gutterBottom>
              {formData.email}
            </Typography>
            <Box sx={{ mt: 2 }}>
              <Chip label={formData.grade} color="primary" sx={{ mr: 1 }} />
              <Chip label={formData.stream} color="secondary" />
            </Box>
            <Divider sx={{ my: 3 }} />
            <Box sx={{ textAlign: 'left' }}>
              <Typography variant="subtitle2" gutterBottom sx={{ fontWeight: 600 }}>
                Enrolled Courses
              </Typography>
              {enrolledCourses.map((course, index) => (
                <Box
                  key={index}
                  sx={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    mb: 1,
                  }}
                >
                  <Typography variant="body2">{course.name}</Typography>
                  <Chip label={course.status} size="small" color="success" />
                </Box>
              ))}
            </Box>
          </Paper>
        </Grid>

        {/* Profile Form */}
        <Grid item xs={12} md={8}>
          <Paper sx={{ p: 3 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
              <Typography variant="h6" sx={{ fontWeight: 600 }}>
                Personal Information
              </Typography>
              {!isEditing && (
                <Button
                  variant="outlined"
                  onClick={() => setIsEditing(true)}
                  sx={{ textTransform: 'none' }}
                >
                  Edit Profile
                </Button>
              )}
            </Box>

            <form onSubmit={handleSubmit}>
              <Grid container spacing={3}>
                <Grid item xs={12} sm={6}>
                  <TextField
                    fullWidth
                    label="Full Name"
                    name="name"
                    value={formData.name}
                    onChange={handleChange}
                    disabled={!isEditing}
                  />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <TextField
                    fullWidth
                    label="Email"
                    name="email"
                    type="email"
                    value={formData.email}
                    onChange={handleChange}
                    disabled={!isEditing}
                  />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <TextField
                    fullWidth
                    label="Phone Number"
                    name="phone"
                    value={formData.phone}
                    onChange={handleChange}
                    disabled={!isEditing}
                  />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <TextField
                    fullWidth
                    label="Grade"
                    name="grade"
                    value={formData.grade}
                    onChange={handleChange}
                    disabled={!isEditing}
                  />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <TextField
                    fullWidth
                    label="Stream"
                    name="stream"
                    value={formData.stream}
                    onChange={handleChange}
                    disabled={!isEditing}
                  />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <TextField
                    fullWidth
                    label="Parent/Guardian Name"
                    name="parentName"
                    value={formData.parentName}
                    onChange={handleChange}
                    disabled={!isEditing}
                  />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <TextField
                    fullWidth
                    label="Parent/Guardian Phone"
                    name="parentPhone"
                    value={formData.parentPhone}
                    onChange={handleChange}
                    disabled={!isEditing}
                  />
                </Grid>
                <Grid item xs={12}>
                  <TextField
                    fullWidth
                    label="Address"
                    name="address"
                    multiline
                    rows={3}
                    value={formData.address}
                    onChange={handleChange}
                    disabled={!isEditing}
                  />
                </Grid>
              </Grid>

              {isEditing && (
                <Box sx={{ display: 'flex', gap: 2, mt: 3, justifyContent: 'flex-end' }}>
                  <Button
                    variant="outlined"
                    onClick={() => setIsEditing(false)}
                    sx={{ textTransform: 'none' }}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    variant="contained"
                    sx={{ textTransform: 'none' }}
                  >
                    Save Changes
                  </Button>
                </Box>
              )}
            </form>
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
}
