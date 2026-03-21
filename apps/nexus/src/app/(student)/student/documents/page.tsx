'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Paper,
  Chip,
  Skeleton,
  Button,
  alpha,
  useTheme,
  Tabs,
  Tab,
} from '@neram/ui';
import UploadFileOutlinedIcon from '@mui/icons-material/UploadFileOutlined';
import CheckCircleOutlinedIcon from '@mui/icons-material/CheckCircleOutlined';
import CancelOutlinedIcon from '@mui/icons-material/CancelOutlined';
import PendingOutlinedIcon from '@mui/icons-material/PendingOutlined';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import DocumentUploadSheet from '@/components/documents/DocumentUploadSheet';
import ExamSelectionPanel from '@/components/documents/ExamSelectionPanel';

interface Template {
  id: string;
  name: string;
  description: string | null;
  category: string;
  applicable_standards: string[];
  is_required: boolean;
  unlock_date: string | null;
  linked_exam: string | null;
  exam_state_threshold: string | null;
  max_file_size_mb: number;
  allowed_file_types: string[];
}

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
  template_id: string | null;
}

const CATEGORY_LABELS: Record<string, string> = {
  identity: 'Identity',
  academic: 'Academic',
  exam: 'Exam',
  photo: 'Photo',
  other: 'Other',
  aadhaar: 'Identity',
  marksheet: 'Academic',
  hall_ticket: 'Exam',
};

const CATEGORY_ORDER = ['identity', 'academic', 'exam', 'photo', 'other'];


