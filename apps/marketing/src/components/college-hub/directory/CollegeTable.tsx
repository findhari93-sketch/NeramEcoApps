'use client';

import Link from 'next/link';
import { Box, Typography } from '@mui/material';
import { alpha } from '@mui/material/styles';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import UnfoldMoreIcon from '@mui/icons-material/UnfoldMore';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import StarRoundedIcon from '@mui/icons-material/StarRounded';
import type { CollegeFilters } from '@/lib/college-hub/types';
import type { ListingCollege } from '@/lib/college-hub/listing-filter';
import {
  collegeHref,
  cutoffLabel,
  examList,
  feeLabel,
  packageLabel,
  ratingLabel,
  seatsLabel,
  shortName,
  typeLabel,
} from '@/lib/college-hub/format';
import CollegeLogo from './CollegeLogo';

type Sort = NonNullable<CollegeFilters['sortBy']>;

interface Column {
  key: string;
  label: string;
  align: 'left' | 'right';
  width: string;
  /** URL sorts this header cycles through; first is the first click. */
  sorts?: Sort[];
  render: (c: ListingCollege) => React.ReactNode;
}

interface Props {
  colleges: ListingCollege[];
  /** Position of the first row (pagination). */
  startRank: number;
  sort: Sort;
  onSort: (sort: Sort) => void;
  isInCompare: (slug: string) => boolean;
  onToggleCompare: (c: ListingCollege) => void;
}

const muted = { color: 'text.secondary', fontWeight: 500 } as const;

