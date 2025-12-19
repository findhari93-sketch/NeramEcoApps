'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Box, Typography, Button, Paper } from '@neram/ui';
import LeadReviewForm from '@/components/LeadReviewForm';

interface Lead {
  id: string;
  name: string;
  email: string;
  phone: string;
  course: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
  address: string;
  parentName: string;
  parentPhone: string;
  previousEducation: string;
  notes: string;
}

export default function LeadDetailPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const [lead] = useState<Lead>({
    id: params.id,
    name: 'John Doe',
    email: 'john@example.com',
    phone: '+91 9876543210',
    course: 'JEE Mains',
    status: 'pending',
    createdAt: '2024-01-15',
    address: '123 Main St, City, State - 123456',
    parentName: 'Parent Name',
    parentPhone: '+91 9876543200',
    previousEducation: '12th Standard',
    notes: 'Student interested in weekend batch',
  });

  const handleApprove = async (data: any) => {
    console.log('Approving lead:', data);
    // API call to approve lead
    router.push('/leads');
  };

  const handleReject = async (data: any) => {
    console.log('Rejecting lead:', data);
    // API call to reject lead
    router.push('/leads');
  };

  return (
    <Box>
      <Button
        onClick={() => router.back()}
        sx={{ mb: 3 }}
        variant="outlined"
      >
        Back to Leads
      </Button>

      <Typography variant="h4" component="h1" gutterBottom fontWeight="bold">
        Lead Review
      </Typography>
      <Typography variant="body1" color="text.secondary" sx={{ mb: 4 }}>
        Review and process lead application
      </Typography>

      <Paper sx={{ p: 3 }}>
        <LeadReviewForm
          lead={lead}
          onApprove={handleApprove}
          onReject={handleReject}
        />
      </Paper>
    </Box>
  );
}
