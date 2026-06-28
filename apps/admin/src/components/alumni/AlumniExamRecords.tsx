'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Box,
  Typography,
  Button,
  IconButton,
  Switch,
  FormControlLabel,
  TextField,
  MenuItem,
  Tooltip,
  Link,
  CircularProgress,
  Divider,
  Alert,
} from '@neram/ui';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import SwapHorizIcon from '@mui/icons-material/SwapHoriz';
import AddIcon from '@mui/icons-material/Add';
import AssignmentOutlinedIcon from '@mui/icons-material/AssignmentOutlined';
import { INK, MUTED, LINE, ACCENT, ACCENT_SOFT } from './theme';
import {
  type ExamKey,
  type DocKind,
  EXAM_LABELS,
  DOC_KIND_LABELS,
  maxAttempts,
  examDocCategory,
  examDocTitle,
  CUSTOM_DOC_CATEGORY,
} from '@/lib/examDocuments';

const MAX_FILE_MB = 10;
const ACCEPT = 'image/*,.pdf';
const EXAMS: ExamKey[] = ['nata', 'jee'];

interface AlumniExamRecordsProps {
  userId: string;
  adminId: string | null;
  /** The alumni_profiles row (may be null until first save). */
  profile: any | null;
  /** student_documents rows for this user (newest first). */
  documents?: any[] | null;
  variant: 'full' | 'summary';
  /** Host refetch so the panel re-renders from fresh server data after a change. */
  onChanged?: () => void;
}

function findDoc(documents: any[], category: string): any | null {
  // documents arrive newest-first, so the first match is the current file for a slot.
  return documents.find((d) => d.category === category) || null;
}

