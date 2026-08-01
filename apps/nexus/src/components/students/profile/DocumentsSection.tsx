'use client';

import { Box, Chip, Link, Typography } from '@neram/ui';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import { EmptyNote, Field, FieldGrid } from './FieldGrid';
import ProfileSection from './ProfileSection';
import {
  EMPTY_SENTENCE,
  formatDateIN,
  humanise,
  yesNo,
} from '@/lib/student-profile-fields';
import type { ProfileDocument, ProfileGuardian } from '@/lib/student-profile-types';

const CATEGORY_LABEL: Record<string, string> = {
  identity: 'Identity',
  exam: 'Exam records',
  academic: 'Academic',
  photo: 'Photo',
};

const STATUS_COLOR: Record<string, 'success' | 'warning' | 'error' | 'default'> = {
  verified: 'success',
  approved: 'success',
  pending: 'warning',
  rejected: 'error',
};

/**
 * Files uploaded for this student, grouped by category, plus the identity
 * fields that live alongside them.
 *
 * Aadhaar arrives already masked from the server. The raw number is never put
 * into this payload at all, so there is nothing here to leak even if a future
 * component renders the whole object. Revealing it is a separate, audited call.
 */
export default function DocumentsSection({
  documents,
  guardian,
  canSeeRestricted,
}: {
  documents: ProfileDocument[];
  guardian: ProfileGuardian;
  /** coord.student.finance. Gates the scholarship-related identity fields. */
  canSeeRestricted: boolean;
}) {
  const pending = documents.filter(
    (d) => d.status !== 'verified' && d.status !== 'approved',
  ).length;

  const byCategory = documents.reduce<Record<string, ProfileDocument[]>>((acc, d) => {
    const key = d.category || 'other';
    (acc[key] ||= []).push(d);
    return acc;
  }, {});

  return (
    <ProfileSection
      id="profile-documents"
      title="Documents"
      headline={
        documents.length === 0
          ? 'Nothing uploaded'
          : `${documents.length} uploaded${pending ? `, ${pending} awaiting review` : ''}`
      }
    >
      {documents.length === 0 ? (
        <EmptyNote>{EMPTY_SENTENCE.documents}</EmptyNote>
      ) : (
        Object.entries(byCategory).map(([category, docs]) => (
          <Box key={category} sx={{ mb: 3 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
              {CATEGORY_LABEL[category] || humanise(category)}
            </Typography>
            <Box sx={{ display: 'grid', gap: 1 }}>
              {docs.map((d) => (
                <Box
                  key={d.id}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 1,
                    // 48px clears the touch target for the whole row.
                    minHeight: 48,
                    px: 1.5,
                    py: 1,
                    borderRadius: 1,
                    bgcolor: 'action.hover',
                  }}
                >
                  <Box sx={{ minWidth: 0 }}>
                    <Typography variant="body2" sx={{ fontWeight: 600, wordBreak: 'break-word' }}>
                      {d.title || 'Untitled document'}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {[
                        d.uploaded_at ? `Uploaded ${formatDateIN(d.uploaded_at)}` : null,
                        d.version ? `Version ${d.version}` : null,
                        d.rejection_reason,
                      ]
                        .filter(Boolean)
                        .join('. ')}
                    </Typography>
                  </Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexShrink: 0 }}>
                    {d.status && (
                      <Chip
                        size="small"
                        label={humanise(d.status)}
                        color={STATUS_COLOR[d.status] || 'default'}
                        sx={{ fontWeight: 700 }}
                      />
                    )}
                    {(d.sharepoint_web_url || d.file_url) && (
                      <Link
                        href={(d.sharepoint_web_url || d.file_url) as string}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={`Open ${d.title || 'document'}`}
                        sx={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          width: 40,
                          height: 40,
                        }}
                      >
                        <OpenInNewIcon fontSize="small" />
                      </Link>
                    )}
                  </Box>
                </Box>
              ))}
            </Box>
          </Box>
        ))
      )}

      {(guardian.aadhaar_masked || canSeeRestricted) && (
        <Box sx={{ mt: 2 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1.5 }}>
            Identity records
          </Typography>
          <FieldGrid>
            <Field
              label="Aadhaar number"
              value={guardian.aadhaar_masked}
              hint="Masked for everyone. The full number is not sent to this page."
            />
            <Field label="Aadhaar verified" value={yesNo(guardian.aadhaar_verified)} />
          </FieldGrid>
        </Box>
      )}
    </ProfileSection>
  );
}
