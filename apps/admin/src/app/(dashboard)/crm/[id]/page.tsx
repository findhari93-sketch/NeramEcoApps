'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { Box, CircularProgress, Alert, Grid } from '@neram/ui';
import { useAdminProfile } from '@/contexts/AdminProfileContext';
import type { UserJourneyDetail } from '@neram/database';

import UserDetailHeader from '../../../../components/crm/UserDetailHeader';
import UserProfileSection from '../../../../components/crm/UserProfileSection';
import ApplicationSection from '../../../../components/crm/ApplicationSection';
import ScholarshipSection from '../../../../components/crm/ScholarshipSection';
import PaymentSection from '../../../../components/crm/PaymentSection';
import RefundSection from '../../../../components/crm/RefundSection';
import DemoClassSection from '../../../../components/crm/DemoClassSection';
import OnboardingSection from '../../../../components/crm/OnboardingSection';
import DocumentsSection from '../../../../components/crm/DocumentsSection';
import HistoryTimeline from '../../../../components/crm/HistoryTimeline';
import AdminNotesSection from '../../../../components/crm/AdminNotesSection';
import EditUserDialog from '../../../../components/crm/EditUserDialog';

export default function UserDetailPage({ params }: { params: { id: string } }) {
  const { supabaseUserId, supabaseName } = useAdminProfile();
  const searchParams = useSearchParams();
  const [detail, setDetail] = useState<UserJourneyDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editOpen, setEditOpen] = useState(false);

  const adminId = supabaseUserId || 'unknown';
  const adminName = supabaseName || 'Admin';

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

  // Scroll to section when navigating from notification click
  useEffect(() => {
    const section = searchParams.get('section');
    if (section && !loading && detail) {
      setTimeout(() => {
        const element = document.getElementById(`crm-section-${section}`);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'start' });
          element.style.animation = 'highlightPulse 1s ease-in-out 2';
          setTimeout(() => {
            element.style.animation = '';
          }, 2000);
        }
      }, 300);
    }
  }, [searchParams, loading, detail]);

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
      {/* Highlight animation for notification deep-links */}
      <style>{`
        @keyframes highlightPulse {
          0% { box-shadow: 0 0 0 0 rgba(25, 118, 210, 0.4); }
          70% { box-shadow: 0 0 0 8px rgba(25, 118, 210, 0); }
          100% { box-shadow: 0 0 0 0 rgba(25, 118, 210, 0); }
        }
      `}</style>

      <UserDetailHeader
        detail={detail}
        onEditClick={() => setEditOpen(true)}
        onAddNoteClick={() => {
          document.getElementById('admin-notes-section')?.scrollIntoView({ behavior: 'smooth' });
        }}
      />

      <Grid container spacing={3}>
        {/* Left column: Data sections */}
        <Grid item xs={12} lg={7}>
          <UserProfileSection detail={detail} />
          <Box id="crm-section-application" sx={{ borderRadius: 1 }}>
            <ApplicationSection
              detail={detail}
              adminId={adminId}
              onStatusChange={fetchDetail}
            />
          </Box>
          <Box id="crm-section-scholarship" sx={{ borderRadius: 1 }}>
            <ScholarshipSection
              detail={detail}
              adminId={adminId}
              onStatusChange={fetchDetail}
            />
          </Box>
          <Box id="crm-section-payment" sx={{ borderRadius: 1 }}>
            <PaymentSection detail={detail} />
          </Box>
          <Box id="crm-section-refund" sx={{ borderRadius: 1 }}>
            <RefundSection
              detail={detail}
              adminId={adminId}
              onStatusChange={fetchDetail}
            />
          </Box>
          <Box id="crm-section-demo" sx={{ borderRadius: 1 }}>
            <DemoClassSection detail={detail} />
          </Box>
          <Box id="crm-section-onboarding" sx={{ borderRadius: 1 }}>
            <OnboardingSection detail={detail} />
          </Box>
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
