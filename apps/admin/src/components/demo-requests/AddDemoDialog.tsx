'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  MenuItem,
  Radio,
  RadioGroup,
  TextField,
  Typography,
} from '@neram/ui';
import { istDateKey } from '@neram/database/demo-schedule';
import { examYearChoices } from '@neram/database/academic-year';
import { STAFF_DEMO_CHANNELS, heldTutorOptions } from '@/lib/demo/staff-add';
import type { DemoPerson } from '@/app/api/demo-requests/people/route';
import PlannedDemoFields, { checkPlanned, defaultPlannedValue, plannedPayload, type PlannedValue } from './PlannedDemoFields';
import HeldDemoFields, { checkHeld, defaultHeldValue, heldPayload, type HeldValue } from './HeldDemoFields';
import MobileField from './MobileField';
import { storedMobile } from '@neram/database/phone';
import type { DeskSettings } from './types';

export type AddMode = 'request' | 'planned' | 'held';
type Mode = AddMode;
type Person = DemoPerson;

const TYPE_LABEL: Record<string, string> = { lead: 'Lead', student: 'Student', parent: "Parent's account" };

/** A person's number for the mobile field: kept with its code, so a Gulf number stays Gulf. */
const mobileOf = (p: string | null) => (p || '').trim();

const MODES: Array<{ id: Mode; title: string; body: string }> = [
  { id: 'request', title: 'Wants a demo', body: 'Goes to New. Call them and confirm a time as usual.' },
  { id: 'planned', title: 'Demo planned', body: 'Time fixed on WhatsApp or a call. The link can come later.' },
  { id: 'held', title: 'Demo already held', body: 'Record a demo done outside the desk, for example on Google Meet.' },
];

const CLASSES = [
  { id: '10th', label: 'Class 10' },
  { id: '11th', label: 'Class 11' },
  { id: '12th', label: 'Class 12' },
  { id: '12th-pass', label: 'Drop year' },
  { id: 'other', label: 'Other' },
];

function SectionLabel({ children }: { children: string }) {
  return (
    <Typography variant="subtitle2" component="h3" fontWeight={700} sx={{ mt: 2.5, mb: 1 }}>
      {children}
    </Typography>
  );
}

/**
 * Staff add a demo for someone who reached us outside the website: WhatsApp to
 * the office, a call, a walk-in. Finds the person (or creates them in People),
 * records where they came from, and either starts the normal flow or records a
 * demo that already happened.
 */
