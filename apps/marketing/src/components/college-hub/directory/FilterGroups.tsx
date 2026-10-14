'use client';

import { useEffect, useState } from 'react';
import { Box, Typography } from '@mui/material';
import { alpha } from '@mui/material/styles';
import StarRoundedIcon from '@mui/icons-material/StarRounded';
import {
  COLLEGE_TYPES,
  DIRECTORY_FEE_PRESETS,
  EXAM_FILTERS,
  NAAC_GRADES,
  RATING_OPTIONS,
  SORT_OPTIONS,
} from '@/lib/college-hub/constants';
import type { FacetCounts } from '@/lib/college-hub/listing-filter';
import { formatRupees } from '@/lib/college-hub/format';
import { toggleIn, type FilterDraft, type SortKey } from './filter-model';

export interface GroupProps {
  draft: FilterDraft;
  onChange: (next: FilterDraft) => void;
  facets?: FacetCounts;
  /** Phone sheet rows are taller (48px) than the desktop rail's (40px). */
  touch?: boolean;
}

// ─── Option row (checkbox or radio with a count) ─────────────────────────────

interface OptionRowProps {
  type: 'checkbox' | 'radio';
  name: string;
  label: React.ReactNode;
  checked: boolean;
  count?: number;
  onChange: () => void;
  touch?: boolean;
}

export function OptionRow({ type, name, label, checked, count, onChange, touch }: OptionRowProps) {
  const disabled = count === 0 && !checked;
  return (
    <Box
      component="label"
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1.25,
        minHeight: touch ? 48 : 40,
        px: touch ? 2 : 0,
        borderBottom: touch ? '1px solid' : 0,
        borderColor: 'divider',
        bgcolor: (t) => (touch && checked ? alpha(t.palette.primary.main, 0.06) : 'transparent'),
        fontSize: touch ? 15 : 14,
        fontWeight: checked ? 600 : 400,
        color: disabled ? 'text.disabled' : 'text.primary',
        cursor: disabled ? 'not-allowed' : 'pointer',
        '&:focus-within': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: -2, borderRadius: 1 },
      }}
    >
      <Box
        component="input"
        type={type}
        name={name}
        checked={checked}
        disabled={disabled}
        onChange={onChange}
        sx={{ flex: '0 0 auto', width: 18, height: 18, m: 0, accentColor: (t) => t.palette.primary.main, cursor: 'inherit' }}
      />
      <Box component="span" sx={{ flex: '1 1 auto', minWidth: 0, display: 'flex', alignItems: 'center', gap: 0.5 }}>
        {label}
      </Box>
      {count != null && (
        <Box component="span" sx={{ fontSize: 12.5, color: disabled ? 'text.disabled' : 'text.secondary', fontVariantNumeric: 'tabular-nums' }}>
          {count}
        </Box>
      )}
    </Box>
  );
}

// ─── COA switch ──────────────────────────────────────────────────────────────

export function CoaSwitch({ draft, onChange, touch }: GroupProps) {
  const on = draft.coa;
  return (
    <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 1.5, px: touch ? 2 : 0, py: touch ? 1.25 : 0 }}>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.25 }}>
        <Box component="span" id="coa-switch-label" sx={{ fontSize: 14.5, fontWeight: 600 }}>
          COA approved only
        </Box>
        <Box component="span" sx={{ fontSize: 12.5, color: 'text.secondary', lineHeight: 1.4 }}>
          Recognised by the Council of Architecture
        </Box>
      </Box>
      <Box
        component="button"
        type="button"
        role="switch"
        aria-checked={on}
        aria-labelledby="coa-switch-label"
        onClick={() => onChange({ ...draft, coa: !on })}
        sx={{
          position: 'relative',
          flex: '0 0 auto',
          width: 48,
          height: 28,
          mt: 0.25,
          p: 0,
          border: 0,
          borderRadius: 14,
          bgcolor: on ? 'primary.main' : 'grey.400',
          cursor: 'pointer',
          transition: 'background-color 0.2s',
          '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 2 },
          // Bigger hit area than the visual switch.
          '&::before': { content: '""', position: 'absolute', inset: -8 },
          '@media (prefers-reduced-motion: reduce)': { transition: 'none', '& span': { transition: 'none' } },
        }}
      >
        <Box
          component="span"
          sx={{
            position: 'absolute',
            top: 3,
            left: on ? 23 : 3,
            width: 22,
            height: 22,
            borderRadius: '50%',
            bgcolor: 'common.white',
            boxShadow: '0 1px 2px rgba(0,0,0,0.25)',
            transition: 'left 0.2s',
          }}
        />
      </Box>
    </Box>
  );
}

