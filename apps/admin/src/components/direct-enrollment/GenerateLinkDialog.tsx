// @ts-nocheck
'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Box,
  Typography,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  MenuItem,
  Divider,
  CircularProgress,
  Alert,
  InputAdornment,
  Select,
} from '@neram/ui';
import CloseIcon from '@mui/icons-material/Close';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';
import { IconButton, Chip } from '@neram/ui';

interface FeeStructure {
  id: string;
  course_type: string;
  program_type: string;
  display_name: string;
  fee_amount: number;
  single_payment_discount: number;
}

interface GenerateLinkDialogProps {
  open: boolean;
  onClose: () => void;
  onSuccess: (link: any) => void;
  adminId: string;
  prefillData?: {
    studentName?: string;
    studentPhone?: string;
    studentEmail?: string;
    interestCourse?: string;
  };
}

const COUNTRY_PHONE_OPTIONS = [
  { code: 'IN', name: 'India', flag: '\u{1F1EE}\u{1F1F3}', prefix: '+91', placeholder: '9876543210', length: 10 },
  { code: 'AE', name: 'UAE', flag: '\u{1F1E6}\u{1F1EA}', prefix: '+971', placeholder: '501234567', length: 9 },
  { code: 'SA', name: 'Saudi Arabia', flag: '\u{1F1F8}\u{1F1E6}', prefix: '+966', placeholder: '512345678', length: 9 },
  { code: 'QA', name: 'Qatar', flag: '\u{1F1F6}\u{1F1E6}', prefix: '+974', placeholder: '55123456', length: 8 },
  { code: 'OM', name: 'Oman', flag: '\u{1F1F4}\u{1F1F2}', prefix: '+968', placeholder: '92123456', length: 8 },
];

const COURSE_OPTIONS = [
  { value: 'nata', label: 'NATA' },
  { value: 'jee_paper2', label: 'JEE Paper 2' },
  { value: 'both', label: 'NATA + JEE Paper 2' },
];

const LEARNING_MODE_OPTIONS = [
  { value: 'hybrid', label: 'Hybrid' },
  { value: 'online_only', label: 'Online' },
];

const PAYMENT_METHOD_OPTIONS = [
  { value: 'upi_direct', label: 'UPI Direct' },
  { value: 'bank_transfer', label: 'Bank Transfer' },
  { value: 'cash', label: 'Cash' },
];

const getToday = () => new Date().toISOString().split('T')[0];

// Consistent height for all form fields (except multiline)
const FIELD_HEIGHT_SX = { '& .MuiInputBase-root': { height: 40 } };

