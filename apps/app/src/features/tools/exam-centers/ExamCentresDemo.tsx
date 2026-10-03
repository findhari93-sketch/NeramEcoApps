'use client';

import { useMemo, useState } from 'react';
import { Box, Chip, MenuItem, TextField, Typography } from '@neram/ui';
import PlaceOutlinedIcon from '@mui/icons-material/PlaceOutlined';
import { haversineKm, roundKm } from '@neram/geo/haversine';
import DemoGate from '@/components/tools/DemoGate';

/** Trimmed centre, as embedded in the page (about 100 rows). */
export interface DemoCentre {
  label: string;
  state: string;
  lat: number;
  lng: number;
  combined: boolean;
  cities: string[];
  confirmed: boolean;
  venue: string | null;
}

/** Trimmed city: slug, name, state slug, lat, lng. */
export type DemoCity = [string, string, string, number, number];

interface Props {
  centres: DemoCentre[];
  cities: DemoCity[];
  states: Array<{ slug: string; name: string }>;
  initialState?: string;
  initialCity?: string;
}

function nearest(city: DemoCity, centres: DemoCentre[]) {
  const [slug, , , lat, lng] = city;
  return centres
    .filter((c) => c.state !== 'international' && (!c.combined || c.cities.includes(slug)))
    .map((c) => {
      const here = c.cities.includes(slug);
      return { c, here, km: here ? 0 : roundKm(haversineKm({ lat, lng }, c)) };
    })
    .sort((a, b) => Number(b.here) - Number(a.here) || a.km - b.km)
    .slice(0, 3);
}

/**
 * Public demo: pick a state and a city, get the three nearest NATA test cities
 * with straight-line km. Signed in: your exact location, venues, directions.
 */
export default function ExamCentresDemo({ centres, cities, states, initialState = '', initialCity = '' }: Props) {
  const [state, setState] = useState(initialState);
  const [city, setCity] = useState(initialCity);

  const stateCities = useMemo(() => cities.filter((c) => c[2] === state), [cities, state]);
  const stateCentres = useMemo(() => centres.filter((c) => c.state === state), [centres, state]);
  const selected = stateCities.find((c) => c[0] === city) ?? null;
  const result = useMemo(() => (selected ? nearest(selected, centres) : []), [selected, centres]);

  const fieldSx = { '& .MuiInputBase-root': { minHeight: 48 } };

  return (
    <Box>
      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' } }}>
        <TextField
          select
          label="Your state"
          value={state}
          onChange={(e) => {
            setState(e.target.value);
            setCity('');
          }}
          sx={fieldSx}
          SelectProps={{ MenuProps: { PaperProps: { sx: { maxHeight: 360 } } } }}
        >
          {states.map((s) => (
            <MenuItem key={s.slug} value={s.slug} sx={{ minHeight: 44 }}>
              {s.name}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          select
          label="Your city or nearest town"
          value={city}
          onChange={(e) => setCity(e.target.value)}
          disabled={!state}
          helperText={state ? ' ' : 'Choose your state first'}
          sx={fieldSx}
          SelectProps={{ MenuProps: { PaperProps: { sx: { maxHeight: 360 } } } }}
        >
          {stateCities.map((c) => (
            <MenuItem key={c[0]} value={c[0]} sx={{ minHeight: 44 }}>
              {c[1]}
            </MenuItem>
          ))}
        </TextField>
      </Box>

      {state && !selected && (
        <Typography variant="body2" sx={{ mt: 1.5 }}>
          {stateCentres.length > 0
            ? `Test cities in ${states.find((s) => s.slug === state)?.name}: ${stateCentres.map((c) => c.label).join(', ')}.`
            : `There is no NATA test city in ${states.find((s) => s.slug === state)?.name}. Pick your city to see the nearest ones.`}
        </Typography>
      )}

      <Box aria-live="polite" sx={{ mt: 2, minHeight: 96 }}>
        {selected && result.length > 0 ? (
          <Box component="ol" sx={{ listStyle: 'none', p: 0, m: 0, display: 'grid', gap: 1 }}>
            {result.map(({ c, km, here }, i) => (
              <Box
                component="li"
                key={c.label + c.state}
                sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start', p: 1.5, borderRadius: 2, bgcolor: i === 0 ? 'action.hover' : 'transparent', border: '1px solid', borderColor: 'divider' }}
              >
                <PlaceOutlinedIcon aria-hidden="true" sx={{ color: 'primary.main', mt: '2px' }} />
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography component="div" sx={{ fontWeight: 700 }}>
                    {c.label}
                    {c.confirmed && <Chip size="small" label="Confirmed" color="success" variant="outlined" sx={{ ml: 1, height: 22 }} />}
                  </Typography>
                  <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                    {states.find((s) => s.slug === c.state)?.name ?? ''}
                  </Typography>
                </Box>
                <Typography sx={{ fontWeight: 700, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                  {here ? 'In your city' : `${km} km`}
                </Typography>
              </Box>
            ))}
          </Box>
        ) : (
          <Typography variant="body2" sx={{ color: 'text.secondary', p: 2, borderRadius: 2.5, border: '1px dashed', borderColor: 'divider' }}>
            Pick your state and city to see the three nearest NATA test cities.
          </Typography>
        )}
      </Box>

      {selected && result.length > 0 && (
        <DemoGate
          toolId="nata-exam-centers"
          headline={`Plan your trip to ${result[0].c.label}`}
          benefits={['Nearest centres from your exact location', 'Likely venues and alternates', 'Directions and a saved preference']}
          cta="Sign in free to continue"
          input={{ state, city }}
        />
      )}
    </Box>
  );
}