// ─── Groups ──────────────────────────────────────────────────────────────────

export function ExamGroup({ draft, onChange, facets, touch }: GroupProps) {
  return (
    <>
      {EXAM_FILTERS.map((e) => (
        <OptionRow
          key={e.value}
          type="checkbox"
          name="exam"
          label={e.label}
          checked={draft.exam.includes(e.value)}
          count={facets?.exam[e.value] ?? (facets ? 0 : undefined)}
          onChange={() => onChange({ ...draft, exam: toggleIn(draft.exam, e.value) })}
          touch={touch}
        />
      ))}
    </>
  );
}

export function TypeGroup({ draft, onChange, facets, touch }: GroupProps) {
  return (
    <>
      {COLLEGE_TYPES.map((t) => {
        const key = t.value.toLowerCase();
        return (
          <OptionRow
            key={key}
            type="checkbox"
            name="type"
            label={t.label}
            checked={draft.type.includes(key)}
            count={facets?.type[key] ?? (facets ? 0 : undefined)}
            onChange={() => onChange({ ...draft, type: toggleIn(draft.type, key) })}
            touch={touch}
          />
        );
      })}
    </>
  );
}

export function NaacGroup({ draft, onChange, facets, touch }: GroupProps) {
  const picked = draft.naac.filter((g) => g !== 'none');
  const includeNone = draft.naac.includes('none');
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25, px: touch ? 2 : 0, py: touch ? 1.5 : 0 }}>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 0.75 }}>
        {NAAC_GRADES.map((g) => {
          const on = draft.naac.includes(g);
          const count = facets ? facets.naac[g] ?? 0 : undefined;
          const disabled = count === 0 && !on;
          return (
            <Box
              key={g}
              component="button"
              type="button"
              aria-pressed={on}
              disabled={disabled}
              onClick={() => onChange({ ...draft, naac: toggleIn(draft.naac, g) })}
              sx={{
                height: 44,
                border: '1px solid',
                borderColor: on ? 'primary.main' : disabled ? 'divider' : 'grey.400',
                borderRadius: 1.5,
                bgcolor: (t) => (on ? alpha(t.palette.primary.main, 0.1) : disabled ? t.palette.action.hover : t.palette.background.paper),
                color: on ? 'primary.dark' : disabled ? 'text.disabled' : 'text.primary',
                font: 'inherit',
                fontSize: 13.5,
                fontWeight: 700,
                cursor: disabled ? 'not-allowed' : 'pointer',
                '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 2 },
              }}
            >
              {g}
              {count != null && (
                <Box component="span" sx={{ ml: 0.5, fontWeight: 400, color: disabled ? 'text.disabled' : 'text.secondary' }}>
                  {count}
                </Box>
              )}
            </Box>
          );
        })}
      </Box>
      {picked.length > 0 && (
        <OptionRow
          type="checkbox"
          name="naac-none"
          label="Include colleges with no NAAC grade"
          checked={includeNone}
          onChange={() => onChange({ ...draft, naac: toggleIn(draft.naac, 'none') })}
        />
      )}
      {picked.length === 0 && facets && (facets.naac.none ?? 0) > 0 && (
        <Typography sx={{ m: 0, fontSize: '0.8rem', color: 'text.secondary', lineHeight: 1.45 }}>
          {facets.naac.none} colleges have no NAAC grade yet.
        </Typography>
      )}
    </Box>
  );
}

interface FeeGroupProps extends GroupProps {
  histogram?: number[];
}

/** Commits a typed rupee amount on blur or Enter, not on every key. */
function FeeInput({ label, value, placeholder, onCommit }: { label: string; value?: number; placeholder: string; onCommit: (v?: number) => void }) {
  const [text, setText] = useState(value ? String(value) : '');
  useEffect(() => setText(value ? String(value) : ''), [value]);
  const commit = () => {
    const n = Number(text.replace(/[^\d]/g, ''));
    onCommit(Number.isFinite(n) && n > 0 ? n : undefined);
  };
  return (
    <Box component="label" sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, fontSize: '0.78rem', color: 'text.secondary', fontWeight: 600 }}>
      {label}
      <Box
        component="input"
        type="text"
        inputMode="numeric"
        value={text}
        placeholder={placeholder}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e: React.KeyboardEvent) => {
          if (e.key === 'Enter') commit();
        }}
        sx={{
          height: 44,
          px: 1.25,
          boxSizing: 'border-box',
          width: '100%',
          border: '1px solid',
          borderColor: 'grey.400',
          borderRadius: 1.5,
          font: 'inherit',
          fontSize: '1rem',
          fontWeight: 400,
          color: 'text.primary',
          bgcolor: 'background.paper',
          '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 0 },
        }}
      />
    </Box>
  );
}

