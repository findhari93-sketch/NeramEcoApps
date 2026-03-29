'use client';

import { Box, Chip, Paper, Typography } from '@neram/ui';
import DescriptionIcon from '@mui/icons-material/Description';
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import ImageIcon from '@mui/icons-material/Image';
import VerifiedIcon from '@mui/icons-material/Verified';
import PendingIcon from '@mui/icons-material/Pending';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import CancelIcon from '@mui/icons-material/Cancel';
import SchoolIcon from '@mui/icons-material/School';
import type { UserJourneyDetail } from '@neram/database';

interface DocumentsSectionProps {
  detail: UserJourneyDetail;
}

function getFileIcon(fileName: string | null, type: string) {
  const name = (fileName || type).toLowerCase();
  if (name.includes('.pdf') || name.includes('pdf')) {
    return <PictureAsPdfIcon sx={{ fontSize: 28, color: '#D32F2F' }} />;
  }
  if (name.includes('.jpg') || name.includes('.jpeg') || name.includes('.png') || name.includes('.webp') || name.includes('image') || name.includes('photo')) {
    return <ImageIcon sx={{ fontSize: 28, color: '#1976D2' }} />;
  }
  return <InsertDriveFileIcon sx={{ fontSize: 28, color: '#78909C' }} />;
}

const NEXUS_DOC_STATUS_CONFIG = {
  verified: { icon: <VerifiedIcon sx={{ fontSize: 12 }} />, label: 'Verified', color: '#2E7D32' },
  rejected: { icon: <CancelIcon sx={{ fontSize: 12 }} />, label: 'Rejected', color: '#D32F2F' },
  pending: { icon: <PendingIcon sx={{ fontSize: 12 }} />, label: 'Pending', color: '#F57C00' },
};

const CATEGORY_LABELS: Record<string, string> = {
  identity: 'Identity',
  academic: 'Academic',
  exam: 'Exam',
  photo: 'Photo',
  other: 'Other',
};

