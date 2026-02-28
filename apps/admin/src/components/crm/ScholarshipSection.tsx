'use client';

import { useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Divider,
  Paper,
  TextField,
  Typography,
} from '@neram/ui';
import SchoolIcon from '@mui/icons-material/School';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';
import EditIcon from '@mui/icons-material/Edit';
import HourglassEmptyIcon from '@mui/icons-material/HourglassEmpty';
import DescriptionIcon from '@mui/icons-material/Description';
import ImageIcon from '@mui/icons-material/Image';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import GavelIcon from '@mui/icons-material/Gavel';
import type {
  UserJourneyDetail,
  ScholarshipApplication,
  ScholarshipApplicationStatus,
} from '@neram/database';
import { SCHOLARSHIP_STATUS_CONFIG } from '@neram/database';

interface ScholarshipSectionProps {
  detail: UserJourneyDetail;
  adminId: string;
  onStatusChange: () => void;
}

const STATUS_STYLE: Record<string, { color: string; bgColor: string }> = {
  not_eligible: { color: '#78909C', bgColor: '#78909C14' },
  eligible_pending: { color: '#F57C00', bgColor: '#F57C0014' },
  documents_submitted: { color: '#1976D2', bgColor: '#1976D214' },
  under_review: { color: '#7B1FA2', bgColor: '#7B1FA214' },
  approved: { color: '#2E7D32', bgColor: '#2E7D3214' },
  rejected: { color: '#D32F2F', bgColor: '#D32F2F14' },
  revision_requested: { color: '#F57C00', bgColor: '#F57C0014' },
};

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <Box
      sx={{
        display: 'flex',
        py: 0.75,
        px: 1.5,
        minHeight: 34,
        borderRadius: 1,
        '&:hover': { bgcolor: 'grey.50' },
        transition: 'background-color 0.15s',
      }}
    >
      <Typography variant="body2" sx={{ width: 160, flexShrink: 0, color: 'text.secondary', fontSize: 13, fontWeight: 500 }}>
        {label}
      </Typography>
      <Typography variant="body2" sx={{ flex: 1, fontSize: 13 }}>
        {value || <span style={{ color: '#bdbdbd' }}>--</span>}
      </Typography>
    </Box>
  );
}

function DocumentPreview({ label, url }: { label: string; url: string | null }) {
  if (!url) return null;
  const isPdf = url.toLowerCase().endsWith('.pdf');

  return (
    <Box
      sx={{
        display: 'inline-flex',
        flexDirection: 'column',
        alignItems: 'center',
        border: '1px solid',
        borderColor: 'grey.200',
        borderRadius: 1,
        p: 1.5,
        mr: 1.5,
        mb: 1,
        cursor: 'pointer',
        transition: 'all 0.15s',
        '&:hover': { borderColor: 'primary.main', boxShadow: '0 2px 8px rgba(0,0,0,0.08)', transform: 'translateY(-1px)' },
        width: 100,
      }}
      onClick={() => window.open(url, '_blank')}
    >
      <Box sx={{ width: 56, height: 56, display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: 'grey.50', borderRadius: 0.75, mb: 1 }}>
        {isPdf
          ? <PictureAsPdfIcon sx={{ fontSize: 24, color: '#D32F2F' }} />
          : <Box component="img" src={url} alt={label} sx={{ width: 48, height: 48, objectFit: 'cover', borderRadius: 1 }} />
        }
      </Box>
      <Typography variant="caption" sx={{ textAlign: 'center', fontSize: 10, fontWeight: 600, color: 'text.secondary' }}>
        {label}
      </Typography>
      <OpenInNewIcon sx={{ fontSize: 10, color: 'text.disabled', mt: 0.25 }} />
    </Box>
  );
}

function StatusChip({ status }: { status: ScholarshipApplicationStatus }) {
  const style = STATUS_STYLE[status] || STATUS_STYLE.not_eligible;
  const config = SCHOLARSHIP_STATUS_CONFIG[status];
  return (
    <Chip
      label={config?.label || status}
      size="small"
      sx={{
        height: 22,
        fontSize: 10.5,
        fontWeight: 700,
        bgcolor: style.bgColor,
        color: style.color,
        borderRadius: 1,
        border: `1px solid ${style.color}30`,
        letterSpacing: 0.3,
      }}
    />
  );
}