export function FeeGroup({ draft, onChange, histogram, touch }: FeeGroupProps) {
  const max = histogram ? Math.max(1, ...histogram) : 1;
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, px: touch ? 2 : 0, py: touch ? 1.5 : 0 }}>
      {histogram && histogram.some((n) => n > 0) && (
        <Box aria-hidden sx={{ display: 'flex', alignItems: 'flex-end', gap: 0.5, height: 44, px: 0.5 }}>
          {histogram.map((n, i) => (
            <Box
              key={i}
              sx={{
                flex: '1 1 0',
                height: `${Math.max(4, Math.round((n / max) * 100))}%`,
                borderRadius: '3px 3px 0 0',
                bgcolor: (t) => alpha(t.palette.primary.main, n ? 0.45 : 0.15),
              }}
            />
          ))}
        </Box>
      )}
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 1 }}>
        <FeeInput label="Min (₹ a year)" value={draft.minFee} placeholder="0" onCommit={(v) => onChange({ ...draft, minFee: v })} />
        <FeeInput label="Max (₹ a year)" value={draft.maxFee} placeholder="Any" onCommit={(v) => onChange({ ...draft, maxFee: v })} />
      </Box>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
        {DIRECTORY_FEE_PRESETS.map((p) => {
          const on = draft.minFee === p.minFee && draft.maxFee === p.maxFee;
          return (
            <Box
              key={p.label}
              component="button"
              type="button"
              aria-pressed={on}
              onClick={() => onChange({ ...draft, minFee: on ? undefined : p.minFee, maxFee: on ? undefined : p.maxFee })}
              sx={{
                minHeight: 36,
                px: 1.5,
                border: '1px solid',
                borderColor: on ? 'primary.main' : 'grey.400',
                borderRadius: 18,
                bgcolor: (t) => (on ? alpha(t.palette.primary.main, 0.1) : t.palette.background.paper),
                color: on ? 'primary.dark' : 'text.primary',
                font: 'inherit',
                fontSize: 13,
                fontWeight: on ? 700 : 500,
                cursor: 'pointer',
                '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 2 },
              }}
            >
              {p.label}
            </Box>
          );
        })}
      </Box>
      {(draft.minFee || draft.maxFee) && (
        <Typography sx={{ m: 0, fontSize: '0.8rem', color: 'text.secondary' }}>
          {draft.minFee ? formatRupees(draft.minFee) : '₹0'} to {draft.maxFee ? formatRupees(draft.maxFee) : 'any amount'} a year
        </Typography>
      )}
    </Box>
  );
}

interface CityGroupProps extends GroupProps {
  cities: { city: string; city_slug: string; count: number }[];
  /** Rows shown before "Show all N cities". */
  initial?: number;
}

export function CityGroup({ draft, onChange, facets, touch, cities, initial = 6 }: CityGroupProps) {
  const [all, setAll] = useState(false);
  // Picked cities stay visible even when beyond the first few.
  const visible = all ? cities : cities.filter((c, i) => i < initial || draft.city.includes(c.city_slug));
  return (
    <>
      {visible.map((c) => (
        <OptionRow
          key={c.city_slug}
          type="checkbox"
          name="city"
          label={c.city}
          checked={draft.city.includes(c.city_slug)}
          count={facets ? facets.city[c.city_slug] ?? 0 : c.count}
          onChange={() => onChange({ ...draft, city: toggleIn(draft.city, c.city_slug) })}
          touch={touch}
        />
      ))}
      {cities.length > initial && (
        <Box
          component="button"
          type="button"
          onClick={() => setAll((v) => !v)}
          sx={{ alignSelf: 'flex-start', minHeight: 40, px: touch ? 2 : 0, border: 0, bgcolor: 'transparent', color: 'primary.dark', font: 'inherit', fontSize: '0.88rem', fontWeight: 600, cursor: 'pointer', '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main' } }}
        >
          {all ? 'Show fewer cities' : `Show all ${cities.length} cities`}
        </Box>
      )}
    </>
  );
}

