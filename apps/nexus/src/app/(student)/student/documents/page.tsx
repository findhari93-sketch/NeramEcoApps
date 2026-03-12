'use client';

import { useState, useEffect, useRef } from 'react';
import {
  Box,
  Typography,
  Paper,
  Chip,
  Skeleton,
  Button,
  TextField,
  MenuItem,
} from '@neram/ui';
import UploadFileOutlinedIcon from '@mui/icons-material/UploadFileOutlined';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import CheckCircleOutlinedIcon from '@mui/icons-material/CheckCircleOutlined';
import PendingOutlinedIcon from '@mui/icons-material/PendingOutlined';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';

interface Document {
  id: string;
  category: string;
  title: string;
  file_url: string;
  file_type: string | null;
  uploaded_at: string;
  status: string;
  notes: string | null;
}

const CATEGORIES = [
  { value: 'aadhaar', label: 'Aadhaar Card' },
  { value: 'marksheet', label: 'Marksheet' },
  { value: 'hall_ticket', label: 'Hall Ticket' },
  { value: 'photo', label: 'Passport Photo' },
  { value: 'other', label: 'Other' },
];

export default function StudentDocuments() {
  const { activeClassroom, getToken } = useNexusAuthContext();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [showUpload, setShowUpload] = useState(false);
  const [category, setCategory] = useState('other');
  const [title, setTitle] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!activeClassroom) return;
    fetchDocuments();
  }, [activeClassroom]);

  async function fetchDocuments() {
    setLoading(true);
    try {
      const token = await getToken();
      if (!token) return;

      const res = await fetch(
        `/api/documents?classroom=${activeClassroom!.id}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (res.ok) {
        const data = await res.json();
        setDocuments(data.documents || []);
      }
    } catch (err) {
      console.error('Failed to load documents:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleUpload() {
    if (!file || !title.trim()) return;
    setUploading(true);
    try {
      const token = await getToken();
      if (!token) return;

      // Upload file first
      const formData = new FormData();
      formData.append('file', file);
      formData.append('exercise_id', `doc-${category}`);

      const uploadRes = await fetch('/api/drawings/upload', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      if (!uploadRes.ok) throw new Error('Upload failed');
      const uploadData = await uploadRes.json();

      // Create document record
      const res = await fetch('/api/documents', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          classroom_id: activeClassroom!.id,
          category,
          title: title.trim(),
          file_url: uploadData.url,
          file_type: file.type,
        }),
      });

      if (res.ok) {
        setFile(null);
        setTitle('');
        setCategory('other');
        setShowUpload(false);
        fetchDocuments();
      }
    } catch (err) {
      console.error('Failed to upload document:', err);
    } finally {
      setUploading(false);
    }
  }

  const statusIcon = (status: string) => {
    if (status === 'verified') return <CheckCircleOutlinedIcon sx={{ fontSize: 18, color: 'success.main' }} />;
    return <PendingOutlinedIcon sx={{ fontSize: 18, color: 'info.main' }} />;
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
        <Typography variant="h6" component="h1" sx={{ fontWeight: 700 }}>
          My Documents
        </Typography>
        <Button
          variant="contained"
          size="small"
          startIcon={<UploadFileOutlinedIcon />}
          onClick={() => setShowUpload(true)}
          sx={{ textTransform: 'none', minHeight: 36 }}
        >
          Upload
        </Button>
      </Box>

      {/* Upload form */}
      {showUpload && (
        <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
          <Typography variant="body2" fontWeight={600} sx={{ mb: 1.5 }}>
            Upload Document
          </Typography>
          <TextField
            select
            label="Category"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            size="small"
            fullWidth
            sx={{ mb: 1.5 }}
          >
            {CATEGORIES.map((c) => (
              <MenuItem key={c.value} value={c.value}>{c.label}</MenuItem>
            ))}
          </TextField>
          <TextField
            label="Document Name"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            size="small"
            fullWidth
            sx={{ mb: 1.5 }}
          />
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,.pdf"
            style={{ display: 'none' }}
            onChange={(e) => setFile(e.target.files?.[0] || null)}
          />
          <Button
            variant="outlined"
            fullWidth
            onClick={() => fileInputRef.current?.click()}
            sx={{ mb: 1.5, textTransform: 'none', minHeight: 48 }}
          >
            {file ? file.name : 'Choose File'}
          </Button>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button variant="outlined" size="small" onClick={() => setShowUpload(false)} sx={{ textTransform: 'none' }}>
              Cancel
            </Button>
            <Button
              variant="contained"
              size="small"
              onClick={handleUpload}
              disabled={uploading || !file || !title.trim()}
              sx={{ textTransform: 'none' }}
            >
              {uploading ? 'Uploading...' : 'Upload'}
            </Button>
          </Box>
        </Paper>
      )}

      {loading ? (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {[1, 2].map((i) => (
            <Skeleton key={i} variant="rectangular" height={64} sx={{ borderRadius: 1 }} />
          ))}
        </Box>
      ) : documents.length === 0 ? (
        <Paper sx={{ p: 3, textAlign: 'center' }}>
          <DescriptionOutlinedIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
          <Typography variant="body2" color="text.secondary">
            No documents uploaded yet.
          </Typography>
        </Paper>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {documents.map((doc) => (
            <Paper key={doc.id} variant="outlined" sx={{ p: 2, display: 'flex', alignItems: 'center', gap: 1.5 }}>
              {statusIcon(doc.status)}
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography variant="body2" fontWeight={600} noWrap>
                  {doc.title}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {CATEGORIES.find((c) => c.value === doc.category)?.label || doc.category}
                </Typography>
              </Box>
              <Chip
                label={doc.status}
                size="small"
                color={doc.status === 'verified' ? 'success' : doc.status === 'rejected' ? 'error' : 'default'}
                sx={{ textTransform: 'capitalize' }}
              />
            </Paper>
          ))}
        </Box>
      )}
    </Box>
  );
}