function SectionHeader({ statusChip }: { statusChip?: React.ReactNode }) {
  return (
    <Box sx={{ px: 3, py: 2, display: 'flex', alignItems: 'center', gap: 1, borderBottom: '1px solid', borderColor: 'grey.100', bgcolor: 'grey.50' }}>
      <SchoolIcon sx={{ color: 'primary.main', fontSize: 20 }} />
      <Typography variant="subtitle1" fontWeight={700}>Scholarship</Typography>
      {statusChip && <Box sx={{ ml: 'auto' }}>{statusChip}</Box>}
    </Box>
  );
}

export default function ScholarshipSection({
  detail,
  adminId,
  onStatusChange,
}: ScholarshipSectionProps) {
  const { leadProfile, scholarshipApplication } = detail;

  const [approveDialogOpen, setApproveDialogOpen] = useState(false);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [revisionDialogOpen, setRevisionDialogOpen] = useState(false);
  const [approvedFee, setApprovedFee] = useState(5000);
  const [approveNotes, setApproveNotes] = useState('');
  const [rejectionReason, setRejectionReason] = useState('');
  const [revisionNotes, setRevisionNotes] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState('');

  const isSchoolStudent = leadProfile?.applicant_category === 'school_student';
  const isGovernmentSchool = leadProfile?.school_type === 'government_school';
  const scholarshipEligible = leadProfile?.scholarship_eligible;

  if (!leadProfile || !isSchoolStudent || (!isGovernmentSchool && !scholarshipEligible && !scholarshipApplication)) {
    return null;
  }

  const scholarship = scholarshipApplication;
  const scholarshipStatus = scholarship?.scholarship_status;

  const handleOpenScholarship = async () => {
    setActionLoading(true);
    setActionError('');
    try {
      const res = await fetch(`/api/crm/users/${detail.user.id}/scholarship`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminId }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to open scholarship');
      }
      onStatusChange();
    } catch (err: any) {
      setActionError(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleReviewAction = async (action: 'approve' | 'reject' | 'request_revision') => {
    if (!scholarship) return;
    setActionLoading(true);
    setActionError('');
    try {
      const body: Record<string, unknown> = { action, adminId, scholarshipId: scholarship.id };
      if (action === 'approve') { body.approved_fee = approvedFee; body.admin_notes = approveNotes; }
      else if (action === 'reject') { body.rejection_reason = rejectionReason; }
      else if (action === 'request_revision') { body.revision_notes = revisionNotes; }

      const res = await fetch(`/api/crm/users/${detail.user.id}/scholarship`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to review scholarship');
      }
      setApproveDialogOpen(false);
      setRejectDialogOpen(false);
      setRevisionDialogOpen(false);
      setApprovedFee(5000);
      setApproveNotes('');
      setRejectionReason('');
      setRevisionNotes('');
      onStatusChange();
    } catch (err: any) {
      setActionError(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  // State 1: Government school, NOT yet scholarship eligible
  if (isGovernmentSchool && !scholarshipEligible && !scholarship) {
    return (
      <Paper elevation={0} sx={{ mb: 3, border: '1px solid', borderColor: 'grey.200', borderRadius: 1, overflow: 'hidden' }}>
        <SectionHeader />
        <Box sx={{ p: 2.5 }}>
          <Box sx={{ p: 2.5, bgcolor: '#E3F2FD', borderRadius: 1, border: '1px solid #BBDEFB', mb: 2 }}>
            <Typography variant="body2" sx={{ color: '#1565C0', fontSize: 12.5 }}>
              This student is from a government school and may be eligible for a scholarship.
            </Typography>
          </Box>
          {actionError && <Alert severity="error" sx={{ mb: 1.5, borderRadius: 0.75 }}>{actionError}</Alert>}
          <Button
            variant="contained"
            color="primary"
            startIcon={<SchoolIcon sx={{ fontSize: 16 }} />}
            onClick={handleOpenScholarship}
            disabled={actionLoading}
            size="small"
            sx={{ borderRadius: 1, textTransform: 'none', fontWeight: 600, boxShadow: 'none', px: 2.5, '&:hover': { boxShadow: 'none' } }}
          >
            {actionLoading ? 'Opening...' : 'Open Scholarship'}
          </Button>
        </Box>
      </Paper>
    );
  }

  // State 2: Eligible pending
  if (scholarshipStatus === 'eligible_pending') {
    return (
      <Paper elevation={0} sx={{ mb: 3, border: '1px solid', borderColor: 'grey.200', borderRadius: 1, overflow: 'hidden' }}>
        <SectionHeader statusChip={<StatusChip status="eligible_pending" />} />
        <Box sx={{ p: 2.5 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2, p: 2, bgcolor: '#FFF3E0', borderRadius: 1, border: '1px solid #FFE0B2' }}>
            <HourglassEmptyIcon sx={{ fontSize: 18, color: '#E65100' }} />
            <Typography variant="body2" sx={{ color: '#E65100', fontSize: 12.5 }}>
              Waiting for student to submit documents
            </Typography>
          </Box>
          {leadProfile?.scholarship_opened_at && (
            <InfoRow
              label="Opened At"
              value={new Date(leadProfile.scholarship_opened_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
            />
          )}
          {leadProfile?.scholarship_opened_by && (
            <InfoRow label="Opened By" value={leadProfile.scholarship_opened_by} />
          )}
        </Box>
      </Paper>
    );
  }

  // State 3: Documents submitted / under review / revision requested
  if (scholarship && (scholarshipStatus === 'documents_submitted' || scholarshipStatus === 'under_review' || scholarshipStatus === 'revision_requested')) {
    const docs = [
      { label: 'School ID', url: scholarship.school_id_card_url },
      { label: 'Income Cert', url: scholarship.income_certificate_url },
      { label: 'Aadhar Card', url: scholarship.aadhar_card_url },
      { label: 'Mark Sheet', url: scholarship.mark_sheet_url },
    ].filter((d) => d.url);

    return (
      <Paper elevation={0} sx={{ mb: 3, border: '1px solid', borderColor: 'grey.200', borderRadius: 1, overflow: 'hidden' }}>
        <SectionHeader statusChip={<StatusChip status={scholarshipStatus} />} />
        <Box sx={{ p: 2.5 }}>
          <InfoRow label="School Name" value={scholarship.school_name} />
          <InfoRow label="Income Range" value={scholarship.annual_income_range} />
          <InfoRow label="Gov. School Years" value={scholarship.government_school_years ? `${scholarship.government_school_years} years` : null} />
          {scholarship.submitted_at && (
            <InfoRow label="Submitted At" value={new Date(scholarship.submitted_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })} />
          )}

          {/* Revision notes warning */}
          {scholarshipStatus === 'revision_requested' && scholarship.revision_notes && (
            <>
              <Divider sx={{ my: 1.5 }} />
              <Box sx={{ p: 2, bgcolor: '#FFF3E0', borderRadius: 1, border: '1px solid #FFE0B2' }}>
                <Typography variant="caption" sx={{ fontWeight: 700, color: '#E65100', fontSize: 11, letterSpacing: 0.3 }}>
                  Previous Revision Notes
                </Typography>
                <Typography variant="body2" sx={{ fontSize: 12.5, color: '#BF360C', mt: 0.5 }}>
                  {scholarship.revision_notes}
                </Typography>
              </Box>
            </>
          )}

          {/* Documents */}
          {docs.length > 0 && (
            <>
              <Divider sx={{ my: 1.5 }} />
              <Typography variant="overline" sx={{ fontWeight: 700, letterSpacing: 1, color: 'text.secondary', fontSize: 10.5, mb: 1, display: 'block' }}>
                Uploaded Documents
              </Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap' }}>
                {docs.map((doc) => (
                  <DocumentPreview key={doc.label} label={doc.label} url={doc.url} />
                ))}
              </Box>
            </>
          )}

          {/* Action buttons */}
          <Divider sx={{ my: 2 }} />
          {actionError && <Alert severity="error" sx={{ mb: 1.5, borderRadius: 0.75 }}>{actionError}</Alert>}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
            <GavelIcon sx={{ fontSize: 14, color: 'primary.main' }} />
            <Typography variant="overline" sx={{ fontWeight: 700, letterSpacing: 1, color: 'text.secondary', fontSize: 10.5 }}>
              Review Actions
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', gap: 1.5 }}>
            <Button
              variant="contained"
              color="success"
              startIcon={<CheckCircleIcon sx={{ fontSize: 16 }} />}
              onClick={() => setApproveDialogOpen(true)}
              disabled={actionLoading}
              size="small"
              sx={{ borderRadius: 1, textTransform: 'none', fontWeight: 600, boxShadow: 'none', px: 2.5, '&:hover': { boxShadow: 'none' } }}
            >
              Approve
            </Button>
            <Button
              variant="outlined"
              color="error"
              startIcon={<CancelIcon sx={{ fontSize: 16 }} />}
              onClick={() => setRejectDialogOpen(true)}
              disabled={actionLoading}
              size="small"
              sx={{ borderRadius: 1, textTransform: 'none', fontWeight: 600, px: 2.5 }}
            >
              Reject
            </Button>
            <Button
              variant="outlined"
              color="warning"
              startIcon={<EditIcon sx={{ fontSize: 16 }} />}
              onClick={() => setRevisionDialogOpen(true)}
              disabled={actionLoading}
              size="small"
              sx={{ borderRadius: 1, textTransform: 'none', fontWeight: 600, px: 2.5 }}
            >
              Request Revision
            </Button>
          </Box>

          {/* Approve Dialog */}
          <Dialog open={approveDialogOpen} onClose={() => setApproveDialogOpen(false)} maxWidth="xs" fullWidth PaperProps={{ sx: { borderRadius: 1 } }}>
            <DialogTitle sx={{ fontWeight: 700, fontSize: 18, pb: 1 }}>Approve Scholarship</DialogTitle>
            <DialogContent>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
                <TextField
                  label="Approved Fee (Rs.)"
                  type="number"
                  value={approvedFee}
                  onChange={(e) => setApprovedFee(Number(e.target.value) || 0)}
                  fullWidth
                  size="small"
                  helperText="Default: Rs. 5,000. Adjust as needed."
                  sx={{ '& .MuiOutlinedInput-root': { borderRadius: 0.75 } }}
                />
                <TextField
                  label="Admin Notes (optional)"
                  multiline
                  rows={2}
                  value={approveNotes}
                  onChange={(e) => setApproveNotes(e.target.value)}
                  fullWidth
                  size="small"
                  sx={{ '& .MuiOutlinedInput-root': { borderRadius: 0.75 } }}
                />
              </Box>
            </DialogContent>
            <DialogActions sx={{ px: 3, pb: 2.5 }}>
              <Button onClick={() => setApproveDialogOpen(false)} sx={{ borderRadius: 1, textTransform: 'none' }}>Cancel</Button>
              <Button
                variant="contained"
                color="success"
                onClick={() => handleReviewAction('approve')}
                disabled={actionLoading || approvedFee <= 0}
                sx={{ borderRadius: 1, textTransform: 'none', fontWeight: 600, boxShadow: 'none', px: 3, '&:hover': { boxShadow: 'none' } }}
              >
                {actionLoading ? 'Approving...' : 'Approve'}
              </Button>
            </DialogActions>
          </Dialog>

          {/* Reject Dialog */}
          <Dialog open={rejectDialogOpen} onClose={() => setRejectDialogOpen(false)} maxWidth="xs" fullWidth PaperProps={{ sx: { borderRadius: 1 } }}>
            <DialogTitle sx={{ fontWeight: 700, fontSize: 18, pb: 1, color: 'error.main' }}>Reject Scholarship</DialogTitle>
            <DialogContent>
              <Box sx={{ mt: 1 }}>
                <TextField
                  label="Rejection Reason"
                  multiline
                  rows={3}
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  fullWidth
                  required
                  size="small"
                  placeholder="Explain why the scholarship is being rejected..."
                  sx={{ '& .MuiOutlinedInput-root': { borderRadius: 0.75 } }}
                />
              </Box>
            </DialogContent>
            <DialogActions sx={{ px: 3, pb: 2.5 }}>
              <Button onClick={() => setRejectDialogOpen(false)} sx={{ borderRadius: 1, textTransform: 'none' }}>Cancel</Button>
              <Button
                variant="contained"
                color="error"
                onClick={() => handleReviewAction('reject')}
                disabled={actionLoading || !rejectionReason.trim()}
                sx={{ borderRadius: 1, textTransform: 'none', fontWeight: 600, boxShadow: 'none', px: 3, '&:hover': { boxShadow: 'none' } }}
              >
                {actionLoading ? 'Rejecting...' : 'Reject'}
              </Button>
            </DialogActions>
          </Dialog>

          {/* Revision Dialog */}
          <Dialog open={revisionDialogOpen} onClose={() => setRevisionDialogOpen(false)} maxWidth="xs" fullWidth PaperProps={{ sx: { borderRadius: 1 } }}>
            <DialogTitle sx={{ fontWeight: 700, fontSize: 18, pb: 1, color: 'warning.main' }}>Request Revision</DialogTitle>
            <DialogContent>
              <Box sx={{ mt: 1 }}>
                <TextField
                  label="Revision Notes"
                  multiline
                  rows={3}
                  value={revisionNotes}
                  onChange={(e) => setRevisionNotes(e.target.value)}
                  fullWidth
                  required
                  size="small"
                  placeholder="What documents or information need to be revised..."
                  sx={{ '& .MuiOutlinedInput-root': { borderRadius: 0.75 } }}
                />
              </Box>
            </DialogContent>
            <DialogActions sx={{ px: 3, pb: 2.5 }}>
              <Button onClick={() => setRevisionDialogOpen(false)} sx={{ borderRadius: 1, textTransform: 'none' }}>Cancel</Button>
              <Button
                variant="contained"
                color="warning"
                onClick={() => handleReviewAction('request_revision')}
                disabled={actionLoading || !revisionNotes.trim()}
                sx={{ borderRadius: 1, textTransform: 'none', fontWeight: 600, boxShadow: 'none', px: 3, '&:hover': { boxShadow: 'none' } }}
              >
                {actionLoading ? 'Requesting...' : 'Request Revision'}
              </Button>
            </DialogActions>
          </Dialog>
        </Box>
      </Paper>
    );
  }

  // State 4: Approved
  if (scholarship && scholarshipStatus === 'approved') {
    return (
      <Paper elevation={0} sx={{ mb: 3, border: '1px solid', borderColor: 'grey.200', borderRadius: 1, overflow: 'hidden' }}>
        <SectionHeader statusChip={<StatusChip status="approved" />} />
        <Box sx={{ p: 2.5 }}>
          <Box sx={{ p: 2, bgcolor: '#E8F5E9', borderRadius: 1, border: '1px solid #C8E6C9', mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
            <CheckCircleIcon sx={{ fontSize: 18, color: '#2E7D32' }} />
            <Typography variant="body2" sx={{ color: '#1B5E20', fontWeight: 600, fontSize: 12.5 }}>
              Scholarship approved
              {scholarship.approved_fee !== null && (
                <span style={{ fontFamily: 'monospace', marginLeft: 8 }}>
                  @ Rs. {scholarship.approved_fee.toLocaleString('en-IN')}
                </span>
              )}
            </Typography>
          </Box>
          {scholarship.verified_at && (
            <InfoRow label="Approval Date" value={new Date(scholarship.verified_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })} />
          )}
          {scholarship.verified_by && (
            <InfoRow label="Approved By" value={scholarship.verified_by} />
          )}
          {scholarship.admin_notes && (
            <InfoRow label="Admin Notes" value={scholarship.admin_notes} />
          )}
        </Box>
      </Paper>
    );
  }

  // State 5: Rejected
  if (scholarship && scholarshipStatus === 'rejected') {
    return (
      <Paper elevation={0} sx={{ mb: 3, border: '1px solid', borderColor: 'grey.200', borderRadius: 1, overflow: 'hidden' }}>
        <SectionHeader statusChip={<StatusChip status="rejected" />} />
        <Box sx={{ p: 2.5 }}>
          {scholarship.rejection_reason && (
            <Box sx={{ p: 2, bgcolor: '#FFEBEE', borderRadius: 1, border: '1px solid #FFCDD2', mb: 2 }}>
              <Typography variant="caption" sx={{ fontWeight: 700, color: '#C62828', fontSize: 11, letterSpacing: 0.3 }}>
                Rejection Reason
              </Typography>
              <Typography variant="body2" sx={{ fontSize: 12.5, color: '#B71C1C', mt: 0.5 }}>
                {scholarship.rejection_reason}
              </Typography>
            </Box>
          )}
          {scholarship.verified_at && (
            <InfoRow label="Rejection Date" value={new Date(scholarship.verified_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })} />
          )}
        </Box>
      </Paper>
    );
  }

  // Fallback
  if (scholarship) {
    return (
      <Paper elevation={0} sx={{ mb: 3, border: '1px solid', borderColor: 'grey.200', borderRadius: 1, overflow: 'hidden' }}>
        <SectionHeader statusChip={scholarshipStatus ? <StatusChip status={scholarshipStatus} /> : undefined} />
        <Box sx={{ p: 2.5, textAlign: 'center' }}>
          <SchoolIcon sx={{ fontSize: 36, color: 'grey.300', mb: 1 }} />
          <Typography variant="body2" color="text.secondary">Scholarship information available.</Typography>
        </Box>
      </Paper>
    );
  }

  return null;
}