export default function StudentDocuments() {
  const theme = useTheme();
  const { activeClassroom, getToken } = useNexusAuthContext();
  const [tab, setTab] = useState(0);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);

  const fetchAll = useCallback(async () => {
    if (!activeClassroom) return;
    setLoading(true);
    try {
      const token = await getToken();
      if (!token) return;

      const headers = { Authorization: `Bearer ${token}` };
      const [tmplRes, docsRes] = await Promise.all([
        fetch('/api/documents/templates', { headers }),
        fetch(`/api/documents?classroom=${activeClassroom.id}`, { headers }),
      ]);

      if (tmplRes.ok) {
        const data = await tmplRes.json();
        setTemplates(data.templates || []);
      }
      if (docsRes.ok) {
        const data = await docsRes.json();
        setDocuments(data.documents || []);
      }
    } catch (err) {
      console.error('Failed to load data:', err);
    } finally {
      setLoading(false);
    }
  }, [activeClassroom, getToken]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const isTemplateLocked = (template: Template): string | null => {
    // Check unlock date
    if (template.unlock_date && new Date(template.unlock_date) > new Date()) {
      return `Available from ${new Date(template.unlock_date).toLocaleDateString()}`;
    }
    // Exam-linked templates are now managed via the Exam Tracker tab
    if (template.linked_exam && template.exam_state_threshold) {
      return `Use the Exam Tracker tab to manage ${template.linked_exam.toUpperCase()} documents`;
    }
    return null;
  };

  const getDocumentForTemplate = (templateId: string) => {
    return documents.find((d) => d.template_id === templateId);
  };

  const handleUpload = (template: Template) => {
    setSelectedTemplate(template);
    setUploadOpen(true);
  };

  const statusDisplay = (status: string) => {
    if (status === 'verified') return { icon: <CheckCircleOutlinedIcon sx={{ fontSize: 16 }} />, color: 'success' as const, label: 'Verified' };
    if (status === 'rejected') return { icon: <CancelOutlinedIcon sx={{ fontSize: 16 }} />, color: 'error' as const, label: 'Rejected' };
    return { icon: <PendingOutlinedIcon sx={{ fontSize: 16 }} />, color: 'warning' as const, label: 'Pending' };
  };

  // Group templates by category
  const grouped = CATEGORY_ORDER.map((cat) => ({
    category: cat,
    label: CATEGORY_LABELS[cat] || cat,
    templates: templates.filter((t) => t.category === cat),
  })).filter((g) => g.templates.length > 0);

  if (loading) {
    return (
      <Box>
        <Typography variant="h6" fontWeight={700} sx={{ mb: 2 }}>Document Vault</Typography>
        <Box sx={{ display: 'flex', gap: 1.5, mb: 3 }}>
          <Skeleton variant="rectangular" height={100} sx={{ flex: 1, borderRadius: 2 }} />
          <Skeleton variant="rectangular" height={100} sx={{ flex: 1, borderRadius: 2 }} />
        </Box>
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} variant="rectangular" height={64} sx={{ borderRadius: 1, mb: 1 }} />
        ))}
      </Box>
    );
  }

  return (
    <Box>
      <Typography variant="h6" fontWeight={700} sx={{ mb: 2 }}>Document Vault</Typography>

      <Tabs
        value={tab}
        onChange={(_, v) => setTab(v)}
        sx={{ mb: 2, borderBottom: 1, borderColor: 'divider' }}
      >
        <Tab label="Documents" sx={{ textTransform: 'none', fontWeight: 600 }} />
        <Tab label="Exam Tracker" sx={{ textTransform: 'none', fontWeight: 600 }} />
      </Tabs>

      {tab === 1 && (
        <ExamSelectionPanel
          classroomId={activeClassroom?.id || ''}
          getToken={getToken}
        />
      )}

      {/* Document Templates grouped by category */}
      {tab === 0 && (
        templates.length === 0 ? (
          <Paper sx={{ p: 4, textAlign: 'center' }}>
            <DescriptionOutlinedIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
            <Typography color="text.secondary">No document templates available yet.</Typography>
          </Paper>
        ) : (
          grouped.map((group) => (
            <Box key={group.category} sx={{ mb: 3 }}>
              <Typography variant="body2" fontWeight={700} color="text.secondary" sx={{ mb: 1, textTransform: 'uppercase', fontSize: '0.7rem', letterSpacing: 1 }}>
                {group.label}
              </Typography>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                {group.templates.map((tmpl) => {
                  const doc = getDocumentForTemplate(tmpl.id);
                  const lockReason = isTemplateLocked(tmpl);
                  const isLocked = !!lockReason;

                  return (
                    <Paper
                      key={tmpl.id}
                      variant="outlined"
                      sx={{
                        p: 2,
                        opacity: isLocked ? 0.6 : 1,
                      }}
                    >
                      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
                        {isLocked ? (
                          <LockOutlinedIcon sx={{ fontSize: 18, color: 'text.disabled', mt: 0.2 }} />
                        ) : doc ? (
                          statusDisplay(doc.status).icon
                        ) : (
                          <DescriptionOutlinedIcon sx={{ fontSize: 18, color: 'text.disabled', mt: 0.2 }} />
                        )}

                        <Box sx={{ flex: 1, minWidth: 0 }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.3 }}>
                            <Typography variant="body2" fontWeight={600}>
                              {tmpl.name}
                            </Typography>
                            {tmpl.is_required && (
                              <Chip label="Required" size="small" color="error" variant="outlined" sx={{ height: 18, fontSize: '0.6rem' }} />
                            )}
                          </Box>

                          {isLocked && (
                            <Typography variant="caption" color="text.disabled">
                              {lockReason}
                            </Typography>
                          )}

                          {!isLocked && doc && (
                            <>
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                <Chip
                                  label={statusDisplay(doc.status).label}
                                  size="small"
                                  color={statusDisplay(doc.status).color}
                                  sx={{ height: 20, fontSize: '0.65rem' }}
                                />
                                {doc.version > 1 && (
                                  <Typography variant="caption" color="text.disabled">v{doc.version}</Typography>
                                )}
                                <Typography variant="caption" color="text.secondary">
                                  &middot; {new Date(doc.uploaded_at).toLocaleDateString()}
                                </Typography>
                              </Box>
                              {doc.status === 'rejected' && doc.rejection_reason && (
                                <Typography variant="caption" color="error" sx={{ display: 'block', mt: 0.3 }}>
                                  {doc.rejection_reason}
                                </Typography>
                              )}
                            </>
                          )}

                          {!isLocked && !doc && (
                            <Typography variant="caption" color="text.disabled">
                              Not uploaded yet
                            </Typography>
                          )}
                        </Box>

                        {!isLocked && (
                          <Box sx={{ flexShrink: 0 }}>
                            {doc && doc.file_url && (
                              <Button
                                size="small"
                                variant="text"
                                href={doc.file_url}
                                target="_blank"
                                sx={{ textTransform: 'none', fontSize: '0.75rem', minWidth: 'auto', mr: 0.5 }}
                              >
                                View
                              </Button>
                            )}
                            <Button
                              size="small"
                              variant={doc ? 'text' : 'contained'}
                              startIcon={<UploadFileOutlinedIcon sx={{ fontSize: '1rem !important' }} />}
                              onClick={() => handleUpload(tmpl)}
                              sx={{ textTransform: 'none', fontSize: '0.75rem', minHeight: 32 }}
                            >
                              {doc ? 'Re-upload' : 'Upload'}
                            </Button>
                          </Box>
                        )}
                      </Box>
                    </Paper>
                  );
                })}
              </Box>
            </Box>
          ))
        )
      )}

      <DocumentUploadSheet
        open={uploadOpen}
        template={selectedTemplate}
        classroomId={activeClassroom?.id || ''}
        onClose={() => setUploadOpen(false)}
        onUploaded={fetchAll}
      />
    </Box>
  );
}
