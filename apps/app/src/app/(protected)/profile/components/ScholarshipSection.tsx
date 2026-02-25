'use client';

import { Box, Typography, Chip } from '@neram/ui';
import InfoRow from './InfoRow';
import { SCHOLARSHIP_STATUS_CONFIG, type ScholarshipApplication } from '@neram/database';

interface ScholarshipSectionProps {
  scholarship: ScholarshipApplication;
}

function formatCurrency(amount: number | null): string | null {
  if (amount === null || amount === undefined) return null;
  return `₹${Number(amount).toLocaleString('en-IN')}`;
}

export default function ScholarshipSection({ scholarship }: ScholarshipSectionProps) {
  const statusConfig = SCHOLARSHIP_STATUS_CONFIG[scholarship.scholarship_status];

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
        <Typography variant="body2" color="text.secondary">
          Status:
        </Typography>
        <Chip
          label={statusConfig?.label || scholarship.scholarship_status}
          size="small"
          sx={{ bgcolor: statusConfig?.color, color: '#fff' }}
        />
      </Box>

      {scholarship.scholarship_percentage > 0 && (
        <InfoRow label="Scholarship" value={`${scholarship.scholarship_percentage}% discount`} />
      )}
      {scholarship.approved_fee != null && (
        <InfoRow label="Approved Fee" value={formatCurrency(scholarship.approved_fee)} />
      )}
      <InfoRow label="School" value={scholarship.school_name} />
      {scholarship.government_school_years > 0 && (
        <InfoRow label="Govt School Years" value={`${scholarship.government_school_years} years`} />
      )}

      {/* Document status */}
      <Box sx={{ mt: 1.5 }}>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
          Documents:
        </Typography>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
          <Chip
            label="School ID"
            size="small"
            variant={scholarship.school_id_card_url ? 'filled' : 'outlined'}
            color={scholarship.school_id_card_url ? 'success' : 'default'}
          />
          <Chip
            label="Income Certificate"
            size="small"
            variant={scholarship.income_certificate_url ? 'filled' : 'outlined'}
            color={scholarship.income_certificate_url ? 'success' : 'default'}
          />
          <Chip
            label="Aadhar Card"
            size="small"
            variant={scholarship.aadhar_card_url ? 'filled' : 'outlined'}
            color={scholarship.aadhar_card_url ? 'success' : 'default'}
          />
          <Chip
            label="Mark Sheet"
            size="small"
            variant={scholarship.mark_sheet_url ? 'filled' : 'outlined'}
            color={scholarship.mark_sheet_url ? 'success' : 'default'}
          />
        </Box>
      </Box>

      {scholarship.revision_notes && (
        <Box sx={{ mt: 1.5, p: 1.5, bgcolor: 'warning.50', borderRadius: 1 }}>
          <Typography variant="caption" color="warning.dark">
            Revision requested: {scholarship.revision_notes}
          </Typography>
        </Box>
      )}
    </Box>
  );
}
