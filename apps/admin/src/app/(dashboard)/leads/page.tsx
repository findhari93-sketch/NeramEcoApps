'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Box, Typography, Button, Chip } from '@neram/ui';
import DataTable from '@/components/DataTable';

interface Lead {
  id: string;
  name: string;
  email: string;
  phone: string;
  course: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
}

export default function LeadsPage() {
  const router = useRouter();
  const [leads] = useState<Lead[]>([
    {
      id: '1',
      name: 'John Doe',
      email: 'john@example.com',
      phone: '+91 9876543210',
      course: 'JEE Mains',
      status: 'pending',
      createdAt: '2024-01-15',
    },
    {
      id: '2',
      name: 'Jane Smith',
      email: 'jane@example.com',
      phone: '+91 9876543211',
      course: 'NEET',
      status: 'approved',
      createdAt: '2024-01-14',
    },
  ]);

  const columns = [
    { field: 'id', headerName: 'ID', width: 80 },
    { field: 'name', headerName: 'Name', width: 180 },
    { field: 'email', headerName: 'Email', width: 200 },
    { field: 'phone', headerName: 'Phone', width: 150 },
    { field: 'course', headerName: 'Course', width: 150 },
    {
      field: 'status',
      headerName: 'Status',
      width: 120,
      renderCell: (params: any) => (
        <Chip
          label={params.value}
          color={
            params.value === 'approved'
              ? 'success'
              : params.value === 'rejected'
              ? 'error'
              : 'warning'
          }
          size="small"
        />
      ),
    },
    { field: 'createdAt', headerName: 'Created At', width: 150 },
    {
      field: 'actions',
      headerName: 'Actions',
      width: 120,
      renderCell: (params: any) => (
        <Button
          size="small"
          variant="outlined"
          onClick={() => router.push(`/leads/${params.row.id}`)}
        >
          Review
        </Button>
      ),
    },
  ];

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h4" component="h1" gutterBottom fontWeight="bold">
            Leads Management
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Review and approve student leads
          </Typography>
        </Box>
      </Box>

      <DataTable rows={leads} columns={columns} />
    </Box>
  );
}
