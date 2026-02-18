'use client';

import { useState, useEffect, useCallback } from 'react';
import { Box, CircularProgress, Alert, Grid } from '@neram/ui';
import { useMicrosoftAuth } from '@neram/auth';
import type { UserJourneyDetail } from '@neram/database';

import UserDetailHeader from '../../../../components/crm/UserDetailHeader';
import UserProfileSection from '../../../../components/crm/UserProfileSection';
import ApplicationSection from '../../../../components/crm/ApplicationSection';
import ScholarshipSection from '../../../../components/crm/ScholarshipSection';
import PaymentSection from '../../../../components/crm/PaymentSection';
import DemoClassSection from '../../../../components/crm/DemoClassSection';
import OnboardingSection from '../../../../components/crm/OnboardingSection';
import DocumentsSection from '../../../../components/crm/DocumentsSection';
import HistoryTimeline from '../../../../components/crm/HistoryTimeline';
import AdminNotesSection from '../../../../components/crm/AdminNotesSection';
import EditUserDialog from '../../../../components/crm/EditUserDialog';

export default function UserDetailPage({ params }: { params: { id: string } }) {
  const { user: adminUser } = useMicrosoftAuth();
  const [detail, setDetail] = useState<UserJourneyDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editOpen, setEditOpen] = useState(false);

  const adminId = adminUser?.id || adminUser?.email || 'unknown';
  const adminName = adminUser?.name || 'Admin';

  const fetchDetail = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/crm/users/${params.id}`);
      if (!res.ok) {
        if (res.status === 404) throw new Error('User not found');
        throw new Error('Failed to fetch user detail');
      }
      const data = await res.json();
      setDetail(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [params.id]);

  useEffect(() => {
    fetchDetail();
  }, [fetchDetail]);

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error || !detail) {
    return <Alert severity="error">{error || 'User not found'}</Alert>;
  }

  return (
    <Box>
      <UserDetailHeader
        detail={detail}
        onEditClick={() => setEditOpen(true)}
        onAddNoteClick={() => {
          // Scroll to notes section
          document.getElementById('admin-notes-section')?.scrollIntoView({ behavior: 'smooth' });
        }}
      />

      <Grid container spacing={3}>
        {/* Left column: Data sections */}
        <Grid item xs={12} lg={7}>
          <UserProfileSection detail={detail} />
          <ApplicationSection
            detail={detail}
            adminId={adminId}
            onStatusChange={fetchDetail}
          />
          <ScholarshipSection
            detail={detail}
            adminId={adminId}
            onStatusChange={fetchDetail}
          />
          <PaymentSection detail={detail} />
          <DemoClassSection detail={detail} />
          <OnboardingSection detail={detail} />
          <DocumentsSection detail={detail} />
        </Grid>

        {/* Right column: Notes + History */}
        <Grid item xs={12} lg={5}>
          <Box id="admin-notes-section">
            <AdminNotesSection
              notes={detail.adminNotes}
              userId={detail.user.id}
              adminId={adminId}
              adminName={adminName}
              onNoteAdded={fetchDetail}
            />
          </Box>
          <HistoryTimeline history={detail.profileHistory} />
        </Grid>
      </Grid>

      {/* Edit dialog */}
      <EditUserDialog
        open={editOpen}
        onClose={() => setEditOpen(false)}
        detail={detail}
        adminId={adminId}
        onSaved={fetchDetail}
      />
    </Box>
  );
}
