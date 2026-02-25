'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Container,
  Typography,
  Card,
  CardContent,
  Button,
  Alert,
  CircularProgress,
  Skeleton,
} from '@neram/ui';
import {
  SchoolOutlined,
  LoginOutlined,
  PhoneOutlined,
} from '@mui/icons-material';
import { useTranslations } from 'next-intl';
import { useFirebaseAuth } from '@neram/auth';
import { LoginModal } from '@neram/ui';
import ScholarshipForm from '@/components/scholarship/ScholarshipForm';
import ScholarshipStatus from '@/components/scholarship/ScholarshipStatus';
import type { ScholarshipApplication } from '@neram/database';
import { Link } from '@/i18n/routing';

interface ScholarshipData {
  hasApplication: boolean;
  applicationNumber?: string;
  leadProfileId?: string;
  scholarshipEligible: boolean;
  scholarship: ScholarshipApplication | null;
}

export default function ScholarshipPageContent() {
  const t = useTranslations('scholarship');
  const { user, loading: authLoading } = useFirebaseAuth();

  const [showLoginModal, setShowLoginModal] = useState(false);
  const [scholarshipData, setScholarshipData] = useState<ScholarshipData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch scholarship data
  const fetchScholarshipData = useCallback(async () => {
    if (!user) return;

    setLoading(true);
    setError(null);

    try {
      const idToken = await (user.raw as any)?.getIdToken?.();
      if (!idToken) {
        setError('Failed to authenticate. Please try logging in again.');
        return;
      }

      const response = await fetch('/api/scholarship', {
        headers: {
          Authorization: `Bearer ${idToken}`,
        },
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch scholarship data');
      }

      setScholarshipData(data);
    } catch (err: any) {
      setError(err.message || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (user && !authLoading) {
      fetchScholarshipData();
    }
  }, [user, authLoading, fetchScholarshipData]);

  const getAuthToken = useCallback(async (): Promise<string | null> => {
    if (!user) return null;
    try {
      const idToken = await (user.raw as any)?.getIdToken?.();
      return idToken || null;
    } catch {
      return null;
    }
  }, [user]);

  // Determine which view to render
  const renderContent = () => {
    // Auth loading
    if (authLoading) {
      return (
        <Box sx={{ py: 6 }}>
          <Skeleton variant="rectangular" height={200} sx={{ borderRadius: 2, mb: 2 }} />
          <Skeleton variant="rectangular" height={120} sx={{ borderRadius: 2 }} />
        </Box>
      );
    }

    // Not logged in
    if (!user) {
      return (
        <Card variant="outlined" sx={{ textAlign: 'center', py: { xs: 4, md: 6 } }}>
          <CardContent>
            <LoginOutlined sx={{ fontSize: 64, color: 'text.disabled', mb: 2 }} />
            <Typography variant="h6" gutterBottom fontWeight={600}>
              {t('loginRequired')}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3, maxWidth: 400, mx: 'auto' }}>
              Log in with your account to access the scholarship application portal.
            </Typography>
            <Button
              variant="contained"
              size="large"
              startIcon={<LoginOutlined />}
              onClick={() => setShowLoginModal(true)}
              sx={{ minHeight: 48 }}
            >
              {t('loginButton')}
            </Button>
          </CardContent>
        </Card>
      );
    }

    // Loading scholarship data
    if (loading) {
      return (
        <Box display="flex" justifyContent="center" py={6}>
          <CircularProgress />
        </Box>
      );
    }

    // Error
    if (error) {
      return (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
          <Button
            size="small"
            onClick={fetchScholarshipData}
            sx={{ ml: 2, textTransform: 'none' }}
          >
            Retry
          </Button>
        </Alert>
      );
    }

    // No application submitted yet
    if (scholarshipData && !scholarshipData.hasApplication) {
      return (
        <Card variant="outlined" sx={{ textAlign: 'center', py: { xs: 4, md: 6 } }}>
          <CardContent>
            <SchoolOutlined sx={{ fontSize: 64, color: 'text.disabled', mb: 2 }} />
            <Typography variant="h6" gutterBottom fontWeight={600}>
              {t('noApplication')}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3, maxWidth: 400, mx: 'auto' }}>
              You need to submit an admission application before applying for a scholarship.
            </Typography>
            <Button
              variant="contained"
              size="large"
              component={Link}
              href="/apply"
              sx={{ minHeight: 48 }}
            >
              {t('applyFirst')}
            </Button>
          </CardContent>
        </Card>
      );
    }

    // Not eligible for scholarship
    if (scholarshipData && !scholarshipData.scholarshipEligible) {
      return (
        <Card variant="outlined" sx={{ textAlign: 'center', py: { xs: 4, md: 6 } }}>
          <CardContent>
            <SchoolOutlined sx={{ fontSize: 64, color: 'text.disabled', mb: 2 }} />
            <Typography variant="h6" gutterBottom fontWeight={600}>
              {t('notEligible')}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3, maxWidth: 480, mx: 'auto' }}>
              {t('notEligibleDesc')}
            </Typography>
            <Button
              variant="outlined"
              size="large"
              startIcon={<PhoneOutlined />}
              href="https://wa.me/919176137043?text=Hi%2C%20I%20have%20a%20question%20about%20the%20scholarship%20program"
              target="_blank"
              sx={{ minHeight: 48 }}
            >
              {t('contactSupport')}
            </Button>
          </CardContent>
        </Card>
      );
    }

    // Eligible - show status and/or form
    if (scholarshipData?.scholarshipEligible) {
      const scholarship = scholarshipData.scholarship;
      const status = scholarship?.scholarship_status;

      // If scholarship exists and is not in eligible_pending or revision_requested, show status only
      const showFormOnly =
        !scholarship ||
        status === 'eligible_pending' ||
        status === 'revision_requested';

      const showStatusTracker =
        scholarship && status && status !== 'eligible_pending' && status !== 'not_eligible';

      return (
        <Box>
          {/* Status Tracker (if applicable) */}
          {showStatusTracker && (
            <ScholarshipStatus
              status={scholarship.scholarship_status}
              approvedFee={scholarship.approved_fee}
              revisionNotes={scholarship.revision_notes}
              rejectionReason={scholarship.rejection_reason}
              submittedAt={scholarship.submitted_at}
              t={t}
            />
          )}

          {/* Upload Form (only if eligible_pending, revision_requested, or no scholarship yet) */}
          {showFormOnly && (
            <ScholarshipForm
              existingDocs={
                scholarship
                  ? {
                      school_id_card_url: scholarship.school_id_card_url,
                      income_certificate_url: scholarship.income_certificate_url,
                      aadhar_card_url: scholarship.aadhar_card_url,
                      mark_sheet_url: scholarship.mark_sheet_url,
                    }
                  : undefined
              }
              isResubmission={status === 'revision_requested'}
              getAuthToken={getAuthToken}
              onSubmitted={() => {
                // Refresh data after submission
                fetchScholarshipData();
              }}
              t={t}
            />
          )}
        </Box>
      );
    }

    return null;
  };

  return (
    <Box>
      {/* Hero Section */}
      <Box
        sx={{
          bgcolor: 'primary.main',
          color: 'primary.contrastText',
          py: { xs: 4, md: 6 },
        }}
      >
        <Container maxWidth="lg">
          <Typography
            variant="h3"
            component="h1"
            gutterBottom
            sx={{ fontWeight: 700, fontSize: { xs: '1.75rem', md: '2.5rem' } }}
          >
            {t('title')}
          </Typography>
          <Typography
            variant="h6"
            sx={{
              maxWidth: '700px',
              opacity: 0.9,
              fontSize: { xs: '0.95rem', md: '1.15rem' },
            }}
          >
            {t('subtitle')}
          </Typography>
        </Container>
      </Box>

      {/* Content */}
      <Box sx={{ py: { xs: 3, md: 5 }, bgcolor: 'grey.50', minHeight: '50vh' }}>
        <Container maxWidth="sm">
          {renderContent()}
        </Container>
      </Box>

      {/* Login Modal */}
      <LoginModal
        open={showLoginModal}
        onClose={() => setShowLoginModal(false)}
        allowClose={true}
        onAuthenticated={() => {
          setShowLoginModal(false);
          // Will auto-fetch on user change
        }}
        apiBaseUrl={process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3011'}
      />
    </Box>
  );
}