/** Table view (canvas: Desktop · Table view). Scrolls sideways inside its own box. */
export default function CollegeTable({ colleges, startRank, sort, onSort, isInCompare, onToggleCompare }: Props) {
  const anyCutoff = colleges.some((c) => c.cutoff_value != null);
  const anyPackage = colleges.some((c) => packageLabel(c));
  const anyRating = colleges.some((c) => ratingLabel(c));

  const columns: Column[] = [
    {
      key: 'naac',
      label: 'NAAC',
      align: 'left',
      width: '84px',
      sorts: ['naac_grade'],
      render: (c) => (
        <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', height: 24, px: 1, borderRadius: 1, border: '1px solid', borderColor: 'grey.400', fontSize: '0.78rem', fontWeight: 700, color: c.naac_grade ? 'text.primary' : 'text.secondary' }}>
          {c.naac_grade ?? 'None'}
        </Box>
      ),
    },
    {
      key: 'exams',
      label: 'Exams',
      align: 'left',
      width: 'minmax(120px, 1fr)',
      render: (c) => <Box component="span" sx={{ fontSize: '0.82rem', color: 'text.secondary' }}>{examList(c.accepted_exams, 'short').join(' · ') || 'Check with college'}</Box>,
    },
    {
      key: 'fee',
      label: 'Annual fee',
      align: 'right',
      width: '136px',
      sorts: ['fee_low', 'fee_high'],
      render: (c) => {
        const v = feeLabel(c);
        return <Box component="span" sx={v.startsWith('₹') ? { fontWeight: 700 } : muted}>{v}</Box>;
      },
    },
    {
      key: 'seats',
      label: 'Seats',
      align: 'right',
      width: '128px',
      render: (c) => {
        const v = seatsLabel(c);
        return <Box component="span" sx={/^\d/.test(v) ? {} : muted}>{v}</Box>;
      },
    },
    ...(anyCutoff
      ? [{
          key: 'cutoff',
          label: 'Cutoff',
          align: 'right' as const,
          width: '140px',
          render: (c: ListingCollege) => cutoffLabel(c, 'short') ?? <Box component="span" sx={muted}>Not published</Box>,
        }]
      : []),
    ...(anyPackage
      ? [{
          key: 'package',
          label: 'Avg package',
          align: 'right' as const,
          width: '120px',
          sorts: ['placement_high' as Sort],
          render: (c: ListingCollege) => packageLabel(c) ?? <Box component="span" sx={muted}>Not published</Box>,
        }]
      : []),
    ...(anyRating
      ? [{
          key: 'rating',
          label: 'Rating',
          align: 'right' as const,
          width: '108px',
          sorts: ['rating_high' as Sort],
          render: (c: ListingCollege) => {
            const r = ratingLabel(c);
            if (!r) return <Box component="span" sx={muted}>No reviews</Box>;
            return (
              <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
                <StarRoundedIcon aria-hidden sx={{ fontSize: 15, color: 'warning.dark' }} />
                <b>{r}</b>
                <Box component="span" sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>({c.review_count})</Box>
              </Box>
            );
          },
        }]
      : []),
  ];

  const template = ['52px', '44px', 'minmax(280px, 2.6fr)', ...columns.map((c) => c.width), '48px'].join(' ');
  const minWidth = 52 + 44 + 280 + columns.length * 110 + 48;

  const headerButton = (col: Column) => {
    if (!col.sorts) return col.label;
    const active = col.sorts.includes(sort);
    const next = active && col.sorts.length > 1 ? col.sorts[(col.sorts.indexOf(sort) + 1) % col.sorts.length] : col.sorts[0];
    const ascending = sort === 'fee_low' || sort === 'naac_grade' || sort === 'name';
    return (
      <Box
        component="button"
        type="button"
        onClick={() => onSort(next)}
        aria-label={`Sort by ${col.label}${active ? `, currently ${ascending ? 'ascending' : 'descending'}` : ''}`}
        sx={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 0.5,
          height: 36,
          px: 0.5,
          border: 0,
          bgcolor: 'transparent',
          font: 'inherit',
          letterSpacing: 'inherit',
          textTransform: 'inherit',
          color: active ? 'primary.dark' : 'text.secondary',
          cursor: 'pointer',
          borderRadius: 1,
          '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main' },
        }}
      >
        {col.label}
        {active ? (
          ascending ? <ArrowUpwardIcon aria-hidden sx={{ fontSize: 14 }} /> : <ArrowDownwardIcon aria-hidden sx={{ fontSize: 14 }} />
        ) : (
          <UnfoldMoreIcon aria-hidden sx={{ fontSize: 14, opacity: 0.6 }} />
        )}
      </Box>
    );
  };

  const ariaSort = (col: Column) => {
    if (!col.sorts || !col.sorts.includes(sort)) return undefined;
    return sort === 'fee_low' || sort === 'naac_grade' || sort === 'name' ? 'ascending' : 'descending';
  };

  const rowSx = { display: 'grid', gridTemplateColumns: template, alignItems: 'center' } as const;

  return (
    <Box sx={{ bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider', borderRadius: 2, overflow: 'hidden' }}>
      <Box sx={{ overflowX: 'auto' }}>
        <Box component="table" role="table" aria-label="Colleges" sx={{ minWidth, width: '100%', borderCollapse: 'collapse', display: 'block' }}>
          <Box component="thead" role="rowgroup" sx={{ display: 'block' }}>
            <Box
              component="tr"
                  role="row"
              sx={{ ...rowSx, minHeight: 48, bgcolor: (t) => (t.palette.mode === 'light' ? t.palette.grey[100] : t.palette.background.default), borderBottom: '1px solid', borderColor: 'divider', fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'text.secondary', whiteSpace: 'nowrap' }}
            >
              <Box component="th" role="columnheader" scope="col" sx={{ pl: 2, textAlign: 'left', fontWeight: 'inherit' }}>
                <Box component="span" sx={{ position: 'absolute', width: '1px', height: '1px', overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' }}>Compare</Box>
              </Box>
              <Box component="th" role="columnheader" scope="col" sx={{ textAlign: 'left', fontWeight: 'inherit' }}>#</Box>
              <Box component="th" role="columnheader" scope="col" aria-sort={sort === 'name' ? 'ascending' : undefined} sx={{ textAlign: 'left', fontWeight: 'inherit' }}>
                {headerButton({ key: 'name', label: 'College', align: 'left', width: '', sorts: ['name'], render: () => null })}
              </Box>
              {columns.map((col) => (
                <Box key={col.key} component="th" role="columnheader" scope="col" aria-sort={ariaSort(col)} sx={{ textAlign: col.align, pr: 2, fontWeight: 'inherit' }}>
                  {headerButton(col)}
                </Box>
              ))}
              <Box component="th" role="columnheader" scope="col" sx={{ fontWeight: 'inherit' }}>
                <Box component="span" sx={{ position: 'absolute', width: '1px', height: '1px', overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' }}>Open</Box>
              </Box>
            </Box>
          </Box>
          <Box component="tbody" role="rowgroup" sx={{ display: 'block' }}>
            {colleges.map((c, i) => {
              const on = isInCompare(c.slug);
              return (
                <Box
                  component="tr"
                  role="row"
                  key={c.id}
                  sx={{ ...rowSx, minHeight: 64, borderBottom: '1px solid', borderColor: 'divider', bgcolor: (t) => (on ? alpha(t.palette.primary.main, 0.06) : 'transparent'), fontSize: '0.875rem' }}
                >
                  <Box component="td" role="cell" sx={{ pl: 2 }}>
                    <Box
                      component="input"
                      type="checkbox"
                      checked={on}
                      onChange={() => onToggleCompare(c)}
                      aria-label={`Compare ${shortName(c)}`}
                      sx={{ width: 18, height: 18, m: 0, accentColor: (t) => t.palette.primary.main, cursor: 'pointer' }}
                    />
                  </Box>
                  <Box component="td" role="cell" sx={{ fontSize: '0.8rem', color: 'text.secondary', fontVariantNumeric: 'tabular-nums' }}>{startRank + i}</Box>
                  <Box component="td" role="cell" sx={{ display: 'flex', alignItems: 'center', gap: 1.5, pr: 2, minWidth: 0, py: 1 }}>
                    <CollegeLogo name={c.name} logoUrl={c.logo_url} size={36} radius={1} />
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.125, minWidth: 0 }}>
                      <Box component={Link} href={collegeHref(c)} sx={{ color: 'text.primary', textDecoration: 'none', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', '&:hover': { color: 'primary.main' } }}>
                        {c.name}
                      </Box>
                      <Typography component="span" sx={{ fontSize: '0.78rem', color: 'text.secondary' }}>
                        {c.city} · {typeLabel(c.type)}
                      </Typography>
                    </Box>
                  </Box>
                  {columns.map((col) => (
                    <Box key={col.key} component="td" role="cell" sx={{ textAlign: col.align, pr: 2, fontVariantNumeric: 'tabular-nums' }}>
                      {col.render(c)}
                    </Box>
                  ))}
                  <Box component="td" role="cell">
                    <Box
                      component={Link}
                      href={collegeHref(c)}
                      aria-label={`Open ${c.name}`}
                      sx={{ width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'text.secondary', borderRadius: 1, '&:hover': { color: 'primary.main' }, '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main' } }}
                    >
                      <ChevronRightIcon aria-hidden />
                    </Box>
                  </Box>
                </Box>
              );
            })}
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
