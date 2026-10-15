'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Box, Button, Paper, Stack, TextField, Typography } from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import VerifiedUserOutlinedIcon from '@mui/icons-material/VerifiedUserOutlined';
import { SECTION_BY_KEY } from '@/lib/college-dashboard/content-sections';
import type { CollegeContentSection } from '@/lib/college-hub/types';
import SectionFields, { fromForm, startValues, type SectionValues } from '@/components/college-content/SectionFields';

interface Props {
  token: string;
  college: { name: string; city: string | null; logo: string | null };
  recipientName: string | null;
  expiresAt: string;
  sections: CollegeContentSection[];
  live: Partial<Record<CollegeContentSection, SectionValues>>;
}

type About = { name: string; role: string; phone: string };

function day(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });
}

/**
 * The no-login college update form (/college-update/<token>), phone first.
 * Prefilled with what is live; only changed sections are sent, and each one
 * waits for Neram staff before it shows on the college page.
 */
export default function UpdateForm({ token, college, recipientName, expiresAt, sections, live }: Props) {
  const start = useMemo(
    () => Object.fromEntries(sections.map((s) => [s, startValues(SECTION_BY_KEY[s], live[s] ?? {})])) as Record<CollegeContentSection, SectionValues>,
    [sections, live]
  );
  const [values, setValues] = useState(start);
  const [errors, setErrors] = useState<Record<string, Record<string, string>>>({});
  const [about, setAbout] = useState<About>({ name: recipientName ?? '', role: '', phone: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState<CollegeContentSection[] | null>(null);
  const topRef = useRef<HTMLDivElement>(null);

  // Counts a real visit (WhatsApp's preview robot runs no JavaScript).
  useEffect(() => {
    void fetch(`/api/college-update/${token}/opened`, { method: 'POST', keepalive: true }).catch(() => null);
  }, [token]);

  const changedSections = sections.filter((s) => JSON.stringify(values[s]) !== JSON.stringify(start[s]));

  const upload = async (file: File) => {
    const form = new FormData();
    form.append('file', file);
    const res = await fetch(`/api/college-update/${token}/upload`, { method: 'POST', body: form });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error ?? 'Upload failed');
    return { url: json.url as string };
  };

  const setAboutField = (k: keyof About, v: string) => {
    setAbout((a) => ({ ...a, [k]: k === 'phone' ? v.replace(/\D/g, '').slice(0, 10) : v }));
    setErrors((e) => ({ ...e, about: { ...(e.about ?? {}), [k]: '' } }));
  };

  const scrollToFirstError = (fields: Record<string, Record<string, string>>) => {
    const first = ['about', ...sections].find((k) => fields[k] && Object.values(fields[k]).some(Boolean));
    if (first) document.getElementById(`part-${first}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const local: Record<string, string> = {};
    if (!about.name.trim()) local.name = 'Enter your name';
    if (!about.role.trim()) local.role = 'Enter your role at the college';
    if (!/^[6-9]\d{9}$/.test(about.phone)) local.phone = 'Enter your 10-digit mobile number';
    if (Object.keys(local).length) {
      const f = { ...errors, about: local };
      setErrors(f);
      setError('Please tell us who you are first.');
      scrollToFirstError(f);
      return;
    }
    if (changedSections.length === 0) {
      setError('Nothing has changed yet. Correct or add something, then send.');
      return;
    }
    setBusy(true);
    const body = {
      submitter: about,
      sections: Object.fromEntries(changedSections.map((s) => [s, fromForm(SECTION_BY_KEY[s], values[s])])),
    };
    const res = await fetch(`/api/college-update/${token}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).catch(() => null);
    const json = res ? await res.json().catch(() => ({})) : { error: 'No connection. Check your internet and try again.' };
    setBusy(false);
    if (!res?.ok) {
      setErrors(json.fields ?? {});
      setError(json.error ?? 'Could not send. Please try again.');
      if (json.fields) scrollToFirstError(json.fields);
      return;
    }
    setSent(json.sections ?? changedSections);
    topRef.current?.scrollIntoView({ block: 'start' });
  };

  const header = (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2 }}>
      {college.logo && (
        <Box component="img" src={college.logo} alt="" sx={{ width: 44, height: 44, borderRadius: 1.5, objectFit: 'contain', bgcolor: 'common.white', border: '1px solid', borderColor: 'divider', flexShrink: 0 }} />
      )}
      <Box sx={{ minWidth: 0 }}>
        <Typography component="p" sx={{ m: 0, fontSize: 12.5, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'primary.main' }}>
          Neram Classes College Hub
        </Typography>
        <Typography component="p" sx={{ m: 0, fontWeight: 700, fontSize: 16, lineHeight: 1.3 }}>
          {college.name}
          {college.city ? `, ${college.city}` : ''}
        </Typography>
      </Box>
    </Box>
  );

  if (sent) {
    return (
      <Box component="main" ref={topRef} sx={{ minHeight: '100vh', bgcolor: 'grey.50', px: 2, py: 3, fontFamily: (t) => t.typography.fontFamily }}>
        <Box sx={{ maxWidth: 680, mx: 'auto' }}>
          {header}
          <Paper variant="outlined" sx={{ p: { xs: 2.5, sm: 3.5 }, borderRadius: 3 }}>
            <CheckCircleIcon aria-hidden sx={{ fontSize: 44, color: 'success.main', mb: 1 }} />
            <Typography variant="h1" sx={{ fontSize: 22, fontWeight: 700, mb: 1 }}>Thank you, {about.name.split(' ')[0]}</Typography>
            <Typography sx={{ fontSize: 15.5, color: 'text.secondary', mb: 1.5 }}>
              We received your updates to {sent.map((s) => SECTION_BY_KEY[s].title.toLowerCase()).join(', ')}. Our team checks them, usually within one working day, and then they go live on {college.name}&apos;s page.
            </Typography>
            <Typography sx={{ fontSize: 14.5, color: 'text.secondary', mb: 2.5 }}>
              Spotted something else? This link works until {day(expiresAt)}. Sending again replaces what you sent for that part.
            </Typography>
            <Button variant="outlined" onClick={() => setSent(null)} sx={{ minHeight: 44 }}>
              Make more changes
            </Button>
          </Paper>
        </Box>
      </Box>
    );
  }

  return (
    <Box component="main" ref={topRef} sx={{ minHeight: '100vh', bgcolor: 'grey.50', px: 2, py: 3, fontFamily: (t) => t.typography.fontFamily }}>
      <Box component="form" noValidate onSubmit={submit} sx={{ maxWidth: 680, mx: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Box>
          {header}
          <Typography variant="h1" sx={{ fontSize: { xs: 24, sm: 28 }, fontWeight: 700, lineHeight: 1.25, mb: 1 }}>
            Check and update your college&apos;s details
          </Typography>
          <Typography sx={{ fontSize: 15.5, color: 'text.secondary', lineHeight: 1.55 }}>
            Students see these details on Neram Classes when they choose a college. Correct anything that is out of date and add what is missing. About 5 minutes, no login needed.
          </Typography>
          <Stack direction="row" gap={1} alignItems="center" sx={{ mt: 1.5, color: 'success.dark' }}>
            <VerifiedUserOutlinedIcon aria-hidden sx={{ fontSize: 18 }} />
            <Typography sx={{ fontSize: 14 }}>Our team checks every change before it goes live.</Typography>
          </Stack>
        </Box>

        <Paper id="part-about" variant="outlined" sx={{ p: { xs: 2, sm: 2.5 }, borderRadius: 2, scrollMarginTop: 16 }}>
          <Typography component="h2" sx={{ fontWeight: 700, fontSize: 18 }}>About you</Typography>
          <Typography sx={{ fontSize: 14.5, color: 'text.secondary', mb: 2 }}>So we know who sent the update and can call if something is unclear.</Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))' }, gap: 2 }}>
            <TextField label="Your name" value={about.name} onChange={(e) => setAboutField('name', e.target.value)} error={!!errors.about?.name} helperText={errors.about?.name} autoComplete="name" required fullWidth sx={{ gridColumn: '1 / -1' }} />
            <TextField label="Your role at the college" value={about.role} onChange={(e) => setAboutField('role', e.target.value)} error={!!errors.about?.role} helperText={errors.about?.role || 'For example Principal, Admissions officer'} required fullWidth />
            <TextField
              label="Your mobile number"
              value={about.phone}
              onChange={(e) => setAboutField('phone', e.target.value)}
              error={!!errors.about?.phone}
              helperText={errors.about?.phone || '10 digits'}
              inputProps={{ inputMode: 'numeric' }}
              autoComplete="tel-national"
              required
              fullWidth
            />
          </Box>
        </Paper>

        {sections.map((s, i) => {
          const def = SECTION_BY_KEY[s];
          const changed = changedSections.includes(s);
          return (
            <Paper key={s} id={`part-${s}`} variant="outlined" sx={{ p: { xs: 2, sm: 2.5 }, borderRadius: 2, scrollMarginTop: 16, borderColor: changed ? 'primary.light' : 'divider' }}>
              <Stack direction="row" justifyContent="space-between" alignItems="baseline" gap={1}>
                <Typography component="h2" sx={{ fontWeight: 700, fontSize: 18 }}>{def.title}</Typography>
                <Typography sx={{ fontSize: 13, color: changed ? 'primary.main' : 'text.secondary', fontWeight: changed ? 700 : 400, flexShrink: 0 }}>
                  {changed ? 'Changed' : `${i + 1} of ${sections.length}`}
                </Typography>
              </Stack>
              <Typography sx={{ fontSize: 14.5, color: 'text.secondary', mb: 2 }}>{def.intro}</Typography>
              <SectionFields
                def={def}
                values={values[s]}
                errors={errors[s] ?? {}}
                onChange={(patch) => {
                  setValues((v) => ({ ...v, [s]: { ...v[s], ...patch } }));
                  setErrors((e) => ({ ...e, [s]: { ...(e[s] ?? {}), ...Object.fromEntries(Object.keys(patch).map((k) => [k, ''])) } }));
                  setError('');
                }}
                disabled={busy}
                upload={upload}
              />
            </Paper>
          );
        })}

        <Box
          sx={{
            position: 'sticky',
            bottom: 0,
            mx: -2,
            px: 2,
            py: 1.5,
            bgcolor: 'background.paper',
            borderTop: '1px solid',
            borderColor: 'divider',
            display: 'flex',
            flexDirection: 'column',
            gap: 1,
          }}
        >
          {error && <Alert severity="error" role="alert">{error}</Alert>}
          <Stack direction="row" alignItems="center" justifyContent="space-between" gap={1.5}>
            <Typography sx={{ fontSize: 14, color: 'text.secondary' }} aria-live="polite">
              {changedSections.length ? `${changedSections.length} of ${sections.length} parts changed` : 'No changes yet'}
            </Typography>
            <Button type="submit" variant="contained" disabled={busy} sx={{ minHeight: 48, px: 3, fontWeight: 700, flexShrink: 0 }}>
              {busy ? 'Sending' : 'Send to Neram Classes'}
            </Button>
          </Stack>
        </Box>
      </Box>
    </Box>
  );
}
