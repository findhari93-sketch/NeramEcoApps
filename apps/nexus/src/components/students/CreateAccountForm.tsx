'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  InputAdornment,
  LinearProgress,
  MenuItem,
  Skeleton,
  TextField,
  Typography,
  alpha,
} from '@neram/ui';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import KeyOutlinedIcon from '@mui/icons-material/KeyOutlined';
import { startYearOf } from '@neram/database';
import StudentAvatar from './StudentAvatar';
import AccountShareCard from './AccountShareCard';
import type { DuplicateCandidate } from './DuplicateConfirmSheet';
import type { AccountSteps } from '@/lib/student-account-provisioning';
import {
  isValidUsername,
  normalizeIndianMobile,
  normalizeUsername,
  suggestUsername,
} from '@/lib/student-account-rules';
import { SETTABLE_STAGES, STAGE_LABEL, examYearDescription } from '@/lib/student-stage';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';

const REASON_LABEL: Record<DuplicateCandidate['reason'], string> = {
  phone: 'Same phone number',
  email: 'Same email address',
  name: 'Same first name',
};

export interface AccountPrefill {
  /** The roster record the account is for. */
  attachToUserId: string;
  name: string;
  firstName: string;
  lastName: string;
}

interface LicenseOption {
  skuId: string;
  skuPartNumber: string | null;
  name: string;
  free: number | null;
}

interface Readiness {
  ready: boolean;
  canResetPassword: boolean;
  connection: { message: string; fix?: string } | null;
  missing: string[];
  optionalMissing: string[];
  domain: string;
  license:
    | (LicenseOption & { mode: 'direct' | 'group'; groupId: string | null; source: 'saved' | 'detected' | null })
    | null;
  skus: LicenseOption[];
}

interface Preview {
  username: string;
  upn: string | null;
  valid: boolean;
  available: boolean | null;
  availabilityError: string | null;
  candidates: DuplicateCandidate[];
  record: { phone: string | null; personalEmail: string | null; hasMicrosoft: boolean } | null;
}

interface CreatedAccount {
  upn: string;
  password: string;
  firstName: string;
  phone: string | null;
  steps: AccountSteps;
}

export interface CreateAccountFormProps {
  classroomId: string;
  getToken: () => Promise<string | null>;
  examYears: string[];
  currentBatch: string | null;
  batches: { id: string; name: string }[];
  prefill?: AccountPrefill | null;
  /** Offered while the setup is not ready. Omit where there is no other route. */
  onUseExisting?: () => void;
  /** An account now exists; refresh whatever lists students. */
  onCreated: () => void;
  /** Staff are finished with the result screen. */
  onDone: () => void;
  /** True while a password is on screen that nobody has copied or sent. */
  onPendingPasswordChange?: (pending: boolean) => void;
  /** The pause after typing before the login ID is checked. Tests pass 0. */
  previewDelayMs?: number;
}