interface StateGroupProps extends GroupProps {
  states: { state: string; state_slug: string; count: number }[];
  initial?: number;
}

/** State filter for category pages (canvas: "Find a state", counts, "Show all N states"). */
export function StateGroup({ draft, onChange, facets, touch, states, initial = 6 }: StateGroupProps) {
  const [all, setAll] = useState(false);
  const [find, setFind] = useState('');
  const needle = find.trim().toLowerCase();
  const matched = needle ? states.filter((s) => s.state.toLowerCase().includes(needle)) : states;
  const visible = all || needle ? matched : matched.filter((s, i) => i < initial || draft.state.includes(s.state_slug));
  return (
    <>
      {states.length > initial && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, height: 44, px: 1.25, mx: touch ? 2 : 0, my: touch ? 1 : 0, mb: 0.75, boxSizing: 'border-box', border: '1px solid', borderColor: 'grey.400', borderRadius: 1.5, color: 'text.secondary', '&:focus-within': { outline: '2px solid', outlineColor: 'primary.main' } }}>
          <Box component="label" htmlFor={touch ? 'state-find-sheet' : 'state-find'} sx={{ position: 'absolute', width: '1px', height: '1px', overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' }}>
            Find a state
          </Box>
          <Box
            component="input"
            id={touch ? 'state-find-sheet' : 'state-find'}
            type="search"
            value={find}
            placeholder="Find a state"
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFind(e.target.value)}
            sx={{ flex: '1 1 auto', minWidth: 0, border: 0, outline: 'none', font: 'inherit', fontSize: '1rem', color: 'text.primary', bgcolor: 'transparent' }}
          />
        </Box>
      )}
      {visible.map((s) => (
        <OptionRow
          key={s.state_slug}
          type="checkbox"
          name="state"
          label={s.state}
          checked={draft.state.includes(s.state_slug)}
          count={facets ? facets.state[s.state_slug] ?? 0 : s.count}
          // Picking another state clears cities, which belong to one state.
          onChange={() => onChange({ ...draft, state: toggleIn(draft.state, s.state_slug), city: [] })}
          touch={touch}
        />
      ))}
      {needle && matched.length === 0 && (
        <Typography sx={{ m: 0, px: touch ? 2 : 0, py: 1, fontSize: '0.88rem', color: 'text.secondary' }}>No state named &ldquo;{find.trim()}&rdquo;.</Typography>
      )}
      {!needle && states.length > initial && (
        <Box
          component="button"
          type="button"
          onClick={() => setAll((v) => !v)}
          sx={{ alignSelf: 'flex-start', minHeight: 40, px: touch ? 2 : 0, border: 0, bgcolor: 'transparent', color: 'primary.dark', font: 'inherit', fontSize: '0.88rem', fontWeight: 600, cursor: 'pointer', '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main' } }}
        >
          {all ? 'Show fewer states' : `Show all ${states.length} states`}
        </Box>
      )}
    </>
  );
}

export function RatingGroup({ draft, onChange, facets, touch }: GroupProps) {
  return (
    <>
      {RATING_OPTIONS.map((r) => (
        <OptionRow
          key={r}
          type="radio"
          name="rating"
          label={
            <>
              {r.toFixed(1)}
              <StarRoundedIcon aria-hidden sx={{ fontSize: 16, color: 'warning.dark' }} />
              and above
            </>
          }
          checked={draft.rating === r}
          count={facets ? facets.rating[String(r)] ?? 0 : undefined}
          onChange={() => onChange({ ...draft, rating: r })}
          touch={touch}
        />
      ))}
      <OptionRow type="radio" name="rating" label="Any rating" checked={!draft.rating} onChange={() => onChange({ ...draft, rating: undefined })} touch={touch} />
    </>
  );
}

export function SortGroup({ draft, onChange, touch, hideRating }: GroupProps & { hideRating?: boolean }) {
  return (
    <>
      {SORT_OPTIONS.filter((o) => !(hideRating && o.value === 'rating_high')).map((o) => (
        <OptionRow
          key={o.value}
          type="radio"
          name="sort"
          label={o.label}
          checked={draft.sort === o.value}
          onChange={() => onChange({ ...draft, sort: o.value as SortKey })}
          touch={touch}
        />
      ))}
    </>
  );
}