export default function GenerateLinkDialog({
  open,
  onClose,
  onSuccess,
  adminId,
  prefillData,
}: GenerateLinkDialogProps) {
  // Student info
  const [studentName, setStudentName] = useState('');
  const [phoneCountry, setPhoneCountry] = useState('IN');
  const [studentPhone, setStudentPhone] = useState('');
  const [studentEmail, setStudentEmail] = useState('');

  // Course selection
  const [interestCourse, setInterestCourse] = useState('nata');
  const [courseId, setCourseId] = useState('');
  const [batchId, setBatchId] = useState('');
  const [learningMode, setLearningMode] = useState('hybrid');

  // Fee
  const [totalFee, setTotalFee] = useState<number>(0);
  const [discountAmount, setDiscountAmount] = useState<number>(0);
  const [finalFee, setFinalFee] = useState<number>(0);

  // Payment
  const [amountPaid, setAmountPaid] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState('upi_direct');
  const [transactionReference, setTransactionReference] = useState('');
  const [paymentDate, setPaymentDate] = useState(getToday());

  // Notes
  const [adminNotes, setAdminNotes] = useState('');

  // Payment proof
  const [paymentProofFile, setPaymentProofFile] = useState<File | null>(null);
  const [uploadingProof, setUploadingProof] = useState(false);

  // Data
  const [feeStructures, setFeeStructures] = useState<FeeStructure[]>([]);
  const [batches, setBatches] = useState<any[]>([]);

  // State
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Batch creation mini-dialog
  const [showCreateBatch, setShowCreateBatch] = useState(false);
  const [newBatchName, setNewBatchName] = useState('');
  const [newBatchStartDate, setNewBatchStartDate] = useState(getToday());
  const [creatingBatch, setCreatingBatch] = useState(false);

  // Track previous finalFee for auto-fill logic
  const prevFinalFeeRef = useRef<number>(0);

  // Fetch fee structures
  useEffect(() => {
    if (!open) return;
    const fetchFeeStructures = async () => {
      try {
        const res = await fetch('/api/fee-structures?isActive=true');
        if (res.ok) {
          const data = await res.json();
          setFeeStructures(data.data || []);
        }
      } catch {
        // Silent fail
      }
    };
    fetchFeeStructures();
  }, [open]);

  // Fetch batches
  const fetchBatches = useCallback(async () => {
    try {
      const res = await fetch('/api/batches?isActive=true');
      if (res.ok) {
        const data = await res.json();
        setBatches(data.data || data.batches || []);
      }
    } catch {
      // Silent fail
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    fetchBatches();
  }, [open, fetchBatches]);

  // Apply prefill data
  useEffect(() => {
    if (open && prefillData) {
      if (prefillData.studentName) setStudentName(prefillData.studentName);
      if (prefillData.studentPhone) setStudentPhone(prefillData.studentPhone);
      if (prefillData.studentEmail) setStudentEmail(prefillData.studentEmail);
      if (prefillData.interestCourse) setInterestCourse(prefillData.interestCourse);
    }
  }, [open, prefillData]);

  // Auto-fill fee when course selected
  useEffect(() => {
    if (courseId) {
      const selected = feeStructures.find((fs) => fs.id === courseId);
      if (selected) {
        setTotalFee(selected.fee_amount);
        setFinalFee(selected.fee_amount - discountAmount);
      }
    }
  }, [courseId, feeStructures]);

  // Recalculate final fee
  useEffect(() => {
    const calculated = Math.max(0, totalFee - discountAmount);
    setFinalFee(calculated);
  }, [totalFee, discountAmount]);

  // Auto-fill amountPaid when finalFee changes
  useEffect(() => {
    if (finalFee > 0) {
      const currentAmount = Number(amountPaid) || 0;
      // Auto-fill if empty or still matches previous final fee
      if (amountPaid === '' || currentAmount === 0 || currentAmount === prevFinalFeeRef.current) {
        setAmountPaid(String(finalFee));
      }
    }
    prevFinalFeeRef.current = finalFee;
  }, [finalFee]);

  const selectedCountry = COUNTRY_PHONE_OPTIONS.find((c) => c.code === phoneCountry) || COUNTRY_PHONE_OPTIONS[0];

  const resetForm = () => {
    setStudentName('');
    setPhoneCountry('IN');
    setStudentPhone('');
    setStudentEmail('');
    setInterestCourse('nata');
    setCourseId('');
    setBatchId('');
    setLearningMode('hybrid');
    setTotalFee(0);
    setDiscountAmount(0);
    setFinalFee(0);
    setAmountPaid('');
    setPaymentMethod('upi_direct');
    setTransactionReference('');
    setPaymentDate(getToday());
    setAdminNotes('');
    setPaymentProofFile(null);
    setError('');
    prevFinalFeeRef.current = 0;
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const handleSubmit = async () => {
    // Validation
    if (!studentName.trim()) {
      setError('Student name is required');
      return;
    }
    if (!interestCourse) {
      setError('Please select a course interest');
      return;
    }
    const amountPaidNum = Number(amountPaid) || 0;
    if (!amountPaidNum || amountPaidNum <= 0) {
      setError('Amount paid is required and must be greater than 0');
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      // Upload payment proof first if attached
      let paymentProofUrl: string | undefined;
      if (paymentProofFile) {
        setUploadingProof(true);
        const formData = new FormData();
        formData.append('file', paymentProofFile);
        const uploadRes = await fetch('/api/direct-enrollment/upload', {
          method: 'POST',
          body: formData,
        });
        if (!uploadRes.ok) {
          const errData = await uploadRes.json().catch(() => ({}));
          throw new Error(errData.error || 'Failed to upload payment proof');
        }
        const uploadData = await uploadRes.json();
        paymentProofUrl = uploadData.url;
        setUploadingProof(false);
      }

      // Build full phone with country prefix
      const fullPhone = studentPhone.trim()
        ? `${selectedCountry.prefix}${studentPhone.trim()}`
        : undefined;

      const res = await fetch('/api/direct-enrollment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          adminId,
          studentName: studentName.trim(),
          studentPhone: fullPhone,
          studentEmail: studentEmail.trim() || undefined,
          batchId: batchId || undefined,
          interestCourse,
          learningMode,
          totalFee,
          discountAmount,
          finalFee,
          amountPaid: amountPaidNum,
          paymentMethod,
          transactionReference: transactionReference.trim() || undefined,
          paymentDate: paymentDate || undefined,
          adminNotes: adminNotes.trim() || undefined,
          paymentProofUrl,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to create enrollment link');
      }

      const data = await res.json();
      resetForm();
      onSuccess(data.data);
    } catch (err: any) {
      setError(err.message || 'Failed to create enrollment link');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateBatch = async () => {
    if (!newBatchName.trim() || !newBatchStartDate) return;

    setCreatingBatch(true);
    try {
      // Find a course_id to associate with — use first matching fee structure or first available
      const matchingFs = feeStructures.find((fs) =>
        interestCourse === 'both' || fs.course_type === interestCourse || fs.course_type === 'both'
      );
      const courseIdForBatch = matchingFs?.id || courseId || undefined;

      const res = await fetch('/api/batches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newBatchName.trim(),
          course_id: courseIdForBatch,
          start_date: newBatchStartDate,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to create batch');
      }

      const data = await res.json();
      // Refresh batches and select the new one
      await fetchBatches();
      if (data.data?.id) {
        setBatchId(data.data.id);
      }
      setShowCreateBatch(false);
      setNewBatchName('');
      setNewBatchStartDate(getToday());
    } catch (err: any) {
      setError(err.message || 'Failed to create batch');
    } finally {
      setCreatingBatch(false);
    }
  };

  // Filter fee structures by interest course
  const filteredFeeStructures = feeStructures.filter((fs) => {
    if (interestCourse === 'both') return true;
    return fs.course_type === interestCourse || fs.course_type === 'both';
  });

  return (
    <>
      <Dialog
        open={open}
        onClose={handleClose}
        maxWidth="sm"
        fullWidth
        PaperProps={{ sx: { borderRadius: 2 } }}
      >
        <DialogTitle component="div" sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pb: 1 }}>
          <Typography variant="h6" fontWeight={700}>
            Generate Enrollment Link
          </Typography>
          <IconButton size="small" onClick={handleClose}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </DialogTitle>

        <DialogContent dividers sx={{ pt: 2 }}>
          {error && (
            <Alert severity="error" sx={{ mb: 2, borderRadius: 1 }}>
              {error}
            </Alert>
          )}

          {/* Student Info */}
          <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 1.5, color: 'text.secondary', textTransform: 'uppercase', fontSize: '0.7rem', letterSpacing: 1 }}>
            Student Information
          </Typography>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mb: 3 }}>
            <TextField
              label="Student Name"
              value={studentName}
              onChange={(e) => setStudentName(e.target.value)}
              required
              fullWidth
              size="small"
              placeholder="Full name of the student"
              sx={FIELD_HEIGHT_SX}
            />
            <Box sx={{ display: 'flex', gap: 2 }}>
              <TextField
                label="Phone"
                value={studentPhone}
                onChange={(e) => {
                  // Only allow digits
                  const val = e.target.value.replace(/\D/g, '');
                  if (val.length <= selectedCountry.length) {
                    setStudentPhone(val);
                  }
                }}
                fullWidth
                size="small"
                placeholder={selectedCountry.placeholder}
                inputProps={{ inputMode: 'numeric' }}
                sx={FIELD_HEIGHT_SX}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start" sx={{ mr: 0 }}>
                      <Select
                        value={phoneCountry}
                        onChange={(e) => {
                          setPhoneCountry(e.target.value);
                          setStudentPhone('');
                        }}
                        variant="standard"
                        disableUnderline
                        sx={{
                          minWidth: 80,
                          '& .MuiSelect-select': {
                            py: 0,
                            pr: '16px !important',
                            fontSize: '0.875rem',
                          },
                        }}
                        renderValue={(val) => {
                          const c = COUNTRY_PHONE_OPTIONS.find((x) => x.code === val);
                          return c ? `${c.flag} ${c.prefix}` : val;
                        }}
                      >
                        {COUNTRY_PHONE_OPTIONS.map((c) => (
                          <MenuItem key={c.code} value={c.code}>
                            {c.flag} {c.name} ({c.prefix})
                          </MenuItem>
                        ))}
                      </Select>
                    </InputAdornment>
                  ),
                }}
              />
              <TextField
                label="Email"
                value={studentEmail}
                onChange={(e) => setStudentEmail(e.target.value)}
                fullWidth
                size="small"
                placeholder="student@email.com"
                type="email"
                sx={FIELD_HEIGHT_SX}
              />
            </Box>
          </Box>

          <Divider sx={{ mb: 2 }} />

          {/* Course Selection */}
          <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 1.5, color: 'text.secondary', textTransform: 'uppercase', fontSize: '0.7rem', letterSpacing: 1 }}>
            Course Details
          </Typography>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mb: 3 }}>
            <TextField
              select
              label="Interest Course"
              value={interestCourse}
              onChange={(e) => { setInterestCourse(e.target.value); setCourseId(''); }}
              fullWidth
              size="small"
              required
              sx={FIELD_HEIGHT_SX}
            >
              {COURSE_OPTIONS.map((opt) => (
                <MenuItem key={opt.value} value={opt.value}>
                  {opt.label}
                </MenuItem>
              ))}
            </TextField>
            <Box sx={{ display: 'flex', gap: 2 }}>
              <TextField
                select
                label="Course / Fee Structure"
                value={courseId}
                onChange={(e) => setCourseId(e.target.value)}
                fullWidth
                size="small"
                sx={FIELD_HEIGHT_SX}
              >
                <MenuItem value="">-- Select (optional) --</MenuItem>
                {filteredFeeStructures.map((fs) => (
                  <MenuItem key={fs.id} value={fs.id}>
                    {fs.display_name} - {`\u20B9${fs.fee_amount.toLocaleString('en-IN')}`}
                  </MenuItem>
                ))}
              </TextField>
              <Box sx={{ display: 'flex', gap: 0.5, flex: 1, minWidth: 0 }}>
                <TextField
                  select
                  label="Batch"
                  value={batchId}
                  onChange={(e) => setBatchId(e.target.value)}
                  fullWidth
                  size="small"
                  sx={FIELD_HEIGHT_SX}
                >
                  <MenuItem value="">-- Select (optional) --</MenuItem>
                  {batches.map((b: any) => (
                    <MenuItem key={b.id} value={b.id}>
                      {b.name}
                    </MenuItem>
                  ))}
                </TextField>
                <IconButton
                  size="small"
                  onClick={() => setShowCreateBatch(true)}
                  title="Create New Batch"
                  sx={{
                    mt: '4px',
                    border: '1px solid',
                    borderColor: 'divider',
                    borderRadius: 1,
                    width: 40,
                    height: 40,
                    flexShrink: 0,
                  }}
                >
                  <AddIcon fontSize="small" />
                </IconButton>
              </Box>
            </Box>
            <TextField
              select
              label="Learning Mode"
              value={learningMode}
              onChange={(e) => setLearningMode(e.target.value)}
              fullWidth
              size="small"
              sx={FIELD_HEIGHT_SX}
            >
              {LEARNING_MODE_OPTIONS.map((opt) => (
                <MenuItem key={opt.value} value={opt.value}>
                  {opt.label}
                </MenuItem>
              ))}
            </TextField>
          </Box>

          <Divider sx={{ mb: 2 }} />

          {/* Fee Details */}
          <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 1.5, color: 'text.secondary', textTransform: 'uppercase', fontSize: '0.7rem', letterSpacing: 1 }}>
            Fee Details
          </Typography>
          <Box sx={{ display: 'flex', gap: 2, mb: 3 }}>
            <TextField
              label="Total Fee"
              value={totalFee || ''}
              onChange={(e) => setTotalFee(Number(e.target.value) || 0)}
              fullWidth
              size="small"
              type="number"
              sx={FIELD_HEIGHT_SX}
              InputProps={{
                startAdornment: <InputAdornment position="start">{'\u20B9'}</InputAdornment>,
              }}
            />
            <TextField
              label="Discount"
              value={discountAmount || ''}
              onChange={(e) => setDiscountAmount(Number(e.target.value) || 0)}
              fullWidth
              size="small"
              type="number"
              sx={FIELD_HEIGHT_SX}
              InputProps={{
                startAdornment: <InputAdornment position="start">{'\u20B9'}</InputAdornment>,
              }}
            />
            <TextField
              label="Final Fee"
              value={finalFee || ''}
              fullWidth
              size="small"
              type="number"
              sx={{ ...FIELD_HEIGHT_SX, '& .MuiInputBase-root': { ...FIELD_HEIGHT_SX['& .MuiInputBase-root'], bgcolor: 'grey.50' } }}
              InputProps={{
                readOnly: true,
                startAdornment: <InputAdornment position="start">{'\u20B9'}</InputAdornment>,
              }}
            />
          </Box>

          <Divider sx={{ mb: 2 }} />

          {/* Payment Details */}
          <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 1.5, color: 'text.secondary', textTransform: 'uppercase', fontSize: '0.7rem', letterSpacing: 1 }}>
            Payment Details
          </Typography>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mb: 3 }}>
            <Box sx={{ display: 'flex', gap: 2 }}>
              <TextField
                label="Amount Paid"
                value={amountPaid}
                onChange={(e) => {
                  const val = e.target.value;
                  // Allow empty or valid numbers only
                  if (val === '' || /^\d*\.?\d*$/.test(val)) {
                    setAmountPaid(val);
                  }
                }}
                fullWidth
                size="small"
                required
                placeholder="Enter amount"
                inputProps={{ inputMode: 'numeric' }}
                sx={FIELD_HEIGHT_SX}
                InputProps={{
                  startAdornment: <InputAdornment position="start">{'\u20B9'}</InputAdornment>,
                }}
              />
              <TextField
                select
                label="Payment Method"
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                fullWidth
                size="small"
                sx={FIELD_HEIGHT_SX}
              >
                {PAYMENT_METHOD_OPTIONS.map((opt) => (
                  <MenuItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </MenuItem>
                ))}
              </TextField>
            </Box>
            <Box sx={{ display: 'flex', gap: 2 }}>
              <TextField
                label="Transaction Reference"
                value={transactionReference}
                onChange={(e) => setTransactionReference(e.target.value)}
                fullWidth
                size="small"
                placeholder="UTR / Reference number"
                sx={FIELD_HEIGHT_SX}
              />
              <TextField
                label="Payment Date"
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
                fullWidth
                size="small"
                type="date"
                InputLabelProps={{ shrink: true }}
                sx={FIELD_HEIGHT_SX}
              />
            </Box>

            {/* Payment Proof Upload */}
            {!paymentProofFile ? (
              <Button
                component="label"
                variant="outlined"
                fullWidth
                startIcon={<CloudUploadIcon />}
                sx={{
                  borderRadius: 1,
                  textTransform: 'none',
                  borderStyle: 'dashed',
                  color: 'text.secondary',
                  py: 1.2,
                }}
              >
                Attach Payment Proof (optional)
                <input
                  type="file"
                  hidden
                  accept="image/jpeg,image/png,image/webp,application/pdf"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      if (file.size > 5 * 1024 * 1024) {
                        setError('File too large. Maximum 5MB.');
                        return;
                      }
                      setPaymentProofFile(file);
                    }
                  }}
                />
              </Button>
            ) : (
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1,
                  p: 1,
                  border: '1px solid',
                  borderColor: 'success.light',
                  borderRadius: 1,
                  bgcolor: 'success.50',
                }}
              >
                <InsertDriveFileIcon color="success" fontSize="small" />
                <Typography variant="body2" sx={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {paymentProofFile.name}
                </Typography>
                <Chip
                  label={`${(paymentProofFile.size / 1024).toFixed(0)} KB`}
                  size="small"
                  variant="outlined"
                />
                <IconButton size="small" onClick={() => setPaymentProofFile(null)}>
                  <DeleteIcon fontSize="small" />
                </IconButton>
              </Box>
            )}
          </Box>

          <Divider sx={{ mb: 2 }} />

          {/* Admin Notes */}
          <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 1.5, color: 'text.secondary', textTransform: 'uppercase', fontSize: '0.7rem', letterSpacing: 1 }}>
            Notes
          </Typography>
          <TextField
            label="Admin Notes"
            value={adminNotes}
            onChange={(e) => setAdminNotes(e.target.value)}
            fullWidth
            size="small"
            multiline
            rows={3}
            placeholder="Any additional notes about this enrollment..."
          />
        </DialogContent>

        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button
            onClick={handleClose}
            disabled={submitting}
            sx={{ borderRadius: 1, textTransform: 'none' }}
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleSubmit}
            disabled={submitting || !adminId}
            startIcon={submitting ? <CircularProgress size={16} /> : null}
            sx={{ borderRadius: 1, fontWeight: 600, textTransform: 'none', minWidth: 160 }}
          >
            {submitting ? (uploadingProof ? 'Uploading proof...' : 'Generating...') : 'Generate Link'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Create Batch Mini Dialog */}
      <Dialog
        open={showCreateBatch}
        onClose={() => setShowCreateBatch(false)}
        maxWidth="xs"
        fullWidth
        PaperProps={{ sx: { borderRadius: 2 } }}
      >
        <DialogTitle component="div" sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pb: 1 }}>
          <Typography variant="subtitle1" fontWeight={700}>
            Create New Batch
          </Typography>
          <IconButton size="small" onClick={() => setShowCreateBatch(false)}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </DialogTitle>
        <DialogContent sx={{ pt: 2 }}>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <TextField
              label="Batch Name"
              value={newBatchName}
              onChange={(e) => setNewBatchName(e.target.value)}
              fullWidth
              size="small"
              required
              placeholder="e.g. NATA 2026 - Batch A"
              sx={FIELD_HEIGHT_SX}
            />
            <TextField
              label="Start Date"
              value={newBatchStartDate}
              onChange={(e) => setNewBatchStartDate(e.target.value)}
              fullWidth
              size="small"
              type="date"
              required
              InputLabelProps={{ shrink: true }}
              sx={FIELD_HEIGHT_SX}
            />
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button
            onClick={() => setShowCreateBatch(false)}
            disabled={creatingBatch}
            sx={{ borderRadius: 1, textTransform: 'none' }}
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleCreateBatch}
            disabled={creatingBatch || !newBatchName.trim() || !newBatchStartDate}
            startIcon={creatingBatch ? <CircularProgress size={16} /> : <AddIcon />}
            sx={{ borderRadius: 1, fontWeight: 600, textTransform: 'none' }}
          >
            {creatingBatch ? 'Creating...' : 'Create Batch'}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
