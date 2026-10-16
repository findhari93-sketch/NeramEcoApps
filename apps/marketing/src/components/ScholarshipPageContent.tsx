'use client';

import { useState, useEffect, useCallback } from 'react';
import { Box, Alert, Skeleton } from '@neram/ui';
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
import { buildWhatsAppLink } from '@/lib/whatsapp';
import { PageHero, Section, EmptyState, CtaButton, tokens as tk } from '@/design-system';

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
          <Skeleton variant="rectangular" height={200} sx={{ borderRadius: `${tk.radius}px`, mb: 2 }} />
          <Skeleton variant="rectangular" height={120} sx={{ borderRadius: `${tk.radius}px` }} />
        </Box>
      );
    }

    // Not logged in
    if (!user) {
      return (
        <EmptyState
          icon={<LoginOutlined />}
          title={t('loginRequired')}
          body="Log in with your account to access the scholarship application portal."
          action={
            <CtaButton onClick={() => setShowLoginModal(true)} startIcon={<LoginOutlined aria-hidden />} endIcon={null}>
              {t('loginButton')}
            </CtaButton>
          }
        />
      );
    }

    // Loading scholarship data
    if (loading) {
      return (
        <Box aria-busy="true" sx={{ py: 2 }}>
          <Skeleton variant="rectangular" height={160} sx={{ borderRadius: `${tk.radius}px`, mb: 2 }} />
          <Skeleton variant="rectangular" height={240} sx={{ borderRadius: `${tk.radius}px` }} />
        </Box>
      );
    }

    // Error
    if (error) {
      return (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
          <CtaButton variant="link" size="md" onClick={fetchScholarshipData} endIcon={null} sx={{ ml: 2 }}>
            Retry
          </CtaButton>
        </Alert>
      );
    }

    // No application submitted yet
    if (scholarshipData && !scholarshipData.hasApplication) {
      return (
        <EmptyState
          icon={<SchoolOutlined />}
          title={t('noApplication')}
          body="You need to submit an admission application before applying for a scholarship."
          action={<CtaButton href="/apply">{t('applyFirst')}</CtaButton>}
        />
      );
    }

    // Not eligible for scholarship
    if (scholarshipData && !scholarshipData.scholarshipEligible) {
      return (
        <EmptyState
          icon={<SchoolOutlined />}
          title={t('notEligible')}
          body={t('notEligibleDesc')}
          action={
            <CtaButton
              variant="outline"
              href={buildWhatsAppLink({ text: 'Hi, I have a question about the scholarship program' }).href}
              external
              startIcon={<PhoneOutlined aria-hidden />}
            >
              {t('contactSupport')}
            </CtaButton>
          }
        />
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
      <PageHero
        title={t('title')}
        lede={t('subtitle')}
        blueprint={false}
      />

      <Section id="scholarship" rule={false} width="legal" sx={{ minHeight: '50vh' }}>
        {renderContent()}
      </Section>

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
