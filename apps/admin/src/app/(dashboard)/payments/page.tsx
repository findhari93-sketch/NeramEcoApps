'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Box, Typography, Button, Chip } from '@neram/ui';
import DataTable from '@/components/DataTable';

interface Payment {
  id: string;
  studentName: string;
  amount: number;
  course: string;
  paymentMethod: string;
  status: 'pending' | 'verified' | 'failed';
  transactionId: string;
  createdAt: string;
}

export default function PaymentsPage() {
  const router = useRouter();
  const [payments] = useState<Payment[]>([
    {
      id: '1',
      studentName: 'John Doe',
      amount: 25000,
      course: 'JEE Mains',
      paymentMethod: 'UPI',
      status: 'pending',
      transactionId: 'TXN123456789',
      createdAt: '2024-01-15',
    },
    {
      id: '2',
      studentName: 'Jane Smith',
      amount: 30000,
      course: 'NEET',
      paymentMethod: 'Card',
      status: 'verified',
      transactionId: 'TXN123456790',
      createdAt: '2024-01-14',
    },
  ]);

  const columns = [
    { field: 'id', headerName: 'ID', width: 80 },
    { field: 'studentName', headerName: 'Student Name', width: 180 },
    {
      field: 'amount',
      headerName: 'Amount',
      width: 120,
      renderCell: (params: any) => `₹${params.value.toLocaleString()}`,
    },
    { field: 'course', headerName: 'Course', width: 150 },
    { field: 'paymentMethod', headerName: 'Method', width: 120 },
    {
      field: 'status',
      headerName: 'Status',
      width: 120,
      renderCell: (params: any) => (
        <Chip
          label={params.value}
          color={
            params.value === 'verified'
              ? 'success'
              : params.value === 'failed'
              ? 'error'
              : 'warning'
          }
          size="small"
        />
      ),
    },
    { field: 'transactionId', headerName: 'Transaction ID', width: 150 },
    { field: 'createdAt', headerName: 'Date', width: 120 },
    {
      field: 'actions',
      headerName: 'Actions',
      width: 120,
      renderCell: (params: any) => (
        <Button
          size="small"
          variant="outlined"
          onClick={() => router.push(`/payments/${params.row.id}`)}
        >
          Verify
        </Button>
      ),
    },
  ];

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h4" component="h1" gutterBottom fontWeight="bold">
            Payments Management
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Verify and manage student payments
          </Typography>
        </Box>
      </Box>

      <DataTable rows={payments} columns={columns} />
    </Box>
  );
}
