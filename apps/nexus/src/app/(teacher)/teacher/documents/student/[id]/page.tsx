'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import {
  Box,
  Typography,
  Paper,
  Chip,
  Skeleton,
  Button,
  alpha,
  useTheme,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
} from '@neram/ui';
import CloseIcon from '@mui/icons-material/Close';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import CheckCircleOutlinedIcon from '@mui/icons-material/CheckCircleOutlined';
import CancelOutlinedIcon from '@mui/icons-material/CancelOutlined';
import PendingOutlinedIcon from '@mui/icons-material/PendingOutlined';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import PageHeader from '@/components/PageHeader';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import VerifyRejectDialog from '@/components/documents/VerifyRejectDialog';
import AuditLog from '@/components/documents/AuditLog';

interface Document {
  id: string;
  title: string;
  category: string;
  status: string;
  file_url: string;
  file_type: string | null;
  uploaded_at: string;
  version: number;
  rejection_reason: string | null;
  template: { id: string; name: string; category: string; is_required: boolean } | null;
}

export default function TeacherStudentDocumentsPage() {
  const theme = useTheme();
  const params = useParams();
  const studentId = params.id as string;
  const { activeClassroom, getToken } = useNexusAuthContext();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [studentName, setStudentName] = useState('');
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogAction, setDialogAction] = useState<'verify' | 'reject' | null>(null);
  const [selectedDoc, setSelectedDoc] = useState<Document | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [previewDoc, setPreviewDoc] = useState<Document | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const handleView = async (doc: Document) => {
    // For images and PDFs, show inline preview
    const isPreviewable = doc.file_type?.startsWith('image/') || doc.file_type === 'application/pdf';
    if (!isPreviewable) {
      // For other types, open SharePoint web URL in new tab
      if (doc.file_url) window.open(doc.file_url, '_blank');
      return;
    }
    setPreviewDoc(doc);
    setPreviewLoading(true);
    try {
      const token = await getToken();
      if (!token) return;
      const res = await fetch(`/api/documents/${doc.id}/download`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setPreviewUrl(data.url);
      }
    } catch (err) {
      console.error('Failed to get preview URL:', err);
    } finally {
      setPreviewLoading(false);
    }
  };

  const fetchDocuments = useCallback(async () => {
    if (!activeClassroom) return;
    setLoading(true);
    try {
      const token = await getToken();
      if (!token) return;

      // Get student's documents via class-overview API (simpler than a per-student endpoint)
      const res = await fetch(
        `/api/documents/class-overview?classroom=${activeClassroom.id}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!res.ok) return;
      const overview = await res.json();

      const student = (overview.students || []).find((s: { id: string }) => s.id === studentId);
      if (student) setStudentName(student.name);

      // Get actual document records for this student
      // We need a direct documents query — use the documents API with student filter
      // For teacher, we'll fetch all documents from the audit endpoint's classroom data
      const docsRes = await fetch(
        `/api/documents?classroom=${activeClassroom.id}&student_id=${studentId}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      // The documents API only returns the logged-in user's documents.
      // For teacher view, we query all classroom docs and filter client-side.
      // Actually, let's use the admin client approach — fetch from class-overview and enrich.
      // For now, show the matrix data we already have.

      // Get all documents for display
      const allDocsRes = await fetch(
        `/api/documents/audit?classroom=${activeClassroom.id}&student=${studentId}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      // Since we can't query another user's documents from the existing GET endpoint,
      // we'll use a workaround: get document IDs from the matrix and fetch individually
      const matrix = overview.matrix?.[studentId] || {};
      const docList: Document[] = [];

      for (const templateId of Object.keys(matrix)) {
        const cell = matrix[templateId];
        if (!cell) continue;
        const docRes = await fetch(`/api/documents/${cell.document_id}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (docRes.ok) {
          const docData = await docRes.json();
          docList.push(docData.document);
        }
      }

      setDocuments(docList);
    } catch (err) {
      console.error('Failed to load student documents:', err);
    } finally {
      setLoading(false);
    }
  }, [activeClassroom, getToken, studentId]);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  const handleAction = (doc: Document, action: 'verify' | 'reject') => {
    setSelectedDoc(doc);
    setDialogAction(action);
    setDialogOpen(true);
  };

  const handleConfirm = async (action: 'verify' | 'reject', rejectionReason?: string) => {
    if (!selectedDoc) return;
    setActionLoading(true);
    try {
      const token = await getToken();
      if (!token) return;
      const res = await fetch(`/api/documents/${selectedDoc.id}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action, rejection_reason: rejectionReason }),
      });
      if (res.ok) {
        setDialogOpen(false);
        fetchDocuments();
      }
    } catch (err) {
      console.error('Action failed:', err);
    } finally {
      setActionLoading(false);
    }
  };

  const statusIcon = (status: string) => {
    if (status === 'verified') return <CheckCircleOutlinedIcon sx={{ fontSize: 18, color: 'success.main' }} />;
    if (status === 'rejected') return <CancelOutlinedIcon sx={{ fontSize: 18, color: 'error.main' }} />;
    return <PendingOutlinedIcon sx={{ fontSize: 18, color: 'warning.main' }} />;
  };

  return (
    <Box>
      <PageHeader
        title={studentName || 'Student Documents'}
        subtitle="Review and verify uploaded documents"
        breadcrumbs={[
          { label: 'Documents', href: '/teacher/documents' },
          { label: studentName || 'Student' },
        ]}
      />

      {loading ? (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} variant="rectangular" height={80} sx={{ borderRadius: 2 }} />
          ))}
        </Box>
      ) : documents.length === 0 ? (
        <Paper sx={{ p: 4, textAlign: 'center' }}>
          <DescriptionOutlinedIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
          <Typography color="text.secondary">No documents uploaded by this student.</Typography>
        </Paper>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, mb: 4 }}>
          {documents.map((doc) => (
            <Paper
              key={doc.id}
              variant="outlined"
              sx={{ p: 2 }}
            >
              <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
                {statusIcon(doc.status)}
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                    <Typography variant="body2" fontWeight={600}>
                      {doc.title}
                    </Typography>
                    <Chip
                      label={doc.status}
                      size="small"
                      color={doc.status === 'verified' ? 'success' : doc.status === 'rejected' ? 'error' : 'warning'}
                      sx={{ height: 22, fontSize: '0.65rem', textTransform: 'capitalize' }}
                    />
                    {doc.version > 1 && (
                      <Chip label={`v${doc.version}`} size="small" variant="outlined" sx={{ height: 20, fontSize: '0.6rem' }} />
                    )}
                  </Box>
                  <Typography variant="caption" color="text.secondary">
                    {doc.template?.name || doc.category} &middot; {new Date(doc.uploaded_at).toLocaleDateString()}
                    {doc.file_type && ` · ${doc.file_type.split('/')[1]?.toUpperCase()}`}
                  </Typography>
                  {doc.rejection_reason && (
                    <Typography variant="caption" color="error" sx={{ display: 'block', mt: 0.5 }}>
                      Reason: {doc.rejection_reason}
                    </Typography>
                  )}
                </Box>
                <Box sx={{ display: 'flex', gap: 0.5, flexShrink: 0 }}>
                  <Button
                    size="small"
                    variant="text"
                    onClick={() => handleView(doc)}
                    sx={{ textTransform: 'none', fontSize: '0.75rem', minWidth: 'auto' }}
                  >
                    View
                  </Button>
                  {doc.status !== 'verified' && (
                    <Button
                      size="small"
                      color="success"
                      onClick={() => handleAction(doc, 'verify')}
                      sx={{ textTransform: 'none', fontSize: '0.75rem', minWidth: 'auto' }}
                    >
                      Verify
                    </Button>
                  )}
                  {doc.status !== 'rejected' && (
                    <Button
                      size="small"
                      color="error"
                      onClick={() => handleAction(doc, 'reject')}
                      sx={{ textTransform: 'none', fontSize: '0.75rem', minWidth: 'auto' }}
                    >
                      Reject
                    </Button>
                  )}
                </Box>
              </Box>
            </Paper>
          ))}
        </Box>
      )}

      <Typography variant="h6" sx={{ fontWeight: 700, mb: 1.5 }}>
        Activity Log
      </Typography>
      <AuditLog studentId={studentId} />

      <VerifyRejectDialog
        open={dialogOpen}
        action={dialogAction}
        documentTitle={selectedDoc?.title || ''}
        onClose={() => setDialogOpen(false)}
        onConfirm={handleConfirm}
        loading={actionLoading}
      />

      {/* Document Preview Dialog */}
      <Dialog
        open={!!previewDoc}
        onClose={() => { setPreviewDoc(null); setPreviewUrl(null); }}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pr: 1 }}>
          <Typography variant="subtitle1" fontWeight={600} noWrap>
            {previewDoc?.title}
          </Typography>
          <Box sx={{ display: 'flex', gap: 0.5 }}>
            {previewUrl && (
              <IconButton size="small" onClick={() => window.open(previewUrl, '_blank')} title="Open in new tab">
                <OpenInNewIcon fontSize="small" />
              </IconButton>
            )}
            <IconButton size="small" onClick={() => { setPreviewDoc(null); setPreviewUrl(null); }}>
              <CloseIcon fontSize="small" />
            </IconButton>
          </Box>
        </DialogTitle>
        <DialogContent sx={{ p: 0, minHeight: 400, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {previewLoading ? (
            <Skeleton variant="rectangular" width="100%" height={400} />
          ) : previewUrl ? (
            previewDoc?.file_type?.startsWith('image/') ? (
              <img
                src={previewUrl}
                alt={previewDoc?.title}
                style={{ maxWidth: '100%', maxHeight: '70vh', objectFit: 'contain' }}
              />
            ) : (
              <iframe
                src={previewUrl}
                style={{ width: '100%', height: '70vh', border: 'none' }}
                title={previewDoc?.title}
              />
            )
          ) : (
            <Typography color="text.secondary" sx={{ p: 4 }}>
              Unable to load preview.
            </Typography>
          )}
        </DialogContent>
      </Dialog>
    </Box>
  );
}
