'use client';

import { useState } from 'react';
import { Box, Button, Checkbox, Chip, FormControlLabel, Stack, TextField, Typography } from '@mui/material';
import { ImageUploadField, ImageUploadList } from '@neram/ui';
import type { FieldDef, SectionDef } from '@/lib/college-dashboard/content-sections';
import { mapEmbedUrl, parseCoordinates } from '@/lib/college-hub/map';

/**
 * The fields of one college content section (fees, admissions, location...),
 * shared by the college dashboard (/college-dashboard/profile) and the no-login
 * update link (/college-update/[token]). Both send the values to the same
 * server check (cleanSubmission) and the same staff review queue.
 */

export type SectionValues = Record<string, unknown>;

/** Form values: text inputs hold strings, the rest keep their type. */
export function toForm(def: SectionDef, source: SectionValues): SectionValues {
  const out: SectionValues = {};
  for (const f of def.fields) {
    const v = source[f.key];
    if (f.kind === 'bool') out[f.key] = v === true;
    else if (f.kind === 'choices' || f.kind === 'images') out[f.key] = Array.isArray(v) ? v : [];
    else if (f.kind === 'list') out[f.key] = Array.isArray(v) ? (v as string[]).join('\n') : '';
    else if (f.kind === 'image') out[f.key] = typeof v === 'string' ? v : null;
    else out[f.key] = v === null || v === undefined ? '' : String(v);
  }
  return out;
}

export function fromForm(def: SectionDef, values: SectionValues): SectionValues {
  const out: SectionValues = {};
  for (const f of def.fields) {
    const v = values[f.key];
    out[f.key] = f.kind === 'list' ? String(v ?? '').split('\n').map((x) => x.trim()).filter(Boolean) : v;
  }
  return out;
}

/** "2027-28" from September 2026 on, "2026-27" before. Fees are for the coming batch. */
export function comingBatch(now: Date = new Date()): string {
  const y = now.getMonth() >= 8 ? now.getFullYear() + 1 : now.getFullYear();
  return `${y}-${String((y + 1) % 100).padStart(2, '0')}`;
}

/** Starting values for a section form: live values, a pending edit on top, a default fee year. */
export function startValues(def: SectionDef, live: SectionValues, pending?: SectionValues | null): SectionValues {
  const form = toForm(def, { ...live, ...(pending ?? {}) });
  if (def.key === 'fees' && !form.academic_year) form.academic_year = comingBatch();
  return form;
}

const INPUT_TYPE: Partial<Record<FieldDef['kind'], { type?: string; inputMode?: 'numeric' | 'decimal' | 'tel' | 'email' | 'url' }>> = {
  phone: { type: 'tel', inputMode: 'tel' },
  email: { type: 'email', inputMode: 'email' },
  url: { type: 'url', inputMode: 'url' },
  int: { inputMode: 'numeric' },
  money: { inputMode: 'numeric' },
  decimal: { inputMode: 'decimal' },
  lat: { inputMode: 'decimal' },
  lng: { inputMode: 'decimal' },
  date: { type: 'date' },
};

interface Props {
  def: SectionDef;
  values: SectionValues;
  errors: Record<string, string>;
  /** One field changed, or several at once (the map pin sets latitude and longitude). */
  onChange: (patch: SectionValues) => void;
  disabled: boolean;
  /** Hides the map pin helper (read-only views). */
  readOnly?: boolean;
  upload: (file: File) => Promise<{ url: string }>;
}

