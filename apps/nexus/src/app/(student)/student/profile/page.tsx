'use client';

import { useState, useEffect } from 'react';
import { Box, Typography, Skeleton } from '@neram/ui';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import { useGraphProfile } from '@/hooks/useGraphProfile';
import ProfileHero from '@/components/profile/ProfileHero';
import ProfileDetailsSection from '@/components/profile/ProfileDetailsSection';
import AcademicInfoSection from '@/components/profile/AcademicInfoSection';
import DeviceSection from '@/components/profile/DeviceSection';
import AccountInfoSection from '@/components/profile/AccountInfoSection';

interface DashboardData {
  attendanceSummary: { total: number; attended: number; percentage: number };
  checklistProgress: { completed: number; total: number };
  topicProgress: { completed: number; total: number };
}

export default function StudentProfile() {
  const { user, activeClassroom, getToken, loading: authLoading } = useNexusAuthContext();
  const { profile: graphProfile, loading: profileLoading } = useGraphProfile(undefined, true);
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!activeClassroom) {
      if (!authLoading) setLoading(false);
      return;
    }

    async function fetchDashboard() {
      setLoading(true);
      try {
        const token = await getToken();
        if (!token) return;
        const res = await fetch(
          `/api/dashboard/student?classroom=${activeClassroom!.id}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (res.ok) {
          setDashboardData(await res.json());
        }
      } catch (err) {
        console.error('Failed to load profile data:', err);
      } finally {
        setLoading(false);
      }
    }

    fetchDashboard();
  }, [activeClassroom, getToken, authLoading]);

  if (authLoading) {
    return (
      <Box sx={{ maxWidth: 960, mx: 'auto' }}>
        <Skeleton variant="rectangular" height={160} sx={{ borderRadius: 3, mb: 2 }} />
        <Skeleton variant="rectangular" height={200} sx={{ borderRadius: 3 }} />
      </Box>
    );
  }

  return (
    <Box sx={{ maxWidth: 960, mx: 'auto' }}>
      {/* Hero — full width */}
      <ProfileHero
        userName={user?.name || 'Student'}
        userEmail={user?.email || null}
        userType={user?.user_type || 'student'}
        getToken={getToken}
      />

      {/* Two-column layout on md+, single column on mobile */}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
          gap: 0,
          alignItems: 'start',
        }}
      >
        {/* Left column */}
        <Box sx={{ pr: { md: 1 } }}>
          <ProfileDetailsSection
            profile={graphProfile}
            loading={profileLoading}
          />
          <AcademicInfoSection
            dashboardData={dashboardData}
            loading={loading}
            classroomName={activeClassroom?.name || null}
          />
        </Box>

        {/* Right column */}
        <Box sx={{ pl: { md: 1 } }}>
          <DeviceSection getToken={getToken} />
          {user && (
            <AccountInfoSection
              email={user.email}
              userId={user.id}
            />
          )}
        </Box>
      </Box>
    </Box>
  );
}
