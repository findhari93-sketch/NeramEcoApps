'use client';

/**
 * Admin > Centres > one centre: everything its public city page shows.
 * Desktop first. Back returns to the Centres list. Save PATCHes the row and
 * purges the marketing cache, so the page updates within a minute.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  FormControlLabel,
  IconButton,
  ImageUploadField,
  MenuItem,
  Paper,
  Radio,
  Snackbar,
  TextField,
  Tooltip,
  Typography,
} from '@neram/ui';
import StorefrontOutlinedIcon from '@mui/icons-material/StorefrontOutlined';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import { OpsPageHeader, OpsSkeleton, StatusChip, TARGET_44 } from '@/components/ops/OpsUi';
import {
  DAYS,
  PHOTO_KINDS,
  centrePagePath,
  photoEntries,
  reviewLink,
  type CentrePhotoEntry,
  type CentreRow,
  type CheckItem,
  type PhotoKind,
  type WeekHours,
} from '@/lib/centre-editor';
import { marketingOriginFor } from '@/lib/marketing-links';

type Centre = CentreRow & { checklist: CheckItem[] };

interface Form {
  address: string;
  pincode: string;
  landmark: string;
  contact_phone: string;
  operating_hours: WeekHours;
  description: string;
  description_reviewed: boolean;
  facilities: string;
  established_year: string;
  google_business_url: string;
  google_reviews_url: string;
  google_place_id: string;
  rating: string;
  review_count: string;
  rating_checked_at: string;
  photos: CentrePhotoEntry[];
}

const DAY_LABEL: Record<(typeof DAYS)[number], string> = {
  monday: 'Monday',
  tuesday: 'Tuesday',
  wednesday: 'Wednesday',
  thursday: 'Thursday',
  friday: 'Friday',
  saturday: 'Saturday',
  sunday: 'Sunday',
};

const toForm = (c: Centre): Form => ({
  address: c.address ?? '',
  pincode: c.pincode ?? '',
  landmark: c.landmark ?? '',
  contact_phone: c.contact_phone ?? '',
  operating_hours: c.operating_hours ?? {},
  description: c.description ?? '',
  description_reviewed: c.description_reviewed === true,
  facilities: (c.facilities ?? []).join(', '),
  established_year: c.established_year ? String(c.established_year) : '',
  google_business_url: c.google_business_url ?? '',
  google_reviews_url: c.google_reviews_url ?? '',
  google_place_id: c.google_place_id ?? '',
  rating: c.rating === null || c.rating === undefined ? '' : String(c.rating),
  review_count: c.review_count ? String(c.review_count) : '',
  rating_checked_at: c.rating_checked_at ?? '',
  photos: photoEntries(c.photos, ''),
});

const toPatch = (f: Form) => ({
  address: f.address,
  pincode: f.pincode,
  landmark: f.landmark,
  contact_phone: f.contact_phone,
  operating_hours: f.operating_hours,
  description: f.description,
  description_reviewed: f.description_reviewed,
  facilities: f.facilities.split(',').map((s) => s.trim()).filter(Boolean),
  established_year: f.established_year,
  google_business_url: f.google_business_url,
  google_reviews_url: f.google_reviews_url,
  google_place_id: f.google_place_id,
  rating: f.rating,
  review_count: f.review_count,
  rating_checked_at: f.rating_checked_at,
  photos: f.photos,
});

function Card({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <Paper variant="outlined" component="section" sx={{ p: 3 }}>
      <Typography component="h2" variant="h6" sx={{ fontWeight: 700 }}>
        {title}
      </Typography>
      {subtitle && (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          {subtitle}
        </Typography>
      )}
      {children}
    </Paper>
  );
}

export default function CentreEditPage() {
  const { id } = useParams<{ id: string }>();
  const [centre, setCentre] = useState<Centre | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [toast, setToast] = useState<string | null>(null);
  const [nextKind, setNextKind] = useState<PhotoKind>('exterior');
  // Upload results carry the OG rendition and size; the shared field only passes the URL on.
  const uploaded = useRef(new Map<string, Omit<CentrePhotoEntry, 'url' | 'alt'>>());

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/centres/${id}`)
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error || 'Could not load the centre');
        if (cancelled) return;
        setCentre(body.centre);
        setForm(toForm(body.centre));
      })
      .catch((e) => !cancelled && setLoadError(e.message));
    return () => {
      cancelled = true;
    };
  }, [id]);

  const set = useCallback(<K extends keyof Form>(key: K, value: Form[K]) => setForm((f) => (f ? { ...f, [key]: value } : f)), []);

  const upload = useCallback(
    async (file: File) => {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('centreId', id);
      fd.append('kind', nextKind);
      const res = await fetch('/api/centres/upload', { method: 'POST', body: fd });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'Upload failed');
      uploaded.current.set(body.url, { og: body.og, w: body.w, h: body.h, kind: body.kind });
      return { url: body.url as string };
    },
    [id, nextKind],
  );

  const addPhoto = (url: string | null) => {
    if (!url || !form) return;
    const meta = uploaded.current.get(url);
    const kind = meta?.kind ?? nextKind;
    // A starting description staff can sharpen; the server needs one before saving.
    const alt = `${PHOTO_KINDS.find((k) => k.value === kind)?.label ?? 'Photo'} at Neram Classes, ${centre?.city ?? ''}`.replace(/, $/, '');
    set('photos', [...form.photos, { url, alt, kind, og: meta?.og ?? null, w: meta?.w ?? null, h: meta?.h ?? null, hero: form.photos.length === 0 }]);
  };

  const updatePhoto = (i: number, patch: Partial<CentrePhotoEntry>) => {
    if (!form) return;
    set(
      'photos',
      form.photos.map((p, idx) => (idx === i ? { ...p, ...patch } : patch.hero ? { ...p, hero: false } : p)),
    );
  };

  const save = async () => {
    if (!form) return;
    setSaving(true);
    setSaveError(null);
    setFieldErrors({});
    try {
      const res = await fetch(`/api/centres/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(toPatch(form)),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setFieldErrors(body.fields ?? {});
        throw new Error(body.error || 'Could not save');
      }
      setCentre(body.centre);
      setForm(toForm(body.centre));
      setToast(body.revalidated ? 'Saved. The public page updates within a minute.' : 'Saved. The public page updates within a day.');
    } catch (e) {
      setSaveError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const pageUrl = useMemo(() => {
    if (!centre) return null;
    const origin = marketingOriginFor(typeof window === 'undefined' ? null : window.location.origin, process.env.NEXT_PUBLIC_MARKETING_URL);
    return `${origin}${centrePagePath(centre)}`;
  }, [centre]);
  const review = reviewLink(form?.google_place_id);

  if (loadError) return <Alert severity="error">{loadError}</Alert>;
  if (!centre || !form) return <OpsSkeleton variant="rounded" height={480} />;

  const err = (key: string) => (fieldErrors[key] ? { error: true, helperText: fieldErrors[key] } : {});

  return (
    <Box sx={{ pb: 10 }}>
      <Button component={Link} href="/centres" startIcon={<ArrowBackIcon />} sx={{ ...TARGET_44, mb: 1 }}>
        Back to centres
      </Button>
      <OpsPageHeader
        icon={StorefrontOutlinedIcon}
        title={centre.name}
        subtitle={`${centre.city}, ${centre.state}`}
        actions={
          pageUrl && (
            <Button component="a" href={pageUrl} target="_blank" rel="noopener noreferrer" endIcon={<OpenInNewIcon />} variant="outlined" sx={TARGET_44}>
              View public page
            </Button>
          )
        }
      />

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'minmax(0, 1fr) 320px' }, gap: 3, alignItems: 'start' }}>
        <Box sx={{ display: 'grid', gap: 3, minWidth: 0 }}>
          <Card
            title="Photos"
            subtitle="Real photos only, taken at this centre. Google shows one next to the search result. Add at least 4: the outside with the signboard, the classroom, students drawing, the results board. Avoid close-up faces unless the student agreed."
          >
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 2, mb: 2 }}>
              {form.photos.map((p, i) => (
                <Paper key={p.url} variant="outlined" sx={{ overflow: 'hidden' }}>
                  <Box component="img" src={p.url} alt={p.alt || 'Uploaded centre photo'} sx={{ display: 'block', width: '100%', aspectRatio: '4 / 3', objectFit: 'cover', bgcolor: 'grey.100' }} />
                  <Box sx={{ p: 1.5, display: 'grid', gap: 1.5 }}>
                    <TextField
                      label="What the photo shows"
                      value={p.alt}
                      onChange={(e) => updatePhoto(i, { alt: e.target.value })}
                      placeholder="Students drawing in the Vasanth Nagar classroom, Madurai"
                      helperText="Read by Google and by screen readers. Name the place."
                      size="small"
                      required
                      inputProps={{ maxLength: 160 }}
                    />
                    <TextField select label="Type" value={p.kind} onChange={(e) => updatePhoto(i, { kind: e.target.value as PhotoKind })} size="small">
                      {PHOTO_KINDS.map((k) => (
                        <MenuItem key={k.value} value={k.value}>
                          {k.label}
                        </MenuItem>
                      ))}
                    </TextField>
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <FormControlLabel
                        control={<Radio checked={!!p.hero} onChange={() => updatePhoto(i, { hero: true })} />}
                        label="Main photo"
                        sx={{ ...TARGET_44, mr: 0 }}
                      />
                      <Tooltip title="Remove photo">
                        <IconButton aria-label={`Remove photo ${i + 1}`} onClick={() => set('photos', form.photos.filter((_, idx) => idx !== i))} sx={{ width: 44, height: 44 }}>
                          <DeleteOutlineIcon />
                        </IconButton>
                      </Tooltip>
                    </Box>
                  </Box>
                </Paper>
              ))}
            </Box>
            {form.photos.length < 12 && (
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '260px minmax(0, 1fr)' }, gap: 2, alignItems: 'start' }}>
                <TextField select label="Next photo is of" value={nextKind} onChange={(e) => setNextKind(e.target.value as PhotoKind)}>
                  {PHOTO_KINDS.map((k) => (
                    <MenuItem key={k.value} value={k.value}>
                      {k.label}
                    </MenuItem>
                  ))}
                </TextField>
                <ImageUploadField
                  value={null}
                  onChange={addPhoto}
                  upload={upload}
                  label="Add a photo"
                  helperText="JPEG, PNG or WebP, at least 1000px wide. Use the original photo from the phone, not a screenshot or a WhatsApp copy. Black or white bars around a photo are cut off automatically."
                  maxSizeMB={15}
                  accept="image/jpeg,image/png,image/webp"
                />
              </Box>
            )}
            {fieldErrors.photos && (
              <Alert severity="error" sx={{ mt: 2 }}>
                {fieldErrors.photos}
              </Alert>
            )}
          </Card>

          <Card title="Address and contact" subtitle="Keep these exactly the same as on Google, Justdial and Sulekha.">
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 160px' }, gap: 2 }}>
              <TextField label="Street address" value={form.address} onChange={(e) => set('address', e.target.value)} {...err('address')} />
              <TextField label="Pincode" value={form.pincode} onChange={(e) => set('pincode', e.target.value)} inputProps={{ inputMode: 'numeric' }} {...err('pincode')} />
              <TextField label="Landmark" value={form.landmark} onChange={(e) => set('landmark', e.target.value)} placeholder="Near Lakshmi Shruthi Signal" {...err('landmark')} />
              <TextField label="Phone" value={form.contact_phone} onChange={(e) => set('contact_phone', e.target.value)} inputProps={{ inputMode: 'tel' }} {...err('contact_phone')} />
            </Box>
          </Card>

          <Card title="Opening hours" subtitle="The page shows these. Untick a day when the centre is closed.">
            <Box sx={{ display: 'grid', gap: 1 }}>
              {DAYS.map((d) => {
                const h = form.operating_hours[d] ?? null;
                const setDay = (v: { open: string; close: string } | null) => set('operating_hours', { ...form.operating_hours, [d]: v });
                return (
                  <Box key={d} sx={{ display: 'grid', gridTemplateColumns: '160px 140px 140px', gap: 2, alignItems: 'center' }}>
                    <FormControlLabel
                      control={<Checkbox checked={!!h} onChange={(e) => setDay(e.target.checked ? { open: '09:00', close: '18:00' } : null)} />}
                      label={DAY_LABEL[d]}
                      sx={TARGET_44}
                    />
                    {h ? (
                      <>
                        <TextField type="time" size="small" label="Opens" value={h.open} onChange={(e) => setDay({ ...h, open: e.target.value })} />
                        <TextField type="time" size="small" label="Closes" value={h.close} onChange={(e) => setDay({ ...h, close: e.target.value })} />
                      </>
                    ) : (
                      <Typography color="text.secondary">Closed</Typography>
                    )}
                  </Box>
                );
              })}
            </Box>
            {fieldErrors.operating_hours && (
              <Alert severity="error" sx={{ mt: 2 }}>
                {fieldErrors.operating_hours}
              </Alert>
            )}
          </Card>

          <Card
            title="About this centre"
            subtitle="Shown as “Our {city} centre” on the page, only after a reviewer ticks the box. Real facts only: where it is, who teaches, batch timings, what students do here. No “best” or “No.1” claims."
          >
            <Box sx={{ display: 'grid', gap: 2 }}>
              <TextField
                label="About this centre"
                value={form.description}
                onChange={(e) => set('description', e.target.value)}
                multiline
                minRows={5}
                inputProps={{ maxLength: 2000 }}
                helperText={`${form.description.length} of 2000. Leave a blank line between paragraphs.`}
                {...err('description')}
              />
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 200px' }, gap: 2 }}>
                <TextField label="Facilities" value={form.facilities} onChange={(e) => set('facilities', e.target.value)} helperText="Separate with commas, e.g. Drawing tables, AC classroom" {...err('facilities')} />
                <TextField label="Year the centre opened" value={form.established_year} onChange={(e) => set('established_year', e.target.value)} inputProps={{ inputMode: 'numeric' }} {...err('established_year')} />
              </Box>
              <FormControlLabel
                control={<Checkbox checked={form.description_reviewed} onChange={(e) => set('description_reviewed', e.target.checked)} />}
                label="I checked the description, facilities and year against the centre. Show them on the page."
                sx={TARGET_44}
              />
            </Box>
          </Card>

          <Card title="Google profile" subtitle="The page links to the profile for reviews and directions.">
            <Box sx={{ display: 'grid', gap: 2 }}>
              <TextField label="Google Business Profile link" value={form.google_business_url} onChange={(e) => set('google_business_url', e.target.value)} {...err('google_business_url')} />
              <TextField label="Google reviews link (optional)" value={form.google_reviews_url} onChange={(e) => set('google_reviews_url', e.target.value)} {...err('google_reviews_url')} />
              <TextField
                label="Google Place ID"
                value={form.google_place_id}
                onChange={(e) => set('google_place_id', e.target.value)}
                helperText={
                  fieldErrors.google_place_id || (
                    <>
                      Find it with{' '}
                      <a href="https://developers.google.com/maps/documentation/places/web-service/place-id" target="_blank" rel="noopener noreferrer">
                        Google’s Place ID finder
                      </a>
                      . Starts with ChIJ.
                    </>
                  )
                }
                error={!!fieldErrors.google_place_id}
              />
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '140px 160px 200px' }, gap: 2 }}>
                <TextField label="Rating" value={form.rating} onChange={(e) => set('rating', e.target.value)} placeholder="4.7" inputProps={{ inputMode: 'decimal' }} {...err('rating')} />
                <TextField label="Reviews" value={form.review_count} onChange={(e) => set('review_count', e.target.value)} placeholder="37" inputProps={{ inputMode: 'numeric' }} {...err('review_count')} />
                <TextField label="Checked on" type="date" value={form.rating_checked_at} onChange={(e) => set('rating_checked_at', e.target.value)} InputLabelProps={{ shrink: true }} {...err('rating_checked_at')} />
              </Box>
              <Typography variant="body2" color="text.secondary">
                Copy the rating and review count from Google. The page shows “Rated 4.7 on Google by 37 students” for 90 days after the date you checked.
              </Typography>
              <Box>
                <Button
                  variant="outlined"
                  startIcon={<ContentCopyIcon />}
                  disabled={!review}
                  onClick={() => review && navigator.clipboard.writeText(review).then(() => setToast('Review link copied. Send it to students on WhatsApp.'))}
                  sx={TARGET_44}
                >
                  Copy Google review link
                </Button>
                {!review && (
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                    Add the Place ID to get the link.
                  </Typography>
                )}
              </Box>
            </Box>
          </Card>
        </Box>

        <Paper variant="outlined" component="aside" aria-label="What the page still needs" sx={{ p: 2.5, position: { lg: 'sticky' }, top: { lg: 88 } }}>
          <Typography component="h2" sx={{ fontWeight: 700, mb: 1.5 }}>
            Page checklist
          </Typography>
          <Box component="ul" sx={{ listStyle: 'none', p: 0, m: 0, display: 'grid', gap: 1.25 }}>
            {centre.checklist.map((i) => (
              <Box component="li" key={i.key}>
                <StatusChip icon={i.done ? CheckCircleOutlineIcon : ErrorOutlineIcon} label={i.label} tone={i.done ? 'success' : 'warning'} />
                {!i.done && (
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, ml: 0.5 }}>
                    {i.hint}
                  </Typography>
                )}
              </Box>
            ))}
          </Box>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1.5 }}>
            Updates after you save.
          </Typography>
        </Paper>
      </Box>

      <Paper
        elevation={6}
        sx={{ position: 'fixed', bottom: 16, right: 24, p: 1.5, display: 'flex', gap: 1.5, alignItems: 'center', zIndex: 20, maxWidth: 'calc(100vw - 48px)' }}
      >
        {saveError && (
          <Typography color="error" role="alert" sx={{ fontWeight: 600 }}>
            {saveError}
          </Typography>
        )}
        <Button variant="contained" onClick={save} disabled={saving} sx={{ ...TARGET_44, minWidth: 140 }}>
          {saving ? 'Saving...' : 'Save centre'}
        </Button>
      </Paper>

      <Snackbar open={!!toast} autoHideDuration={4000} onClose={() => setToast(null)} message={toast} anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }} />
    </Box>
  );
}