export default function SectionFields({ def, values, errors, onChange, disabled, readOnly = false, upload }: Props) {
  const [pasted, setPasted] = useState('');
  const set = (key: string, v: unknown) => onChange({ [key]: v });
  const off = disabled || readOnly;

  const lat = Number(values.latitude);
  const lng = Number(values.longitude);
  const hasPin = def.key === 'location' && values.latitude !== '' && values.longitude !== '' && Number.isFinite(lat) && Number.isFinite(lng);

  const renderField = (f: FieldDef) => {
    const err = errors[f.key];
    switch (f.kind) {
      case 'bool':
        return (
          <FormControlLabel
            control={<Checkbox checked={values[f.key] === true} onChange={(e) => set(f.key, e.target.checked)} disabled={off} />}
            label={f.label}
            sx={{ minHeight: 44, m: 0 }}
          />
        );
      case 'choices': {
        const picked = (values[f.key] as string[]) ?? [];
        return (
          <Box component="fieldset" sx={{ border: 0, m: 0, p: 0 }}>
            <Typography component="legend" sx={{ fontSize: 14, fontWeight: 600, mb: 1 }}>{f.label}</Typography>
            <Stack direction="row" flexWrap="wrap" gap={1}>
              {f.options!.map((o) => {
                const on = picked.includes(o);
                return (
                  <Chip
                    key={o}
                    label={o}
                    clickable={!off}
                    aria-pressed={on}
                    color={on ? 'primary' : 'default'}
                    variant={on ? 'filled' : 'outlined'}
                    onClick={off ? undefined : () => set(f.key, on ? picked.filter((x) => x !== o) : [...picked, o])}
                    sx={{ minHeight: 40, fontSize: 14 }}
                  />
                );
              })}
            </Stack>
          </Box>
        );
      }
      case 'image':
        return (
          <ImageUploadField
            value={(values[f.key] as string | null) ?? null}
            onChange={(url) => set(f.key, url)}
            upload={upload}
            label={f.label}
            helperText={f.help}
            maxSizeMB={8}
            accept="image/jpeg,image/png,image/webp"
            camera
            previewable
            disabled={off}
            error={err || undefined}
          />
        );
      case 'images':
        return (
          <ImageUploadList
            values={(values[f.key] as string[]) ?? []}
            onChange={(urls) => set(f.key, urls)}
            upload={upload}
            label={f.label}
            helperText={f.help}
            maxFiles={f.max}
            maxSizeMB={8}
            accept="image/jpeg,image/png,image/webp"
            camera
            disabled={off}
            error={err || undefined}
          />
        );
      default: {
        const t = INPUT_TYPE[f.kind] ?? {};
        const multi = f.kind === 'longtext' || f.kind === 'list';
        return (
          <TextField
            label={f.label}
            name={`${def.key}.${f.key}`}
            value={(values[f.key] as string) ?? ''}
            onChange={(e) => set(f.key, e.target.value)}
            type={t.type}
            inputProps={{ inputMode: t.inputMode, maxLength: f.kind === 'longtext' ? f.max : undefined }}
            InputLabelProps={f.kind === 'date' ? { shrink: true } : undefined}
            multiline={multi}
            minRows={multi ? (f.kind === 'list' ? 3 : 4) : undefined}
            helperText={err || (f.kind === 'list' ? `${f.help ?? ''} One per line.`.trim() : f.help)}
            error={!!err}
            fullWidth
            disabled={off}
          />
        );
      }
    }
  };

  return (
    <>
      {def.key === 'location' && !readOnly && (
        <Box sx={{ mb: 2, p: 2, borderRadius: 2, bgcolor: 'grey.50', border: '1px solid', borderColor: 'divider' }}>
          <Typography sx={{ fontWeight: 600, fontSize: 14.5, mb: 0.5 }}>Set your map pin</Typography>
          <Typography sx={{ fontSize: 14, color: 'text.secondary', mb: 1.5 }}>
            In Google Maps, find your main gate, press and hold on it (right-click on a computer), and copy the numbers or the link. Paste it here.
          </Typography>
          <Stack direction={{ xs: 'column', sm: 'row' }} gap={1}>
            <TextField
              label="Google Maps link or coordinates"
              value={pasted}
              onChange={(e) => setPasted(e.target.value)}
              size="small"
              fullWidth
              disabled={disabled}
              helperText={pasted && !parseCoordinates(pasted) ? 'We could not find coordinates in this. Try copying the numbers.' : ' '}
              error={!!pasted && !parseCoordinates(pasted)}
            />
            <Button
              variant="outlined"
              disabled={disabled || !parseCoordinates(pasted)}
              onClick={() => {
                const p = parseCoordinates(pasted);
                if (!p) return;
                onChange({ latitude: String(p.lat), longitude: String(p.lng) });
                setPasted('');
              }}
              sx={{ minHeight: 40, flexShrink: 0, alignSelf: { sm: 'flex-start' } }}
            >
              Use this pin
            </Button>
          </Stack>
        </Box>
      )}

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))' }, gap: 2 }}>
        {def.fields.map((f) => (
          <Box key={f.key} sx={{ gridColumn: f.half ? 'auto' : '1 / -1', minWidth: 0 }}>
            {renderField(f)}
          </Box>
        ))}
      </Box>

      {hasPin && (
        <Box sx={{ mt: 2, borderRadius: 2, overflow: 'hidden', border: '1px solid', borderColor: 'divider', aspectRatio: { xs: '4 / 3', sm: '16 / 7' } }}>
          <Box component="iframe" title="Map preview of your pin" src={mapEmbedUrl({ lat, lng })} loading="lazy" referrerPolicy="no-referrer-when-downgrade" sx={{ width: '100%', height: '100%', border: 0, display: 'block' }} />
        </Box>
      )}
    </>
  );
}