async function send(getToken: () => Promise<string | null>, url: string, init: RequestInit = {}) {
  const token = await getToken();
  const res = await fetch(url, {
    ...init,
    headers: {
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  const data = await res.json().catch(() => null);
  return { res, data };
}

function emptyPreview(username: string): Preview {
  return { username, upn: null, valid: true, available: null, availabilityError: null, candidates: [], record: null };
}

/**
 * Create a student's @neramclasses.com account without leaving Nexus.
 *
 * Asks the server whether Azure is set up before showing a single field, so a
 * missing permission is named up front instead of failing mid-create. Then the
 * details a teacher already has on WhatsApp, one field per row on a phone, with
 * the login ID worked out and checked as they type, and the same-student question
 * asked before anything is created.
 */
export default function CreateAccountForm({
  classroomId,
  getToken,
  examYears,
  currentBatch,
  batches,
  prefill,
  onUseExisting,
  onCreated,
  onDone,
  onPendingPasswordChange,
  previewDelayMs = 500,
}: CreateAccountFormProps) {
  const [readiness, setReadiness] = useState<Readiness | null>(null);
  const [readinessError, setReadinessError] = useState<string | null>(null);

  const [firstName, setFirstName] = useState(prefill?.firstName ?? '');
  const [lastName, setLastName] = useState(prefill?.lastName ?? '');
  const [phone, setPhone] = useState('');
  const [personalEmail, setPersonalEmail] = useState('');
  const [studyStage, setStudyStage] = useState('');
  const [academicYear, setAcademicYear] = useState('');
  const [batchId, setBatchId] = useState('');
  /** null while the suggestion is in use; the typed value once staff edit it. */
  const [typedUsername, setTypedUsername] = useState<string | null>(null);
  const [skuId, setSkuId] = useState<string | null>(null);

  const [preview, setPreview] = useState<Preview | null>(null);
  const [checking, setChecking] = useState(false);
  const [attachTo, setAttachTo] = useState<{ userId: string; name: string } | null>(
    prefill ? { userId: prefill.attachToUserId, name: prefill.name } : null,
  );
  const [confirmNew, setConfirmNew] = useState(false);

  const [touched, setTouched] = useState(false);
  /** Fields the user has left. Their errors show from then on, not while typing. */
  const [left, setLeft] = useState<{ phone: boolean; email: boolean }>({ phone: false, email: false });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<{ message: string; fix?: string | null } | null>(null);
  const [created, setCreated] = useState<CreatedAccount | null>(null);

  const firstNameRef = useRef<HTMLInputElement>(null);
  const phoneRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const usernameRef = useRef<HTMLInputElement>(null);
  const duplicatesRef = useRef<HTMLDivElement>(null);
  const filledFromRecord = useRef(false);

  const loadReadiness = useCallback(async () => {
    setReadiness(null);
    setReadinessError(null);
    try {
      const { res, data } = await send(getToken, '/api/students/accounts/readiness');
      if (!res.ok || !data) throw new Error(data?.error || 'Could not check the account setup.');
      setReadiness(data as Readiness);
    } catch (err) {
      setReadinessError(err instanceof Error ? err.message : 'Could not check the account setup.');
    }
  }, [getToken]);

  useEffect(() => {
    void loadReadiness();
  }, [loadReadiness]);

  const ready = !!readiness?.ready && !readiness.connection;
  const editingUsername = typedUsername !== null;

  // Check the login ID and look for the same student a moment after typing stops.
  useEffect(() => {
    if (!ready || created) return;
    if (!firstName.trim() && !(typedUsername ?? '').trim()) {
      setPreview(null);
      setChecking(false);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      setChecking(true);
      try {
        const { res, data } = await send(getToken, '/api/students/accounts/preview', {
          method: 'POST',
          body: JSON.stringify({
            classroomId,
            firstName,
            lastName,
            username: typedUsername ?? '',
            phone,
            personalEmail,
            attachToUserId: attachTo?.userId ?? null,
          }),
        });
        if (!cancelled && res.ok && data) setPreview(data as Preview);
      } catch {
        // Keep the last answer. Creating checks everything again anyway.
      } finally {
        if (!cancelled) setChecking(false);
      }
    }, previewDelayMs);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [ready, created, firstName, lastName, typedUsername, phone, personalEmail, attachTo?.userId, classroomId, getToken, previewDelayMs]);

  // A student already on the roster: the phone and email on their record fill the blanks, once.
  useEffect(() => {
    const record = preview?.record;
    if (!record || filledFromRecord.current) return;
    filledFromRecord.current = true;
    if (record.phone) setPhone((current) => current || record.phone || '');
    if (record.personalEmail) setPersonalEmail((current) => current || record.personalEmail || '');
  }, [preview?.record]);

  const upcomingYears = useMemo(() => {
    const floor = startYearOf(currentBatch);
    return examYears.filter((year) => floor === null || (startYearOf(year) ?? floor) >= floor);
  }, [examYears, currentBatch]);

  const domain = readiness?.domain ?? 'neramclasses.com';
  const username = editingUsername
    ? normalizeUsername(typedUsername)
    : preview?.username || suggestUsername(firstName, lastName);
  const usernameValid = isValidUsername(username);
  const taken = !!preview && preview.username === username && preview.available === false;
  const phoneDigits = normalizeIndianMobile(phone);
  const phoneError = phone.trim() && !phoneDigits ? 'Enter a 10 digit Indian mobile number.' : null;
  const emailError =
    personalEmail.trim() && !EMAIL.test(personalEmail.trim()) ? 'That email does not look right.' : null;
  const candidates = !attachTo && !confirmNew ? preview?.candidates ?? [] : [];

  const license = readiness?.license ?? null;
  const skus = readiness?.skus ?? [];
  const chosenSku = skuId ? skus.find((sku) => sku.skuId === skuId) ?? null : null;
  const shownLicense: LicenseOption | null = chosenSku ?? license;

  /** New details may match someone else, so an earlier "different student" no longer holds. */
  const detailsChanged = () => {
    setConfirmNew(false);
    setError(null);
  };

  const submit = async () => {
    setTouched(true);
    setError(null);
    if (!firstName.trim()) return firstNameRef.current?.focus();
    if (phoneError) return phoneRef.current?.focus();
    if (emailError) return emailRef.current?.focus();
    if (!usernameValid || taken) {
      if (!editingUsername) setTypedUsername(username);
      requestAnimationFrame(() => usernameRef.current?.focus());
      return;
    }
    if (candidates.length) {
      duplicatesRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
      return;
    }

    setSubmitting(true);
    try {
      const { res, data } = await send(getToken, '/api/students/accounts', {
        method: 'POST',
        body: JSON.stringify({
          classroomId,
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          username,
          phone: phoneDigits,
          personalEmail: personalEmail.trim() || null,
          studyStage: studyStage || null,
          academicYear: academicYear || null,
          batchId: batchId || null,
          attachToUserId: attachTo?.userId ?? null,
          confirmNew,
          license: chosenSku
            ? { skuId: chosenSku.skuId, skuPartNumber: chosenSku.skuPartNumber, mode: 'direct', groupId: null }
            : license
              ? { skuId: license.skuId, skuPartNumber: license.skuPartNumber, mode: license.mode, groupId: license.groupId }
              : null,
        }),
      });

      if (res.status === 201 && data) {
        setCreated(data as CreatedAccount);
        onPendingPasswordChange?.(true);
        onCreated();
        return;
      }
      if (res.status === 409 && data?.error === 'possible_duplicate') {
        setPreview((current) => ({ ...(current ?? emptyPreview(username)), candidates: data.candidates || [] }));
        requestAnimationFrame(() => duplicatesRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'center' }));
        return;
      }
      if (res.status === 409 && data?.code === 'upn_taken') {
        setPreview((current) => ({ ...(current ?? emptyPreview(username)), username, available: false }));
        setError({ message: data.error });
        return;
      }
      setError({ message: data?.error || 'Could not create the account.', fix: data?.fix ?? null });
    } catch {
      setError({ message: 'Could not reach Nexus. Check the connection and try again.' });
    } finally {
      setSubmitting(false);
    }
  };

  // ── Result ────────────────────────────────────────────────────────────────
  if (created) {
    return (
      <AccountShareCard
        kind="welcome"
        firstName={created.firstName}
        upn={created.upn}
        password={created.password}
        phone={created.phone}
        steps={created.steps}
        onSharedChange={(shared) => onPendingPasswordChange?.(!shared)}
        onDone={() => {
          onPendingPasswordChange?.(false);
          onDone();
        }}
      />
    );
  }

  // ── Setup ─────────────────────────────────────────────────────────────────
  if (readinessError) {
    return (
      <Alert
        severity="error"
        action={
          <Button color="inherit" onClick={() => void loadReadiness()} sx={{ minHeight: 48 }}>
            Try again
          </Button>
        }
      >
        {readinessError}
      </Alert>
    );
  }

  if (!readiness) {
    return (
      <Box aria-busy="true" aria-label="Checking the account setup" sx={{ display: 'grid', gap: 2, maxWidth: 640 }}>
        {[56, 56, 56, 88].map((height, index) => (
          <Skeleton key={index} variant="rectangular" height={height} sx={{ borderRadius: 2 }} />
        ))}
      </Box>
    );
  }

  if (readiness.connection) {
    return (
      <SetupNotice title="Nexus cannot reach Microsoft right now" onRetry={loadReadiness} onUseExisting={onUseExisting}>
        <Typography variant="body2">{readiness.connection.message}</Typography>
        {readiness.connection.fix && (
          <Typography variant="body2" color="text.secondary">
            {readiness.connection.fix}
          </Typography>
        )}
      </SetupNotice>
    );
  }

  if (!readiness.ready) {
    return (
      <SetupNotice title="One-time setup needed" onRetry={loadReadiness} onUseExisting={onUseExisting}>
        <Typography variant="body2">
          An Azure admin needs to give the Nexus app these Microsoft Graph application permissions, with admin
          consent:
        </Typography>
        <Box component="ul" sx={{ m: 0, pl: 2.5, display: 'grid', gap: 0.5 }}>
          {readiness.missing.map((permission) => (
            <li key={permission}>
              <Typography component="code" sx={{ fontFamily: MONO, fontSize: '0.9rem', fontWeight: 700 }}>
                {permission}
              </Typography>
            </li>
          ))}
        </Box>
        {readiness.optionalMissing.length > 0 && (
          <Typography variant="body2" color="text.secondary">
            Also useful: {readiness.optionalMissing.join(', ')}.
          </Typography>
        )}
        <Typography variant="caption" color="text.secondary">
          In Azure Portal: App registrations, the Nexus app, API permissions, Add a permission, Microsoft Graph,
          Application permissions. Then Grant admin consent.
        </Typography>
      </SetupNotice>
    );
  }

  // ── Form ──────────────────────────────────────────────────────────────────
  return (
    <Box
      component="form"
      noValidate
      onSubmit={(event: React.FormEvent) => {
        event.preventDefault();
        void submit();
      }}
      sx={{ display: 'flex', flexDirection: 'column', gap: 2, maxWidth: 640 }}
    >
      {attachTo && (
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1.5,
            p: 1.5,
            borderRadius: 2,
            bgcolor: (t) => alpha(t.palette.info.main, 0.08),
          }}
        >
          <StudentAvatar userId={attachTo.userId} name={attachTo.name} size={40} tapToView={false} />
          <Typography variant="body2" sx={{ flex: 1, minWidth: 0 }}>
            For <strong>{attachTo.name}</strong>. The account joins their existing record, so fees, attendance
            and catch-up stay together.
          </Typography>
          {!prefill && (
            <Button onClick={() => setAttachTo(null)} sx={{ minHeight: 48, flexShrink: 0 }}>
              Change
            </Button>
          )}
        </Box>
      )}

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
        <TextField
          label="First name"
          required
          value={firstName}
          onChange={(event) => {
            setFirstName(event.target.value);
            detailsChanged();
          }}
          inputRef={firstNameRef}
          autoFocus={!prefill}
          error={touched && !firstName.trim()}
          helperText={touched && !firstName.trim() ? 'Enter the first name.' : undefined}
          inputProps={{ autoComplete: 'off', style: { fontSize: 16 } }}
        />
        <TextField
          label="Last name"
          value={lastName}
          onChange={(event) => {
            setLastName(event.target.value);
            detailsChanged();
          }}
          inputProps={{ autoComplete: 'off', style: { fontSize: 16 } }}
        />
      </Box>

      <TextField
        label="Mobile number"
        type="tel"
        value={phone}
        onChange={(event) => {
          setPhone(event.target.value);
          detailsChanged();
        }}
        onBlur={() => setLeft((current) => ({ ...current, phone: true }))}
        inputRef={phoneRef}
        // Checked once they leave the field, not while the first digits go in.
        error={!!phoneError && (touched || left.phone)}
        helperText={
          phoneError && (touched || left.phone) ? phoneError : 'The login is sent to this number on WhatsApp.'
        }
        InputProps={{ startAdornment: <InputAdornment position="start">+91</InputAdornment> }}
        inputProps={{ inputMode: 'numeric', autoComplete: 'tel-national', style: { fontSize: 16 } }}
      />

      <TextField
        label="Personal email (optional)"
        type="email"
        value={personalEmail}
        onChange={(event) => {
          setPersonalEmail(event.target.value);
          detailsChanged();
        }}
        onBlur={() => setLeft((current) => ({ ...current, email: true }))}
        inputRef={emailRef}
        error={!!emailError && (touched || left.email)}
        helperText={
          emailError && (touched || left.email)
            ? emailError
            : 'Their Gmail, if they applied with one. It helps Nexus recognise them later.'
        }
        inputProps={{ autoComplete: 'off', autoCapitalize: 'none', style: { fontSize: 16 } }}
      />

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
        <TextField select label="Class" value={studyStage} onChange={(event) => setStudyStage(event.target.value)}>
          <MenuItem value="">Not set</MenuItem>
          {SETTABLE_STAGES.map((stage) => (
            <MenuItem key={stage} value={stage}>
              {STAGE_LABEL[stage]}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          select
          label="Exam year"
          value={academicYear}
          onChange={(event) => setAcademicYear(event.target.value)}
          helperText={academicYear ? examYearDescription(academicYear) : 'The year they sit the exam.'}
        >
          <MenuItem value="">Not set</MenuItem>
          {upcomingYears.map((year) => (
            <MenuItem key={year} value={year}>
              {year}
            </MenuItem>
          ))}
        </TextField>
      </Box>

      {batches.length > 0 && (
        <TextField select label="Section" value={batchId} onChange={(event) => setBatchId(event.target.value)}>
          <MenuItem value="">No section</MenuItem>
          {batches.map((batch) => (
            <MenuItem key={batch.id} value={batch.id}>
              {batch.name}
            </MenuItem>
          ))}
        </TextField>
      )}

      <Box
        sx={{
          p: 1.5,
          borderRadius: 2,
          border: 1,
          borderColor: taken || (touched && !usernameValid) ? 'error.main' : 'divider',
        }}
      >
        <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700 }}>
          Login ID
        </Typography>
        {editingUsername ? (
          <TextField
            fullWidth
            size="small"
            value={typedUsername ?? ''}
            onChange={(event) => setTypedUsername(event.target.value)}
            inputRef={usernameRef}
            error={!!typedUsername && !usernameValid}
            helperText="Letters, numbers, dots, dashes and underscores."
            InputProps={{ endAdornment: <InputAdornment position="end">@{domain}</InputAdornment> }}
            inputProps={{
              'aria-label': 'Login ID',
              autoCapitalize: 'none',
              autoCorrect: 'off',
              spellCheck: false,
              style: { fontSize: 16 },
            }}
            sx={{ mt: 0.5 }}
          />
        ) : (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography sx={{ fontWeight: 700, flex: 1, minWidth: 0, wordBreak: 'break-all' }}>
              {username ? `${username}@${domain}` : 'Type a name to get a login ID'}
            </Typography>
            <Button
              onClick={() => {
                setTypedUsername(username);
                requestAnimationFrame(() => usernameRef.current?.focus());
              }}
              sx={{ minHeight: 48, flexShrink: 0 }}
            >
              Edit
            </Button>
          </Box>
        )}
        <Availability checking={checking} preview={preview} username={username} valid={usernameValid} />
      </Box>

      {shownLicense ? (
        skus.length > 1 ? (
          <TextField
            select
            label="License"
            value={shownLicense.skuId}
            onChange={(event) => setSkuId(event.target.value)}
            error={shownLicense.free === 0}
            helperText={shownLicense.free === 0 ? 'No free seats are left on this license.' : undefined}
          >
            {skus.map((sku) => (
              <MenuItem key={sku.skuId} value={sku.skuId}>
                {sku.name}
                {sku.free !== null ? ` · ${sku.free} free` : ''}
              </MenuItem>
            ))}
          </TextField>
        ) : (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <KeyOutlinedIcon aria-hidden sx={{ color: 'text.secondary' }} />
            <Typography variant="body2">
              Gets <strong>{shownLicense.name}</strong>
              {shownLicense.free !== null ? ` · ${shownLicense.free} free` : ''}
            </Typography>
          </Box>
        )
      ) : (
        <Alert severity="warning">
          No student license was found, so the account will be created without one. Assign it later in the
          Microsoft 365 admin center.
        </Alert>
      )}

      {candidates.length > 0 && (
        <Box
          ref={duplicatesRef}
          role="group"
          aria-labelledby="create-account-duplicates"
          sx={{
            p: 1.5,
            borderRadius: 2,
            border: 1,
            borderColor: 'warning.main',
            bgcolor: (t) => alpha(t.palette.warning.main, 0.06),
          }}
        >
          <Typography id="create-account-duplicates" sx={{ fontWeight: 800 }}>
            Is this the same student?
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25, mb: 1 }}>
            Nexus already has someone with these details. Creating the account on their record keeps fees,
            attendance and catch-up together.
          </Typography>
          {candidates.map((candidate) => (
            <Box
              key={candidate.user_id}
              sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 1, flexWrap: 'wrap', borderTop: 1, borderColor: 'divider' }}
            >
              <StudentAvatar userId={candidate.user_id} name={candidate.name} size={40} tapToView={false} />
              <Box sx={{ flex: '1 1 160px', minWidth: 0 }}>
                <Typography sx={{ fontWeight: 700 }}>{candidate.name || 'Unnamed student'}</Typography>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', wordBreak: 'break-all' }}>
                  {[REASON_LABEL[candidate.reason], candidate.email].filter(Boolean).join(' · ')}
                </Typography>
              </Box>
              <Button
                variant="contained"
                onClick={() => setAttachTo({ userId: candidate.user_id, name: candidate.name || 'this student' })}
                sx={{ minHeight: 48, fontWeight: 700 }}
              >
                Yes, same student
              </Button>
            </Box>
          ))}
          <Button
            fullWidth
            variant="outlined"
            onClick={() => setConfirmNew(true)}
            sx={{ mt: 1, minHeight: 48, fontWeight: 700 }}
          >
            No, a different student
          </Button>
        </Box>
      )}

      {error && (
        <Alert severity="error" onClose={() => setError(null)}>
          {error.message}
          {error.fix && (
            <Typography variant="body2" sx={{ mt: 0.5 }}>
              {error.fix}
            </Typography>
          )}
        </Alert>
      )}

      <Button type="submit" variant="contained" size="large" disabled={submitting} sx={{ minHeight: 52, fontWeight: 800 }}>
        {submitting ? 'Creating the account…' : 'Create account'}
      </Button>
      {submitting && (
        <Box>
          <LinearProgress aria-label="Creating the account" />
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.75 }}>
            Creating the Microsoft account, assigning the license and adding them to this class. This can take up to a
            minute.
          </Typography>
        </Box>
      )}
    </Box>
  );
}

