'use client';

import { useMemo, useState } from 'react';
import { Box, MenuItem, TextField, Typography } from '@neram/ui';
import SchoolOutlinedIcon from '@mui/icons-material/SchoolOutlined';
import DemoGate from '@/components/tools/DemoGate';

/** One college as embedded in the page: closing OC mark (TNEA) or State Merit closing rank (KEAM). */
export interface DemoCutoffCollege {
  name: string;
  place: string | null;
  /** TNEA: lowest mark allotted in the open (OC) category, out of 400. */
  mark?: number;
  /** KEAM: closing rank in State Merit. */
  rank?: number;
}

export interface DemoSystem {
  code: 'TNEA_BARCH' | 'KEAM_BARCH';
  label: string;
  year: number;
  colleges: DemoCutoffCollege[];
}

interface Props {
  systems: DemoSystem[];
  initialSystem?: string;
}

const FREE = 3;

/**
 * Public demo: pick a counselling, enter your mark (TNEA) or rank (KEAM), see
 * the top three colleges you would have got last year and how many more.
 */
export default function CollegePredictorDemo({ systems, initialSystem }: Props) {
  const [code, setCode] = useState(initialSystem && systems.some((s) => s.code === initialSystem) ? initialSystem : systems[0]?.code ?? '');
  const [value, setValue] = useState('');
  const system = systems.find((s) => s.code === code);
  const byMark = system?.code === 'TNEA_BARCH';
  const n = parseFloat(value);
  const valid = Number.isFinite(n) && (byMark ? n > 0 && n <= 400 : n >= 1);

  const matches = useMemo(() => {
    if (!system || !valid) return [];
    return byMark
      ? system.colleges.filter((c) => c.mark != null && c.mark <= n).sort((a, b) => (b.mark ?? 0) - (a.mark ?? 0))
      : system.colleges.filter((c) => c.rank != null && c.rank >= n).sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0));
  }, [system, valid, byMark, n]);

  if (!system) return <Typography>No counselling data is available right now.</Typography>;

  const shown = matches.slice(0, FREE);
  const more = matches.length - shown.length;
  const fieldSx = { '& .MuiInputBase-root': { minHeight: 48 } };

  return (
    <Box>
      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' } }}>
        <TextField
          select
          label="Counselling"
          value={code}
          onChange={(e) => {
            setCode(e.target.value);
            setValue('');
          }}
          sx={fieldSx}
        >
          {systems.map((s) => (
            <MenuItem key={s.code} value={s.code} sx={{ minHeight: 44 }}>
              {s.label}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          label={byMark ? 'Your cutoff out of 400' : 'Your KEAM B.Arch rank'}
          value={value}
          onChange={(e) => setValue(e.target.value.replace(byMark ? /[^\d.]/g : /[^\d]/g, ''))}
          inputProps={{ inputMode: byMark ? 'decimal' : 'numeric' }}
          error={value !== '' && !valid}
          helperText={value !== '' && !valid ? (byMark ? 'Enter a mark from 1 to 400' : 'Enter a rank of 1 or more') : `Compared with ${system.label} ${system.year}, open category`}
          sx={fieldSx}
        />
      </Box>

      <Box aria-live="polite" sx={{ mt: 2, minHeight: 96 }}>
        {valid ? (
          matches.length > 0 ? (
            <>
              <Typography variant="body2" sx={{ mb: 1, color: 'text.secondary' }}>
                {matches.length} college{matches.length === 1 ? '' : 's'} closed at or {byMark ? 'below your mark' : 'after your rank'} in {system.year}. The strongest first:
              </Typography>
              <Box component="ol" sx={{ listStyle: 'none', p: 0, m: 0, display: 'grid', gap: 1 }}>
                {shown.map((c) => (
                  <Box component="li" key={c.name} sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start', p: 1.5, borderRadius: 2, border: '1px solid', borderColor: 'divider' }}>
                    <SchoolOutlinedIcon aria-hidden="true" sx={{ color: 'primary.main', mt: '2px' }} />
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography sx={{ fontWeight: 700, lineHeight: 1.35 }}>{c.name}</Typography>
                      {c.place && (
                        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                          {c.place}
                        </Typography>
                      )}
                    </Box>
                    <Typography sx={{ fontWeight: 700, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                      {byMark ? `${c.mark}` : `#${c.rank}`}
                    </Typography>
                  </Box>
                ))}
              </Box>
            </>
          ) : (
            <Typography sx={{ p: 2, borderRadius: 2.5, bgcolor: 'action.hover' }}>
              No college closed {byMark ? 'at or below this mark' : 'at or after this rank'} in the open category last year. Reserved categories often close lower, so sign in to check yours.
            </Typography>
          )
        ) : (
          <Typography variant="body2" sx={{ color: 'text.secondary', p: 2, borderRadius: 2.5, border: '1px dashed', borderColor: 'divider' }}>
            {byMark ? 'Enter your cutoff out of 400 to see the colleges you could get.' : 'Enter your rank to see the colleges you could get.'}
          </Typography>
        )}
      </Box>

      {valid && (
        <DemoGate
          toolId="counseling-college-predictor"
          headline={more > 0 ? `+${more} more college${more === 1 ? '' : 's'} for your ${byMark ? 'mark' : 'rank'}` : 'Check your category and round'}
          benefits={['Every matching college, not just three', 'Your community or category, round by round', 'Seat-aware chances and a saved shortlist']}
          input={{ system: code, value: n }}
        />
      )}
    </Box>
  );
}