export default function AlumniExamRecords({
  userId,
  adminId,
  profile,
  documents,
  variant,
  onChanged,
}: AlumniExamRecordsProps) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [customName, setCustomName] = useState('');

  const docs: any[] = documents || [];
  const attempted: Record<ExamKey, boolean> = {
    nata: !!profile?.attempted_nata,
    jee: !!profile?.attempted_jee,
  };
  const counts: Record<ExamKey, number> = {
    nata: Math.max(1, Number(profile?.nata_attempt_count || 1)),
    jee: Math.max(1, Number(profile?.jee_attempt_count || 1)),
  };
  const customDocs = docs.filter((d) => d.category === CUSTOM_DOC_CATEGORY);

  // ---- mutations (auto-save; each refreshes the host on success) ----

  const saveFields = async (fields: Record<string, unknown>, key: string) => {
    if (!adminId) {
      setError('Admin session not ready, try again in a moment.');
      return;
    }
    setBusy(key);
    setError(null);
    try {
      const res = await fetch(`/api/crm/alumni/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields, adminId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save');
      onChanged?.();
    } catch (e: any) {
      setError(e?.message || 'Failed to save');
    } finally {
      setBusy(null);
    }
  };

  const uploadDoc = async (
    file: File,
    category: string,
    title: string,
    key: string,
    replaceDocId?: string | null,
  ) => {
    if (!adminId) {
      setError('Admin session not ready, try again in a moment.');
      return;
    }
    if (file.size > MAX_FILE_MB * 1024 * 1024) {
      setError(`File must be under ${MAX_FILE_MB}MB.`);
      return;
    }
    setBusy(key);
    setError(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('title', title);
      fd.append('category', category);
      fd.append('adminId', adminId);
      const res = await fetch(`/api/crm/alumni/${userId}/documents`, { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upload failed');
      // The new file is saved; drop the previous one in this slot (best-effort).
      if (replaceDocId) {
        await fetch(`/api/crm/alumni/${userId}/documents?docId=${replaceDocId}`, { method: 'DELETE' }).catch(() => {});
      }
      onChanged?.();
    } catch (e: any) {
      setError(e?.message || 'Upload failed');
    } finally {
      setBusy(null);
    }
  };

  const deleteDoc = async (docId: string, key: string) => {
    setBusy(key);
    setError(null);
    try {
      const res = await fetch(`/api/crm/alumni/${userId}/documents?docId=${docId}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Delete failed');
      onChanged?.();
    } catch (e: any) {
      setError(e?.message || 'Delete failed');
    } finally {
      setBusy(null);
    }
  };

  const toggleExam = (exam: ExamKey, checked: boolean) => {
    const fields: Record<string, unknown> = {};
    fields[exam === 'nata' ? 'attempted_nata' : 'attempted_jee'] = checked;
    if (checked && counts[exam] < 1) {
      fields[exam === 'nata' ? 'nata_attempt_count' : 'jee_attempt_count'] = 1;
    }
    saveFields(fields, `toggle_${exam}`);
  };

  const changeCount = (exam: ExamKey, next: number) => {
    const cur = counts[exam];
    if (next < cur) {
      // Reducing attempts would hide slots that still hold files. Never auto-delete: name them.
      const orphaned: string[] = [];
      for (let a = next + 1; a <= cur; a++) {
        (['admit', 'score'] as DocKind[]).forEach((kind) => {
          if (findDoc(docs, examDocCategory(exam, a, kind))) {
            orphaned.push(examDocTitle(exam, a, kind));
          }
        });
      }
      if (orphaned.length) {
        setError(`Delete these before reducing attempts: ${orphaned.join(', ')}.`);
        return;
      }
    }
    saveFields({ [exam === 'nata' ? 'nata_attempt_count' : 'jee_attempt_count']: next }, `count_${exam}`);
  };

  // ---- summary variant (drawer) ----

  if (variant === 'summary') {
    const examLine = (exam: ExamKey): string => {
      if (!attempted[exam]) return `${EXAM_LABELS[exam]}: not attempted`;
      const count = counts[exam];
      let n = 0;
      for (let a = 1; a <= count; a++) {
        (['admit', 'score'] as DocKind[]).forEach((kind) => {
          if (findDoc(docs, examDocCategory(exam, a, kind))) n += 1;
        });
      }
      return `${EXAM_LABELS[exam]}: ${count} attempt${count > 1 ? 's' : ''}, ${n} document${n === 1 ? '' : 's'}`;
    };

    const anything = attempted.nata || attempted.jee || customDocs.length > 0;
    return (
      <Box sx={{ mb: 2 }}>
        {anything ? (
          <>
            {EXAMS.map((exam) => (
              <Typography key={exam} variant="body2" color={INK}>
                {examLine(exam)}
              </Typography>
            ))}
            {customDocs.length > 0 && (
              <Typography variant="body2" color={INK}>
                Other documents: {customDocs.length}
              </Typography>
            )}
          </>
        ) : (
          <Typography variant="body2" sx={{ color: MUTED }}>
            No exam records yet.
          </Typography>
        )}
        <Button
          size="small"
          startIcon={<AssignmentOutlinedIcon />}
          onClick={() => router.push(`/alumni/${userId}`)}
          sx={{ textTransform: 'none', mt: 0.5, color: ACCENT, pl: 0 }}
        >
          Open exam records
        </Button>
      </Box>
    );
  }

  // ---- full variant (profile page editor) ----

  const renderSlot = (exam: ExamKey, attempt: number, kind: DocKind) => {
    const category = examDocCategory(exam, attempt, kind);
    const doc = findDoc(docs, category);
    const isBusy = busy === category;
    return (
      <Box key={category} sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.5, flexWrap: 'wrap' }}>
        <Box sx={{ width: 88, flexShrink: 0 }}>
          <Typography variant="caption" sx={{ color: MUTED, fontWeight: 600 }}>
            {DOC_KIND_LABELS[kind]}
          </Typography>
        </Box>
        {doc ? (
          <>
            <Button
              size="small"
              component={Link}
              href={doc.file_url}
              target="_blank"
              rel="noopener"
              endIcon={<OpenInNewIcon />}
              sx={{ textTransform: 'none' }}
            >
              View
            </Button>
            <Button
              size="small"
              component="label"
              disabled={isBusy}
              startIcon={isBusy ? <CircularProgress size={14} /> : <SwapHorizIcon />}
              sx={{ textTransform: 'none', color: MUTED }}
            >
              Replace
              <input
                hidden
                type="file"
                accept={ACCEPT}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) uploadDoc(f, category, examDocTitle(exam, attempt, kind), category, doc.id);
                  e.target.value = '';
                }}
              />
            </Button>
            <Tooltip title="Delete">
              <span>
                <IconButton size="small" disabled={isBusy} onClick={() => deleteDoc(doc.id, category)}>
                  <DeleteOutlineIcon fontSize="small" />
                </IconButton>
              </span>
            </Tooltip>
          </>
        ) : (
          <Button
            size="small"
            component="label"
            variant="outlined"
            disabled={isBusy}
            startIcon={isBusy ? <CircularProgress size={14} /> : <UploadFileIcon />}
            sx={{ textTransform: 'none', borderColor: LINE, color: INK }}
          >
            Upload
            <input
              hidden
              type="file"
              accept={ACCEPT}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) uploadDoc(f, category, examDocTitle(exam, attempt, kind), category);
                e.target.value = '';
              }}
            />
          </Button>
        )}
      </Box>
    );
  };

  const renderExamBlock = (exam: ExamKey) => {
    const count = counts[exam];
    return (
      <Box key={exam} sx={{ mb: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, flexWrap: 'wrap' }}>
          <FormControlLabel
            control={
              <Switch
                checked={attempted[exam]}
                disabled={busy === `toggle_${exam}`}
                onChange={(e) => toggleExam(exam, e.target.checked)}
              />
            }
            label={
              <Typography variant="body2" fontWeight={700} color={INK}>
                {EXAM_LABELS[exam]}
              </Typography>
            }
          />
          {attempted[exam] && (
            <TextField
              select
              size="small"
              label="Attempts"
              value={count}
              disabled={busy === `count_${exam}`}
              onChange={(e) => changeCount(exam, parseInt(e.target.value, 10))}
              sx={{ width: 120 }}
            >
              {Array.from({ length: maxAttempts(exam) }, (_, i) => i + 1).map((n) => (
                <MenuItem key={n} value={n}>
                  {n}
                </MenuItem>
              ))}
            </TextField>
          )}
        </Box>
        {attempted[exam] && (
          <Box sx={{ mt: 0.5 }}>
            {Array.from({ length: count }, (_, i) => i + 1).map((attempt) => (
              <Box
                key={attempt}
                sx={{ mb: 1, pl: 1.5, borderLeft: '2px solid', borderColor: ACCENT_SOFT }}
              >
                <Typography variant="caption" sx={{ color: ACCENT, fontWeight: 700 }}>
                  Attempt {attempt}
                </Typography>
                {renderSlot(exam, attempt, 'admit')}
                {renderSlot(exam, attempt, 'score')}
              </Box>
            ))}
          </Box>
        )}
      </Box>
    );
  };

  return (
    <Box>
      <Typography variant="caption" sx={{ color: MUTED, display: 'block', mb: 1.5 }}>
        Mark which exams this student attempted, then upload the admit card and scorecard for each attempt.
        Nothing here is required, capture whatever the student can share.
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 1.5 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {EXAMS.map((exam) => renderExamBlock(exam))}

      <Divider sx={{ my: 1.5 }} />

      <Typography variant="body2" fontWeight={700} color={INK} sx={{ mb: 0.5 }}>
        Other documents
      </Typography>
      <Typography variant="caption" sx={{ color: MUTED, display: 'block', mb: 1 }}>
        Anything else worth keeping (board marksheet, counseling letter, ID). Give it a name so staff know what it is.
      </Typography>

      {customDocs.length > 0 && (
        <Box sx={{ mb: 1 }}>
          {customDocs.map((d) => (
            <Box key={d.id} sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.5 }}>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography variant="body2" color={INK} noWrap>
                  {d.title || 'Document'}
                </Typography>
              </Box>
              <Button
                size="small"
                component={Link}
                href={d.file_url}
                target="_blank"
                rel="noopener"
                endIcon={<OpenInNewIcon />}
                sx={{ textTransform: 'none' }}
              >
                View
              </Button>
              <Tooltip title="Delete">
                <span>
                  <IconButton
                    size="small"
                    disabled={busy === `custom_${d.id}`}
                    onClick={() => deleteDoc(d.id, `custom_${d.id}`)}
                  >
                    <DeleteOutlineIcon fontSize="small" />
                  </IconButton>
                </span>
              </Tooltip>
            </Box>
          ))}
        </Box>
      )}

      <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
        <TextField
          size="small"
          placeholder="Document name (e.g. Board marksheet)"
          value={customName}
          onChange={(e) => setCustomName(e.target.value)}
          sx={{ flex: 1, minWidth: 200 }}
        />
        <Button
          component="label"
          variant="outlined"
          disabled={!customName.trim() || busy === 'custom_add'}
          startIcon={busy === 'custom_add' ? <CircularProgress size={14} /> : <AddIcon />}
          sx={{ textTransform: 'none', borderColor: LINE, color: INK, whiteSpace: 'nowrap' }}
        >
          Add document
          <input
            hidden
            type="file"
            accept={ACCEPT}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f && customName.trim()) {
                uploadDoc(f, CUSTOM_DOC_CATEGORY, customName.trim(), 'custom_add');
                setCustomName('');
              }
              e.target.value = '';
            }}
          />
        </Button>
      </Box>
    </Box>
  );
}