function SetupNotice({
  title,
  children,
  onRetry,
  onUseExisting,
}: {
  title: string;
  children: React.ReactNode;
  onRetry: () => Promise<void>;
  onUseExisting?: () => void;
}) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, maxWidth: 560, p: 2, borderRadius: 2, border: 1, borderColor: 'divider' }}>
      <Typography sx={{ fontWeight: 800 }}>{title}</Typography>
      {children}
      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mt: 0.5 }}>
        <Button variant="contained" onClick={() => void onRetry()} sx={{ minHeight: 48, fontWeight: 700 }}>
          Check again
        </Button>
        {onUseExisting && (
          <Button variant="outlined" onClick={onUseExisting} sx={{ minHeight: 48, fontWeight: 700 }}>
            Add an existing Microsoft account instead
          </Button>
        )}
      </Box>
    </Box>
  );
}

function Availability({
  checking,
  preview,
  username,
  valid,
}: {
  checking: boolean;
  preview: Preview | null;
  username: string;
  valid: boolean;
}) {
  let content: React.ReactNode = null;
  if (username && !valid) {
    content = <Status tone="error" text="Use letters, numbers, dots, dashes and underscores." />;
  } else if (username && checking) {
    content = (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
        <CircularProgress size={14} />
        <Typography variant="caption" color="text.secondary">
          Checking
        </Typography>
      </Box>
    );
  } else if (preview?.availabilityError) {
    content = <Status tone="warning" text={`Could not check it: ${preview.availabilityError}`} />;
  } else if (preview && preview.username === username && preview.available === true) {
    content = <Status tone="success" text="Available" />;
  } else if (preview && preview.username === username && preview.available === false) {
    content = <Status tone="error" text="Already taken. Edit it, for example add a number." />;
  }

  return (
    <Box role="status" aria-live="polite" sx={{ minHeight: 22, mt: 0.5 }}>
      {content}
    </Box>
  );
}

function Status({ tone, text }: { tone: 'success' | 'warning' | 'error'; text: string }) {
  const Icon = tone === 'success' ? CheckCircleOutlineIcon : ErrorOutlineIcon;
  const color = tone === 'success' ? 'success.dark' : tone === 'warning' ? 'warning.dark' : 'error.main';
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, color }}>
      <Icon aria-hidden sx={{ fontSize: '1rem' }} />
      <Typography variant="caption" sx={{ color: 'inherit', fontWeight: 700 }}>
        {text}
      </Typography>
    </Box>
  );
}
