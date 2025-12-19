'use client';

import { useState } from 'react';
import { Box, Typography, Button, Chip } from '@neram/ui';
import DataTable from '@/components/DataTable';

interface Course {
  id: string;
  name: string;
  category: string;
  duration: string;
  price: number;
  enrolledStudents: number;
  status: 'active' | 'inactive' | 'draft';
}

export default function CoursesPage() {
  const [courses] = useState<Course[]>([
    {
      id: '1',
      name: 'JEE Mains Complete Course',
      category: 'Engineering',
      duration: '12 months',
      price: 25000,
      enrolledStudents: 45,
      status: 'active',
    },
    {
      id: '2',
      name: 'NEET Complete Course',
      category: 'Medical',
      duration: '12 months',
      price: 30000,
      enrolledStudents: 52,
      status: 'active',
    },
  ]);

  const columns = [
    { field: 'id', headerName: 'ID', width: 80 },
    { field: 'name', headerName: 'Course Name', width: 250 },
    { field: 'category', headerName: 'Category', width: 130 },
    { field: 'duration', headerName: 'Duration', width: 120 },
    {
      field: 'price',
      headerName: 'Price',
      width: 120,
      renderCell: (params: any) => `₹${params.value.toLocaleString()}`,
    },
    {
      field: 'enrolledStudents',
      headerName: 'Students',
      width: 100,
    },
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
              : params.value === 'draft'
              ? 'warning'
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
          Edit
        </Button>
      ),
    },
  ];

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h4" component="h1" gutterBottom fontWeight="bold">
            Courses Management
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Manage courses and curriculum
          </Typography>
        </Box>
        <Button variant="contained">
          Add Course
        </Button>
      </Box>

      <DataTable rows={courses} columns={columns} />
    </Box>
  );
}
