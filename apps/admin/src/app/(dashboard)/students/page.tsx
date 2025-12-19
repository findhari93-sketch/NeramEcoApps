'use client';

import { useState } from 'react';
import { Box, Typography, Button, Chip } from '@neram/ui';
import DataTable from '@/components/DataTable';

interface Student {
  id: string;
  name: string;
  email: string;
  phone: string;
  course: string;
  enrollmentDate: string;
  status: 'active' | 'inactive' | 'suspended';
}

export default function StudentsPage() {
  const [students] = useState<Student[]>([
    {
      id: '1',
      name: 'John Doe',
      email: 'john@example.com',
      phone: '+91 9876543210',
      course: 'JEE Mains',
      enrollmentDate: '2024-01-15',
      status: 'active',
    },
    {
      id: '2',
      name: 'Jane Smith',
      email: 'jane@example.com',
      phone: '+91 9876543211',
      course: 'NEET',
      enrollmentDate: '2024-01-14',
      status: 'active',
    },
  ]);

  const columns = [
    { field: 'id', headerName: 'ID', width: 80 },
    { field: 'name', headerName: 'Name', width: 180 },
    { field: 'email', headerName: 'Email', width: 200 },
    { field: 'phone', headerName: 'Phone', width: 150 },
    { field: 'course', headerName: 'Course', width: 150 },
    { field: 'enrollmentDate', headerName: 'Enrolled On', width: 150 },
    {
      field: 'status',
      headerName: 'Status',
      width: 120,
      renderCell: (params: any) => (
        <Chip
          label={params.value}
          color={
            params.value === 'active'
              ? 'success'
              : params.value === 'suspended'
              ? 'error'
              : 'default'
          }
          size="small"
        />
      ),
    },
    {
      field: 'actions',
      headerName: 'Actions',
      width: 120,
      renderCell: () => (
        <Button size="small" variant="outlined">
          View
        </Button>
      ),
    },
  ];

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h4" component="h1" gutterBottom fontWeight="bold">
            Students Management
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Manage enrolled students
          </Typography>
        </Box>
        <Button variant="contained">
          Add Student
        </Button>
      </Box>

      <DataTable rows={students} columns={columns} />
    </Box>
  );
}