export default function AddDemoDialog({
  open,
  settings,
  onClose,
  onAdded,
  onOpenExisting,
}: {
  open: boolean;
  settings: DeskSettings;
  onClose: () => void;
  /** needsConfirm: the planned demo was saved but Confirm must be finished on the desk. */
  onAdded: (id: string, mode: Mode, needsConfirm?: boolean) => void;
  /** Open a request that already exists for the picked person. */
  onOpenExisting: (id: string) => void;
}) {
  const [person, setPerson] = useState<Person | null>(null);
  const [query, setQuery] = useState('');
  const [options, setOptions] = useState<Person[]>([]);
  const [searching, setSearching] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [currentClass, setCurrentClass] = useState('');
  const [examYear, setExamYear] = useState<number | null>(null);
  const [parentName, setParentName] = useState('');
  const [parentPhone, setParentPhone] = useState('');
  const [channel, setChannel] = useState('whatsapp');
  const [mode, setMode] = useState<Mode>('request');
  const [date, setDate] = useState('');
  const [window, setWindow] = useState('anytime');
  const [sendAck, setSendAck] = useState(true);
  const [held, setHeld] = useState<HeldValue>(defaultHeldValue);
  const [planned, setPlanned] = useState<PlannedValue>(() => defaultPlannedValue(settings.hosts, settings.defaultTutorUpn));
  const [parentAccount, setParentAccount] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** People the server thinks this may already be (asked before adding a new person). */
  const [matches, setMatches] = useState<Person[] | null>(null);
  const matchesRef = useRef<HTMLDivElement>(null);
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!open) return;
    const today = istDateKey(new Date());
    setHeld(defaultHeldValue());
    setPlanned(defaultPlannedValue(settings.hosts, settings.defaultTutorUpn));
    setParentAccount(false);
    setPerson(null);
    setQuery('');
    setOptions([]);
    setName('');
    setPhone('');
    setEmail('');
    setCurrentClass('');
    setExamYear(null);
    setParentName('');
    setParentPhone('');
    setChannel('whatsapp');
    setMode('request');
    setDate(today);
    setWindow('anytime');
    setSendAck(true);
    setError(null);
    setMatches(null);
    setTouched({});
    // Reset only when the dialog opens; the team list is read once per open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Search People as staff type (debounced).
  useEffect(() => {
    const q = query.trim();
    if (!open || q.length < 2 || (person && q === person.name)) {
      setOptions([]);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const t = setTimeout(() => {
      fetch(`/api/demo-requests/people?q=${encodeURIComponent(q)}`)
        .then((r) => (r.ok ? r.json() : { people: [] }))
        .then((d) => {
          if (!cancelled) setOptions((d.people ?? []) as Person[]);
        })
        .catch(() => !cancelled && setOptions([]))
        .finally(() => !cancelled && setSearching(false));
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query, open, person]);

  /** Fill the form from the account: as the student, or as the student's parent. */
  const fillFrom = (p: Person, asParent: boolean) => {
    if (asParent) {
      setParentName(p.name || '');
      setParentPhone(mobileOf(p.phone));
      setName('');
      setPhone('');
      setEmail('');
    } else {
      setName(p.name || '');
      setPhone(mobileOf(p.phone));
      setEmail(p.email || '');
      setParentName('');
      setParentPhone('');
    }
  };

  const pick = (p: Person | null) => {
    setPerson(p);
    const asParent = !!p?.is_parent_account;
    setParentAccount(asParent);
    if (p) fillFrom(p, asParent);
    // Someone with an open request: recording a held demo is the usual reason to be here.
    if (p?.open_request && mode === 'request') setMode('held');
  };

  // A changed name or number is a new question; the old matches no longer apply.
  useEffect(() => {
    setMatches(null);
  }, [name, phone]);

  // Bring the question into view, so it is not missed below the fold.
  useEffect(() => {
    if (matches?.length) matchesRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [matches]);

  /** Link the demo to a matched person. A family number staff typed stays, as the parent's mobile. */
  const linkMatch = (p: Person) => {
    const typedPhone = phone;
    const typedParentName = parentName;
    pick(p);
    setQuery(p.name || p.phone || '');
    if (p.matched?.reason === 'family_number' && !p.is_parent_account) {
      setParentPhone(typedPhone);
      setParentName(typedParentName);
    }
  };

  const toggleParentAccount = (on: boolean) => {
    setParentAccount(on);
    if (person) fillFrom(person, on);
  };

  // India or the Gulf, read the same way the server stores it (demoPhone).
  const phoneOk = !!storedMobile(phone);
  const nameOk = name.trim().length >= 2;
  // Required: which year they will write NATA or JEE B.Arch (this season and the next three).
  const yearChoices = useMemo(() => examYearChoices(), []);
  const examYearOk = examYear !== null && yearChoices.includes(examYear);
  const heldCheck = checkHeld(held);
  const plannedCheck = checkPlanned(planned);
  const windows = useMemo(() => settings.schedule.windows, [settings.schedule.windows]);
  const tutors = useMemo(() => heldTutorOptions(settings.hosts), [settings.hosts]);
  const openRequest = person?.open_request ?? null;
  // The server refuses a second open request for the same person; send staff to the open one.
  const blockedByOpen = !!openRequest && mode !== 'held';

  const canSave =
    nameOk &&
    phoneOk &&
    examYearOk &&
    !!channel &&
    !blockedByOpen &&
    (mode !== 'request' || window === 'anytime' || !!date) &&
    (mode !== 'held' || heldCheck.ok) &&
    (mode !== 'planned' || (plannedCheck.ok && settings.hosts.length > 0));

  const save = async (addAsNew = false) => {
    setTouched({ name: true, phone: true, examYear: true });
    if (!canSave) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/demo-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode,
          userId: person?.id,
          addAsNew,
          accountHolder: person && parentAccount ? 'parent' : 'student',
          name: name.trim(),
          phone,
          email: email.trim(),
          currentClass,
          examYear,
          parentName: parentName.trim(),
          parentPhone,
          channel,
          ...(mode === 'request' ? { window, date: window === 'anytime' ? null : date, sendAck } : {}),
          ...(mode === 'held' ? heldPayload(held) : {}),
          ...(mode === 'planned' ? plannedPayload(planned) : {}),
        }),
      });
      const d = await res.json();
      if (res.status === 409 && d.code === 'possible_match' && Array.isArray(d.matches)) {
        setMatches(d.matches as Person[]);
        return;
      }
      if (!res.ok) throw new Error(d.error || 'Could not add the demo.');
      onAdded(d.id, mode, !!d.confirmError);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not add the demo.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={saving ? undefined : onClose} fullWidth maxWidth="md" aria-labelledby="add-demo-title">
      <DialogTitle id="add-demo-title">Add a demo</DialogTitle>
      <DialogContent dividers>
        <Typography variant="body2" color="text.secondary">
          For students who reached us outside the website, for example a WhatsApp message to the office or a phone call.
        </Typography>

        <SectionLabel>Who</SectionLabel>
        <Autocomplete
          options={options}
          value={person}
          onChange={(_, v) => pick(v)}
          inputValue={query}
          onInputChange={(_, v) => setQuery(v)}
          getOptionLabel={(o) => o.name || o.phone || ''}
          isOptionEqualToValue={(a, b) => a.id === b.id}
          filterOptions={(x) => x}
          loading={searching}
          noOptionsText={query.trim().length < 2 ? 'Type at least 2 letters' : 'Nobody found. Fill in the details below to add them.'}
          renderOption={(props, o) => (
            <Box component="li" {...props} key={o.id} sx={{ display: 'block !important', minHeight: 48, py: 1 }}>
              <Typography variant="body2" fontWeight={600}>
                {o.name}
              </Typography>
              <Typography variant="caption" color="text.secondary" component="p">
                {[o.phone, o.email, o.is_parent_account ? TYPE_LABEL.parent : TYPE_LABEL[o.user_type] || o.user_type].filter(Boolean).join(' · ')}
              </Typography>
              {o.matched && o.matched.reason !== 'same_name' && (
                <Typography variant="caption" color="text.primary" fontWeight={600} component="p">
                  {o.matched.label} {o.matched.number}
                </Typography>
              )}
              {o.open_request && (
                <Typography variant="caption" color="info.main" component="p">
                  Open demo request {o.open_request.ref_code}
                </Typography>
              )}
            </Box>
          )}
          renderInput={(params) => (
            <TextField
              {...params}
              label="Search People (name, phone or email)"
              helperText={
                person
                  ? 'Existing person, linked to this demo. A missing email or mobile is added; nothing is overwritten.'
                  : 'Not in People yet? Skip this and fill in the details below.'
              }
              InputProps={{
                ...params.InputProps,
                endAdornment: (
                  <>
                    {searching ? <CircularProgress color="inherit" size={18} aria-label="Searching" /> : null}
                    {params.InputProps.endAdornment}
                  </>
                ),
              }}
            />
          )}
        />
        {person && (
          <FormControlLabel
            control={<Checkbox checked={parentAccount} onChange={(e) => toggleParentAccount(e.target.checked)} />}
            label={
              <Box sx={{ py: 0.5 }}>
                <Typography variant="body2" fontWeight={600}>
                  This is the parent&apos;s account
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Their details go in Parent. Type the student&apos;s own name and mobile below (the parent&apos;s mobile is fine if the
                  student has none).
                </Typography>
              </Box>
            }
            sx={{ mt: 1, alignItems: 'flex-start', minHeight: 44, '& .MuiCheckbox-root': { mt: -0.5 } }}
          />
        )}
        {openRequest && (
          <Alert
            severity={blockedByOpen ? 'warning' : 'info'}
            sx={{ mt: 1.5 }}
            action={
              <Button color="inherit" onClick={() => onOpenExisting(openRequest.id)} sx={{ minHeight: 44 }}>
                Open {openRequest.ref_code}
              </Button>
            }
          >
            {blockedByOpen
              ? `They already have an open request (${openRequest.ref_code}). Work on that one instead.`
              : `They have an open request (${openRequest.ref_code}). Recording this demo closes it as done, so it is not counted twice.`}
          </Alert>
        )}
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2, mt: 2 }}>
          <TextField
            label="Student name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => setTouched((t) => ({ ...t, name: true }))}
            error={touched.name && !nameOk}
            helperText={touched.name && !nameOk ? 'Enter the student name' : ' '}
            required
            autoComplete="off"
          />
          <MobileField
            label="Mobile (WhatsApp)"
            value={phone}
            onChange={setPhone}
            onBlur={() => setTouched((t) => ({ ...t, phone: true }))}
            error={touched.phone && !phoneOk}
            helperText={touched.phone && !phoneOk ? 'A full mobile number. Pick the country code first for a Gulf number.' : ' '}
            required
          />
          <TextField label="Email (optional)" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" />
          <TextField select label="Class (optional)" value={currentClass} onChange={(e) => setCurrentClass(e.target.value)}>
            <MenuItem value="">Not known</MenuItem>
            {CLASSES.map((c) => (
              <MenuItem key={c.id} value={c.id}>
                {c.label}
              </MenuItem>
            ))}
          </TextField>
          <TextField label="Parent name (optional)" value={parentName} onChange={(e) => setParentName(e.target.value)} autoComplete="off" />
          <MobileField
            label="Parent mobile (optional)"
            value={parentPhone}
            onChange={setParentPhone}
            helperText="Gets copies of the WhatsApp messages"
          />
        </Box>

        <SectionLabel>Exam year</SectionLabel>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }} id="add-demo-exam-year-help">
          Which year will they write NATA or JEE B.Arch?
        </Typography>
        <Box
          role="group"
          aria-label="Exam year"
          aria-describedby="add-demo-exam-year-help"
          aria-required="true"
          sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}
        >
          {yearChoices.map((y) => {
            const selected = examYear === y;
            return (
              <Chip
                key={y}
                label={y}
                clickable
                color={selected ? 'primary' : 'default'}
                variant={selected ? 'filled' : 'outlined'}
                onClick={() => {
                  setExamYear(y);
                  setTouched((t) => ({ ...t, examYear: true }));
                }}
                aria-pressed={selected}
                data-testid={`add-demo-exam-year-${y}`}
                sx={{
                  minHeight: 44,
                  minWidth: 80,
                  fontWeight: 600,
                  fontSize: '0.95rem',
                  borderRadius: 999,
                  '&.Mui-focusVisible': { outline: '3px solid', outlineColor: 'primary.main', outlineOffset: 2 },
                }}
              />
            );
          })}
        </Box>
        {touched.examYear && !examYearOk && (
          <Typography variant="caption" color="error" sx={{ display: 'block', mt: 0.75 }} role="alert">
            Pick the exam year
          </Typography>
        )}

        <SectionLabel>Where they came from</SectionLabel>
        <TextField
          select
          label="Came from"
          value={channel}
          onChange={(e) => setChannel(e.target.value)}
          helperText="Counts in Leads by channel. Pick Google Ads only if they said they saw our ad."
          fullWidth
          required
        >
          {STAFF_DEMO_CHANNELS.map((c) => (
            <MenuItem key={c.id} value={c.id}>
              {c.label}
            </MenuItem>
          ))}
        </TextField>

        <SectionLabel>What happened</SectionLabel>
        <RadioGroup
          value={mode}
          onChange={(e) => setMode(e.target.value as Mode)}
          aria-label="What happened"
          sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' }, gap: 1 }}
        >
          {MODES.map((m) => (
            <FormControlLabel
              key={m.id}
              value={m.id}
              control={<Radio sx={{ alignSelf: 'flex-start' }} />}
              label={
                <Box sx={{ py: 0.5 }}>
                  <Typography fontWeight={700}>{m.title}</Typography>
                  <Typography variant="body2" color="text.secondary">
                    {m.body}
                  </Typography>
                </Box>
              }
              sx={{
                m: 0,
                p: 1,
                pr: 1.5,
                alignItems: 'flex-start',
                border: 1,
                borderRadius: 2,
                borderColor: mode === m.id ? 'primary.main' : 'divider',
                bgcolor: mode === m.id ? 'action.selected' : 'transparent',
                cursor: 'pointer',
                transition: 'border-color 150ms, background-color 150ms',
              }}
            />
          ))}
        </RadioGroup>

        {mode === 'request' && (
          <Box sx={{ mt: 2 }}>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
              <TextField select label="When suits them" value={window} onChange={(e) => setWindow(e.target.value)}>
                <MenuItem value="anytime">Any time, we will call</MenuItem>
                {windows.map((w) => (
                  <MenuItem key={w.id} value={w.id}>
                    {w.label} ({w.start} to {w.end})
                  </MenuItem>
                ))}
              </TextField>
              {window !== 'anytime' && (
                <TextField
                  label="Day"
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  InputLabelProps={{ shrink: true }}
                  inputProps={{ min: istDateKey(new Date()) }}
                  required
                />
              )}
            </Box>
            <FormControlLabel
              control={<Checkbox checked={sendAck} onChange={(e) => setSendAck(e.target.checked)} />}
              label='Send the "request received" WhatsApp'
              sx={{ mt: 1, minHeight: 44 }}
            />
          </Box>
        )}

        {mode === 'planned' && (
          <Box sx={{ mt: 2 }}>
            {settings.hosts.length ? (
              <PlannedDemoFields value={planned} onChange={setPlanned} hosts={settings.hosts} />
            ) : (
              <Alert severity="warning">Add the demo team in Demo settings first.</Alert>
            )}
          </Box>
        )}

        {mode === 'held' && (
          <Box sx={{ mt: 2 }}>
            <HeldDemoFields value={held} onChange={setHeld} tutors={tutors} />
          </Box>
        )}

        {!!matches?.length && (
          <Box
            ref={matchesRef}
            role="region"
            aria-labelledby="add-demo-matches-title"
            data-testid="add-demo-matches"
            sx={{ mt: 2, p: 2, border: 1, borderColor: 'primary.main', borderRadius: 2, bgcolor: 'action.hover' }}
          >
            <Typography id="add-demo-matches-title" component="h3" variant="subtitle1" fontWeight={700} role="alert">
              Already in People?
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
              This number or name matches someone we already have. Link the demo to them so they do not get a second record.
            </Typography>
            <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, display: 'grid', gap: 1 }}>
              {matches.map((m) => (
                <Box
                  component="li"
                  key={m.id}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 2,
                    p: 1.5,
                    border: 1,
                    borderColor: 'divider',
                    borderRadius: 2,
                    bgcolor: 'background.paper',
                  }}
                >
                  <Box sx={{ minWidth: 0, flex: 1 }}>
                    <Typography variant="body2" fontWeight={600}>
                      {m.name || 'No name'}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" component="p">
                      {[m.phone, m.email, m.is_parent_account ? TYPE_LABEL.parent : TYPE_LABEL[m.user_type] || m.user_type]
                        .filter(Boolean)
                        .join(' · ')}
                    </Typography>
                    {m.matched && (
                      <Typography variant="caption" color="text.primary" fontWeight={600} component="p">
                        {m.matched.reason === 'same_name' ? 'Same name' : `${m.matched.label} ${m.matched.number ?? ''}`.trim()}
                      </Typography>
                    )}
                  </Box>
                  <Button variant="outlined" onClick={() => linkMatch(m)} disabled={saving} sx={{ minHeight: 44, flexShrink: 0 }}>
                    Use this person
                  </Button>
                </Box>
              ))}
            </Box>
            <Button onClick={() => save(true)} disabled={saving} sx={{ mt: 1.5, minHeight: 44 }}>
              No, add {name.trim() || 'them'} as a new person
            </Button>
          </Box>
        )}

        {error && (
          <Alert severity="error" sx={{ mt: 2 }} role="alert">
            {error}
          </Alert>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onClose} disabled={saving} sx={{ minHeight: 44 }}>
          Back
        </Button>
        <Button
          variant="contained"
          onClick={() => save()}
          disabled={saving || !canSave}
          startIcon={saving ? <CircularProgress size={16} color="inherit" /> : undefined}
          sx={{ minHeight: 44 }}
        >
          {saving ? 'Saving' : mode === 'planned' ? 'Save planned demo' : mode === 'held' ? 'Record demo' : 'Add request'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