export default function DocumentsSection({ detail }: DocumentsSectionProps) {
  const { documents, nexusDocuments } = detail;
  const totalCount = documents.length + (nexusDocuments?.length || 0);

  return (
    <Paper elevation={0} sx={{ mb: 2, border: '1px solid', borderColor: 'grey.200', borderRadius: 1, overflow: 'hidden' }}>
      <Box sx={{ px: 3, py: 2, display: 'flex', alignItems: 'center', gap: 1, borderBottom: '1px solid', borderColor: 'grey.100', bgcolor: 'grey.50' }}>
        <DescriptionIcon sx={{ color: 'primary.main', fontSize: 20 }} />
        <Typography variant="subtitle1" fontWeight={700}>Documents</Typography>
        {totalCount > 0 && (
          <Chip
            label={totalCount}
            size="small"
            sx={{ height: 20, fontSize: 10, fontWeight: 700, bgcolor: 'grey.200', color: 'text.secondary', borderRadius: 1, ml: 0.5 }}
          />
        )}
      </Box>

      <Box sx={{ p: 1.5 }}>
        {/* Application Documents */}
        {documents.length > 0 && (
          <>
            <Typography variant="overline" sx={{ fontWeight: 700, letterSpacing: 1, color: 'text.secondary', fontSize: 10, px: 0.5, mb: 1, display: 'block' }}>
              Application Documents
            </Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5, mb: nexusDocuments?.length ? 2 : 0 }}>
              {documents.map((doc) => (
                <Box
                  key={doc.id}
                  sx={{
                    p: 2,
                    border: '1px solid',
                    borderColor: 'grey.200',
                    borderRadius: 1,
                    width: 180,
                    transition: 'all 0.15s',
                    cursor: doc.file_url ? 'pointer' : 'default',
                    '&:hover': doc.file_url ? {
                      borderColor: 'primary.main',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
                      transform: 'translateY(-1px)',
                    } : {},
                  }}
                  onClick={() => doc.file_url && window.open(doc.file_url, '_blank')}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', mb: 1.5, py: 1.5, bgcolor: 'grey.50', borderRadius: 0.75 }}>
                    {getFileIcon(doc.file_name, doc.document_type)}
                  </Box>
                  <Typography variant="body2" noWrap sx={{ fontWeight: 600, fontSize: 12.5, mb: 0.25, textTransform: 'capitalize' }}>
                    {doc.document_type.replace(/_/g, ' ')}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" noWrap sx={{ fontSize: 10.5, display: 'block', mb: 1.25 }}>
                    {doc.file_name || 'Uploaded file'}
                  </Typography>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    {doc.is_verified ? (
                      <Chip
                        icon={<VerifiedIcon sx={{ fontSize: 12 }} />}
                        label="Verified"
                        size="small"
                        sx={{ height: 20, fontSize: 9.5, fontWeight: 700, bgcolor: '#2E7D3214', color: '#2E7D32', borderRadius: 1, border: '1px solid #2E7D3230', '& .MuiChip-icon': { color: '#2E7D32', ml: 0.5 } }}
                      />
                    ) : (
                      <Chip
                        icon={<PendingIcon sx={{ fontSize: 12 }} />}
                        label="Pending"
                        size="small"
                        sx={{ height: 20, fontSize: 9.5, fontWeight: 700, bgcolor: '#F57C0014', color: '#F57C00', borderRadius: 1, border: '1px solid #F57C0030', '& .MuiChip-icon': { color: '#F57C00', ml: 0.5 } }}
                      />
                    )}
                    {doc.file_url && <OpenInNewIcon sx={{ fontSize: 13, color: 'text.disabled', ml: 'auto' }} />}
                  </Box>
                </Box>
              ))}
            </Box>
          </>
        )}

        {/* Nexus Onboarding Documents */}
        {nexusDocuments && nexusDocuments.length > 0 && (
          <>
            <Typography variant="overline" sx={{ fontWeight: 700, letterSpacing: 1, color: 'text.secondary', fontSize: 10, px: 0.5, mb: 1, display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <SchoolIcon sx={{ fontSize: 13 }} /> Nexus Documents
            </Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5 }}>
              {nexusDocuments.map((doc) => {
                const statusConfig = NEXUS_DOC_STATUS_CONFIG[doc.status] || NEXUS_DOC_STATUS_CONFIG.pending;
                return (
                  <Box
                    key={doc.id}
                    sx={{
                      p: 2,
                      border: '1px solid',
                      borderColor: 'grey.200',
                      borderRadius: 1,
                      width: 180,
                      transition: 'all 0.15s',
                      cursor: doc.file_url ? 'pointer' : 'default',
                      '&:hover': doc.file_url ? {
                        borderColor: 'primary.main',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
                        transform: 'translateY(-1px)',
                      } : {},
                    }}
                    onClick={() => doc.file_url && window.open(doc.file_url, '_blank')}
                  >
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', mb: 1.5, py: 1.5, bgcolor: 'grey.50', borderRadius: 0.75 }}>
                      {getFileIcon(doc.file_type || doc.file_url, doc.category)}
                    </Box>
                    <Typography variant="body2" noWrap sx={{ fontWeight: 600, fontSize: 12.5, mb: 0.25 }}>
                      {doc.title}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" noWrap sx={{ fontSize: 10.5, display: 'block', mb: 1.25 }}>
                      {CATEGORY_LABELS[doc.category] || doc.category}
                    </Typography>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                      <Chip
                        icon={statusConfig.icon}
                        label={statusConfig.label}
                        size="small"
                        sx={{
                          height: 20, fontSize: 9.5, fontWeight: 700,
                          bgcolor: `${statusConfig.color}14`,
                          color: statusConfig.color,
                          borderRadius: 1,
                          border: `1px solid ${statusConfig.color}30`,
                          '& .MuiChip-icon': { color: statusConfig.color, ml: 0.5 },
                        }}
                      />
                      {doc.file_url && <OpenInNewIcon sx={{ fontSize: 13, color: 'text.disabled', ml: 'auto' }} />}
                    </Box>
                  </Box>
                );
              })}
            </Box>
          </>
        )}

        {/* Empty state */}
        {totalCount === 0 && (
          <Box sx={{ py: 3, textAlign: 'center' }}>
            <DescriptionIcon sx={{ fontSize: 36, color: 'grey.300', mb: 1 }} />
            <Typography variant="body2" color="text.secondary">No documents uploaded yet.</Typography>
          </Box>
        )}
      </Box>
    </Paper>
  );
}
